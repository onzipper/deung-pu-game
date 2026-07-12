import { describe, expect, test } from "vitest";
import type { TileSize } from "@/engine/config";
import {
  screenToTile,
  snapToTile,
  tileCenterToScreen,
  tileToScreen,
  type TilePoint,
} from "@/engine/iso/coords";

const TILE_64x32: TileSize = { width: 64, height: 32 };
const TILE_128x64: TileSize = { width: 128, height: 64 };
const TILE_63x31: TileSize = { width: 63, height: 31 }; // odd — พิสูจน์ไม่ hardcode/round bug

// LCG deterministic (ไม่ใช้ Math.random) — round-trip fuzz ที่ reproducible.
function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // Numerical Recipes LCG
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000; // [0,1)
  };
}

describe("tileToScreen — known values @ 64×32 (diamond)", () => {
  const cases: Array<[TilePoint, { sx: number; sy: number }]> = [
    [{ tx: 0, ty: 0 }, { sx: 0, sy: 0 }],
    [{ tx: 1, ty: 0 }, { sx: 32, sy: 16 }],
    [{ tx: 0, ty: 1 }, { sx: -32, sy: 16 }],
    [{ tx: 1, ty: 1 }, { sx: 0, sy: 32 }],
    [{ tx: 2, ty: 0 }, { sx: 64, sy: 32 }],
    [{ tx: -1, ty: -1 }, { sx: 0, sy: -32 }],
  ];
  for (const [tile, screen] of cases) {
    test(`(${tile.tx},${tile.ty}) → (${screen.sx},${screen.sy})`, () => {
      expect(tileToScreen(tile, TILE_64x32)).toEqual(screen);
    });
  }

  test("+tx ไปขวา-ล่าง, +ty ไปซ้าย-ล่าง (ทิศทางแกนถูกต้อง)", () => {
    const base = tileToScreen({ tx: 0, ty: 0 }, TILE_64x32);
    const px = tileToScreen({ tx: 1, ty: 0 }, TILE_64x32);
    const py = tileToScreen({ tx: 0, ty: 1 }, TILE_64x32);
    expect(px.sx).toBeGreaterThan(base.sx); // ขวา
    expect(px.sy).toBeGreaterThan(base.sy); // ล่าง
    expect(py.sx).toBeLessThan(base.sx); // ซ้าย
    expect(py.sy).toBeGreaterThan(base.sy); // ล่าง
  });
});

describe("tileToScreen — tileSize อื่น (พิสูจน์ไม่ hardcode 64/32)", () => {
  test("128×64: (1,0)→(64,32), (0,1)→(−64,32), (1,1)→(0,64)", () => {
    expect(tileToScreen({ tx: 1, ty: 0 }, TILE_128x64)).toEqual({ sx: 64, sy: 32 });
    expect(tileToScreen({ tx: 0, ty: 1 }, TILE_128x64)).toEqual({ sx: -64, sy: 32 });
    expect(tileToScreen({ tx: 1, ty: 1 }, TILE_128x64)).toEqual({ sx: 0, sy: 64 });
  });
});

describe("screenToTile — inverse ของ known values", () => {
  test("(32,16) → (1,0) @ 64×32", () => {
    expect(screenToTile({ sx: 32, sy: 16 }, TILE_64x32)).toEqual({ tx: 1, ty: 0 });
  });
  test("(−32,16) → (0,1) @ 64×32", () => {
    expect(screenToTile({ sx: -32, sy: 16 }, TILE_64x32)).toEqual({ tx: 0, ty: 1 });
  });
  test("(0,0) → (0,0)", () => {
    expect(screenToTile({ sx: 0, sy: 0 }, TILE_64x32)).toEqual({ tx: 0, ty: 0 });
  });
});

describe("round-trip screenToTile(tileToScreen(p)) ≈ p", () => {
  const EPS = 1e-9;

  test("integer tiles (grid −50..50 บาง sample)", () => {
    for (let tx = -50; tx <= 50; tx += 7) {
      for (let ty = -50; ty <= 50; ty += 7) {
        const back = screenToTile(tileToScreen({ tx, ty }, TILE_64x32), TILE_64x32);
        expect(back.tx).toBeCloseTo(tx, 10);
        expect(back.ty).toBeCloseTo(ty, 10);
      }
    }
  });

  test("float fuzz 500 จุด deterministic (LCG) @ 64×32", () => {
    const rnd = makeLcg(0xdeadbeef);
    for (let i = 0; i < 500; i++) {
      const tile: TilePoint = {
        tx: (rnd() - 0.5) * 2000,
        ty: (rnd() - 0.5) * 2000,
      };
      const back = screenToTile(tileToScreen(tile, TILE_64x32), TILE_64x32);
      expect(Math.abs(back.tx - tile.tx)).toBeLessThan(EPS);
      expect(Math.abs(back.ty - tile.ty)).toBeLessThan(EPS);
    }
  });

  test("float fuzz 500 จุด deterministic @ 128×64 (tileSize อื่น)", () => {
    const rnd = makeLcg(0x1234abcd);
    for (let i = 0; i < 500; i++) {
      const tile: TilePoint = {
        tx: (rnd() - 0.5) * 2000,
        ty: (rnd() - 0.5) * 2000,
      };
      const back = screenToTile(tileToScreen(tile, TILE_128x64), TILE_128x64);
      expect(Math.abs(back.tx - tile.tx)).toBeLessThan(EPS);
      expect(Math.abs(back.ty - tile.ty)).toBeLessThan(EPS);
    }
  });

  test("float fuzz 500 จุด deterministic @ 63×31 (odd tileSize — ไม่ round bug)", () => {
    const rnd = makeLcg(0x0badf00d);
    for (let i = 0; i < 500; i++) {
      const tile: TilePoint = {
        tx: (rnd() - 0.5) * 2000,
        ty: (rnd() - 0.5) * 2000,
      };
      const back = screenToTile(tileToScreen(tile, TILE_63x31), TILE_63x31);
      expect(Math.abs(back.tx - tile.tx)).toBeLessThan(EPS);
      expect(Math.abs(back.ty - tile.ty)).toBeLessThan(EPS);
    }
  });
});

describe("tileCenterToScreen — center ของ cell", () => {
  test("cell (0,0) @ 64×32 → (0,16) = origin offset ครึ่ง h", () => {
    expect(tileCenterToScreen({ tx: 0, ty: 0 }, TILE_64x32)).toEqual({ sx: 0, sy: 16 });
  });
  test("= tileToScreen ที่ +0.5 ทั้งสองแกน", () => {
    const tile: TilePoint = { tx: 3, ty: -2 };
    expect(tileCenterToScreen(tile, TILE_128x64)).toEqual(
      tileToScreen({ tx: 3.5, ty: -1.5 }, TILE_128x64),
    );
  });
});

describe("BLOCKER-1 round-trip: render center → screenToTile → snapToTile คืน cell เดิม", () => {
  const tiles: TilePoint[] = [
    { tx: 0, ty: 0 },
    { tx: 5, ty: 3 },
    { tx: 12, ty: 0 },
    { tx: -1, ty: -1 },
    { tx: -4, ty: 2 },
    { tx: 3, ty: -7 },
    { tx: -9, ty: -9 },
  ];
  for (const t of tiles) {
    test(`cell (${t.tx},${t.ty}) center → snap → เดิม @ 64×32`, () => {
      const center = tileCenterToScreen(t, TILE_64x32);
      const snapped = snapToTile(screenToTile(center, TILE_64x32));
      expect(snapped).toEqual(t);
    });
    test(`cell (${t.tx},${t.ty}) center → snap → เดิม @ 63×31 (odd)`, () => {
      const center = tileCenterToScreen(t, TILE_63x31);
      const snapped = snapToTile(screenToTile(center, TILE_63x31));
      expect(snapped).toEqual(t);
    });
  }
});

describe("snapToTile — floor convention (grid ต่อเนื่อง, ครอบ [n,n+1))", () => {
  test("บวก: 1.9 → 1, 0.1 → 0", () => {
    expect(snapToTile({ tx: 1.9, ty: 0.1 })).toEqual({ tx: 1, ty: 0 });
  });
  test("integer คงเดิม: 3 → 3", () => {
    expect(snapToTile({ tx: 3, ty: 5 })).toEqual({ tx: 3, ty: 5 });
  });
  test("ลบ: −0.5 → −1 (floor, ไม่ใช่ trunc→0)", () => {
    expect(snapToTile({ tx: -0.5, ty: -0.01 })).toEqual({ tx: -1, ty: -1 });
  });
  test("ลบพอดี integer: −2 → −2", () => {
    expect(snapToTile({ tx: -2, ty: -3 })).toEqual({ tx: -2, ty: -3 });
  });
  test("ลบเศษเยอะ: −1.2 → −2", () => {
    expect(snapToTile({ tx: -1.2, ty: -2.99 })).toEqual({ tx: -2, ty: -3 });
  });
});
