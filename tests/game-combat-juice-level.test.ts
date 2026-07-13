import { describe, expect, test } from "vitest";
import { resolveJuiceLevel } from "@/game/combat/juice-level";

describe("resolveJuiceLevel (pure, P1-06 follow-up, GS §17.5)", () => {
  test("baseLevel สูงพอ (ไม่ killed/crit) → คืน baseLevel ตรง ๆ", () => {
    expect(
      resolveJuiceLevel({
        baseLevel: 2,
        killed: false,
        crit: false,
        minLevelOnKill: 1,
        minLevelOnCrit: 1,
      }),
    ).toBe(2);
  });

  test("killed=true + baseLevel ต่ำกว่า floor → ยกขึ้นเป็น minLevelOnKill", () => {
    expect(
      resolveJuiceLevel({
        baseLevel: 0, // S1 sword_basic_slash
        killed: true,
        crit: false,
        minLevelOnKill: 1,
        minLevelOnCrit: 1,
      }),
    ).toBe(1);
  });

  test("crit=true + baseLevel ต่ำกว่า floor → ยกขึ้นเป็น minLevelOnCrit", () => {
    expect(
      resolveJuiceLevel({
        baseLevel: 0,
        killed: false,
        crit: true,
        minLevelOnKill: 1,
        minLevelOnCrit: 1,
      }),
    ).toBe(1);
  });

  test("baseLevel สูงกว่า floor อยู่แล้ว (เช่น S3 level 2) → ไม่ถูกลดทอน", () => {
    expect(
      resolveJuiceLevel({
        baseLevel: 2,
        killed: true,
        crit: false,
        minLevelOnKill: 1,
        minLevelOnCrit: 1,
      }),
    ).toBe(2);
  });

  test("killed+crit พร้อมกัน ใช้ floor สูงสุดของทั้งสอง", () => {
    expect(
      resolveJuiceLevel({
        baseLevel: 0,
        killed: true,
        crit: true,
        minLevelOnKill: 1,
        minLevelOnCrit: 3,
      }),
    ).toBe(3);
  });

  test("ไม่ killed ไม่ crit → ไม่ floor เลย (คง baseLevel เดิมแม้ 0)", () => {
    expect(
      resolveJuiceLevel({
        baseLevel: 0,
        killed: false,
        crit: false,
        minLevelOnKill: 1,
        minLevelOnCrit: 1,
      }),
    ).toBe(0);
  });

  test("floor = 0 (ปิดผลของ feature นี้) → ไม่เปลี่ยนพฤติกรรมเดิม", () => {
    expect(
      resolveJuiceLevel({
        baseLevel: 0,
        killed: true,
        crit: true,
        minLevelOnKill: 0,
        minLevelOnCrit: 0,
      }),
    ).toBe(0);
  });
});
