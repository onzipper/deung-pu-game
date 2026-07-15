// D-067 continuity policy shared by the Character Autonomy runtime.
//
// PR4 locks the safe single-area baseline only. PR5 and PR6 may recover or continue before calling `stop`, but
// every unresolved stop still settles through this conservative mapping and never changes combat/reward power.

import type { BotStopReason } from "../config/bot";

export type BotStopSettlement = "wait_for_owner" | "complete" | "fail";

/** Unknown classes fail closed; only a catalogued normal mob may be targeted by Character Autonomy. */
export function isForbiddenAutomationMobClass(mobClass: "normal" | "elite" | "boss" | null): boolean {
  return mobClass !== "normal";
}

/**
 * Convert a finished Free run into a continuity settlement before authority is released and the report closes.
 * Ordinary obstacles need the owner, an explicit Stop completes this one goal, and invalid/restarted world state
 * fails closed. Manual takeover does not use this mapping: it owns PAUSED + checkpoint in `BotRuntime.takeover`.
 */
export function settlementForStoppedPlan(reason: BotStopReason): BotStopSettlement {
  if (reason === "manual") return "complete";
  if (
    reason === "map_unsafe" ||
    reason === "server_restart" ||
    reason === "boss_or_event" ||
    reason === "secret_trigger" ||
    reason === "profile_deleted"
  ) {
    return "fail";
  }
  return "wait_for_owner";
}
