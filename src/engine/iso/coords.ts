// Isometric coordinate converters — pure math, no rendering, no PixiJS.
// Plain TS only — ห้าม import React / Next.js / pixi runtime (invariant engine layer).
//
// โซน never-downgrade: ความถูกต้องของคณิต iso ห้ามพลาด — สูตรทุกตัวมี round-trip test คุม.
//
// ── Convention (locked, tech §17.1–17.2 · GS §57.1) ─────────────────────────
// True 2D isometric · diamond grid · fixed camera · no rotation.
//
// สองระบบพิกัด — ตั้งชื่อ field ไม่ให้สับสน (กัน bug class "เอา screen ไปคิดเป็น tile"):
//   • TilePoint  {tx, ty} = world/logical grid — หน่วยเป็น "tile", **float ได้**
//                (entity เคลื่อนต่อเนื่อง; ใช้ทำ logic/collision/pathfinding)
//   • ScreenPoint {sx, sy} = pixel iso projection (ใช้วางบน stage ตอน render — P0-04)
//
// Origin/anchor:
//   • tile (0,0) map ไปที่ screen (0,0)
//   • `tileToScreen(n,m)` ที่ n,m เป็น **จำนวนเต็ม** = จุด origin (มุมบนของ diamond)
//     ของ cell tile (n,m) ที่ครอบพื้นที่ logical [n,n+1)×[m,m+1) — **ไม่ใช่ center**.
//   • center จริงของ cell (n,m) = `tileToScreen(n+0.5, m+0.5)` = `tileCenterToScreen`.
//     (เช่น cell (0,0): origin=(0,0), center=(0, h/2)).
//   • +tx  → screen ไปทาง "ขวา-ล่าง"  (sx เพิ่ม, sy เพิ่ม)
//   • +ty  → screen ไปทาง "ซ้าย-ล่าง"  (sx ลด,  sy เพิ่ม)
//   ทั้ง +tx และ +ty ทำให้ sy เพิ่ม → ยิ่ง "ใต้จอ" (ดู depth.ts).
//
// ขนาด diamond รับจาก EngineConfig.tileSize เสมอ — **ห้าม hardcode 64/32 ในสูตร**.

import type { TileSize } from "@/engine/config";

/**
 * พิกัด world/logical grid (หน่วย = tile). float ได้.
 * ห้ามสับกับ ScreenPoint — field ตั้งใจตั้งชื่อ tx/ty ให้ต่างจาก sx/sy.
 */
export interface TilePoint {
  /** tile X (world/logical, float ได้) */
  tx: number;
  /** tile Y (world/logical, float ได้) */
  ty: number;
}

/**
 * พิกัด screen (หน่วย = pixel, หลัง iso projection).
 * ห้ามสับกับ TilePoint.
 */
export interface ScreenPoint {
  /** screen X (px) */
  sx: number;
  /** screen Y (px) */
  sy: number;
}

/**
 * Tile → Screen (diamond projection).
 *
 *   sx = (tx − ty) · w/2
 *   sy = (tx + ty) · h/2
 *
 * โดย w = tileSize.width, h = tileSize.height. คืนพิกัดกึ่งกลาง diamond ของ tile.
 */
export function tileToScreen(tile: TilePoint, tileSize: TileSize): ScreenPoint {
  const halfW = tileSize.width / 2;
  const halfH = tileSize.height / 2;
  return {
    sx: (tile.tx - tile.ty) * halfW,
    sy: (tile.tx + tile.ty) * halfH,
  };
}

/**
 * Tile cell → Screen center (กึ่งกลาง diamond ของ cell).
 *
 *   = tileToScreen(tx + 0.5, ty + 0.5)
 *
 * ใช้ตอน P0-04 วาง sprite/marker กลาง tile โดยไม่ต้อง hand-roll offset +0.5 เอง.
 * เช่น cell (0,0) @ 64×32 → (0, 16). แยกจาก tileToScreen ชัดเจนเพื่อกันสับสน
 * origin (มุม) กับ center (กลาง).
 */
export function tileCenterToScreen(
  tile: TilePoint,
  tileSize: TileSize,
): ScreenPoint {
  return tileToScreen({ tx: tile.tx + 0.5, ty: tile.ty + 0.5 }, tileSize);
}

/**
 * Screen → Tile (inverse ของ tileToScreen — round-trip แม่นยำระดับ float).
 *
 * จาก sx = (tx−ty)·w/2 และ sy = (tx+ty)·h/2:
 *   tx = sx/w + sy/h
 *   ty = sy/h − sx/w
 *
 * คืน float — ใช้ snapToTile() ต่อถ้าต้องการ integer tile.
 */
export function screenToTile(
  screen: ScreenPoint,
  tileSize: TileSize,
): TilePoint {
  const u = screen.sx / tileSize.width; // = (tx − ty) / 2
  const v = screen.sy / tileSize.height; // = (tx + ty) / 2
  return {
    tx: v + u,
    ty: v - u,
  };
}

/**
 * ปัด TilePoint float → integer tile (floor) สำหรับ collision/pathfinding lookup.
 *
 * Convention: tile index n ครอบพื้นที่ [n, n+1) → ใช้ Math.floor.
 * ค่าติดลบ: −0.5 → tile −1 (floor), ไม่ใช่ 0 (ถ้าใช้ trunc จะได้ 0 = ผิด grid).
 * ทำให้ grid ต่อเนื่องไม่มีช่องว่างที่ 0.
 */
export function snapToTile(tile: TilePoint): TilePoint {
  return {
    tx: Math.floor(tile.tx),
    ty: Math.floor(tile.ty),
  };
}
