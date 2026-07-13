import { describe, expect, test } from "vitest";
import { hpBarFraction, isLowHp, expBarFraction } from "@/ui/panels/status/status-view";

// E3 Player Status Cluster — pure view helpers (P2 UI §8.2 / §9.1 exp cap).

describe("hpBarFraction (§8.2 HP bar)", () => {
  test("ปกติ", () => expect(hpBarFraction(50, 100)).toBe(0.5));
  test("clamp บน/ล่าง", () => {
    expect(hpBarFraction(120, 100)).toBe(1);
    expect(hpBarFraction(-5, 100)).toBe(0);
  });
  test("maxHp 0 (ก่อน init) → 0 (ไม่หารศูนย์)", () => expect(hpBarFraction(10, 0)).toBe(0));
});

describe("isLowHp (§8.2 low HP < 20%)", () => {
  test("< 0.2 → true", () => expect(isLowHp(0.19)).toBe(true));
  test(">= 0.2 → false (ขอบ 20% ไม่นับ low)", () => {
    expect(isLowHp(0.2)).toBe(false);
    expect(isLowHp(0.5)).toBe(false);
  });
});

describe("expBarFraction (§8.2 EXP bar / §9.1 cap)", () => {
  test("ceil > floor → สัดส่วนภายในเลเวล", () => {
    expect(expBarFraction({ exp: 150, floor: 100, ceil: 300 })).toBeCloseTo(0.25);
  });
  test("เพิ่งขึ้นเลเวล (exp = floor) → 0", () => {
    expect(expBarFraction({ exp: 100, floor: 100, ceil: 300 })).toBe(0);
  });
  test("ceil 0 = ตัน cap (§9.1) → เต็ม", () => {
    expect(expBarFraction({ exp: 9999, floor: 5000, ceil: 0 })).toBe(1);
  });
  test("null (ยังไม่รู้ค่า) → 0", () => expect(expBarFraction(null)).toBe(0));
  test("exp เกิน ceil → clamp 1", () => {
    expect(expBarFraction({ exp: 400, floor: 100, ceil: 300 })).toBe(1);
  });
});
