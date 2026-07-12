// Correction/replan resume decision (prod fix 2026-07-12) — **pure**, no PixiJS/React/Next.
// แยก calc ออกจาก render: ตัดสินว่าหลัง server snap ตำแหน่ง (MSG_POSITION_CORRECTION / self-spawn)
// ควร "เดินต่อไป goal เดิม" ไหม — reuse findPath (A* pure เดิม, ห้ามเขียนใหม่) แล้วคืน plan ให้ glue apply.
//
// บริบท (owner เคาะ 2026-07-12): เดิม applyCorrection snap แล้ว "ทิ้ง path" เสมอ → คลิกไว้หายหมด
// (บั๊ก prod: correction ระหว่าง click-to-move ทำให้เดินไม่ถึงจุดที่คลิก). ใหม่: correction = snap (server=
// truth) แต่ถ้ากำลังเดินตาม path ที่มี goal → replan จากตำแหน่งใหม่ไป goal เดิม → เดินต่อเอง.
// ใช้ร่วมทั้ง applyCorrection และ replanToGoal (blocked mid-path) — logic ตัดสินเดียวกันทุกจุด.

import type { TilePoint } from "@/engine/iso/coords";
import { findPath, type AStarParams } from "@/engine/pathfinding/astar";
import type { WalkableFn } from "@/engine/movement/mover";

/**
 * ผลการตัดสิน resume path หลัง snap ตำแหน่ง:
 *   - "idle" — ไม่มี goal (WASD/manual / fresh join) → ไม่ต้อง resume อะไร
 *   - "walk" — replan A* จากตำแหน่งใหม่ไป goal เดิมสำเร็จ → เดินต่อตาม waypoints
 *   - "stop" — มี goal แต่ replan ไม่ถึง (goal ถูก block / นอกขอบ / เกิน node cap) → ยกเลิก path
 */
export type CorrectionResumePlan =
  | { action: "idle" }
  | { action: "walk"; waypoints: TilePoint[] }
  | { action: "stop" };

/**
 * ตัดสินว่าหลัง snap ไป `from` ควร resume เดินไป `goal` เดิมไหม.
 * `goal = null` (ไม่มี click-to-move active) → "idle" (ไม่เรียก findPath).
 * มี goal → findPath; ได้ path (length > 0) → "walk"; ถึงแล้ว (length 0) / null → "stop".
 *
 * pure: inject isWalkable + params (จาก EngineConfig.pathfinding) — ไม่ผูก MapConfig/pixi.
 */
export function planCorrectionResume(
  from: TilePoint,
  goal: TilePoint | null,
  isWalkable: WalkableFn,
  params: AStarParams,
): CorrectionResumePlan {
  if (!goal) return { action: "idle" };
  const path = findPath(from, goal, isWalkable, params);
  if (!path || path.length === 0) return { action: "stop" };
  return { action: "walk", waypoints: path };
}
