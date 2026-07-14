// P2-07 — item definition catalog (equipment slot + stat bonus). **SERVER-AUTHORITATIVE Design Knob (§48).**
//
// ⛔ SOURCE OF TRUTH RULE (AI.md iron rule #1 · schema.prisma model Item): the `items` DB table is a
//    *registry of ids only* — it holds NO name/stat/slot. Every item's slot type + stat bonus is a Design
//    Knob (§48) read from config, never hardcoded in DB. This module is that config, keyed by item def id.
//    Client never imports this (stat values are balance/combat truth — like warrior-skills-server.ts).
//
// ✅ SPEC-LOCKED (Economy §1.1/§4.2/§6.1/§7.2–§7.6, LOCKED · D-045): the 5-slot set + the equipmentStats
//    vector + every item's stat/ReqLv/rarity are transcribed verbatim from the Economy spec (no invented
//    numbers). Slot keys are exactly weapon/head/body/accessory/talisman — boots/accessory1/accessory2 are
//    FORBIDDEN in P2 (§1.1). Item ids match the spec master exactly (e.g. `eq_weapon_training_blade`).
//    Starter loadout distribution (§7.7) is NOT implemented here — follow-up (see the report).

import type { PlayerCombatStats } from "@/engine/config";
import type {
  ItemSharingPolicy,
  ItemBindType,
  ItemStoragePolicy,
} from "../../../server/config/types";

/**
 * inventory bag capacity per character (Storage §1.2 / Flow Spec `slotsPerCharacter: 40`). This IS a spec
 * value (not invented) — bag slots are the integer range [0, capacity). Equipment slots live in a *separate*
 * numeric space under location CHARACTER_EQUIPMENT, so bag slot 0 and equip slot 0 never collide.
 */
export const DEFAULT_INVENTORY_CAPACITY = 40;

/**
 * additive gear stat vector (Economy §6.1, verbatim order):
 *   attack, defense, maxHp, criticalChancePercent, breakPower, moveSpeedPercent.
 *
 * CONVENTION (§7.5/§7.2 tables): the two `*Percent` fields hold an **integer percent** (1 = 1%, matching the
 * spec's "2%" / "1%" columns). They are converted to a 0..1 multiplier only at apply time (applyEquipmentBonus).
 * critDmg / penetration are NOT gear stats on Map 1 — they are character secondary stats (D-055) and were
 * dropped from this vector.
 */
export interface EquipmentStatBonus {
  attack: number;
  defense: number;
  maxHp: number;
  /** integer percent (1 = 1%) — added to the player's critRate as `/100` at apply time (§6.1). */
  criticalChancePercent: number;
  breakPower: number;
  /** integer percent (1 = 1%) — aggregated only; no movement-bonus combat field yet (see report). */
  moveSpeedPercent: number;
}

export const ZERO_STAT_BONUS: EquipmentStatBonus = {
  attack: 0,
  defense: 0,
  maxHp: 0,
  criticalChancePercent: 0,
  breakPower: 0,
  moveSpeedPercent: 0,
};

/**
 * one wearable slot. `slotId` = the integer stored in ItemInstance.slot when location = CHARACTER_EQUIPMENT
 * (one instance per slotId). `key` = stable machine name (§1.1, spec-locked); `label` = display (Thai).
 */
export interface EquipmentSlotDef {
  slotId: number;
  key: string;
  label: string;
}

/**
 * Equipment slot set — Economy §1.1 (LOCKED). Exactly 5 slots; the old boots/accessory1/accessory2 taxonomy is
 * superseded and MUST NOT appear in P2 item defs or drop tables.
 */
export const EQUIPMENT_SLOTS: readonly EquipmentSlotDef[] = [
  { slotId: 0, key: "weapon", label: "อาวุธ" },
  { slotId: 1, key: "head", label: "ศีรษะ" },
  { slotId: 2, key: "body", label: "ลำตัว" },
  { slotId: 3, key: "accessory", label: "เครื่องประดับ" },
  { slotId: 4, key: "talisman", label: "เครื่องราง" },
];

/** slot key → slotId, for transcribing item defs by their spec subtype name (§4.2). */
const SLOT_ID_BY_KEY: Readonly<Record<string, number>> = Object.fromEntries(
  EQUIPMENT_SLOTS.map((s) => [s.key, s.slotId]),
);

const EQUIPMENT_SLOT_IDS = new Set<number>(EQUIPMENT_SLOTS.map((s) => s.slotId));

/** true = `slotId` is a valid equipment slot (config-driven, not hardcoded in logic). */
export function isEquipmentSlotId(slotId: number): boolean {
  return EQUIPMENT_SLOT_IDS.has(slotId);
}

/** kind of an item def — only `equipment` participates in equip/unequip; others stay in the bag. */
export type ItemKind = "equipment" | "material" | "consumable";

/** rarity band (Economy §5.1). P2 Map 1 uses only common/uncommon/rare (epic/legendary not dropped, §1.2). */
export type ItemRarity = "common" | "uncommon" | "rare";

/** item definition (config). `equipSlotId` present ⟺ kind = equipment. `stats` = additive gear bonus (§6.1). */
export interface ItemDefinition {
  id: string;
  kind: ItemKind;
  /** rarity band (§5.1) — display + drop-pool classification. */
  rarity: ItemRarity;
  /** required level to equip/use (§7 "Req. Lv" column). */
  reqLevel: number;
  /** which equipment slot this item occupies (kind = equipment only) — must be a valid EQUIPMENT_SLOTS id. */
  equipSlotId?: number;
  /** additive combat bonus while equipped (subset — missing keys = 0). Transcribed from §7.2–§7.6. */
  stats?: Partial<EquipmentStatBonus>;
  /** stackable in a single bag slot (materials/consumables). equipment = false (quantity 1, per-instance). */
  stackable: boolean;
  /**
   * §12.1 anti-dup group DEFAULT — stamped onto ItemInstance.uniqueEquipGroup when an instance is created
   * (drop/grant, P2-09). The equip check reads the PER-INSTANCE value (schema, S3), not this — this is only
   * the config source for that stamp. null = no restriction.
   */
  uniqueEquipGroup?: string | null;
  /**
   * §12.1 sharing policy (bind/storage/trade) — static per-type Design Knob (S3, NOT a DB column). Absent =
   * the shareable default {@link DEFAULT_SHARING_POLICY} (§12.2 Category A: UNBOUND/ALLOWED/NONE). A
   * CHARACTER_BOUND / BLOCKED type is refused deposit (§12.4) by the storage service via {@link sharingPolicyOf}.
   */
  sharing?: ItemSharingPolicy;
}

/**
 * §12.2 Category A default — every Map 1 item is shareable through storage (materials/consumables/unbound
 * equipment). No Category C (CHARACTER_BOUND/BLOCKED) type exists on Map 1 yet — that is content the owner
 * decides (a quest/story key item), so none is invented here; the BLOCKED deposit path is proven via an
 * injected policy in tests. tradePolicy = NONE for all of P2 (no market, §18.1).
 */
export const DEFAULT_SHARING_POLICY: ItemSharingPolicy = {
  bindType: "UNBOUND",
  storagePolicy: "ALLOWED",
  tradePolicy: "NONE",
};

/** sharing policy of an item def (§12.1) — the per-type config value, or the Category-A default when absent. */
export function sharingPolicyOf(def: ItemDefinition | undefined): ItemSharingPolicy {
  return def?.sharing ?? DEFAULT_SHARING_POLICY;
}

export type { ItemSharingPolicy, ItemBindType, ItemStoragePolicy };

export type ItemCatalog = ReadonlyMap<string, ItemDefinition>;

/** build a catalog map from defs (dedup by id — last wins). */
export function buildItemCatalog(defs: readonly ItemDefinition[]): ItemCatalog {
  const map = new Map<string, ItemDefinition>();
  for (const d of defs) map.set(d.id, d);
  return map;
}

/** compact helper to declare one equipment def by spec slot key (keeps the transcription tables readable). */
function equip(
  id: string,
  slotKey: string,
  rarity: ItemRarity,
  reqLevel: number,
  stats: Partial<EquipmentStatBonus>,
  uniqueEquipGroup: string | null = null,
): ItemDefinition {
  return {
    id,
    kind: "equipment",
    rarity,
    reqLevel,
    equipSlotId: SLOT_ID_BY_KEY[slotKey],
    stackable: false,
    stats,
    uniqueEquipGroup,
  };
}

// ── Map 1 equipment master (Economy §7.2–§7.6, verbatim: ATK/DEF/HP/Crit%/Break/Move% + ReqLv + rarity) ──
// Crit column = criticalChancePercent (integer %); Move column = moveSpeedPercent (integer %); Break = breakPower.
const EQUIPMENT_DEFINITIONS: readonly ItemDefinition[] = [
  // §7.2 Weapons (slot weapon) — ATK / Crit% / Break
  equip("eq_weapon_training_blade", "weapon", "common", 1, { attack: 8 }),
  equip("eq_weapon_reed_edge", "weapon", "common", 3, { attack: 12 }),
  equip("eq_weapon_boar_tusk_saber", "weapon", "uncommon", 5, { attack: 17, breakPower: 2 }),
  equip("eq_weapon_resonant_edge", "weapon", "rare", 8, { attack: 24, criticalChancePercent: 2, breakPower: 3 }),

  // §7.3 Head (slot head) — DEF / HP / Crit%
  equip("eq_head_cloth_band", "head", "common", 1, { defense: 1, maxHp: 5 }),
  equip("eq_head_leaf_wrap", "head", "common", 3, { defense: 2, maxHp: 10 }),
  equip("eq_head_boarhide_cap", "head", "uncommon", 5, { defense: 4, maxHp: 18 }),
  equip("eq_head_moon_sand_circlet", "head", "rare", 8, { defense: 5, maxHp: 30, criticalChancePercent: 1 }),

  // §7.4 Body (slot body) — DEF / HP / Break
  equip("eq_body_traveler_tunic", "body", "common", 1, { defense: 3, maxHp: 10 }),
  equip("eq_body_padded_field_coat", "body", "common", 3, { defense: 5, maxHp: 18 }),
  equip("eq_body_boarhide_vest", "body", "uncommon", 5, { defense: 8, maxHp: 30 }),
  equip("eq_body_resonant_coat", "body", "rare", 8, { defense: 11, maxHp: 45, breakPower: 2 }),

  // §7.5 Accessory (slot accessory) — HP / Crit% / Move%
  equip("eq_accessory_plain_cord", "accessory", "common", 1, { maxHp: 5 }),
  equip("eq_accessory_feather_knot", "accessory", "common", 2, { maxHp: 8, moveSpeedPercent: 1 }),
  equip("eq_accessory_tough_tusk_ring", "accessory", "uncommon", 5, { maxHp: 12, criticalChancePercent: 2 }),
  equip("eq_accessory_resonance_bead", "accessory", "rare", 8, { maxHp: 12, criticalChancePercent: 2 }, "resonance_bead"),

  // §7.6 Talisman (slot talisman) — ATK / HP / Break
  equip("eq_talisman_blank", "talisman", "common", 1, { breakPower: 1 }),
  equip("eq_talisman_sprout", "talisman", "common", 3, { maxHp: 10, breakPower: 1 }),
  equip("eq_talisman_firmness", "talisman", "uncommon", 5, { attack: 2, breakPower: 3 }),
  equip("eq_talisman_moon_echo", "talisman", "rare", 8, { attack: 4, breakPower: 5 }),
];

// ── Map 1 non-equipment master (Economy §7.1) — registry entries (no slot/stat). effect/bind modeled by their
//    own systems when built (consumable effect, §4.3 bind). The reinforcement material's *role* (guaranteed +1)
//    lives in the reinforcement config (server/config/reinforcement.ts); the catalog row here only carries the
//    registry identity + `stackable: true` (Reinforcement §3.1/§3.5 stackSize 999) so grants merge into one bag
//    stack and the 5→1 fragment exchange (B4) can spend 5 from a single stack — a non-catalog id would default
//    to non-stackable and break both. rarity is display-only (no drop pool references these ids). ──
const NON_EQUIPMENT_DEFINITIONS: readonly ItemDefinition[] = [
  { id: "con_small_potion", kind: "consumable", rarity: "common", reqLevel: 1, stackable: true },
  { id: "mat_slime_gel", kind: "material", rarity: "common", reqLevel: 1, stackable: true },
  { id: "mat_soft_feather", kind: "material", rarity: "common", reqLevel: 1, stackable: true },
  { id: "mat_coarse_hide", kind: "material", rarity: "common", reqLevel: 1, stackable: true },
  { id: "mat_sharp_tusk", kind: "material", rarity: "uncommon", reqLevel: 1, stackable: true },
  { id: "mat_resonance_dust", kind: "material", rarity: "uncommon", reqLevel: 1, stackable: true },
  { id: "mat_boss_resonance_core", kind: "material", rarity: "uncommon", reqLevel: 1, stackable: true },
  // B4 (Reinforcement §3.1/§3.5): เสริมแกร่ง + เศษเสริมแกร่ง — stackable materials (stackSize 999). ids ตรง
  //   reinforcement config (upg_reinforcement / upg_reinforcement_fragment, R10). role/exchange = reinforcement系.
  { id: "upg_reinforcement", kind: "material", rarity: "rare", reqLevel: 1, stackable: true },
  { id: "upg_reinforcement_fragment", kind: "material", rarity: "uncommon", reqLevel: 1, stackable: true },
];

/** full Map 1 item catalog (Economy §7) — spec-locked, keyed by item def id. */
export const DEFAULT_ITEM_DEFINITIONS: readonly ItemDefinition[] = [
  ...EQUIPMENT_DEFINITIONS,
  ...NON_EQUIPMENT_DEFINITIONS,
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

/**
 * effective combat stats = base (PlayerCombatStats) + equipment bonus (§6.1 → §15.2 combat fields).
 *  • attack/defense/maxHp → atk/def/hp (additive).
 *  • criticalChancePercent → critRate, converted integer-percent → 0..1 fraction (`/100`).
 *  • critDmg / penetration: gear no longer contributes (D-055 secondary stats) — base passes through.
 *  • breakPower / moveSpeedPercent: aggregated in EquipmentStatBonus but have NO combat field yet — intentionally
 *    dropped here (do not invent a break/movement system; see the report).
 */
export function applyEquipmentBonus(
  base: PlayerCombatStats,
  bonus: EquipmentStatBonus,
): PlayerCombatStats {
  return {
    hp: base.hp + bonus.maxHp,
    atk: base.atk + bonus.attack,
    def: base.def + bonus.defense,
    critRate: base.critRate + bonus.criticalChancePercent / 100,
    critDmg: base.critDmg,
    penetration: base.penetration,
  };
}
