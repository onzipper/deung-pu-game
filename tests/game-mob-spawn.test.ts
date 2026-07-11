import { describe, expect, test } from "vitest";
import {
  findWalkableSpawnPoint,
  spawnAllPockets,
  spawnPocketMobs,
} from "@/game/mob/spawn";
import { createLcgRng } from "@/game/mob/rng";
import { loadMapConfig } from "@/engine/map/loader";
import { P0_TEST_FIELD } from "@/engine/map/p0-test-field";
import { snapToTile } from "@/engine/iso/coords";
import { isWalkableTile, type MapConfigInput } from "@/engine/map/types";

const SPAWN_CONFIG = { maxPlacementAttempts: 20 };

/** config ขั้นต่ำที่ผ่าน loader — clone แล้ว mutate ต่อเทสต์ (เหมือน engine-map-loader.test.ts). */
function baseConfig(): MapConfigInput {
  return {
    mapId: "test",
    name: "Test",
    tileSize: { width: 64, height: 32 },
    bounds: { width: 12, height: 12 },
    spawnPoint: { x: 1.5, y: 1.5 },
    collision: { blockedRects: [], blockedTiles: [] },
    props: [],
    mobPockets: [
      {
        pocketId: "p1",
        area: { tx: 4, ty: 4, width: 5, height: 5 },
        mobType: "slime",
        packSize: { min: 3, max: 6 },
        activeCap: 8,
      },
    ],
  };
}

describe("spawnPocketMobs — จำนวน (P0-09 Done: ไม่สุ่มทั่ว map, active cap)", () => {
  test("จำนวน mob อยู่ในช่วง packSize.min..max เมื่อ activeCap ไม่ตัด (หลาย seed)", () => {
    const map = loadMapConfig(baseConfig());
    const pocket = map.mobPockets[0];
    for (let seed = 0; seed < 50; seed++) {
      const rng = createLcgRng(seed);
      const mobs = spawnPocketMobs(pocket, map, SPAWN_CONFIG, rng);
      expect(mobs.length).toBeGreaterThanOrEqual(pocket.packSize.min);
      expect(mobs.length).toBeLessThanOrEqual(pocket.packSize.max);
    }
  });

  test("จำนวน mob ไม่เกิน activeCap แม้ packSize.max จะสูงกว่า", () => {
    const cfg = baseConfig();
    cfg.mobPockets[0].packSize = { min: 5, max: 10 };
    cfg.mobPockets[0].activeCap = 4;
    const map = loadMapConfig(cfg);
    const pocket = map.mobPockets[0];
    for (let seed = 0; seed < 30; seed++) {
      const mobs = spawnPocketMobs(pocket, map, SPAWN_CONFIG, createLcgRng(seed));
      expect(mobs.length).toBeLessThanOrEqual(4);
    }
  });

  test("seed เดียวกัน → ผล spawn เหมือนกันเป๊ะ (deterministic)", () => {
    const map = loadMapConfig(baseConfig());
    const pocket = map.mobPockets[0];
    const a = spawnPocketMobs(pocket, map, SPAWN_CONFIG, createLcgRng(123));
    const b = spawnPocketMobs(pocket, map, SPAWN_CONFIG, createLcgRng(123));
    expect(a).toEqual(b);
  });
});

describe("spawnPocketMobs — ตำแหน่ง (Done: เกิดใน pocket, ไม่บน blocked)", () => {
  test("ทุกตัวเกิดภายใน pocket.area และ tile เดินได้จริง", () => {
    const cfg = baseConfig();
    // block ครึ่งหนึ่งของ pocket area (tx 4..6) เพื่อบังคับให้ต้อง retry จริง
    cfg.collision.blockedRects = [{ tx: 4, ty: 4, width: 3, height: 5 }];
    const map = loadMapConfig(cfg);
    const pocket = map.mobPockets[0];

    for (let seed = 0; seed < 30; seed++) {
      const mobs = spawnPocketMobs(pocket, map, SPAWN_CONFIG, createLcgRng(seed));
      for (const m of mobs) {
        expect(m.tile.tx).toBeGreaterThanOrEqual(pocket.area.tx);
        expect(m.tile.ty).toBeGreaterThanOrEqual(pocket.area.ty);
        expect(m.tile.tx).toBeLessThan(pocket.area.tx + pocket.area.width);
        expect(m.tile.ty).toBeLessThan(pocket.area.ty + pocket.area.height);
        const cell = snapToTile(m.tile);
        expect(isWalkableTile(map, cell.tx, cell.ty)).toBe(true);
      }
    }
  });

  test("id ต่อมอนไม่ซ้ำภายใน pocket + ผูก pocketId/mobType ถูก", () => {
    const map = loadMapConfig(baseConfig());
    const pocket = map.mobPockets[0];
    const mobs = spawnPocketMobs(pocket, map, SPAWN_CONFIG, createLcgRng(9));
    const ids = new Set(mobs.map((m) => m.id));
    expect(ids.size).toBe(mobs.length);
    for (const m of mobs) {
      expect(m.pocketId).toBe(pocket.pocketId);
      expect(m.mobType).toBe(pocket.mobType);
    }
  });
});

describe("findWalkableSpawnPoint — best-effort retry (กัน infinite loop)", () => {
  test("area เดินไม่ได้เลย → คืน undefined ภายใน maxAttempts (ไม่ throw/ไม่ค้าง)", () => {
    const cfg = baseConfig();
    cfg.collision.blockedRects = [{ tx: 4, ty: 4, width: 5, height: 5 }]; // block ทับ pocket area ทั้งก้อน
    const map = loadMapConfig(cfg);
    const pocket = map.mobPockets[0];
    const point = findWalkableSpawnPoint(
      pocket.area,
      map,
      createLcgRng(1),
      SPAWN_CONFIG.maxPlacementAttempts,
    );
    expect(point).toBeUndefined();
  });

  test("pocket เดินไม่ได้ทั้งหมด → spawnPocketMobs คืน array ว่าง (ไม่ throw)", () => {
    const cfg = baseConfig();
    cfg.collision.blockedRects = [{ tx: 4, ty: 4, width: 5, height: 5 }];
    const map = loadMapConfig(cfg);
    const pocket = map.mobPockets[0];
    const mobs = spawnPocketMobs(pocket, map, SPAWN_CONFIG, createLcgRng(1));
    expect(mobs).toEqual([]);
  });
});

describe("spawnAllPockets — P0 Test Field จริง (3 pocket)", () => {
  test("ทุก pocket มีมอนเกิดในขอบเขตของตัวเอง ไม่ล้นไปที่อื่น ไม่สุ่มทั่ว map", () => {
    const map = loadMapConfig(P0_TEST_FIELD);
    const mobs = spawnAllPockets(map, SPAWN_CONFIG, createLcgRng(2024));
    expect(mobs.length).toBeGreaterThan(0);

    const pocketById = new Map(map.mobPockets.map((p) => [p.pocketId, p]));
    for (const m of mobs) {
      const pocket = pocketById.get(m.pocketId);
      expect(pocket).toBeDefined();
      const area = pocket!.area;
      expect(m.tile.tx).toBeGreaterThanOrEqual(area.tx);
      expect(m.tile.ty).toBeGreaterThanOrEqual(area.ty);
      expect(m.tile.tx).toBeLessThan(area.tx + area.width);
      expect(m.tile.ty).toBeLessThan(area.ty + area.height);
      expect(m.mobType).toBe(pocket!.mobType);
    }
  });

  test("จำนวนรวมไม่เกินผลรวม activeCap ของทุก pocket", () => {
    const map = loadMapConfig(P0_TEST_FIELD);
    const totalCap = map.mobPockets.reduce((sum, p) => sum + p.activeCap, 0);
    for (let seed = 0; seed < 20; seed++) {
      const mobs = spawnAllPockets(map, SPAWN_CONFIG, createLcgRng(seed));
      expect(mobs.length).toBeLessThanOrEqual(totalCap);
    }
  });
});
