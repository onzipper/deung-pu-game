import { describe, expect, test } from "vitest";
import {
  applyDamageToPlayer,
  computeDamage,
  computeMobDamageToPlayer,
  computeSkillDamage,
  effectiveDef,
  mitigationFactor,
  respawnPlayer,
  type DamageParams,
} from "@/game/combat/formula";
import type { RngFn } from "@/game/mob/rng";

/** rng คงที่ (คุม crit path ตรง ๆ) — 0.99 = ไม่ crit (โอกาส < 1), 0 = crit เสมอ (โอกาส > 0). */
const NO_CRIT: RngFn = () => 0.99;
const ALWAYS_CRIT: RngFn = () => 0;
/** rng ไล่ตาม sequence (ทดสอบ multi-hit crit บางตัว). */
function seqRng(values: number[]): RngFn {
  let i = 0;
  return () => values[i++ % values.length];
}

/** base params (k=50, ไม่มี modifier/crit) — override ต่อเคส. */
function params(over: Partial<DamageParams> = {}): DamageParams {
  return {
    atk: 100,
    baseMultiplier: 1,
    targetDef: 0,
    penetration: 0,
    k: 50,
    critRate: 0, // default = ไม่ crit
    critDmg: 0.5,
    bossModifier: 1,
    pvpModifier: 1,
    tierReduction: 1,
    ...over,
  };
}

describe("effectiveDef (§15.2)", () => {
  test("DEF − Penetration", () => {
    expect(effectiveDef(20, 8)).toBe(12);
  });
  test("Penetration ≥ DEF → 0 (ไม่ติดลบ)", () => {
    expect(effectiveDef(8, 20)).toBe(0);
    expect(effectiveDef(0, 0)).toBe(0);
  });
});

describe("mitigationFactor k/(k+DEF) (§15.2)", () => {
  test("DEF = 0 → factor 1.0 (damage เต็ม)", () => {
    expect(mitigationFactor(50, 0)).toBe(1);
  });
  test("DEF = k → factor 0.5 พอดี (anchor proposal §1.2)", () => {
    expect(mitigationFactor(50, 50)).toBeCloseTo(0.5, 10);
    expect(mitigationFactor(80, 80)).toBeCloseTo(0.5, 10);
  });
  test("ตาราง proposal §1.3 (k=50): DEF 4→0.926, 10→0.833, 25→0.667", () => {
    expect(mitigationFactor(50, 4)).toBeCloseTo(0.9259, 3);
    expect(mitigationFactor(50, 10)).toBeCloseTo(0.8333, 3);
    expect(mitigationFactor(50, 25)).toBeCloseTo(0.6667, 3);
  });
  test("guard divide-by-zero: k=0 & DEF=0 → 1 (ไม่ NaN)", () => {
    expect(mitigationFactor(0, 0)).toBe(1);
    expect(Number.isNaN(mitigationFactor(0, 0))).toBe(false);
  });
});

describe("computeDamage (§15.2 core)", () => {
  test("DEF = k → damage ครึ่งหนึ่ง", () => {
    const r = computeDamage(params({ targetDef: 50 }), NO_CRIT);
    expect(r.damage).toBe(50); // 100 × 1 × 0.5
    expect(r.crit).toBe(false);
  });

  test("DEF = 0 → damage เต็ม", () => {
    expect(computeDamage(params(), NO_CRIT).damage).toBe(100);
  });

  test("Penetration ลด effective_DEF (def 20, pen 8 → factor 50/62)", () => {
    const r = computeDamage(params({ targetDef: 20, penetration: 8 }), NO_CRIT);
    expect(r.damage).toBe(Math.round(100 * (50 / 62))); // 81
  });

  test("Penetration ≥ DEF → damage เต็ม (effective_DEF floor 0)", () => {
    expect(computeDamage(params({ targetDef: 8, penetration: 30 }), NO_CRIT).damage).toBe(100);
  });

  test("crit: roll < critRate → × (1 + critDmg)", () => {
    const r = computeDamage(params({ critRate: 1, critDmg: 0.5 }), ALWAYS_CRIT);
    expect(r.crit).toBe(true);
    expect(r.damage).toBe(150); // 100 × 1.5
  });

  test("ไม่ crit เมื่อ roll ≥ critRate", () => {
    const r = computeDamage(params({ critRate: 0.05 }), () => 0.5);
    expect(r.crit).toBe(false);
    expect(r.damage).toBe(100);
  });

  test("bossModifier / pvpModifier / tierReduction คูณเข้าไป (§15.5)", () => {
    // 100 × 0.5(boss) × 2(pvp) × 0.8(tier) = 80
    const r = computeDamage(
      params({ bossModifier: 0.5, pvpModifier: 2, tierReduction: 0.8 }),
      NO_CRIT,
    );
    expect(r.damage).toBe(80);
  });

  test("ไม่มีวันติดลบ (atk 0 → 0; DEF สูงมาก → ≥ 0)", () => {
    expect(computeDamage(params({ atk: 0 }), NO_CRIT).damage).toBe(0);
    expect(computeDamage(params({ targetDef: 100000 }), NO_CRIT).damage).toBeGreaterThanOrEqual(0);
  });

  test("hand-calc proposal §1.4: นักดาบ atk12 × คลื่นดาบ 2.2 vs ดึ๋งปุ๊ DEF4 = 24", () => {
    const r = computeDamage(params({ atk: 12, baseMultiplier: 2.2, targetDef: 4 }), NO_CRIT);
    expect(r.damage).toBe(24); // 12 × 2.2 × 0.9259 = 24.44 → 24
  });

  test("hand-calc proposal §1.4: vs หมูพอง DEF10 = 22", () => {
    const r = computeDamage(params({ atk: 12, baseMultiplier: 2.2, targetDef: 10 }), NO_CRIT);
    expect(r.damage).toBe(22); // 12 × 2.2 × 0.8333 = 22.0
  });
});

describe("computeSkillDamage (multi-hit rounding §50.1.1 ข้อ 2 / TA §15.7.1 ข้อ 3)", () => {
  // อัลกอริทึม (Bible 1.8): exact ทุก sub-hit (ไม่ปัดรายตัว) → รวม exact total → round ครั้งเดียว
  // = authoritative → กระจาย integer กลับต่อ sub-hit (largest-remainder, tie-break hit index).

  test("hitCount 1 = computeDamage เดี่ยว (ปัดครั้งเดียวอยู่แล้ว → ผลไม่เปลี่ยน)", () => {
    const p = params({ atk: 12, baseMultiplier: 2.2, targetDef: 4 });
    expect(computeSkillDamage(p, 1, NO_CRIT)).toEqual({ damage: 24, crit: false, subHits: [24] });
  });

  test("hitCount 3 (archer 0.9/hit) → รวม 3 hit (สัดส่วนลงตัว)", () => {
    // per hit exact: 100 × 0.9 × 1.0 = 90 → total 270 → round 270 → กระจาย [90,90,90]
    const r = computeSkillDamage(params({ baseMultiplier: 0.9 }), 3, NO_CRIT);
    expect(r.damage).toBe(270);
    expect(r.crit).toBe(false);
    expect(r.subHits).toEqual([90, 90, 90]);
  });

  test("multi-hit: crit = true ถ้ามี sub-hit ใด crit; ปัดยอดรวมครั้งเดียว", () => {
    // critRate 0.5: roll [0.9(no), 0.1(yes), 0.9(no)] → hit2 crit ×1.5; exact 100/150/100 → total 350
    const r = computeSkillDamage(
      params({ baseMultiplier: 1, critRate: 0.5, critDmg: 0.5 }),
      3,
      seqRng([0.9, 0.1, 0.9]),
    );
    expect(r.crit).toBe(true);
    expect(r.damage).toBe(350);
    expect(r.subHits).toEqual([100, 150, 100]);
  });

  test("hitCount 0 (utility) → 0 damage, subHits ว่าง", () => {
    expect(computeSkillDamage(params(), 0, NO_CRIT)).toEqual({
      damage: 0,
      crit: false,
      subHits: [],
    });
  });

  test("สัดส่วนไม่ลงตัว: round ยอดรวมครั้งเดียว ≠ ผลรวมของการปัดรายตัว (กัน bias เศษซ้ำ)", () => {
    // per hit exact: 100 × 1 × (50/54) = 92.5925… ; hitCount 3
    // ปัดรายตัว (แบบเดิม): round(92.59)=93 ×3 = 279 (bias สูงเกิน)
    // อัลกอริทึมใหม่: total 277.777… → round ครั้งเดียว = 278 (ตรง HP จริง)
    const r = computeSkillDamage(params({ targetDef: 4 }), 3, NO_CRIT);
    expect(r.damage).toBe(278);
    // largest-remainder: ideal 92.6667 ต่อ hit (frac 0.6667 เท่ากัน) → +1 ให้ idx 0,1 → [93,93,92]
    expect(r.subHits).toEqual([93, 93, 92]);
    expect(r.subHits.reduce((a, b) => a + b, 0)).toBe(r.damage);
  });

  test("deterministic: input เดิม (rng เดิม) → output เดิมทุก field", () => {
    const p = params({ targetDef: 7, baseMultiplier: 1.3, critRate: 0.5, critDmg: 0.5 });
    const a = computeSkillDamage(p, 5, seqRng([0.1, 0.9, 0.1, 0.9, 0.9]));
    const b = computeSkillDamage(p, 5, seqRng([0.1, 0.9, 0.1, 0.9, 0.9]));
    expect(a).toEqual(b);
  });

  test("damage ไม่ติดลบ + subHits ทุกช่อง ≥ 0 (atk 0 → ทุกช่อง 0)", () => {
    const r = computeSkillDamage(params({ atk: 0 }), 4, NO_CRIT);
    expect(r.damage).toBe(0);
    expect(r.subHits).toEqual([0, 0, 0, 0]);
    expect(r.subHits.every((d) => d >= 0)).toBe(true);
  });

  // property-style: invariants ต้องเป็นจริงทุก combo (§50.1.1 — never-downgrade combat calc)
  describe("invariants ครอบหลาย hitCount × สัดส่วนไม่ลงตัว × crit ผสม", () => {
    const cases: { name: string; p: Partial<DamageParams>; hitCount: number; rng: RngFn }[] = [];
    const bases: Partial<DamageParams>[] = [
      { targetDef: 4 }, // factor 50/54
      { targetDef: 7, baseMultiplier: 1.3 }, // เศษหนัก
      { targetDef: 13, baseMultiplier: 0.7, atk: 137 }, // เลขไม่กลม
      { targetDef: 25, penetration: 3, atk: 88, baseMultiplier: 2.2 },
    ];
    const critRngs: { name: string; rng: () => RngFn }[] = [
      { name: "no-crit", rng: () => NO_CRIT },
      { name: "all-crit", rng: () => ALWAYS_CRIT },
      { name: "mixed-crit", rng: () => seqRng([0.1, 0.9, 0.9, 0.1, 0.9, 0.1, 0.9]) },
    ];
    for (const b of bases) {
      for (const c of critRngs) {
        for (const hitCount of [2, 3, 5, 7]) {
          cases.push({
            name: `${JSON.stringify(b)} × ${c.name} × hit${hitCount}`,
            p: { ...b, critRate: c.name === "no-crit" ? 0 : 0.5, critDmg: 0.5 },
            hitCount,
            rng: c.rng(),
          });
        }
      }
    }

    for (const tc of cases) {
      test(tc.name, () => {
        const r = computeSkillDamage(params(tc.p), tc.hitCount, tc.rng);
        // 1. sum(subHits) === damage เสมอ (ไม่มี drift)
        expect(r.subHits.reduce((a, b) => a + b, 0)).toBe(r.damage);
        // 2. subHits ยาว = hitCount, ทุกช่อง integer ≥ 0
        expect(r.subHits).toHaveLength(tc.hitCount);
        for (const d of r.subHits) {
          expect(Number.isInteger(d)).toBe(true);
          expect(d).toBeGreaterThanOrEqual(0);
        }
        // 3. damage เป็น integer ≥ 0
        expect(Number.isInteger(r.damage)).toBe(true);
        expect(r.damage).toBeGreaterThanOrEqual(0);
        // 4. deterministic: รันซ้ำด้วย rng ใหม่ชุดเดิม → เท่ากันทุก field
        const rng2 = tc.rng === NO_CRIT || tc.rng === ALWAYS_CRIT ? tc.rng : undefined;
        if (rng2) {
          expect(computeSkillDamage(params(tc.p), tc.hitCount, rng2)).toEqual(r);
        }
      });
    }
  });
});

describe("computeMobDamageToPlayer (A1, COMBAT_BIBLE §2 / P1_BALANCE §2.2)", () => {
  test("doc example: slime ATK6 vs DEF14, k50 → 5 (§2.2 `mobATK × 1.0 × k/(k+DEF)`)", () => {
    // 6 × 1.0 × (50/64) = 4.6875 → round 5
    expect(computeMobDamageToPlayer({ mobAtk: 6, playerDef: 14, k: 50 })).toBe(5);
  });

  test("playerDEF 0 → factor 1 → damage = mobATK", () => {
    expect(computeMobDamageToPlayer({ mobAtk: 6, playerDef: 0, k: 50 })).toBe(6);
  });

  test("NO tierReduction บนขาออก (§15.5 ใช้เฉพาะ player→mob): boss atk28 vs DEF22, k50 → 19", () => {
    // 28 × 1.0 × (50/72) = 19.44… → round 19 (บอสตีแรงเพราะ ATK สูง ไม่ใช่เพราะ tier)
    expect(computeMobDamageToPlayer({ mobAtk: 28, playerDef: 22, k: 50 })).toBe(19);
  });

  test("ไม่ติดลบ + clamp DEF ลบ (defensive)", () => {
    expect(computeMobDamageToPlayer({ mobAtk: 0, playerDef: 10, k: 50 })).toBe(0);
    expect(computeMobDamageToPlayer({ mobAtk: 6, playerDef: -5, k: 50 })).toBeGreaterThanOrEqual(0);
  });
});

describe("applyDamageToPlayer + respawnPlayer — Death & Recovery (A2, COMBAT_BIBLE §10)", () => {
  test("หัก hp ปกติ → dead=false", () => {
    expect(applyDamageToPlayer(10, 3)).toEqual({ hp: 7, dead: false });
  });

  test("hp ถึง 0 → dead=true (mark dead)", () => {
    expect(applyDamageToPlayer(5, 5)).toEqual({ hp: 0, dead: true });
  });

  test("damage เกิน hp → clamp 0, dead=true (ไม่ติดลบ)", () => {
    expect(applyDamageToPlayer(5, 99)).toEqual({ hp: 0, dead: true });
  });

  test("damage 0 → hp คงเดิม, dead=false", () => {
    expect(applyDamageToPlayer(10, 0)).toEqual({ hp: 10, dead: false });
  });

  test("respawn: safe camp + เต็ม hp + เคลียร์ death", () => {
    expect(respawnPlayer({ tx: 3, ty: 4 }, 100)).toEqual({
      pos: { tx: 3, ty: 4 },
      hp: 100,
      dead: false,
    });
  });

  test("respawn idempotent (เรียกซ้ำได้ผลเดิม)", () => {
    const a = respawnPlayer({ tx: 12, ty: 8 }, 260);
    const b = respawnPlayer(a.pos, 260);
    expect(b).toEqual(a);
  });

  test("respawn คืนเฉพาะ pos/hp/dead — **ไม่มี** field inventory/gold (no item loss baseline §10)", () => {
    const r = respawnPlayer({ tx: 1, ty: 1 }, 100);
    expect(Object.keys(r).sort()).toEqual(["dead", "hp", "pos"]);
  });
});
