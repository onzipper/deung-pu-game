import { describe, expect, test } from "vitest";
import type { TileSize } from "@/engine/config";
import type { MapBounds } from "@/engine/map/types";
import {
  applyShakeOffset,
  clampCameraScreen,
  computeMapScreenBounds,
  lerpTile,
  type ScreenBounds,
} from "@/engine/render/camera";

const TILE_64x32: TileSize = { width: 64, height: 32 };
const BOUNDS_24: MapBounds = { width: 24, height: 24 };

describe("computeMapScreenBounds — กรอบ world-screen ของ diamond map", () => {
  test("24×24 @ 64×32: 4 มุมถูกต้อง", () => {
    const b = computeMapScreenBounds(BOUNDS_24, TILE_64x32);
    // (0,H)=(-768,384) ซ้ายสุด · (W,0)=(768,384) ขวาสุด
    expect(b.minSx).toBe(-768);
    expect(b.maxSx).toBe(768);
    // (0,0)=(0,0) บนสุด · (W,H)=(0,768) ล่างสุด
    expect(b.minSy).toBe(0);
    expect(b.maxSy).toBe(768);
  });

  test("bounds ไม่จตุรัส (W≠H): 10×4 @ 64×32", () => {
    const b = computeMapScreenBounds({ width: 10, height: 4 }, TILE_64x32);
    // corners: (0,0)=(0,0) · (10,0)=(320,160) · (0,4)=(-128,64) · (10,4)=(192,224)
    expect(b.minSx).toBe(-128);
    expect(b.maxSx).toBe(320);
    expect(b.minSy).toBe(0);
    expect(b.maxSy).toBe(224);
  });
});

describe("clampCameraScreen — กล้องไม่หลุดขอบ map เกิน margin", () => {
  const bounds: ScreenBounds = { minSx: -768, maxSx: 768, minSy: 0, maxSy: 768 };
  const margin = 96;

  test("center กลาง map + viewport เล็กกว่า content → ไม่ถูก clamp", () => {
    const vp = { width: 800, height: 600 };
    const out = clampCameraScreen({ sx: 0, sy: 384 }, bounds, vp, margin);
    expect(out).toEqual({ sx: 0, sy: 384 });
  });

  test("center เลยขอบขวา → clamp เข้าขอบขวา (hi − vp/2)", () => {
    const vp = { width: 800, height: 600 };
    // hi = 768+96 = 864, clampMax = 864 − 400 = 464
    const out = clampCameraScreen({ sx: 5000, sy: 384 }, bounds, vp, margin);
    expect(out.sx).toBe(464);
  });

  test("center เลยขอบซ้าย → clamp เข้าขอบซ้าย (lo + vp/2)", () => {
    const vp = { width: 800, height: 600 };
    // lo = -768-96 = -864, clampMin = -864 + 400 = -464
    const out = clampCameraScreen({ sx: -5000, sy: 384 }, bounds, vp, margin);
    expect(out.sx).toBe(-464);
  });

  test("center เลยขอบล่าง (sy) → clamp", () => {
    const vp = { width: 800, height: 600 };
    // sy content: lo=-96, hi=864, height 960 > vp 600 → clampMax = 864 − 300 = 564
    const out = clampCameraScreen({ sx: 0, sy: 5000 }, bounds, vp, margin);
    expect(out.sy).toBe(564);
  });

  test("viewport ใหญ่กว่า content (+margin) → center กลาง content (กันสั่น)", () => {
    const vp = { width: 4000, height: 4000 };
    const out = clampCameraScreen({ sx: 9999, sy: 9999 }, bounds, vp, margin);
    // sx: (lo+hi)/2 = (-864+864)/2 = 0 · sy: (-96+864)/2 = 384
    expect(out).toEqual({ sx: 0, sy: 384 });
  });

  test("content == viewport พอดี (ขอบเขต boundary) → center กลาง (ไม่สั่น)", () => {
    // sx content = hi−lo = 864−(−864) = 1728 → viewport.width = 1728 พอดี
    const vp = { width: 1728, height: 960 };
    // sy content = 864−(−96) = 960 → viewport.height = 960 พอดี เช่นกัน
    const out = clampCameraScreen({ sx: 1000, sy: -1000 }, bounds, vp, margin);
    expect(out).toEqual({ sx: 0, sy: 384 });
  });
});

describe("lerpTile — camera follow เข้าเป้า", () => {
  test("alpha 0.5 = ครึ่งทาง", () => {
    expect(lerpTile({ tx: 0, ty: 0 }, { tx: 10, ty: 20 }, 0.5)).toEqual({
      tx: 5,
      ty: 10,
    });
  });

  test("iterate หลายรอบ → ลู่เข้าเป้า", () => {
    let cur = { tx: 0, ty: 0 };
    const target = { tx: 12.5, ty: 12.5 };
    for (let i = 0; i < 200; i++) cur = lerpTile(cur, target, 0.12);
    expect(cur.tx).toBeCloseTo(12.5, 6);
    expect(cur.ty).toBeCloseTo(12.5, 6);
  });

  test("alpha ≥ 1 → snap ทันที; alpha ≤ 0 → อยู่กับที่", () => {
    expect(lerpTile({ tx: 1, ty: 2 }, { tx: 9, ty: 9 }, 1)).toEqual({ tx: 9, ty: 9 });
    expect(lerpTile({ tx: 1, ty: 2 }, { tx: 9, ty: 9 }, 1.5)).toEqual({ tx: 9, ty: 9 });
    expect(lerpTile({ tx: 1, ty: 2 }, { tx: 9, ty: 9 }, 0)).toEqual({ tx: 1, ty: 2 });
    expect(lerpTile({ tx: 1, ty: 2 }, { tx: 9, ty: 9 }, -1)).toEqual({ tx: 1, ty: 2 });
  });
});

describe("applyShakeOffset — บวก screen shake offset เข้ากล้อง (P1-06)", () => {
  test("offset {0,0} = no-op", () => {
    expect(applyShakeOffset({ sx: 10, sy: -5 }, { sx: 0, sy: 0 })).toEqual({ sx: 10, sy: -5 });
  });

  test("บวก offset ตรง ๆ ทั้งสองแกน", () => {
    expect(applyShakeOffset({ sx: 10, sy: -5 }, { sx: 3, sy: 7 })).toEqual({ sx: 13, sy: 2 });
  });
});
