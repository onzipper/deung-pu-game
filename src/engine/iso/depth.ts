// Isometric depth key — pure math, no rendering, no PixiJS.
// Plain TS only — ห้าม import React / Next.js / pixi runtime.
//
// โซน never-downgrade: depth-sort correctness ห้ามพลาด — band non-overlap พิสูจน์ด้วยเทสต์ขอบ.
//
// ── หลักการ (tech §17.2–17.3) ───────────────────────────────────────────────
// depth ของ iso = ตำแหน่งบนแกน "ลึกลงใต้จอ". จาก coords.ts ทั้ง +tx และ +ty
// ทำให้ screen sy เพิ่ม (ใต้จอ) → base depth = tx + ty. ยิ่งมาก = อยู่ใต้กว่า
// = ต้องวาด "ทีหลัง/ทับ" ของที่อยู่บนกว่า.
//
// zLayer override = band แยกชั้น (prop/effect/debug ที่ต้องอยู่เหนือ/ใต้ทุกอย่าง
// ในระดับตัวเองเสมอ ไม่ขึ้นกับตำแหน่ง iso). ออกแบบให้ zLayer สูงกว่า **ชนะ base
// depth เสมอในทุกจุดของ map ที่รองรับ** — พิสูจน์ด้วย band > ช่วงกว้างของ base.

import type { TilePoint } from "@/engine/iso/coords";

/**
 * ครึ่ง-ช่วงพิกัด tile ที่ depth system รองรับ (tile ต่อแกนอยู่ใน [−MAX, +MAX]).
 * 4096 tile ต่อทิศ = 8192×8192 diamond — ใหญ่กว่า map P0 ทุกใบมาก.
 * ใช้เป็นฐานคำนวณ band; ถ้าต้อง map ใหญ่กว่านี้ ค่อยขยายค่านี้ (band ตามอัตโนมัติ).
 */
export const DEPTH_MAX_TILE_COORD = 4096;

/**
 * ช่วงกว้างที่ base depth (= tx + ty) เป็นไปได้ = max − min.
 * base ∈ [−2·MAX, +2·MAX] → span = 4·MAX.
 */
export const DEPTH_BASE_SPAN = 4 * DEPTH_MAX_TILE_COORD; // 16384

/**
 * ขนาด band ต่อ 1 zLayer.
 * ต้อง > DEPTH_BASE_SPAN เพื่อรับประกันว่า zLayer สูงกว่าชนะ base ทุกจุด.
 * ตั้งเป็น 2× span → margin = span (16384) เผื่อ float ทุกกรณี.
 * derived จาก MAX_TILE_COORD (ไม่ magic number) — ขยาย map แล้ว invariant ยังจริง.
 */
export const DEPTH_ZLAYER_BAND = DEPTH_BASE_SPAN * 2; // 32768

/**
 * depth sort key ของ entity ที่ tile นั้น.
 *
 *   depthKey = zLayer · DEPTH_ZLAYER_BAND + (tx + ty)
 *
 * • ค่ามาก = วาดทีหลัง (ทับ) — sort จากน้อยไปมากแล้ววาดตามลำดับ.
 * • ในระดับ zLayer เดียวกัน: base = tx + ty ตัดสิน (ใต้จอกว่า → ทับ).
 * • zLayer สูงกว่า: band ต่างกัน ≥ DEPTH_ZLAYER_BAND − DEPTH_BASE_SPAN > 0
 *   → ชนะ base เสมอทุกจุดของ map ที่รองรับ (band ไม่ overlap).
 * • deterministic ล้วน (ไม่มี state/RNG) — เอาไปทำ stable sort ได้.
 *
 * หมายเหตุ: ค่าที่คืนใช้เทียบ "อันดับสัมพัทธ์" เท่านั้น — ค่าติดลบใน band 0 (tx+ty<0)
 * ปกติ, สนใจแค่ลำดับ ไม่ใช่ค่าสัมบูรณ์.
 *
 * zLayer คาดหวัง integer เล็ก (แนะนำ |zLayer| ≤ 100). float precision จะเริ่มกลืน
 * ผลต่าง base ระดับ 0.0001 เมื่อ |zLayer| ~1e7 (ค่าคีย์ ~1e11, ulp > 1e-4) — ไกลเกิน
 * use case จริงมาก แต่ระบุไว้กันเซอร์ไพรส์.
 *
 * Fail-loud: NaN/Infinity 1 ตัวทำ sort พังทั้ง array แบบเงียบ → throw ทันที.
 *
 * @param tile   ตำแหน่ง logical (float ได้ — entity เคลื่อนต่อเนื่อง)
 * @param zLayer band override (int; default 0). สูงกว่า = อยู่เหนือทุกอย่างใน base.
 * @throws TypeError  ถ้า tx/ty/zLayer ไม่ finite (NaN/Infinity)
 * @throws RangeError ถ้า |tx| หรือ |ty| เกิน DEPTH_MAX_TILE_COORD (band อาจ overlap)
 */
export function depthKey(tile: TilePoint, zLayer = 0): number {
  if (
    !Number.isFinite(tile.tx) ||
    !Number.isFinite(tile.ty) ||
    !Number.isFinite(zLayer)
  ) {
    throw new TypeError(
      `depthKey: tx/ty/zLayer ต้อง finite (got tx=${tile.tx}, ty=${tile.ty}, zLayer=${zLayer})`,
    );
  }
  if (
    Math.abs(tile.tx) > DEPTH_MAX_TILE_COORD ||
    Math.abs(tile.ty) > DEPTH_MAX_TILE_COORD
  ) {
    throw new RangeError(
      `depthKey: |tx|,|ty| ต้อง ≤ DEPTH_MAX_TILE_COORD (${DEPTH_MAX_TILE_COORD}) ` +
        `ไม่งั้น band overlap (got tx=${tile.tx}, ty=${tile.ty})`,
    );
  }
  return zLayer * DEPTH_ZLAYER_BAND + (tile.tx + tile.ty);
}
