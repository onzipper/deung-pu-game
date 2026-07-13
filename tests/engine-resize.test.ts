import { describe, expect, test } from "vitest";
import { clampSize } from "@/engine/runtime/resize";

describe("clampSize", () => {
  test("floor เป็น integer", () => {
    expect(clampSize(800.7, 600.2)).toEqual({ width: 800, height: 600 });
  });

  test("คืน null เมื่อขนาดยังไม่พร้อม (0 หรือ negative) — กัน renderer.resize(0,0)", () => {
    expect(clampSize(0, 600)).toBeNull();
    expect(clampSize(800, 0)).toBeNull();
    expect(clampSize(-1, -1)).toBeNull();
  });
});
