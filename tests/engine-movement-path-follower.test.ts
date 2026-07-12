import { describe, expect, test } from "vitest";
import {
  advancePathFollower,
  type PathFollowParams,
  type PathFollowState,
} from "@/engine/movement/path-follower";
import type { WalkableFn } from "@/engine/movement/mover";
import type { TilePoint } from "@/engine/iso/coords";

const PARAMS: PathFollowParams = { speed: 4, maxStepSeconds: 0.1, arrivalRadius: 0.4 };
const ALL_WALKABLE: WalkableFn = () => true;

/** เดินตาม path ด้วย dt คงที่จนกว่า arrived (หรือ blocked) — คืน pos สุดท้าย + จำนวนก้าว. */
function walk(
  start: TilePoint,
  waypoints: readonly TilePoint[],
  isWalkable: WalkableFn,
  dt = 0.1,
  maxIters = 500,
): { pos: TilePoint; arrived: boolean; blocked: boolean; steps: number } {
  let pos = start;
  const state: PathFollowState = { waypoints, index: 0 };
  for (let i = 0; i < maxIters; i++) {
    const r = advancePathFollower(pos, state, dt, PARAMS, isWalkable);
    pos = r.pos;
    state.index = r.index;
    if (r.arrived) return { pos, arrived: true, blocked: false, steps: i + 1 };
    if (r.blocked) return { pos, arrived: false, blocked: true, steps: i + 1 };
  }
  return { pos, arrived: false, blocked: false, steps: maxIters };
}

describe("advancePathFollower — เดินตาม waypoints", () => {
  test("waypoint เดียว → เดินถึงในระยะ arrivalRadius ของกลาง cell (n+0.5) แล้ว arrived", () => {
    const res = walk({ tx: 5.5, ty: 5.5 }, [{ tx: 6, ty: 5 }], ALL_WALKABLE);
    expect(res.arrived).toBe(true);
    // arrived = อยู่ในระยะ arrivalRadius ของเป้ากลาง cell (6.5, 5.5) — ไม่ snap เป๊ะ
    expect(Math.hypot(res.pos.tx - 6.5, res.pos.ty - 5.5)).toBeLessThanOrEqual(PARAMS.arrivalRadius);
  });

  test("หลาย waypoint → เดินครบถึงตัวสุดท้าย (ในระยะ arrivalRadius)", () => {
    const res = walk({ tx: 5.5, ty: 5.5 }, [{ tx: 6, ty: 5 }, { tx: 6, ty: 6 }], ALL_WALKABLE);
    expect(res.arrived).toBe(true);
    expect(Math.hypot(res.pos.tx - 6.5, res.pos.ty - 6.5)).toBeLessThanOrEqual(PARAMS.arrivalRadius);
  });

  test("heading ชี้ไปทางเป้า (ให้ caller คำนวณ facing)", () => {
    const r = advancePathFollower(
      { tx: 5.5, ty: 5.5 },
      { waypoints: [{ tx: 7, ty: 5 }], index: 0 },
      0.1,
      PARAMS,
      ALL_WALKABLE,
    );
    expect(r.heading.tx).toBeGreaterThan(0);
    expect(r.heading.ty).toBeCloseTo(0, 6);
    expect(r.blocked).toBe(false);
  });
});

describe("advancePathFollower — ขวางกลางทาง (dynamic obstacle)", () => {
  test("cell เป้าหมายกลายเป็น block → blocked, ไม่ขยับ", () => {
    const blockTarget: WalkableFn = (tx, ty) => !(tx === 6 && ty === 5);
    const r = advancePathFollower(
      { tx: 5.5, ty: 5.5 },
      { waypoints: [{ tx: 6, ty: 5 }], index: 0 },
      0.1,
      PARAMS,
      blockTarget,
    );
    expect(r.blocked).toBe(true);
    expect(r.pos).toEqual({ tx: 5.5, ty: 5.5 });
  });

  test("กำแพงคั่นระหว่างทาง (target เดินได้แต่เข้าไม่ถึง) → stuck = blocked", () => {
    // เป้า cell (7,5) เดินได้ แต่ column 6 เป็นกำแพง → ก้าวข้ามไม่ได้
    const wall6: WalkableFn = (tx) => tx !== 6;
    const r = advancePathFollower(
      { tx: 5.7, ty: 5.5 },
      { waypoints: [{ tx: 7, ty: 5 }], index: 0 },
      0.1,
      PARAMS,
      wall6,
    );
    expect(r.blocked).toBe(true);
    expect(r.pos).toEqual({ tx: 5.7, ty: 5.5 }); // ชนกำแพง column 6 → ไม่ขยับ
  });
});

describe("advancePathFollower — ยกเลิก/จบ path", () => {
  test("waypoints ว่าง (ยกเลิก path) → arrived ทันที ไม่ขยับ", () => {
    const r = advancePathFollower(
      { tx: 3, ty: 3 },
      { waypoints: [], index: 0 },
      0.1,
      PARAMS,
      ALL_WALKABLE,
    );
    expect(r.arrived).toBe(true);
    expect(r.blocked).toBe(false);
    expect(r.pos).toEqual({ tx: 3, ty: 3 });
  });

  test("index เลยท้าย path → arrived ไม่ขยับ", () => {
    const r = advancePathFollower(
      { tx: 3, ty: 3 },
      { waypoints: [{ tx: 4, ty: 3 }], index: 1 },
      0.1,
      PARAMS,
      ALL_WALKABLE,
    );
    expect(r.arrived).toBe(true);
    expect(r.pos).toEqual({ tx: 3, ty: 3 });
  });
});
