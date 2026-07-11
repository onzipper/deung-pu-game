// Map config schema — pure TS types + tiny helpers, no rendering, no PixiJS.
// Plain TS only — ห้าม import React / Next.js / pixi runtime (invariant engine layer).
//
// Shape ของ MapConfig **ล็อกโดย spec (P0 §4.3)** — field ชั้นนอกห้าม rename:
//   mapId · name · tileSize · bounds · spawnPoint · collision · props · mobPockets
// โครง "ชั้นใน" (CollisionLayer / PropSpawn / MobPocket) tech ออกแบบเอง — เลือกให้
// สอดคล้อง iso grid convention ของ P0-02 (coords.ts / depth.ts).
//
// ── หน่วยพิกัด (สำคัญ กัน bug class "สับ screen กับ tile") ─────────────────────
// ทุกพิกัดในไฟล์นี้เป็น **tile space** (หน่วย = tile, แกนเดียวกับ TilePoint.tx/ty)
// ไม่ใช่ pixel. iso projection เป็นเรื่องของ renderer (P0-04) — map config ไม่แตะ screen.
//   • spawnPoint ใช้ชื่อ field {x,y} ตาม spec (P0 §4.3) แต่ค่าเป็น tile coord (float ได้)
//   • bounds {width,height} = จำนวน tile ต่อแกน → grid ครอบ tile [0,width) × [0,height)

import type { TileSize } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";

/**
 * ขนาด grid เป็นจำนวน tile ต่อแกน (integer > 0).
 * grid ครอบ integer tile tx ∈ [0, width), ty ∈ [0, height).
 */
export interface MapBounds {
  /** จำนวน tile แกน tx */
  width: number;
  /** จำนวน tile แกน ty */
  height: number;
}

/**
 * จุดเกิดผู้เล่น. field {x,y} ตาม spec P0 §4.3 (ห้าม rename เป็น tx/ty)
 * แต่ค่าเป็น **tile coord** (แกนเดียวกับ TilePoint) — float ได้ เพื่อวางกลาง tile.
 */
export interface SpawnPoint {
  /** tile X (= tx space) */
  x: number;
  /** tile Y (= ty space) */
  y: number;
}

/**
 * สี่เหลี่ยมในพิกัด tile (integer). ครอบ tile [tx, tx+width) × [ty, ty+height).
 * ใช้ทั้ง collision (กำแพง/บ่อ block เป็นบล็อก) และ mob pocket area.
 */
export interface TileRect {
  /** มุม tile ซ้าย-บนของ rect (integer) */
  tx: number;
  /** มุม tile ซ้าย-บนของ rect (integer) */
  ty: number;
  /** ความกว้าง (จำนวน tile, integer ≥ 1) */
  width: number;
  /** ความสูง (จำนวน tile, integer ≥ 1) */
  height: number;
}

/**
 * Authoring form ของ collision — เขียน block เป็น rect (กำแพง/บ่อ) + tile เดี่ยว.
 * เก็บ compact อ่านง่ายตอน author map; loader จะ build เป็น set สำหรับ lookup O(1).
 */
export interface CollisionLayerInput {
  /** บล็อกเดินไม่ได้แบบสี่เหลี่ยม (integer tile) */
  blockedRects?: TileRect[];
  /** บล็อกเดินไม่ได้ทีละ tile (integer tile) */
  blockedTiles?: TilePoint[];
}

/**
 * Loaded collision layer. คง authoring form ไว้ (debug/serialize) + เพิ่ม `blockedSet`
 * = packed integer key สำหรับ lookup O(1) ด้วย integer tile จาก snapToTile.
 *
 * key pack = ty · bounds.width + tx (ดู packTile) — valid เฉพาะ tile ในขอบเขต grid.
 */
export interface CollisionLayer {
  readonly blockedRects: readonly TileRect[];
  readonly blockedTiles: readonly TilePoint[];
  /** built by loader — packed integer keys ของทุก tile ที่ block */
  readonly blockedSet: ReadonlySet<number>;
}

/**
 * Prop วางบน map (ต้นไม้/หิน/ตอ ฯลฯ). ตำแหน่งเป็น tile coord **float ได้**
 * (จงใจ วางไม่ตรง grid เพื่อทดสอบ depth sort ใน P0-04).
 * zLayer = band override ส่งตรงเข้า depthKey (depth.ts) — default 0.
 */
export interface PropSpawn {
  /** placeholder asset/type id (เช่น "tree", "rock") */
  propId: string;
  /** ตำแหน่ง tile space (float ได้) */
  tile: TilePoint;
  /** band override สำหรับ depth sort (integer; optional, default 0) */
  zLayer?: number;
}

/**
 * ช่วง pack size ของ 1 pocket (จำนวน mob ต่อการ spawn 1 ชุด).
 */
export interface PackSize {
  /** ต่ำสุด (integer ≥ 1) */
  min: number;
  /** สูงสุด (integer ≥ min) */
  max: number;
}

/**
 * Farming pocket — โซนบน grid ที่ mob เกิด (TA §18: Fixed Pocket + random point ข้างใน).
 * ตรงนี้เก็บแค่ "นิยาม pocket" (config) — logic การสุ่มจุด/respawn เป็นของ P0-09.
 * **ทุกตัวเลขเป็น config field ไม่ hardcode** (Design Knob discipline).
 */
export interface MobPocket {
  /** id ไม่ซ้ำภายใน map */
  pocketId: string;
  /** โซน spawn (rect ในพิกัด tile) — จุดเกิดสุ่มภายใน rect นี้ (P0-09) */
  area: TileRect;
  /** placeholder mob type id (เช่น "slime", "mushroom") */
  mobType: string;
  /** จำนวน mob ต่อ pack */
  packSize: PackSize;
  /** จำนวน mob มีชีวิตพร้อมกันสูงสุดใน pocket */
  activeCap: number;
}

/**
 * Authoring/raw form ของ map config — สิ่งที่ author เขียน (p0-test-field.ts)
 * และสิ่งที่ loadMapConfig รับเข้ามา validate. collision เป็น data ล้วน (ยังไม่มี blockedSet).
 */
export interface MapConfigInput {
  mapId: string;
  name: string;
  tileSize: TileSize;
  bounds: MapBounds;
  spawnPoint: SpawnPoint;
  collision: CollisionLayerInput;
  props: PropSpawn[];
  mobPockets: MobPocket[];
}

/**
 * Loaded map config — output ของ loadMapConfig. โครงชั้นนอกตรง spec P0 §4.3 เป๊ะ.
 * ต่างจาก input ตรง collision ถูก build เป็น CollisionLayer (มี blockedSet lookup O(1)).
 */
export interface MapConfig {
  mapId: string;
  name: string;
  tileSize: TileSize;
  bounds: MapBounds;
  spawnPoint: SpawnPoint;
  collision: CollisionLayer;
  readonly props: readonly PropSpawn[];
  readonly mobPockets: readonly MobPocket[];
}

/**
 * pack integer tile (tx,ty) → key เดียว สำหรับ collision Set lookup O(1).
 * valid เฉพาะ tile ในขอบเขต grid: tx ∈ [0,width), ty ∈ [0,height).
 * stride = bounds.width → key ไม่ชนกันในกริด (แถวละ width ช่อง).
 */
export function packTile(tx: number, ty: number, boundsWidth: number): number {
  return ty * boundsWidth + tx;
}

/**
 * integer tile (tx,ty) อยู่ในขอบเขต grid หรือไม่ (tx ∈ [0,width), ty ∈ [0,height)).
 * คาดหวัง integer tile (จาก snapToTile) — ไม่ snap ให้เอง.
 */
export function isWithinBounds(
  map: MapConfig,
  tx: number,
  ty: number,
): boolean {
  return tx >= 0 && ty >= 0 && tx < map.bounds.width && ty < map.bounds.height;
}

/**
 * integer tile นี้ถูก mark เดินไม่ได้ (อยู่ใน collision) หรือไม่ — lookup O(1).
 * คาดหวัง integer tile (จาก snapToTile). tile นอกขอบเขต → false (ใช้ isWithinBounds แยก).
 */
export function isBlockedTile(map: MapConfig, tx: number, ty: number): boolean {
  return map.collision.blockedSet.has(packTile(tx, ty, map.bounds.width));
}

/**
 * เดินลง tile นี้ได้ไหม = อยู่ในขอบเขต **และ** ไม่ block. helper รวมสำหรับ P0-05 movement.
 * คาดหวัง integer tile (จาก snapToTile).
 */
export function isWalkableTile(
  map: MapConfig,
  tx: number,
  ty: number,
): boolean {
  return isWithinBounds(map, tx, ty) && !isBlockedTile(map, tx, ty);
}
