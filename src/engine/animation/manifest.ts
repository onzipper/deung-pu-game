// Animation manifest + pure resolvers — no PixiJS, no React/Next (invariant engine layer).
// หัวใจ data-driven ของ direction system (tech §17.4, L15):
//   input → resolveDirection (movement/direction.ts, logical 8-dir) → resolveClip (ที่นี่)
//   → (sprite source 1 ใน N ที่วาดจริง) + (mirror flag) → animator เล่น sheet + flip ถ้าต้อง.
//
// ── โครง manifest (per-entity) ──────────────────────────────────────────────
//   • drawnDirections = ทิศที่ "มี art วาดจริง". player = 5 ทิศ (S/SW/W/NW/N).
//   • mirrorMap = ทิศที่ "ไม่วาด" → { source ที่วาด } แล้ว flip แนวนอน.
//         player: SE←SW, E←W, NE←NW.
//   • **8-dir override (L15):** ถ้า drawnDirections ครบ 8 + mirrorMap ว่าง → ทุกทิศ mirror=false
//     (สำหรับ boss/NPC ที่ art asymmetry หนัก flip แล้วหลุด) — resolver เดิมไม่ต้องรื้อ.
//   • animations = idle/walk/[attack] → ลำดับเฟรม (frames) + frameDuration (ms) + loop.
//
// resolver เป็น pure ล้วน → เทสต์ครบ 8 ทิศ × ทุก animation ได้โดยไม่แตะ pixi.

import type { Direction } from "@/engine/movement/direction";
import type { PlayerAnimationConfig } from "@/engine/config";

/** ทิศที่ player วาดจริง (art) — 5 ทิศ (tech §17.4). */
export const PLAYER_DRAWN_DIRECTIONS: readonly Direction[] = [
  "S",
  "SW",
  "W",
  "NW",
  "N",
];

/** mirror map ของ player: ทิศฝั่งขวาจอ = flip ของฝั่งซ้ายที่วาดไว้ (tech §17.4). */
export const PLAYER_MIRROR_MAP: Readonly<Partial<Record<Direction, Direction>>> =
  {
    SE: "SW",
    E: "W",
    NE: "NW",
  };

/** ชื่อ animation ที่ player รองรับ (P0-06). attack = placeholder เผื่อ P0-08. */
export type PlayerAnimationName = "idle" | "walk" | "attack";

/** [0,1,2,...,n−1] — ลำดับเฟรมแบบวิ่งตรง n เฟรม. */
function seq(n: number): number[] {
  return Array.from({ length: Math.max(1, n) }, (_, i) => i);
}

/**
 * ประกอบ manifest ของ player จาก config knob (data-driven).
 * drawn 5 ทิศ + mirror 3 ทิศ; idle/walk วน, attack เล่นครั้งเดียว.
 */
export function createPlayerAnimationManifest(
  config: PlayerAnimationConfig,
): AnimationManifest {
  return {
    drawnDirections: PLAYER_DRAWN_DIRECTIONS,
    mirrorMap: PLAYER_MIRROR_MAP,
    animations: {
      idle: {
        frames: seq(config.idleFrames),
        frameDuration: config.idleFrameDuration,
        loop: true,
      },
      walk: {
        frames: seq(config.walkFrames),
        frameDuration: config.walkFrameDuration,
        loop: true,
      },
      attack: {
        frames: seq(config.attackFrames),
        frameDuration: config.attackFrameDuration,
        loop: false,
      },
    },
  };
}

/**
 * นิยาม 1 animation (idle/walk/attack): ลำดับเฟรม + timing + loop.
 * `frames` = ลำดับ index ที่จะเล่น (อ้างเข้า texture list ต่อทิศ) — ทำ ping-pong ได้ เช่น [0,1,2,1].
 * generator สร้าง texture จำนวน max(frames)+1 ต่อ (animation, drawnDirection).
 */
export interface AnimationDef {
  /** ลำดับ index เฟรมที่เล่น (≥1 ตัว) */
  readonly frames: readonly number[];
  /** ระยะเวลาต่อเฟรม (ms) — Design Knob */
  readonly frameDuration: number;
  /** วนกลับต้นเมื่อจบ (idle/walk = true; attack มักเล่นครั้งเดียว = false) */
  readonly loop: boolean;
}

/**
 * Manifest ของ entity 1 ชนิด (data-driven). ค่าประกอบจาก config knob (ดู createPlayerAnimationManifest).
 */
export interface AnimationManifest {
  /** ทิศที่มี art วาดจริง (≥1). ครบ 8 = ไม่ mirror เลย (8-dir override, L15). */
  readonly drawnDirections: readonly Direction[];
  /** ทิศที่ไม่วาด → ทิศ source ที่วาด (จะถูก flip). source ต้องอยู่ใน drawnDirections. */
  readonly mirrorMap: Readonly<Partial<Record<Direction, Direction>>>;
  /** นิยามต่อ animation (key = ชื่อ animation) */
  readonly animations: Readonly<Record<string, AnimationDef>>;
}

/** ผลลัพธ์ resolveClip — บอก animator ว่าใช้ sheet ทิศไหน + flip ไหม + เล่นเฟรมอะไร. */
export interface ResolvedClip {
  /** ทิศ sheet ที่วาดจริง (ใช้ดึง texture) */
  readonly sourceDirection: Direction;
  /** true = ต้อง flip แนวนอน (scale.x = −1 รอบ anchor เท้า) */
  readonly mirror: boolean;
  /** ลำดับ index เฟรมที่เล่น */
  readonly frames: readonly number[];
  /** ระยะเวลาต่อเฟรม (ms) */
  readonly frameDuration: number;
  /** วนหรือไม่ */
  readonly loop: boolean;
}

/**
 * หัวใจ direction system: (manifest, animation, direction) → ResolvedClip.
 * - direction ที่วาดจริง → source เดิม, mirror=false.
 * - direction ที่ mirror → source ตาม mirrorMap, mirror=true.
 * - animation ไม่รู้จัก / ทิศไม่มีทั้ง drawn และ mirror / mirror source ไม่ได้วาด → throw ชัด.
 * pure — ไม่มี side effect, deterministic เต็ม.
 */
export function resolveClip(
  manifest: AnimationManifest,
  animation: string,
  direction: Direction,
): ResolvedClip {
  const def = manifest.animations[animation];
  if (!def) {
    const known = Object.keys(manifest.animations).join(", ") || "(ไม่มี)";
    throw new Error(
      `resolveClip: animation ไม่รู้จัก "${animation}" — มีเฉพาะ: ${known}`,
    );
  }

  // วาดจริง → ไม่ mirror (รวมกรณี 8-dir override: ทุกทิศอยู่ใน drawnDirections)
  if (manifest.drawnDirections.includes(direction)) {
    return clip(direction, false, def);
  }

  // ไม่วาด → หา mirror source
  const source = manifest.mirrorMap[direction];
  if (source === undefined) {
    throw new Error(
      `resolveClip: ทิศ ${direction} ไม่มีทั้งใน drawnDirections และ mirrorMap`,
    );
  }
  if (!manifest.drawnDirections.includes(source)) {
    throw new Error(
      `resolveClip: mirror ${direction}→${source} แต่ source ไม่อยู่ใน drawnDirections`,
    );
  }
  return clip(source, true, def);
}

function clip(
  sourceDirection: Direction,
  mirror: boolean,
  def: AnimationDef,
): ResolvedClip {
  return {
    sourceDirection,
    mirror,
    frames: def.frames,
    frameDuration: def.frameDuration,
    loop: def.loop,
  };
}

/**
 * playhead ของ animator (mutable — zero-alloc ใน hot loop).
 * `index` = ตำแหน่งใน clip.frames (ไม่ใช่ค่า texture index โดยตรง), `elapsedMs` = เวลาสะสมในเฟรมปัจจุบัน.
 */
export interface Playhead {
  index: number;
  elapsedMs: number;
}

/**
 * เดิน playhead ไปข้างหน้าตาม dt (pure math, **mutate `head` in place** เพื่อไม่ alloc ใน hot loop).
 * - สะสม elapsedMs; ทุกครั้งที่ครบ frameDuration → เลื่อน index 1 เฟรม.
 * - loop=true → วนกลับ 0; loop=false → ค้างเฟรมสุดท้าย (ไม่เลยขอบ).
 * - guard: frameDuration ≤ 0 หรือ frames ว่าง → ไม่ขยับ (กัน loop ไม่รู้จบ / หารศูนย์).
 * คืน `head` เดิม (สะดวกเทสต์).
 */
export function advancePlayhead(
  head: Playhead,
  dtMs: number,
  clip: ResolvedClip,
): Playhead {
  const len = clip.frames.length;
  if (len <= 1 || clip.frameDuration <= 0 || dtMs <= 0) {
    // เฟรมเดียว/ไม่มี timing → ล็อก index ให้อยู่ในช่วง แล้วจบ
    if (head.index >= len) head.index = len > 0 ? len - 1 : 0;
    return head;
  }
  head.elapsedMs += dtMs;
  // เลื่อนทีละเฟรม (รองรับ dt กระโดดหลายเฟรมโดยไม่วน infinite — bounded ด้วย elapsed)
  while (head.elapsedMs >= clip.frameDuration) {
    head.elapsedMs -= clip.frameDuration;
    if (head.index >= len - 1) {
      if (clip.loop) {
        head.index = 0;
      } else {
        head.index = len - 1;
        head.elapsedMs = 0; // ค้างเฟรมสุดท้าย ไม่สะสมต่อ
        break;
      }
    } else {
      head.index++;
    }
  }
  return head;
}
