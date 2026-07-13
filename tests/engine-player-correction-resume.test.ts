import { describe, expect, test } from "vitest";
import { planCorrectionResume } from "@/engine/player/correction-resume";
import type { WalkableFn } from "@/engine/movement/mover";

const PARAMS = { maxSearchNodes: 4096 };

/** walkable = อยู่ในกรอบ [0,w)×[0,h) และไม่อยู่ใน blocked set. */
function grid(w: number, h: number, blocked: Iterable<string> = []): WalkableFn {
  const set = new Set(blocked);
  return (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h && !set.has(`${tx},${ty}`);
}

describe("planCorrectionResume — prod stutter fix (2026-07-12)", () => {
  test("goal = null (WASD/manual / fresh join) → idle (ไม่ resume, ไม่เรียก findPath)", () => {
    const plan = planCorrectionResume({ tx: 5, ty: 5 }, null, grid(10, 10), PARAMS);
    expect(plan).toEqual({ action: "idle" });
  });

  test("มี goal เดินถึงได้ → walk พร้อม waypoints จากตำแหน่งใหม่ (resume เดินต่อ)", () => {
    const plan = planCorrectionResume(
      { tx: 0, ty: 0 },
      { tx: 0, ty: 3 },
      grid(10, 10),
      PARAMS,
    );
    expect(plan).toEqual({
      action: "walk",
      waypoints: [
        { tx: 0, ty: 1 },
        { tx: 0, ty: 2 },
        { tx: 0, ty: 3 },
      ],
    });
  });

  test("replan จาก **ตำแหน่งที่ถูก snap** ไม่ใช่ตำแหน่งเก่า (server = truth)", () => {
    // snap ไป (3,3) แล้ว goal (3,5) → path เริ่มจาก (3,3)
    const plan = planCorrectionResume(
      { tx: 3, ty: 3 },
      { tx: 3, ty: 5 },
      grid(10, 10),
      PARAMS,
    );
    expect(plan).toEqual({
      action: "walk",
      waypoints: [
        { tx: 3, ty: 4 },
        { tx: 3, ty: 5 },
      ],
    });
  });

  test("อยู่ที่ goal แล้ว (path length 0) → stop (ไม่มีอะไรต้องเดินต่อ)", () => {
    const plan = planCorrectionResume(
      { tx: 4, ty: 4 },
      { tx: 4, ty: 4 },
      grid(10, 10),
      PARAMS,
    );
    expect(plan).toEqual({ action: "stop" });
  });

  test("goal เดินไม่ถึง (ล้อมด้วยกำแพง) → stop (ยกเลิก path เหมือนเดิม)", () => {
    // goal (2,2) ถูกล้อมทุกด้าน → findPath = null
    const walls = ["1,2", "3,2", "2,1", "2,3", "1,1", "3,3", "1,3", "3,1"];
    const plan = planCorrectionResume(
      { tx: 0, ty: 0 },
      { tx: 2, ty: 2 },
      grid(10, 10, walls),
      PARAMS,
    );
    expect(plan).toEqual({ action: "stop" });
  });

  test("goal นอกขอบ map → stop", () => {
    const plan = planCorrectionResume(
      { tx: 1, ty: 1 },
      { tx: 20, ty: 20 },
      grid(10, 10),
      PARAMS,
    );
    expect(plan).toEqual({ action: "stop" });
  });
});
