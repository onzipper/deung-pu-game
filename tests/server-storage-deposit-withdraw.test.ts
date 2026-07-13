import { describe, expect, test } from "vitest";
import { createInMemoryInventoryRepository } from "../src/server/inventory/memory-repository";
import {
  buildItemCatalog,
  DEFAULT_ITEM_CATALOG,
  type ItemDefinition,
} from "../src/server/inventory/item-catalog";
import type { ItemInstanceRecord } from "../src/server/inventory/repository";
import {
  depositToStorage,
  withdrawFromStorage,
  fillStateOf,
  type StorageServiceDeps,
} from "../src/server/inventory/storage-service";

// P2-17 — personal storage deposit/withdraw (Storage §13/§14/§22). never-downgrade zone (items are
// money-like). tested via the in-memory repo (no DB / no .env).

type Repo = ReturnType<typeof createInMemoryInventoryRepository>;

function seedBag(
  repo: Repo,
  over: Partial<ItemInstanceRecord> & { id: string; itemId: string; characterId: string },
): void {
  repo.seed({
    accountId: "acc1",
    location: "CHARACTER_INVENTORY",
    slot: 0,
    quantity: 1,
    enhancementLevel: 0,
    uniqueEquipGroup: null,
    version: 0,
    ...over,
  });
}

function deps(repo: Repo, capacity = 200): StorageServiceDeps {
  return { repo, catalog: DEFAULT_ITEM_CATALOG, capacity, fill: { warnPercent: 80, alertPercent: 90 } };
}

describe("deposit → account storage (§13)", () => {
  test("deposit moves the instance out of the bag into ACCOUNT_STORAGE (characterId cleared, version bumped)", async () => {
    const repo = createInMemoryInventoryRepository();
    seedBag(repo, { id: "i1", itemId: "mat_slime_gel", characterId: "char1", quantity: 5, version: 0 });

    const r = await depositToStorage(deps(repo), {
      accountId: "acc1",
      characterId: "char1",
      instanceId: "i1",
      expectedVersion: 0,
      idempotencyKey: "d1",
    });

    expect(r.ok).toBe(true);
    const rec = repo.get("i1")!;
    expect(rec.location).toBe("ACCOUNT_STORAGE");
    expect(rec.characterId).toBeNull();
    expect(rec.version).toBe(1);
    if (r.ok) {
      expect(r.storage.used).toBe(1);
      expect(r.storage.items[0]).toMatchObject({ instanceId: "i1", itemId: "mat_slime_gel", quantity: 5 });
    }
    // it left the character's bag.
    expect(await repo.listCharacterItems("char1")).toHaveLength(0);
  });

  test("a different character on the same account sees + withdraws the same item (§10.1 shared)", async () => {
    const repo = createInMemoryInventoryRepository();
    seedBag(repo, { id: "i1", itemId: "mat_coarse_hide", characterId: "char1", quantity: 3 });
    await depositToStorage(deps(repo), {
      accountId: "acc1",
      characterId: "char1",
      instanceId: "i1",
      expectedVersion: 0,
      idempotencyKey: "d1",
    });

    // char2 (same account) sees it in storage.
    const stored = await repo.listAccountStorage("acc1");
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("i1");

    const w = await withdrawFromStorage(deps(repo), {
      accountId: "acc1",
      characterId: "char2",
      instanceId: "i1",
      expectedVersion: stored[0].version,
      bagCapacity: 40,
      idempotencyKey: "w1",
    });
    expect(w.ok).toBe(true);
    const rec = repo.get("i1")!;
    expect(rec.location).toBe("CHARACTER_INVENTORY");
    expect(rec.characterId).toBe("char2");
    if (w.ok) expect(w.storage.used).toBe(0);
  });
});

describe("deposit rejects", () => {
  test("storage full → STORAGE_FULL, item stays in the bag (no loss)", async () => {
    const repo = createInMemoryInventoryRepository();
    // one item already occupying the (capacity 1) storage.
    repo.seed({
      id: "s0",
      accountId: "acc1",
      characterId: null,
      itemId: "mat_slime_gel",
      location: "ACCOUNT_STORAGE",
      slot: 0,
      quantity: 1,
      enhancementLevel: 0,
      uniqueEquipGroup: null,
      version: 0,
    });
    seedBag(repo, { id: "i1", itemId: "mat_coarse_hide", characterId: "char1" });

    const r = await depositToStorage(deps(repo, 1), {
      accountId: "acc1",
      characterId: "char1",
      instanceId: "i1",
      expectedVersion: 0,
      idempotencyKey: "d1",
    });
    expect(r).toEqual({ ok: false, reason: "STORAGE_FULL" });
    expect(repo.get("i1")!.location).toBe("CHARACTER_INVENTORY"); // still in the bag
  });

  test("CHARACTER_BOUND / BLOCKED type → ITEM_BOUND (§12.4)", async () => {
    const repo = createInMemoryInventoryRepository();
    // an injected policy type — no Map 1 item is Category C, so the BLOCKED path is proven with a synthetic def.
    const boundDef: ItemDefinition = {
      id: "quest_soul_key",
      kind: "material",
      rarity: "common",
      reqLevel: 1,
      stackable: false,
      sharing: { bindType: "CHARACTER_BOUND", storagePolicy: "BLOCKED", tradePolicy: "NONE" },
    };
    const catalog = buildItemCatalog([boundDef]);
    seedBag(repo, { id: "i1", itemId: "quest_soul_key", characterId: "char1" });

    const r = await depositToStorage(
      { repo, catalog, capacity: 200, fill: { warnPercent: 80, alertPercent: 90 } },
      { accountId: "acc1", characterId: "char1", instanceId: "i1", expectedVersion: 0, idempotencyKey: "d1" },
    );
    expect(r).toEqual({ ok: false, reason: "ITEM_BOUND" });
    expect(repo.get("i1")!.location).toBe("CHARACTER_INVENTORY");
  });

  test("stale version → ITEM_CHANGED", async () => {
    const repo = createInMemoryInventoryRepository();
    seedBag(repo, { id: "i1", itemId: "mat_slime_gel", characterId: "char1", version: 2 });
    const r = await depositToStorage(deps(repo), {
      accountId: "acc1",
      characterId: "char1",
      instanceId: "i1",
      expectedVersion: 0,
      idempotencyKey: "d1",
    });
    expect(r).toEqual({ ok: false, reason: "ITEM_CHANGED" });
  });
});

describe("withdraw rejects", () => {
  test("receiving bag full → INVENTORY_FULL, item stays in storage (no loss)", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed({
      id: "s1",
      accountId: "acc1",
      characterId: null,
      itemId: "mat_slime_gel",
      location: "ACCOUNT_STORAGE",
      slot: 0,
      quantity: 1,
      enhancementLevel: 0,
      uniqueEquipGroup: null,
      version: 0,
    });
    // char2's bag (capacity 1) is already full.
    seedBag(repo, { id: "b0", itemId: "mat_coarse_hide", characterId: "char2", slot: 0 });

    const w = await withdrawFromStorage(deps(repo), {
      accountId: "acc1",
      characterId: "char2",
      instanceId: "s1",
      expectedVersion: 0,
      bagCapacity: 1,
      idempotencyKey: "w1",
    });
    expect(w).toEqual({ ok: false, reason: "INVENTORY_FULL" });
    expect(repo.get("s1")!.location).toBe("ACCOUNT_STORAGE"); // still in storage
  });
});

describe("fill state (§15.1)", () => {
  const fill = { warnPercent: 80, alertPercent: 90 };
  test("thresholds: normal <80 · warn ≥80 · alert ≥90 · full at capacity", () => {
    expect(fillStateOf(0, 200, fill)).toBe("normal");
    expect(fillStateOf(159, 200, fill)).toBe("normal"); // 79.5%
    expect(fillStateOf(160, 200, fill)).toBe("warn"); // 80%
    expect(fillStateOf(180, 200, fill)).toBe("alert"); // 90%
    expect(fillStateOf(200, 200, fill)).toBe("full"); // 100%
  });
});
