// Map registry (P1-10) — mapId → MapConfig ที่ validate แล้ว. Pure TS, **ใช้ร่วม client + server**
// (ห้าม import React / Next.js / pixi / colyseus). Single source of truth ว่ามี map ไหนบ้าง + build ครั้งเดียว.
//
// หน้าที่:
//   • โหลด raw map ทุกตัวผ่าน loadMapConfig (intrinsic validate + build blockedSet)
//   • validate **cross-ref** ที่ loader ทำไม่ได้ (มันรู้ทีละ map): mapId ไม่ซ้ำ · exit.targetMapId มีจริง ·
//     exit.targetSpawn เดินได้ใน target map (snap → isWalkableTile). fail-loud ตอน import (บั๊ก config
//     ควรพังตอน boot ไม่ใช่ตอน transition กลางเกม).
//   • lookup: getMap / requireMap / hasMap — server (MapRoom.onCreate) + client (transition) ใช้ตัวเดียวกัน.

import { snapToTile } from "@/engine/iso/coords";
import { loadMapConfig } from "@/engine/map/loader";
import { P0_TEST_FIELD } from "@/engine/map/p0-test-field";
import { MAP1 } from "@/engine/map/map1";
import { MAP2 } from "@/engine/map/map2";
import { MAP3 } from "@/engine/map/map3";
import { MAP4 } from "@/engine/map/map4";
import { CITY_HUB } from "@/engine/map/city-hub";
import {
  isWalkableTile,
  type MapConfig,
  type MapConfigInput,
} from "@/engine/map/types";

/**
 * raw map ทุกตัวใน launch registry (test field + Map 1 + City Hub + Batch 5 Map 2–4). Map 2–4 = ถนนชายไร่/
 * ทางป่าเก่า/ป่าจันทร์เงา (exit เชื่อมกันครบวง map1↔map2↔map3↔map4). validation cross-ref auto-run ตอน import.
 */
const RAW_MAPS: readonly MapConfigInput[] = [P0_TEST_FIELD, MAP1, MAP2, MAP3, MAP4, CITY_HUB];

/** error ของ registry (cross-ref) — แยกจาก MapConfigError (intrinsic ของ loader). */
export class MapRegistryError extends Error {
  constructor(message: string) {
    super(`MapRegistry invalid: ${message}`);
    this.name = "MapRegistryError";
  }
}

/**
 * validate cross-map references หลัง build (P1-10). สำหรับทุก exit ในทุก map:
 *   • targetMapId ต้องมีใน registry
 *   • targetSpawn (snap เป็น cell) ต้องเดินได้ใน target map (ในขอบเขต + ไม่ block) — กันวาปไปจุดตาย/นอก map
 */
function validateMapCrossRefs(registry: ReadonlyMap<string, MapConfig>): void {
  for (const map of registry.values()) {
    for (const exit of map.exits) {
      const target = registry.get(exit.targetMapId);
      if (!target) {
        throw new MapRegistryError(
          `exit "${map.mapId}/${exit.exitId}" → targetMapId "${exit.targetMapId}" ไม่มีใน registry`,
        );
      }
      const cell = snapToTile({ tx: exit.targetSpawn.x, ty: exit.targetSpawn.y });
      if (!isWalkableTile(target, cell.tx, cell.ty)) {
        throw new MapRegistryError(
          `exit "${map.mapId}/${exit.exitId}" → targetSpawn (${exit.targetSpawn.x},${exit.targetSpawn.y}) ` +
            `→ cell (${cell.tx},${cell.ty}) เดินไม่ได้ใน "${exit.targetMapId}"`,
        );
      }
    }
  }
}

/**
 * build registry จาก raw list (โหลดผ่าน loader + validate mapId ไม่ซ้ำ + cross-ref). throw ถ้าผิด.
 * exported เพื่อให้เทสต์สร้าง registry จาก fixture ที่จงใจผิด (ทดสอบ cross-ref validation).
 */
export function buildMapRegistry(
  rawMaps: readonly MapConfigInput[],
): ReadonlyMap<string, MapConfig> {
  const registry = new Map<string, MapConfig>();
  for (const raw of rawMaps) {
    const map = loadMapConfig(raw);
    if (registry.has(map.mapId)) {
      throw new MapRegistryError(`mapId ซ้ำ ("${map.mapId}")`);
    }
    registry.set(map.mapId, map);
  }
  validateMapCrossRefs(registry);
  return registry;
}

/** registry จริงของเกม — build ครั้งเดียวตอน import (fail-loud ถ้า config เพี้ยน). */
export const MAP_REGISTRY: ReadonlyMap<string, MapConfig> = buildMapRegistry(RAW_MAPS);

/** map ตาม id (undefined ถ้าไม่มี). */
export function getMap(mapId: string): MapConfig | undefined {
  return MAP_REGISTRY.get(mapId);
}

/** true ถ้ามี map นี้ใน registry. */
export function hasMap(mapId: string): boolean {
  return MAP_REGISTRY.has(mapId);
}

/** map ตาม id — throw ถ้าไม่มี (server/client ใช้ตอนต้องมีแน่ ๆ เช่น join/transition). */
export function requireMap(mapId: string): MapConfig {
  const map = MAP_REGISTRY.get(mapId);
  if (!map) {
    throw new MapRegistryError(
      `ไม่รู้จัก mapId "${mapId}" (มี: ${[...MAP_REGISTRY.keys()].join(", ")})`,
    );
  }
  return map;
}
