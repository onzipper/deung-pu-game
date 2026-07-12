// Target engage state machine — pure decision logic (P1-09.1 follow-up, TA §17.3 walk-to-attack).
// Plain TS, ไม่ import pixi/engine runtime — ทดสอบได้ล้วน ๆ (pattern เดียวกับ
// src/engine/movement/path-follower.ts / src/game/combat/hit-test.ts).
//
// ปัญหาที่แก้: เดิม (P1-09) แตะมอนไกล → เดินเข้าไป → ถึงระยะ → ตี**ครั้งเดียว**แล้วจบ (app.ts เคลียร์
// target ทันทีหลังยิง requestAttack 1 ครั้ง). ต้องการ "ตีต่อเนื่อง" จนกว่า:
//   - เป้าตาย/หายไป → จบ (idle)
//   - เป้าขยับหลุดระยะ → กลับไปเดินเข้าใกล้ใหม่ (chase)
//   - manual override (WASD/คลิกที่อื่น) → ยกเลิกทันที (caller เซ็ต state = idle เอง)
//
// state machine มี 2 สถานะจริง (idle ไม่ถือเป็น "กำลัง engage" — caller เก็บแค่ optional state):
//   engaging (มี targetId ผูกอยู่) → ทุก tick ตัดสินจาก "อยู่ในระยะยิงไหม" ว่า attack หรือ chase.
// caller (app.ts) เป็นคนเรียก player.moveTo()/faceToward()/requestAttack()/cancelPath() จริง ๆ ตาม
// action ที่ฟังก์ชันนี้คืน — module นี้ไม่แตะ player/mob object ตรง ๆ (dependency inject ผ่าน context เฉย ๆ).

import type { TilePoint } from "@/engine/iso/coords";

/** เป้าที่กำลังจะประเมิน (resolve จาก mobView ก่อนเรียก stepEngage — null = ตาย/หายไปแล้ว). */
export interface EngageTarget {
  id: string;
  pos: TilePoint;
}

/** state ของการ engage 1 ชุด (ต่อ local player 1 คน). "idle" = ไม่มี target ผูกอยู่. */
export type EngageState = { status: "idle" } | { status: "engaging"; targetId: string };

/** สร้าง state เริ่มต้น (ไม่มี target) */
export const IDLE_ENGAGE_STATE: EngageState = { status: "idle" };

/** เริ่ม engage เป้าใหม่ (เรียกตอนคลิก/แตะมอน) */
export function startEngage(targetId: string): EngageState {
  return { status: "engaging", targetId };
}

/** ยกเลิก engage (manual override / คลิกที่อื่น / เป้าหาย) */
export function cancelEngage(): EngageState {
  return IDLE_ENGAGE_STATE;
}

export interface EngageContext {
  state: EngageState;
  /** เป้าที่ resolve แล้วสำหรับเฟรมนี้ (หา targetId ใน state ไม่เจอ = ตาย/หายไป → ส่ง null) */
  target: EngageTarget | null;
  playerPos: TilePoint;
  /** ระยะโจมตี (tile, euclidean — ตรงกับ skill.range ที่ app.ts ใช้ hit test/pick อยู่แล้ว) */
  attackRange: number;
  /**
   * true = ผู้เล่นมี path click-to-move กำลังเดินอยู่เฟรมนี้ (LocalPlayerHandle.isFollowingPath) —
   * ใช้ตัดสินว่าต้องสั่ง moveTo ใหม่ไหม (ไม่ replan ทุก frame ระหว่างที่ path เดิมยังพาไปหาเป้าอยู่).
   */
  hasActivePath: boolean;
}

/** action ที่ caller (app.ts) ต้องทำจริงกับ player ตามผลของ stepEngage รอบนี้. */
export type EngageAction =
  | { type: "none" }
  | { type: "chase"; pos: TilePoint }
  | { type: "attack"; pos: TilePoint };

export interface EngageResult {
  state: EngageState;
  action: EngageAction;
}

const NONE_ACTION: EngageAction = { type: "none" };

/**
 * ประเมิน 1 tick: idle → ไม่ทำอะไร. engaging ที่เป้าตาย/หายไป (target=null) → idle.
 * ยังอยู่ในระยะ attackRange → "attack" (caller ตี + คงอยู่ engaging ต่อ, ไม่ auto จบ — จบเมื่อเป้าตายจริง
 * ซึ่ง mobView จะไม่คืน target นั้นอีกแล้ว = frame ถัดไป target=null). เกินระยะ + ไม่มี path ที่กำลังเดิน
 * → "chase" (caller เรียก moveTo ใหม่ไปตามเป้าที่ขยับ). เกินระยะแต่ path เดิมยังพาไปอยู่ → "none" (รอ).
 */
export function stepEngage(ctx: EngageContext): EngageResult {
  if (ctx.state.status === "idle") {
    return { state: ctx.state, action: NONE_ACTION };
  }
  if (!ctx.target || ctx.target.id !== ctx.state.targetId) {
    return { state: cancelEngage(), action: NONE_ACTION };
  }

  const dx = ctx.target.pos.tx - ctx.playerPos.tx;
  const dy = ctx.target.pos.ty - ctx.playerPos.ty;
  const dist = Math.hypot(dx, dy);

  if (dist <= ctx.attackRange) {
    return { state: ctx.state, action: { type: "attack", pos: ctx.target.pos } };
  }
  if (!ctx.hasActivePath) {
    return { state: ctx.state, action: { type: "chase", pos: ctx.target.pos } };
  }
  return { state: ctx.state, action: NONE_ACTION };
}
