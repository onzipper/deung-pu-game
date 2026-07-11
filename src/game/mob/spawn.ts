// Mob pocket spawn logic — pure, no PixiJS/React (src/game/** ใช้ engine ผ่าน public API เท่านั้น).
//
// TA §18.1: "Fixed Pocket + สุ่มจุดภายใน zone ... ไม่สุ่มทั่ว map" — P0-09 ทำเฉพาะ client/local
// spawn ครั้งเดียว (ไม่มี respawn/mob AI server, นั่นเป็น P1). Design Knob ทุกตัวมาจาก
// MobConfig (src/engine/config.ts) — ไม่ hardcode ที่นี่.

import { snapToTile, type TilePoint } from "@/engine/iso/coords";
import {
  isWalkableTile,
  type MapConfig,
  type MobPocket,
  type TileRect,
} from "@/engine/map/types";
import type { MobSpawnConfig } from "@/engine/config";
import type { RngFn } from "@/game/mob/rng";

/** มอน 1 ตัวที่ spawn แล้ว (ผลลัพธ์ pure — ยังไม่มี pixi display ใด ๆ). */
export interface SpawnedMob {
  /** unique id ภายใน scene entity layer: `${pocketId}#${index}` */
  id: string;
  pocketId: string;
  mobType: string;
  /** ตำแหน่ง foot ต่อเนื่อง (tile space, float) — จุดเกิดสุ่มภายใน pocket.area ที่เดินได้จริง */
  tile: TilePoint;
}

/** integer สุ่ม [min,max] inclusive. */
function randomInt(min: number, max: number, rng: RngFn): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** จุดต่อเนื่องสุ่มภายใน rect (tile space, float) — ครอบ [tx,tx+width) × [ty,ty+height). */
function randomPointInRect(rect: TileRect, rng: RngFn): TilePoint {
  return {
    tx: rect.tx + rng() * rect.width,
    ty: rect.ty + rng() * rect.height,
  };
}

/**
 * หาจุดเกิดสุ่มภายใน `area` ที่ "เดินได้จริง" (isWalkableTile) — สุ่มใหม่ถ้าโดน blocked
 * จำกัด `maxAttempts` รอบ กัน infinite loop (pocket ที่พื้นเดินไม่ได้เกือบหมด).
 * คืน undefined ถ้าหาไม่เจอภายในจำนวนครั้งที่กำหนด (caller ตัดสินใจว่าจะข้ามมอนตัวนั้น).
 */
export function findWalkableSpawnPoint(
  area: TileRect,
  map: MapConfig,
  rng: RngFn,
  maxAttempts: number,
): TilePoint | undefined {
  for (let i = 0; i < maxAttempts; i++) {
    const point = randomPointInRect(area, rng);
    const cell = snapToTile(point);
    if (isWalkableTile(map, cell.tx, cell.ty)) return point;
  }
  return undefined;
}

/**
 * Spawn มอน 1 pack ให้ pocket เดียว: จำนวน = random(packSize.min..max) แล้ว clamp ด้วย
 * activeCap, จุดเกิดของแต่ละตัวสุ่มภายใน area ที่เดินได้จริง (retry ตาม
 * config.maxPlacementAttempts ต่อตัว). มอนที่หาจุดเกิดไม่เจอถูกข้าม (best-effort, ไม่ throw —
 * P0 dummy spawn ไม่ควรพัง scene ทั้งใบเพราะ pocket เดียวหา cell ว่างไม่เจอ). pure ล้วน.
 */
export function spawnPocketMobs(
  pocket: MobPocket,
  map: MapConfig,
  config: MobSpawnConfig,
  rng: RngFn,
): SpawnedMob[] {
  const packSize = randomInt(pocket.packSize.min, pocket.packSize.max, rng);
  const count = Math.min(packSize, pocket.activeCap);
  const mobs: SpawnedMob[] = [];
  for (let i = 0; i < count; i++) {
    const point = findWalkableSpawnPoint(
      pocket.area,
      map,
      rng,
      config.maxPlacementAttempts,
    );
    if (!point) continue; // ข้ามตัวนี้ — หาจุดเกิดเดินได้ไม่เจอภายใน maxAttempts รอบ
    mobs.push({
      id: `${pocket.pocketId}#${i}`,
      pocketId: pocket.pocketId,
      mobType: pocket.mobType,
      tile: point,
    });
  }
  return mobs;
}

/** Spawn ทุก pocket ของ map ในครั้งเดียว (เรียกตอน scene สร้าง — game/mob/manager.ts). */
export function spawnAllPockets(
  map: MapConfig,
  config: MobSpawnConfig,
  rng: RngFn,
): SpawnedMob[] {
  return map.mobPockets.flatMap((pocket) =>
    spawnPocketMobs(pocket, map, config, rng),
  );
}
