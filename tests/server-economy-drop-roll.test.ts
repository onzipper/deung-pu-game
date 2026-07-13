import { describe, expect, test } from "vitest";
import {
  rollDropTable,
  GUARANTEED_NO_ROLL,
  type DropTable,
  type EquipmentPool,
} from "../src/server/economy/drop-roll";
import { createLcgRng, type RngFn } from "../src/game/mob/rng";
import { DEFAULT_ECONOMY_CONFIG } from "../server/config";

// P2-09 — drop-table roll (Economy §11). never-downgrade zone (loot RNG). deterministic via scripted/seeded rng.

/** rng that yields a fixed script of values in order (throws if exhausted — keeps draw-order a hard contract). */
function scriptedRng(values: number[]): RngFn {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error(`scriptedRng exhausted after ${values.length} draws`);
    return values[i++];
  };
}

const POOLS = DEFAULT_ECONOMY_CONFIG.equipmentPools;
const SLIME_TABLE = DEFAULT_ECONOMY_CONFIG.dropTables.find((t) => t.dropTableId === "drop_map1_slime_v1")!;
const ELITE_TABLE = DEFAULT_ECONOMY_CONFIG.dropTables.find((t) => t.dropTableId === "drop_map1_elite_boar_v1")!;

describe("rollDropTable — draw order + hit/miss (§11.1)", () => {
  test("slime: material hit ×2 + potion miss + equipment hit (pool pick)", () => {
    // draws: [material chance .5<.70 hit][material qty .9→1+floor(.9*2)=2][potion chance .99 miss]
    //        [equip chance .1<.18 hit][equip pool pick .0→first=training_blade][equip qty .0→1]
    const rng = scriptedRng([0.5, 0.9, 0.99, 0.1, 0.0, 0.0]);
    const { grants, audits } = rollDropTable(SLIME_TABLE, POOLS, rng);
    expect(grants).toEqual([
      { itemId: "mat_slime_gel", quantity: 2 },
      { itemId: "eq_weapon_training_blade", quantity: 1 },
    ]);
    expect(audits).toEqual([
      { rollId: "material", rngRoll: 0.5, resultItemId: "mat_slime_gel", quantity: 2 },
      { rollId: "potion", rngRoll: 0.99, resultItemId: null, quantity: 0 },
      { rollId: "equipment", rngRoll: 0.1, resultItemId: "eq_weapon_training_blade", quantity: 1 },
    ]);
  });

  test("all miss → no grants, but every roll still audited (DoD 8)", () => {
    const rng = scriptedRng([0.99, 0.99, 0.99]); // 3 chance draws, all miss
    const { grants, audits } = rollDropTable(SLIME_TABLE, POOLS, rng);
    expect(grants).toEqual([]);
    expect(audits.map((a) => a.resultItemId)).toEqual([null, null, null]);
    expect(audits).toHaveLength(SLIME_TABLE.rolls.length);
  });

  test("boundary: chance draw exactly at the threshold is a MISS (r*100 < chance)", () => {
    // material chance 70 → r=0.70 → 70 < 70 false → miss. then potion/equip miss.
    const rng = scriptedRng([0.7, 0.99, 0.99]);
    const { grants } = rollDropTable(SLIME_TABLE, POOLS, rng);
    expect(grants).toEqual([]);
  });
});

describe("rollDropTable — guaranteed[] always drop (§11.5)", () => {
  test("elite guaranteed materials always granted; fixed items use the no-roll sentinel", () => {
    // elite guaranteed[0]=mat_coarse_hide(2-4), [1]=mat_sharp_tusk(1-2); both fixed items.
    // draws: [g0 qty .0→2][g1 qty .0→1] then 4 rolls all miss (.99 ×4)
    const rng = scriptedRng([0.0, 0.0, 0.99, 0.99, 0.99, 0.99]);
    const { grants, audits } = rollDropTable(ELITE_TABLE, POOLS, rng);
    expect(grants).toEqual([
      { itemId: "mat_coarse_hide", quantity: 2 },
      { itemId: "mat_sharp_tusk", quantity: 1 },
    ]);
    const guaranteedAudits = audits.filter((a) => a.rollId.startsWith("guaranteed:"));
    expect(guaranteedAudits).toHaveLength(2);
    expect(guaranteedAudits.every((a) => a.rngRoll === GUARANTEED_NO_ROLL)).toBe(true);
  });
});

describe("rollDropTable — excludedItemIds guard (R8 Kraeng)", () => {
  test("a roll resolving to an excluded id is suppressed (no grant, audit null)", () => {
    const table: DropTable = {
      dropTableId: "t",
      guaranteed: [{ itemId: "upg_reinforcement", poolId: null, quantity: { min: 1, max: 1 } }],
      rolls: [{ rollId: "kraeng", chancePercent: 100, itemId: "upg_reinforcement", poolId: null, quantity: { min: 1, max: 1 } }],
    };
    const rng = scriptedRng([0.0]); // one chance draw for the single roll (guaranteed fixed = no draw)
    const excluded = new Set(["upg_reinforcement"]);
    const { grants, audits } = rollDropTable(table, [], rng, { excludedItemIds: excluded });
    expect(grants).toEqual([]);
    expect(audits.every((a) => a.resultItemId === null)).toBe(true);
  });
});

describe("rollDropTable — weighted pool distribution", () => {
  test("common_slime_gear picks respect weights over many equipment hits (seeded LCG)", () => {
    const pool = POOLS.find((p) => p.poolId === "common_slime_gear")! as EquipmentPool;
    const counts = new Map<string, number>();
    const rng = createLcgRng(12345);
    const N = 4000;
    for (let n = 0; n < N; n++) {
      // force the equipment roll to always hit: build a 1-roll table pointing at the pool with 100% chance.
      const table: DropTable = {
        dropTableId: "t",
        guaranteed: [],
        rolls: [{ rollId: "eq", chancePercent: 100, itemId: null, poolId: pool.poolId, quantity: { min: 1, max: 1 } }],
      };
      const { grants } = rollDropTable(table, POOLS, rng);
      const id = grants[0].itemId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    // training_blade weight 22 vs traveler_tunic weight 17 → training should out-count tunic; both non-trivial.
    const blade = counts.get("eq_weapon_training_blade") ?? 0;
    const tunic = counts.get("eq_body_traveler_tunic") ?? 0;
    expect(blade).toBeGreaterThan(tunic);
    // every pool item appears (no weight starved to zero over 4000 draws).
    for (const e of pool.entries) expect(counts.get(e.itemId) ?? 0).toBeGreaterThan(0);
  });
});
