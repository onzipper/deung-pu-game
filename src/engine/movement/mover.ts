// Continuous movement step — pure math, no PixiJS, no React/Next (invariant engine layer).
// แยก calc ออกจาก render: stepMovement เป็น pure function (input pos+intent+dt → pos ใหม่)
// เทสต์ได้เต็ม ๆ โดยไม่ต้องมี WebGL/DOM — เตรียม P1 server-authoritative (ย้าย logic นี้ขึ้น server ได้).
//
// ── กติกา (P0-05, P0 §4.4) ───────────────────────────────────────────────────
// • เคลื่อนที่ต่อเนื่องบน float tile ด้วย speed (tile/วินาที).
// • normalize intent → เดินเฉียงไม่เร็วกว่าเดินตรง (|displacement| = speed·dt เสมอเมื่อกดเดิน).
// • collision: **axis-separated slide** — ลองเลื่อนแกน tx ก่อน; ถ้า tile ปลายทาง block
//   ยกเลิกเฉพาะแกนนั้น (tx คงเดิม) แล้วค่อยลองแกน ty จากตำแหน่ง tx ที่ผ่านแล้ว →
//   ไถลตามกำแพงได้ ไม่ติดหนึบ.
// • เช็ค block ด้วย isWalkable(snapToTile(ปลายทาง)) — player เป็นจุด (ไม่มีรัศมี) พอสำหรับ P0.
// • clamp dt สูงสุด (maxStepSeconds) กัน tunneling ตอน dt กระโดด (tab กลับมา rAF ค้าง).

import { snapToTile, type TilePoint } from "@/engine/iso/coords";

/** ตรวจว่า integer tile (tx,ty) เดินลงได้ไหม (true = เดินได้). caller ผูกกับ map ของตัวเอง. */
export type WalkableFn = (tx: number, ty: number) => boolean;

/** knob ที่ mover ต้องใช้ (มาจาก EngineConfig.player — ห้าม hardcode). */
export interface MoveParams {
  /** ความเร็ว (tile/วินาที) */
  speed: number;
  /** clamp dt สูงสุด (วินาที) */
  maxStepSeconds: number;
}

/**
 * คำนวณตำแหน่งใหม่ 1 step. pure — ไม่ mutate `pos` (คืน object ใหม่เสมอ).
 *
 * @param pos        ตำแหน่ง foot ปัจจุบัน (float tile)
 * @param intent     intent vector (tile-space, ไม่ต้อง normalize มาก่อน) — (0,0) = หยุด
 * @param dtSeconds  เวลาผ่านไปตั้งแต่ frame ก่อน (วินาที)
 * @param params     speed + maxStepSeconds (knob)
 * @param isWalkable predicate เดินได้ไหม (รับ integer tile จาก snapToTile ภายใน)
 * @returns          ตำแหน่ง foot ใหม่ (float tile)
 */
export function stepMovement(
  pos: TilePoint,
  intent: TilePoint,
  dtSeconds: number,
  params: MoveParams,
  isWalkable: WalkableFn,
): TilePoint {
  const len = Math.hypot(intent.tx, intent.ty);
  if (len === 0 || dtSeconds <= 0) {
    return { tx: pos.tx, ty: pos.ty };
  }

  const dt = Math.min(dtSeconds, params.maxStepSeconds);
  const dist = params.speed * dt;
  const dtx = (intent.tx / len) * dist;
  const dty = (intent.ty / len) * dist;

  let nx = pos.tx;
  let ny = pos.ty;

  // แกน tx ก่อน — คงเดิมถ้าปลายทาง block.
  const candX = pos.tx + dtx;
  const cellX = snapToTile({ tx: candX, ty: ny });
  if (isWalkable(cellX.tx, cellX.ty)) {
    nx = candX;
  }

  // แกน ty จากตำแหน่ง tx ที่ผ่านแล้ว (slide) — คงเดิมถ้าปลายทาง block.
  const candY = ny + dty;
  const cellY = snapToTile({ tx: nx, ty: candY });
  if (isWalkable(cellY.tx, cellY.ty)) {
    ny = candY;
  }

  return { tx: nx, ty: ny };
}
