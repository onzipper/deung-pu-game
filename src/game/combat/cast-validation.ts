// Cast validation + skill hit resolution — **PURE** (P1-05, TA §16.2/§16.3 · §18.4). No PixiJS/React.
// Plain TS ล้วน. server-side decision logic (แยก glue ออกจาก MapRoom เพื่อเทสต์ได้ตรง ๆ).
//
// ทำ 2 อย่าง (ทั้งคู่ pure, ไม่มี side-effect):
//   1. validateCast — ตรวจ cooldown / รู้จัก skillId / range (anti-cheat §16.3 ชั้น 2 action rate)
//   2. resolveSkillHits — geometry เป้าที่โดน (reuse findHits จาก hit-test.ts) + cap maxTargets (§18.4)
//
// **ไม่มีสูตร damage ที่นี่** (อยู่ formula.ts, server-only) — ไฟล์นี้ตัดสินแค่ "cast ผ่านไหม + โดนใครบ้าง".
// resourceCost/mana ไม่ตรวจ: 10-stat list §15.1 ไม่มี resource pool (proposal §5 [8] PENDING OWNER) →
//   P1 นักดาบ cooldown-only; เพิ่ม mana check ทีหลังเมื่อ owner เคาะ resource pool (§59.4).

import {
  findHits,
  ZERO_HIT_TOLERANCE,
  type AttackShape,
  type HitTestTarget,
  type HitTolerance,
} from "@/game/combat/hit-test";
import type { SkillDefinition } from "@/game/skill/types";
import type { TilePoint } from "@/engine/iso/coords";
import type { Direction } from "@/engine/movement/direction";
import type { MapZoneType, TileSize } from "@/engine/config";

/** เหตุผลที่ cast ถูกปฏิเสธ (ส่งกลับ client เพื่อ debug/UX — ไม่ผูก punishment). */
export type CastRejectReason =
  | "safe_zone"
  | "unknown_skill"
  | "locked" // A3: playerLevel < skill.unlockLevel (§50.1 unlockLevel / P1_BALANCE §3 unlock-by-level)
  | "cooldown"
  | "out_of_range";

/** cooldown ผ่านหรือยัง — readyAtMs = เวลา (ms) ที่สกิลพร้อมใช้อีกครั้ง (undefined = ยังไม่เคยใช้ = พร้อม). */
export function isSkillReady(readyAtMs: number | undefined, nowMs: number): boolean {
  return readyAtMs === undefined || nowMs >= readyAtMs;
}

/** เวลา (ms) ที่สกิลจะพร้อมใช้อีกครั้งหลังใช้ตอน nowMs (cooldown วินาที → ms). */
export function skillReadyAt(nowMs: number, cooldownSeconds: number): number {
  return nowMs + cooldownSeconds * 1000;
}

/**
 * aim อยู่ในระยะสกิลไหม (§16.3 range check — กัน cast ระยะไกลผิดปกติ).
 * ระยะ = euclidean บน tile coords จาก caster → aim; ยอมเกิน range ได้ตาม toleranceFactor
 * (เผื่อ latency/prediction ฝั่ง client — เหมือน speed tolerance ของ movement §16.3).
 */
export function isAimInRange(
  casterPos: TilePoint,
  aimPos: TilePoint,
  range: number,
  toleranceFactor: number,
): boolean {
  const dtx = aimPos.tx - casterPos.tx;
  const dty = aimPos.ty - casterPos.ty;
  const distSq = dtx * dtx + dty * dty;
  const max = range * toleranceFactor;
  return distSq <= max * max;
}

/**
 * แปลง SkillDefinition → AttackShape สำหรับ hit-test (reuse geometry เดียวกับ P0-10 client hitbox
 * เพื่อ client/server เห็นตรงกัน, §16.1 "กัน bug client เห็นโดน server บอกไม่โดน").
 *   • cone/arc/line: radius = range, arcDegrees = angle
 *   • circle (self AoE เช่น taunt): radius = radius, arcDegrees = 360 (รอบตัว)
 * fallback: angle null → 360 (รอบทิศ), radius null → range.
 */
export function skillAttackShape(skill: SkillDefinition): AttackShape {
  return {
    radius: skill.radius != null ? skill.radius : skill.range,
    arcDegrees: skill.angle != null ? skill.angle : 360,
  };
}

/** ระยะ² จาก a → b (tile coords) — sort เป้าตาม "ใกล้สุด" ตอน cap maxTargets. */
function distSq(a: TilePoint, b: TilePoint): number {
  const dtx = b.tx - a.tx;
  const dty = b.ty - a.ty;
  return dtx * dtx + dty * dty;
}

/**
 * หา mobId ที่โดนสกิล เคารพ `maxTargets` (§18.4 AoE Target Cap) — pure.
 * เกิน cap → เลือก **ใกล้ caster ที่สุด** (deterministic; §18.4 ไม่ระบุ ordering → ใช้ nearest
 * ตามฟีล AoE ปกติ + tie-break ด้วยลำดับ target ที่ส่งเข้า = stable). คืน mobId เรียงใกล้→ไกล.
 */
export function resolveSkillHits(
  skill: SkillDefinition,
  casterPos: TilePoint,
  facing: Direction,
  targets: readonly HitTestTarget[],
  tileSize: TileSize,
  tolerance: HitTolerance = ZERO_HIT_TOLERANCE,
): string[] {
  const shape = skillAttackShape(skill);
  const hitIds = findHits(casterPos, facing, targets, tileSize, shape, tolerance);

  const posById = new Map<string, TilePoint>(targets.map((t) => [t.id, t.pos] as const));
  // sort ใกล้→ไกล (stable: index เดิมเป็น tie-break) แล้ว cap
  const ordered = hitIds
    .map((id, i) => ({ id, d: distSq(casterPos, posById.get(id)!), i }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((e) => e.id);

  return ordered.slice(0, Math.max(0, skill.maxTargets));
}

/** input ของ validateCast — skill = undefined หมายถึง skillId ที่ client ส่งมาไม่รู้จัก. */
export interface CastValidationInput {
  skill: SkillDefinition | undefined;
  /**
   * A3 (§50.1 unlockLevel / P1_BALANCE §3): เลเวลปัจจุบันของผู้ cast — ต่ำกว่า skill.unlockLevel → reject "locked"
   * (server-authoritative unlock gate; skill S2 unlock 3, S3/S4 unlock 5). server ส่ง sessionProgress.level เข้ามา.
   */
  playerLevel: number;
  /**
   * P1-11 (GS §14 Safe Zone): zone ของ map ที่ cast — "safe" (เมือง) → ปฏิเสธเสมอ (ไม่มี combat ในเมือง).
   * optional; ไม่ระบุ → ถือว่า "field" (combat ปกติ). server ส่ง map.zoneType เข้ามา.
   */
  zoneType?: MapZoneType;
  /** cooldown state ปัจจุบันของ (player, skill) — undefined = ยังไม่เคยใช้ */
  readyAtMs: number | undefined;
  nowMs: number;
  casterPos: TilePoint;
  aimPos: TilePoint;
  /** headroom range กัน false-reject ตอน latency/prediction (≥ 1) */
  rangeToleranceFactor: number;
}

export type CastValidation = { ok: true } | { ok: false; reason: CastRejectReason };

/**
 * ตัดสินว่า cast ผ่านไหม (pure) — ลำดับ: safe zone → รู้จัก skillId → unlock-by-level → cooldown → range.
 * safe zone (เมือง, GS §14) ปฏิเสธ **ทุก** cast ก่อนเช็คอื่น (ไม่มี combat ในเมือง — reason เด่นที่สุด).
 * "locked" (A3) มาก่อน cooldown/range = "ยังไม่ปลดสกิลนี้" สำคัญกว่า timing (§50.1 unlockLevel).
 * ผ่าน = caller apply (set cooldown + resolveSkillHits + damage). ไม่ผ่าน = ตอบ reason (ไม่ apply).
 */
export function validateCast(input: CastValidationInput): CastValidation {
  if (input.zoneType === "safe") return { ok: false, reason: "safe_zone" };
  if (!input.skill) return { ok: false, reason: "unknown_skill" };
  if (input.playerLevel < input.skill.unlockLevel) return { ok: false, reason: "locked" };
  if (!isSkillReady(input.readyAtMs, input.nowMs)) {
    return { ok: false, reason: "cooldown" };
  }
  // self-target skill (A3: S4 sword_guard_domain, range 0) — "aim" = ตัวเอง, range check ไม่มีความหมาย (radius ใช้กับ
  //   AoE/taunt รอบตัว ไม่ใช่ระยะ aim). ข้าม range กัน client/server pos ต่างเสี้ยว → false reject (§50.1 targetType).
  if (
    input.skill.targetType !== "self" &&
    !isAimInRange(input.casterPos, input.aimPos, input.skill.range, input.rangeToleranceFactor)
  ) {
    return { ok: false, reason: "out_of_range" };
  }
  return { ok: true };
}
