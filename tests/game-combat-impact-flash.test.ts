import { describe, expect, test } from "vitest";
import {
  advanceImpactFlash,
  computeImpactFlashFactor,
  createImpactFlashState,
  lerpColor,
  triggerImpactFlash,
  type ImpactFlashStyleConfig,
} from "@/game/combat/impact-flash";

const STYLE_NORMAL: ImpactFlashStyleConfig = { color: 0xff4444, durationMs: 100 };
const STYLE_CRIT: ImpactFlashStyleConfig = { color: 0xfff066, durationMs: 160 };

describe("impact flash state (pure, Combat Juice F5)", () => {
  test("state เริ่มต้น = ไม่มี flash → factor 0", () => {
    const state = createImpactFlashState();
    expect(computeImpactFlashFactor(state)).toBe(0);
  });

  test("trigger ตั้ง remainingMs/durationMs/color ตาม style", () => {
    const state = createImpactFlashState();
    triggerImpactFlash(state, STYLE_NORMAL);
    expect(state.remainingMs).toBe(100);
    expect(state.durationMs).toBe(100);
    expect(state.color).toBe(0xff4444);
    expect(computeImpactFlashFactor(state)).toBe(1);
  });

  test("trigger ซ้ำระหว่างของเดิมยังไม่หมด → แทนที่เสมอ (ต่างจาก screen-shake)", () => {
    const state = createImpactFlashState();
    triggerImpactFlash(state, STYLE_CRIT); // 160ms
    advanceImpactFlash(state, 100); // เหลือ 60ms
    triggerImpactFlash(state, STYLE_NORMAL); // แทนที่แม้ duration สั้นกว่า
    expect(state.remainingMs).toBe(100);
    expect(state.durationMs).toBe(100);
    expect(state.color).toBe(0xff4444);
  });

  test("durationMs ≤ 0 → no-op (ปิด effect นี้)", () => {
    const state = createImpactFlashState();
    triggerImpactFlash(state, { color: 0xffffff, durationMs: 0 });
    expect(state.remainingMs).toBe(0);
  });

  test("advanceImpactFlash decay real-time จนถึง 0, factor ลดเชิงเส้น", () => {
    const state = createImpactFlashState();
    triggerImpactFlash(state, STYLE_NORMAL); // 100ms
    advanceImpactFlash(state, 50);
    expect(computeImpactFlashFactor(state)).toBeCloseTo(0.5, 6);
    advanceImpactFlash(state, 1000);
    expect(computeImpactFlashFactor(state)).toBe(0);
  });
});

describe("lerpColor (pure RGB lerp)", () => {
  test("t=0 → base เป๊ะ, t=1 → target เป๊ะ", () => {
    expect(lerpColor(0xffffff, 0xff0000, 0)).toBe(0xffffff);
    expect(lerpColor(0xffffff, 0xff0000, 1)).toBe(0xff0000);
  });

  test("t=0.5 → กึ่งกลางแต่ละ channel", () => {
    expect(lerpColor(0x000000, 0xff0000, 0.5)).toBe(0x800000);
  });

  test("clamp t นอกช่วง [0,1]", () => {
    expect(lerpColor(0x000000, 0xff0000, -1)).toBe(0x000000);
    expect(lerpColor(0x000000, 0xff0000, 2)).toBe(0xff0000);
  });
});
