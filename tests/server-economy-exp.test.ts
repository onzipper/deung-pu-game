import { describe, expect, test } from "vitest";
import {
  applyExpGain,
  computeMonsterExp,
  deriveLevel,
  playerBaselineForLevel,
  resolveLevelDiffMultiplier,
  type ExpCurve,
} from "../src/server/economy/exp";
import { DEFAULT_ECONOMY_CONFIG } from "../server/config";

// P2-09 — EXP award + level-up (Economy §9). never-downgrade zone (progression → combat stats).

const CURVE: ExpCurve = DEFAULT_ECONOMY_CONFIG.expCurve;

describe("resolveLevelDiffMultiplier (§9.3)", () => {
  const mod = CURVE.levelDiffModifier;
  const cap = CURVE.highLevelBonusCap;

  test("bucketed exactly per config table", () => {
    expect(resolveLevelDiffMultiplier(7, 5, mod, cap)).toBe(1.2); // diff +2
    expect(resolveLevelDiffMultiplier(6, 5, mod, cap)).toBe(1.1); // diff +1
    expect(resolveLevelDiffMultiplier(5, 5, mod, cap)).toBe(1.0); // diff 0
    expect(resolveLevelDiffMultiplier(4, 5, mod, cap)).toBe(1.0); // diff -1
    expect(resolveLevelDiffMultiplier(3, 5, mod, cap)).toBe(0.85); // diff -2
    expect(resolveLevelDiffMultiplier(2, 5, mod, cap)).toBe(0.7); // diff -3
    expect(resolveLevelDiffMultiplier(1, 5, mod, cap)).toBe(0.5); // diff -4
    expect(resolveLevelDiffMultiplier(0, 5, mod, cap)).toBe(0.2); // diff <= -5
  });

  test("positive bonus clamped to highLevelBonusCap (120%)", () => {
    const bigMod = { ...mod, monsterMinusPlayerAtLeast2: 1.9 };
    expect(resolveLevelDiffMultiplier(10, 1, bigMod, 1.2)).toBe(1.2); // clamped
    expect(resolveLevelDiffMultiplier(1, 5, bigMod, 1.2)).toBe(0.5); // penalty never clamped up
  });
});

describe("computeMonsterExp (§9.3 + §9.4)", () => {
  test("solo matched level = base EXP", () => {
    expect(computeMonsterExp({ baseExp: 30, monsterLevel: 4, playerLevel: 4, curve: CURVE, eligibleMembers: 1 })).toBe(30);
  });

  test("solo with +2 level diff = floor(base × 1.2)", () => {
    expect(computeMonsterExp({ baseExp: 30, monsterLevel: 5, playerLevel: 3, curve: CURVE, eligibleMembers: 1 })).toBe(36);
  });

  test("floor rounding (spec ไม่ระบุ — chosen floor): 14 × 0.85 = 11", () => {
    // slime base 14, mon lv1 vs player lv3 → diff -2 → 0.85 → 11.9 → 11
    expect(computeMonsterExp({ baseExp: 14, monsterLevel: 1, playerLevel: 3, curve: CURVE, eligibleMembers: 1 })).toBe(11);
  });

  test("party of 2 = spec §9.4 example (base 30 → pool 36 → each 18)", () => {
    expect(computeMonsterExp({ baseExp: 30, monsterLevel: 4, playerLevel: 4, curve: CURVE, eligibleMembers: 2 })).toBe(18);
  });

  test("party pool multiplier capped at 1.60", () => {
    // 10 members → 1 + 0.2×9 = 2.8 → capped 1.6; pool = 30×1.6 = 48; per = 4.8 → floor 4
    expect(computeMonsterExp({ baseExp: 30, monsterLevel: 4, playerLevel: 4, curve: CURVE, eligibleMembers: 10 })).toBe(4);
  });
});

describe("applyExpGain — level-up rollover (§9.1/§9.2)", () => {
  test("single threshold: lv1 exp0 + 120 → lv2", () => {
    expect(applyExpGain({ level: 1, exp: 0, gained: 120, curve: CURVE })).toEqual({
      level: 2,
      exp: 120,
      leveledUp: true,
      levelsGained: 1,
    });
  });

  test("multiple levels in one grant: lv1 exp0 + 700 → lv4 (crosses 120/340/700)", () => {
    const r = applyExpGain({ level: 1, exp: 0, gained: 700, curve: CURVE });
    expect(r.level).toBe(4);
    expect(r.exp).toBe(700);
    expect(r.levelsGained).toBe(3);
    expect(r.leveledUp).toBe(true);
  });

  test("no level-up: partial EXP within a level", () => {
    expect(applyExpGain({ level: 1, exp: 0, gained: 50, curve: CURVE })).toEqual({
      level: 1,
      exp: 50,
      leveledUp: false,
      levelsGained: 0,
    });
  });

  test("cap: at lv10 EXP never accumulates past cumulative cap (§9.1)", () => {
    const r = applyExpGain({ level: 10, exp: 7440, gained: 1000, curve: CURVE });
    expect(r.level).toBe(10);
    expect(r.exp).toBe(7440);
    expect(r.leveledUp).toBe(false);
  });

  test("gain that overshoots into the cap clamps EXP to the cap total", () => {
    const r = applyExpGain({ level: 9, exp: 7000, gained: 5000, curve: CURVE });
    expect(r.level).toBe(10);
    expect(r.exp).toBe(7440);
  });
});

describe("deriveLevel (§9.2 thresholds)", () => {
  test("cumulative thresholds map to level", () => {
    expect(deriveLevel(0, CURVE)).toBe(1);
    expect(deriveLevel(119, CURVE)).toBe(1);
    expect(deriveLevel(120, CURVE)).toBe(2);
    expect(deriveLevel(340, CURVE)).toBe(3);
    expect(deriveLevel(7440, CURVE)).toBe(10);
    expect(deriveLevel(999999, CURVE)).toBe(10); // clamped at cap
  });
});

describe("playerBaselineForLevel (D-055 §2)", () => {
  const secondary = { critRate: 0.05, critDmg: 0.5, penetration: 0 };
  const table = DEFAULT_ECONOMY_CONFIG.playerBaseline;

  test("lv1 primary matches engine baseline (HP100/ATK12/DEF8) + secondaries", () => {
    expect(playerBaselineForLevel(1, table, secondary)).toEqual({
      hp: 100,
      atk: 12,
      def: 8,
      critRate: 0.05,
      critDmg: 0.5,
      penetration: 0,
    });
  });

  test("lv5 = 180/24/14 · lv10 = 280/40/22 (D-055 §2)", () => {
    expect(playerBaselineForLevel(5, table, secondary)).toMatchObject({ hp: 180, atk: 24, def: 14 });
    expect(playerBaselineForLevel(10, table, secondary)).toMatchObject({ hp: 280, atk: 40, def: 22 });
  });

  test("out-of-range level clamps to nearest table row", () => {
    expect(playerBaselineForLevel(99, table, secondary)).toMatchObject({ hp: 280, atk: 40 }); // → lv10
    expect(playerBaselineForLevel(0, table, secondary)).toMatchObject({ hp: 100, atk: 12 }); // → lv1
  });
});
