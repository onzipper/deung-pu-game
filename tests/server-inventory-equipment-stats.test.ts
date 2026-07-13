import { describe, it, expect } from "vitest";
import { aggregateEquipmentBonus } from "@/server/inventory/equipment-stats";
import {
  applyEquipmentBonus,
  buildItemCatalog,
  DEFAULT_ITEM_CATALOG,
  ZERO_STAT_BONUS,
  type EquipmentStatBonus,
  type ItemDefinition,
} from "@/server/inventory/item-catalog";
import type { PlayerCombatStats } from "@/engine/config";

// P2-07 / D-045 — equipment → combat stat aggregation (PURE, never-downgrade combat calc).
// Stat vector = Economy §6.1; expected values transcribed from the §7 item master, not the impl.

const BASE: PlayerCombatStats = {
  hp: 100,
  atk: 12,
  def: 8,
  critRate: 0.05,
  critDmg: 0.5,
  penetration: 0,
};

describe("aggregateEquipmentBonus", () => {
  it("returns zero for an empty equipped set", () => {
    expect(aggregateEquipmentBonus([], DEFAULT_ITEM_CATALOG)).toEqual(ZERO_STAT_BONUS);
  });

  it("reads a single item's bonus from the catalog", () => {
    const b = aggregateEquipmentBonus([{ itemId: "eq_weapon_training_blade" }], DEFAULT_ITEM_CATALOG);
    expect(b).toMatchObject({ attack: 8, defense: 0, maxHp: 0 });
  });

  it("sums multiple worn items field-by-field (§6.1 vector)", () => {
    // training_blade ATK 8 + moon_echo ATK 4 = 12 · boarhide_vest DEF 8 / HP 30 · moon_echo Break 5
    const b = aggregateEquipmentBonus(
      [
        { itemId: "eq_weapon_training_blade" },
        { itemId: "eq_body_boarhide_vest" },
        { itemId: "eq_talisman_moon_echo" },
      ],
      DEFAULT_ITEM_CATALOG,
    );
    expect(b.attack).toBe(12);
    expect(b.defense).toBe(8);
    expect(b.maxHp).toBe(30);
    expect(b.breakPower).toBe(5);
  });

  it("keeps the two percent stats as integer percent (§6.1 convention, 1 = 1%)", () => {
    // resonant_edge Crit 2% + feather_knot Move 1%
    const b = aggregateEquipmentBonus(
      [{ itemId: "eq_weapon_resonant_edge" }, { itemId: "eq_accessory_feather_knot" }],
      DEFAULT_ITEM_CATALOG,
    );
    expect(b.criticalChancePercent).toBe(2);
    expect(b.moveSpeedPercent).toBe(1);
  });

  it("ignores unknown ids and non-equipment (materials) — no stat inflation", () => {
    const b = aggregateEquipmentBonus(
      [{ itemId: "mat_slime_gel" }, { itemId: "does_not_exist" }],
      DEFAULT_ITEM_CATALOG,
    );
    expect(b).toEqual(ZERO_STAT_BONUS);
  });

  it("ignores an equipment def pointing at an invalid slot id (guard)", () => {
    const catalog = buildItemCatalog([
      {
        id: "bad",
        kind: "equipment",
        rarity: "common",
        reqLevel: 1,
        equipSlotId: 99,
        stackable: false,
        stats: { attack: 999 },
      } as ItemDefinition,
    ]);
    expect(aggregateEquipmentBonus([{ itemId: "bad" }], catalog)).toEqual(ZERO_STAT_BONUS);
  });
});

describe("applyEquipmentBonus", () => {
  it("maps the §6.1 vector onto combat stats (attack/defense/maxHp additive, crit% → /100)", () => {
    const bonus: EquipmentStatBonus = {
      attack: 6,
      defense: 4,
      maxHp: 20,
      criticalChancePercent: 2,
      breakPower: 5,
      moveSpeedPercent: 1,
    };
    const eff = applyEquipmentBonus(BASE, bonus);
    expect(eff).toEqual({
      hp: 120,
      atk: 18,
      def: 12,
      critRate: 0.07, // 0.05 + 2/100 (integer percent → fraction)
      critDmg: 0.5, // gear does not contribute critDmg (D-055 secondary stat)
      penetration: 0, // gear does not contribute penetration (D-055 secondary stat)
    });
    // breakPower / moveSpeedPercent have no combat field yet — intentionally not applied (see report).
  });

  it("is a no-op with the zero bonus", () => {
    expect(applyEquipmentBonus(BASE, ZERO_STAT_BONUS)).toEqual(BASE);
  });
});

// D-045 transcription spot-check — ≥6 items across all 5 slots, values straight from the §7 master tables.
describe("item catalog transcription (Economy §7.2–§7.6, LOCKED)", () => {
  const get = (id: string): ItemDefinition => {
    const d = DEFAULT_ITEM_CATALOG.get(id);
    if (!d) throw new Error(`missing catalog id: ${id}`);
    return d;
  };

  it("weapon eq_weapon_resonant_edge — Rare Lv8, ATK 24 / Crit 2% / Break 3, slot weapon(0)", () => {
    const d = get("eq_weapon_resonant_edge");
    expect(d).toMatchObject({ kind: "equipment", rarity: "rare", reqLevel: 8, equipSlotId: 0 });
    expect(d.stats).toEqual({ attack: 24, criticalChancePercent: 2, breakPower: 3 });
  });

  it("weapon eq_weapon_training_blade — Common Lv1, ATK 8, slot weapon(0)", () => {
    const d = get("eq_weapon_training_blade");
    expect(d).toMatchObject({ rarity: "common", reqLevel: 1, equipSlotId: 0 });
    expect(d.stats).toEqual({ attack: 8 });
  });

  it("head eq_head_moon_sand_circlet — Rare Lv8, DEF 5 / HP 30 / Crit 1%, slot head(1)", () => {
    const d = get("eq_head_moon_sand_circlet");
    expect(d).toMatchObject({ rarity: "rare", reqLevel: 8, equipSlotId: 1 });
    expect(d.stats).toEqual({ defense: 5, maxHp: 30, criticalChancePercent: 1 });
  });

  it("body eq_body_boarhide_vest — Uncommon Lv5, DEF 8 / HP 30, slot body(2)", () => {
    const d = get("eq_body_boarhide_vest");
    expect(d).toMatchObject({ rarity: "uncommon", reqLevel: 5, equipSlotId: 2 });
    expect(d.stats).toEqual({ defense: 8, maxHp: 30 });
  });

  it("accessory eq_accessory_resonance_bead — Rare Lv8, HP 12 / Crit 2%, unique group, slot accessory(3)", () => {
    const d = get("eq_accessory_resonance_bead");
    expect(d).toMatchObject({
      rarity: "rare",
      reqLevel: 8,
      equipSlotId: 3,
      uniqueEquipGroup: "resonance_bead",
    });
    expect(d.stats).toEqual({ maxHp: 12, criticalChancePercent: 2 });
  });

  it("accessory eq_accessory_feather_knot — Common Lv2, HP 8 / Move 1%, slot accessory(3)", () => {
    const d = get("eq_accessory_feather_knot");
    expect(d).toMatchObject({ rarity: "common", reqLevel: 2, equipSlotId: 3 });
    expect(d.stats).toEqual({ maxHp: 8, moveSpeedPercent: 1 });
  });

  it("talisman eq_talisman_moon_echo — Rare Lv8, ATK 4 / Break 5, slot talisman(4)", () => {
    const d = get("eq_talisman_moon_echo");
    expect(d).toMatchObject({ rarity: "rare", reqLevel: 8, equipSlotId: 4 });
    expect(d.stats).toEqual({ attack: 4, breakPower: 5 });
  });
});
