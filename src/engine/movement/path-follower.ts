// Path follower — เดินตาม waypoints จาก A* ด้วย stepMovement เดิม. pure math, no PixiJS, no React/Next.
// แยก calc ออกจาก render: advancePathFollower เป็น pure (pos + path state + dt → pos ใหม่ + สถานะ)
// ความเร็ว/collision ใช้ stepMovement ตัวเดียวกับ WASD → server validate ผ่านเหมือนกัน (§16.3).
//
// ── กติกา (P1-09) ────────────────────────────────────────────────────────────
// • waypoints = integer cell จาก findPath; เล็ง "กลาง cell" (n+0.5, n+0.5) เป็นเป้า foot ต่อเนื่อง
//   (convention foot: coords.ts — origin cell คือมุม, center = +0.5).
// • ถึง waypoint (dist ≤ arrivalRadius) → เลื่อนไป waypoint ถัดไป; ถึงตัวสุดท้าย → arrived.
// • dynamic obstacle (มอน/ผู้เล่นอื่นยังไม่บล็อก tile ใน P1 — แต่ map อาจเปลี่ยน): ถ้า cell เป้าหมายกลายเป็น
//   block **หรือ** stepMovement ขยับไม่ได้เลยทั้งที่ยังไม่ถึง → คืน `blocked=true` (ไม่ขยับ) ให้ controller
//   ตัดสิน replan/หยุด (policy อยู่ที่ผู้เรียก = local-player, ดู replanOnBlock). follower เองไม่ replan
//   (แยก calc ออกจาก decision + ไม่ replan ทุก frame เปลือง — replan เฉพาะตอน blocked event).
// • path ว่าง / index เกินท้าย → arrived ทันที ไม่ขยับ (ใช้เป็นทางยกเลิก path: ตั้ง waypoints=[]).

import { snapToTile, type TilePoint } from "@/engine/iso/coords";
import { stepMovement, type MoveParams, type WalkableFn } from "@/engine/movement/mover";

/** สถานะการเดินตาม path (immutable waypoints + index ปัจจุบันที่กำลังมุ่งไป). */
export interface PathFollowState {
  /** waypoints เป็น integer cell (จาก findPath) — เล็งกลาง cell (n+0.5). */
  readonly waypoints: readonly TilePoint[];
  /** index ของ waypoint ที่กำลังเดินเข้าหา (0..waypoints.length). */
  index: number;
}

/** knob การเดินตาม path ที่ต้องใช้เพิ่มจาก MoveParams. */
export interface PathFollowParams extends MoveParams {
  /** ระยะ (tile) ที่ถือว่า "ถึง" waypoint แล้ว → ไปตัวถัดไป (ควร ≥ speed·maxStepSeconds กัน overshoot วน). */
  arrivalRadius: number;
}

/** ผลของ 1 step การเดินตาม path. */
export interface PathFollowResult {
  /** ตำแหน่ง foot ใหม่ (float tile). */
  pos: TilePoint;
  /** index ที่อัปเดตแล้ว (เขียนกลับเข้า state โดย caller). */
  index: number;
  /** เดินจบ path แล้ว (ถึง waypoint สุดท้าย / path ว่าง). */
  arrived: boolean;
  /** ขยับต่อไม่ได้ (เป้าหมาย block หรือ stuck) — controller ตัดสิน replan/หยุด. */
  blocked: boolean;
  /** เวกเตอร์ทิศที่กำลังมุ่ง (tile-space, ยังไม่ normalize) — ให้ caller คำนวณ facing/walk state. */
  heading: TilePoint;
}

/** กึ่งกลาง cell ของ integer waypoint (foot ต่อเนื่อง). */
function centerOf(cell: TilePoint): TilePoint {
  return { tx: cell.tx + 0.5, ty: cell.ty + 0.5 };
}

const NO_HEADING: TilePoint = { tx: 0, ty: 0 };

/**
 * เดินตาม path 1 step. pure — ไม่ mutate pos/state (คืน object ใหม่).
 *
 * @param pos        ตำแหน่ง foot ปัจจุบัน (float tile)
 * @param state      waypoints + index ปัจจุบัน
 * @param dtSeconds  เวลาผ่านไปตั้งแต่ frame ก่อน (วินาที)
 * @param params     speed/maxStepSeconds/arrivalRadius (knob)
 * @param isWalkable predicate เดินได้ไหม (integer tile)
 */
export function advancePathFollower(
  pos: TilePoint,
  state: PathFollowState,
  dtSeconds: number,
  params: PathFollowParams,
  isWalkable: WalkableFn,
): PathFollowResult {
  const { waypoints } = state;
  let index = state.index;

  // path ว่าง / เดินครบแล้ว → arrived (ทางยกเลิก path ก็เข้าเคสนี้)
  if (index >= waypoints.length) {
    return { pos: { tx: pos.tx, ty: pos.ty }, index, arrived: true, blocked: false, heading: NO_HEADING };
  }

  // เป้าหมายกลาง cell ของ waypoint ปัจจุบัน
  let target = centerOf(waypoints[index]);

  // ถ้าอยู่ในระยะ arrivalRadius ของ waypoint ปัจจุบันแล้ว → เลื่อน index ไปเรื่อย ๆ จนเจอตัวที่ยังไม่ถึง
  // (กัน waypoint ซ้อนใกล้กันทำให้ค้าง). ถึงตัวสุดท้าย → arrived.
  while (index < waypoints.length) {
    target = centerOf(waypoints[index]);
    const rem = Math.hypot(target.tx - pos.tx, target.ty - pos.ty);
    if (rem > params.arrivalRadius) break;
    index++;
  }
  if (index >= waypoints.length) {
    return { pos: { tx: pos.tx, ty: pos.ty }, index, arrived: true, blocked: false, heading: NO_HEADING };
  }
  target = centerOf(waypoints[index]);

  // dynamic obstacle: cell เป้าหมายกลายเป็นเดินไม่ได้ → หยุด ให้ controller replan/หยุด
  const targetCell = snapToTile(target);
  if (!isWalkable(targetCell.tx, targetCell.ty)) {
    return { pos: { tx: pos.tx, ty: pos.ty }, index, arrived: false, blocked: true, heading: NO_HEADING };
  }

  const heading: TilePoint = { tx: target.tx - pos.tx, ty: target.ty - pos.ty };
  const next = stepMovement(pos, heading, dtSeconds, params, isWalkable);

  // stuck: ยังไม่ถึงเป้าแต่ stepMovement ขยับไม่ได้เลย (ชนอะไรระหว่างทาง) → blocked
  const moved = next.tx !== pos.tx || next.ty !== pos.ty;
  if (!moved && dtSeconds > 0) {
    return { pos: next, index, arrived: false, blocked: true, heading };
  }

  // ถึง waypoint สุดท้ายหลังก้าวนี้ไหม
  const rem = Math.hypot(target.tx - next.tx, target.ty - next.ty);
  const arrivedFinal = index === waypoints.length - 1 && rem <= params.arrivalRadius;
  return { pos: next, index, arrived: arrivedFinal, blocked: false, heading };
}
