// Mob AI — pure decision logic (P1-03, TA §18.3 aggro/leash/pull cap + §6/§11 LOD). No PixiJS/React.
// src/game/** ใช้ engine ผ่าน public API เท่านั้น (mover/coords/map types) — testable ล้วน,
// server (authoritative) และ client offline-fallback ใช้ร่วมกัน (ไม่มี pixi dependency).
//
// แยกออกจาก simulation.ts (stateful orchestrator) เพื่อให้ state machine + guardrail เทสต์ได้เดี่ยว ๆ:
//   • selectAggroTarget — เลือกเป้าใกล้สุดในรัศมี aggro ที่ยัง "ไม่เกิน pull cap ต่อผู้เล่น" (§18.3)
//   • shouldReturnToSpawn / hasReachedSpawn — leash: เลิกไล่แล้วกลับจุดเกิด (§18.3)
//   • stepToward — เดินตรงเข้าหาเป้า (chase/return) ผ่าน stepMovement เดิม (collision ฟรี; pathfinding จริง = P1-09)
//   • isPocketActive / shouldStepPocket — AI LOD: pocket ไม่มี player ใน AOI → tick ช้าลง/หลับ (§6/§11)
//   • isRespawnDue — respawn timer (clock inject ได้)

import type { TilePoint } from "@/engine/iso/coords";
import type { TileRect } from "@/engine/map/types";
import {
  stepMovement,
  type MoveParams,
  type WalkableFn,
} from "@/engine/movement/mover";

/** โหมด AI ของมอน 1 ตัว (P1-03). wander = เดินเตร่ใน pocket · chase = ไล่ player · return = leash กลับจุดเกิด. */
export type MobMode = "wander" | "chase" | "return";

/** อ้างอิงตำแหน่งผู้เล่น 1 คนสำหรับ aggro/leash (id + tile pos). */
export interface AiPlayerRef {
  id: string;
  tx: number;
  ty: number;
}

/** ระยะกำลังสองระหว่าง 2 จุด (เลี่ยง sqrt — เทียบกับ radius² ตรง ๆ). */
export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * เลือกเป้า aggro: ผู้เล่นที่ **ใกล้สุด** ในรัศมี `aggroRadius` (tile, euclidean) ที่ยัง
 * **ไม่เกิน pull cap** (§18.3 — กันลากทั้ง map ทำลาย spawn). คืน player id หรือ null ถ้าไม่มีเป้าที่รับได้.
 *
 * pull cap เช็คจาก `pullCounts` (จำนวนมอนที่ aggro ผู้เล่นคนนั้นอยู่แล้ว) — ผู้เล่นที่ count ≥ cap
 * ถูกข้าม (มอนตัวนี้ไป aggro คนอื่น/ไม่ aggro). caller เพิ่ม count เองหลังผูกเป้า (กัน over-pull ในเฟรมเดียว).
 */
export function selectAggroTarget(
  pos: TilePoint,
  players: readonly AiPlayerRef[],
  aggroRadius: number,
  pullCounts: ReadonlyMap<string, number>,
  pullCap: number,
): string | null {
  const radiusSq = aggroRadius * aggroRadius;
  let bestId: string | null = null;
  let bestDistSq = radiusSq;
  for (const p of players) {
    if ((pullCounts.get(p.id) ?? 0) >= pullCap) continue; // เต็ม cap → ข้าม
    const d = distSq(pos.tx, pos.ty, p.tx, p.ty);
    if (d <= bestDistSq) {
      // ≤ เพื่อให้ radius พอดีขอบก็ติด; tie → เป้าหลังใน list ชนะ (deterministic พอสำหรับ AI)
      bestDistSq = d;
      bestId = p.id;
    }
  }
  return bestId;
}

/**
 * มอนที่กำลัง chase ควรเลิกไล่แล้ว leash กลับจุดเกิดไหม (§18.3) — true เมื่อ **อย่างใดอย่างหนึ่ง**:
 *   1. เป้าหายไป (player ออกห้อง/null)
 *   2. ถูกลากไกลจากจุดเกิดเกิน `leashRadius` (กันลากข้าม map)
 *   3. เป้าวิ่งหนีห่างมอนเกิน `deaggroRadius` (ไล่ไม่ทัน → ปล่อย)
 */
export function shouldReturnToSpawn(
  pos: TilePoint,
  spawnOrigin: TilePoint,
  target: AiPlayerRef | null | undefined,
  deaggroRadius: number,
  leashRadius: number,
): boolean {
  if (!target) return true;
  if (distSq(pos.tx, pos.ty, spawnOrigin.tx, spawnOrigin.ty) > leashRadius * leashRadius) return true;
  if (distSq(pos.tx, pos.ty, target.tx, target.ty) > deaggroRadius * deaggroRadius) return true;
  return false;
}

/** มอนที่กำลัง return ถึงจุดเกิดแล้วหรือยัง (ภายใน `resetRadius`) → reset เป็น wander. */
export function hasReachedSpawn(
  pos: TilePoint,
  spawnOrigin: TilePoint,
  resetRadius: number,
): boolean {
  return distSq(pos.tx, pos.ty, spawnOrigin.tx, spawnOrigin.ty) <= resetRadius * resetRadius;
}

/**
 * เดินตรงเข้าหา `targetPoint` 1 step (chase/return) — intent = เวกเตอร์ไปหาเป้า แล้วผ่าน
 * stepMovement เดิม (normalize + axis-separated collision slide ฟรี). pure.
 * **ไม่ใช่ pathfinding** (เดินตรง ชนกำแพงไถล) — A* จริงเป็น P1-09 (TA §17.3).
 */
export function stepToward(
  pos: TilePoint,
  targetPoint: TilePoint,
  dtSeconds: number,
  params: MoveParams,
  isWalkable: WalkableFn,
): TilePoint {
  const intent: TilePoint = { tx: targetPoint.tx - pos.tx, ty: targetPoint.ty - pos.ty };
  return stepMovement(pos, intent, dtSeconds, params, isWalkable);
}

/** ระยะจาก tile (px,py) ถึง rect (0 ถ้าอยู่ในนั้น) — clamp point ลง rect แล้ววัด. */
function distSqPointToRect(px: number, py: number, rect: TileRect): number {
  const cx = Math.max(rect.tx, Math.min(px, rect.tx + rect.width));
  const cy = Math.max(rect.ty, Math.min(py, rect.ty + rect.height));
  return distSq(px, py, cx, cy);
}

/**
 * pocket นี้ "active" ไหม (AI LOD, §6/§11) = มีผู้เล่นอย่างน้อย 1 คนอยู่ในรัศมี `aoiRadius`
 * จากขอบ pocket.area. ไม่ active → tick ช้าลง/หลับ (ดู shouldStepPocket).
 */
export function isPocketActive(
  area: TileRect,
  players: readonly AiPlayerRef[],
  aoiRadius: number,
): boolean {
  const radiusSq = aoiRadius * aoiRadius;
  for (const p of players) {
    if (distSqPointToRect(p.tx, p.ty, area) <= radiusSq) return true;
  }
  return false;
}

/**
 * จำนวน tick cycle ระหว่าง idle-step (AI LOD): base tick วิ่ง `tickHz`, pocket ที่ไม่ active
 * step แค่ทุก ๆ N cycle เพื่อได้อัตราจริง ≈ `idleTickHz`. idleTickHz ≤ 0 → 0 (= หลับสนิท ไม่ step).
 */
export function idleTickInterval(tickHz: number, idleTickHz: number): number {
  if (idleTickHz <= 0) return 0; // 0 = asleep sentinel
  return Math.max(1, Math.round(tickHz / idleTickHz));
}

/**
 * pocket นี้ควร step AI ใน tick cycle นี้ไหม (AI LOD):
 *   • active → step ทุก cycle (full tick)
 *   • ไม่ active + idleInterval = 0 → **ไม่ step เลย** (หลับ, spawn state คงอยู่)
 *   • ไม่ active + idleInterval > 0 → step ทุก idleInterval cycle (tick ช้าลง 1–2Hz)
 * `tickCounter` = ตัวนับ cycle รวม (เพิ่มทีละ 1 ต่อ base tick).
 */
export function shouldStepPocket(
  active: boolean,
  tickCounter: number,
  idleInterval: number,
): boolean {
  if (active) return true;
  if (idleInterval <= 0) return false;
  return tickCounter % idleInterval === 0;
}

/** respawn timer: ถึงเวลาเกิดใหม่หรือยัง (nowMs ≥ dueAtMs). clock inject ได้ (เทสต์ deterministic). */
export function isRespawnDue(dueAtMs: number, nowMs: number): boolean {
  return nowMs >= dueAtMs;
}
