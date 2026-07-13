import { describe, it, expect } from "vitest";
import { createInMemoryInventoryRepository } from "@/server/inventory/memory-repository";
import { equipItem, unequipItem, moveItem } from "@/server/inventory/service";
import { aggregateEquipmentBonus } from "@/server/inventory/equipment-stats";
import { DEFAULT_ITEM_CATALOG } from "@/server/inventory/item-catalog";
import { VersionConflictError, type ItemInstanceRecord } from "@/server/inventory/repository";

// P2-07 — inventory/equipment service (server-authoritative mutation, TA §7/§8). memory repo, no DB.

const CHAR = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ACC = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CAP = 40;

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

describe("equipItem", () => {
  it("equips a bag item into its config slot, bumps version, and the gear then changes combat stats", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "i1", itemId: "eq_weapon_training_blade", slot: 3, version: 2 }));

    const r = await equipItem(repo, DEFAULT_ITEM_CATALOG, {
      characterId: CHAR,
      instanceId: "i1",
      expectedVersion: 2,
      capacity: CAP,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // sword left the bag → now worn in equipment slot 0 (eq_weapon_training_blade.equipSlotId)
    expect(r.snapshot.bag).toHaveLength(0);
    expect(r.snapshot.equipment).toHaveLength(1);
    expect(r.snapshot.equipment[0]).toMatchObject({
      instanceId: "i1",
      location: "CHARACTER_EQUIPMENT",
      slot: 0,
      version: 3, // optimistic lock bumped
    });
    // stat effect is real: aggregating the worn set yields the weapon's +8 attack (§7.2 training blade)
    expect(aggregateEquipmentBonus(r.snapshot.equipment, DEFAULT_ITEM_CATALOG).attack).toBe(8);
  });

  it("rejects equipping a non-equipment item (wrong type)", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "m1", itemId: "mat_slime_gel", slot: 0 }));
    const r = await equipItem(repo, DEFAULT_ITEM_CATALOG, {
      characterId: CHAR,
      instanceId: "m1",
      expectedVersion: 0,
      capacity: CAP,
    });
    expect(r).toEqual({ ok: false, reason: "not_equippable" });
  });

  it("rejects a stale intent when the version no longer matches (optimistic lock)", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "i1", itemId: "eq_weapon_training_blade", slot: 0, version: 0 }));
    repo.bumpVersion("i1"); // a concurrent mutation moved it to version 1

    const r = await equipItem(repo, DEFAULT_ITEM_CATALOG, {
      characterId: CHAR,
      instanceId: "i1",
      expectedVersion: 0, // client still thinks it's version 0
      capacity: CAP,
    });
    expect(r).toEqual({ ok: false, reason: "version_conflict" });
    // nothing applied — item stays in the bag at version 1
    expect(repo.get("i1")).toMatchObject({ location: "CHARACTER_INVENTORY", version: 1 });
  });

  it("swaps the worn item back into the vacated bag slot when the equip slot is occupied", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "old", itemId: "eq_weapon_training_blade", location: "CHARACTER_EQUIPMENT", slot: 0, version: 0 }));
    repo.seed(rec({ id: "new", itemId: "eq_weapon_training_blade", location: "CHARACTER_INVENTORY", slot: 7, version: 0 }));

    const r = await equipItem(repo, DEFAULT_ITEM_CATALOG, {
      characterId: CHAR,
      instanceId: "new",
      expectedVersion: 0,
      capacity: CAP,
    });
    expect(r.ok).toBe(true);
    // new is worn; old swapped into the slot new vacated (7); both versions bumped
    expect(repo.get("new")).toMatchObject({ location: "CHARACTER_EQUIPMENT", slot: 0, version: 1 });
    expect(repo.get("old")).toMatchObject({ location: "CHARACTER_INVENTORY", slot: 7, version: 1 });
  });

  it("rejects unique-group double-equip (§12.1)", async () => {
    const repo = createInMemoryInventoryRepository();
    // two different equip slots but same uniqueEquipGroup → only one may be worn
    repo.seed(rec({ id: "ring", itemId: "eq_talisman_blank", location: "CHARACTER_EQUIPMENT", slot: 4, uniqueEquipGroup: "g1", version: 0 }));
    repo.seed(rec({ id: "sword", itemId: "eq_weapon_training_blade", location: "CHARACTER_INVENTORY", slot: 0, uniqueEquipGroup: "g1", version: 0 }));

    const r = await equipItem(repo, DEFAULT_ITEM_CATALOG, {
      characterId: CHAR,
      instanceId: "sword",
      expectedVersion: 0,
      capacity: CAP,
    });
    expect(r).toEqual({ ok: false, reason: "unique_conflict" });
  });
});

describe("unequipItem", () => {
  it("moves a worn item into the first free bag slot", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "w", itemId: "eq_weapon_training_blade", location: "CHARACTER_EQUIPMENT", slot: 0, version: 1 }));
    repo.seed(rec({ id: "b0", itemId: "mat_slime_gel", slot: 0 })); // bag slot 0 taken → free = 1

    const r = await unequipItem(repo, DEFAULT_ITEM_CATALOG, {
      characterId: CHAR,
      instanceId: "w",
      expectedVersion: 1,
      capacity: CAP,
    });
    expect(r.ok).toBe(true);
    expect(repo.get("w")).toMatchObject({ location: "CHARACTER_INVENTORY", slot: 1, version: 2 });
  });

  it("rejects unequip when the bag is full (inventory_full)", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "w", itemId: "eq_weapon_training_blade", location: "CHARACTER_EQUIPMENT", slot: 0 }));
    repo.seed(rec({ id: "b0", itemId: "mat_slime_gel", slot: 0 }));
    repo.seed(rec({ id: "b1", itemId: "mat_slime_gel", slot: 1 }));

    const r = await unequipItem(repo, DEFAULT_ITEM_CATALOG, {
      characterId: CHAR,
      instanceId: "w",
      expectedVersion: 0,
      capacity: 2, // bag holds 2, both full
    });
    expect(r).toEqual({ ok: false, reason: "inventory_full" });
    expect(repo.get("w")).toMatchObject({ location: "CHARACTER_EQUIPMENT" }); // unchanged
  });

  it("rejects unequip of an item that is not currently worn", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "b", itemId: "eq_weapon_training_blade", slot: 0 }));
    const r = await unequipItem(repo, DEFAULT_ITEM_CATALOG, {
      characterId: CHAR,
      instanceId: "b",
      expectedVersion: 0,
      capacity: CAP,
    });
    expect(r).toEqual({ ok: false, reason: "not_equipped" });
  });
});

describe("moveItem (bag ↔ bag)", () => {
  it("swaps two bag items when the destination slot is occupied", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "x", itemId: "mat_slime_gel", slot: 0 }));
    repo.seed(rec({ id: "y", itemId: "eq_weapon_training_blade", slot: 1 }));

    const r = await moveItem(repo, {
      characterId: CHAR,
      instanceId: "x",
      expectedVersion: 0,
      toSlot: 1,
      capacity: CAP,
    });
    expect(r.ok).toBe(true);
    expect(repo.get("x")).toMatchObject({ slot: 1, version: 1 });
    expect(repo.get("y")).toMatchObject({ slot: 0, version: 1 });
  });

  it("moves into an empty destination slot", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "x", itemId: "mat_slime_gel", slot: 0 }));
    const r = await moveItem(repo, {
      characterId: CHAR,
      instanceId: "x",
      expectedVersion: 0,
      toSlot: 5,
      capacity: CAP,
    });
    expect(r.ok).toBe(true);
    expect(repo.get("x")).toMatchObject({ slot: 5, version: 1 });
  });

  it("rejects an out-of-range destination slot", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "x", itemId: "mat_slime_gel", slot: 0 }));
    const r = await moveItem(repo, {
      characterId: CHAR,
      instanceId: "x",
      expectedVersion: 0,
      toSlot: 40, // == capacity → out of [0,40)
      capacity: CAP,
    });
    expect(r).toEqual({ ok: false, reason: "invalid_slot" });
  });
});

describe("unknown / cross-character guards", () => {
  it("rejects an unknown instance id", async () => {
    const repo = createInMemoryInventoryRepository();
    const r = await equipItem(repo, DEFAULT_ITEM_CATALOG, {
      characterId: CHAR,
      instanceId: "nope",
      expectedVersion: 0,
      capacity: CAP,
    });
    expect(r).toEqual({ ok: false, reason: "unknown_item" });
  });

  it("does not see another character's items", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "i1", itemId: "eq_weapon_training_blade", slot: 0, characterId: "other-char" }));
    const r = await equipItem(repo, DEFAULT_ITEM_CATALOG, {
      characterId: CHAR,
      instanceId: "i1",
      expectedVersion: 0,
      capacity: CAP,
    });
    expect(r).toEqual({ ok: false, reason: "unknown_item" });
  });
});

describe("repository.applyPlan atomic version guard", () => {
  it("throws VersionConflictError and applies nothing when a version mismatches", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seed(rec({ id: "a", itemId: "eq_weapon_training_blade", slot: 0, version: 5 }));
    await expect(
      repo.applyPlan([
        { instanceId: "a", expectedVersion: 4, toLocation: "CHARACTER_EQUIPMENT", toSlot: 0 },
      ]),
    ).rejects.toBeInstanceOf(VersionConflictError);
    expect(repo.get("a")).toMatchObject({ location: "CHARACTER_INVENTORY", version: 5 });
  });
});
