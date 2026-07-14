import { describe, expect, test } from "vitest";
import {
  DEFAULT_ECONOMY_CONFIG,
  DEFAULT_REINFORCEMENT_CONFIG,
  DEFAULT_STORAGE_CONFIG,
} from "../server/config";

// P2-09 — lock server config values ตรง decision docs (กันพิมพ์ผิดในค่า balance/RNG — never-downgrade zone).
// ทุกค่าอ้าง § ที่เคาะแล้ว: Economy §9/§16.3.1/§18.3 · D-053/D-054 · Reinforcement doc §3.5/§4.

describe("enhancement curve (D-054 / Economy §16.3.1)", () => {
  const enh = DEFAULT_ECONOMY_CONFIG.enhancementCurve;

  test("เพดาน +15 + multipliers ครบ +0..+15 (16 ค่า)", () => {
    expect(enh.maxLevel).toBe(15);
    expect(enh.multipliers).toHaveLength(16);
  });

  test("ค่าจริงตรง D-054 ทุกระดับ (+5=1.35, +6=1.45, +15=2.80)", () => {
    expect(enh.multipliers).toEqual([
      1.0, 1.05, 1.11, 1.18, 1.26, 1.35, // +0..+5 (§16.3)
      1.45, 1.56, 1.68, 1.81, 1.95, 2.1, 2.26, 2.43, 2.61, 2.8, // +6..+15 (§16.3.1)
    ]);
    expect(enh.multipliers[15]).toBe(2.8); // เพดาน = ×2.80 (power statement)
    expect(enh.multipliers[5]).toBe(1.35);
    expect(enh.multipliers[6]).toBe(1.45);
  });

  test("minimum increase +1 rule + scaled stats (§16.3)", () => {
    expect(enh.minIncreasePerLevel).toBe(1);
    expect(enh.scaledStats).toEqual(["attack", "defense", "maxHp", "breakPower"]);
  });
});

describe("EXP curve (Economy §9)", () => {
  const exp = DEFAULT_ECONOMY_CONFIG.expCurve;

  test("level cap = 10 (§9.1)", () => {
    expect(exp.levelCap).toBe(10);
    expect(exp.levels).toHaveLength(10);
  });

  test("expToNext + cumulative ตรง §9.2 ทุกแถว", () => {
    expect(exp.levels.map((l) => l.expToNext)).toEqual([120, 220, 360, 520, 720, 950, 1200, 1500, 1850, 0]);
    expect(exp.levels.map((l) => l.cumulative)).toEqual([120, 340, 700, 1220, 1940, 2890, 4090, 5590, 7440, 7440]);
  });

  test("cumulative = running sum ของ expToNext (สอดคล้องกันเอง)", () => {
    let running = 0;
    for (const lv of exp.levels) {
      running += lv.expToNext;
      expect(lv.cumulative).toBe(running);
    }
  });

  test("level-diff modifier ตรง §9.3", () => {
    expect(exp.levelDiffModifier).toEqual({
      monsterMinusPlayerAtLeast2: 1.2,
      monsterMinusPlayer1: 1.1,
      monsterMinusPlayer0: 1.0,
      monsterMinusPlayerMinus1: 1.0,
      monsterMinusPlayerMinus2: 0.85,
      monsterMinusPlayerMinus3: 0.7,
      monsterMinusPlayerMinus4: 0.5,
      monsterMinusPlayerAtMostMinus5: 0.2,
    });
    expect(exp.highLevelBonusCap).toBe(1.2);
  });

  test("party EXP ตรง §9.4", () => {
    expect(exp.party).toEqual({
      enabled: true,
      poolMultiplierPerExtraMember: 0.2,
      poolMultiplierCap: 1.6,
      splitAmongEligibleMembers: true,
    });
  });
});

describe("party reward sharing (Economy §10.2/§10.3 — G-lite)", () => {
  const pr = DEFAULT_ECONOMY_CONFIG.partyReward;

  test("share thresholds ตรง spec (§10.2 15% · §10.3 5%)", () => {
    expect(pr.normalMinSharePct).toBe(15); // §10.2 normalEligibility.minimumDamageContributionPercent
    expect(pr.eliteBossMinSharePct).toBe(5); // §10.3 eliteBossEligibility.minimumDamageContributionPercent
  });

  test("rewardRadiusTiles = provisional knob (spec ไม่ระบุค่า — owner ล็อกภายหลัง)", () => {
    expect(pr.rewardRadiusTiles).toBeGreaterThan(0);
    expect(pr.rewardRadiusTiles).toBe(12);
  });
});

describe("player baseline lv1–10 (D-055 §2, production lock)", () => {
  const byLevel = new Map(DEFAULT_ECONOMY_CONFIG.playerBaseline.map((b) => [b.level, b]));

  test("10 แถวครบ lv1–10", () => {
    expect(DEFAULT_ECONOMY_CONFIG.playerBaseline).toHaveLength(10);
  });

  test("ค่าจริงตรง D-055 §2 (lv1=100/12/8, lv5=180/24/14, lv10=280/40/22)", () => {
    expect(byLevel.get(1)).toEqual({ level: 1, hp: 100, atk: 12, def: 8 });
    expect(byLevel.get(5)).toEqual({ level: 5, hp: 180, atk: 24, def: 14 });
    expect(byLevel.get(10)).toEqual({ level: 10, hp: 280, atk: 40, def: 22 });
  });

  test("lv1 primary ตรงกับ engine lv1 baseline (คู่กันตาม D-055)", () => {
    // engine holds only lv1 (src/engine/config/combat.ts player) — must equal this table's lv1.
    expect(byLevel.get(1)).toMatchObject({ hp: 100, atk: 12, def: 8 });
  });
});

describe("milestone Gold (D-053 / Economy §18.3)", () => {
  const byId = new Map(DEFAULT_ECONOMY_CONFIG.milestones.map((m) => [m.milestoneId, m]));

  test("5 แถวที่เคยแจก Kraeng → Gold รวมใหม่ (D-053), items ว่าง (ไม่แจกเสริมแกร่ง)", () => {
    const expected: Record<string, number> = {
      ms_enhancement_ready: 200,
      ach_first_upgrade: 100,
      ms_first_elite: 350,
      ms_map1_complete: 550,
      ms_boss_first_kill: 400,
    };
    for (const [id, gold] of Object.entries(expected)) {
      const m = byId.get(id);
      expect(m, `milestone ${id}`).toBeDefined();
      expect(m!.gold, `${id} gold`).toBe(gold);
      expect(m!.items, `${id} ไม่แจก item เสริมแกร่ง`).toEqual([]);
    }
  });

  test("ไม่มี milestone ไหนแจก upg_reinforcement / upg_kraeng (D-053 kraeng=0)", () => {
    for (const m of DEFAULT_ECONOMY_CONFIG.milestones) {
      for (const it of m.items) {
        expect(it.itemId).not.toMatch(/reinforcement|kraeng/i);
      }
    }
  });

  test("ms_boss_first_kill = P2B; อีก 4 แถว Gold = P2", () => {
    expect(byId.get("ms_boss_first_kill")!.phase).toBe("P2B");
    for (const id of ["ms_enhancement_ready", "ach_first_upgrade", "ms_first_elite", "ms_map1_complete"]) {
      expect(byId.get(id)!.phase).toBe("P2");
    }
  });
});

describe("monster rewards (Economy §10.1 / D-055 §9.1)", () => {
  const byId = new Map(DEFAULT_ECONOMY_CONFIG.monsterRewards.map((m) => [m.monsterId, m]));

  test("monster identity ครบ + EXP/Gold ตรง (5 P2 mobs + Story boss P2B + Field Boss OB)", () => {
    expect(byId.get("mon_map1_slime")).toMatchObject({ level: 1, exp: 14, goldMin: 3, goldMax: 5, respawnSeconds: 8 });
    expect(byId.get("mon_map1_bird")).toMatchObject({ level: 2, exp: 20, goldMin: 5, goldMax: 8 });
    expect(byId.get("mon_map1_boar")).toMatchObject({ level: 4, exp: 30, goldMin: 8, goldMax: 12 });
    expect(byId.get("elite_map1_boar_rampage")).toMatchObject({ level: 5, exp: 140, respawnSeconds: 720 });
    expect(byId.get("boss_map1_resonant_guardian")).toMatchObject({ level: 8, exp: 550, phase: "P2B" });
    // Field Boss หมูป่าหม้อเดือด — ship OB (phase P2 → grant live)
    expect(byId.get("boss_map1_boiling_boar")).toMatchObject({ level: 6, exp: 300, phase: "P2", dropTableId: "drop_map1_field_boss_v1" });
  });
});

describe("drop tables (Economy §11 — Kraeng rows SUPERSEDED → 0%)", () => {
  const tables = DEFAULT_ECONOMY_CONFIG.dropTables;

  test("ไม่มี upg_kraeng/upg_reinforcement/เศษ ในตารางดรอปไหนเลย (B4 §4.2/§3.5 — มาจาก pity path, ไม่ใช่ drop table)", () => {
    const json = JSON.stringify(tables);
    expect(json).not.toMatch(/upg_kraeng/);
    // B4: เสริมแกร่ง (ตัวเต็ม) + เศษ ไม่ได้ดรอปจาก drop table แล้ว — pity ladder (§4.2) + fragment roll (§3.5) ใน
    //     server/economy/reinforcement-pity.ts เป็นแหล่งเดียว (R8 guard กันทั้งสอง id ออกจากทุก generic roll).
    expect(json).not.toMatch(/upg_reinforcement/);
  });

  test("Field Boss table = phase P2 (ship OB) + guaranteed boss core เท่านั้น (B4: ไม่มี guaranteed เสริมแกร่งแล้ว)", () => {
    const fb = tables.find((t) => t.dropTableId === "drop_map1_field_boss_v1")!;
    expect(fb.phase).toBe("P2");
    expect(fb.monsterId).toBe("boss_map1_boiling_boar");
    const guaranteedIds = fb.guaranteed.map((g) => g.itemId);
    expect(guaranteedIds).toEqual(["mat_boss_resonance_core"]); // B4: เสริมแกร่ง ย้ายไป pity path
  });

  test("drop chance ทุก roll อยู่ในช่วง 0–100", () => {
    for (const t of tables) {
      for (const r of t.rolls) {
        expect(r.chancePercent, `${t.dropTableId}/${r.rollId}`).toBeGreaterThanOrEqual(0);
        expect(r.chancePercent).toBeLessThanOrEqual(100);
      }
    }
  });

  test("slime table = material 70% / potion 4% / equipment 18% (§11.2)", () => {
    const slime = tables.find((t) => t.dropTableId === "drop_map1_slime_v1")!;
    expect(slime.rolls.find((r) => r.rollId === "material")).toMatchObject({ itemId: "mat_slime_gel", chancePercent: 70 });
    expect(slime.rolls.find((r) => r.rollId === "equipment")).toMatchObject({ poolId: "common_slime_gear", chancePercent: 18 });
  });

  test("boss table = phase P2B (drop ยังไม่ ship จริงใน P2)", () => {
    expect(tables.find((t) => t.dropTableId === "drop_map1_boss_v1")!.phase).toBe("P2B");
  });

  test("equipment pool weights รวมของ common_slime_gear ตรง §11.2", () => {
    const pool = DEFAULT_ECONOMY_CONFIG.equipmentPools.find((p) => p.poolId === "common_slime_gear")!;
    expect(pool.entries.reduce((s, e) => s + e.weight, 0)).toBe(100);
  });
});

describe("starter shop (Economy §8.2 buy / §7 sell)", () => {
  const shop = DEFAULT_ECONOMY_CONFIG.shop;

  test("6 buy entries ตรง §8.2 (ราคา + itemId)", () => {
    expect(shop.mapId).toBe("city-hub"); // starter district / city hub (§8.1)
    const buy = new Map(shop.entries.map((e) => [e.itemId, e.buyPrice]));
    expect(buy.size).toBe(6);
    expect(buy.get("con_small_potion")).toBe(18);
    expect(buy.get("eq_weapon_training_blade")).toBe(120);
    expect(buy.get("eq_head_cloth_band")).toBe(80);
    expect(buy.get("eq_body_traveler_tunic")).toBe(140);
    expect(buy.get("eq_accessory_plain_cord")).toBe(90);
    expect(buy.get("eq_talisman_blank")).toBe(90);
  });

  test("sell price ตรง §7 (potion 4, blade 24, resonant coat 210)", () => {
    expect(shop.sellPrices.con_small_potion).toBe(4);
    expect(shop.sellPrices.mat_slime_gel).toBe(2);
    expect(shop.sellPrices.eq_weapon_training_blade).toBe(24);
    expect(shop.sellPrices.eq_body_resonant_coat).toBe(210);
    expect(shop.sellPrices.mat_boss_resonance_core).toBe(20);
  });

  test("แกร่ง/เศษ ขายไม่ได้ (§8.3/§14.4 — ไม่มี sell price ใน config)", () => {
    expect(shop.sellPrices.upg_reinforcement).toBeUndefined();
    expect(shop.sellPrices.upg_reinforcement_fragment).toBeUndefined();
    expect(JSON.stringify(shop.sellPrices)).not.toMatch(/kraeng|reinforcement/i);
  });
});

describe("reinforcement / pity / fragment (Reinforcement doc §3.5/§4)", () => {
  const r = DEFAULT_REINFORCEMENT_CONFIG;

  test("canonical ids = upg_reinforcement / upg_reinforcement_fragment (R10 — ห้าม upg_kraeng)", () => {
    expect(r.materialId).toBe("upg_reinforcement");
    expect(r.fragment.materialId).toBe("upg_reinforcement_fragment");
    expect(JSON.stringify(r)).not.toMatch(/upg_kraeng/);
  });

  test("sources: normal/elite 0%, special-elite Map1 0%, boss 8% (§4.4)", () => {
    expect(r.sources).toEqual({
      normalMonsterDropChancePercent: 0,
      normalEliteDropChancePercent: 0,
      specialEliteDropChancePercent: 0,
      mapBossDropChancePercent: 8,
    });
  });

  test("boss pity: base 8 / start after 8 / +4%/clear / การันตีครั้งที่ 15 / reset-on-drop / account-per-boss (§4.2)", () => {
    expect(r.bossPity).toEqual({
      baseDropChancePercent: 8,
      startIncreasingAfterClears: 8,
      increasePerClearPercent: 4,
      guaranteedAtClear: 15,
      resetOnDrop: true,
      scope: "account-per-boss",
    });
  });

  test("pity ตัวอย่าง §4.2: รอบ 9=12%, รอบ 10=16%, รอบ 15=การันตี (คำนวณจาก knob)", () => {
    const { baseDropChancePercent: base, startIncreasingAfterClears: start, increasePerClearPercent: inc } = r.bossPity;
    const chanceAt = (clear: number) => (clear <= start ? base : base + inc * (clear - start));
    expect(chanceAt(8)).toBe(8);
    expect(chanceAt(9)).toBe(12);
    expect(chanceAt(10)).toBe(16);
    // รอบ 15: 8 + 4×7 = 36 (< 100) — การันตีมาจาก guaranteedAtClear ไม่ใช่ chance ถึง 100
    expect(r.bossPity.guaranteedAtClear).toBe(15);
  });

  test("fragment: 10.7% / แลก 5→1 / P2B (§3.5)", () => {
    expect(r.fragment.fragmentDropChancePercent).toBe(10.7);
    expect(r.fragment.exchangeInputCount).toBe(5);
    expect(r.fragment.exchangeOutputCount).toBe(1);
    expect(r.fragment.phase).toBe("P2B");
    expect(r.fragment.source).toBe("map_boss_only");
  });

  test("first kill ไม่การันตี (§4.3) + OB: noReinforcement = false (Field Boss ship live → ระบบเปิด)", () => {
    expect(r.firstKillGuaranteed).toBe(false);
    // OB (2026-07-13): Field Boss หมูป่าหม้อเดือด ship live เป็นแหล่งวัสดุ → ปลุกระบบเสริมแกร่ง (ไม่ inert)
    expect(r.noReinforcement).toBe(false);
    // D-064: pity/fragment ผูกกับ Field Boss หมูป่าหม้อเดือด (id owner-approved 2026-07-13)
    expect(r.bossId).toBe("boss_map1_boiling_boar");
  });
});

// P2-17 — personal storage + delivery box config (Storage §10/§15/§16).
describe("storage config (Storage §10/§15/§16)", () => {
  const s = DEFAULT_STORAGE_CONFIG;

  test("capacity 200 shared + delivery 50 entries (§10.1/§16.3)", () => {
    expect(s.capacity).toBe(200);
    expect(s.deliveryMaxEntries).toBe(50);
  });

  test("fill thresholds 80/90 (§15.1) + expiry warn 7d/urgent 1d (§16.4)", () => {
    expect(s.fill.warnPercent).toBe(80);
    expect(s.fill.alertPercent).toBe(90);
    expect(s.deliveryExpiry.warnDaysBeforeExpiry).toBe(7);
    expect(s.deliveryExpiry.urgentDaysBeforeExpiry).toBe(1);
  });

  test("expiry per source (§16.4): paid/gm/achievement = never; comp/event = 90; market = 30", () => {
    const d = s.deliveryExpiry.daysBySource;
    expect(d.paid_item).toBeNull();
    expect(d.gm_gift).toBeNull();
    expect(d.achievement_reward).toBeNull();
    expect(d.compensation).toBe(90);
    expect(d.event_reward).toBe(90);
    expect(d.market_purchase).toBe(30);
  });

  test("storage NPC reachable in the safe town (§10.4) — city hub, config-driven", () => {
    expect(s.accessMapIds).toContain("city-hub");
  });
});
