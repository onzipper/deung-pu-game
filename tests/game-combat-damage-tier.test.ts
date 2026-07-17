import { describe, expect, test } from "vitest";
import { isBigDamage, resolveImpactTier, type DamageTierThresholds } from "@/game/combat/damage-tier";

const THRESHOLDS: DamageTierThresholds = { bigHitDamage: 40 };

describe("resolveImpactTier (pure, Combat Juice F5)", () => {
  test("crit=true → tier \"crit\" เสมอ ไม่ว่า dmg เท่าไหร่", () => {
    expect(resolveImpactTier({ dmg: 1, crit: true }, THRESHOLDS)).toBe("crit");
    expect(resolveImpactTier({ dmg: 999, crit: true }, THRESHOLDS)).toBe("crit");
  });

  test("crit=false + dmg ≥ bigHitDamage → tier \"big\"", () => {
    expect(resolveImpactTier({ dmg: 40, crit: false }, THRESHOLDS)).toBe("big");
    expect(resolveImpactTier({ dmg: 100, crit: false }, THRESHOLDS)).toBe("big");
  });

  test("crit=false + dmg < bigHitDamage → tier \"normal\"", () => {
    expect(resolveImpactTier({ dmg: 39.999, crit: false }, THRESHOLDS)).toBe("normal");
    expect(resolveImpactTier({ dmg: 0, crit: false }, THRESHOLDS)).toBe("normal");
  });

  test("boundary เป๊ะ (dmg === bigHitDamage) → นับเป็น big (inclusive)", () => {
    expect(resolveImpactTier({ dmg: 40, crit: false }, THRESHOLDS)).toBe("big");
  });
});

describe("isBigDamage (pure, ใช้ tune hit-stop/shake magnitude ต่างหากจาก resolveImpactTier)", () => {
  test("dmg ≥ threshold → true แม้ crit (orthogonal กับ resolveImpactTier)", () => {
    expect(isBigDamage(40, THRESHOLDS)).toBe(true);
    expect(isBigDamage(41, THRESHOLDS)).toBe(true);
  });

  test("dmg < threshold → false", () => {
    expect(isBigDamage(39, THRESHOLDS)).toBe(false);
    expect(isBigDamage(0, THRESHOLDS)).toBe(false);
  });
});
