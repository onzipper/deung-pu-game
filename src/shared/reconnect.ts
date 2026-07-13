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

// ── Cross-reload rejoin (P1-07-fix, §59.1) ──────────────────────────────────
// ปัญหาเดิม: reconnectionToken เก็บใน memory ของ net-client เท่านั้น → refresh/ปิดแท็บ = token หาย →
// หน้าใหม่ join เป็นผู้เล่นใหม่เสมอ (ไม่กลับ seat เดิม) + server ยัง hold ghost seat 30s → refresh สะสมผี
// จนห้องเต็ม → แท็บใหม่โดนแยกไป channel อื่น = 2 แท็บมองไม่เห็นกัน. แก้: persist token ลง sessionStorage
// (per-tab) → boot ลอง reconnect เข้า seat เดิมก่อน = reclaim ghost แทนเพิ่มผู้เล่นใหม่ (ไม่สะสมผี/ไม่แยกห้อง).

/**
 * record ที่เก็บลง per-tab storage (sessionStorage) เพื่อให้หน้าใหม่หลัง refresh/reopen reconnect เข้า
 * seat เดิมได้. เก็บ context พอให้ตัดสินว่า token ยังใช้ได้กับ server/map/party ปัจจุบัน + ยังไม่หมดอายุ
 * (อายุ < graceSeconds นับจาก savedAtMs). **ห้ามใช้ localStorage** (2 แท็บจะแย่ง token → kick กันเอง).
 */
export interface StoredReconnectRecord {
  /** colyseus reconnection token (room.reconnectionToken) */
  token: string;
  /** เวลา (ms, epoch) ที่ persist ล่าสุด — ประเมินอายุ token เทียบ grace window (§59.1) */
  savedAtMs: number;
  /** server url ที่ token ผูกอยู่ — ต่าง server = token ใช้ไม่ได้ */
  serverUrl: string;
  /** map ของ room ที่ token ผูกอยู่ — boot เข้าคนละ map = ไม่ reconnect (กันดึงกลับ room map เก่า) */
  mapId: string;
  /** partyId ของ channel ที่ token ผูกอยู่ — party เปลี่ยน = ไม่ reconnect */
  partyId: string;
}

/** context ณ ตอน boot/join ที่ใช้ประเมิน token ที่เก็บไว้ (planRejoin). */
export interface RejoinContext {
  nowMs: number;
  serverUrl: string;
  mapId: string;
  partyId: string;
  /** grace window (วินาที) ที่ server hold seat (§59.1) — token เก่ากว่านี้ = หมดสิทธิ์ reconnect */
  graceSeconds: number;
}

/** แผน boot/join: reconnect เข้า seat เดิม (token สด) หรือ fresh join ปกติ. */
export type RejoinPlan =
  | { action: "reconnect"; token: string }
  | { action: "fresh" };

/**
 * ตัดสิน (pure): boot/join ควร reconnect เข้า seat เดิม หรือ fresh join. reconnect เฉพาะเมื่อ token
 * มีจริง **และ** server/map/party ตรง context ปัจจุบัน **และ** อายุ < grace. เงื่อนไขใดพลาด → fresh
 * (net-client ล้าง token แล้ว join ใหม่). ไม่มี side effect. หมายเหตุ: อายุนับจาก savedAtMs — net-client
 * re-persist ตอน page unload (pagehide) ให้ timestamp สด แม้ session ยาวเกิน grace (grace ฝั่ง server
 * นับจากตอนหลุดจริง = เกือบ = pagehide).
 */
export function planRejoin(
  stored: StoredReconnectRecord | null,
  ctx: RejoinContext,
): RejoinPlan {
  if (stored === null) return { action: "fresh" };
  if (typeof stored.token !== "string" || stored.token === "") return { action: "fresh" };
  if (stored.serverUrl !== ctx.serverUrl) return { action: "fresh" };
  if (stored.mapId !== ctx.mapId) return { action: "fresh" };
  if (stored.partyId !== ctx.partyId) return { action: "fresh" };
  const ageMs = ctx.nowMs - stored.savedAtMs;
  if (!Number.isFinite(ageMs) || ageMs < 0) return { action: "fresh" };
  if (ageMs >= ctx.graceSeconds * 1000) return { action: "fresh" };
  return { action: "reconnect", token: stored.token };
}

/**
 * parse record จาก storage (unknown หลัง JSON.parse) → StoredReconnectRecord ถ้าครบ+ชนิดถูก, ไม่งั้น
 * null (corrupt/schema เก่า = ทิ้ง แล้ว fresh join). pure — adapter (reconnect-store) เรียกหลัง JSON.parse.
 */
export function parseStoredReconnect(raw: unknown): StoredReconnectRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.token !== "string" || r.token === "") return null;
  if (typeof r.savedAtMs !== "number" || !Number.isFinite(r.savedAtMs)) return null;
  if (typeof r.serverUrl !== "string") return null;
  if (typeof r.mapId !== "string") return null;
  if (typeof r.partyId !== "string") return null;
  return {
    token: r.token,
    savedAtMs: r.savedAtMs,
    serverUrl: r.serverUrl,
    mapId: r.mapId,
    partyId: r.partyId,
  };
}
