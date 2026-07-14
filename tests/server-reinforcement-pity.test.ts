import { describe, expect, test } from "vitest";
import {
  evaluateFragmentDrop,
  evaluateReinforcementPity,
  grantFieldBossReinforcement,
  reinforcementDropChancePercent,
  type FieldBossReinforcementDeps,
  type PityStore,
  type ReinforcementPityConfig,
} from "@/server/economy/reinforcement-pity";
import type { ItemMeta } from "@/server/economy/kill-reward";
import { DEFAULT_REINFORCEMENT_CONFIG } from "../server/config";

// B4 — Field Boss reinforcement pity ladder (§4.2) + fragment (§3.5). Pure module, no DB. never-downgrade zone
// (no double-grant, per-account isolation). Values are the LOCKED config; the ladder math is proven against the
// §4.2 example (รอบ 9 = 12%, รอบ 10 = 16%, รอบ 15 = การันตี).

const PITY: ReinforcementPityConfig = {
  baseDropChancePercent: 8,
  startIncreasingAfterClears: 8,
  increasePerClearPercent: 4,
  guaranteedAtClear: 15,
};

/** scripted rng — returns the queued values in order (0 after the queue drains). */
function seq(...vals: number[]): () => number {
  let i = 0;
  return () => vals[i++] ?? 0;
}

const stackMeta = (): ItemMeta => ({ stackable: true, uniqueEquipGroup: null });
const MATERIAL = "upg_reinforcement";
const FRAGMENT = "upg_reinforcement_fragment";

/** Map-backed pity store (mirrors the Prisma reset/increment semantics). */
function fakeStore(initial: Record<string, number> = {}): { map: Map<string, number>; store: PityStore } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    store: {
      async getPityCount(a, b) {
        return map.get(`${a}:${b}`) ?? 0;
      },
      async applyClearResult({ accountId, bossId, dropped }) {
        const k = `${accountId}:${bossId}`;
        map.set(k, dropped ? 0 : (map.get(k) ?? 0) + 1);
      },
    },
  };
}

function fakeInventory(mode: "ok" | "overflow" = "ok") {
  const granted: { itemId: string; quantity: number }[] = [];
  return {
    granted,
    seam: {
      async grantItems(input: { grants: readonly { itemId: string; quantity: number }[] }) {
        const rows = input.grants.map((g) => ({ itemId: g.itemId, quantity: g.quantity }));
        if (mode === "overflow") return { granted: [], overflow: rows };
        for (const r of rows) granted.push(r);
        return { granted: rows, overflow: [] };
      },
    },
  };
}

function fakeDelivery() {
  const items: { itemId: string; quantity: number }[] = [];
  return { items, seam: { async createEntry(input: { items: readonly { itemId: string; quantity: number }[] }) { items.push(...input.items); } } };
}

function deps(over: Partial<FieldBossReinforcementDeps> = {}): FieldBossReinforcementDeps {
  return {
    pity: PITY,
    reinforcementItemId: MATERIAL,
    fragmentItemId: FRAGMENT,
    fragmentChancePercent: 10.7,
    fragmentQuantity: 1,
    reinforcementQuantity: 1,
    itemMeta: stackMeta,
    store: fakeStore().store,
    inventory: fakeInventory().seam,
    delivery: fakeDelivery().seam,
    rng: seq(0.99, 0.99), // default: no drop, no fragment
    capacity: 40,
    ...over,
  };
}

const ctx = (over: Partial<{ accountId: string; characterId: string; bossId: string }> = {}) => ({
  accountId: "a1",
  characterId: "c1",
  bossId: "boss_map1_boiling_boar",
  ...over,
});

// ── §4.2 ladder math ─────────────────────────────────────────────────────────
describe("reinforcementDropChancePercent (§4.2 ladder)", () => {
  test("clears 1–8 = base 8%", () => {
    for (let c = 1; c <= 8; c++) expect(reinforcementDropChancePercent(c, PITY)).toBe(8);
  });

  test("รอบ 9 = 12%, รอบ 10 = 16%, รอบ 11 = 20%, รอบ 14 = 32% (§4.2 example)", () => {
    expect(reinforcementDropChancePercent(9, PITY)).toBe(12);
    expect(reinforcementDropChancePercent(10, PITY)).toBe(16);
    expect(reinforcementDropChancePercent(11, PITY)).toBe(20);
    expect(reinforcementDropChancePercent(14, PITY)).toBe(32);
  });

  test("รอบ 15 = การันตี (100%)", () => {
    expect(reinforcementDropChancePercent(15, PITY)).toBe(100);
    expect(reinforcementDropChancePercent(16, PITY)).toBe(100);
  });

  test("config values ตรง DEFAULT (§4.2 verbatim)", () => {
    const b = DEFAULT_REINFORCEMENT_CONFIG.bossPity;
    expect({ ...PITY }).toEqual({
      baseDropChancePercent: b.baseDropChancePercent,
      startIncreasingAfterClears: b.startIncreasingAfterClears,
      increasePerClearPercent: b.increasePerClearPercent,
      guaranteedAtClear: b.guaranteedAtClear,
    });
  });
});

describe("evaluateReinforcementPity (§4.2)", () => {
  test("no drop → increment (pityCount 0 → clearNumber 1)", () => {
    const r = evaluateReinforcementPity(0, PITY, seq(0.9)); // 90 > 8 → miss
    expect(r).toMatchObject({ clearNumber: 1, effectiveChancePercent: 8, guaranteed: false, dropped: false, nextPityCount: 1 });
  });

  test("drop → reset (nextPityCount 0)", () => {
    const r = evaluateReinforcementPity(3, PITY, seq(0.02)); // 2 < 8 → hit
    expect(r).toMatchObject({ clearNumber: 4, dropped: true, nextPityCount: 0 });
  });

  test("guaranteed at clear 15 (pityCount 14) — rng NOT consumed", () => {
    const rng = seq(0.99); // would be a miss if consumed
    const r = evaluateReinforcementPity(14, PITY, rng);
    expect(r).toMatchObject({ clearNumber: 15, guaranteed: true, dropped: true, nextPityCount: 0 });
    expect(rng()).toBe(0.99); // still the first value → the guaranteed path skipped the draw
  });

  test("boosted chance at clear 9 (12%): 0.11 hits, 0.15 misses", () => {
    expect(evaluateReinforcementPity(8, PITY, seq(0.11)).dropped).toBe(true); // 11 < 12
    expect(evaluateReinforcementPity(8, PITY, seq(0.15)).dropped).toBe(false); // 15 > 12
  });
});

describe("evaluateFragmentDrop (§3.5 independent 10.7%)", () => {
  test("0.10 hits (10 < 10.7), 0.11 misses", () => {
    expect(evaluateFragmentDrop(10.7, seq(0.1))).toBe(true);
    expect(evaluateFragmentDrop(10.7, seq(0.11))).toBe(false);
  });
  test("0% chance never drops", () => {
    expect(evaluateFragmentDrop(0, seq(0))).toBe(false);
  });
});

// ── grantFieldBossReinforcement (orchestration) ──────────────────────────────
describe("grantFieldBossReinforcement — pity + grant + persist", () => {
  test("drop → grants reinforcement ×1 + resets pity to 0", async () => {
    const s = fakeStore({ "a1:boss_map1_boiling_boar": 5 });
    const inv = fakeInventory();
    const out = await grantFieldBossReinforcement(
      deps({ store: s.store, inventory: inv.seam, rng: seq(0.02, 0.99) }), // pity hit, fragment miss
      ctx(),
    );
    expect(out.reinforcementDropped).toBe(true);
    expect(out.clearNumber).toBe(6);
    expect(out.pityCount).toBe(0); // reset
    expect(s.map.get("a1:boss_map1_boiling_boar")).toBe(0);
    expect(inv.granted).toEqual([{ itemId: MATERIAL, quantity: 1 }]);
    expect(out.granted).toEqual([{ itemId: MATERIAL, quantity: 1 }]);
  });

  test("no drop → grants nothing + increments pity", async () => {
    const s = fakeStore({ "a1:boss_map1_boiling_boar": 3 });
    const inv = fakeInventory();
    const out = await grantFieldBossReinforcement(
      deps({ store: s.store, inventory: inv.seam, rng: seq(0.99, 0.99) }),
      ctx(),
    );
    expect(out.reinforcementDropped).toBe(false);
    expect(out.pityCount).toBe(4); // 3 → 4
    expect(s.map.get("a1:boss_map1_boiling_boar")).toBe(4);
    expect(inv.granted).toEqual([]);
  });

  test("guaranteed at clear 15 grants regardless of rng (pityCount 14)", async () => {
    const s = fakeStore({ "a1:boss_map1_boiling_boar": 14 });
    const inv = fakeInventory();
    const out = await grantFieldBossReinforcement(
      deps({ store: s.store, inventory: inv.seam, rng: seq(0.99, 0.99) }), // both would miss
      ctx(),
    );
    expect(out.reinforcementDropped).toBe(true);
    expect(out.pityCount).toBe(0);
    expect(inv.granted).toContainEqual({ itemId: MATERIAL, quantity: 1 });
  });

  test("fragment is an independent roll — one clear yields BOTH (does not touch pity)", async () => {
    const s = fakeStore({ "a1:boss_map1_boiling_boar": 2 });
    const inv = fakeInventory();
    const out = await grantFieldBossReinforcement(
      deps({ store: s.store, inventory: inv.seam, rng: seq(0.02, 0.05) }), // pity hit + fragment hit
      ctx(),
    );
    expect(out.reinforcementDropped).toBe(true);
    expect(out.fragmentDropped).toBe(true);
    expect(inv.granted).toEqual([
      { itemId: MATERIAL, quantity: 1 },
      { itemId: FRAGMENT, quantity: 1 },
    ]);
    expect(out.pityCount).toBe(0); // reset by the drop (fragment did not affect it)
  });

  test("fragment-only clear (no full drop) still increments pity", async () => {
    const s = fakeStore({ "a1:boss_map1_boiling_boar": 1 });
    const inv = fakeInventory();
    const out = await grantFieldBossReinforcement(
      deps({ store: s.store, inventory: inv.seam, rng: seq(0.99, 0.05) }), // pity miss + fragment hit
      ctx(),
    );
    expect(out.reinforcementDropped).toBe(false);
    expect(out.fragmentDropped).toBe(true);
    expect(inv.granted).toEqual([{ itemId: FRAGMENT, quantity: 1 }]);
    expect(out.pityCount).toBe(2); // 1 → 2 (fragment does not reset)
  });

  test("per-account isolation — two accounts keep independent pity", async () => {
    const s = fakeStore({ "a1:boss_map1_boiling_boar": 7 });
    // account a1: no drop → 8. account a2: fresh → 1.
    await grantFieldBossReinforcement(deps({ store: s.store, rng: seq(0.99, 0.99) }), ctx({ accountId: "a1" }));
    await grantFieldBossReinforcement(deps({ store: s.store, rng: seq(0.99, 0.99) }), ctx({ accountId: "a2" }));
    expect(s.map.get("a1:boss_map1_boiling_boar")).toBe(8);
    expect(s.map.get("a2:boss_map1_boiling_boar")).toBe(1);
  });

  test("bag full → routed to Delivery Box (§12.5 no-silent-loss), not overflow", async () => {
    const s = fakeStore({ "a1:boss_map1_boiling_boar": 20 }); // guaranteed
    const del = fakeDelivery();
    const out = await grantFieldBossReinforcement(
      deps({ store: s.store, inventory: fakeInventory("overflow").seam, delivery: del.seam, rng: seq(0.99, 0.99) }),
      ctx(),
    );
    expect(out.delivered).toContainEqual({ itemId: MATERIAL, quantity: 1 });
    expect(out.overflow).toEqual([]);
    expect(del.items).toContainEqual({ itemId: MATERIAL, quantity: 1 });
  });

  test("no inventory seam (no DB) → grants reported as overflow, pity still tracked", async () => {
    const s = fakeStore({ "a1:boss_map1_boiling_boar": 20 }); // guaranteed
    const out = await grantFieldBossReinforcement(
      deps({ store: s.store, inventory: null, delivery: null, rng: seq(0.99, 0.99) }),
      ctx(),
    );
    expect(out.overflow).toContainEqual({ itemId: MATERIAL, quantity: 1 });
    expect(out.delivered).toEqual([]);
    expect(s.map.get("a1:boss_map1_boiling_boar")).toBe(0); // guaranteed drop reset the counter
  });

  test("a full ladder run from 0 with no luck guarantees a drop exactly at clear 15", async () => {
    const s = fakeStore();
    const c = ctx();
    let drops = 0;
    for (let clear = 1; clear <= 15; clear++) {
      const out = await grantFieldBossReinforcement(
        deps({ store: s.store, inventory: fakeInventory().seam, rng: seq(0.999, 0.999) }), // always miss the chance roll
        c,
      );
      if (out.reinforcementDropped) drops++;
      expect(out.clearNumber).toBe(clear);
    }
    // clears 1–14 all missed (0.999 → never < any ladder chance ≤ 32%), clear 15 = guaranteed.
    expect(drops).toBe(1);
    expect(s.map.get("a1:boss_map1_boiling_boar")).toBe(0); // reset by the guaranteed drop
  });
});
