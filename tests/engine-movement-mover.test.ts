import { describe, expect, test } from "vitest";
import { stepMovement, type WalkableFn } from "@/engine/movement/mover";
import type { TilePoint } from "@/engine/iso/coords";

const PARAMS = { speed: 4, maxStepSeconds: 0.1 };
const ALL_WALKABLE: WalkableFn = () => true;

/** magnitude ของ displacement จาก a→b (tile-space euclidean). */
function dist(a: TilePoint, b: TilePoint): number {
  return Math.hypot(b.tx - a.tx, b.ty - a.ty);
}

describe("stepMovement — เดินต่อเนื่อง + normalize", () => {
  test("intent (0,0) → อยู่กับที่", () => {
    const p = { tx: 5, ty: 5 };
    expect(stepMovement(p, { tx: 0, ty: 0 }, 0.1, PARAMS, ALL_WALKABLE)).toEqual(
      p,
    );
  });

  test("pure — ไม่ mutate pos เดิม", () => {
    const p = { tx: 5, ty: 5 };
    stepMovement(p, { tx: 1, ty: 1 }, 0.1, PARAMS, ALL_WALKABLE);
    expect(p).toEqual({ tx: 5, ty: 5 });
  });

  test("เดินตรง: displacement = speed·dt (dt < maxStep)", () => {
    const p = { tx: 10, ty: 10 };
    const dt = 0.05; // < maxStep 0.1
    const next = stepMovement(p, { tx: 1, ty: 1 }, dt, PARAMS, ALL_WALKABLE);
    expect(dist(p, next)).toBeCloseTo(PARAMS.speed * dt, 10); // = 0.2
  });

  test("normalize diagonal: intent (0,−2) เดินเท่าเดิม ไม่เร็วกว่า (1,1)", () => {
    const p = { tx: 10, ty: 10 };
    const dt = 0.05;
    const straight = stepMovement(p, { tx: 1, ty: 1 }, dt, PARAMS, ALL_WALKABLE);
    const combo = stepMovement(p, { tx: 0, ty: -2 }, dt, PARAMS, ALL_WALKABLE);
    expect(dist(p, straight)).toBeCloseTo(dist(p, combo), 10);
    expect(dist(p, combo)).toBeCloseTo(PARAMS.speed * dt, 10);
  });

  test("intent ยาวไม่เท่ากันแต่ทิศเดียวกัน → ผลเท่ากัน (normalize)", () => {
    const p = { tx: 10, ty: 10 };
    const a = stepMovement(p, { tx: 1, ty: 0 }, 0.05, PARAMS, ALL_WALKABLE);
    const b = stepMovement(p, { tx: 5, ty: 0 }, 0.05, PARAMS, ALL_WALKABLE);
    expect(a).toEqual(b);
  });
});

describe("stepMovement — clamp dt (กัน tunneling)", () => {
  test("dt ใหญ่ (tab กลับมา) ถูก clamp เป็น maxStepSeconds", () => {
    const p = { tx: 10, ty: 10 };
    const next = stepMovement(p, { tx: 1, ty: 0 }, 10, PARAMS, ALL_WALKABLE);
    // clamp → dist = speed·maxStep = 0.4 ไม่ใช่ speed·10 = 40
    expect(dist(p, next)).toBeCloseTo(PARAMS.speed * PARAMS.maxStepSeconds, 10);
  });

  test("dt ≤ 0 → อยู่กับที่", () => {
    const p = { tx: 3, ty: 3 };
    expect(stepMovement(p, { tx: 1, ty: 0 }, 0, PARAMS, ALL_WALKABLE)).toEqual(p);
    expect(stepMovement(p, { tx: 1, ty: 0 }, -1, PARAMS, ALL_WALKABLE)).toEqual(
      p,
    );
  });
});

describe("stepMovement — collision axis-separated slide", () => {
  // กำแพงตั้ง: tile tx >= 12 เดินไม่ได้ (integer tile).
  const wallAtX12: WalkableFn = (tx) => tx < 12;

  test("ชนกำแพงแกน tx: tx ไม่ขยับ แต่ ty ไถลได้", () => {
    const p = { tx: 11.9, ty: 10 };
    // intent ขวา-ล่าง (tx+, ty+): tx ชนกำแพง → ค้าง, ty ไถลลงได้
    const next = stepMovement(p, { tx: 1, ty: 1 }, 0.1, PARAMS, wallAtX12);
    expect(next.tx).toBe(11.9); // แกน tx ถูกยกเลิก (snap(12.x) block)
    expect(next.ty).toBeGreaterThan(10); // แกน ty ไถลได้
  });

  test("เดินเข้ากำแพงตรง ๆ (tx+ เท่านั้น) → หยุดสนิทแกนนั้น", () => {
    const p = { tx: 11.9, ty: 10 };
    const next = stepMovement(p, { tx: 1, ty: 0 }, 0.1, PARAMS, wallAtX12);
    expect(next).toEqual({ tx: 11.9, ty: 10 });
  });

  test("ออกจากกำแพง (tx−) ยังเดินได้ปกติ", () => {
    const p = { tx: 11.9, ty: 10 };
    const next = stepMovement(p, { tx: -1, ty: 0 }, 0.1, PARAMS, wallAtX12);
    expect(next.tx).toBeLessThan(11.9);
  });

  test("ทุกทิศ block → อยู่กับที่สนิท", () => {
    const blocked: WalkableFn = () => false;
    const p = { tx: 5, ty: 5 };
    expect(stepMovement(p, { tx: 1, ty: 1 }, 0.1, PARAMS, blocked)).toEqual(p);
  });

  test("slide เช็ค ty จาก tx ใหม่ (nx): มุมกำแพงเดี่ยว block แค่แกนที่ชน", () => {
    // block เฉพาะ cell (6,6). จาก (5.9,5.9) เดินขวา-ล่างเข้ามุม:
    //   • แกน tx → cell (6,5) walkable → เลื่อนได้ (ไถลตามขอบบนกำแพง)
    //   • แกน ty เช็คจาก nx ใหม่ → cell (6,6) block → ค้าง
    const blockCell: WalkableFn = (tx, ty) => !(tx === 6 && ty === 6);
    const p = { tx: 5.9, ty: 5.9 };
    const next = stepMovement(p, { tx: 1, ty: 1 }, 0.1, PARAMS, blockCell);
    expect(next.tx).toBeGreaterThan(5.9); // ไถลแกน tx เข้า column 6 (row 5)
    expect(next.ty).toBe(5.9); // แกน ty ถูก cell (6,6) block
  });
});
