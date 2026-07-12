import { describe, expect, test } from "vitest";
import {
  INITIAL_DEBUG_OVERLAY_STATE,
  isDebugToggleKey,
  toggleDepthDebug,
  toggleVisible,
  type DebugOverlayState,
} from "@/ui/debug-overlay-logic";

describe("debug overlay logic — isDebugToggleKey (P0-11 F3 shortcut)", () => {
  test("F3 = true", () => {
    expect(isDebugToggleKey("F3")).toBe(true);
  });

  test("คีย์อื่นไม่ trigger (กันชน F12 devtools ฯลฯ)", () => {
    expect(isDebugToggleKey("F12")).toBe(false);
    expect(isDebugToggleKey("Space")).toBe(false);
    expect(isDebugToggleKey("")).toBe(false);
  });
});

describe("debug overlay logic — toggle reducers (pure)", () => {
  test("toggleVisible สลับ visible โดยไม่แตะ depthDebug", () => {
    const start: DebugOverlayState = { visible: true, depthDebug: true };
    expect(toggleVisible(start)).toEqual({ visible: false, depthDebug: true });
    expect(toggleVisible(toggleVisible(start))).toEqual(start);
  });

  test("toggleDepthDebug สลับ depthDebug โดยไม่แตะ visible", () => {
    const start: DebugOverlayState = { visible: false, depthDebug: false };
    expect(toggleDepthDebug(start)).toEqual({ visible: false, depthDebug: true });
  });

  test("reducer เป็น pure — ไม่ mutate state เดิม", () => {
    const start: DebugOverlayState = { visible: true, depthDebug: false };
    const next = toggleVisible(start);
    expect(start).toEqual({ visible: true, depthDebug: false });
    expect(next).not.toBe(start);
  });

  test("INITIAL_DEBUG_OVERLAY_STATE เริ่ม depthDebug=false (ห้ามกระทบ perf ตอนปิด)", () => {
    expect(INITIAL_DEBUG_OVERLAY_STATE.depthDebug).toBe(false);
  });
});
