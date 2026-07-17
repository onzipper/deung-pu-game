// M6 (จอกระตุกตอนบอทคุมตัว) — pure logic ของ self-authority presentation: snap-vs-interpolate decision +
// buffer sampling ตอน Character Autonomy. เวลาทั้งหมด inject ผ่าน push(now)/sample(now) → deterministic เต็ม
// (ไม่แตะ pixi/scene). glue (moveEntity/camera) อยู่ local-player.ts — ครอบด้วย source guard ใน app-authority test.

import { describe, expect, test } from "vitest";
import {
  createSelfAuthorityController,
  shouldSnapAuthorityUpdate,
  type SelfAuthorityConfig,
} from "@/engine/net/self-authority";

const CFG: SelfAuthorityConfig = {
  bufferMs: 120,
  bufferCapacity: 16,
  maxExtrapolationMs: 100,
  snapThresholdTiles: 3,
};

describe("shouldSnapAuthorityUpdate — snap ก็ต่อเมื่อกระโดดไกลเกิน threshold", () => {
  test("เดินปกติ (< threshold) → false (interpolate)", () => {
    expect(shouldSnapAuthorityUpdate({ tx: 0, ty: 0 }, { tx: 0.4, ty: 0 }, 3)).toBe(false);
    expect(shouldSnapAuthorityUpdate({ tx: 0, ty: 0 }, { tx: 1.5, ty: 1.5 }, 3)).toBe(false); // dist ≈ 2.12
  });

  test("ตรง threshold พอดี → true (>= boundary)", () => {
    expect(shouldSnapAuthorityUpdate({ tx: 0, ty: 0 }, { tx: 3, ty: 0 }, 3)).toBe(true);
  });

  test("ต่ำกว่า threshold แม้เฉียด → false", () => {
    expect(shouldSnapAuthorityUpdate({ tx: 0, ty: 0 }, { tx: 2.99, ty: 0 }, 3)).toBe(false);
  });

  test("warp/teleport/transfer ข้ามแมพ (กระโดดไกลมาก) → true", () => {
    expect(shouldSnapAuthorityUpdate({ tx: 2, ty: 2 }, { tx: 40, ty: 60 }, 3)).toBe(true);
  });

  test("ไม่ขยับ → false (0 ยังน้อยกว่า threshold > 0)", () => {
    expect(shouldSnapAuthorityUpdate({ tx: 7, ty: 7 }, { tx: 7, ty: 7 }, 3)).toBe(false);
  });
});

describe("createSelfAuthorityController — seed / buffer / sample", () => {
  test("push แรก = seed → คำสั่ง snap พร้อมพิกัด", () => {
    const c = createSelfAuthorityController(CFG);
    const cmd = c.push(1000, 5, 6, "S", "idle");
    expect(cmd).toEqual({ kind: "snap", tx: 5, ty: 6, direction: "S", anim: "idle" });
  });

  test("push ที่สอง (เดินปกติ) = buffer (ไม่ snap)", () => {
    const c = createSelfAuthorityController(CFG);
    c.push(1000, 0, 0, "S", "walk");
    expect(c.push(1100, 1, 0, "E", "walk")).toEqual({ kind: "buffer" });
  });

  test("sample ที่ now − bufferMs → lerp ระหว่าง 2 snapshot", () => {
    const c = createSelfAuthorityController(CFG);
    c.push(1000, 0, 0, "S", "walk");
    c.push(1100, 1, 0, "E", "walk");
    // now=1170 → renderTime=1050 = กึ่งกลาง t=1000..1100 → tx≈0.5, ทิศ/anim จาก snapshot ใหม่กว่า
    const s = c.sample(1170)!;
    expect(s).not.toBeNull();
    expect(s.tx).toBeCloseTo(0.5);
    expect(s.ty).toBeCloseTo(0);
    expect(s.direction).toBe("E");
  });

  test("ก่อน seed → sample คืน null", () => {
    expect(createSelfAuthorityController(CFG).sample(9999)).toBeNull();
  });
});

describe("createSelfAuthorityController — boundary: warp / flush / reset", () => {
  test("warp (jump ≥ threshold) → snap + reseed (ไม่ลาก interpolate จากที่เดิม)", () => {
    const c = createSelfAuthorityController(CFG);
    c.push(1000, 0, 0, "S", "walk");
    c.push(1100, 1, 0, "E", "walk");
    const cmd = c.push(1200, 20, 20, "N", "idle"); // jump ~27 tile ≥ 3
    expect(cmd).toEqual({ kind: "snap", tx: 20, ty: 20, direction: "N", anim: "idle" });
    // buffer ถูก clear+reseed → sample ตำแหน่งใหม่ล้วน (clamp ที่ 20,20) ไม่ interpolate จาก (1,0)
    const s = c.sample(1250)!;
    expect(s.tx).toBeCloseTo(20);
    expect(s.ty).toBeCloseTo(20);
  });

  test("flush → คืน snapshot ล่าสุดที่ยืนยัน แล้วเคลียร์ buffer + reseed", () => {
    const c = createSelfAuthorityController(CFG);
    c.push(1000, 0, 0, "S", "walk");
    c.push(1100, 2, 1, "E", "walk");
    expect(c.flush()).toEqual({ tx: 2, ty: 1, direction: "E", anim: "walk" });
    // หลัง flush: buffer ว่าง → sample null; push ถัดไป snap ใหม่ (seeded reset)
    expect(c.sample(1200)).toBeNull();
    expect(c.push(1300, 9, 9, "W", "idle")).toEqual({
      kind: "snap",
      tx: 9,
      ty: 9,
      direction: "W",
      anim: "idle",
    });
  });

  test("flush ก่อนเคยได้ state → null", () => {
    expect(createSelfAuthorityController(CFG).flush()).toBeNull();
  });

  test("reset → push ถัดไป snap ใหม่ (เริ่ม autonomy รอบใหม่)", () => {
    const c = createSelfAuthorityController(CFG);
    c.push(1000, 0, 0, "S", "walk");
    c.push(1100, 1, 0, "E", "walk");
    c.reset();
    expect(c.push(1200, 1, 0, "E", "walk")).toEqual({
      kind: "snap",
      tx: 1,
      ty: 0,
      direction: "E",
      anim: "walk",
    });
  });
});
