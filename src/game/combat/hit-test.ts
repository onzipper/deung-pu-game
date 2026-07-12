// Combat calc — pure, no PixiJS/React (src/game/** ใช้ engine ผ่าน public API เท่านั้น).
// P0-10 combat stub (P0_SCOPE_LOCK §4.9): พิสูจน์ chain input→hit→feedback เท่านั้น —
// **ไม่ใช่** damage formula จริง (multiplicative diminishing = P1 server, tech §15.2)
// และ **ไม่ใช่** skill schema จริง (GS §50.1, P1) — ทุกอย่างในไฟล์นี้เป็น dummy/placeholder.
//
// ── วิธีเลือก hit test: tile-space distance + screen-space arc ──────────────────
// ระยะ = euclidean บน **tile coords** ตรงไปตรงมา (dtx,dty) — ไม่ต้อง project อะไร.
// arc ("หน้า player") ต้องเทียบเป็น **มุมบนจอ** ไม่ใช่มุม tile ดิบ เพราะ diamond ไม่ใช่สี่เหลี่ยม
// จัตุรัส (tileSize 64×32) — มุม tile 45° ไม่เท่ามุมบนจอ 45°. วิธี: project ทั้ง facing
// (directionToScreenUnit, มีอยู่แล้ว) และ target vector (tileToScreen ของ delta — เป็น linear ผ่าน
// origin ใช้กับ delta ได้ตรง ๆ, สูตรเดียวกับที่ resolveDirection ใช้) เข้า screen แล้วเทียบมุม
// (atan2(-sy,sx), y-up — สูตรเดียวกับ engine/movement/direction.ts resolveDirection) เพื่อให้ arc
// ที่ตัดสิน "โดนหน้า/ไม่โดน" ตรงกับสิ่งที่ตาเห็นบนจอจริง ๆ ไม่ใช่เบี้ยวตาม aspect ของ diamond.
//
// เหตุผลที่ไม่ใช้มุม tile ตรง ๆ: ผู้เล่นตัดสินใจว่า "โดนหน้าไหม" จากภาพบนจอ ไม่ใช่จาก grid ดิบ —
// ถ้าใช้มุม tile จะได้ arc ที่บิดเบี้ยวไม่ตรงกับสิ่งที่เห็น (โดยเฉพาะ tileSize ที่ width≠height).

import { screenToTile, tileToScreen, type ScreenPoint, type TilePoint } from "@/engine/iso/coords";
import { directionToScreenUnit, type Direction } from "@/engine/movement/direction";
import type { TileSize } from "@/engine/config";
import type { RngFn } from "@/game/mob/rng";

/** เวกเตอร์ทิศ-ระยะที่สั้นกว่านี้ (²) ถือว่าซ้อนตำแหน่งเดียวกับ attacker — arc ไม่มีความหมาย, ถือว่าโดน. */
const ORIGIN_EPS = 1e-9;

/** target 1 ตัวที่ส่งเข้า findHits — โครงเดียวกับที่ game/mob/manager.ts คืนจาก getAliveTargets(). */
export interface HitTestTarget {
  readonly id: string;
  readonly pos: TilePoint;
}

/** รูปทรง hit test (ตรงกับ AttackShapeConfig ใน engine/config.ts แต่รับเฉพาะ field ที่ใช้จริงที่นี่). */
export interface AttackShape {
  /** รัศมี hit (tile, euclidean บน tile coords) */
  readonly radius: number;
  /** ความกว้างรวมของ arc (องศา) รอบทิศ facing */
  readonly arcDegrees: number;
}

/** ช่วง [min,max] ของ dummy damage — สุ่ม uniform (ตรงกับ DummyDamageRange ใน engine/config.ts). */
export interface DummyDamageRange {
  readonly min: number;
  readonly max: number;
}

/** ผล pure ของการรับ dummy damage 1 ครั้ง — ไม่แตะ mutable state เอง (caller เป็นคน apply). */
export interface DummyDamageResult {
  /** hp หลังหักแล้ว (คงค่าติดลบได้ ไม่ clamp ที่นี่ — caller ตัดสินใจ despawn เอง) */
  hp: number;
  /** true ถ้ารอบนี้ทำให้ hp ≤ 0 (ตาย) */
  died: boolean;
}

/**
 * ทิศ facing → มุมบนจอ (radian, y-up, สูตรเดียวกับ resolveDirection: atan2(-sy,sx)).
 * ใช้ directionToScreenUnit (public API ของ engine/movement/direction.ts) แทนคิดตารางมุมใหม่.
 */
export function screenAngleForDirection(direction: Direction): number {
  const u = directionToScreenUnit(direction);
  return Math.atan2(-u.sy, u.sx);
}

/** wrap มุมต่าง (radian) ให้อยู่ใน (−π, π] — ใช้เทียบระยะเชิงมุมสั้นสุดระหว่าง 2 ทิศ. */
function normalizeAngleDiff(diff: number): number {
  let d = diff % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * มุมบนจอ (radian) → เวกเตอร์หน่วย **tile-space** ที่ชี้ไปทางมุมนั้นเมื่อ project ขึ้นจอ
 * (inverse ของ tileToScreen ผ่าน screenToTile, เป็น linear ผ่าน origin ใช้กับเวกเตอร์ตรงได้).
 * ใช้วาด hitbox debug wedge (combat-stub.ts) ให้ตรงกับขอบเขตที่ findHits ใช้จริงเป๊ะ.
 */
export function tileUnitVectorForScreenAngle(
  angleRad: number,
  tileSize: TileSize,
): TilePoint {
  const screenDir: ScreenPoint = { sx: Math.cos(angleRad), sy: -Math.sin(angleRad) };
  const tileDir = screenToTile(screenDir, tileSize);
  const len = Math.hypot(tileDir.tx, tileDir.ty);
  if (len < ORIGIN_EPS) return { tx: 0, ty: 0 };
  return { tx: tileDir.tx / len, ty: tileDir.ty / len };
}

/**
 * หา target ที่โดน attack — pure, deterministic เต็ม (ไม่มี RNG ในนี้).
 *
 * เกณฑ์:
 *   1. ระยะ (euclidean บน tile coords, dtx/dty) ≤ shape.radius
 *   2. มุมบนจอของเวกเตอร์ attacker→target อยู่ในครึ่ง arc (±arcDegrees/2) รอบ facingAngle
 *      (ทั้งสองมุมผ่าน screenAngleForDirection/tileToScreen ให้ตรงจอเดียวกัน)
 *   ระยะ 0 เป๊ะ (target ซ้อนตำแหน่ง attacker) → ถือว่าโดนเสมอ (มุมไม่มีความหมายที่ระยะ 0).
 *
 * @returns id ของ target ที่โดน (ลำดับตาม targets ที่ส่งเข้า)
 */
export function findHits(
  attackerPos: TilePoint,
  facing: Direction,
  targets: readonly HitTestTarget[],
  tileSize: TileSize,
  shape: AttackShape,
): string[] {
  const halfArcRad = (shape.arcDegrees / 2) * (Math.PI / 180);
  const facingAngle = screenAngleForDirection(facing);
  const radiusSq = shape.radius * shape.radius;

  const hits: string[] = [];
  for (const target of targets) {
    const dtx = target.pos.tx - attackerPos.tx;
    const dty = target.pos.ty - attackerPos.ty;
    const distSq = dtx * dtx + dty * dty;
    if (distSq > radiusSq) continue;

    if (distSq < ORIGIN_EPS) {
      hits.push(target.id);
      continue;
    }

    const screenDelta = tileToScreen({ tx: dtx, ty: dty }, tileSize);
    const targetAngle = Math.atan2(-screenDelta.sy, screenDelta.sx);
    const diff = normalizeAngleDiff(targetAngle - facingAngle);
    if (Math.abs(diff) <= halfArcRad) hits.push(target.id);
  }
  return hits;
}

/**
 * สุ่ม dummy damage แบบ uniform ใน [min,max] แล้วปัดเป็น integer — **ไม่ใช่สูตรจริง**
 * (multiplicative diminishing = P1 server, tech §15.2). rng injectable (defaultRng runtime,
 * seeded LCG ในเทสต์ — ดู game/mob/rng.ts).
 */
export function rollDummyDamage(range: DummyDamageRange, rng: RngFn): number {
  if (!(range.max > range.min)) return Math.max(0, Math.round(range.min));
  return Math.round(range.min + rng() * (range.max - range.min));
}

/**
 * เดิน cooldown 1 frame — pure. คืน remainingMs ใหม่ (clamp ≥0).
 * combat-stub.ts เรียกทุก frame ก่อนเช็ค canAttack.
 */
export function advanceCooldown(remainingMs: number, dtSeconds: number): number {
  return Math.max(0, remainingMs - dtSeconds * 1000);
}

/** cooldown หมดหรือยัง (≤0 = โจมตีได้ตอนนี้) */
export function canAttack(remainingMs: number): boolean {
  return remainingMs <= 0;
}

/**
 * ผล hp หลังโดน dummy damage — pure (ไม่แตะ mutable mob instance เอง, game/mob/manager.ts
 * เป็นคน apply ผลนี้ลง instance จริง). ไม่ clamp hp ที่ 0 ตั้งใจ (เก็บค่าติดลบไว้ debug ได้).
 */
export function applyDummyDamage(hp: number, damage: number): DummyDamageResult {
  const nextHp = hp - damage;
  return { hp: nextHp, died: nextHp <= 0 };
}
