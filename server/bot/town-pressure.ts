// M2a (D-073) — proactive town-trip pressure decision (PURE, no I/O). One side-effect-free check the runtime runs
// on a cadence (bag sample) to decide whether the bot should PROACTIVELY start a town trip — before a hard overflow
// (40/40) forces a `bag_full` divert, before the low-hp floor stop settles, or before the potion stock runs out.
//
// Owner-locked scope (D-073, tier boundary D-063/D-067):
//   • Free WALKS and paid tiers WARP — the mode is decided elsewhere (townTrip.mode). This module only decides IF.
//   • It never touches damage/EXP/drop/loot; every dial is a Design Knob (§48) read from config by the caller.
//
// Priority (most dangerous first): hp_no_potion > bag_pressure > potion_low. HP-with-no-potion is the closest to a
// stop (the bot cannot heal), so it wins; a nearly-full bag would soon overflow and leak loot; a low potion reserve
// is the least urgent (the bot can still fight). The order is locked by tests.

import { botPotionThresholdEnabled } from "../../src/shared/net-protocol";

/** What kicked off a proactive trip (distinct from a hard `bag_full` overflow / `preflight` / `workflow`). */
export type TownPressureTrigger = "potion_low" | "bag_pressure" | "hp_no_potion";

/** Everything the pressure check needs for one sample. All read-only; the function mutates nothing. */
export interface TownPressureInput {
  /** free bag slots (capacity − occupied non-equipped instances). */
  freeSlots: number;
  /** potions currently held (non-equipped, summed over stacks). */
  potionCount: number;
  /** live hp fraction 0..1. */
  hpFraction: number;
  /** the auto-potion HP% threshold from rules (D-075: null OR 0 = off → no `potion_low`, `hp_no_potion` uses the floor). */
  potionThresholdPct: number | null;
  /** effective "potions running low" reserve (rules.potionLowReserve ?? config default). */
  potionLowReserve: number;
  /**
   * D-075 follow-up: has the run ACTUALLY carried a potion at some point (a bag sample saw potionCount > 0)? Gates
   * `potion_low` so "ยาหมดแล้ว → ไปซื้อ" means ran out mid-run — a FRESH actor that simply never carried potions and
   * is at full HP keeps farming (bootstrap) rather than being dragged to a town it cannot afford. It still restocks
   * once hp actually falls (hp_no_potion) — by then kills have earned gold.
   */
  hadPotionsThisRun: boolean;
  /** config: min free bag slots below which bag pressure alone may trigger a trip. */
  pressureMinFreeSlots: number;
  /** config: the low-hp floor (used as the `hp_no_potion` bound when auto-potion is off). */
  lowHpStopFraction: number;
}

export type TownPressureDecision =
  | { kind: "town_trip"; trigger: TownPressureTrigger }
  | { kind: "none" };

/**
 * Deterministic proactive town-trip decision for one bag sample. First match wins (priority order above):
 *   1. hp_no_potion — no potions held AND hp ≤ (potionThresholdPct/100 when set, else the low-hp floor).
 *   2. bag_pressure — free slots ≤ pressureMinFreeSlots.
 *   3. potion_low   — auto-potion is on AND potions held ≤ the low reserve AND (the run ran out mid-run OR hp ≤ the
 *                     drink threshold) — a fresh actor with no potions at full HP keeps farming (D-075 follow-up).
 * Otherwise `none` (keep farming).
 */
export function planTownPressure(input: TownPressureInput): TownPressureDecision {
  const {
    freeSlots,
    potionCount,
    hpFraction,
    potionThresholdPct,
    potionLowReserve,
    pressureMinFreeSlots,
    lowHpStopFraction,
    hadPotionsThisRun,
  } = input;

  // D-075: auto-potion is on only for a positive threshold — `0` (player turned it off) reads the same as null here.
  const potionEnabled = botPotionThresholdEnabled(potionThresholdPct);

  // 1 — HP with no way to heal (out of potions). The bound is the drink threshold when auto-potion is on, else the
  //     low-hp floor. This is the most dangerous state → highest priority (a trip to restock beats a floor stop).
  const hpBound = potionEnabled && potionThresholdPct != null ? potionThresholdPct / 100 : lowHpStopFraction;
  if (potionCount === 0 && hpFraction <= hpBound) return { kind: "town_trip", trigger: "hp_no_potion" };

  // 2 — Bag nearly full: a hard overflow would soon leak loot, so divert before it happens.
  if (freeSlots <= pressureMinFreeSlots) return { kind: "town_trip", trigger: "bag_pressure" };

  // 3 — Potions running low (auto-potion on AND ≤ the reserve). D-075 follow-up: only when the run RAN OUT mid-run
  //     (`hadPotionsThisRun`) or the bot is already hurt (hp ≤ the drink threshold). A fresh actor that never carried
  //     potions and is at full HP keeps farming — it heads to town only once hp actually falls (hp_no_potion, by
  //     which point kills earned the gold for the emergency buy). "ยาหมดแล้ว → ไปซื้อ", never "ไม่มียาติดตัว = ห้ามฟาร์ม".
  if (potionEnabled && potionCount <= potionLowReserve && (hadPotionsThisRun || hpFraction <= hpBound)) {
    return { kind: "town_trip", trigger: "potion_low" };
  }

  return { kind: "none" };
}
