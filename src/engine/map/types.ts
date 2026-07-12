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

import type { MapZoneType, TileSize } from "@/engine/config";
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
  /**
   * ตำแหน่ง **foot ต่อเนื่อง** ใน tile space (float ได้). P0-04 convention:
   * renderer วางด้วย tileToScreen ตรง ๆ (ไม่ +0.5) — อยากวางกลาง cell (n,n+1)²
   * ให้ใส่ n+0.5 เอง (เช่น กลาง cell (12,8) = { tx: 12.5, ty: 8.5 }).
   */
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
  /**
   * respawn delay override ต่อ pocket (ms) — มอนใน pocket นี้ตายแล้วเกิดใหม่หลังเวลานี้ (P1-03, §18.1
   * "respawn window configurable"). ไม่ระบุ → ใช้ global default (MobConfig.respawnDelayMs).
   */
  respawnDelayMs?: number;
}

/**
 * Transition point (P1-10, GS §57.3 "separated rooms + loading/fade") — พื้นที่ (rect) บน map นี้
 * ที่เดินเข้าไปแล้ว **ข้าม map** (โหลดฉากใหม่ ไม่ seamless). ทุกพิกัดเป็น tile space เหมือน field อื่น.
 *
 * detection = server-authoritative ตอน online (findExitAt ใน MSG_MOVE → ส่ง MSG_MAP_TRANSITION),
 * และ client-side ตอน offline (mirror pure fn เดียวกัน — ไม่มี server ก็ข้าม map ได้). targetSpawn อยู่
 * ใน **coordinate space ของ targetMapId** (ไม่ใช่ map นี้) → loader ตรวจแค่ shape; registry ตรวจ
 * cross-ref (targetMapId มีจริง + targetSpawn เดินได้ใน target map).
 */
export interface MapExit {
  /** id ไม่ซ้ำภายใน map */
  exitId: string;
  /** พื้นที่ trigger (rect tile) — player snap tile อยู่ใน rect นี้ → ข้าม map */
  area: TileRect;
  /** mapId ปลายทาง (ต้องมีใน registry — validate ที่ registry ไม่ใช่ loader) */
  targetMapId: string;
  /** จุดเกิดใน target map (tile coord, float ได้) — **ต้องอยู่นอก exit area ปลายทาง** กัน re-trigger ทันที */
  targetSpawn: SpawnPoint;
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
  /**
   * ประเภทโซน (P1-11, GS §14) — optional; ไม่ระบุ → "field" (Safe Field, combat ปกติ). "safe" = เมือง
   * (ไม่มี combat: server ปฏิเสธ cast, client disable ปุ่มโจมตี) + cap สูงกว่า. loader validate enum.
   */
  zoneType?: MapZoneType;
  spawnPoint: SpawnPoint;
  /**
   * จุด safe camp ของ map (P1-07, §59.1 reconnect fallback / จุดวาป). **optional** — ไม่ระบุ →
   * fallback = spawnPoint (ดู safeCampOf). ค่าเป็น tile coord (float ได้) เหมือน spawnPoint,
   * ต้องเดินได้ (loader validate เหมือน spawnPoint). P0 Test Field ยังไม่ตั้ง = ใช้ spawnPoint.
   */
  safeCamp?: SpawnPoint;
  collision: CollisionLayerInput;
  props: PropSpawn[];
  mobPockets: MobPocket[];
  /** transition points (P1-10, §57.3) — optional; ไม่ระบุ → [] (map ปลายทาง/dev). */
  exits?: MapExit[];
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
  /** ประเภทโซน (P1-11, GS §14) — always present (default "field" เมื่อ input ไม่ระบุ). */
  zoneType: MapZoneType;
  spawnPoint: SpawnPoint;
  /** safe camp / reconnect fallback (P1-07, §59.1) — optional; ไม่มี → ใช้ spawnPoint (ดู safeCampOf) */
  safeCamp?: SpawnPoint;
  collision: CollisionLayer;
  readonly props: readonly PropSpawn[];
  readonly mobPockets: readonly MobPocket[];
  /** transition points (P1-10, §57.3) — always present (default [] เมื่อ map ไม่มี exit). */
  readonly exits: readonly MapExit[];
}

/**
 * จุด safe camp ของ map (P1-07, §59.1 reconnect fallback) — map.safeCamp ถ้ามี, ไม่งั้น spawnPoint.
 * server ใช้เป็นจุด spawn เมื่อ reconnect เกิน grace / ตำแหน่งเดิม invalid (§59.1).
 */
export function safeCampOf(map: MapConfig): SpawnPoint {
  return map.safeCamp ?? map.spawnPoint;
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

/**
 * integer tile (tx,ty) อยู่ใน rect หรือไม่ — ครอบ [tx, tx+width) × [ty, ty+height). คาดหวัง integer tile.
 */
export function isTileInRect(rect: TileRect, tx: number, ty: number): boolean {
  return (
    tx >= rect.tx &&
    ty >= rect.ty &&
    tx < rect.tx + rect.width &&
    ty < rect.ty + rect.height
  );
}

/**
 * exit ที่ integer tile นี้อยู่ในพื้นที่ (P1-10) — คืน exit แรกที่ตรง (map ออกแบบให้ area ไม่ทับกัน)
 * หรือ null. **pure + mirror ทั้ง server/client** (server-authoritative detection ตอน online, client
 * offline fallback ใช้ตัวเดียวกัน). คาดหวัง integer tile จาก snapToTile.
 */
export function findExitAt(
  map: MapConfig,
  tx: number,
  ty: number,
): MapExit | null {
  for (const exit of map.exits) {
    if (isTileInRect(exit.area, tx, ty)) return exit;
  }
  return null;
}
