import { describe, expect, test } from "vitest";
import {
  advanceRemoteAttack,
  createRemoteAttackState,
  triggerRemoteAttack,
  type RemoteAttackState,
} from "@/engine/net/remote-attack";

describe("remote-attack — timing pure logic (event-driven attack playback)", () => {
  test("state เริ่มต้น = ไม่ได้โจมตี", () => {
    const state = createRemoteAttackState();
    expect(state.elapsedMs).toBeNull();
    expect(advanceRemoteAttack(state, 16, 300)).toBe(false);
  });

  test("trigger แล้ว เฟรมแรก (elapsed=0) ยัง 'attacking' อยู่ (เช็คก่อนเดินเวลา)", () => {
    const state = createRemoteAttackState();
    triggerRemoteAttack(state);
    expect(advanceRemoteAttack(state, 16, 300)).toBe(true);
    expect(state.elapsedMs).toBe(16);
  });

  test("ยังไม่ถึง duration → ยัง attacking หลายเฟรมติดกัน", () => {
    const state = createRemoteAttackState();
    triggerRemoteAttack(state);
    expect(advanceRemoteAttack(state, 100, 300)).toBe(true);
    expect(advanceRemoteAttack(state, 100, 300)).toBe(true);
    expect(state.elapsedMs).toBe(200);
  });

  test("แตะ duration พอดี → เฟรมนั้นยัง true แต่ state ถูกรีเซ็ต null ให้เฟรมถัดไป", () => {
    const state = createRemoteAttackState();
    triggerRemoteAttack(state);
    expect(advanceRemoteAttack(state, 300, 300)).toBe(true); // เฟรมที่ elapsed แตะ duration
    expect(state.elapsedMs).toBeNull();
    expect(advanceRemoteAttack(state, 16, 300)).toBe(false); // เฟรมถัดไป = จบคลิปแล้ว
  });

  test("เกิน duration ในเฟรมเดียว (dt กระโดด) → จบคลิปทันที, เฟรมนั้นยัง true", () => {
    const state = createRemoteAttackState();
    triggerRemoteAttack(state);
    expect(advanceRemoteAttack(state, 500, 300)).toBe(true);
    expect(state.elapsedMs).toBeNull();
  });

  test("trigger ซ้ำระหว่างเล่นอยู่ = รีสตาร์ทคลิปจากเฟรม 0", () => {
    const state = createRemoteAttackState();
    triggerRemoteAttack(state);
    advanceRemoteAttack(state, 250, 300); // เกือบจบ
    triggerRemoteAttack(state); // รีสตาร์ท
    expect(state.elapsedMs).toBe(0);
    expect(advanceRemoteAttack(state, 250, 300)).toBe(true); // ยังไม่จบเพราะรีสตาร์ทแล้ว
    expect(state.elapsedMs).toBe(250);
  });

  test("ไม่ mutate object อื่น — หลาย state อิสระต่อกัน", () => {
    const a: RemoteAttackState = createRemoteAttackState();
    const b: RemoteAttackState = createRemoteAttackState();
    triggerRemoteAttack(a);
    advanceRemoteAttack(a, 100, 300);
    expect(b.elapsedMs).toBeNull();
  });
});
