import { describe, expect, test } from "vitest";
import { computePopScale } from "@/game/combat/damage-number-motion";

describe("computePopScale (pure, Combat Juice F5 — crit \"เด้งหนัก\")", () => {
  test("elapsedMs=0 → fromScale เป๊ะ (จุดเริ่ม pop)", () => {
    expect(computePopScale(0, 1.5, 200)).toBe(1.5);
  });

  test("elapsedMs ≥ durationMs → settle ที่ 1.0 เป๊ะ", () => {
    expect(computePopScale(200, 1.5, 200)).toBe(1);
    expect(computePopScale(500, 1.5, 200)).toBe(1); // เกิน duration ไม่ overshoot กลับ
  });

  test("ระหว่างทาง (ease-out) เข้าใกล้ 1.0 เร็วกว่า linear ในช่วงต้น", () => {
    const linear = 1.5 + (1 - 1.5) * 0.5; // 1.25 ถ้าเป็น linear ตรง ๆ
    const eased = computePopScale(100, 1.5, 200); // t=0.5 → ease factor 1-(1-0.5)^2=0.75 (> 0.5 ของ linear)
    // ease factor สูงกว่า linear ที่ t เดียวกัน → ผลลัพธ์ (fromScale=1.5 > เป้าหมาย 1.0) ใกล้ 1.0 กว่า → น้อยกว่า linear
    expect(eased).toBeLessThan(linear);
  });

  test("fromScale < 1 (เผื่ออนาคต pop เล็ก→ใหญ่) ก็ทำงานถูกทิศทางเหมือนกัน", () => {
    expect(computePopScale(0, 0.5, 200)).toBe(0.5);
    expect(computePopScale(200, 0.5, 200)).toBe(1);
  });

  test("fromScale=1 → คงที่ 1 ตลอด (ไม่มี pop)", () => {
    expect(computePopScale(0, 1, 200)).toBe(1);
    expect(computePopScale(100, 1, 200)).toBe(1);
  });

  test("durationMs ≤ 0 → คืน 1 ทันที (ปิด pop effect)", () => {
    expect(computePopScale(0, 1.5, 0)).toBe(1);
  });
});
