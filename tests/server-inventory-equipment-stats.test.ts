import { describe, it, expect } from "vitest";
import { aggregateEquipmentBonus } from "@/server/inventory/equipment-stats";
import {
  applyEquipmentBonus,
  buildItemCatalog,
  DEFAULT_ITEM_CATALOG,
  ZERO_STAT_BONUS,
  type ItemDefinition,
} from "@/server/inventory/item-catalog";
import type { PlayerCombatStats } from "@/engine/config";

// P2-07 — equipment → combat stat aggregation (PURE, never-downgrade combat calc). Expected from the catalog.

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
    const b = aggregateEquipmentBonus([{ itemId: "wpn_starter_sword" }], DEFAULT_ITEM_CATALOG);
    expect(b).toMatchObject({ atk: 5, def: 0, hp: 0 });
  });

  it("sums multiple worn items field-by-field", () => {
    const b = aggregateEquipmentBonus(
      [{ itemId: "wpn_starter_sword" }, { itemId: "arm_starter_vest" }, { itemId: "acc_starter_ring" }],
      DEFAULT_ITEM_CATALOG,
    );
    // sword atk5 + ring atk1 = 6 · vest def4 · vest hp20 · ring critRate 0.02
    expect(b.atk).toBe(6);
    expect(b.def).toBe(4);
    expect(b.hp).toBe(20);
    expect(b.critRate).toBeCloseTo(0.02);
  });

  it("ignores unknown ids and non-equipment (materials) — no stat inflation", () => {
    const b = aggregateEquipmentBonus(
      [{ itemId: "mat_slime_jelly" }, { itemId: "does_not_exist" }],
      DEFAULT_ITEM_CATALOG,
    );
    expect(b).toEqual(ZERO_STAT_BONUS);
  });

  it("ignores an equipment def pointing at an invalid slot id (guard)", () => {
    const catalog = buildItemCatalog([
      { id: "bad", kind: "equipment", equipSlotId: 99, stackable: false, stats: { atk: 999 } } as ItemDefinition,
    ]);
    expect(aggregateEquipmentBonus([{ itemId: "bad" }], catalog)).toEqual(ZERO_STAT_BONUS);
  });
});

describe("applyEquipmentBonus", () => {
  it("adds the bonus onto base stats field-by-field", () => {
    const eff = applyEquipmentBonus(BASE, { hp: 20, atk: 6, def: 4, critRate: 0.02, critDmg: 0, penetration: 0 });
    expect(eff).toEqual({
      hp: 120,
      atk: 18,
      def: 12,
      critRate: 0.07,
      critDmg: 0.5,
      penetration: 0,
    });
  });

  it("is a no-op with the zero bonus", () => {
    expect(applyEquipmentBonus(BASE, ZERO_STAT_BONUS)).toEqual(BASE);
  });
});
