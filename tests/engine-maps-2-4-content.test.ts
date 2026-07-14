import { describe, expect, test } from "vitest";
import { DEFAULT_COMBAT_BALANCE_CONFIG } from "@/engine/config";
import { DEFAULT_MOB_CONFIG } from "@/engine/config";
import { getMobNameEntry } from "@/game/mob/name-catalog";

// Batch 5 — Maps 2–4 content locks (MAPS_2_4_ECONOMY_AND_LOOT_SPEC §2/§3): ทุก mobType ที่ map2/3/4.ts spawn
// ต้องมี combat stat + placeholder style + aggro/leash + name-catalog row ครบ (ไม่งั้น fallback default = เพี้ยน).

/** 15 mobType ใหม่ (engine key) เรียงตาม spec §2 identity. */
const MAP2 = ["mushroom_startle", "scarecrow_walker", "greenlight_rat", "talisman_scarecrow", "field_warden"];
const MAP3 = ["gnawing_root", "shadow_monkey", "walking_stone", "mossless_stone", "nameless_warden"];
const MAP4 = ["moonlight_wisp", "dream_mushroom", "shadow_deer", "shattered_moon_deer", "moondark_dryad"];
const ALL = [...MAP2, ...MAP3, ...MAP4];

describe("Maps 2–4 combat stats (combat.ts · spec §3)", () => {
  const mobs = DEFAULT_COMBAT_BALANCE_CONFIG.mobs;

  test("ครบ 15 mobType (ไม่ตกเป็น defaultMob)", () => {
    for (const id of ALL) expect(mobs[id], `combat stat missing: ${id}`).toBeDefined();
  });

  test("ค่า verbatim §3 (spot: bounds ของแต่ละแมพ + boss breakPower/tierReduction)", () => {
    // §3.1 Map 2
    expect(mobs.mushroom_startle).toMatchObject({ hp: 120, atk: 24, def: 14, tierReduction: 1.0, attackCooldown: 2.0 });
    expect(mobs.talisman_scarecrow).toMatchObject({ hp: 1300, atk: 44, def: 30, tierReduction: 0.8 });
    expect(mobs.field_warden).toMatchObject({ hp: 6000, tierReduction: 0.65, breakPower: 100 });
    // §3.2 Map 3
    expect(mobs.gnawing_root).toMatchObject({ hp: 230, atk: 34, def: 26, moveSpeed: 1.6 });
    expect(mobs.nameless_warden).toMatchObject({ hp: 6800, tierReduction: 0.62, breakPower: 110 });
    // §3.3 Map 4
    expect(mobs.shadow_deer).toMatchObject({ hp: 250, atk: 54, def: 40, moveSpeed: 3.8 });
    expect(mobs.moondark_dryad).toMatchObject({ hp: 7800, tierReduction: 0.6, breakPower: 120 });
  });

  test("boss = breakPower>0 (guard gauge); normal/elite = 0", () => {
    for (const id of ["field_warden", "nameless_warden", "moondark_dryad"]) {
      expect(mobs[id].breakPower, id).toBeGreaterThan(0);
    }
    for (const id of ["mushroom_startle", "walking_stone", "talisman_scarecrow", "shattered_moon_deer"]) {
      expect(mobs[id].breakPower, id).toBe(0);
    }
  });
});

describe("Maps 2–4 mob styles + aggro/leash (mob.ts · spec §3)", () => {
  const cfg = DEFAULT_MOB_CONFIG;

  test("style ต่อ mobType ครบ 15 + ยังไม่มี assetId (art = follow-up)", () => {
    for (const id of ALL) {
      const s = cfg.styles[id];
      expect(s, `style missing: ${id}`).toBeDefined();
      expect(s.assetId, `${id} ยังไม่ควรมี assetId (placeholder)`).toBeUndefined();
    }
  });

  test("aggro < leash ต่อ mobType (acquire ก่อน leash-out) ครบ 15", () => {
    for (const id of ALL) {
      const aggro = cfg.ai.aggroRadius[id];
      const leash = cfg.ai.leashRadius[id];
      expect(aggro, `aggro missing: ${id}`).toBeGreaterThan(0);
      expect(leash, `leash missing: ${id}`).toBeGreaterThan(0);
      expect(leash, `${id}: leash ต้อง > aggro`).toBeGreaterThan(aggro);
    }
  });

  test("spot aggro/leash ตรง §3 (field_warden 10/18 · shadow_deer 7/14)", () => {
    expect(cfg.ai.aggroRadius.field_warden).toBe(10);
    expect(cfg.ai.leashRadius.field_warden).toBe(18);
    expect(cfg.ai.aggroRadius.shadow_deer).toBe(7);
    expect(cfg.ai.leashRadius.shadow_deer).toBe(14);
  });
});

describe("Maps 2–4 name catalog (name-catalog.ts · spec §2 ชื่อไทย)", () => {
  test("ครบ 15 row + rank ตรง prefix (normal/elite/boss)", () => {
    const expected: Record<string, { nameTh: string; rank: string }> = {
      mushroom_startle: { nameTh: "เห็ดสะดุ้ง", rank: "normal" },
      talisman_scarecrow: { nameTh: "หุ่นฟางพันยันต์", rank: "elite" },
      field_warden: { nameTh: "หุ่นฟางผู้เฝ้าไร่", rank: "boss" },
      mossless_stone: { nameTh: "หินไร้ตะไคร่", rank: "elite" },
      nameless_warden: { nameTh: "ผู้เฝ้าทางที่ไม่มีชื่อ", rank: "boss" },
      moondark_dryad: { nameTh: "นางไม้จันทร์ดับ", rank: "boss" },
    };
    for (const [id, exp] of Object.entries(expected)) {
      expect(getMobNameEntry(id), id).toEqual(exp);
    }
    for (const id of ALL) expect(getMobNameEntry(id), `name missing: ${id}`).toBeDefined();
  });

  test("elite/boss rank ถูกจัดกลุ่มตรง (5 elite ids? no — 3 elite + 3 boss + 9 normal)", () => {
    const rankOf = (id: string) => getMobNameEntry(id)!.rank;
    expect(["talisman_scarecrow", "mossless_stone", "shattered_moon_deer"].map(rankOf)).toEqual(["elite", "elite", "elite"]);
    expect(["field_warden", "nameless_warden", "moondark_dryad"].map(rankOf)).toEqual(["boss", "boss", "boss"]);
  });
});
