// Living World LW0 pure math (Living World Bible §3 world time · §4.4 weather degrade). No pixi/DOM.
import { describe, expect, test } from "vitest";
import {
  lerpColor,
  phaseAt,
  phaseTintAt,
  realMsPerGameMinute,
  worldMinuteAt,
} from "@/engine/runtime/world-clock";
import { DEFAULT_WORLD_CONFIG, rainParticleCount, type WorldConfig } from "@/engine/config";

// epoch 0 → worldMinute maps directly from nowMs; 240 real-min/day = 10s real per game-minute.
const CFG: WorldConfig = DEFAULT_WORLD_CONFIG;
const MS_PER_GAME_MIN = realMsPerGameMinute(CFG); // = 10_000

/** helper: nowMs ที่ตรงกับ minute-of-day ที่ต้องการ (epoch 0). */
const atMinute = (m: number): number => m * MS_PER_GAME_MIN;

describe("realMsPerGameMinute", () => {
  test("240 real-min/day → 10s per game-minute", () => {
    expect(MS_PER_GAME_MIN).toBe(10_000);
  });
});

describe("worldMinuteAt", () => {
  test("epoch → minute 0", () => {
    expect(worldMinuteAt(0, CFG)).toBe(0);
  });
  test("wraps at 1440 (one game-day)", () => {
    expect(worldMinuteAt(atMinute(1440), CFG)).toBe(0);
    expect(worldMinuteAt(atMinute(1445), CFG)).toBe(5);
  });
  test("floors within a minute", () => {
    expect(worldMinuteAt(atMinute(90) + 9_999, CFG)).toBe(90);
  });
  test("handles nowMs before epoch (negative) without going negative", () => {
    const cfg = { ...CFG, worldEpochMs: 1000 };
    const m = worldMinuteAt(0, cfg);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThan(1440);
  });
});

describe("phaseAt (§3.1 boundaries)", () => {
  test("dawn 05:00–07:00 (300–420)", () => {
    expect(phaseAt(300)).toBe("dawn");
    expect(phaseAt(419)).toBe("dawn");
  });
  test("day 07:00–17:00 (420–1020)", () => {
    expect(phaseAt(420)).toBe("day");
    expect(phaseAt(1019)).toBe("day");
  });
  test("dusk 17:00–19:00 (1020–1140)", () => {
    expect(phaseAt(1020)).toBe("dusk");
    expect(phaseAt(1139)).toBe("dusk");
  });
  test("night 19:00–05:00 wraps midnight", () => {
    expect(phaseAt(1140)).toBe("night");
    expect(phaseAt(0)).toBe("night");
    expect(phaseAt(299)).toBe("night");
  });
});

describe("lerpColor", () => {
  test("t=0 → from, t=1 → to", () => {
    expect(lerpColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(lerpColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
  });
  test("t=0.5 → midpoint per channel", () => {
    expect(lerpColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });
  test("clamps t out of range", () => {
    expect(lerpColor(0x102030, 0x405060, -1)).toBe(0x102030);
    expect(lerpColor(0x102030, 0x405060, 2)).toBe(0x405060);
  });
});

describe("phaseTintAt (§3.3 cross-fade)", () => {
  test("mid-day (well past blend) = full day tint (alpha 0)", () => {
    const t = phaseTintAt(atMinute(700), CFG); // day, far from 420
    expect(t.alpha).toBeCloseTo(CFG.phaseTint.day.alpha);
    expect(t.color).toBe(CFG.phaseTint.day.color);
  });
  test("deep night (past blend) = full night tint", () => {
    const t = phaseTintAt(atMinute(1300), CFG); // night, far from 1140
    expect(t.alpha).toBeCloseTo(CFG.phaseTint.night.alpha);
    expect(t.color).toBe(CFG.phaseTint.night.color);
  });
  test("right at dusk start = blend from day (alpha near day's)", () => {
    const t = phaseTintAt(atMinute(1020), CFG); // secInto = 0 → = day tint
    expect(t.alpha).toBeCloseTo(CFG.phaseTint.day.alpha);
  });
  test("halfway through the blend window = between prev and target alpha", () => {
    // blend = 90s = 9 game-minutes; halfway = 45s into dusk (minute 1020 + 4.5)
    const nowMs = atMinute(1020) + (CFG.phaseTint.transitionBlendSeconds / 2) * 1000;
    const t = phaseTintAt(nowMs, CFG);
    const lo = Math.min(CFG.phaseTint.day.alpha, CFG.phaseTint.dusk.alpha);
    const hi = Math.max(CFG.phaseTint.day.alpha, CFG.phaseTint.dusk.alpha);
    expect(t.alpha).toBeGreaterThan(lo);
    expect(t.alpha).toBeLessThan(hi);
  });
  test("blendSeconds <= 0 → instant target (no fade)", () => {
    const cfg = { ...CFG, phaseTint: { ...CFG.phaseTint, transitionBlendSeconds: 0 } };
    const t = phaseTintAt(atMinute(1020), cfg);
    expect(t.color).toBe(cfg.phaseTint.dusk.color);
    expect(t.alpha).toBeCloseTo(cfg.phaseTint.dusk.alpha);
  });
});

describe("rainParticleCount (§4.4 degrade weather, §20 ≤180)", () => {
  test("clear weather → 0 regardless of quality", () => {
    expect(rainParticleCount(CFG.rain, "clear", "high")).toBe(0);
    expect(rainParticleCount(CFG.rain, "clear", "low")).toBe(0);
  });
  test("rain scales down with lower quality (high ≥ medium ≥ low)", () => {
    const high = rainParticleCount(CFG.rain, "rain", "high");
    const med = rainParticleCount(CFG.rain, "rain", "medium");
    const low = rainParticleCount(CFG.rain, "rain", "low");
    expect(high).toBe(CFG.rain.degrade.high);
    expect(med).toBe(CFG.rain.degrade.medium);
    expect(low).toBe(CFG.rain.degrade.low);
    expect(high).toBeGreaterThanOrEqual(med);
    expect(med).toBeGreaterThanOrEqual(low);
  });
  test("cinematic uses the high tier", () => {
    expect(rainParticleCount(CFG.rain, "rain", "cinematic")).toBe(CFG.rain.degrade.high);
  });
  test("never exceeds particleCountHigh, which is within the §20 cap (180)", () => {
    for (const q of ["low", "medium", "high", "cinematic"] as const) {
      expect(rainParticleCount(CFG.rain, "rain", q)).toBeLessThanOrEqual(CFG.rain.particleCountHigh);
    }
    expect(CFG.rain.particleCountHigh).toBeLessThanOrEqual(180);
  });
});
