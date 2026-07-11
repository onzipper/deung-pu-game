import { describe, expect, test } from "vitest";
import {
  decideReconnect,
  reconnectBackoffMs,
  resolveSpawnPosition,
  shouldRetryReconnect,
  type ReconnectVec2,
} from "@/shared/reconnect";
import { DEFAULT_RECONNECT_CONFIG } from "@/engine/config";

// pure reconnect logic (P1-07, GS §59.1 · TA §6) — decision table, spawn resolver, backoff.
const RETRY = DEFAULT_RECONNECT_CONFIG.clientRetry;

describe("decideReconnect — §59.1 decision table", () => {
  test("within grace + room เปิด + ตำแหน่ง valid → resume", () => {
    expect(
      decideReconnect({ withinGrace: true, roomOpen: true, positionValid: true }),
    ).toBe("resume");
  });

  test("เกิน grace → safe camp", () => {
    expect(
      decideReconnect({ withinGrace: false, roomOpen: true, positionValid: true }),
    ).toBe("safe_camp");
  });

  test("room ปิด → safe camp", () => {
    expect(
      decideReconnect({ withinGrace: true, roomOpen: false, positionValid: true }),
    ).toBe("safe_camp");
  });

  test("ตำแหน่งเดิม invalid → safe camp", () => {
    expect(
      decideReconnect({ withinGrace: true, roomOpen: true, positionValid: false }),
    ).toBe("safe_camp");
  });
});

describe("resolveSpawnPosition — §59.1 ตำแหน่ง invalid → safe camp", () => {
  const safeCamp: ReconnectVec2 = { tx: 12.5, ty: 12.5 };
  // เดินได้ทุกที่ ยกเว้น (3,3) — จำลอง collision จุดเดียว
  const walkable = (tx: number, ty: number): boolean =>
    !(Math.floor(tx) === 3 && Math.floor(ty) === 3);

  test("requested walkable → ใช้ requested (ไม่แตะ safe camp)", () => {
    const r = resolveSpawnPosition({ tx: 8, ty: 8 }, safeCamp, walkable);
    expect(r.usedSafeCamp).toBe(false);
    expect(r.pos).toEqual({ tx: 8, ty: 8 });
  });

  test("requested ทับ collision → snap safe camp", () => {
    const r = resolveSpawnPosition({ tx: 3.2, ty: 3.7 }, safeCamp, walkable);
    expect(r.usedSafeCamp).toBe(true);
    expect(r.pos).toEqual(safeCamp);
  });

  test("requested ไม่ finite (NaN/Infinity) → safe camp (ไม่เรียก walkable ด้วยค่าเพี้ยน)", () => {
    for (const bad of [{ tx: NaN, ty: 5 }, { tx: 5, ty: Infinity }]) {
      const r = resolveSpawnPosition(bad, safeCamp, walkable);
      expect(r.usedSafeCamp).toBe(true);
      expect(r.pos).toEqual(safeCamp);
    }
  });

  test("คืน pos เป็น copy (ไม่แชร์ reference กับ requested/safeCamp)", () => {
    const req = { tx: 8, ty: 8 };
    const r = resolveSpawnPosition(req, safeCamp, walkable);
    expect(r.pos).not.toBe(req);
    const r2 = resolveSpawnPosition({ tx: 3, ty: 3 }, safeCamp, walkable);
    expect(r2.pos).not.toBe(safeCamp);
  });
});

describe("reconnectBackoffMs — exponential backoff + cap", () => {
  test("ลำดับ backoff จาก config default (0.5→1→2→4→8→cap 8s)", () => {
    // base 500, factor 2, maxDelay 8000
    expect(reconnectBackoffMs(0, RETRY)).toBe(500);
    expect(reconnectBackoffMs(1, RETRY)).toBe(1000);
    expect(reconnectBackoffMs(2, RETRY)).toBe(2000);
    expect(reconnectBackoffMs(3, RETRY)).toBe(4000);
    expect(reconnectBackoffMs(4, RETRY)).toBe(8000);
    expect(reconnectBackoffMs(5, RETRY)).toBe(8000); // cap
  });

  test("cumulative backoff ครอบ 30s grace (retry ทันในก่อนหมด grace)", () => {
    let total = 0;
    for (let a = 0; a < RETRY.maxAttempts; a++) total += reconnectBackoffMs(a, RETRY);
    expect(total).toBeLessThan(DEFAULT_RECONNECT_CONFIG.graceSeconds * 1000);
  });

  test("attempt ติดลบ/ไม่ integer → clamp/floor (defensive)", () => {
    expect(reconnectBackoffMs(-3, RETRY)).toBe(500); // clamp เป็น attempt 0
    expect(reconnectBackoffMs(2.9, RETRY)).toBe(2000); // floor → attempt 2
  });
});

describe("shouldRetryReconnect", () => {
  test("attempt < maxAttempts → retry ต่อ; ถึง maxAttempts → หยุด", () => {
    expect(shouldRetryReconnect(0, RETRY)).toBe(true);
    expect(shouldRetryReconnect(RETRY.maxAttempts - 1, RETRY)).toBe(true);
    expect(shouldRetryReconnect(RETRY.maxAttempts, RETRY)).toBe(false);
    expect(shouldRetryReconnect(RETRY.maxAttempts + 5, RETRY)).toBe(false);
  });
});
