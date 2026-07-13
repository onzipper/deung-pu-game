import { describe, expect, test } from "vitest";
import {
  isAimInRange,
  isSkillReady,
  resolveSkillHits,
  skillAttackShape,
  skillReadyAt,
  validateCast,
} from "@/game/combat/cast-validation";
import type { HitTestTarget } from "@/game/combat/hit-test";
import type { SkillDefinition } from "@/game/skill/types";
import type { TileSize } from "@/engine/config";

const TILE_64x32: TileSize = { width: 64, height: 32 };

/** SkillDefinition ครบ 37 field (ค่ากลาง ๆ) — override ต่อเคส. */
function makeSkill(over: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    skillId: "test_skill",
    skillName: "ทดสอบ",
    class: "swordsman",
    branch: null,
    tier: 1,
    unlockLevel: 1,
    role: "test",
    description: "test",
    targetType: "enemy",
    targetShape: "circle",
    range: 5,
    radius: 5,
    angle: null,
    maxTargets: 6,
    hitCount: 1,
    damageType: "physical",
    baseMultiplier: 1,
    scalingStat: "ATK",
    cooldown: 4,
    castTime: 0,
    activeTime: 0,
    recoveryTime: 0,
    resourceCost: 0,
    statusEffects: null,
    crowdControl: null,
    bossModifier: 1,
    pvpModifier: 1,
    comboTags: [],
    animationCue: "cue",
    vfxCue: "cue",
    sfxCue: "cue",
    damageNumberProfile: "standard",
    screenShakeLevel: 0,
    hitStopLevel: 0,
    botUsageRule: "test",
    serverAuthority: true,
    performanceBudget: "low",
    ...over,
  };
}

describe("cooldown (server clock, §16.3)", () => {
  test("isSkillReady: undefined (ยังไม่เคยใช้) → พร้อม", () => {
    expect(isSkillReady(undefined, 1000)).toBe(true);
  });
  test("isSkillReady: now ≥ readyAt → พร้อม; now < readyAt → ยัง", () => {
    expect(isSkillReady(1000, 1000)).toBe(true);
    expect(isSkillReady(1000, 1500)).toBe(true);
    expect(isSkillReady(2000, 1500)).toBe(false);
  });
  test("skillReadyAt: now + cooldown(วิ)×1000", () => {
    expect(skillReadyAt(1000, 4)).toBe(5000);
  });
});

describe("range check (§16.3)", () => {
  test("aim ในระยะ (range × tolerance) → ผ่าน", () => {
    // range 3 × 1.5 = 4.5 → aim d=4 ผ่าน
    expect(isAimInRange({ tx: 0, ty: 0 }, { tx: 4, ty: 0 }, 3, 1.5)).toBe(true);
  });
  test("aim เกินระยะ → ไม่ผ่าน", () => {
    expect(isAimInRange({ tx: 0, ty: 0 }, { tx: 5, ty: 0 }, 3, 1.5)).toBe(false);
  });
  test("aim = ตำแหน่ง caster → ผ่านเสมอ", () => {
    expect(isAimInRange({ tx: 2, ty: 3 }, { tx: 2, ty: 3 }, 1, 1)).toBe(true);
  });
});

describe("skillAttackShape (map §50.1 → geometry)", () => {
  test("cone/arc: radius = range, arc = angle", () => {
    const s = skillAttackShape(makeSkill({ targetShape: "cone", range: 3.5, angle: 90, radius: null }));
    expect(s).toEqual({ radius: 3.5, arcDegrees: 90 });
  });
  test("circle: radius = radius, arc = 360 (angle null)", () => {
    const s = skillAttackShape(makeSkill({ targetShape: "circle", radius: 3, angle: null, range: 0 }));
    expect(s).toEqual({ radius: 3, arcDegrees: 360 });
  });
  test("radius null → ใช้ range", () => {
    const s = skillAttackShape(makeSkill({ radius: null, range: 1.2, angle: 60 }));
    expect(s.radius).toBe(1.2);
  });
});

describe("resolveSkillHits — maxTargets cap (§18.4)", () => {
  const caster = { tx: 0, ty: 0 };
  // circle รอบตัว (arc 360) → ตัด arc ออก, เหลือ radius check ล้วน
  const targets: HitTestTarget[] = [
    { id: "far", pos: { tx: 3, ty: 0 } }, // d=9
    { id: "near", pos: { tx: 1, ty: 0 } }, // d=1
    { id: "mid", pos: { tx: 2, ty: 0 } }, // d=4
  ];

  test("โดนทุกตัวในรัศมีเมื่อ ≤ maxTargets (เรียงใกล้→ไกล)", () => {
    const skill = makeSkill({ targetShape: "circle", radius: 5, angle: null, maxTargets: 6 });
    expect(resolveSkillHits(skill, caster, "S", targets, TILE_64x32)).toEqual(["near", "mid", "far"]);
  });

  test("cap = maxTargets เลือก 'ใกล้ที่สุด'", () => {
    const skill = makeSkill({ targetShape: "circle", radius: 5, angle: null, maxTargets: 2 });
    expect(resolveSkillHits(skill, caster, "S", targets, TILE_64x32)).toEqual(["near", "mid"]);
  });

  test("นอกรัศมี → ไม่โดน", () => {
    const skill = makeSkill({ targetShape: "circle", radius: 1.5, angle: null, maxTargets: 6 });
    // radius 1.5 → เฉพาะ near (d=1 < 2.25); mid (d=4) / far (d=9) เกิน
    expect(resolveSkillHits(skill, caster, "S", targets, TILE_64x32)).toEqual(["near"]);
  });

  test("P1-05.1: hitTolerance ส่งต่อเข้า findHits — point-blank ทำให้มอนหลังผู้เล่นโดน (arc melee)", () => {
    // สกิล cone แคบ (arc 60°) หันขึ้น (N); มอนอยู่ตรงข้ามเป๊ะ (S บนจอ = หลัง) แต่ในระยะ radius 1.2
    const skill = makeSkill({ targetShape: "arc", radius: 1.2, angle: 60, maxTargets: 6 });
    // tile (0.5,0.5) → screen (0,+16) = ทิศ S บนจอ (หลัง N พอดี 180°); d=0.707 < radius 1.2
    const behind: HitTestTarget[] = [{ id: "behind", pos: { tx: 0.5, ty: 0.5 } }];
    // ไม่มี tolerance → พลาด (หลัง arc)
    expect(resolveSkillHits(skill, caster, "N", behind, TILE_64x32)).toEqual([]);
    // มี point-blank 1.5 (> d) → โดน (มอนติดตัว, arc ไม่มีผลในระยะประชิด)
    const tol = { rangePaddingTiles: 0, arcPaddingDegrees: 0, pointBlankRadiusTiles: 1.5 };
    expect(resolveSkillHits(skill, caster, "N", behind, TILE_64x32, tol)).toEqual(["behind"]);
  });
});

describe("validateCast (composite, §16.2/§16.3)", () => {
  const base = {
    playerLevel: 99, // A3: สูงพอให้ผ่าน unlock ทุก skill (เทสต์เดิมไม่เกี่ยวกับ locked)
    readyAtMs: undefined,
    nowMs: 1000,
    casterPos: { tx: 0, ty: 0 },
    aimPos: { tx: 1, ty: 0 },
    rangeToleranceFactor: 1.5,
  };

  test("skill undefined (skillId มั่ว) → unknown_skill", () => {
    expect(validateCast({ ...base, skill: undefined })).toEqual({
      ok: false,
      reason: "unknown_skill",
    });
  });

  test("cooldown ยังไม่ครบ → cooldown", () => {
    expect(
      validateCast({ ...base, skill: makeSkill(), readyAtMs: 2000, nowMs: 1500 }),
    ).toEqual({ ok: false, reason: "cooldown" });
  });

  test("aim ไกลผิดปกติ → out_of_range", () => {
    expect(
      validateCast({ ...base, skill: makeSkill({ range: 2 }), aimPos: { tx: 10, ty: 0 } }),
    ).toEqual({ ok: false, reason: "out_of_range" });
  });

  test("ครบเงื่อนไข → ok", () => {
    expect(validateCast({ ...base, skill: makeSkill() })).toEqual({ ok: true });
  });

  test("A3: playerLevel < unlockLevel → locked", () => {
    expect(
      validateCast({ ...base, skill: makeSkill({ unlockLevel: 5 }), playerLevel: 3 }),
    ).toEqual({ ok: false, reason: "locked" });
  });

  test("A3: playerLevel = unlockLevel พอดี → ผ่าน (ok)", () => {
    expect(
      validateCast({ ...base, skill: makeSkill({ unlockLevel: 5 }), playerLevel: 5 }),
    ).toEqual({ ok: true });
  });

  test("A3: self-target skill (S4, range 0) ข้าม range check — aim ไกลก็ ok (ไม่ out_of_range)", () => {
    expect(
      validateCast({
        ...base,
        skill: makeSkill({ targetType: "self", range: 0, radius: 3 }),
        aimPos: { tx: 9, ty: 9 }, // ไกลจาก caster (0,0) มาก — enemy skill จะ out_of_range แต่ self ข้าม
      }),
    ).toEqual({ ok: true });
  });

  test("A3: ลำดับ locked มาก่อน cooldown/range (ยังไม่ปลด สำคัญกว่า timing)", () => {
    // unlockLevel 5 > playerLevel 1 + cooldown ยังไม่ครบ + aim ไกล → เห็น locked ก่อน
    expect(
      validateCast({
        ...base,
        skill: makeSkill({ unlockLevel: 5, range: 2 }),
        playerLevel: 1,
        readyAtMs: 9999,
        nowMs: 0,
        aimPos: { tx: 10, ty: 0 },
      }),
    ).toEqual({ ok: false, reason: "locked" });
  });

  test("zoneType 'field' / undefined → ไม่กระทบ (combat ปกติ)", () => {
    expect(validateCast({ ...base, skill: makeSkill(), zoneType: "field" })).toEqual({ ok: true });
    expect(validateCast({ ...base, skill: makeSkill() })).toEqual({ ok: true });
  });

  test("ลำดับตรวจ: unknown ก่อน cooldown ก่อน range", () => {
    // unknown ชนะแม้ cooldown ยังไม่ครบ
    expect(
      validateCast({ ...base, skill: undefined, readyAtMs: 9999, nowMs: 0 }),
    ).toEqual({ ok: false, reason: "unknown_skill" });
  });
});

describe("safe zone (P1-11, GS §14) — เมืองปฏิเสธ cast ทุกกรณี", () => {
  const base = {
    playerLevel: 99, // A3: unlock ผ่าน (โฟกัสเทสต์ safe_zone)
    readyAtMs: undefined,
    nowMs: 1000,
    casterPos: { tx: 0, ty: 0 },
    aimPos: { tx: 1, ty: 0 },
    rangeToleranceFactor: 1.5,
  };

  test("zoneType 'safe' + สกิลปกติ → safe_zone (ไม่มี combat ในเมือง)", () => {
    expect(
      validateCast({ ...base, skill: makeSkill(), zoneType: "safe" }),
    ).toEqual({ ok: false, reason: "safe_zone" });
  });

  test("safe_zone ชนะทุก reason (แม้ skill มั่ว / cooldown ยังไม่ครบ)", () => {
    // skill undefined ปกติ → unknown_skill; แต่ safe zone ชนะก่อน
    expect(
      validateCast({ ...base, skill: undefined, zoneType: "safe" }),
    ).toEqual({ ok: false, reason: "safe_zone" });
    // cooldown ยังไม่ครบ ปกติ → cooldown; แต่ safe zone ชนะก่อน
    expect(
      validateCast({ ...base, skill: makeSkill(), zoneType: "safe", readyAtMs: 9999, nowMs: 0 }),
    ).toEqual({ ok: false, reason: "safe_zone" });
  });
});
