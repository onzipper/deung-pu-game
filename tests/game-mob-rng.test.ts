import { describe, expect, test } from "vitest";
import { createLcgRng, defaultRng } from "@/game/mob/rng";

describe("createLcgRng — seeded deterministic RNG", () => {
  test("seed เดียวกัน → sequence เดียวกันเป๊ะ", () => {
    const a = createLcgRng(42);
    const b = createLcgRng(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  test("seed ต่างกัน → sequence ต่างกัน", () => {
    const a = createLcgRng(1);
    const b = createLcgRng(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  test("ทุกค่าอยู่ใน [0,1)", () => {
    const rng = createLcgRng(7);
    for (let i = 0; i < 500; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("defaultRng — runtime RNG", () => {
  test("คืนค่า [0,1) (สโมค — ไม่ deterministic ไม่ test ค่าตรง ๆ)", () => {
    const v = defaultRng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});
