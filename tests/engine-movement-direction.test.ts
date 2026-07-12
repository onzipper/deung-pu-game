import { describe, expect, test } from "vitest";
import {
  directionToScreenUnit,
  resolveDirection,
  type Direction,
} from "@/engine/movement/direction";
import { screenToTile, type TilePoint } from "@/engine/iso/coords";
import type { TileSize } from "@/engine/config";

const TILE_64x32: TileSize = { width: 64, height: 32 };

/** tile-space vector ที่ project เป็นมุม `deg` บนจอ (y-up: E=0°, N=90°). */
function vecAtScreenAngle(deg: number): TilePoint {
  const r = (deg * Math.PI) / 180;
  // screen (sy ลงบวก) → กลับเป็น tile ด้วย inverse projection
  return screenToTile({ sx: Math.cos(r), sy: -Math.sin(r) }, TILE_64x32);
}

// keyboard-combo intent (tile-space) → ทิศบนจอที่ควรได้ (พิสูจน์ครบ 8).
const COMBOS: Array<[string, TilePoint, Direction]> = [
  ["W", { tx: -1, ty: -1 }, "N"],
  ["W+D", { tx: 0, ty: -2 }, "NE"],
  ["D", { tx: 1, ty: -1 }, "E"],
  ["S+D", { tx: 2, ty: 0 }, "SE"],
  ["S", { tx: 1, ty: 1 }, "S"],
  ["S+A", { tx: 0, ty: 2 }, "SW"],
  ["A", { tx: -1, ty: 1 }, "W"],
  ["A+W", { tx: -2, ty: 0 }, "NW"],
];

describe("resolveDirection — keyboard combo → ทิศบนจอ (ครบ 8)", () => {
  for (const [name, vec, dir] of COMBOS) {
    test(`${name} → ${dir}`, () => {
      expect(resolveDirection(vec, TILE_64x32, "S")).toBe(dir);
    });
  }
});

describe("resolveDirection — มุมบนจอ → ทิศ (8 ช่วง ช่วงละ 45°)", () => {
  const cases: Array<[number, Direction]> = [
    [0, "E"],
    [45, "NE"],
    [90, "N"],
    [135, "NW"],
    [180, "W"],
    [-45, "SE"],
    [-90, "S"],
    [-135, "SW"],
  ];
  for (const [deg, dir] of cases) {
    test(`${deg}° → ${dir}`, () => {
      expect(resolveDirection(vecAtScreenAngle(deg), TILE_64x32, "S")).toBe(dir);
    });
  }
});

describe("resolveDirection — ขอบ 45° (boundary ที่ 22.5°)", () => {
  // ขอบระหว่าง E (center 0°) กับ NE (center 45°) = 22.5°.
  test("ต่ำกว่าขอบ (22°) → E", () => {
    expect(resolveDirection(vecAtScreenAngle(22), TILE_64x32, "S")).toBe("E");
  });
  test("สูงกว่าขอบ (23°) → NE", () => {
    expect(resolveDirection(vecAtScreenAngle(23), TILE_64x32, "S")).toBe("NE");
  });
  test("ขอบระหว่าง N|NW (112.5°): 112° → N, 113° → NW", () => {
    expect(resolveDirection(vecAtScreenAngle(112), TILE_64x32, "S")).toBe("N");
    expect(resolveDirection(vecAtScreenAngle(113), TILE_64x32, "S")).toBe("NW");
  });
});

describe("resolveDirection — idle คงทิศเดิม", () => {
  test("vec (0,0) → คืน last", () => {
    expect(resolveDirection({ tx: 0, ty: 0 }, TILE_64x32, "NW")).toBe("NW");
    expect(resolveDirection({ tx: 0, ty: 0 }, TILE_64x32, "E")).toBe("E");
  });
  test("vec เล็กจิ๋ว (ต่ำกว่า EPS, |·|²<1e-9) → คืน last", () => {
    expect(resolveDirection({ tx: 1e-6, ty: 0 }, TILE_64x32, "S")).toBe("S");
    expect(resolveDirection({ tx: 1e-12, ty: 0 }, TILE_64x32, "SW")).toBe("SW");
  });
  test("vec เหนือ EPS → resolve จริง (ไม่คืน last)", () => {
    // (1,−1) tile = ขวาจอ → E เสมอ ไม่ว่า last เป็นอะไร
    expect(resolveDirection({ tx: 1, ty: -1 }, TILE_64x32, "SW")).toBe("E");
  });
});

describe("directionToScreenUnit — หน่วยเวกเตอร์บนจอของแต่ละทิศ", () => {
  test("N = ขึ้นจอ (0,−1), S = ลงจอ (0,+1)", () => {
    const n = directionToScreenUnit("N");
    expect(n.sx).toBeCloseTo(0, 10);
    expect(n.sy).toBeCloseTo(-1, 10);
    const s = directionToScreenUnit("S");
    expect(s.sx).toBeCloseTo(0, 10);
    expect(s.sy).toBeCloseTo(1, 10);
  });
  test("E = ขวาจอ (1,0), W = ซ้ายจอ (−1,0)", () => {
    expect(directionToScreenUnit("E").sx).toBeCloseTo(1, 10);
    expect(directionToScreenUnit("W").sx).toBeCloseTo(-1, 10);
  });
  test("ทุกทิศเป็นเวกเตอร์หน่วย (|·|=1)", () => {
    const dirs: Direction[] = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"];
    for (const d of dirs) {
      const u = directionToScreenUnit(d);
      expect(Math.hypot(u.sx, u.sy)).toBeCloseTo(1, 10);
    }
  });
});
