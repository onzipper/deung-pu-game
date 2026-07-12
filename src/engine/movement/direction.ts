// Logical 8-direction resolver — pure math, no PixiJS, no React/Next (invariant engine layer).
// เตรียมให้ P0-06 (sprite 5-dir + mirror): แปลง intent/velocity (tile-space) → ทิศ logical
// ที่ **ตาเห็นบนจอ** (screen-space) — เพราะ sprite เลือกจากทิศที่ตาเห็น ไม่ใช่ทิศ tile ดิบ.
//
// ── สูตร mapping (มุม→ทิศ) ────────────────────────────────────────────────────
// 1) project เวกเตอร์ tile → screen delta ด้วย iso projection (coords.ts, linear ผ่าน origin
//    → ใช้กับ delta ได้ตรง ๆ): sx=(tx−ty)·w/2, sy=(tx+ty)·h/2.
// 2) มุมบนจอ (y ชี้ขึ้นบวก): angle = atan2(−sy, sx). → E=0°, N=+90°, W=180°, S=−90°.
// 3) แบ่ง 8 ช่วง ช่วงละ 45°: sector = round(angle / 45°) mod 8.
//    ขอบ (ทุก 22.5°) ใช้ semantics ของ Math.round (ปัดครึ่งขึ้นไปทาง +∞) → ทิศฝั่ง CCW ชนะ
//    (เช่น screen 22.5° = ขอบ E|NE → ได้ NE). deterministic เต็ม.
// 4) ไม่กด/หยุด (เวกเตอร์ ~0) → คืนทิศล่าสุด (idle คงหน้าเดิม) ไม่ reset เป็นค่า default.
//
// P0-06 จะ map Direction → sprite: วาดจริง 5 ทิศ (S/SW/W/NW/N) + mirror (E←W, NE←NW, SE←SW).
// ที่นี่ทำเฉพาะส่วน logical (ทิศ) — mapping→ภาพเป็นของ P0-06.

import { tileToScreen, type TilePoint } from "@/engine/iso/coords";
import type { TileSize } from "@/engine/config";

/** 8 ทิศ logical (ตามที่ตาเห็นบนจอ). N = ขึ้นจอ (หันหลังให้กล้อง), S = ลงจอ (หันเข้ากล้อง). */
export type Direction = "S" | "SW" | "W" | "NW" | "N" | "NE" | "E" | "SE";

/** sector index (round(angle/45°) mod 8, E=0° CCW) → Direction. */
const SECTOR_TO_DIR: readonly Direction[] = [
  "E",
  "NE",
  "N",
  "NW",
  "W",
  "SW",
  "S",
  "SE",
];

/** ทิศ → มุมบนจอ (องศา, y-up, E=0° CCW) สำหรับ project กลับเป็นเวกเตอร์ screen. */
const DIR_DEGREES: Readonly<Record<Direction, number>> = {
  E: 0,
  NE: 45,
  N: 90,
  NW: 135,
  W: 180,
  SW: 225,
  S: 270,
  SE: 315,
};

/** เวกเตอร์ tile ที่สั้นกว่า √EPS ถือว่า "ไม่เคลื่อนที่" → คงทิศเดิม. */
const EPS = 1e-9;

const QUARTER = Math.PI / 4;

/**
 * แปลง intent/velocity (tile-space) → Direction ตามทิศบนจอ.
 * @param vec  เวกเตอร์ tile-space (intent หรือ velocity); (0,0) → คืน `last`
 * @param tileSize ขนาด diamond (projection) — ต้องใช้เพราะทิศบนจอขึ้นกับ aspect ratio
 * @param last ทิศล่าสุด (คืนกลับเมื่อ vec ~0 = idle)
 */
export function resolveDirection(
  vec: TilePoint,
  tileSize: TileSize,
  last: Direction,
): Direction {
  if (vec.tx * vec.tx + vec.ty * vec.ty < EPS) return last;
  const s = tileToScreen(vec, tileSize); // linear → screen-space delta
  const angle = Math.atan2(-s.sy, s.sx); // y-up: N=+90°, E=0°
  const sector = ((Math.round(angle / QUARTER) % 8) + 8) % 8;
  return SECTOR_TO_DIR[sector];
}

/**
 * Direction → หน่วยเวกเตอร์บนจอ (sx ขวาบวก, sy ลงบวก) — ใช้วาง marker บอกทิศหน้า
 * ของ placeholder player (P0-05) และ reuse ได้ตอนวาง sprite/effect ตามทิศ (P0-06).
 * เช่น N → (0,−1) (ขึ้นจอ), S → (0,+1) (ลงจอ), E → (1,0).
 */
export function directionToScreenUnit(dir: Direction): {
  sx: number;
  sy: number;
} {
  const r = (DIR_DEGREES[dir] * Math.PI) / 180;
  return { sx: Math.cos(r), sy: -Math.sin(r) };
}
