import { describe, expect, test } from "vitest";
import type { TileSize } from "@/engine/config";
import { tileCenterToScreen, tileToScreen } from "@/engine/iso/coords";
import { entityFootToScreen } from "@/engine/render/placement";

const TILE_64x32: TileSize = { width: 64, height: 32 };
const TILE_128x64: TileSize = { width: 128, height: 64 };

// BLOCKER-1 regression lock: entity/prop placement ต้องใช้ foot basis (tileToScreen)
// ไม่ใช่ center basis (tileCenterToScreen) — กัน "+0.5 ซ้ำซ้อน" (ดู docs/known-traps.md).
describe("entityFootToScreen — foot convention (ไม่ +0.5)", () => {
  test("= tileToScreen ตรง ๆ (ไม่บวก 0.5)", () => {
    for (const t of [
      { tx: 0, ty: 0 },
      { tx: 5, ty: 3 },
      { tx: 12.5, ty: 8.5 },
      { tx: -4.2, ty: 7.8 },
    ]) {
      expect(entityFootToScreen(t, TILE_64x32)).toEqual(tileToScreen(t, TILE_64x32));
    }
  });

  test("≠ tileCenterToScreen (ต่างกันครึ่ง tile = h/2 บนแกน sy)", () => {
    const t = { tx: 5, ty: 5 };
    const foot = entityFootToScreen(t, TILE_64x32);
    const center = tileCenterToScreen(t, TILE_64x32);
    expect(center.sy - foot.sy).toBe(TILE_64x32.height / 2); // 16px เหลื่อม
    expect(foot).not.toEqual(center);
  });

  test("author ใส่ n+0.5 เอง → ตรงกลาง cell (basis เดียวกับ camera/depth)", () => {
    // วาง prop 'กลาง cell (5,5)' โดยส่ง foot = (5.5,5.5) → ต้องเท่ากับ center ของ cell (5,5)
    expect(entityFootToScreen({ tx: 5.5, ty: 5.5 }, TILE_64x32)).toEqual(
      tileCenterToScreen({ tx: 5, ty: 5 }, TILE_64x32),
    );
  });

  test("ไม่ hardcode tileSize (128×64 ก็ = tileToScreen)", () => {
    const t = { tx: 3, ty: -2 };
    expect(entityFootToScreen(t, TILE_128x64)).toEqual(tileToScreen(t, TILE_128x64));
  });
});
