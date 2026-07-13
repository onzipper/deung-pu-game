// Exit ground-marker geometry (P1 fix) — pure math, no rendering, no PixiJS.
// Plain TS only — ห้าม import React / Next.js / pixi runtime (invariant engine layer).
//
// ทำไมมี: owner เดินหา exit ไม่เจอเพราะ map.exits[].area เป็นแค่แถบ tile ที่ไม่มี art (placeholder ล้วน).
// ไฟล์นี้แปลง exit area → diamond polygon (screen space) ให้ scene.ts วาด highlight บนพื้น (ใต้ entity,
// ไม่เข้า depth-sort). **แยก calc ออกจาก render**: geometry ที่นี่ (เทสต์ได้ไร้ WebGL), pixi glue = scene.ts.
//
// convention: diamond ของ integer cell (tx,ty) = 4 มุมจาก tileToScreen ของ cell corners
// (origin, +x, +x+y, +y) — ตรงกับ buildGround ใน scene.ts เป๊ะ (reuse tileToScreen, ไม่คำนวณ projection เอง).
// tile ใน exit.area เป็น integer เสมอ (TileRect) → ไม่มีปัญหา +0.5 double-offset (foot convention).

import { tileToScreen } from "@/engine/iso/coords";
import type { TileSize } from "@/engine/config";
import type { MapExit } from "@/engine/map/types";

/** polygon ของ diamond 1 cell = [x0,y0, x1,y1, x2,y2, x3,y3] (screen px, พร้อมส่ง Graphics.poly). */
export type DiamondPolygon = number[];

/**
 * 4 มุม diamond (screen space) ของ integer cell (tx,ty) → polygon points.
 * มุมเรียง: origin (บน) → +x (ขวา) → +x+y (ล่าง) → +y (ซ้าย) — เดียวกับ buildGround.
 * reuse tileToScreen (ห้าม hardcode สูตร iso ที่นี่).
 */
export function tileDiamondPolygon(
  tx: number,
  ty: number,
  tileSize: TileSize,
): DiamondPolygon {
  const a = tileToScreen({ tx, ty }, tileSize);
  const b = tileToScreen({ tx: tx + 1, ty }, tileSize);
  const c = tileToScreen({ tx: tx + 1, ty: ty + 1 }, tileSize);
  const d = tileToScreen({ tx, ty: ty + 1 }, tileSize);
  return [a.sx, a.sy, b.sx, b.sy, c.sx, c.sy, d.sx, d.sy];
}

/**
 * ทุก tile ใน area ของทุก exit → array ของ diamond polygon (screen space).
 * exit.area = TileRect (integer) ครอบ [tx, tx+width) × [ty, ty+height). ไม่มี exit → [].
 * caller (scene.ts) วาดแต่ละ polygon เป็น fill + stroke ตาม ExitMarkerConfig.
 */
export function buildExitMarkerPolygons(
  exits: readonly MapExit[],
  tileSize: TileSize,
): DiamondPolygon[] {
  const polygons: DiamondPolygon[] = [];
  for (const exit of exits) {
    const { tx, ty, width, height } = exit.area;
    for (let y = ty; y < ty + height; y++) {
      for (let x = tx; x < tx + width; x++) {
        polygons.push(tileDiamondPolygon(x, y, tileSize));
      }
    }
  }
  return polygons;
}
