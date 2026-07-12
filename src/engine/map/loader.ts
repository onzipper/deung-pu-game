// Map config loader/validator — pure TS, no rendering, no PixiJS.
// Plain TS only — ห้าม import React / Next.js / pixi runtime (invariant engine layer).
//
// loadMapConfig(raw): validate โครง + ค่า invariant ของ map config แล้ว build
// CollisionLayer (blockedSet lookup O(1)). ผิด → throw Error ข้อความชี้ field ที่ผิด
// (fail-loud: config เพี้ยนควรพังตอน load ไม่ใช่เงียบแล้วไปพังตอน render/movement).
//
// ไม่ใช้ zod (ไม่เพิ่ม dependency) — validate ด้วยมือ, helper เล็ก ๆ ด้านล่าง.

import { snapToTile, type TilePoint } from "@/engine/iso/coords";
import type { MapZoneType } from "@/engine/config";
import {
  packTile,
  type CollisionLayer,
  type MapBounds,
  type MapConfig,
  type MapExit,
  type MobPocket,
  type PropSpawn,
  type SpawnPoint,
  type TileRect,
} from "@/engine/map/types";

/** error ชนิดเดียวของ loader — prefix ข้อความให้รู้ว่ามาจาก map config. */
export class MapConfigError extends Error {
  constructor(message: string) {
    super(`MapConfig invalid: ${message}`);
    this.name = "MapConfigError";
  }
}

function fail(msg: string): never {
  throw new MapConfigError(msg);
}

function asRecord(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    fail(`${path} ต้องเป็น object (got ${describe(v)})`);
  }
  return v as Record<string, unknown>;
}

function asArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(`${path} ต้องเป็น array (got ${describe(v)})`);
  return v;
}

function reqString(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) {
    fail(`${path} ต้องเป็น string ไม่ว่าง (got ${describe(v)})`);
  }
  return v;
}

function reqFinite(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    fail(`${path} ต้องเป็น number finite (got ${describe(v)})`);
  }
  return v;
}

function reqInt(v: unknown, path: string): number {
  const n = reqFinite(v, path);
  if (!Number.isInteger(n)) fail(`${path} ต้องเป็น integer (got ${n})`);
  return n;
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function parseTilePoint(v: unknown, path: string): TilePoint {
  const o = asRecord(v, path);
  return { tx: reqFinite(o.tx, `${path}.tx`), ty: reqFinite(o.ty, `${path}.ty`) };
}

function parseIntTile(v: unknown, path: string): TilePoint {
  const o = asRecord(v, path);
  return { tx: reqInt(o.tx, `${path}.tx`), ty: reqInt(o.ty, `${path}.ty`) };
}

function parseTileSize(v: unknown): { width: number; height: number } {
  const o = asRecord(v, "tileSize");
  const width = reqFinite(o.width, "tileSize.width");
  const height = reqFinite(o.height, "tileSize.height");
  if (width <= 0) fail(`tileSize.width ต้อง > 0 (got ${width})`);
  if (height <= 0) fail(`tileSize.height ต้อง > 0 (got ${height})`);
  return { width, height };
}

/** P1-11: zoneType (optional) — ไม่ระบุ → "field" (default combat); ต้องเป็น "safe" | "field" เท่านั้น. */
function parseZoneType(v: unknown): MapZoneType {
  if (v === undefined) return "field";
  if (v !== "safe" && v !== "field") {
    fail(`zoneType ต้องเป็น "safe" | "field" (got ${describe(v)})`);
  }
  return v;
}

function parseBounds(v: unknown): MapBounds {
  const o = asRecord(v, "bounds");
  const width = reqInt(o.width, "bounds.width");
  const height = reqInt(o.height, "bounds.height");
  if (width <= 0) fail(`bounds.width ต้อง > 0 (got ${width})`);
  if (height <= 0) fail(`bounds.height ต้อง > 0 (got ${height})`);
  return { width, height };
}

/** rect integer ในขอบเขต grid (มุมและขอบไกลต้องไม่หลุด bounds). */
function parseRect(v: unknown, path: string, bounds: MapBounds): TileRect {
  const o = asRecord(v, path);
  const tx = reqInt(o.tx, `${path}.tx`);
  const ty = reqInt(o.ty, `${path}.ty`);
  const width = reqInt(o.width, `${path}.width`);
  const height = reqInt(o.height, `${path}.height`);
  if (width < 1) fail(`${path}.width ต้อง ≥ 1 (got ${width})`);
  if (height < 1) fail(`${path}.height ต้อง ≥ 1 (got ${height})`);
  if (tx < 0 || ty < 0 || tx + width > bounds.width || ty + height > bounds.height) {
    fail(
      `${path} หลุดขอบ map — rect [${tx},${ty}]+${width}×${height} ต้องอยู่ใน ` +
        `bounds ${bounds.width}×${bounds.height}`,
    );
  }
  return { tx, ty, width, height };
}

function requireIntTileInBounds(
  tile: TilePoint,
  path: string,
  bounds: MapBounds,
): void {
  if (
    tile.tx < 0 ||
    tile.ty < 0 ||
    tile.tx >= bounds.width ||
    tile.ty >= bounds.height
  ) {
    fail(
      `${path} tile (${tile.tx},${tile.ty}) หลุดขอบ bounds ` +
        `${bounds.width}×${bounds.height}`,
    );
  }
}

function parseCollision(
  v: unknown,
  bounds: MapBounds,
): { layer: CollisionLayer; blockedSet: Set<number> } {
  const o = asRecord(v, "collision");
  const rects: TileRect[] = [];
  const tiles: TilePoint[] = [];
  const blockedSet = new Set<number>();

  if (o.blockedRects !== undefined) {
    const arr = asArray(o.blockedRects, "collision.blockedRects");
    arr.forEach((r, i) => {
      const rect = parseRect(r, `collision.blockedRects[${i}]`, bounds);
      rects.push(rect);
      for (let ty = rect.ty; ty < rect.ty + rect.height; ty++) {
        for (let tx = rect.tx; tx < rect.tx + rect.width; tx++) {
          blockedSet.add(packTile(tx, ty, bounds.width));
        }
      }
    });
  }
  if (o.blockedTiles !== undefined) {
    const arr = asArray(o.blockedTiles, "collision.blockedTiles");
    arr.forEach((t, i) => {
      const tile = parseIntTile(t, `collision.blockedTiles[${i}]`);
      requireIntTileInBounds(tile, `collision.blockedTiles[${i}]`, bounds);
      tiles.push(tile);
      blockedSet.add(packTile(tile.tx, tile.ty, bounds.width));
    });
  }

  return {
    layer: {
      blockedRects: rects,
      blockedTiles: tiles,
      blockedSet,
    },
    blockedSet,
  };
}

function parseSpawnPoint(
  v: unknown,
  bounds: MapBounds,
  blockedSet: ReadonlySet<number>,
  path = "spawnPoint",
): SpawnPoint {
  const o = asRecord(v, path);
  const x = reqFinite(o.x, `${path}.x`);
  const y = reqFinite(o.y, `${path}.y`);
  // spawn เป็น tile coord (float ได้) → snap ก่อนเช็ค cell.
  const cell = snapToTile({ tx: x, ty: y });
  requireIntTileInBounds(cell, path, bounds);
  if (blockedSet.has(packTile(cell.tx, cell.ty, bounds.width))) {
    fail(
      `${path} (${x},${y}) → cell (${cell.tx},${cell.ty}) ทับ collision — ` +
        `จุดเกิดต้องเดินได้`,
    );
  }
  return { x, y };
}

function parseProp(v: unknown, path: string): PropSpawn {
  const o = asRecord(v, path);
  const prop: PropSpawn = {
    propId: reqString(o.propId, `${path}.propId`),
    tile: parseTilePoint(o.tile, `${path}.tile`),
  };
  if (o.zLayer !== undefined) prop.zLayer = reqInt(o.zLayer, `${path}.zLayer`);
  return prop;
}

function parsePocket(
  v: unknown,
  path: string,
  bounds: MapBounds,
): MobPocket {
  const o = asRecord(v, path);
  const pocketId = reqString(o.pocketId, `${path}.pocketId`);
  const mobType = reqString(o.mobType, `${path}.mobType`);
  const area = parseRect(o.area, `${path}.area`, bounds);

  const ps = asRecord(o.packSize, `${path}.packSize`);
  const min = reqInt(ps.min, `${path}.packSize.min`);
  const max = reqInt(ps.max, `${path}.packSize.max`);
  if (min < 1) fail(`${path}.packSize.min ต้อง ≥ 1 (got ${min})`);
  if (max < min) fail(`${path}.packSize.max (${max}) ต้อง ≥ min (${min})`);

  const activeCap = reqInt(o.activeCap, `${path}.activeCap`);
  if (activeCap < 1) fail(`${path}.activeCap ต้อง ≥ 1 (got ${activeCap})`);

  const pocket: MobPocket = { pocketId, mobType, area, packSize: { min, max }, activeCap };
  // P1-03: respawn delay override ต่อ pocket (optional) — ไม่ระบุ → global default (MobConfig.respawnDelayMs)
  if (o.respawnDelayMs !== undefined) {
    const d = reqFinite(o.respawnDelayMs, `${path}.respawnDelayMs`);
    if (d < 0) fail(`${path}.respawnDelayMs ต้อง ≥ 0 (got ${d})`);
    pocket.respawnDelayMs = d;
  }
  return pocket;
}

/**
 * parse exit 1 จุด (P1-10) — **intrinsic validation เท่านั้น** (สิ่งที่ map นี้รู้เอง):
 *   exitId ไม่ว่าง · area = rect integer ในขอบเขต map นี้ · targetMapId ไม่ว่าง · targetSpawn = {x,y} finite.
 * **ไม่** ตรวจ targetMapId มีจริง / targetSpawn เดินได้ — นั่นเป็น cross-map (targetSpawn อยู่ใน coordinate
 * space ของ map อื่น) → ตรวจที่ registry (validateMapCrossRefs) ที่รู้ทุก map. fail-loud เหมือน field อื่น.
 */
function parseExit(v: unknown, path: string, bounds: MapBounds): MapExit {
  const o = asRecord(v, path);
  const exitId = reqString(o.exitId, `${path}.exitId`);
  const area = parseRect(o.area, `${path}.area`, bounds);
  const targetMapId = reqString(o.targetMapId, `${path}.targetMapId`);
  const ts = asRecord(o.targetSpawn, `${path}.targetSpawn`);
  const targetSpawn: SpawnPoint = {
    x: reqFinite(ts.x, `${path}.targetSpawn.x`),
    y: reqFinite(ts.y, `${path}.targetSpawn.y`),
  };
  return { exitId, area, targetMapId, targetSpawn };
}

/**
 * Validate + build map config จาก raw (unknown). throw MapConfigError ถ้าผิด.
 *
 * Invariant ที่คุ้ม:
 *  • mapId/name = string ไม่ว่าง
 *  • zoneType (optional) = "safe" | "field" (default "field")
 *  • tileSize.width/height > 0
 *  • bounds.width/height = integer > 0
 *  • collision rect/tile = integer อยู่ในขอบเขต → build blockedSet (lookup O(1))
 *  • spawnPoint (snap เป็น cell) อยู่ในขอบเขต และ **ไม่ทับ collision**
 *  • props: propId ไม่ว่าง, tile finite (float ได้), zLayer integer ถ้ามี
 *  • mobPockets: id ไม่ซ้ำ, area อยู่ในขอบเขต, packSize 1≤min≤max, activeCap ≥ 1
 *  • exits (optional): id ไม่ซ้ำ, area อยู่ในขอบเขต, targetMapId/targetSpawn shape ถูก
 *    (cross-ref target มีจริง + เดินได้ = registry.validateMapCrossRefs, ไม่ใช่ที่นี่)
 */
export function loadMapConfig(raw: unknown): MapConfig {
  const o = asRecord(raw, "root");

  const mapId = reqString(o.mapId, "mapId");
  const name = reqString(o.name, "name");
  const tileSize = parseTileSize(o.tileSize);
  const zoneType = parseZoneType(o.zoneType);
  const bounds = parseBounds(o.bounds);

  const { layer: collision, blockedSet } = parseCollision(o.collision, bounds);
  const spawnPoint = parseSpawnPoint(o.spawnPoint, bounds, blockedSet);
  // P1-07 (§59.1): safe camp optional — validate เหมือน spawnPoint (ในขอบเขต + เดินได้) ถ้าระบุ.
  const safeCamp =
    o.safeCamp !== undefined
      ? parseSpawnPoint(o.safeCamp, bounds, blockedSet, "safeCamp")
      : undefined;

  const rawProps = asArray(o.props, "props");
  const props = rawProps.map((p, i) => parseProp(p, `props[${i}]`));

  const rawPockets = asArray(o.mobPockets, "mobPockets");
  const seenPocketIds = new Set<string>();
  const mobPockets = rawPockets.map((p, i) => {
    const pocket = parsePocket(p, `mobPockets[${i}]`, bounds);
    if (seenPocketIds.has(pocket.pocketId)) {
      fail(`mobPockets[${i}].pocketId ซ้ำ ("${pocket.pocketId}")`);
    }
    seenPocketIds.add(pocket.pocketId);
    return pocket;
  });

  // P1-10: exits (optional) — intrinsic validate + id ไม่ซ้ำ. cross-ref (target มีจริง/เดินได้) = registry.
  const exits: MapExit[] = [];
  if (o.exits !== undefined) {
    const rawExits = asArray(o.exits, "exits");
    const seenExitIds = new Set<string>();
    rawExits.forEach((e, i) => {
      const exit = parseExit(e, `exits[${i}]`, bounds);
      if (seenExitIds.has(exit.exitId)) {
        fail(`exits[${i}].exitId ซ้ำ ("${exit.exitId}")`);
      }
      seenExitIds.add(exit.exitId);
      exits.push(exit);
    });
  }

  return {
    mapId,
    name,
    tileSize,
    zoneType,
    bounds,
    spawnPoint,
    ...(safeCamp !== undefined ? { safeCamp } : {}),
    collision,
    props,
    mobPockets,
    exits,
  };
}
