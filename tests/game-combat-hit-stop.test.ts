import { describe, expect, test } from "vitest";
import {
  advanceHitStop,
  computeHitStopTimeScale,
  createHitStopState,
  triggerHitStop,
} from "@/game/combat/hit-stop";

const DURATIONS = [0, 60, 140]; // level 0/1/2 (ตัวอย่างจาก DEFAULT_COMBAT_FEEL_CONFIG)

describe("hit-stop state/timescale (pure, P1-06, GS §17.5)", () => {
  test("state เริ่มต้น = ไม่มี hit stop → timeScale ปกติ (1)", () => {
    const state = createHitStopState();
    expect(computeHitStopTimeScale(state, 0.05)).toBe(1);
  });

  test("trigger level ใน array ตั้ง remainingMs = duration ของ level นั้น", () => {
    const state = createHitStopState();
    triggerHitStop(state, 2, DURATIONS);
    expect(state.remainingMs).toBe(140);
    expect(computeHitStopTimeScale(state, 0.05)).toBe(0.05);
  });

  test("level เกิน array clamp ที่ตัวสุดท้าย", () => {
    const state = createHitStopState();
    triggerHitStop(state, 99, DURATIONS);
    expect(state.remainingMs).toBe(140);
  });

  test("level ติดลบ clamp ที่ 0", () => {
    const state = createHitStopState();
    triggerHitStop(state, -5, DURATIONS);
    expect(state.remainingMs).toBe(0);
    expect(computeHitStopTimeScale(state, 0.05)).toBe(1); // remaining=0 → ปกติ
  });

  test("stacking: trigger level ต่ำระหว่างของเดิม (level สูง) ยังค้าง → ใช้ค่ามากสุด (ไม่บวกสะสม)", () => {
    const state = createHitStopState();
    triggerHitStop(state, 2, DURATIONS); // 140ms
    triggerHitStop(state, 1, DURATIONS); // 60ms < 140 → ไม่ลด
    expect(state.remainingMs).toBe(140);

    triggerHitStop(state, 2, DURATIONS); // trigger ซ้อน level เดิม → ไม่บวกเป็น 280
    expect(state.remainingMs).toBe(140);
  });

  test("advanceHitStop ลดเวลาแบบ real-time จนถึง 0 (clamp ไม่ติดลบ)", () => {
    const state = createHitStopState();
    triggerHitStop(state, 1, DURATIONS); // 60ms
    advanceHitStop(state, 40);
    expect(state.remainingMs).toBe(20);
    advanceHitStop(state, 100); // เกินที่เหลือ
    expect(state.remainingMs).toBe(0);
    expect(computeHitStopTimeScale(state, 0.05)).toBe(1);
  });

  test("array ว่าง → duration 0 เสมอ (ไม่ throw)", () => {
    const state = createHitStopState();
    triggerHitStop(state, 1, []);
    expect(state.remainingMs).toBe(0);
  });
});
