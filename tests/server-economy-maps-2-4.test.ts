import { describe, expect, test } from "vitest";
import {
  DEFAULT_ECONOMY_CONFIG,
  DEFAULT_REINFORCEMENT_CONFIG,
  POST_P2_EXP_CURVE_EXTENSION_LV10_22,
} from "../server/config";
import { DEFAULT_ITEM_CATALOG } from "../src/server/inventory/item-catalog";
import { grantKillRewards, type ItemMeta } from "@/server/economy/kill-reward";
import { rollDropTable, type DropTable } from "@/server/economy/drop-roll";
import { applyExpGain } from "@/server/economy/exp";
import { grantKillRewardsForMob } from "../server/economy/kill-rewards";
import { grantFieldBossReinforcementWired } from "../server/economy/reinforcement-pity";

// Batch 5b — Maps 2–4 economy LIVE (MAPS_2_4_ECONOMY_AND_LOOT_SPEC §2/§4/§5) — never-downgrade zone (reward/RNG/ids).
// maps 2–4 = phase P2 (LIVE playable content; owner re-sequence 2026-07-14: OB comes AFTER the Expanded phase).

const MAP24_MONSTER_IDS = [
  "mon_map2_mushroom_startle", "mon_map2_scarecrow_walker", "mon_map2_greenlight_rat",
  "elite_map2_talisman_scarecrow", "boss_map2_field_warden",
  "mon_map3_gnawing_root", "mon_map3_shadow_monkey", "mon_map3_walking_stone",
  "elite_map3_mossless_stone", "boss_map3_nameless_warden",
  "mon_map4_moonlight_wisp", "mon_map4_dream_mushroom", "mon_map4_shadow_deer",
  "elite_map4_shattered_moon_deer", "boss_map4_moondark_dryad",
];

const NEW_MATERIALS = [
  "mat_startle_spore", "mat_resonant_straw", "mat_greenlight_whisker", "mat_warden_talisman_ash",
  "mat_old_root_scrap", "mat_shadow_pelt", "mat_mossless_shard", "mat_nameless_marker_stone",
  "mat_moonlight_residue", "mat_dream_cap", "mat_shadow_dew", "mat_moondark_sap",
];

describe("Maps 2–4 monster rewards (§2 identity/EXP/Gold)", () => {
  const byId = new Map(DEFAULT_ECONOMY_CONFIG.monsterRewards.map((m) => [m.monsterId, m]));

  test("ครบ 15 monster + phase P2 (LIVE — Batch 5b, owner re-sequence 2026-07-14)", () => {
    for (const id of MAP24_MONSTER_IDS) {
      const r = byId.get(id);
      expect(r, `monster reward missing: ${id}`).toBeDefined();
      expect(r!.phase, `${id} ต้อง P2 (Maps 2–4 LIVE)`).toBe("P2");
    }
  });

  test("EXP/Gold/Level ตรง §2 (spot: M2 mushroom · M3 boss · M4 boss ปิดแบนด์)", () => {
    expect(byId.get("mon_map2_mushroom_startle")).toMatchObject({ level: 8, exp: 50, goldMin: 14, goldMax: 20 });
    expect(byId.get("boss_map2_field_warden")).toMatchObject({ level: 14, exp: 1000, goldMin: 320, goldMax: 460 });
    expect(byId.get("boss_map3_nameless_warden")).toMatchObject({ level: 18, exp: 1300, goldMin: 420, goldMax: 600 });
    expect(byId.get("boss_map4_moondark_dryad")).toMatchObject({ level: 22, exp: 1600, goldMin: 520, goldMax: 740 });
  });

  test("dropTableId ต่อ monster ชี้ table ที่มีจริง", () => {
    const tableIds = new Set(DEFAULT_ECONOMY_CONFIG.dropTables.map((t) => t.dropTableId));
    for (const id of MAP24_MONSTER_IDS) {
      const r = byId.get(id)!;
      expect(tableIds.has(r.dropTableId), `${id} → ${r.dropTableId} ไม่มีในตารางดรอป`).toBe(true);
    }
  });

  test("Map 1 ยัง live ปกติ (P2) — ไม่ถูก Batch 5 กระทบ", () => {
    expect(byId.get("mon_map1_slime")!.phase).toBe("P2");
    expect(byId.get("boss_map1_boiling_boar")!.phase).toBe("P2");
  });
});

describe("Maps 2–4 materials (§4 catalog + sell)", () => {
  test("12 material ใหม่อยู่ใน item catalog (stackable + rarity ตรง §4)", () => {
    for (const id of NEW_MATERIALS) {
      const def = DEFAULT_ITEM_CATALOG.get(id);
      expect(def, `material missing: ${id}`).toBeDefined();
      expect(def!.kind).toBe("material");
      expect(def!.stackable).toBe(true);
    }
    expect(DEFAULT_ITEM_CATALOG.get("mat_moondark_sap")!.rarity).toBe("rare"); // §4 boss M4 = Rare
    expect(DEFAULT_ITEM_CATALOG.get("mat_greenlight_whisker")!.rarity).toBe("uncommon");
    expect(DEFAULT_ITEM_CATALOG.get("mat_startle_spore")!.rarity).toBe("common");
  });

  test("boss-material = ACCOUNT_BOUND (§4 note); material ปกติ = UNBOUND default", () => {
    for (const id of ["mat_warden_talisman_ash", "mat_nameless_marker_stone", "mat_moondark_sap"]) {
      expect(DEFAULT_ITEM_CATALOG.get(id)!.sharing?.bindType, id).toBe("ACCOUNT_BOUND");
    }
    expect(DEFAULT_ITEM_CATALOG.get("mat_startle_spore")!.sharing).toBeUndefined(); // = default UNBOUND
  });

  test("sell price ตรง §4 (startle 6 · marker_stone 34 · moondark_sap 40)", () => {
    const sell = DEFAULT_ECONOMY_CONFIG.shop.sellPrices;
    expect(sell.mat_startle_spore).toBe(6);
    expect(sell.mat_resonant_straw).toBe(8);
    expect(sell.mat_greenlight_whisker).toBe(14);
    expect(sell.mat_nameless_marker_stone).toBe(34);
    expect(sell.mat_moondark_sap).toBe(40);
  });
});

describe("Maps 2–4 drop tables (§5 well-formed)", () => {
  const map24 = DEFAULT_ECONOMY_CONFIG.dropTables.filter((t) => /^drop_map[234]_/.test(t.dropTableId));
  const poolIds = new Set(DEFAULT_ECONOMY_CONFIG.equipmentPools.map((p) => p.poolId));

  test("15 table (per-mob normal + elite + boss) ต่อ 3 แมพ + phase P2 (LIVE)", () => {
    expect(map24).toHaveLength(15);
    for (const t of map24) expect(t.phase, t.dropTableId).toBe("P2");
  });

  test("ทุก itemId ที่อ้าง (material/potion) มีจริงใน catalog", () => {
    for (const t of map24) {
      const ids = [...t.guaranteed, ...t.rolls]
        .map((e) => e.itemId)
        .filter((id): id is string => id !== null);
      for (const id of ids) {
        expect(DEFAULT_ITEM_CATALOG.has(id), `${t.dropTableId} อ้าง item "${id}" ไม่มีใน catalog`).toBe(true);
      }
    }
  });

  test("ทุก poolId ที่อ้างมีจริงใน equipmentPools", () => {
    for (const t of map24) {
      const pids = [...t.guaranteed, ...t.rolls]
        .map((e) => e.poolId)
        .filter((id): id is string => id !== null);
      for (const id of pids) {
        expect(poolIds.has(id), `${t.dropTableId} อ้าง pool "${id}" ไม่มี`).toBe(true);
      }
    }
  });

  test("chancePercent 0–100 + quantity min≤max ทุก roll/guaranteed", () => {
    for (const t of map24) {
      for (const r of t.rolls) {
        expect(r.chancePercent, `${t.dropTableId}/${r.rollId}`).toBeGreaterThanOrEqual(0);
        expect(r.chancePercent, `${t.dropTableId}/${r.rollId}`).toBeLessThanOrEqual(100);
        expect(r.quantity.max).toBeGreaterThanOrEqual(r.quantity.min);
      }
      for (const g of t.guaranteed) expect(g.quantity.max).toBeGreaterThanOrEqual(g.quantity.min);
    }
  });

  test("ไม่มี upg_reinforcement/เศษ ในตารางไหน (boss-only via pity path §4.2/§3.5 — Map 1 + Maps 2–4 ladder เดียวกัน)", () => {
    const json = JSON.stringify(map24);
    expect(json).not.toMatch(/upg_reinforcement/);
    expect(json).not.toMatch(/upg_kraeng/);
  });

  test("Map 4 boss = Epic ตัวแรกในเนื้อหา (pool_map4_epic_gear 6%, §5.3)", () => {
    const boss = map24.find((t) => t.dropTableId === "drop_map4_boss_v1")!;
    const epic = boss.rolls.find((r) => r.rollId === "epic_equipment");
    expect(epic).toMatchObject({ poolId: "pool_map4_epic_gear", chancePercent: 6 });
  });

  test("Maps 2–4 equipment pools = ประกาศครบ แต่ entries ว่าง (owner-gated §7 Q2 — item master ยังไม่ mint)", () => {
    const map24Pools = DEFAULT_ECONOMY_CONFIG.equipmentPools.filter((p) => /^pool_map[234]_/.test(p.poolId));
    expect(map24Pools).toHaveLength(10); // common/uncommon/rare ต่อแมพ (9) + pool_map4_epic_gear
    for (const p of map24Pools) expect(p.entries, `${p.poolId} ต้องว่างจน Q2`).toHaveLength(0);
    // Map 1 pool ยังมี weight (ไม่ถูกกระทบ)
    const slime = DEFAULT_ECONOMY_CONFIG.equipmentPools.find((p) => p.poolId === "common_slime_gear")!;
    expect(slime.entries.reduce((s, e) => s + e.weight, 0)).toBe(100);
  });
});

describe("EXP curve extension lv10–22 (§1 band · §7 Q1 owner-gated · Design Knob)", () => {
  const ext = POST_P2_EXP_CURVE_EXTENSION_LV10_22;
  const live = DEFAULT_ECONOMY_CONFIG.expCurve;

  test("live curve = levelCap 22 + 22 แถว (Batch 5b — extension wired LIVE)", () => {
    expect(live.levelCap).toBe(22);
    expect(live.levels).toHaveLength(22);
    // POST_P2_EXP_CURVE_EXTENSION_LV10_22 = the lv≥10 slice of the live curve (single source of truth)
    expect(ext).toEqual(live.levels.filter((l) => l.level >= 10));
  });

  test("extension = lv10..22 (13 แถว), lv22 = cap (expToNext 0)", () => {
    expect(ext.map((r) => r.level)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
    expect(ext[ext.length - 1]).toMatchObject({ level: 22, expToNext: 0 });
  });

  test("cumulative = running sum ต่อจาก lv9 (7440) — self-consistent", () => {
    let running = 7440; // lv9 cumulative (live)
    for (const row of ext) {
      running += row.expToNext;
      expect(row.cumulative, `lv${row.level}`).toBe(running);
    }
    expect(ext[ext.length - 1].cumulative).toBe(116080);
  });

  test("combined curve lv1→22 monotonic: cumulative เพิ่มเสมอ + expToNext เพิ่มทุกระดับจน lv21", () => {
    // live lv1–9 (drop lv10 cap-0) + extension lv10–22
    const combined = [...live.levels.filter((l) => l.level < 10), ...ext];
    for (let i = 1; i < combined.length; i++) {
      expect(combined[i].cumulative, `cumulative lv${combined[i].level}`).toBeGreaterThan(combined[i - 1].cumulative - 0.5);
    }
    // expToNext เพิ่มขึ้นทุกระดับ (progression หนักขึ้น) จน lv21; lv22 = 0 (cap)
    const upToLv21 = combined.filter((l) => l.level <= 21).map((l) => l.expToNext);
    for (let i = 1; i < upToLv21.length; i++) {
      expect(upToLv21[i], `expToNext lv${i + 1}`).toBeGreaterThan(upToLv21[i - 1]);
    }
  });
});

// ── Batch 5b LIVE behaviour: rewards actually grant, curve levels past 10, boss pity fires for Maps 2–4 ──────
describe("Maps 2–4 rewards grant LIVE (grantKillRewards §9–§12 · values per §2/§5)", () => {
  const rewards = new Map(DEFAULT_ECONOMY_CONFIG.monsterRewards.map((r) => [r.monsterId, r]));
  const tables = new Map(DEFAULT_ECONOMY_CONFIG.dropTables.map((t) => [t.dropTableId, t]));
  const itemMeta = (): ItemMeta => ({ stackable: true, uniqueEquipGroup: null });

  /** run one kill through the pure orchestrator with all-hit RNG (rng=0 → chances hit, gold=goldMin). */
  async function runKill(monsterId: string, playerLevel: number) {
    const reward = rewards.get(monsterId)!;
    const dropTable = tables.get(reward.dropTableId)! as DropTable;
    const granted: { itemId: string; quantity: number }[] = [];
    const outcome = await grantKillRewards(
      {
        reward: { monsterId: reward.monsterId, level: reward.level, exp: reward.exp, goldMin: reward.goldMin, goldMax: reward.goldMax, dropTableId: reward.dropTableId },
        dropTable,
        pools: DEFAULT_ECONOMY_CONFIG.equipmentPools,
        excludedItemIds: new Set<string>(),
        itemMeta,
        expCurve: DEFAULT_ECONOMY_CONFIG.expCurve,
        rng: () => 0,
        dropTableVersion: 1,
        ledger: null,
        inventory: {
          async grantItems(input) {
            for (const g of input.grants) granted.push({ itemId: g.itemId, quantity: g.quantity });
            return { granted: input.grants.map((g) => ({ itemId: g.itemId, quantity: g.quantity })), overflow: [] };
          },
        },
        dropAudit: null,
        delivery: null,
      },
      { characterId: "c1", accountId: "a1", mobType: monsterId, playerLevel, playerExp: 0, eligibleMembers: 1, capacity: 40, killEventId: "k1" },
    );
    return { granted, outcome };
  }

  test("Map 2 normal (mushroom_startle) — EXP 50 matched-level + material grant (§2/§5.1)", async () => {
    const { granted, outcome } = await runKill("mon_map2_mushroom_startle", 8);
    expect(outcome.expGained).toBe(50); // lv8 vs mon lv8 → diff 0 → ×1.0
    expect(outcome.goldRolled).toBe(14); // rng 0 → goldMin
    expect(granted.map((g) => g.itemId)).toContain("mat_startle_spore");
  });

  test("Map 3 elite (mossless_stone) — EXP 900 + guaranteed materials (§2/§5.2)", async () => {
    const { granted, outcome } = await runKill("elite_map3_mossless_stone", 17);
    expect(outcome.expGained).toBe(900);
    const ids = granted.map((g) => g.itemId);
    expect(ids).toContain("mat_mossless_shard");
    expect(ids).toContain("mat_shadow_pelt");
  });

  test("Map 4 boss (moondark_dryad) — EXP 1600 (band cap) + guaranteed Rare boss material (§2/§5.3)", async () => {
    const { granted, outcome } = await runKill("boss_map4_moondark_dryad", 22);
    expect(outcome.expGained).toBe(1600);
    expect(granted.map((g) => g.itemId)).toContain("mat_moondark_sap");
  });

  test("empty gear pool rolls safely — no throw, no gear granted (item master ยังไม่ mint = follow-up)", () => {
    // scarecrow_walker table refs pool_map2_common_gear (20%) + pool_map2_uncommon_gear (6%), both entries[].
    const table = tables.get("drop_map2_scarecrow_walker_v1")! as DropTable;
    const roll = rollDropTable(table, DEFAULT_ECONOMY_CONFIG.equipmentPools, () => 0); // all rolls hit
    expect(roll.grants.some((g) => g.itemId.startsWith("eq_"))).toBe(false); // empty pool → no gear
    expect(roll.grants.map((g) => g.itemId)).toContain("mat_resonant_straw"); // material still lands
    const gearAudit = roll.audits.find((a) => a.rollId === "common_equipment");
    expect(gearAudit?.resultItemId).toBeNull(); // roll hit but empty pool → suppressed, no grant
  });
});

describe("Maps 2–4 EXP curve LIVE — level-up past 10 + cap 22 (Batch 5b)", () => {
  const curve = DEFAULT_ECONOMY_CONFIG.expCurve;

  test("lv10 → lv11 with the extended curve (+2280 EXP)", () => {
    expect(applyExpGain({ level: 10, exp: 7440, gained: 2280, curve })).toEqual({
      level: 11, exp: 9720, leveledUp: true, levelsGained: 1,
    });
  });

  test("no EXP past the lv22 cap (116080) — Reward EXP logged แต่ไม่สะสมเกิน (§9.1)", () => {
    const r = applyExpGain({ level: 22, exp: 116080, gained: 999999, curve });
    expect(r.level).toBe(22);
    expect(r.exp).toBe(116080);
    expect(r.leveledUp).toBe(false);
  });
});

describe("Maps 2–4 boss reinforcement pity LIVE — per (account, boss) (Batch 5b §4.2)", () => {
  test("pity increments per account for boss_map2/3/4 (independent rows) — no drop by chance (rng=1)", async () => {
    for (const bossId of ["boss_map2_field_warden", "boss_map3_nameless_warden", "boss_map4_moondark_dryad"]) {
      const ctx = { accountId: `acc_pity_${bossId}`, characterId: "", bossId };
      const r1 = await grantFieldBossReinforcementWired(ctx, DEFAULT_REINFORCEMENT_CONFIG, () => 1);
      expect(r1.reinforcementDropped, bossId).toBe(false); // clear 1 @ 8% (rng 1 → miss)
      expect(r1.pityCount, bossId).toBe(1);
      const r2 = await grantFieldBossReinforcementWired(ctx, DEFAULT_REINFORCEMENT_CONFIG, () => 1);
      expect(r2.pityCount, bossId).toBe(2); // increments per (account, boss)
      expect(r2.guaranteedAtClear, bossId).toBe(15); // §4.2 ladder shared across all bosses
    }
  });

  test("grantKillRewardsForMob fires the pity path for a Maps 2–4 boss (reinforcementProgress present)", async () => {
    const bossKill = await grantKillRewardsForMob({
      mobType: "field_warden", characterId: "", accountId: "acc_fire_m2",
      playerLevel: 14, playerExp: 0, eligibleMembers: 1, killEventId: "k1", persist: false,
    });
    expect(bossKill).not.toBeNull();
    expect(bossKill!.reinforcementProgress).toBeDefined();
    expect(bossKill!.reinforcementProgress!.guaranteedAtClear).toBe(15);

    // a normal Maps 2–4 mob grants EXP but carries NO reinforcement progress (boss-only model, §5).
    const normalKill = await grantKillRewardsForMob({
      mobType: "scarecrow_walker", characterId: "", accountId: "acc_fire_m2n",
      playerLevel: 10, playerExp: 0, eligibleMembers: 1, killEventId: "k2", persist: false,
    });
    expect(normalKill).not.toBeNull();
    expect(normalKill!.expGained).toBe(60); // §2 scarecrow_walker EXP
    expect(normalKill!.reinforcementProgress).toBeUndefined();
  });
});
