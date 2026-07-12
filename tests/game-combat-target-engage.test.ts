import { describe, expect, test } from "vitest";
import {
  cancelEngage,
  IDLE_ENGAGE_STATE,
  startEngage,
  stepEngage,
  type EngageContext,
} from "@/game/combat/target-engage";

const baseCtx = (overrides: Partial<EngageContext>): EngageContext => ({
  state: IDLE_ENGAGE_STATE,
  target: null,
  playerPos: { tx: 0, ty: 0 },
  attackRange: 1.2,
  hasActivePath: false,
  ...overrides,
});

describe("target-engage state machine (pure, P1-09.1, TA §17.3 walk-to-attack)", () => {
  test("idle state → action none เสมอ ไม่ว่า context จะเป็นยังไง", () => {
    const result = stepEngage(
      baseCtx({ target: { id: "m1", pos: { tx: 0.5, ty: 0 } } }),
    );
    expect(result.state).toEqual(IDLE_ENGAGE_STATE);
    expect(result.action).toEqual({ type: "none" });
  });

  test("engaging + เป้าอยู่ในระยะ → action attack + คง state engaging ต่อ (ไม่จบหลังตีครั้งเดียว)", () => {
    const state = startEngage("m1");
    const result = stepEngage(
      baseCtx({
        state,
        target: { id: "m1", pos: { tx: 1.0, ty: 0 } }, // dist 1.0 <= range 1.2
        attackRange: 1.2,
      }),
    );
    expect(result.action).toEqual({ type: "attack", pos: { tx: 1.0, ty: 0 } });
    expect(result.state).toEqual(state); // ยัง engaging targetId เดิม — ตีต่อได้เฟรมถัดไป
  });

  test("engaging + เป้าเกินระยะ + ไม่มี path กำลังเดิน → action chase", () => {
    const state = startEngage("m1");
    const result = stepEngage(
      baseCtx({
        state,
        target: { id: "m1", pos: { tx: 3.0, ty: 0 } },
        attackRange: 1.2,
        hasActivePath: false,
      }),
    );
    expect(result.action).toEqual({ type: "chase", pos: { tx: 3.0, ty: 0 } });
    expect(result.state).toEqual(state);
  });

  test("engaging + เป้าเกินระยะ + มี path กำลังเดินอยู่แล้ว → action none (ไม่ replan ซ้ำทุกเฟรม)", () => {
    const state = startEngage("m1");
    const result = stepEngage(
      baseCtx({
        state,
        target: { id: "m1", pos: { tx: 3.0, ty: 0 } },
        attackRange: 1.2,
        hasActivePath: true,
      }),
    );
    expect(result.action).toEqual({ type: "none" });
    expect(result.state).toEqual(state);
  });

  test("engaging + target=null (ตาย/หายไป) → state กลับ idle, action none", () => {
    const state = startEngage("m1");
    const result = stepEngage(baseCtx({ state, target: null }));
    expect(result.state).toEqual(IDLE_ENGAGE_STATE);
    expect(result.action).toEqual({ type: "none" });
  });

  test("engaging + target ที่ resolve มาเป็นคนละ id (targetId เปลี่ยนเป้าโดยไม่ผ่าน startEngage) → idle", () => {
    const state = startEngage("m1");
    const result = stepEngage(
      baseCtx({ state, target: { id: "m2", pos: { tx: 0.5, ty: 0 } } }),
    );
    expect(result.state).toEqual(IDLE_ENGAGE_STATE);
  });

  test("ระยะเท่ากับ attackRange เป๊ะ → ถือว่าโดน (attack, <=)", () => {
    const state = startEngage("m1");
    const result = stepEngage(
      baseCtx({
        state,
        target: { id: "m1", pos: { tx: 1.2, ty: 0 } },
        attackRange: 1.2,
      }),
    );
    expect(result.action.type).toBe("attack");
  });

  test("cancelEngage() คืน idle state เสมอ", () => {
    expect(cancelEngage()).toEqual(IDLE_ENGAGE_STATE);
  });

  test("startEngage(id) สร้าง state engaging ตาม id ที่ให้", () => {
    expect(startEngage("abc")).toEqual({ status: "engaging", targetId: "abc" });
  });
});
