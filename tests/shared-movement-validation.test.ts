import { describe, expect, test } from "vitest";
import {
  validateMove,
  type MoveValidationParams,
  type WalkableAtFn,
} from "@/shared/movement-validation";
import {
  DEFAULT_MOVEMENT_VALIDATION_CONFIG,
  DEFAULT_PLAYER_CONFIG,
} from "@/engine/config";

// พารามิเตอร์ default (mirror client/server จาก DEFAULT_ENGINE_CONFIG):
// speed = 4 tile/s · tolerance 1.5 · teleport 3 tile · minElapsed 90ms · maxElapsed 1000ms
// (floor = 90ms ≥ 1 send interval @12Hz เพื่อให้ 1 ก้าวเต็มที่มาถึงชิดกันยังผ่าน — prod fix 2026-07-12)
const SPEED = DEFAULT_PLAYER_CONFIG.speed;
const PARAMS: MoveValidationParams = {
  speed: SPEED,
  validation: DEFAULT_MOVEMENT_VALIDATION_CONFIG,
};

/** เดินได้ทุกที่ (map โล่ง) — แยกทดสอบ speed/teleport ออกจาก collision. */
const alwaysWalkable: WalkableAtFn = () => true;

describe("validateMove — เดินปกติผ่าน (P1-02, TA §6)", () => {
  test.each([
    // [elapsedMs, distance] ที่อยู่ใน allowance = speed × elapsed/1000 × 1.5
    [83, 0.4], // 1 interval @12Hz — allowance ≈ 0.5
    [100, 0.5], // allowance = 0.6
    [200, 1.0], // allowance = 1.2
    [500, 2.5], // allowance = 3.0 (พอดี), dist 2.5 < 3 teleport
  ])("elapsed %ims, ระยะ %f tile → ok", (elapsedMs, distance) => {
    const prev = { tx: 5, ty: 5 };
    const next = { tx: 5 + distance, ty: 5 };
    const res = validateMove(prev, next, elapsedMs, PARAMS, alwaysWalkable);
    expect(res.ok).toBe(true);
  });

  test("หยุดนิ่ง (ระยะ 0) → ok เสมอ", () => {
    const p = { tx: 12.5, ty: 12.5 };
    expect(validateMove(p, { ...p }, 83, PARAMS, alwaysWalkable).ok).toBe(true);
  });
});

describe("validateMove — speed hack โดนจับ", () => {
  test("ระยะเกิน allowance (แต่ < teleport) → reason speed, snap กลับ prev", () => {
    const prev = { tx: 0, ty: 0 };
    // 1 interval → allowance ≈ 0.5; ขยับ 2 tile (< 3 teleport) = speed hack
    const next = { tx: 2, ty: 0 };
    const res = validateMove(prev, next, 83, PARAMS, alwaysWalkable);
    expect(res).toEqual({ ok: false, reason: "speed", correctTo: { tx: 0, ty: 0 } });
  });

  test("ระยะพอดีขอบ allowance ผ่าน / เกินนิดเดียวไม่ผ่าน", () => {
    const prev = { tx: 0, ty: 0 };
    // elapsed 100ms → allowance = 4 × 0.1 × 1.5 = 0.6
    expect(validateMove(prev, { tx: 0.6, ty: 0 }, 100, PARAMS, alwaysWalkable).ok).toBe(true);
    expect(validateMove(prev, { tx: 0.61, ty: 0 }, 100, PARAMS, alwaysWalkable).ok).toBe(false);
  });
});

describe("validateMove — เดินลง blocked โดนจับ", () => {
  test("ปลายทาง blocked → reason blocked, correctTo = ตำแหน่งเดิม", () => {
    const prev = { tx: 5, ty: 5 };
    const next = { tx: 5.3, ty: 5 }; // ระยะเล็ก ผ่าน speed แต่ tile blocked
    // จำลอง: tile (5,y) เดินได้, tile (6,y)... ที่นี่ block เฉพาะปลายทาง
    const blockDest: WalkableAtFn = (tx) => tx < 5.3;
    const res = validateMove(prev, next, 83, PARAMS, blockDest);
    expect(res).toEqual({ ok: false, reason: "blocked", correctTo: { tx: 5, ty: 5 } });
  });

  test("ปลายทางเดินได้ → ผ่าน (isWalkableAt = true)", () => {
    const prev = { tx: 5, ty: 5 };
    expect(validateMove(prev, { tx: 5.3, ty: 5 }, 83, PARAMS, alwaysWalkable).ok).toBe(true);
  });
});

describe("validateMove — teleport โดนจับ", () => {
  test("กระโดดไกลเกิน threshold → reason teleport แม้ elapsed มาก", () => {
    const prev = { tx: 0, ty: 0 };
    const next = { tx: 10, ty: 10 }; // ระยะ ≈ 14.1 tile ≫ 3
    const res = validateMove(prev, next, 100000, PARAMS, alwaysWalkable);
    expect(res).toEqual({ ok: false, reason: "teleport", correctTo: { tx: 0, ty: 0 } });
  });

  test("teleport ถูกจับก่อน speed (absolute cap อิสระจาก elapsed)", () => {
    const prev = { tx: 0, ty: 0 };
    const next = { tx: 5, ty: 0 }; // > teleport 3 → teleport (ไม่ใช่ speed)
    const res = validateMove(prev, next, 100, PARAMS, alwaysWalkable);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("teleport");
  });
});

describe("validateMove — edge: clock skew (elapsed 0/ติดลบ) ห้าม divide-by-zero", () => {
  test("elapsed 0 → ใช้ minElapsed clamp, 1 ก้าวเต็มยังผ่าน (prod fix floor 90ms)", () => {
    const prev = { tx: 0, ty: 0 };
    // allowance ที่ minElapsed 90ms = 4 × 0.09 × 1.5 = 0.54 → 1 ก้าวเต็ม (0.333) ผ่าน, เกิน 0.54 ไม่ผ่าน
    expect(validateMove(prev, { tx: 0.333, ty: 0 }, 0, PARAMS, alwaysWalkable).ok).toBe(true);
    expect(validateMove(prev, { tx: 0.5, ty: 0 }, 0, PARAMS, alwaysWalkable).ok).toBe(true);
    expect(validateMove(prev, { tx: 0.6, ty: 0 }, 0, PARAMS, alwaysWalkable).ok).toBe(false);
  });

  test("elapsed ติดลบ (clock ถอยหลัง) → ไม่ throw, clamp เป็น min", () => {
    const prev = { tx: 0, ty: 0 };
    const res = validateMove(prev, { tx: 0.333, ty: 0 }, -500, PARAMS, alwaysWalkable);
    expect(res.ok).toBe(true);
    const res2 = validateMove(prev, { tx: 0.6, ty: 0 }, -500, PARAMS, alwaysWalkable);
    expect(res2.ok).toBe(false);
  });
});

describe("validateMove — edge: elapsed clamp ceiling (gap ยาว ไม่ให้ allowance บวม)", () => {
  test("elapsed มหาศาล → allowance ถูก cap ที่ maxElapsed (แยกจาก teleport)", () => {
    // ตั้ง teleport สูงเพื่อ isolate speed cap ล้วน
    const params: MoveValidationParams = {
      speed: SPEED,
      validation: { ...DEFAULT_MOVEMENT_VALIDATION_CONFIG, teleportThresholdTiles: 100 },
    };
    const prev = { tx: 0, ty: 0 };
    // maxElapsed 1000ms → allowance = 4 × 1 × 1.5 = 6 แม้ elapsed = 100000ms
    expect(validateMove(prev, { tx: 5, ty: 0 }, 100000, params, alwaysWalkable).ok).toBe(true);
    expect(validateMove(prev, { tx: 7, ty: 0 }, 100000, params, alwaysWalkable).ok).toBe(false);
  });
});

describe("validateMove — non_finite (wire เพี้ยน)", () => {
  test.each([
    ["NaN tx", { tx: NaN, ty: 0 }],
    ["Infinity ty", { tx: 0, ty: Infinity }],
  ])("%s → reason non_finite, correctTo = prev", (_label, next) => {
    const prev = { tx: 3, ty: 4 };
    const res = validateMove(prev, next, 83, PARAMS, alwaysWalkable);
    expect(res).toEqual({ ok: false, reason: "non_finite", correctTo: { tx: 3, ty: 4 } });
  });
});

describe("validateMove — regression: prod stutter (arrival compression, 2026-07-12)", () => {
  // Root cause: client ส่ง MSG_MOVE 12Hz (ก้าวละ speed/12 = 0.333 tile). บนเน็ตจริง/free-tier CPU
  // message มาถึงชิดกันเป็นก้อน → elapsed ≈ 0 → clamp ขึ้น floor. ที่ floor เดิม 50ms allowance = 0.30 <
  // 0.333 → reject speed → correction → เดินกระตุกแล้วหยุด. floor 90 → allowance 0.54 ≥ 0.333 → ผ่าน.
  test("1 ก้าวเต็ม (delta 0.333) ที่ elapsed 5ms → ok (ไม่โดน false-positive speed)", () => {
    const prev = { tx: 5, ty: 5 };
    const next = { tx: 5 + 4 / 12, ty: 5 }; // 0.3333 tile = 1 ก้าว @speed 4, 12Hz
    const res = validateMove(prev, next, 5, PARAMS, alwaysWalkable);
    expect(res.ok).toBe(true);
  });

  test("โกงจริง (delta 1.0 tile ใน elapsed 5ms) → ยัง reject (floor สูงไม่เปิดช่อง speed hack)", () => {
    const prev = { tx: 5, ty: 5 };
    const next = { tx: 6, ty: 5 }; // 1.0 tile > allowance@floor 0.54, < teleport 3 → speed
    const res = validateMove(prev, next, 5, PARAMS, alwaysWalkable);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("speed");
  });
});

describe("validateMove — jitter ในระดับ tolerance ไม่ false positive", () => {
  test("เดินสม่ำเสมอหลาย step ที่ speed จริง + jitter เล็ก → ผ่านทุก step", () => {
    // speed 4, ส่ง 12Hz → ~0.33 tile/step; jitter ±0.1 ยังใต้ allowance 0.5
    let prev = { tx: 2, ty: 2 };
    const steps = [0.33, 0.42, 0.25, 0.38, 0.3];
    for (const d of steps) {
      const next = { tx: prev.tx + d, ty: prev.ty };
      const res = validateMove(prev, next, 83, PARAMS, alwaysWalkable);
      expect(res.ok).toBe(true);
      prev = next;
    }
  });
});
