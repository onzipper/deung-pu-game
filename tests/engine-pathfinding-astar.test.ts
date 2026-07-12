import { describe, expect, test } from "vitest";
import { findPath } from "@/engine/pathfinding/astar";
import type { WalkableFn } from "@/engine/movement/mover";
import type { TilePoint } from "@/engine/iso/coords";

const PARAMS = { maxSearchNodes: 4096 };

/** walkable = อยู่ในกรอบ [0,w)×[0,h) และไม่อยู่ใน blocked set. */
function grid(w: number, h: number, blocked: Iterable<string> = []): WalkableFn {
  const set = new Set(blocked);
  return (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h && !set.has(`${tx},${ty}`);
}

const keyOf = (p: TilePoint): string => `${p.tx},${p.ty}`;

/** ทุกก้าวใน path ห่างจากก้อนก่อนหน้าไม่เกิน 1 tile ต่อแกน (ต่อเนื่อง, integer cell). */
function isContinuous(start: TilePoint, path: TilePoint[]): boolean {
  let prev = start;
  for (const step of path) {
    const dx = Math.abs(step.tx - prev.tx);
    const dy = Math.abs(step.ty - prev.ty);
    if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) return false;
    prev = step;
  }
  return true;
}

describe("findPath — เส้นทางพื้นฐานบน open grid", () => {
  test("เดินตรงแนวเดียว (ortho) → waypoints ต่อเนื่องถึง goal (ไม่รวม start)", () => {
    const path = findPath({ tx: 0, ty: 0 }, { tx: 0, ty: 3 }, grid(10, 10), PARAMS);
    expect(path).toEqual([
      { tx: 0, ty: 1 },
      { tx: 0, ty: 2 },
      { tx: 0, ty: 3 },
    ]);
  });

  test("open grid → ใช้เส้นทแยง (diagonal) สั้นสุด", () => {
    const path = findPath({ tx: 0, ty: 0 }, { tx: 3, ty: 3 }, grid(10, 10), PARAMS);
    expect(path).toEqual([
      { tx: 1, ty: 1 },
      { tx: 2, ty: 2 },
      { tx: 3, ty: 3 },
    ]);
  });

  test("start == goal cell → [] (ถึงแล้ว ไม่ต้องเดิน)", () => {
    expect(findPath({ tx: 5.2, ty: 5.8 }, { tx: 5.9, ty: 5.1 }, grid(10, 10), PARAMS)).toEqual([]);
  });

  test("start/goal เป็น float → snap เป็น cell เดียวกันก่อนคิด", () => {
    const path = findPath({ tx: 0.5, ty: 0.5 }, { tx: 2.9, ty: 0.1 }, grid(10, 10), PARAMS);
    // cell (0,0) → (2,0): ortho ตรง
    expect(path).toEqual([
      { tx: 1, ty: 0 },
      { tx: 2, ty: 0 },
    ]);
  });
});

describe("findPath — อ้อมสิ่งกีดขวาง", () => {
  test("อ้อมกำแพง: หลบ blocked cell ทุกก้อน + ถึง goal + ต่อเนื่อง", () => {
    // กำแพงแนวตั้ง tx=2 ty 0..4 มีช่องล่างที่ (2,5)
    const blocked = ["2,0", "2,1", "2,2", "2,3", "2,4"];
    const walkable = grid(6, 6, blocked);
    const start = { tx: 0, ty: 2 };
    const goal = { tx: 4, ty: 2 };
    const path = findPath(start, goal, walkable, PARAMS);
    expect(path).not.toBeNull();
    const p = path as TilePoint[];
    // ก้อนสุดท้าย = goal
    expect(p[p.length - 1]).toEqual(goal);
    // ไม่มี waypoint ทับ blocked
    for (const step of p) expect(blocked).not.toContain(keyOf(step));
    // ทุก waypoint เดินได้จริง + ต่อเนื่อง
    for (const step of p) expect(walkable(step.tx, step.ty)).toBe(true);
    expect(isContinuous(start, p)).toBe(true);
  });
});

describe("findPath — ไม่มีทาง → null", () => {
  test("goal ถูกล้อมรอบด้วยกำแพง (รวมแนวทแยง) → null", () => {
    const ring = [
      "2,3", "4,3", "3,2", "3,4", // ortho
      "2,2", "2,4", "4,2", "4,4", // diagonal — ปิดช่องมุมด้วย
    ];
    expect(findPath({ tx: 0, ty: 0 }, { tx: 3, ty: 3 }, grid(6, 6, ring), PARAMS)).toBeNull();
  });

  test("goal เป็น blocked tile (คลิกบนกำแพง) → null", () => {
    expect(findPath({ tx: 0, ty: 0 }, { tx: 3, ty: 3 }, grid(6, 6, ["3,3"]), PARAMS)).toBeNull();
  });

  test("goal อยู่นอกขอบ grid → null", () => {
    expect(findPath({ tx: 0, ty: 0 }, { tx: 99, ty: 99 }, grid(6, 6), PARAMS)).toBeNull();
  });
});

describe("findPath — กัน corner cutting (never-downgrade)", () => {
  test("มุมกำแพงกั้นทแยง → ห้ามมุดผ่านมุม (ต้องเดินอ้อม ortho)", () => {
    // block (1,0) เท่านั้น: (0,0)→(1,1) แทยงต้องมี (1,0)&(0,1) walkable ทั้งคู่ → (1,0) block = ห้าม
    const path = findPath({ tx: 0, ty: 0 }, { tx: 1, ty: 1 }, grid(4, 4, ["1,0"]), PARAMS);
    expect(path).toEqual([
      { tx: 0, ty: 1 }, // อ้อมลงก่อน (ortho)
      { tx: 1, ty: 1 },
    ]);
    // ยืนยันไม่ได้กระโดดแทยงตรงเข้ามุม
    expect((path as TilePoint[])[0]).not.toEqual({ tx: 1, ty: 1 });
  });

  test("มุมโล่งทั้งสองข้าง → เดินทแยงได้ (ไม่ over-restrict)", () => {
    const path = findPath({ tx: 0, ty: 0 }, { tx: 1, ty: 1 }, grid(4, 4), PARAMS);
    expect(path).toEqual([{ tx: 1, ty: 1 }]); // แทยงก้าวเดียว
  });
});

describe("findPath — cap search nodes (map ใหญ่ไม่ค้าง)", () => {
  test("เป้าไกลบน grid ใหญ่ + cap ต่ำ → null (ยอมแพ้ก่อนค้าง)", () => {
    const open = grid(2000, 2000);
    expect(findPath({ tx: 0, ty: 0 }, { tx: 1500, ty: 1500 }, open, { maxSearchNodes: 50 })).toBeNull();
  });

  test("cap สูงพอ → หา path ไกลได้ตามปกติ", () => {
    const open = grid(50, 50);
    const path = findPath({ tx: 0, ty: 0 }, { tx: 20, ty: 20 }, open, { maxSearchNodes: 4096 });
    expect(path).not.toBeNull();
    expect((path as TilePoint[]).length).toBe(20); // แทยงล้วน 20 ก้าว
  });
});
