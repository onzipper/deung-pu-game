// Shared movement validation (P1-02, TA §6/§7/§16.3) — **pure**, no colyseus/pixi/React/Next.
// import ได้ทั้ง client (`@/shared/movement-validation`) และ server (relative `../src/shared/...`).
//
// นี่คือ "สมอง" ของ server-authoritative movement: รับตำแหน่ง valid ล่าสุด (prev) + ตำแหน่งที่ client
// เสนอ (next) + เวลาที่ผ่านไป (elapsedMs) → ตัดสินว่ารับได้ไหม. logic ทั้งหมดเทสต์ได้แยกจาก Colyseus glue.
//
// **Single source of truth**: การเช็ค walkable ไม่ทำที่นี่ — รับ callback `isWalkableAt` เข้ามา
// (server ประกอบจาก engine pure functions snapToTile + isWalkableTile) → ไม่ copy สูตร collision
// ระหว่าง client/server (drift = bug class). config knob mirror จาก engine/config (type-only import).
//
// โมเดล (TA §6): client-predicted, server validate **หยาบ** — เช็ค "ปลายทาง" ต่อ update ไม่ replay
// ทั้ง path (1 update ปกติ ≤ ~0.5 tile ที่ 10–15Hz → เช็คปลายทางพอ). ผิด → snap กลับ prev (ไม่แบน).

import type { MovementValidationConfig } from "@/engine/config";

/** จุดในพิกัด tile (float ได้) — subset ของ TilePoint (ไม่ import เพื่อคง shared เป็น type ล้วน). */
export interface MovePoint {
  tx: number;
  ty: number;
}

/** พารามิเตอร์ที่ validateMove ต้องใช้ — speed (tile/วินาที) + knob. mirror client/server. */
export interface MoveValidationParams {
  /** ความเร็วเดินสูงสุด (tile/วินาที) = EngineConfig.player.speed — server อ่านค่าเดียวกับ client */
  speed: number;
  /** knob (tolerance/teleport/cooldown/elapsed clamp) = EngineConfig.movementValidation */
  validation: MovementValidationConfig;
}

/**
 * เดินได้ไหมที่ตำแหน่ง **ต่อเนื่อง** (tx,ty) — caller ประกอบจาก engine pure functions
 * (snapToTile → isWalkableTile) เพื่อไม่ copy สูตร collision. คืน true = เดินลง tile นั้นได้.
 */
export type WalkableAtFn = (tx: number, ty: number) => boolean;

/** เหตุผลที่ move ถูกปฏิเสธ (ใช้ debug/log ฝั่ง server + ส่งกลับ client ใน correction). */
export type MoveRejectReason = "non_finite" | "teleport" | "speed" | "blocked";

/** ผลลัพธ์ validateMove — discriminated union กัน caller ลืมเช็ค ok ก่อนอ่าน correctTo. */
export type MoveValidationResult =
  | { ok: true }
  | { ok: false; reason: MoveRejectReason; correctTo: MovePoint };

/** clamp v ลงช่วง [min,max] (min ควร ≤ max — เป็น config ควบคุม). */
function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function reject(reason: MoveRejectReason, correctTo: MovePoint): MoveValidationResult {
  // correctTo = ตำแหน่ง valid ล่าสุด (snap กลับที่เดิม, TA §16.3 "snap กลับ ไม่แบน")
  return { ok: false, reason, correctTo: { tx: correctTo.tx, ty: correctTo.ty } };
}

/**
 * Validate การเคลื่อนจาก prev (valid ล่าสุด) → next (client เสนอ) ในเวลา elapsedMs.
 *
 * ลำดับเช็ค (return ที่ fail แรก, correctTo = prev เสมอ):
 *   1. non_finite — next.tx/ty ไม่ finite (NaN/Infinity จาก wire เพี้ยน)
 *   2. teleport   — ระยะ > teleportThresholdTiles (hard cap อิสระจาก elapsed)
 *   3. speed      — ระยะ > playerSpeed × clamp(elapsed) × tolerance (speed hack)
 *   4. blocked    — ปลายทางเดินไม่ได้/นอก bounds (isWalkableAt(next) = false)
 *
 * ไม่มี division (คูณ elapsed/1000) → ปลอดภัยกับ elapsed 0/ติดลบ (clock skew) หลัง clamp floor.
 */
export function validateMove(
  prev: MovePoint,
  next: MovePoint,
  elapsedMs: number,
  params: MoveValidationParams,
  isWalkableAt: WalkableAtFn,
): MoveValidationResult {
  const { validation } = params;

  // 1. sanitize — ค่าเพี้ยนจาก network ต้องไม่ทำ state พัง
  if (!Number.isFinite(next.tx) || !Number.isFinite(next.ty)) {
    return reject("non_finite", prev);
  }

  const dx = next.tx - prev.tx;
  const dy = next.ty - prev.ty;
  const distance = Math.hypot(dx, dy);

  // 2. teleport — absolute cap: จับกระโดดไกลชัด ๆ ก่อน (ไม่พึ่ง elapsed → กัน exploit สะสม allowance)
  if (distance > validation.teleportThresholdTiles) {
    return reject("teleport", prev);
  }

  // 3. speed cap — clamp elapsed กัน clock skew (0/ติดลบ → floor) + gap ยาว (→ ceiling)
  const effElapsedMs = clamp(elapsedMs, validation.minElapsedMs, validation.maxElapsedMs);
  const allowed =
    params.speed * (effElapsedMs / 1000) * validation.speedToleranceFactor;
  if (distance > allowed) {
    return reject("speed", prev);
  }

  // 4. walkable — ปลายทางต้องเดินได้ (reuse engine collision ผ่าน callback, ไม่ copy สูตร)
  if (!isWalkableAt(next.tx, next.ty)) {
    return reject("blocked", prev);
  }

  return { ok: true };
}
