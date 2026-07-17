import { describe, expect, test } from "vitest";
import {
  advanceCameraFlash,
  computeCameraFlashAlpha,
  createCameraFlashState,
  triggerCameraFlash,
  type CameraFlashStyleConfig,
} from "@/game/combat/camera-flash";

const CRIT_STYLE: CameraFlashStyleConfig = { color: 0xfff066, peakAlpha: 0.35, durationMs: 200 };
const SELF_HIT_STYLE: CameraFlashStyleConfig = { color: 0xff2222, peakAlpha: 0.2, durationMs: 150 };

describe("camera flash state/decay (pure, Combat Juice F5, mirrors screen-shake pattern)", () => {
  test("state เริ่มต้น = ไม่มี flash → alpha 0", () => {
    const state = createCameraFlashState();
    expect(computeCameraFlashAlpha(state)).toBe(0);
  });

  test("trigger ตั้ง remainingMs/durationMs/peakAlpha/color ตาม style", () => {
    const state = createCameraFlashState();
    triggerCameraFlash(state, CRIT_STYLE);
    expect(state.remainingMs).toBe(200);
    expect(state.durationMs).toBe(200);
    expect(state.peakAlpha).toBe(0.35);
    expect(state.color).toBe(0xfff066);
    expect(computeCameraFlashAlpha(state)).toBeCloseTo(0.35, 6);
  });

  test("trigger แรงกว่าของเดิมที่ยังค้าง → แทนที่", () => {
    const state = createCameraFlashState();
    triggerCameraFlash(state, SELF_HIT_STYLE); // peak 0.2
    triggerCameraFlash(state, CRIT_STYLE); // peak 0.35 > 0.2 → แทนที่
    expect(state.peakAlpha).toBe(0.35);
    expect(state.remainingMs).toBe(200);
  });

  test("trigger อ่อนกว่าระหว่างของเดิมยังไม่หมด → ของเดิมค้างต่อ", () => {
    const state = createCameraFlashState();
    triggerCameraFlash(state, CRIT_STYLE); // peak 0.35
    triggerCameraFlash(state, SELF_HIT_STYLE); // peak 0.2 < 0.35 → ไม่แทนที่
    expect(state.peakAlpha).toBe(0.35);
    expect(state.durationMs).toBe(200);
  });

  test("peakAlpha ≤ 0 หรือ durationMs ≤ 0 → no-op", () => {
    const state = createCameraFlashState();
    triggerCameraFlash(state, { color: 0xffffff, peakAlpha: 0, durationMs: 200 });
    expect(state.remainingMs).toBe(0);
    triggerCameraFlash(state, { color: 0xffffff, peakAlpha: 0.5, durationMs: 0 });
    expect(state.remainingMs).toBe(0);
  });

  test("advanceCameraFlash decay real-time, alpha ลดเชิงเส้นตาม remaining/duration", () => {
    const state = createCameraFlashState();
    triggerCameraFlash(state, CRIT_STYLE); // peak 0.35, duration 200
    advanceCameraFlash(state, 100); // remaining 100 → decay 0.5
    expect(computeCameraFlashAlpha(state)).toBeCloseTo(0.175, 6);
    advanceCameraFlash(state, 1000);
    expect(computeCameraFlashAlpha(state)).toBe(0);
  });
});
