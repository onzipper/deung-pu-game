// Unit tests for the PURE companion follow math (C4-MVP, §12.2) — no pixi, imports companion-follow.ts only.
// Locks the three decisions the brief calls out: dead-zone, lerp-target (clamped, no overshoot), teleport-threshold.

import { describe, expect, test } from "vitest";
import {
  stepCompanionFollow,
  type CompanionFollowParams,
} from "@/engine/player/companion-follow";

// mirror DEFAULT_COMPANION_CONFIG (trail=deadZone=0.9, teleport=6) + player.speed(4)×speedFactor(1.05)=4.2.
const CFG: CompanionFollowParams = {
  trailDistanceTiles: 0.9,
  deadZoneTiles: 0.9,
  teleportDistanceTiles: 6,
  speedTilesPerSec: 4.2,
};

describe("stepCompanionFollow — dead zone", () => {
  test("ภายใน deadZone → นิ่ง (idle), ไม่ขยับ, ไม่ teleport", () => {
    const r = stepCompanionFollow({ tx: 0.5, ty: 0 }, { tx: 0, ty: 0 }, 0.1, CFG);
    expect(r).toEqual({ tx: 0.5, ty: 0, moved: false, teleported: false, dx: 0, dy: 0 });
  });

  test("ที่ขอบ deadZone พอดี (dist = 0.9) → ยังนิ่ง (≤ ไม่ >)", () => {
    const r = stepCompanionFollow({ tx: 0.9, ty: 0 }, { tx: 0, ty: 0 }, 0.1, CFG);
    expect(r.moved).toBe(false);
    expect(r.tx).toBe(0.9);
  });
});

describe("stepCompanionFollow — lerp target (clamped by speed·dt)", () => {
  test("ไกลกว่า deadZone → ขยับเข้าหาผู้เล่น, clamp ด้วย speed·dt (ไม่กระโดด)", () => {
    const r = stepCompanionFollow({ tx: 5, ty: 0 }, { tx: 0, ty: 0 }, 0.1, CFG);
    // step = min(moveDist 4.1, speed·dt 0.42) = 0.42 → เดินเข้าหา -x
    expect(r.moved).toBe(true);
    expect(r.teleported).toBe(false);
    expect(r.tx).toBeCloseTo(5 - 0.42, 6);
    expect(r.ty).toBeCloseTo(0, 6);
    expect(r.dx).toBeCloseTo(-0.42, 6); // facing delta ชี้เข้าหาผู้เล่น
    expect(r.dy).toBeCloseTo(0, 6);
  });

  test("dt ใหญ่ → ไม่ overshoot: หยุดที่ trailDistance พอดี แล้วเฟรมถัดไป settle", () => {
    // dist 1.0 > deadZone 0.9; target = 0.9; moveDist 0.1 << speed·dt(1s=4.2) → snap ถึง target ไม่เกิน
    const r = stepCompanionFollow({ tx: 1.0, ty: 0 }, { tx: 0, ty: 0 }, 1, CFG);
    expect(r.tx).toBeCloseTo(0.9, 6);
    expect(r.moved).toBe(true);
    // เฟรมถัดไปอยู่ที่ trailDistance = deadZone → นิ่ง
    const settled = stepCompanionFollow({ tx: r.tx, ty: r.ty }, { tx: 0, ty: 0 }, 1, CFG);
    expect(settled.moved).toBe(false);
  });

  test("แนวทแยง → ขยับตามแนวเส้นตรงเข้าหา target (สัดส่วนคงที่)", () => {
    const r = stepCompanionFollow({ tx: 3, ty: 4 }, { tx: 0, ty: 0 }, 0.1, CFG);
    // dist 5, unit (0.6,0.8), step 0.42 → ทิศ dx/dy = -unit·step
    expect(r.dx).toBeCloseTo(-0.6 * 0.42, 6);
    expect(r.dy).toBeCloseTo(-0.8 * 0.42, 6);
  });
});

describe("stepCompanionFollow — teleport threshold", () => {
  test("ไกลเกิน teleport → snap ไปจุด trailDistance จากผู้เล่นทันที (ไม่นับ walk)", () => {
    const r = stepCompanionFollow({ tx: 10, ty: 0 }, { tx: 0, ty: 0 }, 0.1, CFG);
    expect(r.teleported).toBe(true);
    expect(r.moved).toBe(false);
    expect(r.tx).toBeCloseTo(0.9, 6); // player + unit(1,0)·trail
    expect(r.ty).toBeCloseTo(0, 6);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
  });

  test("ที่ขอบ teleport พอดี (dist = 6) → ยังไม่ teleport (ใช้ lerp)", () => {
    const r = stepCompanionFollow({ tx: 6, ty: 0 }, { tx: 0, ty: 0 }, 0.1, CFG);
    expect(r.teleported).toBe(false);
    expect(r.moved).toBe(true);
  });

  test("teleport แม้ผู้เล่นซ้อนตำแหน่ง (coincident) → ลง offset default ไม่ทับ (dist ~0 ไม่ teleport)", () => {
    // coincident = dist 0 ≤ deadZone → นิ่ง (ไม่เข้า teleport branch); กันหารศูนย์
    const r = stepCompanionFollow({ tx: 0, ty: 0 }, { tx: 0, ty: 0 }, 0.1, CFG);
    expect(r).toEqual({ tx: 0, ty: 0, moved: false, teleported: false, dx: 0, dy: 0 });
  });
});
