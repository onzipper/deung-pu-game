import { beforeEach, describe, expect, test } from "vitest";
import {
  createInterpolationBuffer,
  type InterpolationBuffer,
} from "@/engine/net/interpolation";

// buffer มาตรฐานสำหรับเทสต์ — เวลาทั้งหมด inject ผ่าน push(t)/sampleAt(renderTime) → deterministic เต็ม.
const makeBuffer = (
  over: Partial<{ capacity: number; maxExtrapolationMs: number }> = {},
): InterpolationBuffer =>
  createInterpolationBuffer({
    capacity: over.capacity ?? 8,
    maxExtrapolationMs: over.maxExtrapolationMs ?? 100,
  });

describe("interpolation buffer — lerp ระหว่าง 2 snapshot", () => {
  let buf: InterpolationBuffer;
  beforeEach(() => {
    buf = makeBuffer();
    buf.push(0, 0, 0, "S", "walk");
    buf.push(100, 10, 4, "E", "walk");
  });

  test("กึ่งกลางเวลา → ตำแหน่งกึ่งกลาง (linear)", () => {
    const r = buf.sampleAt(50);
    expect(r).not.toBeNull();
    expect(r!.tx).toBeCloseTo(5);
    expect(r!.ty).toBeCloseTo(2);
    expect(r!.extrapolated).toBe(false);
  });

  test("25% เวลา → 25% ระยะ", () => {
    const r = buf.sampleAt(25)!;
    expect(r.tx).toBeCloseTo(2.5);
    expect(r.ty).toBeCloseTo(1);
  });

  test("ทิศ/anim เลือกจาก snapshot ที่ใหม่กว่า (b) ในช่วงคร่อม", () => {
    const r = buf.sampleAt(50)!;
    expect(r.direction).toBe("E"); // จาก snapshot t=100 ไม่ใช่ t=0 (S)
    expect(r.anim).toBe("walk");
  });

  test("ตรง snapshot ล่าสุดพอดี → ตำแหน่งล่าสุด (ไม่ extrapolate)", () => {
    const r = buf.sampleAt(100)!;
    expect(r.tx).toBeCloseTo(10);
    expect(r.ty).toBeCloseTo(4);
    expect(r.extrapolated).toBe(false);
  });
});

describe("interpolation buffer — edge: ว่าง / snapshot เดียว / เกิดใหม่", () => {
  test("buffer ว่าง → sampleAt คืน null", () => {
    expect(makeBuffer().sampleAt(1000)).toBeNull();
    expect(makeBuffer().size).toBe(0);
    expect(makeBuffer().newestTime).toBeNull();
  });

  test("snapshot เดียว → คงตำแหน่งนั้นทุก renderTime (ไม่ extrapolate)", () => {
    const buf = makeBuffer();
    buf.push(500, 7, 3, "N", "idle");
    for (const t of [0, 500, 100000]) {
      const r = buf.sampleAt(t)!;
      expect(r.tx).toBe(7);
      expect(r.ty).toBe(3);
      expect(r.extrapolated).toBe(false);
    }
  });

  test("renderTime เก่ากว่า snapshot แรก (เพิ่งเกิด) → clamp ที่ตำแหน่งแรก ไม่ลากจากไกล", () => {
    const buf = makeBuffer();
    // entity spawn ไกล ๆ ที่ t=1000; renderTime = now−bufferMs ยังอยู่ก่อนหน้านั้น
    buf.push(1000, 50, 50, "S", "idle");
    buf.push(1100, 51, 50, "E", "walk");
    const r = buf.sampleAt(500)!; // ก่อน snapshot แรก
    expect(r.tx).toBe(50);
    expect(r.ty).toBe(50);
    expect(r.extrapolated).toBe(false);
  });
});

describe("interpolation buffer — extrapolation + clamp เมื่อ buffer starved", () => {
  let buf: InterpolationBuffer;
  beforeEach(() => {
    buf = makeBuffer({ maxExtrapolationMs: 100 });
    buf.push(0, 0, 0, "E", "walk"); // velocity = (0.1, 0) tile/ms
    buf.push(100, 10, 0, "E", "walk");
  });

  test("เลย newest แต่ยังไม่เกิน maxExtrapolation → ประมาณต่อ (extrapolated=true)", () => {
    const r = buf.sampleAt(150)!; // overshoot 50ms < 100 → +5 tile
    expect(r.tx).toBeCloseTo(15);
    expect(r.ty).toBeCloseTo(0);
    expect(r.extrapolated).toBe(true);
  });

  test("ช่องว่างเกิน maxExtrapolation → clamp เวลา extrapolate (ไม่ลอยไกลเกิน)", () => {
    const r = buf.sampleAt(1000)!; // overshoot 900ms → clamp ที่ 100ms → +10 tile
    expect(r.tx).toBeCloseTo(20); // 10 + 0.1*100, ไม่ใช่ 10 + 0.1*900
    expect(r.extrapolated).toBe(true);
  });

  test("maxExtrapolationMs=0 → freeze ที่ newest (ไม่ extrapolate เลย)", () => {
    const b = makeBuffer({ maxExtrapolationMs: 0 });
    b.push(0, 0, 0, "E", "walk");
    b.push(100, 10, 0, "E", "walk");
    const r = b.sampleAt(500)!;
    expect(r.tx).toBeCloseTo(10);
    expect(r.extrapolated).toBe(false);
  });
});

describe("interpolation buffer — ordering / overflow / pooling", () => {
  test("push out-of-order (t เก่ากว่า newest) → drop, buffer ไม่เสียลำดับ", () => {
    const buf = makeBuffer();
    buf.push(100, 10, 0, "E", "walk");
    buf.push(50, 999, 999, "N", "idle"); // เก่ากว่า → drop
    expect(buf.size).toBe(1);
    expect(buf.newestTime).toBe(100);
    const r = buf.sampleAt(100)!;
    expect(r.tx).toBe(10); // ไม่ใช่ 999
  });

  test("push t ซ้ำ (เท่า newest) → drop (กัน duplicate)", () => {
    const buf = makeBuffer();
    buf.push(100, 10, 0, "E", "walk");
    buf.push(100, 20, 0, "E", "walk");
    expect(buf.size).toBe(1);
  });

  test("overflow เกิน capacity → เก็บ snapshot ใหม่สุด, oldest ถูกทิ้ง", () => {
    const buf = makeBuffer({ capacity: 3 });
    for (let i = 0; i < 6; i++) buf.push(i * 100, i, 0, "E", "walk");
    expect(buf.size).toBe(3); // เก็บ t=300,400,500
    expect(buf.newestTime).toBe(500);
    // sample กลาง 2 ตัวล่าสุด → lerp ระหว่าง i=4 (t=400) และ i=5 (t=500)
    const r = buf.sampleAt(450)!;
    expect(r.tx).toBeCloseTo(4.5);
    // t=500 ยังอยู่ (ไม่หลุดไปกับ oldest)
    const rNewest = buf.sampleAt(500)!;
    expect(rNewest.tx).toBeCloseTo(5);
  });

  test("clear → ว่างเปล่า", () => {
    const buf = makeBuffer();
    buf.push(0, 1, 1, "S", "idle");
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.sampleAt(0)).toBeNull();
  });

  test("SampleResult ถูก reuse (pooling — ไม่ new ต่อ sample)", () => {
    const buf = makeBuffer();
    buf.push(0, 0, 0, "S", "walk");
    buf.push(100, 10, 0, "E", "walk");
    const a = buf.sampleAt(30);
    const b = buf.sampleAt(70);
    expect(a).toBe(b); // reference เดียวกัน (mutate in place)
  });
});
