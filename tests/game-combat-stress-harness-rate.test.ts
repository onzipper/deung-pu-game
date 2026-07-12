import { describe, expect, test } from "vitest";
import { computeStressSpawnBatch } from "@/game/combat/stress-harness-rate";

describe("stress harness spawn-rate accumulator (pure, P1-06 §5)", () => {
  test("rate 10/วิ, dt 100ms (= 1 interval พอดี) → spawn 1 ครั้ง, remainder 0", () => {
    const out = computeStressSpawnBatch(0, 100, 10, 100);
    expect(out).toEqual({ spawnCount: 1, remainderMs: 0 });
  });

  test("rate 300/วิ (interval ~3.33ms), dt 16.6ms (~60fps) → spawn ~5 ครั้งต่อ frame", () => {
    const out = computeStressSpawnBatch(0, 16.6, 300, 40);
    expect(out.spawnCount).toBe(4); // floor(16.6 / 3.333..) = 4 (เศษพกไปรอบหน้า)
    expect(out.remainderMs).toBeGreaterThan(0);
    expect(out.remainderMs).toBeLessThan(1000 / 300);
  });

  test("สะสมหลาย frame แล้วรวม spawnCount ≈ rate ที่คาด (deterministic accumulator)", () => {
    let accum = 0;
    let total = 0;
    for (let i = 0; i < 60; i++) {
      // จำลอง 60 frame ที่ 16.6ms/frame ≈ 1 วินาที
      const out = computeStressSpawnBatch(accum, 16.6, 300, 1000);
      accum = out.remainderMs;
      total += out.spawnCount;
    }
    // 60 * 16.6ms ≈ 996ms ที่ rate 300/วิ → ควรได้ประมาณ 298-300 ครั้ง (ไม่ปัดเกิน rate จริง)
    expect(total).toBeGreaterThanOrEqual(295);
    expect(total).toBeLessThanOrEqual(300);
  });

  test("maxSpawnPerTick cap กัน spike ตอน dt กระโดดยาว (สลับ tab)", () => {
    const out = computeStressSpawnBatch(0, 5000, 300, 10); // dt กระโดด 5 วิ ที่ rate 300/วิ ควรได้ ~1500 ถ้าไม่ cap
    expect(out.spawnCount).toBe(10); // ติด cap
    expect(out.remainderMs).toBeLessThanOrEqual(1000 / 300); // ไม่สะสมหนี้เกิน 1 interval
  });

  test("rate <= 0 → ไม่ spawn เลย (ปิด harness)", () => {
    expect(computeStressSpawnBatch(50, 100, 0, 40)).toEqual({ spawnCount: 0, remainderMs: 0 });
    expect(computeStressSpawnBatch(50, 100, -5, 40)).toEqual({ spawnCount: 0, remainderMs: 0 });
  });

  test("dt เล็กกว่า 1 interval → spawn 0, remainder สะสม", () => {
    const out = computeStressSpawnBatch(0, 1, 10, 40); // interval 100ms, dt 1ms
    expect(out.spawnCount).toBe(0);
    expect(out.remainderMs).toBe(1);
  });
});
