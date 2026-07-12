// Mob wander behavior — pure step, no PixiJS/React (src/game/** ใช้ engine ผ่าน public API เท่านั้น).
//
// สลับ idle/walk สุ่มช่วงเวลาจาก config (MobWanderConfig). เดินจริงใช้ `stepMovement` เดิม
// (engine/movement/mover.ts — collision axis-separated slide ฟรี ไม่ต้องเขียนใหม่). leash
// แบบง่าย (P0-09 scope: "ถ้าจะหลุด area ให้เลี้ยวกลับ") = ผูกขอบ pocket.area เข้าเป็นเงื่อนไข
// block เพิ่มเติมใน isWalkable predicate ที่ส่งเข้า stepMovement — ผลคือมอนไถลติดขอบ pocket
// เหมือนชนกำแพง แล้วรอบ walk ถัดไป (สุ่มทิศใหม่) มีโอกาสเลี้ยวกลับเข้า area เอง; ไม่ทำ
// pathfinding กลับจุดเกิดแบบเต็ม (เกินสโคป P0-09 — mob AI จริงเป็น P1, TA §18.3).

import type { TilePoint } from "@/engine/iso/coords";
import { isWalkableTile, type MapConfig, type TileRect } from "@/engine/map/types";
import { stepMovement, type WalkableFn } from "@/engine/movement/mover";
import type { MobWanderConfig } from "@/engine/config";
import type { RngFn } from "@/game/mob/rng";

export type WanderMode = "idle" | "walking";

/** state ของ mob 1 ตัว. `stepWander` คืน object ใหม่เสมอ (pure — ไม่ mutate ของเดิม). */
export interface MobWanderState {
  mode: WanderMode;
  /** เวลาที่เหลือใน mode ปัจจุบัน (ms) */
  remainingMs: number;
  /** ทิศ intent ปัจจุบัน (tile-space; {0,0} ตอน idle) — ส่งต่อเข้า resolveDirection สำหรับ animation */
  intent: TilePoint;
}

function randomRange(range: { min: number; max: number }, rng: RngFn): number {
  return range.min + rng() * (range.max - range.min);
}

/** ทิศสุ่มต่อเนื่อง (tile-space, มุมสุ่ม 0..2π) — stepMovement normalize ความยาวให้เองอยู่แล้ว. */
function randomDirection(rng: RngFn): TilePoint {
  const angle = rng() * Math.PI * 2;
  return { tx: Math.cos(angle), ty: Math.sin(angle) };
}

/**
 * สร้าง state เริ่มต้น — เริ่มที่ idle เสมอ (มอนไม่เดินพร้อมกันทุกตัวตั้งแต่ frame แรกตอน spawn,
 * เห็น density ของ pocket ได้ก่อนเริ่มขยับ).
 */
export function createWanderState(
  config: MobWanderConfig,
  rng: RngFn,
): MobWanderState {
  return {
    mode: "idle",
    remainingMs: randomRange(config.idleDurationMs, rng),
    intent: { tx: 0, ty: 0 },
  };
}

/** integer tile (tx,ty) อยู่ใน rect หรือไม่ — ครอบ [tx,tx+width) × [ty,ty+height) (เดียวกับ TileRect). */
function isWithinRectTiles(tx: number, ty: number, rect: TileRect): boolean {
  return (
    tx >= rect.tx &&
    ty >= rect.ty &&
    tx < rect.tx + rect.width &&
    ty < rect.ty + rect.height
  );
}

export interface WanderStepResult {
  pos: TilePoint;
  state: MobWanderState;
}

/**
 * เดิน wander 1 step. pure — ไม่ mutate `pos`/`state` เดิม, คืน object ใหม่เสมอ.
 *
 * @param pos          ตำแหน่ง foot ปัจจุบัน (float tile)
 * @param state        wander state ปัจจุบัน (จาก createWanderState หรือผลลัพธ์ step ก่อนหน้า)
 * @param dtSeconds    เวลาผ่านไป (วินาที)
 * @param area         pocket.area (leash boundary — integer tile rect)
 * @param config       MobWanderConfig (speed/maxStepSeconds/idle·walkDurationMs) — Design Knob
 * @param isWalkable   predicate เดินได้ไหมของ **map จริง** (ไม่รวม leash — ฟังก์ชันนี้ผูก leash ให้เอง)
 * @param rng          RNG inject ได้ (default Math.random runtime, seeded LCG ใน เทสต์)
 */
export function stepWander(
  pos: TilePoint,
  state: MobWanderState,
  dtSeconds: number,
  area: TileRect,
  config: MobWanderConfig,
  isWalkable: WalkableFn,
  rng: RngFn,
): WanderStepResult {
  let mode = state.mode;
  let remainingMs = state.remainingMs - dtSeconds * 1000;
  let intent = state.intent;

  if (remainingMs <= 0) {
    if (mode === "idle") {
      mode = "walking";
      remainingMs = randomRange(config.walkDurationMs, rng);
      intent = randomDirection(rng);
    } else {
      mode = "idle";
      remainingMs = randomRange(config.idleDurationMs, rng);
      intent = { tx: 0, ty: 0 };
    }
  }

  const nextState: MobWanderState = { mode, remainingMs, intent };

  if (mode !== "walking") {
    return { pos: { tx: pos.tx, ty: pos.ty }, state: nextState };
  }

  // leash แบบง่าย: เดินได้เฉพาะ tile ที่ทั้ง map ยอมรับ *และ* ยังอยู่ใน pocket.area
  const leashWalkable: WalkableFn = (tx, ty) =>
    isWalkable(tx, ty) && isWithinRectTiles(tx, ty, area);

  const next = stepMovement(
    pos,
    intent,
    dtSeconds,
    { speed: config.speed, maxStepSeconds: config.maxStepSeconds },
    leashWalkable,
  );

  return { pos: next, state: nextState };
}

/** helper: WalkableFn จาก map จริง (ไม่รวม leash) — manager.ts ใช้ประกอบ isWalkable param ของ stepWander. */
export function walkableFromMap(map: MapConfig): WalkableFn {
  return (tx, ty) => isWalkableTile(map, tx, ty);
}
