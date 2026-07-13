import { describe, expect, test } from "vitest";
import { computeHoldProgress, DEFAULT_HOLD_DURATION_MS } from "@/ui/components/hold-to-confirm";

describe("computeHoldProgress — hold-to-confirm timing (pure)", () => {
  test("elapsed 0 → progress 0, ยังไม่ done", () => {
    expect(computeHoldProgress(0, 1000)).toEqual({ progress: 0, done: false });
  });

  test("elapsed ครึ่งทาง → progress 0.5, ยังไม่ done", () => {
    expect(computeHoldProgress(500, 1000)).toEqual({ progress: 0.5, done: false });
  });

  test("elapsed ครบพอดี → progress 1, done", () => {
    expect(computeHoldProgress(1000, 1000)).toEqual({ progress: 1, done: true });
  });

  test("elapsed เกิน duration → clamp progress ที่ 1, done ยังเป็น true", () => {
    expect(computeHoldProgress(5000, 1000)).toEqual({ progress: 1, done: true });
  });

  test("elapsed ติดลบ (กัน clock skew) → clamp เป็น 0", () => {
    expect(computeHoldProgress(-100, 1000)).toEqual({ progress: 0, done: false });
  });

  test("durationMs <= 0 → ถือว่ายืนยันทันที ไม่ throw", () => {
    expect(computeHoldProgress(0, 0)).toEqual({ progress: 1, done: true });
    expect(computeHoldProgress(0, -50)).toEqual({ progress: 1, done: true });
  });

  test("DEFAULT_HOLD_DURATION_MS เป็นค่าบวกที่สมเหตุสมผล (>=500ms, <=2000ms)", () => {
    expect(DEFAULT_HOLD_DURATION_MS).toBeGreaterThanOrEqual(500);
    expect(DEFAULT_HOLD_DURATION_MS).toBeLessThanOrEqual(2000);
  });
});
