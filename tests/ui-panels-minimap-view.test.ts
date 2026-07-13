import { describe, expect, test } from "vitest";
import {
  MINIMAP_SIZE,
  facingToArrowRadians,
  minimapLayoutFor,
  projectTileToMinimap,
} from "@/ui/panels/minimap/minimap-view";

describe("minimap-view — minimapLayoutFor (§8.4/§9.1/§9.2)", () => {
  test("desktop (ไม่ mobile, ไม่แคบ) = desktop 180", () => {
    expect(minimapLayoutFor(false, false, false)).toBe("desktop");
    expect(MINIMAP_SIZE[minimapLayoutFor(false, false, false)]).toBe(180);
  });

  test("desktop แคบกว่า breakpoint = compact 144", () => {
    expect(minimapLayoutFor(false, true, false)).toBe("compact");
    expect(MINIMAP_SIZE.compact).toBe(144);
  });

  test("มือถือปกติ = mobile-a 128", () => {
    expect(minimapLayoutFor(true, false, false)).toBe("mobile-a");
    expect(MINIMAP_SIZE["mobile-a"]).toBe(128);
  });

  test("มือถือ viewport height <420 = mobile-b 96 (isNarrowDesktop ไม่มีผลตอน mobile)", () => {
    expect(minimapLayoutFor(true, true, true)).toBe("mobile-b");
    expect(MINIMAP_SIZE["mobile-b"]).toBe(96);
  });
});

describe("minimap-view — projectTileToMinimap", () => {
  const bounds = { width: 40, height: 40 };

  test("tile (0,0) → มุมซ้ายบนของ widget", () => {
    expect(projectTileToMinimap({ tx: 0, ty: 0 }, bounds, 180)).toEqual({ x: 0, y: 0 });
  });

  test("tile กึ่งกลาง map → กึ่งกลาง widget", () => {
    expect(projectTileToMinimap({ tx: 20, ty: 20 }, bounds, 180)).toEqual({ x: 90, y: 90 });
  });

  test("tile เกินขอบ (นอก bounds) → clamp อยู่ในกรอบ widget", () => {
    const p = projectTileToMinimap({ tx: 45, ty: -5 }, bounds, 180);
    expect(p.x).toBe(180);
    expect(p.y).toBe(0);
  });

  test("bounds width/height = 0 → กึ่งกลาง widget (กันหารด้วยศูนย์)", () => {
    expect(projectTileToMinimap({ tx: 3, ty: 3 }, { width: 0, height: 0 }, 100)).toEqual({
      x: 50,
      y: 50,
    });
  });
});

describe("minimap-view — facingToArrowRadians", () => {
  test("E (ขวา, ไม่หมุน) = 0 rad", () => {
    expect(facingToArrowRadians("E")).toBeCloseTo(0);
  });

  test("S (ลงจอ, y-down บวก) = +90° (π/2)", () => {
    expect(facingToArrowRadians("S")).toBeCloseTo(Math.PI / 2);
  });

  test("N (ขึ้นจอ, y-down ลบ) = -90° (-π/2)", () => {
    expect(facingToArrowRadians("N")).toBeCloseTo(-Math.PI / 2);
  });

  test("W (ซ้าย) = ±180°", () => {
    expect(Math.abs(facingToArrowRadians("W"))).toBeCloseTo(Math.PI);
  });
});
