import { describe, expect, test } from "vitest";
import {
  buildMapRegistry,
  getMap,
  hasMap,
  MAP_REGISTRY,
  MapRegistryError,
  requireMap,
} from "@/engine/map/registry";
import { MAP1, MAP1_ID } from "@/engine/map/map1";
import { P0_TEST_FIELD } from "@/engine/map/p0-test-field";
import { CITY_HUB, CITY_HUB_ID } from "@/engine/map/city-hub";
import { findExitAt, isWalkableTile } from "@/engine/map/types";
import type { MapConfigInput } from "@/engine/map/types";

describe("MAP_REGISTRY — registry จริงของเกม (P1-10/P1-11)", () => {
  test("มี p0-test-field + map1 + city-hub", () => {
    expect(hasMap("p0-test-field")).toBe(true);
    expect(hasMap(MAP1_ID)).toBe(true);
    expect(hasMap(CITY_HUB_ID)).toBe(true);
    expect(hasMap("nope")).toBe(false);
    expect(MAP_REGISTRY.size).toBe(3);
  });

  test("getMap/requireMap คืน map ที่ validate แล้ว, requireMap throw เมื่อไม่มี", () => {
    expect(getMap(MAP1_ID)?.mapId).toBe(MAP1_ID);
    expect(getMap("nope")).toBeUndefined();
    expect(requireMap(MAP1_ID).name).toContain("Map 1");
    expect(() => requireMap("nope")).toThrow(MapRegistryError);
  });

  /** helper: exit จาก a→b มี targetSpawn เดินได้ในปลายทาง + อยู่นอก exit area ปลายทาง (กัน re-trigger). */
  function assertExitLands(fromMapId: string, targetMapId: string): void {
    const from = requireMap(fromMapId);
    const target = requireMap(targetMapId);
    const exit = from.exits.find((e) => e.targetMapId === targetMapId);
    expect(exit).toBeDefined();
    const s = exit!.targetSpawn;
    expect(isWalkableTile(target, Math.floor(s.x), Math.floor(s.y))).toBe(true);
    expect(findExitAt(target, Math.floor(s.x), Math.floor(s.y))).toBeNull();
  }

  test("topology P1-11: testfield→map1, map1↔city-hub (targetSpawn เดินได้+นอก exit ปลายทาง)", () => {
    // dev boot map: test field → map1 (คงไว้)
    assertExitLands("p0-test-field", MAP1_ID);
    // production: Map 1 ประตูเหนือ → เมือง (เมืองอยู่เหนือ Map 1, bible)
    assertExitLands(MAP1_ID, CITY_HUB_ID);
    // เมือง ประตูใต้ → Map 1 (ครบวงกับ map1-north-gate)
    assertExitLands(CITY_HUB_ID, MAP1_ID);
  });
});

describe("CITY_HUB — นครอรุณผนึก (P1-11, GS §3.3 · §14 Safe Zone)", () => {
  test("โหลดผ่าน + ขนาดกลาง 32×32 + zoneType safe + ไม่มี pocket + 1 exit", () => {
    const city = requireMap(CITY_HUB_ID);
    expect(city.name).toBe("นครอรุณผนึก"); // ชื่อ locked GS §3.3
    expect(city.bounds).toEqual({ width: 32, height: 32 });
    expect(city.zoneType).toBe("safe");
    expect(city.mobPockets).toHaveLength(0); // Safe Zone = ไม่มี combat → ไม่มีมอน
    expect(city.exits).toHaveLength(1);
    expect(city.exits[0].exitId).toBe("city-hub-south-gate");
    expect(city.safeCamp).toBeDefined();
  });

  test("spawn point (ลานกลางเมือง) เดินได้ + ประตูใต้เดินเข้าได้", () => {
    const city = requireMap(CITY_HUB_ID);
    expect(
      isWalkableTile(city, Math.floor(city.spawnPoint.x), Math.floor(city.spawnPoint.y)),
    ).toBe(true);
    // exit area (ช่องประตูใต้) ต้องเดินเข้าได้ (ไม่ทับกำแพง)
    const a = city.exits[0].area;
    expect(isWalkableTile(city, a.tx, a.ty)).toBe(true);
  });
});

describe("MAP1 — production layout ผ่าน validation (P1-10)", () => {
  test("โหลดผ่าน + ขนาด Small–Medium + 4 pocket + 1 exit", () => {
    const map = requireMap(MAP1_ID);
    expect(map.bounds).toEqual({ width: 40, height: 40 });
    expect(map.mobPockets).toHaveLength(4); // MAP_SCALE §5 Map 1 = 4
    expect(map.exits).toHaveLength(1);
    expect(map.safeCamp).toBeDefined();
  });

  test("spawn point เดินได้ (ในขอบ + ไม่ block)", () => {
    const map = requireMap(MAP1_ID);
    expect(isWalkableTile(map, Math.floor(map.spawnPoint.x), Math.floor(map.spawnPoint.y))).toBe(
      true,
    );
  });

  test("pocket density ตรง MAP_SCALE §6 (activeCap)", () => {
    const map = requireMap(MAP1_ID);
    const byId = new Map(map.mobPockets.map((p) => [p.pocketId, p]));
    expect(byId.get("map1-slime-center")?.activeCap).toBe(18);
    expect(byId.get("map1-bird-east")?.activeCap).toBe(12);
    expect(byId.get("map1-boar-southwest")?.activeCap).toBe(18);
    expect(byId.get("map1-boar-elite")?.activeCap).toBe(1);
  });
});

describe("buildMapRegistry — cross-ref validation (P1-10)", () => {
  function baseMap(mapId: string): MapConfigInput {
    return {
      mapId,
      name: mapId,
      tileSize: { width: 64, height: 32 },
      bounds: { width: 10, height: 10 },
      spawnPoint: { x: 5, y: 5 },
      collision: { blockedRects: [{ tx: 8, ty: 8, width: 2, height: 2 }] },
      props: [],
      mobPockets: [],
    };
  }

  test("registry ปกติ (2 map เชื่อมกัน) build ผ่าน", () => {
    const a = baseMap("a");
    a.exits = [
      { exitId: "a-e", area: { tx: 0, ty: 0, width: 1, height: 1 }, targetMapId: "b", targetSpawn: { x: 5, y: 5 } },
    ];
    const b = baseMap("b");
    const reg = buildMapRegistry([a, b]);
    expect(reg.size).toBe(2);
  });

  test("mapId ซ้ำ → throw", () => {
    expect(() => buildMapRegistry([baseMap("dup"), baseMap("dup")])).toThrow(/mapId ซ้ำ/);
  });

  test("exit.targetMapId ไม่มีจริง → throw", () => {
    const a = baseMap("a");
    a.exits = [
      { exitId: "a-e", area: { tx: 0, ty: 0, width: 1, height: 1 }, targetMapId: "ghost", targetSpawn: { x: 5, y: 5 } },
    ];
    expect(() => buildMapRegistry([a])).toThrow(/ไม่มีใน registry/);
  });

  test("exit.targetSpawn เดินไม่ได้ใน target (ทับ collision) → throw", () => {
    const a = baseMap("a");
    a.exits = [
      { exitId: "a-e", area: { tx: 0, ty: 0, width: 1, height: 1 }, targetMapId: "b", targetSpawn: { x: 8.5, y: 8.5 } },
    ];
    const b = baseMap("b"); // (8,8) อยู่ใน blockedRect
    expect(() => buildMapRegistry([a, b])).toThrow(/เดินไม่ได้/);
  });

  test("real P0_TEST_FIELD + MAP1 + CITY_HUB ผ่าน buildMapRegistry", () => {
    expect(() => buildMapRegistry([P0_TEST_FIELD, MAP1, CITY_HUB])).not.toThrow();
  });
});
