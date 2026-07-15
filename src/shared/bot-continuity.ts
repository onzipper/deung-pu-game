/**
 * Canonical Character Autonomy continuity vocabulary (PR3).
 *
 * The server is the only writer. Clients may render these values but must never
 * infer or advance the state machine locally.
 */
export const BOT_CONTINUITY_STATES = [
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

export type BotContinuityStateWire = (typeof BOT_CONTINUITY_STATES)[number];

/** States in which automation may issue a world command. Tier policy is deliberately absent. */
export const BOT_CONTINUITY_OPERATIONAL_STATES = [
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
] as const;

export type BotContinuityOperationalStateWire = (typeof BOT_CONTINUITY_OPERATIONAL_STATES)[number];

/** Minimal server-authored projection carried by live status and takeover checkpoints. */
export interface BotContinuitySnapshotWire {
  state: BotContinuityStateWire;
  revision: number;
  enteredAt: number;
  /** Diagnostic origin only; safe resume must re-evaluate live actor state instead of replaying this state. */
  interruptedState: BotContinuityOperationalStateWire | null;
}

const CONTINUITY_STATE_SET: ReadonlySet<string> = new Set(BOT_CONTINUITY_STATES);
const OPERATIONAL_STATE_SET: ReadonlySet<string> = new Set(BOT_CONTINUITY_OPERATIONAL_STATES);

export function isBotContinuityState(value: unknown): value is BotContinuityStateWire {
  return typeof value === "string" && CONTINUITY_STATE_SET.has(value);
}

export function isBotContinuityOperationalState(
  value: BotContinuityStateWire,
): value is BotContinuityOperationalStateWire {
  return OPERATIONAL_STATE_SET.has(value);
}
