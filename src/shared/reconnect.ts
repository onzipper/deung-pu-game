// Reconnect pure logic (P1-07, GS §59.1 · TA §6) — **ไม่มี runtime dependency** (ไม่ import colyseus/pixi/React).
// import ได้ทั้ง client (`@/shared/reconnect`) และ server (relative `../src/shared/reconnect`).
// glue (colyseus allowReconnection / client.reconnect + backoff timer) อยู่ที่ MapRoom.ts / net-client.ts.
//
// §59.1 decision table (ล็อกแล้ว — ห้ามตีความใหม่):
//   reconnect ≤ grace + room เปิด + ตำแหน่งเดิม valid → resume (room/channel/ตำแหน่งเดิม)
//   เกิน grace / room ปิด / state corrupt / ตำแหน่ง invalid → safe camp ของ map
//   server state ปัจจุบัน = source of truth (ไม่ guarantee มอนเดิมครบ).

import type { ReconnectClientRetryConfig } from "@/engine/config";

/** จุดพิกัด tile (แกนเดียวกับ TilePoint.tx/ty) — เลี่ยง import engine coords ที่ shared. */
export interface ReconnectVec2 {
  tx: number;
  ty: number;
}

/** ผลการตัดสิน reconnect ตาม §59.1: กลับตำแหน่งเดิม หรือ ย้ายไป safe camp. */
export type ReconnectOutcome = "resume" | "safe_camp";

/** อินพุตของ decideReconnect — สภาพ ณ ตอน reconnect (ทั้งหมด boolean, ไม่มี side effect). */
export interface ReconnectDecisionInput {
  /** reconnect สำเร็จก่อน grace หมด (server ยัง hold seat/state) */
  withinGrace: boolean;
  /** ห้อง/channel เดิมยังเปิดอยู่ (ไม่ถูก dispose) */
  roomOpen: boolean;
  /** ตำแหน่งที่ server hold ไว้ยัง valid (walkable ตอนนี้) */
  positionValid: boolean;
}

/**
 * §59.1 decision (pure): resume เฉพาะเมื่อ within grace **และ** room เปิด **และ** ตำแหน่ง valid;
 * เงื่อนไขใดพลาด → safe camp. (severe-invalid → city fallback = P2, ยังไม่อยู่ใน scope นี้.)
 */
export function decideReconnect(input: ReconnectDecisionInput): ReconnectOutcome {
  return input.withinGrace && input.roomOpen && input.positionValid
    ? "resume"
    : "safe_camp";
}

/** ผลของ resolveSpawnPosition — ตำแหน่งสุดท้าย + ธงว่าถูกดันไป safe camp หรือไม่ (debug/log). */
export interface ResolvedSpawn {
  pos: ReconnectVec2;
  usedSafeCamp: boolean;
}

/**
 * เลือกตำแหน่ง spawn (pure, §59.1 "ตำแหน่งเดิม invalid → safe camp"): ใช้ requested ถ้า finite **และ**
 * walkable, ไม่งั้น snap ไป safe camp. server เรียกใน onJoin (source of truth ว่าตำแหน่งลงได้จริง),
 * ไม่ trust พิกัดที่ client ส่งมาลอย ๆ.
 */
export function resolveSpawnPosition(
  requested: ReconnectVec2,
  safeCamp: ReconnectVec2,
  isWalkable: (tx: number, ty: number) => boolean,
): ResolvedSpawn {
  if (
    Number.isFinite(requested.tx) &&
    Number.isFinite(requested.ty) &&
    isWalkable(requested.tx, requested.ty)
  ) {
    return { pos: { tx: requested.tx, ty: requested.ty }, usedSafeCamp: false };
  }
  return { pos: { tx: safeCamp.tx, ty: safeCamp.ty }, usedSafeCamp: true };
}

/**
 * ดีเลย์ (ms) ก่อน reconnect attempt ที่ N (0-indexed): exponential backoff = base × factor^N, cap ที่
 * maxDelayMs. attempt ติดลบ/ไม่ integer → clamp/floor (defensive).
 */
export function reconnectBackoffMs(
  attempt: number,
  cfg: ReconnectClientRetryConfig,
): number {
  const a = Math.max(0, Math.floor(attempt));
  const raw = cfg.baseDelayMs * Math.pow(cfg.backoffFactor, a);
  return Math.min(raw, cfg.maxDelayMs);
}

/** ยังควร retry reconnect อีกไหม (attempt 0-indexed ยังไม่ถึง maxAttempts). */
export function shouldRetryReconnect(
  attempt: number,
  cfg: ReconnectClientRetryConfig,
): boolean {
  return attempt < cfg.maxAttempts;
}
