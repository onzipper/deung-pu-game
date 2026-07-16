// Net sync — **pure** helpers (no colyseus, no pixi, no React/Next). unit-testable core ของ P0-07.
// glue (colyseus.js / pixi entity) อยู่ใน net-client.ts / remote-player-manager.ts; ที่นี่คือ logic ล้วน.

import type { Direction } from "@/engine/movement/direction";
import type {
  MoveMessage,
  PlayerSnapshot,
  WirePlayerAnim,
  WirePlayerDirection,
} from "@/shared/net-protocol";
import {
  CHARACTER_ACTOR_ROOM_REDIRECT_CODE,
  CHARACTER_ACTOR_ROOM_REDIRECT_PREFIX,
  CHARACTER_WORLD_CAPACITY_CODE,
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

/**
 * Resolve the stable character actor controlled by this transport session. New servers publish the binding in
 * room state; the fallback preserves compatibility with an older server where player keys were session ids.
 */
export function resolveSelfActorId(
  controllerSessionId: string,
  controllers: { get(key: string): string | undefined | null } | null | undefined,
): string {
  const actorId = controllers?.get(controllerSessionId);
  return typeof actorId === "string" && actorId.length > 0 ? actorId : controllerSessionId;
}

/** Extract an authenticated actor-room redirect from a Colyseus matchmaking error. */
export function parseCharacterActorRoomRedirect(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const record = error as { code?: unknown; message?: unknown };
  if (Number(record.code) !== CHARACTER_ACTOR_ROOM_REDIRECT_CODE || typeof record.message !== "string") {
    return null;
  }
  const start = record.message.indexOf(CHARACTER_ACTOR_ROOM_REDIRECT_PREFIX);
  if (start < 0) return null;
  const roomId = record.message
    .slice(start + CHARACTER_ACTOR_ROOM_REDIRECT_PREFIX.length)
    .match(/^[A-Za-z0-9_-]+/)?.[0];
  return roomId && roomId.length > 0 ? roomId : null;
}

/** A retained actor consumed the last world seat; create a new channel instead of retrying that room. */
export function isCharacterWorldCapacityError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return Number((error as { code?: unknown }).code) === CHARACTER_WORLD_CAPACITY_CODE;
}

/**
 * PR5-fix (server-owned bot "warp"): after a successful join/reconnect/4216-redirect the room we actually
 * landed in can be a DIFFERENT map's room than the one the client loaded (joinOptions.mapId) — the server
 * moved the real actor to the city-hub while we booted. Compare the room's authoritative `state.mapId`
 * against the loaded map and return the map the client must re-enter on, or null when they already match
 * (or the server hasn't published a map yet). Pure — net-client fires onMapMismatch(result) once per
 * connection when non-null; loaded scene otherwise renders the wrong map under the authoritative actor.
 */
export function resolveMapReentry(
  loadedMapId: string,
  serverMapId: string | null | undefined,
): string | null {
  if (typeof serverMapId !== "string" || serverMapId.length === 0) return null;
  return serverMapId === loadedMapId ? null : serverMapId;
}

/**
 * PR5-fix loop-guard: decide the next action when a map mismatch is detected, given how many consecutive
 * re-entries have already happened. "reenter" until the cap, then "abort" (caller surfaces the offline
 * connection UX). This breaks a pathological loop where the actor keeps warping between our reload windows,
 * so every fresh join lands on yet another map. Pure; the caller owns the counter (it must survive the
 * world remount each re-entry performs).
 */
export function planMapReentry(
  retriesSoFar: number,
  maxRetries: number,
): "reenter" | "abort" {
  return retriesSoFar >= maxRetries ? "abort" : "reenter";
}

/**
 * ควรส่ง MSG_MOVE ขึ้น server ไหม (fix issue #1/#2): ต้อง online **และ** adopt ตำแหน่ง authoritative
 * ของตัวเองจาก server แล้ว (self เข้า room state ครั้งแรกต่อ 1 connection).
 *
 * ทำไม: `snapshotChanged(null, snap)` = true เสมอ → ถ้าไม่ gate ตรงนี้ client จะยิง move ก้าวแรก
 * จาก **spawn ของ client** ก่อนรู้ตำแหน่งจริงที่ server hold (reconnect within grace = ตำแหน่งเดิม
 * ก่อน refresh). ผล: (1) server มองเป็น teleport/speed → correction snap กลับ = "วาร์ปกลับจุดเดิม";
 * (2) server ยังยึดตำแหน่ง hold → client เดินเหยียบ exit marker แต่ server ไม่เห็น client ใน exit area
 * → MSG_MAP_TRANSITION ไม่ยิง. adopt ก่อนแล้วค่อยส่ง = ตำแหน่ง client/server ตรงกันตั้งแต่ก้าวแรก.
 */
export function canSendLocalMove(
  state: ConnectionState,
  selfAdopted: boolean,
): boolean {
  return state === "online" && selfAdopted;
}
