import { describe, expect, test } from "vitest";
import { createInMemoryInventoryRepository } from "../src/server/inventory/memory-repository";
import { DEFAULT_ITEM_CATALOG } from "../src/server/inventory/item-catalog";
import type { ItemInstanceRecord } from "../src/server/inventory/repository";
import {
  depositToStorage,
  withdrawFromStorage,
  type StorageServiceDeps,
} from "../src/server/inventory/storage-service";

// P2-17 — storage move idempotency (Storage §22 "Idempotency required"). A replay carrying the same
// idempotency key must be a no-op that reports the prior success — never a double move (never-downgrade zone).

type Repo = ReturnType<typeof createInMemoryInventoryRepository>;

function deps(repo: Repo): StorageServiceDeps {
  return { repo, catalog: DEFAULT_ITEM_CATALOG, capacity: 200, fill: { warnPercent: 80, alertPercent: 90 } };
}

const bagItem: ItemInstanceRecord = {
  id: "i1",
  accountId: "acc1",
  characterId: "char1",
  itemId: "mat_slime_gel",
  location: "CHARACTER_INVENTORY",
  slot: 0,
  quantity: 4,
  enhancementLevel: 0,
  uniqueEquipGroup: null,
  version: 0,
};

describe("deposit idempotency", () => {
  test("replaying the same key does NOT move again — one item in storage, unchanged version", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(bagItem);

    const first = await depositToStorage(deps(repo), {
      accountId: "acc1",
      characterId: "char1",
      instanceId: "i1",
      expectedVersion: 0,
      idempotencyKey: "dup-key",
    });
    expect(first.ok).toBe(true);
    expect(repo.get("i1")!.version).toBe(1);

    // exact replay (same key + the now-stale expectedVersion 0) → success, no second move.
    const replay = await depositToStorage(deps(repo), {
      accountId: "acc1",
      characterId: "char1",
      instanceId: "i1",
      expectedVersion: 0,
      idempotencyKey: "dup-key",
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.storage.used).toBe(1); // still exactly one item

    const stored = await repo.listAccountStorage("acc1");
    expect(stored).toHaveLength(1);
    expect(repo.get("i1")!.version).toBe(1); // never bumped a second time
  });

  test("a fresh key on an already-moved item does not double-move (item no longer in bag → ITEM_CHANGED)", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(bagItem);
    await depositToStorage(deps(repo), {
      accountId: "acc1",
      characterId: "char1",
      instanceId: "i1",
      expectedVersion: 0,
      idempotencyKey: "key-a",
    });
    const second = await depositToStorage(deps(repo), {
      accountId: "acc1",
      characterId: "char1",
      instanceId: "i1",
      expectedVersion: 0,
      idempotencyKey: "key-b",
    });
    expect(second).toEqual({ ok: false, reason: "ITEM_CHANGED" });
    expect(await repo.listAccountStorage("acc1")).toHaveLength(1);
  });
});

describe("withdraw idempotency", () => {
  test("replaying a withdraw key is a no-op success", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed({ ...bagItem, location: "ACCOUNT_STORAGE", characterId: null, slot: 0 });

    const first = await withdrawFromStorage(deps(repo), {
      accountId: "acc1",
      characterId: "char2",
      instanceId: "i1",
      expectedVersion: 0,
      bagCapacity: 40,
      idempotencyKey: "w-dup",
    });
    expect(first.ok).toBe(true);
    expect(repo.get("i1")!.location).toBe("CHARACTER_INVENTORY");
    const versionAfter = repo.get("i1")!.version;

    const replay = await withdrawFromStorage(deps(repo), {
      accountId: "acc1",
      characterId: "char2",
      instanceId: "i1",
      expectedVersion: 0,
      bagCapacity: 40,
      idempotencyKey: "w-dup",
    });
    expect(replay.ok).toBe(true);
    expect(repo.get("i1")!.version).toBe(versionAfter); // not moved / bumped again
  });
});
