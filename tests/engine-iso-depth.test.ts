import { describe, expect, test } from "vitest";
import {
  DEPTH_BASE_SPAN,
  DEPTH_MAX_TILE_COORD,
  DEPTH_ZLAYER_BAND,
  depthKey,
} from "@/engine/iso/depth";

describe("depthKey — base ordering (tx+ty มากกว่า = ใต้จอกว่า = ทับ)", () => {
  test("จุดใต้กว่ามี key มากกว่า", () => {
    expect(depthKey({ tx: 2, ty: 2 })).toBeGreaterThan(depthKey({ tx: 1, ty: 1 }));
    expect(depthKey({ tx: 1, ty: 0 })).toBeGreaterThan(depthKey({ tx: 0, ty: 0 }));
  });

  test("tx+ty เท่ากัน → key เท่ากัน (แนว iso เดียวกัน)", () => {
    expect(depthKey({ tx: 3, ty: 0 })).toBe(depthKey({ tx: 0, ty: 3 }));
    expect(depthKey({ tx: 2, ty: 1 })).toBe(depthKey({ tx: 1, ty: 2 }));
  });

  test("รองรับ float (entity เคลื่อนต่อเนื่อง)", () => {
    expect(depthKey({ tx: 1.5, ty: 1.5 })).toBeGreaterThan(
      depthKey({ tx: 1.4, ty: 1.5 }),
    );
  });

  test("deterministic — เรียกซ้ำได้ค่าเดิม", () => {
    expect(depthKey({ tx: 7, ty: 3 })).toBe(depthKey({ tx: 7, ty: 3 }));
  });
});

describe("depthKey — zLayer override (band)", () => {
  test("zLayer default = 0", () => {
    expect(depthKey({ tx: 5, ty: 5 })).toBe(depthKey({ tx: 5, ty: 5 }, 0));
  });

  test("zLayer สูงกว่าที่ตำแหน่งเดียวกัน = key มากกว่า", () => {
    expect(depthKey({ tx: 0, ty: 0 }, 1)).toBeGreaterThan(
      depthKey({ tx: 0, ty: 0 }, 0),
    );
  });

  test("band constant derived ถูกต้อง (ไม่ magic number)", () => {
    expect(DEPTH_BASE_SPAN).toBe(4 * DEPTH_MAX_TILE_COORD);
    expect(DEPTH_ZLAYER_BAND).toBe(DEPTH_BASE_SPAN * 2);
    // invariant หัวใจ: band ต้อง > ช่วงกว้างของ base ไม่งั้น overlap
    expect(DEPTH_ZLAYER_BAND).toBeGreaterThan(DEPTH_BASE_SPAN);
  });
});

describe("depthKey — band ไม่ overlap ทั่วทั้ง map ที่รองรับ (พิสูจน์ขอบ)", () => {
  const MAX = DEPTH_MAX_TILE_COORD;
  // จุดที่ให้ base สุดขั้ว: มุมสุด map
  const topMost = { tx: -MAX, ty: -MAX }; // base = −2·MAX (บนสุด)
  const bottomMost = { tx: MAX, ty: MAX }; // base = +2·MAX (ล่างสุด)

  test("zLayer L+1 ที่จุดบนสุด ยังชนะ zLayer L ที่จุดล่างสุด", () => {
    for (let L = 0; L < 8; L++) {
      const lowerLayerBottom = depthKey(bottomMost, L); // max ของ band L
      const upperLayerTop = depthKey(topMost, L + 1); // min ของ band L+1
      expect(upperLayerTop).toBeGreaterThan(lowerLayerBottom);
    }
  });

  test("margin = span > 0 (ตรวจสูตร band แข็งจริง)", () => {
    const bandL = depthKey(bottomMost, 3);
    const bandNext = depthKey(topMost, 4);
    expect(bandNext - bandL).toBe(DEPTH_ZLAYER_BAND - DEPTH_BASE_SPAN);
    expect(bandNext - bandL).toBeGreaterThan(0);
  });

  test("ภายใน band เดียว: sort ตาม base ล้วน (zLayer ไม่รบกวน)", () => {
    const a = depthKey({ tx: 10, ty: 10 }, 5);
    const b = depthKey({ tx: 20, ty: 20 }, 5);
    expect(b).toBeGreaterThan(a);
    // ระยะห่างเท่ากับ base ต่าง = 20 (deterministic)
    expect(b - a).toBe(20 + 20 - (10 + 10));
  });

  test("zLayer ติดลบ: sort ตาม band ถูกต้อง (−1 < 0 < 1) ทุกจุด", () => {
    const MAX = DEPTH_MAX_TILE_COORD;
    const below = depthKey({ tx: -MAX, ty: -MAX }, 0); // จุดบนสุด layer 0
    const negBottom = depthKey({ tx: MAX, ty: MAX }, -1); // จุดล่างสุด layer −1
    expect(below).toBeGreaterThan(negBottom); // layer 0 ชนะ layer −1 เสมอ
    expect(depthKey({ tx: 0, ty: 0 }, -1)).toBeLessThan(depthKey({ tx: 0, ty: 0 }, 0));
  });
});

describe("R-1/R-2 fail-loud guards", () => {
  test("NaN ทุก entry point → throw TypeError", () => {
    expect(() => depthKey({ tx: NaN, ty: 0 })).toThrow(TypeError);
    expect(() => depthKey({ tx: 0, ty: NaN })).toThrow(TypeError);
    expect(() => depthKey({ tx: 0, ty: 0 }, NaN)).toThrow(TypeError);
  });

  test("Infinity ทุก entry point → throw TypeError", () => {
    expect(() => depthKey({ tx: Infinity, ty: 0 })).toThrow(TypeError);
    expect(() => depthKey({ tx: 0, ty: -Infinity })).toThrow(TypeError);
    expect(() => depthKey({ tx: 0, ty: 0 }, Infinity)).toThrow(TypeError);
  });

  test("range guard: 4096 ผ่าน, 4097 throw RangeError", () => {
    const MAX = DEPTH_MAX_TILE_COORD;
    expect(() => depthKey({ tx: MAX, ty: MAX })).not.toThrow();
    expect(() => depthKey({ tx: -MAX, ty: -MAX })).not.toThrow();
    expect(() => depthKey({ tx: MAX + 1, ty: 0 })).toThrow(RangeError);
    expect(() => depthKey({ tx: 0, ty: -(MAX + 1) })).toThrow(RangeError);
  });
});
