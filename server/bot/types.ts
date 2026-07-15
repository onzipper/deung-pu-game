// Batch 7b-server — shared bot runtime types (server-only).
//
// These model the DB rows (bot_tier_state / bot_profiles / bot_sessions, migration 0004) and the pure
// service inputs/outputs. Kept plain-TS (no Prisma import) so the pure services + tests never need a DB.
//
// ⛔ SERVER-ONLY. Field names mirror the Prisma models (camelCase) — the store layer maps to snake_case columns.

import type { BotTier, BotStopReason } from "../config/bot";

/**
 * Rules v1 schema (JSON stored in bot_profiles.rulesJson). Declarative bot behaviour (P3 §4 Rule Builder,
 * server-validated). v1 is intentionally minimal:
 *   • `skillSlots` — which class skill slots the bot may cast (index into the class skill list). The bot casts
 *     the lowest-slot DAMAGE skill it is allowed (basic attack). The rich AoE/ultimate intent lives in each
 *     skill's `botUsageRule` (v15 §50, free-text) — machine-parsing it is P3+ (documented TODO).
 *   • `potionThresholdPct` — placeholder for the potion-use system (not built) — carried but inert.
 *   • `lootAll` — keep everything (v1); PR4 adds D-067 ordinary-rare plan actions.
 * Each set toggle/condition counts as ONE rule toward the tier cap (P3 §16 Q3/Q4: nábรวม).
 */
export interface BotRulesV1 {
  /** allowed class skill-slot indices (0-based into the class skill list). */
  skillSlots: number[];
  /** placeholder — potion-use system TODO (P3 §4). null/undefined = no potion rule. */
  potionThresholdPct?: number | null;
  /** keep all loot (v1); ordinary-rare policy is deferred to PR4. */
  lootAll: boolean;
}

/** Result of validating a rules payload — either the sanitized rules or a reason string. */
export type RulesValidation =
  | { ok: true; rules: BotRulesV1; ruleCount: number }
  | { ok: false; reason: string };

/** bot_tier_state row (per account). `passExpiresAt` null = Free (or an expired pass already fell back). */
export interface BotTierStateRow {
  accountId: string;
  tier: BotTier;
  passExpiresAt: number | null; // epoch ms (store maps to/from DateTime)
  updatedAt: number;
}

/** bot_profiles row. `rulesJson` is the validated BotRulesV1. */
export interface BotProfileRow {
  id: string;
  accountId: string;
  name: string;
  mapId: string;
  pocketId: string;
  rules: BotRulesV1;
  createdAt: number;
  updatedAt: number;
}

/** A profile as returned to the client — adds the derived `readOnly` flag (excess after a tier downgrade, D-063). */
export interface BotProfileView extends BotProfileRow {
  /** true when this profile exceeds the current tier's profile cap → paused read-only (D-063 §12.4). */
  readOnly: boolean;
}

/** bot_sessions row — a session IS a report (retention enforced at query time per tier). */
export interface BotSessionRow {
  id: string;
  accountId: string;
  characterId: string;
  profileId: string;
  mapId: string;
  startedAt: number;
  stoppedAt: number | null;
  stopReason: BotStopReason | null;
  killCount: number;
  goldEarned: number;
  expEarned: number;
  /** per-item aggregate of loot the bot banked this session (itemId → quantity). */
  drops: Record<string, number>;
  updatedAt: number;
}

/** Live, mutable counters accumulated by a running bot before they are flushed to a BotSessionRow. */
export interface BotSessionCounters {
  killCount: number;
  goldEarned: number;
  expEarned: number;
  drops: Record<string, number>;
}

/** A decision the pure agent tick returns: either move toward a target, cast at it, or stop. */
export type BotDecision =
  | { kind: "idle" } // nothing reachable this tick (counts toward the stuck limit)
  | { kind: "move"; tx: number; ty: number } // step toward the chosen target
  | { kind: "attack"; targetMobId: string } // in range → cast the basic attack
  | { kind: "stop"; reason: BotStopReason };
