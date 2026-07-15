import { describe, expect, test } from "vitest";
import {
  BOT_CONTINUITY_OPERATIONAL_STATES,
  BOT_CONTINUITY_STATES,
  type BotContinuityOperationalStateWire,
  type BotContinuityStateWire,
} from "../src/shared/bot-continuity";
import {
  BOT_CONTINUITY_ADVANCE_GRAPH,
  applyBotContinuityTransition,
  canIssueAutomationCommand,
  createBotContinuity,
  legacyBotActionForContinuity,
  toBotContinuityWire,
  type BotContinuityCommand,
  type BotContinuitySnapshot,
} from "../server/bot/continuity";

const EXPECTED_STATES = [
  "WORKING",
  "TRAVELING",
  "COMBAT",
  "LOOTING",
  "RECOVERING",
  "RETURNING_TO_TOWN",
  "SELLING",
  "DEPOSITING",
  "RESTOCKING",
  "RETURNING_TO_WORK",
  "PAUSED",
  "WAITING_FOR_OWNER",
  "COMPLETED",
  "FAILED",
] as const;

function snapshot(
  state: BotContinuityStateWire,
  options: Partial<BotContinuitySnapshot> = {},
): BotContinuitySnapshot {
  return {
    state,
    revision: 4,
    enteredAt: 1_000,
    interruptedState: null,
    previousState: null,
    reasonCode: "test_fixture",
    ...options,
  };
}

function meta(revision = 4, at = 1_100) {
  return { expectedRevision: revision, at, reasonCode: "test_transition" };
}

describe("Character Autonomy continuity vocabulary", () => {
  test("locks the exact ordered 14-state contract", () => {
    expect(BOT_CONTINUITY_STATES).toEqual(EXPECTED_STATES);
    expect(BOT_CONTINUITY_OPERATIONAL_STATES).toEqual(EXPECTED_STATES.slice(0, 10));
  });

  test("starts in WORKING at revision zero with no interrupted state", () => {
    expect(createBotContinuity(123)).toEqual({
      state: "WORKING",
      revision: 0,
      enteredAt: 123,
      interruptedState: null,
      previousState: null,
      reasonCode: "plan_started",
    });
  });

  test("the shared wire projection omits internal audit metadata", () => {
    expect(toBotContinuityWire(snapshot("TRAVELING"))).toEqual({
      state: "TRAVELING",
      revision: 4,
      enteredAt: 1_000,
      interruptedState: null,
    });
  });
});

describe("tier-neutral operational topology", () => {
  test("accepts every declared operational edge", () => {
    for (const from of BOT_CONTINUITY_OPERATIONAL_STATES) {
      for (const to of BOT_CONTINUITY_ADVANCE_GRAPH[from]) {
        const result = applyBotContinuityTransition(snapshot(from), { kind: "advance", to, ...meta() });
        expect(result, `${from}->${to}`).toMatchObject({
          ok: true,
          changed: true,
          snapshot: { state: to, revision: 5, previousState: from },
        });
      }
    }
  });

  test("keeps PR5-PR6 loot/recovery/town/workflow topology inert instead of guessing ordering", () => {
    expect(BOT_CONTINUITY_ADVANCE_GRAPH).toMatchObject({
      WORKING: ["TRAVELING", "COMBAT"],
      TRAVELING: ["WORKING", "COMBAT"],
      COMBAT: ["WORKING", "TRAVELING"],
      LOOTING: [],
      RECOVERING: [],
      RETURNING_TO_TOWN: [],
      SELLING: [],
      DEPOSITING: [],
      RESTOCKING: [],
      RETURNING_TO_WORK: [],
    });
    const current = snapshot("WORKING");
    expect(
      applyBotContinuityTransition(current, { kind: "advance", to: "RECOVERING", ...meta() }),
    ).toEqual({ ok: false, error: "invalid_transition", snapshot: current });
  });

  test("same-state signals are idempotent and do not consume a revision", () => {
    const current = snapshot("WORKING");
    const result = applyBotContinuityTransition(current, { kind: "advance", to: "WORKING", ...meta() });
    expect(result).toEqual({ ok: true, changed: false, clockClamped: false, snapshot: current });
    expect(result.snapshot).toBe(current);
  });

  test("all operational states can be interrupted by manual takeover", () => {
    for (const from of BOT_CONTINUITY_OPERATIONAL_STATES) {
      const result = applyBotContinuityTransition(snapshot(from), { kind: "pause", ...meta() });
      expect(result, `${from}:pause`).toMatchObject({ ok: true, snapshot: { state: "PAUSED" } });
      expect(result.snapshot.interruptedState).toBe(from);
    }
  });

  test("all operational states can settle as waiting, completed, or failed", () => {
    const settlements = [
      ["wait_for_owner", "WAITING_FOR_OWNER"],
      ["complete", "COMPLETED"],
      ["fail", "FAILED"],
    ] as const;

    for (const from of BOT_CONTINUITY_OPERATIONAL_STATES) {
      for (const [kind, state] of settlements) {
        const result = applyBotContinuityTransition(snapshot(from), { kind, ...meta() });
        expect(result, `${from}:${kind}`).toMatchObject({
          ok: true,
          changed: true,
          snapshot: { state, revision: 5, previousState: from },
        });
        expect(result.snapshot.interruptedState).toBe(kind === "wait_for_owner" ? from : null);
      }
    }
  });

  test("WAITING_FOR_OWNER keeps its interrupted state idempotently and cannot resume itself", () => {
    const current = snapshot("WAITING_FOR_OWNER", {
      interruptedState: "TRAVELING",
      previousState: "TRAVELING",
    });
    expect(
      applyBotContinuityTransition(current, { kind: "wait_for_owner", ...meta() }),
    ).toEqual({ ok: true, changed: false, clockClamped: false, snapshot: current });
    expect(
      applyBotContinuityTransition(current, { kind: "advance", to: "WORKING", ...meta() }),
    ).toEqual({ ok: false, error: "invalid_transition", snapshot: current });
  });
});

describe("pause, terminal and revision invariants", () => {
  test("COMPLETED and FAILED are absorbing", () => {
    const commands: BotContinuityCommand[] = [
      { kind: "advance", to: "WORKING", ...meta() },
      { kind: "pause", ...meta() },
      { kind: "wait_for_owner", ...meta() },
      { kind: "complete", ...meta() },
      { kind: "fail", ...meta() },
    ];
    for (const state of ["COMPLETED", "FAILED"] as const) {
      const current = snapshot(state);
      for (const command of commands) {
        expect(applyBotContinuityTransition(current, command)).toEqual({
          ok: false,
          error: "terminal_state",
          snapshot: current,
        });
      }
    }
  });

  test("a takeover revision fences a stale async transition", () => {
    const combat = snapshot("COMBAT", { revision: 9 });
    const paused = applyBotContinuityTransition(combat, { kind: "pause", ...meta(9) });
    expect(paused).toMatchObject({ ok: true, snapshot: { state: "PAUSED", revision: 10 } });
    const stale = applyBotContinuityTransition(paused.snapshot, {
      kind: "advance",
      to: "LOOTING",
      ...meta(9, 1_200),
    });
    expect(stale).toEqual({ ok: false, error: "revision_conflict", snapshot: paused.snapshot });
  });

  test("server clock rollback clamps safely; invalid time/reason reject atomically", () => {
    const current = snapshot("WORKING");
    const clamped = applyBotContinuityTransition(current, {
      kind: "advance",
      to: "TRAVELING",
      ...meta(4, 900),
    });
    expect(clamped).toMatchObject({
      ok: true,
      clockClamped: true,
      snapshot: { enteredAt: 1_000 },
    });
    expect(
      applyBotContinuityTransition(current, {
        kind: "advance",
        to: "TRAVELING",
        ...meta(4, Number.NaN),
      }),
    ).toEqual({ ok: false, error: "invalid_time", snapshot: current });
    expect(
      applyBotContinuityTransition(current, {
        kind: "advance",
        to: "TRAVELING",
        ...meta(),
        reasonCode: "   ",
      }),
    ).toEqual({ ok: false, error: "reason_required", snapshot: current });
  });

  test("only operational states may issue automation commands and every state has a compatibility action", () => {
    for (const state of EXPECTED_STATES) {
      expect(canIssueAutomationCommand(snapshot(state))).toBe(BOT_CONTINUITY_OPERATIONAL_STATES.includes(
        state as BotContinuityOperationalStateWire,
      ));
      expect(legacyBotActionForContinuity(state)).not.toHaveLength(0);
    }
  });
});
