import { describe, expect, test } from "vitest";
import {
  advanceSendTimer,
  coerceAnim,
  coerceDirection,
  snapshotChanged,
  toMoveMessage,
} from "@/engine/net/sync";
import type { PlayerSnapshot } from "@/shared/net-protocol";
import {
  DEFAULT_CHANNEL_ID,
  DEFAULT_MAP_ID,
  MAP_ROOM_NAME,
} from "@/shared/net-protocol";

const snap = (over: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  tx: 5,
  ty: 5,
  direction: "S",
  anim: "idle",
  ...over,
});

describe("net sync — coerce (defensive กับ state จาก network)", () => {
  test("coerceDirection คง 8 ทิศที่ valid", () => {
    for (const d of ["S", "SW", "W", "NW", "N", "NE", "E", "SE"] as const) {
      expect(coerceDirection(d)).toBe(d);
    }
  });

  test("coerceDirection fallback 'S' เมื่อค่าเพี้ยน", () => {
    expect(coerceDirection("xx")).toBe("S");
    expect(coerceDirection("")).toBe("S");
  });

  test("coerceAnim: walk/idle เท่านั้น (อื่น = idle)", () => {
    expect(coerceAnim("walk")).toBe("walk");
    expect(coerceAnim("idle")).toBe("idle");
    expect(coerceAnim("attack")).toBe("idle");
  });
});

describe("net sync — snapshotChanged (กัน spam idle frame)", () => {
  test("prev = null → ส่งเสมอ (ครั้งแรก)", () => {
    expect(snapshotChanged(null, snap(), 0.02)).toBe(true);
  });

  test("ขยับเกิน epsilon → ส่ง", () => {
    expect(snapshotChanged(snap(), snap({ tx: 5.03 }), 0.02)).toBe(true);
    expect(snapshotChanged(snap(), snap({ ty: 4.9 }), 0.02)).toBe(true);
  });

  test("ขยับต่ำกว่า epsilon → ไม่ส่ง", () => {
    expect(snapshotChanged(snap(), snap({ tx: 5.01, ty: 5.01 }), 0.02)).toBe(
      false,
    );
    expect(snapshotChanged(snap(), snap(), 0.02)).toBe(false);
  });

  test("ทิศเปลี่ยน หรือ anim เปลี่ยน → ส่ง แม้ตำแหน่งเท่าเดิม", () => {
    expect(snapshotChanged(snap(), snap({ direction: "N" }), 0.02)).toBe(true);
    expect(snapshotChanged(snap(), snap({ anim: "walk" }), 0.02)).toBe(true);
  });
});

describe("net sync — advanceSendTimer (throttle accumulator)", () => {
  test("ยังไม่ครบ interval → ไม่ fire, สะสม dt", () => {
    const r = advanceSendTimer(0, 30, 1000 / 12); // interval ≈ 83.3ms
    expect(r.fire).toBe(false);
    expect(r.remainderMs).toBeCloseTo(30);
  });

  test("ครบ interval → fire + carry เศษ", () => {
    const interval = 1000 / 12;
    const r = advanceSendTimer(60, 30, interval); // 90 ≥ 83.3
    expect(r.fire).toBe(true);
    expect(r.remainderMs).toBeCloseTo(90 - interval);
  });

  test("dt กระโดดใหญ่ (สลับ tab) → fire ครั้งเดียว + clamp เศษ ≤ interval (กัน spiral)", () => {
    const interval = 1000 / 12;
    const r = advanceSendTimer(0, 5000, interval);
    expect(r.fire).toBe(true);
    expect(r.remainderMs).toBeLessThanOrEqual(interval);
  });
});

describe("net sync — toMoveMessage + protocol constants", () => {
  test("toMoveMessage ประกอบ payload ตรง field", () => {
    expect(toMoveMessage(1.5, 2.5, "NW", "walk")).toEqual({
      tx: 1.5,
      ty: 2.5,
      direction: "NW",
      anim: "walk",
    });
  });

  test("shared constants ตรง contract P0 (§4.6/§4.7)", () => {
    expect(MAP_ROOM_NAME).toBe("map_room");
    expect(DEFAULT_MAP_ID).toBe("p0-test-field");
    expect(DEFAULT_CHANNEL_ID).toBe("CH.1");
  });
});
