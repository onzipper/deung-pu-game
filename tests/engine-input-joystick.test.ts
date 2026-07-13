import { describe, expect, test } from "vitest";
import {
  SCREEN_DOWN,
  SCREEN_LEFT,
  SCREEN_RIGHT,
  SCREEN_UP,
} from "@/engine/input/keyboard";
import { joystickIntent } from "@/engine/input/joystick";
import { tileToScreen } from "@/engine/iso/coords";
import type { TileSize } from "@/engine/config";

const TILE_64x32: TileSize = { width: 64, height: 32 };
const DEADZONE = 0.25;

// joystick vector (screen-space, y-down: dx=ขวา+, dy=ลง+) → intent tile-space 8 ทิศ, ทิศเดียวกับ WASD.
describe("joystickIntent — cardinal directions (8-dir snap)", () => {
  test("ขวา (dx+) → SCREEN_RIGHT", () => {
    expect(joystickIntent(1, 0, DEADZONE)).toEqual(SCREEN_RIGHT);
  });
  test("ลง (dy+, DOM y-down) → SCREEN_DOWN", () => {
    expect(joystickIntent(0, 1, DEADZONE)).toEqual(SCREEN_DOWN);
  });
  test("ซ้าย (dx−) → SCREEN_LEFT", () => {
    expect(joystickIntent(-1, 0, DEADZONE)).toEqual(SCREEN_LEFT);
  });
  test("ขึ้น (dy−) → SCREEN_UP", () => {
    expect(joystickIntent(0, -1, DEADZONE)).toEqual(SCREEN_UP);
  });
});

describe("joystickIntent — diagonals = ผลรวม basis (เท่ากดสองปุ่ม WASD)", () => {
  test("ขวา-ลง → RIGHT+DOWN", () => {
    const v = joystickIntent(0.8, 0.8, DEADZONE);
    expect(v).toEqual({ tx: SCREEN_RIGHT.tx + SCREEN_DOWN.tx, ty: SCREEN_RIGHT.ty + SCREEN_DOWN.ty });
  });
  test("ซ้าย-ขึ้น → UP+LEFT", () => {
    const v = joystickIntent(-0.8, -0.8, DEADZONE);
    expect(v).toEqual({ tx: SCREEN_UP.tx + SCREEN_LEFT.tx, ty: SCREEN_UP.ty + SCREEN_LEFT.ty });
  });
  test("ขวา-ขึ้น → UP+RIGHT", () => {
    const v = joystickIntent(0.8, -0.8, DEADZONE);
    expect(v).toEqual({ tx: SCREEN_UP.tx + SCREEN_RIGHT.tx, ty: SCREEN_UP.ty + SCREEN_RIGHT.ty });
  });
  test("ซ้าย-ลง → DOWN+LEFT", () => {
    const v = joystickIntent(-0.8, 0.8, DEADZONE);
    expect(v).toEqual({ tx: SCREEN_DOWN.tx + SCREEN_LEFT.tx, ty: SCREEN_DOWN.ty + SCREEN_LEFT.ty });
  });
});

describe("joystickIntent — deadzone + projection sanity", () => {
  test("นิ้ววางกลาง (< deadzone) → (0,0) ไม่เดิน", () => {
    expect(joystickIntent(0, 0, DEADZONE)).toEqual({ tx: 0, ty: 0 });
    expect(joystickIntent(0.2, 0.1, DEADZONE)).toEqual({ tx: 0, ty: 0 });
  });
  test("ขอบ deadzone พอดี/เกิน → เดิน", () => {
    expect(joystickIntent(0.25, 0, DEADZONE)).toEqual(SCREEN_RIGHT);
  });
  test("magnitude ไม่กระทบทิศ (mover normalize) — เต็มสเกลกับครึ่งสเกลได้ทิศเดียวกัน", () => {
    expect(joystickIntent(1, 0, DEADZONE)).toEqual(joystickIntent(0.5, 0, DEADZONE));
  });
  test("diagonal ขวา-ลง project เป็น screen ที่ dx>0 และ dy>0 (ตรงกับ input)", () => {
    const v = joystickIntent(1, 1, DEADZONE);
    const s = tileToScreen(v, TILE_64x32);
    expect(s.sx).toBeGreaterThan(0);
    expect(s.sy).toBeGreaterThan(0);
  });
  test("ขึ้น project เป็น screen −sy ล้วน (ขึ้นจอตรง)", () => {
    const s = tileToScreen(joystickIntent(0, -1, DEADZONE), TILE_64x32);
    expect(s.sx).toBe(0);
    expect(s.sy).toBeLessThan(0);
  });
});
