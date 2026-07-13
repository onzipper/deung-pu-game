// P2-07 — item definition catalog (equipment slot + stat bonus). **SERVER-AUTHORITATIVE Design Knob (§48).**
//
// ⛔ SOURCE OF TRUTH RULE (AI.md iron rule #1 · schema.prisma model Item): the `items` DB table is a
//    *registry of ids only* — it holds NO name/stat/slot. Every item's slot type + stat bonus is a Design
//    Knob (§48) read from config, never hardcoded in DB. This module is that config, keyed by item def id.
//    Client never imports this (stat values are balance/combat truth — like warrior-skills-server.ts).
//
// ⚠️ PENDING OWNER (game semantics/balance — NOT decided here): the equipment SLOT SET below and every
//    item's stat numbers are **placeholders** copied to build+prove the mutation mechanism (same posture as
//    DEFAULT_COMBAT_BALANCE_CONFIG "PENDING OWNER" and the P2-09 E3 "placeholder stat" note). Canonical item
//    ids / slot set lock only once save data exists (docs/current-state "Do not touch"). Owner must confirm
//    the real slot taxonomy + item catalog before P2B — see the P2-07 report. Do not treat as spec.

import type { PlayerCombatStats } from "@/engine/config";

/**
 * inventory bag capacity per character (Storage §1.2 / Flow Spec `slotsPerCharacter: 40`). This IS a spec
 * value (not invented) — bag slots are the integer range [0, capacity). Equipment slots live in a *separate*
 * numeric space under location CHARACTER_EQUIPMENT, so bag slot 0 and equip slot 0 never collide.
 */
export const DEFAULT_INVENTORY_CAPACITY = 40;

/** additive combat-stat delta contributed by gear — keys mirror PlayerCombatStats (src/engine/config/combat.ts). */
export interface EquipmentStatBonus {
  hp: number;
  atk: number;
  def: number;
  critRate: number;
  critDmg: number;
  penetration: number;
}

export const ZERO_STAT_BONUS: EquipmentStatBonus = {
  hp: 0,
  atk: 0,
  def: 0,
  critRate: 0,
  critDmg: 0,
  penetration: 0,
};

/**
 * one wearable slot. `slotId` = the integer stored in ItemInstance.slot when location = CHARACTER_EQUIPMENT
 * (one instance per slotId). `key` = stable machine name for config/UI; `label` = display (Thai).
 * ⚠️ PENDING OWNER placeholder set — owner confirms the real taxonomy before content lands.
 */
export interface EquipmentSlotDef {
  slotId: number;
  key: string;
  label: string;
}

/** ⚠️ PENDING OWNER placeholder equipment slot set (mechanism proof only, not spec). */
export const EQUIPMENT_SLOTS: readonly EquipmentSlotDef[] = [
  { slotId: 0, key: "weapon", label: "อาวุธ" },
  { slotId: 1, key: "helmet", label: "หมวก" },
  { slotId: 2, key: "armor", label: "เกราะ" },
  { slotId: 3, key: "boots", label: "รองเท้า" },
  { slotId: 4, key: "accessory", label: "เครื่องประดับ" },
];

const EQUIPMENT_SLOT_IDS = new Set<number>(EQUIPMENT_SLOTS.map((s) => s.slotId));

/** true = `slotId` is a valid equipment slot (config-driven, not hardcoded in logic). */
export function isEquipmentSlotId(slotId: number): boolean {
  return EQUIPMENT_SLOT_IDS.has(slotId);
}

/** kind of an item def — only `equipment` participates in equip/unequip; others stay in the bag. */
export type ItemKind = "equipment" | "material" | "consumable";

/** item definition (config). `equipSlotId` present ⟺ kind = equipment. `stats` = additive gear bonus. */
export interface ItemDefinition {
  id: string;
  kind: ItemKind;
  /** which equipment slot this item occupies (kind = equipment only) — must be a valid EQUIPMENT_SLOTS id. */
  equipSlotId?: number;
  /** additive combat bonus while equipped (subset — missing keys = 0). ⚠️ PENDING OWNER numbers. */
  stats?: Partial<EquipmentStatBonus>;
  /** stackable in a single bag slot (materials/consumables). equipment = false (quantity 1, per-instance). */
  stackable: boolean;
  /**
   * §12.1 anti-dup group DEFAULT — stamped onto ItemInstance.uniqueEquipGroup when an instance is created
   * (drop/grant, P2-09). The equip check reads the PER-INSTANCE value (schema, S3), not this — this is only
   * the config source for that stamp. null = no restriction.
   */
  uniqueEquipGroup?: string | null;
}

export type ItemCatalog = ReadonlyMap<string, ItemDefinition>;

/** build a catalog map from defs (dedup by id — last wins). */
export function buildItemCatalog(defs: readonly ItemDefinition[]): ItemCatalog {
  const map = new Map<string, ItemDefinition>();
  for (const d of defs) map.set(d.id, d);
  return map;
}

/**
 * ⚠️ PENDING OWNER placeholder item defs (mechanism proof + dev fixtures, not spec). Real Map-1 catalog +
 * stat curve arrive with owner balance (Economy §11 / Reinforcement R9). Ids are non-canonical placeholders.
 */
export const DEFAULT_ITEM_DEFINITIONS: readonly ItemDefinition[] = [
  { id: "wpn_starter_sword", kind: "equipment", equipSlotId: 0, stackable: false, stats: { atk: 5 } },
  { id: "arm_starter_vest", kind: "equipment", equipSlotId: 2, stackable: false, stats: { def: 4, hp: 20 } },
  { id: "acc_starter_ring", kind: "equipment", equipSlotId: 4, stackable: false, stats: { critRate: 0.02, atk: 1 } },
  { id: "mat_slime_jelly", kind: "material", stackable: true },
];

export const DEFAULT_ITEM_CATALOG: ItemCatalog = buildItemCatalog(DEFAULT_ITEM_DEFINITIONS);

/** narrow a def to an equippable one (kind = equipment + valid slot), else null. */
export function asEquippable(
  def: ItemDefinition | undefined,
): (ItemDefinition & { equipSlotId: number }) | null {
  if (!def || def.kind !== "equipment" || def.equipSlotId === undefined) return null;
  if (!isEquipmentSlotId(def.equipSlotId)) return null;
  return def as ItemDefinition & { equipSlotId: number };
}

/** effective combat stats = base (PlayerCombatStats) + equipment bonus, additive per field. */
export function applyEquipmentBonus(
  base: PlayerCombatStats,
  bonus: EquipmentStatBonus,
): PlayerCombatStats {
  return {
    hp: base.hp + bonus.hp,
    atk: base.atk + bonus.atk,
    def: base.def + bonus.def,
    critRate: base.critRate + bonus.critRate,
    critDmg: base.critDmg + bonus.critDmg,
    penetration: base.penetration + bonus.penetration,
  };
}
