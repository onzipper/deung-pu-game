// Character Autonomy continuity state machine: PR3 operational topology + PR4 Free settlement commands.
//
// This reducer owns topology only: no tier, HP, inventory, route, DB, timer, or side effect. Runtime policy
// decides which command to request. `expectedRevision` fences stale async callbacks after takeover/pause.

import {
  isBotContinuityOperationalState,
  type BotContinuityOperationalStateWire,
  type BotContinuitySnapshotWire,
  type BotContinuityStateWire,
} from "../../src/shared/bot-continuity";

const MAX_REASON_CODE_LENGTH = 80;

export interface BotContinuitySnapshot extends BotContinuitySnapshotWire {
  previousState: BotContinuityStateWire | null;
  /** Audit/debug metadata only. Never use this as player copy or policy input. */
  reasonCode: string;
}

interface TransitionMeta {
  expectedRevision: number;
  at: number;
  reasonCode: string;
}

export type BotContinuityCommand =
  | ({ kind: "advance"; to: BotContinuityOperationalStateWire } & TransitionMeta)
  | ({ kind: "pause" } & TransitionMeta)
  | ({ kind: "wait_for_owner" } & TransitionMeta)
  | ({ kind: "complete" } & TransitionMeta)
  | ({ kind: "fail" } & TransitionMeta);

export type BotContinuityTransitionError =
  | "revision_conflict"
  | "invalid_transition"
  | "terminal_state"
  | "invalid_time"
  | "reason_required";

export type BotContinuityTransitionResult =
  | {
      ok: true;
      changed: boolean;
      clockClamped: boolean;
      snapshot: BotContinuitySnapshot;
    }
  | {
      ok: false;
      error: BotContinuityTransitionError;
      snapshot: BotContinuitySnapshot;
    };

/**
 * PR3 operational topology. PR4 adds conservative settlement commands without guessing service ordering.
 * PR5 opens the recovery edges: RECOVERING is entered from any farm state (low-hp potion drink, death
 * await-respawn); RECOVERING->WORKING is healed in place; RECOVERING->RETURNING_TO_WORK is the post-respawn
 * walk back; RETURNING_TO_WORK->RECOVERING covers an hp emergency en route.
 * PR5 Phase C (D-069/D-070) opens the town cycle: any farm/recovery state may enter RETURNING_TO_TOWN;
 * RETURNING_TO_TOWN->SELLING starts the in-town service run, or RETURNING_TO_TOWN->WORKING aborts an outbound
 * trip before the actor moved. The fixed SELLING->DEPOSITING->RESTOCKING->RETURNING_TO_WORK order returns to
 * farming. LOOTING alone stays inert until its authoritative behavior lands (PR6).
 */
export const BOT_CONTINUITY_ADVANCE_GRAPH: Readonly<
  Record<BotContinuityOperationalStateWire, readonly BotContinuityOperationalStateWire[]>
> = {
  WORKING: ["TRAVELING", "COMBAT", "RECOVERING", "RETURNING_TO_TOWN"],
  TRAVELING: ["WORKING", "COMBAT", "RECOVERING", "RETURNING_TO_TOWN"],
  COMBAT: ["WORKING", "TRAVELING", "RECOVERING", "RETURNING_TO_TOWN"],
  LOOTING: [],
  RECOVERING: ["RETURNING_TO_WORK", "WORKING", "RETURNING_TO_TOWN"],
  RETURNING_TO_TOWN: ["SELLING", "WORKING"], // WORKING = outbound abort (actor never moved)
  SELLING: ["DEPOSITING"],
  DEPOSITING: ["RESTOCKING"],
  RESTOCKING: ["RETURNING_TO_WORK"],
  RETURNING_TO_WORK: ["WORKING", "RECOVERING"],
};

export function createBotContinuity(startedAt: number, reasonCode = "plan_started"): BotContinuitySnapshot {
  if (!isServerTime(startedAt)) throw new RangeError("invalid continuity start time");
  const reason = normalizeReason(reasonCode);
  if (!reason) throw new RangeError("continuity start reason is required");
  return {
    state: "WORKING",
    revision: 0,
    enteredAt: startedAt,
    interruptedState: null,
    previousState: null,
    reasonCode: reason,
  };
}

export function applyBotContinuityTransition(
  current: BotContinuitySnapshot,
  command: BotContinuityCommand,
): BotContinuityTransitionResult {
  if (command.expectedRevision !== current.revision) return rejected("revision_conflict", current);
  if (!isServerTime(command.at)) return rejected("invalid_time", current);
  const reasonCode = normalizeReason(command.reasonCode);
  if (!reasonCode) return rejected("reason_required", current);
  if (isTerminal(current.state)) return rejected("terminal_state", current);

  const target = targetFor(command);
  if (!isCommandAllowed(current.state, command, target)) return rejected("invalid_transition", current);
  if (target === current.state) {
    return { ok: true, changed: false, clockClamped: false, snapshot: current };
  }

  const clockClamped = command.at < current.enteredAt;
  const interruptedState =
    (target === "PAUSED" || target === "WAITING_FOR_OWNER") && isBotContinuityOperationalState(current.state)
      ? current.state
      : null;

  return {
    ok: true,
    changed: true,
    clockClamped,
    snapshot: {
      state: target,
      revision: current.revision + 1,
      enteredAt: Math.max(command.at, current.enteredAt),
      interruptedState,
      previousState: current.state,
      reasonCode,
    },
  };
}

export function canIssueAutomationCommand(snapshot: BotContinuitySnapshot): boolean {
  return isBotContinuityOperationalState(snapshot.state);
}

export function toBotContinuityWire(snapshot: BotContinuitySnapshot): BotContinuitySnapshotWire {
  return {
    state: snapshot.state,
    revision: snapshot.revision,
    enteredAt: snapshot.enteredAt,
    interruptedState: snapshot.interruptedState,
  };
}

/** Compatibility field for the existing pre-PR7 Bot UI; canonical authority remains `continuity.state`. */
export function legacyBotActionForContinuity(state: BotContinuityStateWire): string {
  switch (state) {
    case "WORKING":
      return "searching";
    case "TRAVELING":
      return "moving";
    case "COMBAT":
      return "attacking";
    case "LOOTING":
      return "looting";
    case "RECOVERING":
      return "recovering";
    case "RETURNING_TO_TOWN":
      return "returning_to_town";
    case "SELLING":
      return "selling";
    case "DEPOSITING":
      return "depositing";
    case "RESTOCKING":
      return "restocking";
    case "RETURNING_TO_WORK":
      return "returning_to_work";
    case "PAUSED":
      return "paused";
    case "WAITING_FOR_OWNER":
      return "waiting_for_owner";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
  }
}

function isCommandAllowed(
  current: BotContinuityStateWire,
  command: BotContinuityCommand,
  target: BotContinuityStateWire,
): boolean {
  switch (command.kind) {
    case "advance":
      return (
        isBotContinuityOperationalState(current) &&
        (current === target || BOT_CONTINUITY_ADVANCE_GRAPH[current].includes(command.to))
      );
    case "pause":
      return isBotContinuityOperationalState(current) || current === "PAUSED";
    case "wait_for_owner":
      return isBotContinuityOperationalState(current) || current === "WAITING_FOR_OWNER";
    case "complete":
    case "fail":
      return isBotContinuityOperationalState(current);
  }
}

function targetFor(command: BotContinuityCommand): BotContinuityStateWire {
  switch (command.kind) {
    case "advance":
      return command.to;
    case "pause":
      return "PAUSED";
    case "wait_for_owner":
      return "WAITING_FOR_OWNER";
    case "complete":
      return "COMPLETED";
    case "fail":
      return "FAILED";
  }
}

function isTerminal(state: BotContinuityStateWire): boolean {
  return state === "COMPLETED" || state === "FAILED";
}

function normalizeReason(reasonCode: string): string | null {
  if (typeof reasonCode !== "string") return null;
  const reason = reasonCode.trim();
  return reason.length > 0 && reason.length <= MAX_REASON_CODE_LENGTH ? reason : null;
}

function isServerTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function rejected(
  error: BotContinuityTransitionError,
  snapshot: BotContinuitySnapshot,
): BotContinuityTransitionResult {
  return { ok: false, error, snapshot };
}
