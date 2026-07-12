// Camera math — pure, no PixiJS, no React/Next. Plain TS (invariant engine layer).
//
// Locked (tech §17.1, ENGINE_FOUNDATION_DECISIONS §1): fixed isometric camera,
// **no rotation, no zoom** ใน P0 — กล้องแค่ pan ตาม target แล้ว clamp ไม่ให้หลุดขอบ map.
//
// โมเดล: "camera center" = จุดใน **world-screen space** (px หลัง iso projection) ที่จะถูก
// วางไว้กลาง viewport. worldContainer.position = viewportCenter − cameraCenter (scene.ts).
// แยก math ล้วนมาที่นี่เพื่อเทสต์ clamp/follow โดยไม่ต้องมี WebGL.

import type { ScreenPoint, TilePoint } from "@/engine/iso/coords";
import { tileToScreen } from "@/engine/iso/coords";
import type { TileSize } from "@/engine/config";
import type { MapBounds } from "@/engine/map/types";

/** ขอบเขต world-screen (px) ของ map ทั้งใบ — กรอบสี่เหลี่ยมครอบ diamond. */
export interface ScreenBounds {
  minSx: number;
  maxSx: number;
  minSy: number;
  maxSy: number;
}

/** viewport ปัจจุบัน (px, logical — ก่อน resolution scale). */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * กรอบ world-screen ของ map จาก 4 มุม diamond (tile (0,0),(W,0),(0,H),(W,H)).
 * ใช้ tileToScreen (มุม origin) — ครอบทั้ง grid [0,W]×[0,H] พอดี.
 *   minSx = ที่มุม (0,H) = −H·w/2 · maxSx = ที่มุม (W,0) = W·w/2
 *   minSy = ที่มุม (0,0) = 0     · maxSy = ที่มุม (W,H) = (W+H)·h/2
 */
export function computeMapScreenBounds(
  bounds: MapBounds,
  tileSize: TileSize,
): ScreenBounds {
  const corners: TilePoint[] = [
    { tx: 0, ty: 0 },
    { tx: bounds.width, ty: 0 },
    { tx: 0, ty: bounds.height },
    { tx: bounds.width, ty: bounds.height },
  ];
  const pts = corners.map((c) => tileToScreen(c, tileSize));
  return {
    minSx: Math.min(...pts.map((p) => p.sx)),
    maxSx: Math.max(...pts.map((p) => p.sx)),
    minSy: Math.min(...pts.map((p) => p.sy)),
    maxSy: Math.max(...pts.map((p) => p.sy)),
  };
}

/**
 * Clamp 1 แกน. `center` = ตำแหน่งกลาง viewport บนแกนนี้ (world-screen px).
 * ต้องการให้ครึ่ง viewport ทั้งสองข้างไม่หลุด [min−margin, max+margin].
 *  • ถ้า content (+2·margin) กว้างกว่า viewport → clamp center เข้าในช่วงที่ขอบไม่หลุด
 *  • ถ้าเล็กกว่า viewport → จัดกึ่งกลาง content (กันสั่นซ้าย/ขวา)
 */
function clampAxis(
  center: number,
  min: number,
  max: number,
  viewport: number,
  margin: number,
): number {
  const lo = min - margin;
  const hi = max + margin;
  const half = viewport / 2;
  if (hi - lo <= viewport) {
    // content เล็กกว่าจอ → center กลาง content
    return (lo + hi) / 2;
  }
  const clampMin = lo + half; // ขอบซ้าย/บนไม่หลุด
  const clampMax = hi - half; // ขอบขวา/ล่างไม่หลุด
  if (center < clampMin) return clampMin;
  if (center > clampMax) return clampMax;
  return center;
}

/**
 * Clamp camera center (world-screen px) ให้ viewport ไม่มองเลยขอบ map เกิน `margin`.
 * deterministic ล้วน — เทสต์คุมขอบทั้ง 4 ด้าน + กรณี map เล็กกว่าจอ.
 */
export function clampCameraScreen(
  center: ScreenPoint,
  bounds: ScreenBounds,
  viewport: Viewport,
  margin: number,
): ScreenPoint {
  return {
    sx: clampAxis(center.sx, bounds.minSx, bounds.maxSx, viewport.width, margin),
    sy: clampAxis(center.sy, bounds.minSy, bounds.maxSy, viewport.height, margin),
  };
}

/**
 * บวก shake offset (px, จาก render/screen-shake.ts) เข้ากับจุดกล้องที่ clamp แล้ว (P1-06, GS §17.5).
 * เรียก **หลัง** clampCameraScreen เสมอ (shake = juice ชั้นบนสุด ไม่ผ่าน clamp ซ้ำ — ไม่งั้น shake
 * จะโดนตัดทิ้งเวลากล้องอยู่ติดขอบ map). offset {0,0} = no-op (คืนจุดเดิมทุกประการ).
 */
export function applyShakeOffset(point: ScreenPoint, offset: ScreenPoint): ScreenPoint {
  return { sx: point.sx + offset.sx, sy: point.sy + offset.sy };
}

/**
 * Lerp tile-space follow: current เข้าหา target ทีละ frame ด้วย alpha ∈ [0,1].
 *   next = current + (target − current)·alpha
 * alpha สูง = ตามเร็ว/แข็ง, ต่ำ = นุ่ม/หน่วง. alpha=1 = snap ทันที.
 * (frame-rate–independent ไม่ทำใน P0 — deltaTime นิ่งพอ; ถ้าต้องการ ค่อยเติมภายหลัง.)
 */
export function lerpTile(
  current: TilePoint,
  target: TilePoint,
  alpha: number,
): TilePoint {
  const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha;
  return {
    tx: current.tx + (target.tx - current.tx) * a,
    ty: current.ty + (target.ty - current.ty) * a,
  };
}
