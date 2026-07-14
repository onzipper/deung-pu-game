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
import { MAP2, MAP2_ID } from "@/engine/map/map2";
import { MAP3, MAP3_ID } from "@/engine/map/map3";
import { MAP4, MAP4_ID } from "@/engine/map/map4";
import { P0_TEST_FIELD } from "@/engine/map/p0-test-field";
import { CITY_HUB, CITY_HUB_ID } from "@/engine/map/city-hub";
import { findExitAt, isWalkableTile } from "@/engine/map/types";
import type { MapConfigInput } from "@/engine/map/types";

describe("MAP_REGISTRY — registry จริงของเกม (P1-10/P1-11)", () => {
  test("มี p0-test-field + map1 + city-hub + Batch 5 map2/3/4", () => {
    expect(hasMap("p0-test-field")).toBe(true);
    expect(hasMap(MAP1_ID)).toBe(true);
    expect(hasMap(MAP2_ID)).toBe(true);
    expect(hasMap(MAP3_ID)).toBe(true);
    expect(hasMap(MAP4_ID)).toBe(true);
    expect(hasMap(CITY_HUB_ID)).toBe(true);
    expect(hasMap("nope")).toBe(false);
    expect(MAP_REGISTRY.size).toBe(6);
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
  test("โหลดผ่าน + ขนาด Small–Medium + 4 farming pocket + 1 boss pocket + 2 exit (city-hub + Batch 5 map2)", () => {
    const map = requireMap(MAP1_ID);
    expect(map.bounds).toEqual({ width: 40, height: 40 });
    // MAP_SCALE §5 Map 1 = 4 farming pocket + Field Boss หมูป่าหม้อเดือด (phase-based, ไม่นับ farming) = 5 รวม
    expect(map.mobPockets).toHaveLength(5);
    expect(map.mobPockets.filter((p) => p.mobType === "boss_boiling_boar")).toHaveLength(1);
    // Batch 5: north-gate → city-hub (เดิม) + se-to-map2 (ใหม่)
    expect(map.exits).toHaveLength(2);
    expect(map.safeCamp).toBeDefined();
  });

  test("spawn point เดินได้ (ในขอบ + ไม่ block)", () => {
    const map = requireMap(MAP1_ID);
    expect(isWalkableTile(map, Math.floor(map.spawnPoint.x), Math.floor(map.spawnPoint.y))).toBe(
      true,
    );
  });

  test("pocket density (owner tune 2026-07-13 — มอนธรรมดาเยอะ+ไวขึ้น; elite/boss คงเดิม)", () => {
    const map = requireMap(MAP1_ID);
    const byId = new Map(map.mobPockets.map((p) => [p.pocketId, p]));
    // owner tune: normal mobs activeCap สูงขึ้น (Design Knob §48; เดิม §6 = 18/12/18)
    expect(byId.get("map1-slime-center")?.activeCap).toBe(24);
    expect(byId.get("map1-bird-east")?.activeCap).toBe(16);
    expect(byId.get("map1-boar-southwest")?.activeCap).toBe(24);
    // elite + boss = ไม่แตะ (cap 1 เดิม)
    expect(byId.get("map1-boar-elite")?.activeCap).toBe(1);
    expect(byId.get("map1-boss-boiling-boar")?.activeCap).toBe(1);
  });
});

describe("Batch 5 — Map 2–4 (ถนนชายไร่ / ทางป่าเก่า / ป่าจันทร์เงา)", () => {
  /** exit จาก a→b: มีจริง + targetSpawn เดินได้ในปลายทาง + อยู่นอก exit area ปลายทาง (anti re-trigger). */
  function assertExitLands(fromMapId: string, targetMapId: string): void {
    const from = requireMap(fromMapId);
    const target = requireMap(targetMapId);
    const exit = from.exits.find((e) => e.targetMapId === targetMapId);
    expect(exit, `${fromMapId} → ${targetMapId} exit`).toBeDefined();
    const s = exit!.targetSpawn;
    expect(isWalkableTile(target, Math.floor(s.x), Math.floor(s.y))).toBe(true);
    expect(findExitAt(target, Math.floor(s.x), Math.floor(s.y))).toBeNull();
  }

  test("bounds/pockets/safeCamp ต่อ spec (M2 40×40/5 · M3 40×40/6 · M4 48×48/6)", () => {
    const m2 = requireMap(MAP2_ID);
    expect(m2.bounds).toEqual({ width: 40, height: 40 });
    expect(m2.mobPockets).toHaveLength(5); // MAP_SCALE §5 = 5–6
    expect(m2.safeCamp).toBeDefined();

    const m3 = requireMap(MAP3_ID);
    expect(m3.bounds).toEqual({ width: 40, height: 40 });
    expect(m3.mobPockets).toHaveLength(6); // MAP_SCALE §5 = 5–7
    expect(m3.safeCamp).toBeDefined();

    const m4 = requireMap(MAP4_ID);
    expect(m4.bounds).toEqual({ width: 48, height: 48 });
    expect(m4.mobPockets).toHaveLength(6); // MAP_SCALE §5 = 6–8
    expect(m4.safeCamp).toBeDefined();
  });

  test("มอนต่อ pocket ตรง spec identity (§2) + boss 1 ตัว/แมพ พร้อม guard gauge", () => {
    const mobTypesOf = (id: string) => requireMap(id).mobPockets.map((p) => p.mobType);
    expect(mobTypesOf(MAP2_ID)).toEqual([
      "mushroom_startle", "scarecrow_walker", "greenlight_rat", "talisman_scarecrow", "field_warden",
    ]);
    expect(mobTypesOf(MAP3_ID)).toEqual([
      "gnawing_root", "shadow_monkey", "walking_stone", "walking_stone", "mossless_stone", "nameless_warden",
    ]);
    expect(mobTypesOf(MAP4_ID)).toEqual([
      "moonlight_wisp", "moonlight_wisp", "dream_mushroom", "shadow_deer", "shattered_moon_deer", "moondark_dryad",
    ]);
  });

  test("exit สองทางเชื่อมกันครบวง: map1↔map2, map2↔map3, map3↔map4 (targetSpawn เดินได้+นอก exit ปลายทาง)", () => {
    // map1 ↔ map2 (bible Map 2 NW = Exit Map 1)
    assertExitLands(MAP1_ID, MAP2_ID);
    assertExitLands(MAP2_ID, MAP1_ID);
    // map2 ↔ map3 (bible Map 3 W = Exit Map 2)
    assertExitLands(MAP2_ID, MAP3_ID);
    assertExitLands(MAP3_ID, MAP2_ID);
    // map3 ↔ map4 (bible Map 4 SW = Exit Map 3)
    assertExitLands(MAP3_ID, MAP4_ID);
    assertExitLands(MAP4_ID, MAP3_ID);
  });

  test("map1 มี exit เดิม (city-hub) + exit ใหม่ (map2); map4 มี exit เดียว (กลับ map3)", () => {
    const m1Targets = requireMap(MAP1_ID).exits.map((e) => e.targetMapId).sort();
    expect(m1Targets).toEqual(["city-hub", "map2"]);
    expect(requireMap(MAP4_ID).exits.map((e) => e.targetMapId)).toEqual(["map3"]);
  });

  test("real Batch 5 maps ผ่าน buildMapRegistry (cross-ref + walkable targetSpawn)", () => {
    expect(() =>
      buildMapRegistry([P0_TEST_FIELD, MAP1, MAP2, MAP3, MAP4, CITY_HUB]),
    ).not.toThrow();
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

  test("real registry ทั้งชุดผ่าน buildMapRegistry (MAP1 se-to-map2 ต้องมี map2–4 ครบใน registry)", () => {
    // Batch 5: MAP1 มี exit → map2 แล้ว → subset เดิม (P0/MAP1/CITY_HUB) จะ throw cross-ref (map2 ไม่มี) ตามคาด;
    // ต้องมี map2/3/4 ครบถึงจะผ่าน.
    expect(() => buildMapRegistry([P0_TEST_FIELD, MAP1, CITY_HUB])).toThrow(MapRegistryError);
    expect(() =>
      buildMapRegistry([P0_TEST_FIELD, MAP1, MAP2, MAP3, MAP4, CITY_HUB]),
    ).not.toThrow();
  });
});
