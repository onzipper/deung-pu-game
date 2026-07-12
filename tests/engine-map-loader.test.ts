import { describe, expect, test } from "vitest";
import {
  loadMapConfig,
  MapConfigError,
} from "@/engine/map/loader";
import { P0_TEST_FIELD } from "@/engine/map/p0-test-field";
import {
  findExitAt,
  isBlockedTile,
  isWalkableTile,
  isWithinBounds,
  packTile,
  safeCampOf,
  type MapConfigInput,
} from "@/engine/map/types";

// config ที่ถูกต้องขั้นต่ำ — clone แล้ว mutate เพื่อทดสอบ invariant ทีละข้อ.
function validConfig(): MapConfigInput {
  return {
    mapId: "test",
    name: "Test",
    tileSize: { width: 64, height: 32 },
    bounds: { width: 10, height: 10 },
    spawnPoint: { x: 5, y: 5 },
    collision: {
      blockedRects: [{ tx: 2, ty: 2, width: 2, height: 2 }],
      blockedTiles: [{ tx: 7, ty: 7 }],
    },
    props: [{ propId: "tree", tile: { tx: 1.5, ty: 1.5 } }],
    mobPockets: [
      {
        pocketId: "p1",
        area: { tx: 0, ty: 0, width: 3, height: 3 },
        mobType: "slime",
        packSize: { min: 1, max: 2 },
        activeCap: 3,
      },
    ],
  };
}

describe("loadMapConfig — config ดีผ่าน + build ถูก", () => {
  test("config ขั้นต่ำผ่านและคืน field ตรง", () => {
    const map = loadMapConfig(validConfig());
    expect(map.mapId).toBe("test");
    expect(map.bounds).toEqual({ width: 10, height: 10 });
    expect(map.spawnPoint).toEqual({ x: 5, y: 5 });
    expect(map.props).toHaveLength(1);
    expect(map.mobPockets).toHaveLength(1);
  });

  test("blockedSet build จาก rect + tile ครบทุกช่อง", () => {
    const map = loadMapConfig(validConfig());
    // rect (2,2) 2×2 → (2,2)(3,2)(2,3)(3,3) + tile (7,7)
    const w = map.bounds.width;
    expect(map.collision.blockedSet.has(packTile(2, 2, w))).toBe(true);
    expect(map.collision.blockedSet.has(packTile(3, 3, w))).toBe(true);
    expect(map.collision.blockedSet.has(packTile(7, 7, w))).toBe(true);
    expect(map.collision.blockedSet.size).toBe(5);
  });

  test("helper isBlocked/isWithinBounds/isWalkable ทำงาน O(1)", () => {
    const map = loadMapConfig(validConfig());
    expect(isBlockedTile(map, 2, 2)).toBe(true);
    expect(isBlockedTile(map, 5, 5)).toBe(false);
    expect(isWithinBounds(map, 9, 9)).toBe(true);
    expect(isWithinBounds(map, 10, 0)).toBe(false); // ขอบขวาหลุด [0,10)
    expect(isWithinBounds(map, -1, 0)).toBe(false);
    expect(isWalkableTile(map, 5, 5)).toBe(true);
    expect(isWalkableTile(map, 2, 2)).toBe(false); // blocked
    expect(isWalkableTile(map, 10, 10)).toBe(false); // นอกขอบ
  });

  test("prop float position เก็บไว้ตามเดิม + zLayer optional", () => {
    const cfg = validConfig();
    cfg.props.push({ propId: "sign", tile: { tx: 4, ty: 4 }, zLayer: 2 });
    const map = loadMapConfig(cfg);
    expect(map.props[0].tile).toEqual({ tx: 1.5, ty: 1.5 });
    expect(map.props[0].zLayer).toBeUndefined();
    expect(map.props[1].zLayer).toBe(2);
  });
});

describe("loadMapConfig — invariant พัง → throw", () => {
  test("raw ไม่ใช่ object", () => {
    expect(() => loadMapConfig(null)).toThrow(MapConfigError);
    expect(() => loadMapConfig(42)).toThrow(/root/);
  });

  test("mapId ว่าง", () => {
    const cfg = validConfig();
    cfg.mapId = "";
    expect(() => loadMapConfig(cfg)).toThrow(/mapId/);
  });

  test("bounds ติดลบ / ศูนย์", () => {
    const cfg = validConfig();
    cfg.bounds.width = -5;
    expect(() => loadMapConfig(cfg)).toThrow(/bounds.width/);
    const cfg2 = validConfig();
    cfg2.bounds.height = 0;
    expect(() => loadMapConfig(cfg2)).toThrow(/bounds.height/);
  });

  test("tileSize ≤ 0", () => {
    const cfg = validConfig();
    cfg.tileSize.width = 0;
    expect(() => loadMapConfig(cfg)).toThrow(/tileSize.width/);
  });

  test("spawn นอก map", () => {
    const cfg = validConfig();
    cfg.spawnPoint = { x: 99, y: 5 };
    expect(() => loadMapConfig(cfg)).toThrow(/spawnPoint/);
  });

  test("spawn ทับ collision", () => {
    const cfg = validConfig();
    cfg.spawnPoint = { x: 2, y: 2 }; // ตรง blocked rect
    expect(() => loadMapConfig(cfg)).toThrow(/ทับ collision/);
  });

  test("collision rect หลุดขอบ", () => {
    const cfg = validConfig();
    cfg.collision.blockedRects = [{ tx: 8, ty: 8, width: 5, height: 5 }];
    expect(() => loadMapConfig(cfg)).toThrow(/หลุดขอบ/);
  });

  test("collision tile ไม่ integer", () => {
    const cfg = validConfig();
    cfg.collision.blockedTiles = [{ tx: 1.5, ty: 2 }];
    expect(() => loadMapConfig(cfg)).toThrow(/integer/);
  });

  test("pocket หลุดขอบ", () => {
    const cfg = validConfig();
    cfg.mobPockets[0].area = { tx: 8, ty: 8, width: 5, height: 5 };
    expect(() => loadMapConfig(cfg)).toThrow(/หลุดขอบ/);
  });

  test("packSize max < min", () => {
    const cfg = validConfig();
    cfg.mobPockets[0].packSize = { min: 5, max: 2 };
    expect(() => loadMapConfig(cfg)).toThrow(/packSize.max/);
  });

  test("activeCap < 1", () => {
    const cfg = validConfig();
    cfg.mobPockets[0].activeCap = 0;
    expect(() => loadMapConfig(cfg)).toThrow(/activeCap/);
  });

  test("pocketId ซ้ำ", () => {
    const cfg = validConfig();
    cfg.mobPockets.push({ ...cfg.mobPockets[0] });
    expect(() => loadMapConfig(cfg)).toThrow(/ซ้ำ/);
  });

  test("prop propId ว่าง", () => {
    const cfg = validConfig();
    cfg.props[0].propId = "";
    expect(() => loadMapConfig(cfg)).toThrow(/propId/);
  });
});

describe("P0_TEST_FIELD — ข้อมูลจริงผ่าน validation", () => {
  test("โหลดได้ไม่ throw + ค่าเด่นถูก", () => {
    const map = loadMapConfig(P0_TEST_FIELD);
    expect(map.mapId).toBe("p0-test-field");
    expect(map.bounds).toEqual({ width: 24, height: 24 });
    expect(map.props).toHaveLength(7);
    expect(map.mobPockets).toHaveLength(3);
  });

  test("spawn point เดินได้จริง (ในขอบ + ไม่ block)", () => {
    const map = loadMapConfig(P0_TEST_FIELD);
    const tx = Math.floor(map.spawnPoint.x);
    const ty = Math.floor(map.spawnPoint.y);
    expect(isWalkableTile(map, tx, ty)).toBe(true);
  });

  test("กำแพง/บ่อน้ำ block จริง", () => {
    const map = loadMapConfig(P0_TEST_FIELD);
    expect(isBlockedTile(map, 6, 4)).toBe(true); // กำแพง
    expect(isBlockedTile(map, 17, 17)).toBe(true); // บ่อน้ำ
    expect(isBlockedTile(map, 10, 5)).toBe(true); // หินเดี่ยว
  });
});

describe("exits (P1-10, §57.3) — optional field + intrinsic validation", () => {
  test("ไม่ระบุ exits → map.exits = []", () => {
    const map = loadMapConfig(validConfig());
    expect(map.exits).toEqual([]);
  });

  test("exit ถูกต้อง → parse ครบ field", () => {
    const cfg = validConfig();
    cfg.exits = [
      {
        exitId: "e1",
        area: { tx: 0, ty: 0, width: 2, height: 1 },
        targetMapId: "other",
        targetSpawn: { x: 3.5, y: 4.5 },
      },
    ];
    const map = loadMapConfig(cfg);
    expect(map.exits).toHaveLength(1);
    expect(map.exits[0].exitId).toBe("e1");
    expect(map.exits[0].targetMapId).toBe("other");
    expect(map.exits[0].targetSpawn).toEqual({ x: 3.5, y: 4.5 });
  });

  test("exit area หลุดขอบ → throw", () => {
    const cfg = validConfig();
    cfg.exits = [
      {
        exitId: "e1",
        area: { tx: 8, ty: 8, width: 5, height: 5 },
        targetMapId: "other",
        targetSpawn: { x: 1, y: 1 },
      },
    ];
    expect(() => loadMapConfig(cfg)).toThrow(/หลุดขอบ/);
  });

  test("exitId ซ้ำ → throw", () => {
    const cfg = validConfig();
    const e = {
      exitId: "dup",
      area: { tx: 0, ty: 0, width: 1, height: 1 },
      targetMapId: "other",
      targetSpawn: { x: 1, y: 1 },
    };
    cfg.exits = [e, { ...e }];
    expect(() => loadMapConfig(cfg)).toThrow(/exitId ซ้ำ/);
  });

  test("targetMapId ว่าง → throw", () => {
    const cfg = validConfig();
    cfg.exits = [
      {
        exitId: "e1",
        area: { tx: 0, ty: 0, width: 1, height: 1 },
        targetMapId: "",
        targetSpawn: { x: 1, y: 1 },
      },
    ];
    expect(() => loadMapConfig(cfg)).toThrow(/targetMapId/);
  });

  test("targetSpawn ไม่ finite → throw (แต่ loader ไม่ตรวจ walkable — เป็นงานของ registry)", () => {
    const cfg = validConfig();
    cfg.exits = [
      {
        exitId: "e1",
        area: { tx: 0, ty: 0, width: 1, height: 1 },
        targetMapId: "other",
        targetSpawn: { x: Number.NaN, y: 1 },
      },
    ];
    expect(() => loadMapConfig(cfg)).toThrow(/targetSpawn.x/);
  });
});

describe("findExitAt / isTileInRect (P1-10)", () => {
  test("findExitAt คืน exit เมื่อ tile อยู่ในพื้นที่, null เมื่อไม่อยู่", () => {
    const cfg = validConfig();
    cfg.exits = [
      {
        exitId: "e1",
        area: { tx: 5, ty: 0, width: 2, height: 2 },
        targetMapId: "other",
        targetSpawn: { x: 1, y: 1 },
      },
    ];
    const map = loadMapConfig(cfg);
    expect(findExitAt(map, 5, 0)?.exitId).toBe("e1");
    expect(findExitAt(map, 6, 1)?.exitId).toBe("e1");
    expect(findExitAt(map, 7, 0)).toBeNull(); // นอก width [5,7)
    expect(findExitAt(map, 5, 2)).toBeNull(); // นอก height [0,2)
    expect(findExitAt(map, 0, 0)).toBeNull();
  });
});

describe("safeCamp (P1-07, §59.1) — optional field + fallback", () => {
  test("ไม่ระบุ safeCamp → safeCampOf = spawnPoint", () => {
    const map = loadMapConfig(P0_TEST_FIELD);
    expect(map.safeCamp).toBeUndefined();
    expect(safeCampOf(map)).toEqual(map.spawnPoint);
  });

  test("ระบุ safeCamp เดินได้ → ผ่าน + safeCampOf คืนค่านั้น", () => {
    const cfg = validConfig();
    cfg.safeCamp = { x: 8.5, y: 8.5 };
    const map = loadMapConfig(cfg);
    expect(map.safeCamp).toEqual({ x: 8.5, y: 8.5 });
    expect(safeCampOf(map)).toEqual({ x: 8.5, y: 8.5 });
  });

  test("safeCamp ทับ collision → throw (validate เหมือน spawnPoint)", () => {
    const cfg = validConfig();
    cfg.safeCamp = { x: 2.5, y: 2.5 }; // อยู่ใน blockedRect (2,2)+2×2
    expect(() => loadMapConfig(cfg)).toThrow(MapConfigError);
  });

  test("safeCamp หลุดขอบ → throw", () => {
    const cfg = validConfig();
    cfg.safeCamp = { x: 99, y: 99 };
    expect(() => loadMapConfig(cfg)).toThrow(MapConfigError);
  });
});
