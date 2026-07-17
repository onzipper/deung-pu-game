import { describe, expect, test } from "vitest";
import {
  combatJuiceQualityScale,
  DEFAULT_COMBAT_JUICE_CONFIG,
  isQualityAtLeast,
  type CombatJuiceQualityScale,
} from "@/game/combat/juice-config";

const SCALE: CombatJuiceQualityScale = { low: 0, medium: 0.6, high: 1, cinematic: 1.3 };

describe("combatJuiceQualityScale (pure lookup)", () => {
  test("คืนค่าตาม quality tier ตรง ๆ", () => {
    expect(combatJuiceQualityScale(SCALE, "low")).toBe(0);
    expect(combatJuiceQualityScale(SCALE, "medium")).toBe(0.6);
    expect(combatJuiceQualityScale(SCALE, "high")).toBe(1);
    expect(combatJuiceQualityScale(SCALE, "cinematic")).toBe(1.3);
  });
});

describe("isQualityAtLeast (pure quality-tier ordering)", () => {
  test("quality เท่ากับ min → true", () => {
    expect(isQualityAtLeast("medium", "medium")).toBe(true);
  });

  test("quality สูงกว่า min → true", () => {
    expect(isQualityAtLeast("cinematic", "medium")).toBe(true);
    expect(isQualityAtLeast("high", "low")).toBe(true);
  });

  test("quality ต่ำกว่า min → false (เช่น low < medium → ปิด camera flash)", () => {
    expect(isQualityAtLeast("low", "medium")).toBe(false);
  });
});

describe("DEFAULT_COMBAT_JUICE_CONFIG — invariant checks", () => {
  test("low quality scale = 0 ทุกกลุ่ม (invariant: ปิดของแพงที่ quality ต่ำสุด)", () => {
    expect(DEFAULT_COMBAT_JUICE_CONFIG.impactParticles.countScaleByQuality.low).toBe(0);
    expect(DEFAULT_COMBAT_JUICE_CONFIG.deathVfx.countScaleByQuality.low).toBe(0);
  });

  test("cameraFlash ปิดที่ต่ำกว่า medium (ของแพงสุดในชุด)", () => {
    expect(DEFAULT_COMBAT_JUICE_CONFIG.cameraFlash.minQuality).toBe("medium");
    expect(isQualityAtLeast("low", DEFAULT_COMBAT_JUICE_CONFIG.cameraFlash.minQuality)).toBe(false);
  });

  test("crit ทุกกลุ่มเด่นกว่า normal เสมอ (จำนวน particle/pop scale/flash duration)", () => {
    const p = DEFAULT_COMBAT_JUICE_CONFIG.impactParticles.stylesByTier;
    expect(p.crit.count).toBeGreaterThan(p.big.count);
    expect(p.big.count).toBeGreaterThan(p.normal.count);
    const f = DEFAULT_COMBAT_JUICE_CONFIG.impactFlash.stylesByTier;
    expect(f.crit.durationMs).toBeGreaterThan(f.normal.durationMs);
    expect(DEFAULT_COMBAT_JUICE_CONFIG.damageNumber.popScaleByKind.crit).toBeGreaterThan(
      DEFAULT_COMBAT_JUICE_CONFIG.damageNumber.popScaleByKind.normal,
    );
  });

  test("death burst เด่นขึ้นตาม rank: normal < elite < boss (count)", () => {
    const d = DEFAULT_COMBAT_JUICE_CONFIG.deathVfx.burstByRank;
    expect(d.elite.count).toBeGreaterThan(d.normal.count);
    expect(d.boss.count).toBeGreaterThan(d.elite.count);
  });
});
