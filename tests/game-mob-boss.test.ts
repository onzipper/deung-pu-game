import { describe, expect, test } from "vitest";
import {
  applyPhaseToTimings,
  bossBreakContribution,
  bossBreakParams,
  bossDamageModifier,
  depleteGuard,
  phaseIndexForHp,
  shouldEmitBossTelegraph,
} from "@/game/mob/boss";
import { DEFAULT_COMBAT_BALANCE_CONFIG } from "@/engine/config";
import type { MobAttackTimings } from "@/game/mob/ai";

// Boss depth pure logic (workstream B) — COMBAT_BIBLE §7/§8, OWNER_PRODUCTION_DECISIONS §2.3/§2.4, TA §15.4.
// ค่าที่เทียบ = จาก DEFAULT config (Design Knob) — ไม่ hardcode magic number ในเทสต์.

const BOSS = DEFAULT_COMBAT_BALANCE_CONFIG.boss;

describe("bossBreakContribution — Break Power เป็น stat แยกจาก damage; AoE ไม่ใช่ break tool ที่ดีสุด (§8)", () => {
  test("single-target (maxTargets 1) ทุบ break > AoE (maxTargets 6)", () => {
    const single = bossBreakContribution(
      { hitCount: 1, maxTargets: 1, equipmentBreakPower: 0 },
      BOSS.breakModel,
    );
    const aoe = bossBreakContribution(
      { hitCount: 1, maxTargets: 6, equipmentBreakPower: 0 },
      BOSS.breakModel,
    );
    expect(single).toBeGreaterThan(aoe);
    expect(aoe).toBeCloseTo(single * BOSS.breakModel.aoeFactor); // AoE = single × aoeFactor (<1)
  });

  test("short-cleave (maxTargets = singleTargetMaxTargets) ยังนับ single (break เต็ม)", () => {
    const cleave = bossBreakContribution(
      { hitCount: 1, maxTargets: BOSS.breakModel.singleTargetMaxTargets, equipmentBreakPower: 0 },
      BOSS.breakModel,
    );
    const single = bossBreakContribution(
      { hitCount: 1, maxTargets: 1, equipmentBreakPower: 0 },
      BOSS.breakModel,
    );
    expect(cleave).toBe(single);
  });

  test("break ไม่ผูกกับ damage — baseMultiplier ไม่มีในสูตร (2 สกิล single ต่างพลังตี = break เท่ากัน)", () => {
    // solar_cleave (baseMult 3.5) vs basic_slash (baseMult 1.0) ทั้งคู่ single-target hitCount 1 → break เท่ากัน
    const heavy = bossBreakContribution({ hitCount: 1, maxTargets: 1, equipmentBreakPower: 0 }, BOSS.breakModel);
    const light = bossBreakContribution({ hitCount: 1, maxTargets: 2, equipmentBreakPower: 0 }, BOSS.breakModel);
    expect(heavy).toBe(light);
  });

  test("equipment breakPower (§6.1) บวกเข้า break ตาม weight (build stat)", () => {
    const base = bossBreakContribution({ hitCount: 1, maxTargets: 1, equipmentBreakPower: 0 }, BOSS.breakModel);
    const geared = bossBreakContribution({ hitCount: 1, maxTargets: 1, equipmentBreakPower: 5 }, BOSS.breakModel);
    expect(geared).toBeCloseTo(base + 5 * BOSS.breakModel.equipmentBreakWeight);
  });

  test("hitCount scale break (multi-hit ทุบเยอะกว่า)", () => {
    const one = bossBreakContribution({ hitCount: 1, maxTargets: 1, equipmentBreakPower: 0 }, BOSS.breakModel);
    const three = bossBreakContribution({ hitCount: 3, maxTargets: 1, equipmentBreakPower: 0 }, BOSS.breakModel);
    expect(three).toBeCloseTo(one * 3);
  });
});

describe("phaseIndexForHp — Learn → Pressure @65% → Soft Enrage @20% (§2.3)", () => {
  const phases = BOSS.phases;
  test("phase id ตรง §2.3", () => expect(phases.map((p) => p.id)).toEqual(["learn", "pressure", "enrage"]));
  test("hp เต็ม → Learn (0)", () => expect(phaseIndexForHp(1.0, phases)).toBe(0));
  test("66% → ยัง Learn (0)", () => expect(phaseIndexForHp(0.66, phases)).toBe(0));
  test("65% พอดี → Pressure (1)", () => expect(phaseIndexForHp(0.65, phases)).toBe(1));
  test("21% → ยัง Pressure (1)", () => expect(phaseIndexForHp(0.21, phases)).toBe(1));
  test("20% พอดี → Enrage (2)", () => expect(phaseIndexForHp(0.2, phases)).toBe(2));
  test("5% → Enrage (2)", () => expect(phaseIndexForHp(0.05, phases)).toBe(2));
});

describe("applyPhaseToTimings — Enrage cadence/recovery; telegraph ไม่ถูกย่อ (§2.3/§18.5)", () => {
  const base: MobAttackTimings = {
    attackRange: 2.4,
    attackCooldownMs: 3200,
    anticipationMs: 800,
    activeMs: 400,
    recoveryMs: 700,
  };
  test("Learn (phase 0) = identity", () => {
    expect(applyPhaseToTimings(base, BOSS.phases[0])).toEqual(base);
  });
  test("Enrage ย่อ cooldown + recovery แต่ anticipation (telegraph) คงเดิม", () => {
    const enrage = BOSS.phases[2];
    const t = applyPhaseToTimings(base, enrage);
    expect(t.attackCooldownMs).toBeCloseTo(3200 * enrage.attackCooldownFactor);
    expect(t.recoveryMs).toBeCloseTo(700 * enrage.recoveryFactor);
    expect(t.anticipationMs).toBe(800); // telegraph ต้องอ่านออกเสมอ
    expect(t.attackRange).toBe(2.4);
    expect(t.activeMs).toBe(400);
    expect(enrage.attackCooldownFactor).toBeLessThan(1); // เร็วขึ้น
    expect(enrage.recoveryFactor).toBeLessThan(1);
  });
});

describe("depleteGuard — guard ถึง 0 = BREAK (§8)", () => {
  test("เหนือ 0 → ไม่ break", () => expect(depleteGuard(100, 30)).toEqual({ guard: 70, broke: false }));
  test("แตะ 0 พอดี → break", () => expect(depleteGuard(30, 30)).toEqual({ guard: 0, broke: true }));
  test("overkill → clamp 0 + break", () => expect(depleteGuard(10, 50)).toEqual({ guard: 0, broke: true }));
  test("0 อยู่แล้ว (staggered) → ไม่ break ซ้ำ", () =>
    expect(depleteGuard(0, 50)).toEqual({ guard: 0, broke: false }));
});

describe("bossDamageModifier — golden window fold เข้า bossModifier (§2.4)", () => {
  test("ไม่ staggered = bossModifier ของสกิลล้วน", () => expect(bossDamageModifier(1.2, false, 1.25)).toBe(1.2));
  test("staggered = × stagger multiplier", () => expect(bossDamageModifier(1.2, true, 1.25)).toBeCloseTo(1.5));
});

describe("bossBreakParams — solo vs party window (§2.4 verbatim)", () => {
  const brk = BOSS.break;
  test("solo (1) = 6s / ×1.25", () =>
    expect(bossBreakParams(brk, 1)).toEqual({ staggerWindowMs: 6000, damageMultiplier: 1.25 }));
  test("party (>1) = 8s / ×1.20", () =>
    expect(bossBreakParams(brk, 3)).toEqual({ staggerWindowMs: 8000, damageMultiplier: 1.2 }));
});

describe("shouldEmitBossTelegraph — telegraph นัดแรกหลัง respawn ไม่หาย (§2.2/§18.5)", () => {
  test("first-observation seq 0 (บอสเกิด/respawn ยัง idle) → ไม่ยิง (spawn ไม่หลอก)", () =>
    expect(shouldEmitBossTelegraph(undefined, 0)).toBe(false));
  test("first-observation seq>0 (respawn+เหวี่ยงในเฟรมเดียว, player จ่อระยะ) → ยิง", () =>
    expect(shouldEmitBossTelegraph(undefined, 1)).toBe(true));
  test("มี baseline + seq เปลี่ยน → ยิง (swing ใหม่)", () =>
    expect(shouldEmitBossTelegraph(1, 2)).toBe(true));
  test("มี baseline + seq เท่าเดิม → ไม่ยิง (ยัง swing เดิม)", () =>
    expect(shouldEmitBossTelegraph(2, 2)).toBe(false));
});
