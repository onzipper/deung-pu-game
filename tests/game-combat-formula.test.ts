import { describe, expect, test } from "vitest";
import {
  computeDamage,
  computeSkillDamage,
  effectiveDef,
  mitigationFactor,
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

describe("computeSkillDamage (hitCount aggregate)", () => {
  test("hitCount 1 = computeDamage เดี่ยว", () => {
    const p = params({ atk: 12, baseMultiplier: 2.2, targetDef: 4 });
    expect(computeSkillDamage(p, 1, NO_CRIT)).toEqual({ damage: 24, crit: false });
  });

  test("hitCount 3 (archer 0.9/hit) → รวม 3 hit", () => {
    // per hit: 100 × 0.9 × 1.0 = 90 → รวม 270
    const r = computeSkillDamage(params({ baseMultiplier: 0.9 }), 3, NO_CRIT);
    expect(r.damage).toBe(270);
    expect(r.crit).toBe(false);
  });

  test("multi-hit: crit = true ถ้ามี sub-hit ใด crit", () => {
    // critRate 0.5: roll [0.9(no), 0.1(yes), 0.9(no)] → มี crit
    const r = computeSkillDamage(
      params({ baseMultiplier: 1, critRate: 0.5, critDmg: 0.5 }),
      3,
      seqRng([0.9, 0.1, 0.9]),
    );
    expect(r.crit).toBe(true);
    expect(r.damage).toBe(100 + 150 + 100); // hit2 crit ×1.5
  });

  test("hitCount 0 (utility) → 0 damage", () => {
    expect(computeSkillDamage(params(), 0, NO_CRIT)).toEqual({ damage: 0, crit: false });
  });
});
