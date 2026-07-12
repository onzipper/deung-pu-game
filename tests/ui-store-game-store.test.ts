import { describe, expect, test, vi } from "vitest";
import {
  createHudPublisher,
  gameStore,
  INITIAL_HUD_STATE,
  resetHudState,
  selectDebugInfo,
  type HudState,
} from "@/ui/store/game-store";
import { IDLE_NET_DEBUG_INFO, type EngineDebugInfo } from "@/engine/runtime/debug-info";

// P2-01: Zustand bridge — game loop (engine) → publish (throttled) → store → React subscribe (docs/context/ui.md).
// เทสต์นี้ pure ล้วน: ไม่ render React/pixi — publisher inject writer เอง (ไม่แตะ gameStore singleton จริง
// ยกเว้น describe บล็อกสุดท้ายที่ตั้งใจเช็ค singleton โดยเฉพาะ + resetHudState คืนสภาพก่อนออกทุกครั้ง).

const INFO_A: EngineDebugInfo = {
  fps: 60,
  playerTile: { tx: 1, ty: 2 },
  pointerTile: null,
  entityCount: 3,
  net: IDLE_NET_DEBUG_INFO,
};

const INFO_B: EngineDebugInfo = {
  fps: 30,
  playerTile: { tx: 5, ty: 5 },
  pointerTile: { tx: 5, ty: 5 },
  entityCount: 7,
  net: IDLE_NET_DEBUG_INFO,
};

describe("selectDebugInfo", () => {
  test("อ่าน field debugInfo ตรง ๆ", () => {
    const state: HudState = { debugInfo: INFO_A };
    expect(selectDebugInfo(state)).toBe(INFO_A);
  });

  test("null เมื่อยังไม่ publish", () => {
    expect(selectDebugInfo(INITIAL_HUD_STATE)).toBeNull();
  });
});

describe("createHudPublisher — throttle (pure, clock inject)", () => {
  test("publish ครั้งแรกเสมอ (lastPublishMs ยังไม่มี)", () => {
    const writer = vi.fn();
    const publisher = createHudPublisher(250, writer);
    publisher.publish(0, () => ({ debugInfo: INFO_A }));
    expect(writer).toHaveBeenCalledTimes(1);
    expect(writer).toHaveBeenCalledWith({ debugInfo: INFO_A });
  });

  test("publish ถี่กว่า interval → ถูก drop (ไม่เรียก writer/build)", () => {
    const writer = vi.fn();
    const build = vi.fn(() => ({ debugInfo: INFO_B }));
    const publisher = createHudPublisher(250, writer);
    publisher.publish(0, () => ({ debugInfo: INFO_A }));
    publisher.publish(100, build); // ยังไม่ถึง 250ms นับจากครั้งก่อน
    publisher.publish(249, build);
    expect(writer).toHaveBeenCalledTimes(1);
    expect(build).not.toHaveBeenCalled(); // thunk ต้องไม่ถูกเรียกเลยตอนโดน drop (กัน alloc เปล่าประโยชน์)
  });

  test("publish ถึงคิว interval → ผ่านอีกครั้ง", () => {
    const writer = vi.fn();
    const publisher = createHudPublisher(250, writer);
    publisher.publish(0, () => ({ debugInfo: INFO_A }));
    publisher.publish(250, () => ({ debugInfo: INFO_B })); // ครบพอดี = due
    expect(writer).toHaveBeenCalledTimes(2);
    expect(writer).toHaveBeenLastCalledWith({ debugInfo: INFO_B });
  });

  test("ไม่มี default writer แตะ gameStore singleton โดยไม่ตั้งใจ — inject writer ต้องถูกใช้แทนเสมอ", () => {
    const writer = vi.fn();
    const publisher = createHudPublisher(0, writer);
    publisher.publish(0, () => ({ debugInfo: INFO_A }));
    expect(gameStore.getState().debugInfo).toBeNull(); // singleton ไม่ถูกแตะ
    resetHudState();
  });
});

describe("gameStore singleton — default writer เขียนจริง", () => {
  test("publisher ไม่ inject writer → เขียนลง gameStore singleton", () => {
    resetHudState();
    const publisher = createHudPublisher(0);
    publisher.publish(0, () => ({ debugInfo: INFO_A }));
    expect(gameStore.getState().debugInfo).toEqual(INFO_A);
    resetHudState();
    expect(gameStore.getState()).toEqual(INITIAL_HUD_STATE);
  });
});
