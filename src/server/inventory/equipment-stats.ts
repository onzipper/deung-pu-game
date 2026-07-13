// P2-07/P2-10 — equipment → combat stat aggregation. **PURE + SERVER-ONLY. never-downgrade zone (combat calc).**
//
// The only place gear turns into combat numbers: sum the stat bonus of every equipped instance (config
// lookup by itemId), then MapRoom overlays it on the character's base PlayerCombatStats for damage (§15.2).
// Kept pure + fully unit-tested (expected values from the catalog, not the impl) — no DB, no Colyseus.
//
// P2-10: enhancementLevel now folds into the scaled stats via the D-054 curve (§16.3.1). The curve is passed
//    in as a plain structural value (EnhancementCurve) — this server-only module must NOT import server/config
//    (server/** is excluded from the root tsconfig; importing it would pull that program into the client-side
//    build). MapRoom loads the config and hands the curve down. curve omitted / level 0 = base stats only.

import type { EquipmentStatBonus } from "./item-catalog";
import { ZERO_STAT_BONUS, asEquippable, type ItemCatalog } from "./item-catalog";

/** minimal shape needed to value an equipped item (subset of ItemInstanceRecord). */
export interface EquippedItemRef {
  itemId: string;
  /** current +N (default 0 = unenhanced) — folded through the curve for scaled stats. */
  enhancementLevel?: number;
}

/**
 * enhancement multiplier curve (structural match to EnhancementCurveConfig — server/config/types.ts).
 * Declared locally so the aggregation stays free of any server/config import (see file header).
 */
export interface EnhancementCurve {
  /** multiplier per level — index = +N (0..maxLevel); +0 = 1.0, +15 = 2.80 (D-054). */
  multipliers: readonly number[];
  /** §16.3 rule: min increase over the previous level whenever the multiplier steps up. */
  minIncreasePerLevel: number;
  /** which stats scale (§16.3 = attack/defense/maxHp/breakPower; Crit/Move never scale). */
  scaledStats: readonly string[];
}

/**
 * scaled-stat name (config §16.3 scaledStats) → EquipmentStatBonus key. Enhancement scales
 * attack/defense/maxHp AND breakPower (Economy §6.2 "Enhancement เพิ่มเฉพาะ Attack/Defense/Max HP/Break Power")
 * — the vector keys now match the config names 1:1 except breakPower which is already identical. Critical Chance
 * and Move Speed never scale (§16.3), so they are absent from the config's scaledStats and from this map.
 */
const SCALED_FIELD_BY_STAT: Readonly<Record<string, keyof EquipmentStatBonus>> = {
  attack: "attack",
  defense: "defense",
  maxHp: "maxHp",
  breakPower: "breakPower",
};

const STAT_KEYS: readonly (keyof EquipmentStatBonus)[] = [
  "attack",
  "defense",
  "maxHp",
  "criticalChancePercent",
  "breakPower",
  "moveSpeedPercent",
];

/** the EquipmentStatBonus keys the curve scales, derived from config.scaledStats (config-driven, not hardcoded). */
function scaledBonusKeys(curve: EnhancementCurve): Set<keyof EquipmentStatBonus> {
  const keys = new Set<keyof EquipmentStatBonus>();
  for (const name of curve.scaledStats) {
    const key = SCALED_FIELD_BY_STAT[name];
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Enhanced value of one base stat at `level` (D-054 · §16.3.1): `floor(base × multiplier)` per level, with the
 * cumulative "min +1 when the multiplier steps up" rule (§16.3) — iterate +1..level so a small base stat still
 * climbs by at least `minIncreasePerLevel` each rank instead of staying flat under the floor. Config-driven.
 */
export function enhancedStatValue(base: number, level: number, curve: EnhancementCurve): number {
  if (base <= 0 || curve.multipliers.length === 0) return base;
  const cap = Math.max(0, Math.min(level, curve.multipliers.length - 1));
  let value = Math.floor(base * curve.multipliers[0]); // +0
  for (let n = 1; n <= cap; n++) {
    const raw = Math.floor(base * curve.multipliers[n]);
    value =
      curve.multipliers[n] > curve.multipliers[n - 1]
        ? Math.max(raw, value + curve.minIncreasePerLevel)
        : raw;
  }
  return value;
}

/**
 * sum the additive combat bonus of all currently-equipped items. Non-equippable / unknown itemIds
 * contribute nothing (defensive: a bag item mislabelled or a def missing from config never inflates stats).
 * When `curve` is given, each item's scaled stats (attack/defense/maxHp/breakPower, §6.2) fold in its
 * enhancementLevel (§16.3.1); crit%/move% never scale. curve omitted = base stats only — backward compatible.
 */
export function aggregateEquipmentBonus(
  equipped: readonly EquippedItemRef[],
  catalog: ItemCatalog,
  curve?: EnhancementCurve,
): EquipmentStatBonus {
  const total: EquipmentStatBonus = { ...ZERO_STAT_BONUS };
  const scaled = curve ? scaledBonusKeys(curve) : null;
  for (const inst of equipped) {
    const def = asEquippable(catalog.get(inst.itemId));
    if (!def || !def.stats) continue;
    const level = inst.enhancementLevel ?? 0;
    for (const key of STAT_KEYS) {
      const base = def.stats[key] ?? 0;
      total[key] +=
        curve && level > 0 && scaled?.has(key) ? enhancedStatValue(base, level, curve) : base;
    }
  }
  return total;
}
