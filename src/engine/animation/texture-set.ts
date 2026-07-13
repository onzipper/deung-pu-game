// Entity texture-set contract — the shared surface between a texture source (placeholder generator
// today, atlas loader next) and the animator. Plain TS + PixiJS (type-only) — ห้าม React/Next.
//
// โซนใกล้ depth-sort/anchor: `anchor` คือ foot anchor (local 0,0 → ตำแหน่งบน tile) — x=0.5 บังคับให้
// flip (mirror) หมุนรอบเท้า ตำแหน่งไม่ย้าย. ทั้ง placeholder และ atlas set ต้อง implement เหมือนกัน
// เป๊ะ ๆ เพื่อให้ animator + depth registry ทำงานถูกไม่ว่ามาจาก source ไหน.

import type { Texture } from "pixi.js";
import type { Direction } from "@/engine/movement/direction";

/**
 * ชุด texture ของ entity 1 ชนิด (generate/load แล้ว) + anchor เท้า. animator ดึงผ่าน get().
 * contract เดียวที่ทั้ง placeholder generator (player/mob) และ atlas loader ต้องทำตาม.
 */
export interface EntityTextureSet {
  /** anchor ให้ sprite (foot ที่ local 0,0 → ตำแหน่งจริงบน tile) — x=0.5 บังคับให้ flip รอบเท้า */
  readonly anchor: { x: number; y: number };
  /** ดึง texture list ของ (animation, drawnDirection). ทิศต้องเป็นทิศที่ "วาดจริง" (post-mirror-resolve) */
  get(animation: string, drawnDir: Direction): readonly Texture[];
  /** destroy ทุก texture ที่ถือครอง (เรียกตอน entity.destroy) */
  destroy(): void;
}
