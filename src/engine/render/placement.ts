// Entity/prop placement convention — pure math, no PixiJS, no React/Next.
// Plain TS only (invariant engine layer). แยกออกมาเป็น pure fn เพื่อ **ล็อก convention
// ด้วยเทสต์** (กัน regression class "+0.5 ซ้ำซ้อน" — ดู docs/context/engine.md).
//
// ── Convention (locked P0-04) ───────────────────────────────────────────────
// พิกัด tile ที่ส่งเข้า entity/prop API (addEntity/moveEntity, PropSpawn.tile)
// = **ตำแหน่ง "foot" ต่อเนื่องที่แท้จริง** ในหน่วย tile (float ได้) — ไม่ใช่ index cell.
//   • placement → screen ใช้ `tileToScreen` ตรง ๆ (ไม่บวก +0.5)
//   • basis เดียวกับที่ depthKey (= tx+ty) และ camera (applyCamera ใช้ tileToScreen) ใช้
//     → depth basis กับ visual basis เป็น frame เดียวกันเสมอ (ไม่เหลื่อมครึ่ง tile)
//   • อยากวางกลาง cell (n,n+1)² → author พิกัดเป็น n+0.5 เอง (เช่น spawn 12.5,12.5)
//
// ⚠️ ห้ามผสม tileCenterToScreen กับ tileToScreen ในเลเยอร์ที่ depth-sort ร่วมกัน:
//    center ของ entity หนึ่งกับ origin ของอีกอันจะทำให้ลำดับ sort สลับผิดจาก visual จริง.

import type { ScreenPoint, TilePoint } from "@/engine/iso/coords";
import { tileToScreen } from "@/engine/iso/coords";
import type { TileSize } from "@/engine/config";

/**
 * แปลงตำแหน่ง foot (tile, ต่อเนื่อง) → world-screen px สำหรับวาง display ของ entity/prop.
 * = `tileToScreen(tile)` — จงใจ **ไม่** ใช้ tileCenterToScreen (convention: API รับ foot
 * position ต่อเนื่องอยู่แล้ว; centering เป็นหน้าที่ผู้ author ที่ใส่ +0.5 ในพิกัด).
 */
export function entityFootToScreen(
  tile: TilePoint,
  tileSize: TileSize,
): ScreenPoint {
  return tileToScreen(tile, tileSize);
}
