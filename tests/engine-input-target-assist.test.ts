import { describe, expect, test } from "vitest";
import {
  inputModeFromPointerType,
  resolveTargetAssistRadius,
} from "@/engine/input/target-assist";
import { DEFAULT_PATHFINDING_CONFIG } from "@/engine/config";
import type { TargetAssistConfig } from "@/engine/config";

const TA: TargetAssistConfig = DEFAULT_PATHFINDING_CONFIG.targetAssist;

// Combat Bible §3 Target assist: desktop 0.60 / touch 0.80 / keyboardAssist 0.65 (แทน 0.9 เดิม).
describe("resolveTargetAssistRadius — per input mode (Combat Bible §3)", () => {
  test("mouse (desktop) = 0.60", () => {
    expect(resolveTargetAssistRadius("mouse", TA)).toBe(0.6);
  });
  test("touch = 0.80 (กว้างสุด — นิ้วบัง/คลาด)", () => {
    expect(resolveTargetAssistRadius("touch", TA)).toBe(0.8);
  });
  test("keyboard = 0.65 (auto-engage มอนใกล้ตัว)", () => {
    expect(resolveTargetAssistRadius("keyboard", TA)).toBe(0.65);
  });
  test("touch > keyboard > mouse (ลำดับความกว้าง assist)", () => {
    expect(resolveTargetAssistRadius("touch", TA)).toBeGreaterThan(
      resolveTargetAssistRadius("keyboard", TA),
    );
    expect(resolveTargetAssistRadius("keyboard", TA)).toBeGreaterThan(
      resolveTargetAssistRadius("mouse", TA),
    );
  });
});

describe("inputModeFromPointerType — PointerEvent.pointerType → InputMode", () => {
  test("touch → touch", () => {
    expect(inputModeFromPointerType("touch")).toBe("touch");
  });
  test("mouse → mouse", () => {
    expect(inputModeFromPointerType("mouse")).toBe("mouse");
  });
  test("pen → mouse (แม่นระดับเมาส์)", () => {
    expect(inputModeFromPointerType("pen")).toBe("mouse");
  });
  test("ค่าว่าง/ไม่รู้จัก → mouse (default แม่นสุด)", () => {
    expect(inputModeFromPointerType("")).toBe("mouse");
  });
});
