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
import { findExitAt, isWalkableTile } from "@/engine/map/types";
import type { MapConfigInput } from "@/engine/map/types";

describe("MAP_REGISTRY — registry จริงของเกม (P1-10)", () => {
  test("มี p0-test-field + map1", () => {
    expect(hasMap("p0-test-field")).toBe(true);
    expect(hasMap(MAP1_ID)).toBe(true);
    expect(hasMap("nope")).toBe(false);
    expect(MAP_REGISTRY.size).toBe(2);
  });

  test("getMap/requireMap คืน map ที่ validate แล้ว, requireMap throw เมื่อไม่มี", () => {
    expect(getMap(MAP1_ID)?.mapId).toBe(MAP1_ID);
    expect(getMap("nope")).toBeUndefined();
    expect(requireMap(MAP1_ID).name).toContain("Map 1");
    expect(() => requireMap("nope")).toThrow(MapRegistryError);
  });

  test("exit ทั้งสองทางเชื่อมกันครบวง + targetSpawn เดินได้ในปลายทาง", () => {
    const testField = requireMap("p0-test-field");
    const map1 = requireMap(MAP1_ID);

    // test field → map1
    const tfExit = testField.exits.find((e) => e.targetMapId === MAP1_ID);
    expect(tfExit).toBeDefined();
    const s1 = tfExit!.targetSpawn;
    expect(isWalkableTile(map1, Math.floor(s1.x), Math.floor(s1.y))).toBe(true);

    // map1 → test field
    const m1Exit = map1.exits.find((e) => e.targetMapId === "p0-test-field");
    expect(m1Exit).toBeDefined();
    const s2 = m1Exit!.targetSpawn;
    expect(isWalkableTile(testField, Math.floor(s2.x), Math.floor(s2.y))).toBe(true);

    // targetSpawn ต้องไม่อยู่ใน exit area ปลายทาง (กัน re-trigger ทันที)
    expect(findExitAt(map1, Math.floor(s1.x), Math.floor(s1.y))).toBeNull();
    expect(findExitAt(testField, Math.floor(s2.x), Math.floor(s2.y))).toBeNull();
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

  test("real MAP1 + P0_TEST_FIELD ผ่าน buildMapRegistry", () => {
    expect(() => buildMapRegistry([P0_TEST_FIELD, MAP1])).not.toThrow();
  });
});
