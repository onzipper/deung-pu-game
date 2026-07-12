import { describe, expect, test } from "vitest";
import {
  MOVE_KEYS,
  SCREEN_DOWN,
  SCREEN_LEFT,
  SCREEN_RIGHT,
  SCREEN_UP,
  intentFromKeys,
} from "@/engine/input/keyboard";
import { tileToScreen } from "@/engine/iso/coords";
import type { TileSize } from "@/engine/config";

const TILE_64x32: TileSize = { width: 64, height: 32 };

// intent mapping screen→tile: ค่า basis ต้อง project กลับเป็นทิศบนจอที่ถูก
// (W=ขึ้นจอ, S=ลงจอ, A=ซ้ายจอ, D=ขวาจอ) — พิสูจน์ด้วย tileToScreen.
describe("screen-space basis → tile (inverse projection)", () => {
  test("SCREEN_UP project เป็น screen −sy ล้วน (ขึ้นจอตรง)", () => {
    const s = tileToScreen(SCREEN_UP, TILE_64x32);
    expect(s.sx).toBe(0);
    expect(s.sy).toBeLessThan(0);
  });
  test("SCREEN_DOWN project เป็น screen +sy ล้วน (ลงจอตรง)", () => {
    const s = tileToScreen(SCREEN_DOWN, TILE_64x32);
    expect(s.sx).toBe(0);
    expect(s.sy).toBeGreaterThan(0);
  });
  test("SCREEN_RIGHT project เป็น screen +sx ล้วน (ขวาจอตรง)", () => {
    const s = tileToScreen(SCREEN_RIGHT, TILE_64x32);
    expect(s.sy).toBe(0);
    expect(s.sx).toBeGreaterThan(0);
  });
  test("SCREEN_LEFT project เป็น screen −sx ล้วน (ซ้ายจอตรง)", () => {
    const s = tileToScreen(SCREEN_LEFT, TILE_64x32);
    expect(s.sy).toBe(0);
    expect(s.sx).toBeLessThan(0);
  });
  test("basis 4 ทิศยาวเท่ากัน (|·|=√2) → รวมกัน fair", () => {
    for (const v of [SCREEN_UP, SCREEN_DOWN, SCREEN_LEFT, SCREEN_RIGHT]) {
      expect(v.tx * v.tx + v.ty * v.ty).toBe(2);
    }
  });
});

describe("intentFromKeys — ค่าตายตัว (deterministic)", () => {
  test("W เดี่ยว → (−1,−1)", () => {
    expect(intentFromKeys(new Set(["KeyW"]))).toEqual({ tx: -1, ty: -1 });
  });
  test("D เดี่ยว → (+1,−1)", () => {
    expect(intentFromKeys(new Set(["KeyD"]))).toEqual({ tx: 1, ty: -1 });
  });
  test("W+D → (0,−2) (ขึ้น-ขวาจอ)", () => {
    expect(intentFromKeys(new Set(["KeyW", "KeyD"]))).toEqual({ tx: 0, ty: -2 });
  });
  test("ปล่อยหมด (set ว่าง) → (0,0)", () => {
    expect(intentFromKeys(new Set())).toEqual({ tx: 0, ty: 0 });
  });
  test("ปุ่มตรงข้ามหักล้าง: W+S → (0,0), A+D → (0,0)", () => {
    expect(intentFromKeys(new Set(["KeyW", "KeyS"]))).toEqual({ tx: 0, ty: 0 });
    expect(intentFromKeys(new Set(["KeyA", "KeyD"]))).toEqual({ tx: 0, ty: 0 });
  });
  test("arrow keys = WASD (ArrowUp = W)", () => {
    expect(intentFromKeys(new Set(["ArrowUp"]))).toEqual(
      intentFromKeys(new Set(["KeyW"])),
    );
  });
  test("ปุ่มที่ไม่ใช่ movement ถูกเมิน", () => {
    expect(intentFromKeys(new Set(["Space", "KeyW"]))).toEqual({
      tx: -1,
      ty: -1,
    });
  });
  test("ลำดับใน set ไม่มีผล (deterministic)", () => {
    const a = intentFromKeys(new Set(["KeyW", "KeyD"]));
    const b = intentFromKeys(new Set(["KeyD", "KeyW"]));
    expect(a).toEqual(b);
  });
});

describe("MOVE_KEYS table", () => {
  test("ครอบ WASD + 4 arrow", () => {
    expect(Object.keys(MOVE_KEYS).sort()).toEqual(
      [
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "KeyA",
        "KeyD",
        "KeyS",
        "KeyW",
      ].sort(),
    );
  });
});
