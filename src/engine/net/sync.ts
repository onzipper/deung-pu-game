// Net sync — **pure** helpers (no colyseus, no pixi, no React/Next). unit-testable core ของ P0-07.
// glue (colyseus.js / pixi entity) อยู่ใน net-client.ts / remote-player-manager.ts; ที่นี่คือ logic ล้วน.

import type { Direction } from "@/engine/movement/direction";
import type {
  MoveMessage,
  PlayerSnapshot,
  WirePlayerAnim,
  WirePlayerDirection,
} from "@/shared/net-protocol";

/** 8 ทิศที่ valid (ตรง Direction). ใช้ coerce ค่า wire ที่อาจเพี้ยน (defensive, P1 มี validation จริง). */
const VALID_DIRECTIONS: readonly Direction[] = [
  "S",
  "SW",
  "W",
  "NW",
  "N",
  "NE",
  "E",
  "SE",
];

/** wire string → Direction (fallback "S" ถ้าค่าเพี้ยน) — กัน state จาก network ทำ animator throw. */
export function coerceDirection(value: string): WirePlayerDirection {
  return (VALID_DIRECTIONS as readonly string[]).includes(value)
    ? (value as WirePlayerDirection)
    : "S";
}

/** wire string → anim (fallback "idle"). */
export function coerceAnim(value: string): WirePlayerAnim {
  return value === "walk" ? "walk" : "idle";
}

/**
 * ควรส่ง position update ไหม — เทียบ snapshot ล่าสุดที่ส่งไปกับปัจจุบัน.
 * ส่งเมื่อ: ตำแหน่งขยับเกิน epsilon (tile) **หรือ** ทิศเปลี่ยน **หรือ** anim เปลี่ยน.
 * กันการ spam idle frame (bandwidth × player²), tech §6.
 */
export function snapshotChanged(
  prev: PlayerSnapshot | null,
  next: PlayerSnapshot,
  epsilon: number,
): boolean {
  if (prev === null) return true;
  if (prev.direction !== next.direction) return true;
  if (prev.anim !== next.anim) return true;
  return (
    Math.abs(prev.tx - next.tx) > epsilon ||
    Math.abs(prev.ty - next.ty) > epsilon
  );
}

/**
 * throttle timer แบบ accumulator (pure). เรียกทุก frame ด้วย dt (ms) →
 * คืน { fire, remainderMs }: fire=true เมื่อครบ 1 ช่วง (1000/hz), แล้ว carry เศษต่อ.
 * caller เก็บ remainderMs ไว้เรียกครั้งถัดไป. clamp กัน spiral-of-death เมื่อ dt กระโดด (สลับ tab).
 */
export function advanceSendTimer(
  accumMs: number,
  dtMs: number,
  intervalMs: number,
): { fire: boolean; remainderMs: number } {
  const total = accumMs + dtMs;
  if (total < intervalMs) return { fire: false, remainderMs: total };
  // fire ครั้งเดียวต่อ frame (ไม่ยิงรัวชดเชย); carry เศษ < interval
  return { fire: true, remainderMs: Math.min(total - intervalMs, intervalMs) };
}

/** สร้าง MoveMessage จากสถานะ local player (position tile ต่อเนื่อง + facing + anim). */
export function toMoveMessage(
  tx: number,
  ty: number,
  direction: WirePlayerDirection,
  anim: WirePlayerAnim,
): MoveMessage {
  return { tx, ty, direction, anim };
}

/**
 * สถานะการเชื่อมต่อ net (shared shape — net-client.ts alias เป็น NetConnectionState).
 * P1-07: เพิ่ม "reconnecting" — ws หลุดแต่ยังพยายาม reconnect เข้า seat เดิมใน grace (debug overlay โชว์).
 */
export type ConnectionState =
  | "idle"
  | "connecting"
  | "online"
  | "reconnecting"
  | "offline";

/**
 * จำนวนผู้เล่นทั้งหมดในห้อง (รวมตัวเอง) จาก connection state + remoteCount — pure logic
 * เบื้องหลัง getNetDebugInfo() (P0-08 debug overlay). เฉพาะ online เท่านั้นที่มีห้องจริง; อื่น ๆ
 * (รวม reconnecting ที่ยังไม่กลับเข้าห้อง) = 0.
 */
export function computePlayerCount(
  state: ConnectionState,
  remoteCount: number,
): number {
  return state === "online" ? remoteCount + 1 : 0;
}
