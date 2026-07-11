import { describe, expect, test } from "vitest";
import {
  addToAggregate,
  createDamageAggregateState,
  tickDamageAggregate,
} from "@/game/combat/damage-aggregate";

describe("damage aggregate window (pure, P1-06, GS §17.10)", () => {
  test("hit เดียวใน bucket ใหม่ + tick ก่อนครบ window → ไม่ flush", () => {
    const state = createDamageAggregateState();
    addToAggregate(state, "mob:1", { tx: 1, ty: 2 }, 10, false);
    const flushes = tickDamageAggregate(state, 200, 500);
    expect(flushes).toHaveLength(0);
  });

  test("tick สะสมจนครบ windowMs → flush ยอดรวม + hitCount + tile ล่าสุด", () => {
    const state = createDamageAggregateState();
    addToAggregate(state, "mob:1", { tx: 1, ty: 2 }, 10, false);
    addToAggregate(state, "mob:1", { tx: 1.5, ty: 2.5 }, 15, false);
    addToAggregate(state, "mob:1", { tx: 2, ty: 3 }, 20, true);

    let flushes = tickDamageAggregate(state, 300, 500);
    expect(flushes).toHaveLength(0); // ยังไม่ครบ 500

    flushes = tickDamageAggregate(state, 250, 500); // รวม 550 > 500
    expect(flushes).toHaveLength(1);
    expect(flushes[0]).toEqual({
      key: "mob:1",
      totalAmount: 45,
      hitCount: 3,
      anyCrit: true,
      tile: { tx: 2, ty: 3 },
    });
  });

  test("flush แล้ว bucket ถูกลบ — hit ใหม่หลัง flush เริ่ม window ใหม่", () => {
    const state = createDamageAggregateState();
    addToAggregate(state, "mob:1", { tx: 0, ty: 0 }, 5, false);
    tickDamageAggregate(state, 500, 500); // flush รอบแรก
    expect(state.buckets.size).toBe(0);

    addToAggregate(state, "mob:1", { tx: 0, ty: 0 }, 7, false);
    const flushesEarly = tickDamageAggregate(state, 100, 500);
    expect(flushesEarly).toHaveLength(0); // window ใหม่ยังไม่ครบ
    const flushesLater = tickDamageAggregate(state, 400, 500);
    expect(flushesLater).toEqual([
      { key: "mob:1", totalAmount: 7, hitCount: 1, anyCrit: false, tile: { tx: 0, ty: 0 } },
    ]);
  });

  test("หลาย bucket (key ต่างกัน) เป็นอิสระต่อกัน", () => {
    const state = createDamageAggregateState();
    addToAggregate(state, "mob:a", { tx: 0, ty: 0 }, 10, false);
    addToAggregate(state, "mob:b", { tx: 5, ty: 5 }, 20, true);

    const flushes = tickDamageAggregate(state, 500, 500);
    expect(flushes).toHaveLength(2);
    const byKey = Object.fromEntries(flushes.map((f) => [f.key, f]));
    expect(byKey["mob:a"].totalAmount).toBe(10);
    expect(byKey["mob:a"].anyCrit).toBe(false);
    expect(byKey["mob:b"].totalAmount).toBe(20);
    expect(byKey["mob:b"].anyCrit).toBe(true);
  });

  test("anyCrit = OR ของทุก hit ใน bucket (แม้ hit แรกไม่ crit)", () => {
    const state = createDamageAggregateState();
    addToAggregate(state, "mob:1", { tx: 0, ty: 0 }, 10, false);
    addToAggregate(state, "mob:1", { tx: 0, ty: 0 }, 10, true);
    addToAggregate(state, "mob:1", { tx: 0, ty: 0 }, 10, false);
    const flushes = tickDamageAggregate(state, 500, 500);
    expect(flushes[0].anyCrit).toBe(true);
  });
});
