// P2-07 — equipment → combat stat aggregation. **PURE + SERVER-ONLY. never-downgrade zone (combat calc).**
//
// The only place gear turns into combat numbers: sum the stat bonus of every equipped instance (config
// lookup by itemId), then MapRoom overlays it on the character's base PlayerCombatStats for damage (§15.2).
// Kept pure + fully unit-tested (expected values from the catalog, not the impl) — no DB, no Colyseus.
//
// ⚠️ enhancementLevel is NOT folded into stats here: the +6..+15 enhancement stat curve is PENDING OWNER
//    (Reinforcement R9 / P2-10). Only base item stats apply for now — documented so it is not mistaken for a
//    bug. When the curve is locked it plugs in at this function, still config-driven.

import type { EquipmentStatBonus } from "./item-catalog";
import { ZERO_STAT_BONUS, asEquippable, type ItemCatalog } from "./item-catalog";

/** minimal shape needed to value an equipped item (subset of ItemInstanceRecord). */
export interface EquippedItemRef {
  itemId: string;
}

/**
 * sum the additive combat bonus of all currently-equipped items. Non-equippable / unknown itemIds
 * contribute nothing (defensive: a bag item mislabelled or a def missing from config never inflates stats).
 */
export function aggregateEquipmentBonus(
  equipped: readonly EquippedItemRef[],
  catalog: ItemCatalog,
): EquipmentStatBonus {
  const total: EquipmentStatBonus = { ...ZERO_STAT_BONUS };
  for (const inst of equipped) {
    const def = asEquippable(catalog.get(inst.itemId));
    if (!def || !def.stats) continue;
    total.hp += def.stats.hp ?? 0;
    total.atk += def.stats.atk ?? 0;
    total.def += def.stats.def ?? 0;
    total.critRate += def.stats.critRate ?? 0;
    total.critDmg += def.stats.critDmg ?? 0;
    total.penetration += def.stats.penetration ?? 0;
  }
  return total;
}
