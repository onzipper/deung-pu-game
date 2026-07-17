import { describe, expect, test } from "vitest";
import {
  createParticleBurst,
  particleAlpha,
  scaleParticleBurstCount,
  stepParticle,
  type ParticleBurstStyle,
} from "@/game/combat/particle-burst";
import type { RngFn } from "@/game/mob/rng";

/** rng คงที่ — ให้ผล particle deterministic ตรวจได้เป๊ะ (เหมือน pattern screen-shake test). */
const fixedRng = (v: number): RngFn => () => v;

const OMNI_STYLE: ParticleBurstStyle = {
  count: 6,
  color: 0xff6600,
  speedMinPx: 100,
  speedMaxPx: 200,
  sizeMinPx: 2,
  sizeMaxPx: 4,
  lifetimeMs: 400,
  gravityPxPerSec2: 0,
  spreadDegrees: 360,
};

describe("createParticleBurst (pure, Combat Juice F5)", () => {
  test("count ≤ 0 → array ว่าง (caller คูณ quality scale มาแล้วได้ 0)", () => {
    expect(createParticleBurst({ ...OMNI_STYLE, count: 0 }, fixedRng(0.5))).toEqual([]);
    expect(createParticleBurst({ ...OMNI_STYLE, count: -3 }, fixedRng(0.5))).toEqual([]);
  });

  test("จำนวน particle ตรง count, ทุกตัวเริ่มที่ (0,0) อายุ 0", () => {
    const particles = createParticleBurst(OMNI_STYLE, fixedRng(0.5));
    expect(particles).toHaveLength(6);
    for (const p of particles) {
      expect(p.x).toBe(0);
      expect(p.y).toBe(0);
      expect(p.ageMs).toBe(0);
      expect(p.lifetimeMs).toBe(400);
      expect(p.color).toBe(0xff6600);
    }
  });

  test("rng=0 ทุกครั้ง (spread 360) → angle=0 → vx=speedMin, vy≈0", () => {
    const [p] = createParticleBurst(OMNI_STYLE, fixedRng(0));
    expect(p.vx).toBeCloseTo(100, 5); // speedMin
    expect(p.vy).toBeCloseTo(0, 5);
    expect(p.size).toBeCloseTo(2, 5); // sizeMin
  });

  test("spread < 360 → angle จำกัดรอบ directionDeg (ไม่หลุด full circle)", () => {
    const style: ParticleBurstStyle = {
      ...OMNI_STYLE,
      spreadDegrees: 0,
      directionDeg: 90, // screen-space y-down: ลงตรง ๆ
    };
    const [p] = createParticleBurst(style, fixedRng(0.5));
    // spread=0 → angle = directionDeg เป๊ะ = 90° → vx≈0, vy=speed (บวก = ลง)
    expect(p.vx).toBeCloseTo(0, 5);
    expect(p.vy).toBeGreaterThan(0);
  });
});

describe("stepParticle / particleAlpha (pure motion)", () => {
  test("gravity=0 → ขยับเป็นเส้นตรงตาม velocity, อายุเพิ่มตาม dtMs", () => {
    const [p] = createParticleBurst(OMNI_STYLE, fixedRng(0)); // vx=100,vy=0, lifetime 400
    const alive = stepParticle(p, 200); // 0.2s (ยังไม่หมดอายุ)
    expect(alive).toBe(true);
    expect(p.x).toBeCloseTo(20, 5); // 100px/s * 0.2s
    expect(p.y).toBeCloseTo(0, 5);
    expect(p.ageMs).toBe(200);
  });

  test("gravity > 0 → vy เพิ่มขึ้นตามเวลา (ตกลง)", () => {
    const style: ParticleBurstStyle = { ...OMNI_STYLE, gravityPxPerSec2: 500 };
    const [p] = createParticleBurst(style, fixedRng(0)); // vy เริ่ม ≈0
    stepParticle(p, 1000); // 1s
    expect(p.vy).toBeCloseTo(500, 5);
  });

  test("ageMs ≥ lifetimeMs → stepParticle คืน false (หมดอายุ)", () => {
    const [p] = createParticleBurst(OMNI_STYLE, fixedRng(0)); // lifetime 400
    expect(stepParticle(p, 399)).toBe(true);
    expect(stepParticle(p, 1)).toBe(false); // รวม 400 ≥ 400
  });

  test("particleAlpha ลดเชิงเส้นตามอายุ, 0 เมื่อหมดอายุ", () => {
    const [p] = createParticleBurst(OMNI_STYLE, fixedRng(0)); // lifetime 400
    expect(particleAlpha(p)).toBe(1);
    stepParticle(p, 200);
    expect(particleAlpha(p)).toBeCloseTo(0.5, 6);
    stepParticle(p, 1000);
    expect(particleAlpha(p)).toBe(0);
  });

  test("lifetimeMs ≤ 0 → particleAlpha 0 เสมอ (กัน div-by-zero)", () => {
    const style: ParticleBurstStyle = { ...OMNI_STYLE, lifetimeMs: 0 };
    const [p] = createParticleBurst(style, fixedRng(0));
    expect(particleAlpha(p)).toBe(0);
  });
});

describe("scaleParticleBurstCount (pure quality gate)", () => {
  test("scale=0 (low quality) → count 0 (ปิดของแพง)", () => {
    expect(scaleParticleBurstCount(OMNI_STYLE, 0).count).toBe(0);
  });

  test("scale=1 → count เดิมเป๊ะ", () => {
    expect(scaleParticleBurstCount(OMNI_STYLE, 1).count).toBe(6);
  });

  test("scale ปัดเศษ (round) และ field อื่นไม่เปลี่ยน", () => {
    const scaled = scaleParticleBurstCount(OMNI_STYLE, 0.6); // 6*0.6=3.6 → round 4
    expect(scaled.count).toBe(4);
    expect(scaled.color).toBe(OMNI_STYLE.color);
    expect(scaled.lifetimeMs).toBe(OMNI_STYLE.lifetimeMs);
  });

  test("scale ติดลบ → clamp 0 (กัน count ติดลบ)", () => {
    expect(scaleParticleBurstCount(OMNI_STYLE, -1).count).toBe(0);
  });
});
