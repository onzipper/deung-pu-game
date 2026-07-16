import { describe, expect, test } from "vitest";
import { createInMemoryInventoryRepository } from "@/server/inventory/memory-repository";
import {
  exchangeFragments,
  type FragmentExchangeDeps,
  type FragmentExchangeRules,
} from "@/server/inventory/fragment-exchange-service";
import { DEFAULT_ITEM_CATALOG } from "@/server/inventory/item-catalog";
import { VersionConflictError, type ItemInstanceRecord } from "@/server/inventory/repository";
import { DEFAULT_REINFORCEMENT_CONFIG } from "../server/config";

// B4 — fragment exchange (เศษเสริมแกร่ง 5 → เสริมแกร่ง 1, Reinforcement §3.5). memory repo, no DB. never-downgrade
// zone (item conversion — atomic, no dupe, optimistic-version retry guard).

const CHAR = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ACC = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const FRAGMENT = DEFAULT_REINFORCEMENT_CONFIG.fragment.materialId; // upg_reinforcement_fragment
const MATERIAL = DEFAULT_REINFORCEMENT_CONFIG.materialId; // upg_reinforcement
const CAP = 40;

const RULES: FragmentExchangeRules = {
  fragmentMaterialId: FRAGMENT,
  reinforcementMaterialId: MATERIAL,
  inputCount: DEFAULT_REINFORCEMENT_CONFIG.fragment.exchangeInputCount, // 5
  outputCount: DEFAULT_REINFORCEMENT_CONFIG.fragment.exchangeOutputCount, // 1
};

function rec(over: Partial<ItemInstanceRecord> & { id: string; itemId: string }): ItemInstanceRecord {
  return {
    accountId: ACC,
    characterId: CHAR,
    location: "CHARACTER_INVENTORY",
    slot: 0,
    quantity: 1,
    enhancementLevel: 0,
    uniqueEquipGroup: null,
    version: 0,
    ...over,
  };
}

function deps(
  repo: ReturnType<typeof createInMemoryInventoryRepository>,
  over: Partial<FragmentExchangeDeps> = {},
): FragmentExchangeDeps {
  return { repo, catalog: DEFAULT_ITEM_CATALOG, rules: RULES, ...over };
}

const input = (over: Partial<Parameters<typeof exchangeFragments>[1]> = {}) => ({
  characterId: CHAR,
  accountId: ACC,
  instanceId: "frag",
  expectedVersion: 0,
  idempotencyKey: "idem-1",
  capacity: CAP,
  ...over,
});

describe("catalog ids (B4 §3.1/§3.5 — stackable materials)", () => {
  test("upg_reinforcement + upg_reinforcement_fragment exist in the catalog + stackable", () => {
    const r = DEFAULT_ITEM_CATALOG.get(MATERIAL);
    const f = DEFAULT_ITEM_CATALOG.get(FRAGMENT);
    expect(r, "upg_reinforcement missing from catalog").toBeTruthy();
    expect(f, "upg_reinforcement_fragment missing from catalog").toBeTruthy();
    expect(r!.stackable).toBe(true);
    expect(f!.stackable).toBe(true);
    expect(r!.kind).toBe("material");
    expect(f!.kind).toBe("material");
  });
});

describe("exchangeFragments — 5 → 1 (§3.5)", () => {
  test("happy: spends exactly 5, grants 1, destroys the depleted stack", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "frag", itemId: FRAGMENT, quantity: 5, slot: 0, version: 0 }));

    const r = await exchangeFragments(deps(repo), input());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.consumed).toBe(5);
    expect(r.grantedReinforcement).toBe(1);
    // fragment stack depleted → leaves the bag (tombstone)
    expect(repo.get("frag")).toMatchObject({ quantity: 0, location: "DESTROYED", slot: null });
    // one upg_reinforcement now in the bag (qty 1)
    const bag = await repo.listCharacterItems(CHAR);
    const reinforcement = bag.filter((i) => i.itemId === MATERIAL);
    expect(reinforcement).toHaveLength(1);
    expect(reinforcement[0].quantity).toBe(1);
    // snapshot no longer shows the fragment stack
    expect(r.snapshot.bag.some((i) => i.instanceId === "frag")).toBe(false);
  });

  test("partial: 7 fragments → 2 left, +1 reinforcement", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "frag", itemId: FRAGMENT, quantity: 7, slot: 0, version: 0 }));
    const r = await exchangeFragments(deps(repo), input());
    expect(r.ok).toBe(true);
    expect(repo.get("frag")).toMatchObject({ quantity: 2, location: "CHARACTER_INVENTORY", version: 1 });
  });

  test("merges into an existing reinforcement stack (quantity+1)", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "frag", itemId: FRAGMENT, quantity: 5, slot: 0, version: 0 }));
    repo.seed(rec({ id: "reinf", itemId: MATERIAL, quantity: 3, slot: 1, version: 0 }));
    const r = await exchangeFragments(deps(repo), input());
    expect(r.ok).toBe(true);
    expect(repo.get("reinf")).toMatchObject({ quantity: 4 });
    // still only one reinforcement stack (merged, no new instance)
    const bag = await repo.listCharacterItems(CHAR);
    expect(bag.filter((i) => i.itemId === MATERIAL)).toHaveLength(1);
  });

  test("insufficient (< 5) → NOT_ENOUGH_FRAGMENTS, nothing consumed", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "frag", itemId: FRAGMENT, quantity: 4, slot: 0, version: 0 }));
    const r = await exchangeFragments(deps(repo), input());
    expect(r).toEqual({ ok: false, reason: "NOT_ENOUGH_FRAGMENTS" });
    expect(repo.get("frag")).toMatchObject({ quantity: 4, version: 0 });
  });

  test("wrong-item target → NOT_ENOUGH_FRAGMENTS (never spends a non-fragment stack)", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "frag", itemId: "mat_slime_gel", quantity: 9, slot: 0, version: 0 }));
    const r = await exchangeFragments(deps(repo), input());
    expect(r).toEqual({ ok: false, reason: "NOT_ENOUGH_FRAGMENTS" });
    expect(repo.get("frag")).toMatchObject({ quantity: 9 });
  });

  test("stale expectedVersion → TRANSACTION_CONFLICT (concurrent-version conflict)", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "frag", itemId: FRAGMENT, quantity: 5, slot: 0, version: 0 }));
    repo.bumpVersion("frag"); // concurrent mutation → version 1
    const r = await exchangeFragments(deps(repo), input({ expectedVersion: 0 }));
    expect(r).toEqual({ ok: false, reason: "TRANSACTION_CONFLICT" });
    expect(repo.get("frag")).toMatchObject({ quantity: 5, version: 1 }); // untouched
  });

  test("idempotent under retry — a replay with the stale version never exchanges twice", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "frag", itemId: FRAGMENT, quantity: 7, slot: 0, version: 0 }));
    const first = await exchangeFragments(deps(repo), input({ expectedVersion: 0 }));
    expect(first.ok).toBe(true);
    expect(repo.get("frag")).toMatchObject({ quantity: 2, version: 1 });

    // network retry with the original (now stale) version → rejected, no second 5→1.
    const replay = await exchangeFragments(deps(repo), input({ expectedVersion: 0 }));
    expect(replay).toEqual({ ok: false, reason: "TRANSACTION_CONFLICT" });
    expect(repo.get("frag")).toMatchObject({ quantity: 2 }); // still 2, not −5 again
    const bag = await repo.listCharacterItems(CHAR);
    expect(bag.filter((i) => i.itemId === MATERIAL).reduce((s, i) => s + i.quantity, 0)).toBe(1); // exactly one granted
  });

  test("bag full + fragment stack stays (qty > 5) → INVENTORY_FULL, nothing consumed", async () => {
    const repo = createInMemoryInventoryRepository();
    // capacity 2: slot0 = fragment qty 7 (won't deplete), slot1 = unrelated → no room for the new reinforcement.
    repo.seed(rec({ id: "frag", itemId: FRAGMENT, quantity: 7, slot: 0, version: 0 }));
    repo.seed(rec({ id: "other", itemId: "eq_head_cloth_band", quantity: 1, slot: 1, version: 0 }));
    const r = await exchangeFragments(deps(repo), input({ capacity: 2 }));
    expect(r).toEqual({ ok: false, reason: "INVENTORY_FULL" });
    expect(repo.get("frag")).toMatchObject({ quantity: 7, version: 0 }); // nothing spent (all-or-nothing)
  });

  test("bag full but the depleted fragment frees its own slot → applied", async () => {
    const repo = createInMemoryInventoryRepository();
    // capacity 1: only the fragment stack. qty 5 → depletes → its slot frees → reinforcement lands there.
    repo.seed(rec({ id: "frag", itemId: FRAGMENT, quantity: 5, slot: 0, version: 0 }));
    const r = await exchangeFragments(deps(repo), input({ capacity: 1 }));
    expect(r.ok).toBe(true);
    const bag = await repo.listCharacterItems(CHAR);
    expect(bag.filter((i) => i.itemId === MATERIAL)).toHaveLength(1);
  });

  test("maps a repository VersionConflictError (lost race) to TRANSACTION_CONFLICT", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "frag", itemId: FRAGMENT, quantity: 5, slot: 0, version: 0 }));
    const racing = deps(repo, {
      repo: { ...repo, commitFragmentExchange: () => Promise.reject(new VersionConflictError()) },
    });
    const r = await exchangeFragments(racing, input());
    expect(r).toEqual({ ok: false, reason: "TRANSACTION_CONFLICT" });
  });
});
