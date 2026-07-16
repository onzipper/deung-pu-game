import { describe, expect, test } from "vitest";
import {
  clampAimToRange,
  clampDisplacementToWalkable,
  isGroundTargetCircle,
  resolveGroundAoeHits,
  resolveSkillHits,
} from "@/game/combat/cast-validation";
import {
  computeSkillDamage,
  moveSpeedBonusFromStatus,
  resolveDamageTakenDebuff,
  type DamageParams,
} from "@/game/combat/formula";
import { applyClassStatWeights } from "@/server/economy/exp";
import { DEFAULT_COMBAT_BALANCE_CONFIG, type PlayerCombatStats, type TileSize } from "@/engine/config";
import type { HitTestTarget } from "@/game/combat/hit-test";
import {
  ARCHER_MOON_RAIN,
  ARCHER_TARGET_MARK,
  ARCHER_SWIFT_STEP,
  ARCHER_BASIC_SHOT,
} from "@/game/skill/data/archer-skills-server";
import { SWORD_GUARD_DOMAIN } from "@/game/skill/data/warrior-skills-server";

// Batch 6 (นักธนู) — server combat geometry ใหม่ (aim-centered ground AoE = never-downgrade, D-023 risk core)
// + mark debuff seam + swift-step displacement + class stat weights. ทุกค่าที่ assert คำนวณจาก spec/สูตร
// (formula.ts §15.2), ไม่ใช่จาก implementation.

const TILE_64x32: TileSize = { width: 64, height: 32 };
const NO_CRIT = (): number => 0.99; // rng > critRate เสมอ → deterministic ไม่ crit

// ── §6 note 1: aim within range validate + beyond-range clamp math ────────────────────────────────────
describe("clampAimToRange (ARCHER §6 note 1)", () => {
  test("aim ในระยะ → คงเดิม", () => {
    expect(clampAimToRange({ tx: 0, ty: 0 }, { tx: 3, ty: 0 }, 6)).toEqual({ tx: 3, ty: 0 });
  });

  test("aim = caster → คงเดิม (ไม่มี ray)", () => {
    expect(clampAimToRange({ tx: 2, ty: 3 }, { tx: 2, ty: 3 }, 6)).toEqual({ tx: 2, ty: 3 });
  });

  test("aim เกินระยะ (แกน x) → clamp เข้าขอบระยะตามทิศเดิม", () => {
    expect(clampAimToRange({ tx: 0, ty: 0 }, { tx: 10, ty: 0 }, 6)).toEqual({ tx: 6, ty: 0 });
  });

  test("aim เกินระยะ (แนวทแยง) → clamp คงทิศ + magnitude = range เป๊ะ", () => {
    const c = clampAimToRange({ tx: 0, ty: 0 }, { tx: 10, ty: 10 }, 6);
    expect(Math.hypot(c.tx, c.ty)).toBeCloseTo(6, 6);
    expect(c.tx).toBeCloseTo(c.ty, 6); // ทิศ 45° คงเดิม
  });

  test("clamp จาก caster ที่ไม่ใช่ origin", () => {
    const c = clampAimToRange({ tx: 5, ty: 5 }, { tx: 5, ty: 20 }, 6);
    expect(c).toEqual({ tx: 5, ty: 11 }); // ขึ้นแกน y 6 ช่องจาก (5,5)
  });
});

// ── §6 note 1: ground-circle hits around AIM not caster + maxTargets nearest-first ────────────────────
describe("resolveGroundAoeHits — รอบจุด aim ไม่ใช่ caster (moon_rain)", () => {
  test("hit มอนรอบ aim; มอนที่ตำแหน่ง caster (ไกล aim) ไม่โดน", () => {
    const aim = { tx: 5, ty: 0 };
    const targets: HitTestTarget[] = [
      { id: "onAim", pos: { tx: 5, ty: 0 } }, // d=0 จาก aim → โดน
      { id: "atCaster", pos: { tx: 0, ty: 0 } }, // d=5 จาก aim > radius 2.5 → ไม่โดน
      { id: "nearAim", pos: { tx: 6, ty: 0 } }, // d=1 จาก aim → โดน
    ];
    const hits = resolveGroundAoeHits(ARCHER_MOON_RAIN, aim, targets, TILE_64x32);
    expect(hits).toEqual(["onAim", "nearAim"]); // nearest-to-aim first, atCaster ตัดออก
  });

  test("นอกรัศมี 2.5 รอบ aim → ไม่โดน", () => {
    const aim = { tx: 0, ty: 0 };
    const targets: HitTestTarget[] = [
      { id: "in", pos: { tx: 2, ty: 0 } }, // d=2 < 2.5
      { id: "out", pos: { tx: 3, ty: 0 } }, // d=3 > 2.5
    ];
    expect(resolveGroundAoeHits(ARCHER_MOON_RAIN, aim, targets, TILE_64x32)).toEqual(["in"]);
  });

  test("maxTargets cap = เลือกใกล้ aim ที่สุด (nearest-first)", () => {
    const aim = { tx: 0, ty: 0 };
    const skill = { ...ARCHER_MOON_RAIN, radius: 5, maxTargets: 2 };
    const targets: HitTestTarget[] = [
      { id: "far", pos: { tx: 3, ty: 0 } }, // d²=9
      { id: "near", pos: { tx: 1, ty: 0 } }, // d²=1
      { id: "mid", pos: { tx: 2, ty: 0 } }, // d²=4
    ];
    expect(resolveGroundAoeHits(skill, aim, targets, TILE_64x32)).toEqual(["near", "mid"]);
  });
});

// ── discriminator: ground-circle vs warrior self-circle (regression) ──────────────────────────────────
describe("isGroundTargetCircle discriminator", () => {
  test("moon_rain (circle + range>0) = ground-target", () => {
    expect(isGroundTargetCircle(ARCHER_MOON_RAIN)).toBe(true);
  });

  test("warrior guard_domain (circle + range 0) = self-centered (ไม่ใช่ ground)", () => {
    expect(isGroundTargetCircle(SWORD_GUARD_DOMAIN)).toBe(false);
  });

  test("archer basic_shot (line) = ไม่ใช่ ground-circle", () => {
    expect(isGroundTargetCircle(ARCHER_BASIC_SHOT)).toBe(false);
  });
});

describe("REGRESSION — warrior guard_domain ยัง caster-centered (S4 guard unchanged)", () => {
  test("resolveSkillHits รอบ caster (radius 3) — มอนติดตัวโดน, มอนไกลไม่โดน", () => {
    const caster = { tx: 0, ty: 0 };
    const targets: HitTestTarget[] = [
      { id: "near", pos: { tx: 2, ty: 0 } }, // d=2 < radius 3 → โดน
      { id: "far", pos: { tx: 5, ty: 0 } }, // d=5 > 3 → ไม่โดน
    ];
    // guard_domain: radius 3, arc 360 (angle null), maxTargets 8 → caster-centered circle เดิม
    expect(resolveSkillHits(SWORD_GUARD_DOMAIN, caster, "S", targets, TILE_64x32)).toEqual(["near"]);
  });
});

// ── §17.6: hitCount loops damage N times (sum matches aggregate) ──────────────────────────────────────
describe("hitCount multi-hit — moon_rain ยิง 3 ชุด (sum = aggregate, §56.4)", () => {
  const params: DamageParams = {
    atk: 28, // นักธนู lv5
    baseMultiplier: ARCHER_MOON_RAIN.baseMultiplier, // 0.9 ต่อ hit
    targetDef: 3,
    penetration: 0,
    k: DEFAULT_COMBAT_BALANCE_CONFIG.k,
    critRate: 0.05,
    critDmg: 0.5,
    bossModifier: 1,
    pvpModifier: 1,
    tierReduction: 1,
  };

  // per-hit exact ตามสูตร §15.2 (คำนวณอิสระจาก implementation): ATK × mult × k/(k+DEF)
  const perHitExact = 28 * 0.9 * (50 / (50 + 3));

  test("subHits ยาว = hitCount 3 และ sum = damage เป๊ะ (never-downgrade rounding)", () => {
    const r = computeSkillDamage(params, ARCHER_MOON_RAIN.hitCount, NO_CRIT);
    expect(r.subHits.length).toBe(3);
    expect(r.subHits.reduce((a, b) => a + b, 0)).toBe(r.damage);
    expect(r.damage).toBeGreaterThan(0);
  });

  test("aggregate = round(hitCount × per-hit exact) — ปัดยอดรวมครั้งเดียว (§15.7.1)", () => {
    const single = computeSkillDamage({ ...params }, 1, NO_CRIT);
    const triple = computeSkillDamage({ ...params }, 3, NO_CRIT);
    expect(single.damage).toBe(Math.round(perHitExact));
    expect(triple.damage).toBe(Math.round(perHitExact * 3)); // ≠ 3×single (ปัดต่างจากปัดรายตัว)
  });
});

// ── §3 S3: mark debuff — applies (×multiplier) / expires / re-cast refresh not stack ──────────────────
describe("mark debuff seam (ARCHER §3 S3 archer_target_mark)", () => {
  test("resolveDamageTakenDebuff: มี tra → คืน {multiplier, durationSeconds} จาก config", () => {
    const table = DEFAULT_COMBAT_BALANCE_CONFIG.statusEffectDamageTakenMultiplier;
    expect(resolveDamageTakenDebuff(ARCHER_TARGET_MARK.statusEffects, table)).toEqual({
      multiplier: 1.15,
      durationSeconds: 6,
    });
  });

  test("resolveDamageTakenDebuff: ไม่มี status / null → null", () => {
    const table = DEFAULT_COMBAT_BALANCE_CONFIG.statusEffectDamageTakenMultiplier;
    expect(resolveDamageTakenDebuff(null, table)).toBeNull();
    expect(resolveDamageTakenDebuff(["unknown_effect"], table)).toBeNull();
  });

  test("damageTakenMultiplier 1.15 ในสูตร → ดาเมจมากกว่าไม่มีตรา (~+15%)", () => {
    const base: DamageParams = {
      atk: 28, baseMultiplier: 1.0, targetDef: 3, penetration: 0,
      k: 50, critRate: 0.05, critDmg: 0.5, bossModifier: 1, pvpModifier: 1, tierReduction: 1,
    };
    const unmarked = computeSkillDamage(base, 1, NO_CRIT).damage;
    const marked = computeSkillDamage({ ...base, damageTakenMultiplier: 1.15 }, 1, NO_CRIT).damage;
    expect(marked).toBeGreaterThan(unmarked);
    expect(marked / unmarked).toBeCloseTo(1.15, 1);
  });

  test("re-cast = refresh ไม่สแต็ก (โมเดล Map overwrite: multiplier คงที่ 1.15 ไม่ทวี)", () => {
    // จำลอง markDebuffs Map: set ซ้ำ = overwrite (ไม่บวก). ยืนยัน semantics ที่ MapRoom ใช้.
    const marks = new Map<string, { multiplier: number; until: number }>();
    const entry = resolveDamageTakenDebuff(
      ARCHER_TARGET_MARK.statusEffects,
      DEFAULT_COMBAT_BALANCE_CONFIG.statusEffectDamageTakenMultiplier,
    )!;
    marks.set("mob1", { multiplier: entry.multiplier, until: 1000 + entry.durationSeconds * 1000 });
    marks.set("mob1", { multiplier: entry.multiplier, until: 5000 + entry.durationSeconds * 1000 }); // re-cast
    expect(marks.get("mob1")!.multiplier).toBe(1.15); // ไม่กลายเป็น 1.30
    expect(marks.get("mob1")!.until).toBe(11000); // until = refresh ล่าสุด
    expect(marks.size).toBe(1);
  });
});

// ── §3 S4: swift-step displacement walkable/blocked clamp + moveSpeed buff resolve ────────────────────
describe("swift-step displacement (ARCHER §3 S4 archer_swift_step)", () => {
  test("เดินได้ตลอด → เผ่นเต็ม dashTiles ตามทิศ", () => {
    const dest = clampDisplacementToWalkable({ tx: 5, ty: 5 }, { tx: -1, ty: 0 }, 2.5, () => true);
    expect(dest.tx).toBeCloseTo(2.5, 6);
    expect(dest.ty).toBeCloseTo(5, 6);
  });

  test("ชนกำแพงกลางทาง → เผ่นเท่าที่เดินได้ (clamp ที่ขอบกำแพง)", () => {
    // เดินได้เฉพาะ tx ≥ 4 → เผ่นจาก (5,5) ทิศตะวันตกได้ถึง 4.0 (ก่อน 3.75 ที่บล็อก)
    const dest = clampDisplacementToWalkable({ tx: 5, ty: 5 }, { tx: -1, ty: 0 }, 2.5, (tx) => tx >= 4);
    expect(dest.tx).toBeCloseTo(4, 6);
    expect(dest.ty).toBeCloseTo(5, 6);
  });

  test("ติดกำแพงตั้งแต่ก้าวแรก → เผ่น 0 (คงตำแหน่งเดิม)", () => {
    const dest = clampDisplacementToWalkable({ tx: 5, ty: 5 }, { tx: -1, ty: 0 }, 2.5, () => false);
    expect(dest).toEqual({ tx: 5, ty: 5 });
  });

  test("moveSpeedBonusFromStatus: swift_step_speed_20 → 0.20 จาก config; ไม่มี → 0", () => {
    const table = DEFAULT_COMBAT_BALANCE_CONFIG.statusEffectMoveSpeedBonus;
    expect(moveSpeedBonusFromStatus(ARCHER_SWIFT_STEP.statusEffects, table)).toBeCloseTo(0.2, 6);
    expect(moveSpeedBonusFromStatus(null, table)).toBe(0);
    expect(moveSpeedBonusFromStatus(["self_damage_reduction_30"], table)).toBe(0); // guard_domain status ไม่ match
  });

  test("swiftStepDashTiles = 2.5 (config knob)", () => {
    expect(DEFAULT_COMBAT_BALANCE_CONFIG.swiftStepDashTiles).toBe(2.5);
  });
});

// ── §2: class stat weights math (ATK×1.15 / HP×0.85 / DEF×0.90, ปัด integer) ──────────────────────────
describe("applyClassStatWeights (ARCHER §2 — ตรงตาราง anchor)", () => {
  const secondary = { critRate: 0.05, critDmg: 0.5, penetration: 0 };
  const archer = DEFAULT_COMBAT_BALANCE_CONFIG.classStatWeights.archer;
  const swordsman = DEFAULT_COMBAT_BALANCE_CONFIG.classStatWeights.swordsman;
  const lv1: PlayerCombatStats = { hp: 100, atk: 12, def: 8, ...secondary }; // D-055 นักดาบ lv1
  const lv5: PlayerCombatStats = { hp: 180, atk: 24, def: 14, ...secondary }; // D-055 นักดาบ lv5

  test("นักธนู lv1 = 14/85/7 (ปัด Math.round ตรงตาราง §2)", () => {
    const w = applyClassStatWeights(lv1, archer);
    expect({ atk: w.atk, hp: w.hp, def: w.def }).toEqual({ atk: 14, hp: 85, def: 7 });
  });

  test("นักธนู lv5 = 28/153/13 (ตรงตาราง §2)", () => {
    const w = applyClassStatWeights(lv5, archer);
    expect({ atk: w.atk, hp: w.hp, def: w.def }).toEqual({ atk: 28, hp: 153, def: 13 });
  });

  test("นักดาบ weights 1.0 → baseline เดิมเป๊ะ (ไม่เปลี่ยน)", () => {
    expect(applyClassStatWeights(lv5, swordsman)).toEqual(lv5);
  });

  test("secondary (crit/critDmg/penetration) คงเดิม (level/class-invariant §15.3)", () => {
    const w = applyClassStatWeights(lv1, archer);
    expect({ critRate: w.critRate, critDmg: w.critDmg, penetration: w.penetration }).toEqual(secondary);
  });
});
