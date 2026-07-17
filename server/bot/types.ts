// Batch 7b-server — shared bot runtime types (server-only).
//
// These model the DB rows (bot_tier_state / bot_profiles / bot_sessions, migration 0004) and the pure
// service inputs/outputs. Kept plain-TS (no Prisma import) so the pure services + tests never need a DB.
//
// ⛔ SERVER-ONLY. Field names mirror the Prisma models (camelCase) — the store layer maps to snake_case columns.

import type { BotTier, BotStopReason } from "../config/bot";
import type { BotWorkflowCondition, BotWorkflowV1 } from "../../src/shared/bot-workflow";

/** M1: how a running bot picks targets inside its assigned pocket. Default `ALL_IN_AREA` (the pre-M1 behaviour). */
export type BotTargetMode = "ALL_IN_AREA" | "SELECTED_TYPES";
export const BOT_TARGET_MODES: readonly BotTargetMode[] = ["ALL_IN_AREA", "SELECTED_TYPES"] as const;

/** M1: what a Plus single-goal (rules.goal) does the moment its target is reached. Default `safe_stop`. */
export type BotCompletionAction = "safe_stop" | "notify_continue" | "town_stop" | "town_continue";
export const BOT_COMPLETION_ACTIONS: readonly BotCompletionAction[] = [
  "safe_stop",
  "notify_continue",
  "town_stop",
  "town_continue",
] as const;

/** M1: a Plus single-goal — reuses the workflow condition shape/metric (kills/gold/exp/durationMs), never a duplicate. */
export type BotGoal = BotWorkflowCondition;

/**
 * Rules v1 schema (JSON stored in bot_profiles.rulesJson). Declarative bot behaviour (P3 §4 Rule Builder,
 * server-validated). v1 is intentionally minimal:
 *   • `skillSlots` — which class skill slots the bot may cast (index into the class skill list). The bot casts
 *     the lowest-slot DAMAGE skill it is allowed (basic attack). The rich AoE/ultimate intent lives in each
 *     skill's `botUsageRule` (v15 §50, free-text) — machine-parsing it is P3+ (documented TODO).
 *   • `potionThresholdPct` — placeholder for the potion-use system (not built) — carried but inert.
 *   • `lootAll` — keep everything (v1); ordinary rare loot alerts and continues under the PR4 baseline.
 * D-074 (amends D-063): there is no rule-count quota on any tier — a plan sets any combination of the fields
 * below freely. Tier only gates which FEATURES are unlocked (SELECTED_TYPES/goal = Plus+, workflow = Pro).
 */
export interface BotRulesV1 {
  /** allowed class skill-slot indices (0-based into the class skill list). */
  skillSlots: number[];
  /** the potion-use HP% threshold (0-100). M2 wires it into every tier's runtime; carried + validated here (M1). */
  potionThresholdPct?: number | null;
  /** keep all loot (v1); an ordinary rare drop is not a universal stop condition. */
  lootAll: boolean;
  /**
   * PR6b Pro goal chain (optional). Present ⇒ the account must be Pro (validateRules rejects it otherwise, start
   * re-gates it). Absent ⇒ the pre-PR6b single-pocket behavior, unchanged.
   */
  workflow?: BotWorkflowV1;
  /**
   * M1 target selection. `ALL_IN_AREA` (default) = attack any bot-safe mob in the pocket (pre-M1). `SELECTED_TYPES`
   * (Plus/Pro) = only `selectedMobTypes`.
   */
  targetMode?: BotTargetMode;
  /** M1: the normal mob types to attack under SELECTED_TYPES (each must be a normal mob in the assigned pocket). */
  selectedMobTypes?: string[];
  /**
   * M1 Plus single-goal (optional). Present ⇒ the account must be Plus/Pro. Mutually exclusive with `workflow`
   * (a Pro chain supersedes a single goal). Absent ⇒ the bot farms without a completion target.
   */
  goal?: BotGoal;
  /** M1: what happens the instant `goal` is met (default `safe_stop`). Only meaningful together with `goal`. */
  completionAction?: BotCompletionAction;
  /** M1: potions to restock on a town trip (0..config.townTrip.potionRestockTargetMax). null ⇒ use the config default. */
  potionRestockTarget?: number | null;
  /** M1: "potions running low" reserve that may trigger a town trip (0..effective restock target). null ⇒ config default. */
  potionLowReserve?: number | null;
}

/** Result of validating a rules payload — either the sanitized rules or a reason string. */
export type RulesValidation =
  | { ok: true; rules: BotRulesV1 }
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
