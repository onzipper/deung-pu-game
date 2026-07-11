import { describe, expect, test } from "vitest";
import {
  advanceShake,
  computeShakeOffset,
  createShakeState,
  triggerShake,
  type ScreenShakeLevelConfig,
} from "@/engine/render/screen-shake";

const LEVELS: ScreenShakeLevelConfig[] = [
  { amplitudePx: 0, durationMs: 0 },
  { amplitudePx: 4, durationMs: 160 },
  { amplitudePx: 9, durationMs: 260 },
];

/** rng คงที่ — ให้ผล offset deterministic ตรวจได้เป๊ะ */
const fixedRng = (v: number) => () => v;

describe("screen shake state/decay (pure, P1-06, GS §17.5)", () => {
  test("state เริ่มต้น = ไม่มี shake → offset {0,0} เสมอ", () => {
    const state = createShakeState();
    expect(computeShakeOffset(state, fixedRng(0.25))).toEqual({ sx: 0, sy: 0 });
  });

  test("trigger ตั้ง remainingMs/durationMs/amplitudePx ตาม level × amplitudeScale", () => {
    const state = createShakeState();
    triggerShake(state, 1, LEVELS, 1);
    expect(state.amplitudePx).toBe(4);
    expect(state.durationMs).toBe(160);
    expect(state.remainingMs).toBe(160);
  });

  test("amplitudeScale (quality tier) คูณ amplitude", () => {
    const state = createShakeState();
    triggerShake(state, 2, LEVELS, 0.5);
    expect(state.amplitudePx).toBe(4.5); // 9 * 0.5
  });

  test("level เกิน array clamp ที่ตัวสุดท้าย", () => {
    const state = createShakeState();
    triggerShake(state, 99, LEVELS, 1);
    expect(state.amplitudePx).toBe(9);
    expect(state.durationMs).toBe(260);
  });

  test("trigger แรงกว่า/นานกว่าของเดิมที่ยังค้าง → แทนที่", () => {
    const state = createShakeState();
    triggerShake(state, 1, LEVELS, 1); // amp 4
    triggerShake(state, 2, LEVELS, 1); // amp 9 > 4 → แทนที่
    expect(state.amplitudePx).toBe(9);
    expect(state.remainingMs).toBe(260);
  });

  test("trigger อ่อนกว่าระหว่างของเดิมยังไม่หมด → ของเดิมค้างต่อ (ไม่ถูกกลบ)", () => {
    const state = createShakeState();
    triggerShake(state, 2, LEVELS, 1); // amp 9
    triggerShake(state, 1, LEVELS, 1); // amp 4 < 9 → ไม่แทนที่
    expect(state.amplitudePx).toBe(9);
    expect(state.remainingMs).toBe(260);
  });

  test("advanceShake ลดเวลาแบบ real-time จนถึง 0", () => {
    const state = createShakeState();
    triggerShake(state, 1, LEVELS, 1); // duration 160
    advanceShake(state, 60);
    expect(state.remainingMs).toBe(100);
    advanceShake(state, 200);
    expect(state.remainingMs).toBe(0);
  });

  test("computeShakeOffset: decay เชิงเส้น (remaining/duration) คูณ amplitude, ทิศจาก rng", () => {
    const state = createShakeState();
    triggerShake(state, 1, LEVELS, 1); // amp 4, duration 160, remaining 160 (decay=1)
    const full = computeShakeOffset(state, fixedRng(0)); // angle = 0 → cos=1, sin=0
    expect(full.sx).toBeCloseTo(4, 6);
    expect(full.sy).toBeCloseTo(0, 6);

    advanceShake(state, 80); // remaining=80 → decay=0.5 → amp effective 2
    const half = computeShakeOffset(state, fixedRng(0));
    expect(half.sx).toBeCloseTo(2, 6);
  });

  test("remaining หมดแล้ว → offset {0,0} แม้ trigger ไปก่อนหน้า", () => {
    const state = createShakeState();
    triggerShake(state, 1, LEVELS, 1);
    advanceShake(state, 1000); // เกิน duration
    expect(computeShakeOffset(state, fixedRng(0.5))).toEqual({ sx: 0, sy: 0 });
  });

  test("level array ว่าง → trigger เป็น no-op", () => {
    const state = createShakeState();
    triggerShake(state, 1, [], 1);
    expect(state.remainingMs).toBe(0);
  });
});
