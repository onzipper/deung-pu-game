import { describe, expect, test } from "vitest";
import { createInMemoryInventoryRepository } from "../src/server/inventory/memory-repository";
import type { ItemInstanceRecord } from "../src/server/inventory/repository";

// P2-09 — grantItems (loot → bag). never-downgrade zone (items are money-like). tested via the in-memory repo.

function seedStack(
  repo: ReturnType<typeof createInMemoryInventoryRepository>,
  over: Partial<ItemInstanceRecord> & { id: string; itemId: string },
): void {
  repo.seed({
    accountId: "acc1",
    characterId: "char1",
    location: "CHARACTER_INVENTORY",
    slot: 0,
    quantity: 1,
    enhancementLevel: 0,
    uniqueEquipGroup: null,
    version: 0,
    ...over,
  });
}

const base = { accountId: "acc1", characterId: "char1", capacity: 40 };

describe("grantItems — stacking (materials/consumables)", () => {
  test("stackable merges into an existing same-itemId stack (quantity+, version bumped)", async () => {
    const repo = createInMemoryInventoryRepository();
    seedStack(repo, { id: "s1", itemId: "mat_slime_gel", quantity: 3, slot: 0 });
    const r = await repo.grantItems({
      ...base,
      grants: [{ itemId: "mat_slime_gel", quantity: 2, stackable: true, uniqueEquipGroup: null }],
    });
    expect(r.granted).toEqual([{ itemId: "mat_slime_gel", quantity: 2 }]);
    expect(r.overflow).toEqual([]);
    const stack = repo.get("s1")!;
    expect(stack.quantity).toBe(5);
    expect(stack.version).toBe(1);
  });

  test("stackable with no existing stack takes a new free slot", async () => {
    const repo = createInMemoryInventoryRepository();
    const r = await repo.grantItems({
      ...base,
      grants: [{ itemId: "mat_soft_feather", quantity: 4, stackable: true, uniqueEquipGroup: null }],
    });
    expect(r.granted).toEqual([{ itemId: "mat_soft_feather", quantity: 4 }]);
    const items = await repo.listCharacterItems("char1");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ itemId: "mat_soft_feather", quantity: 4, slot: 0 });
  });
});

describe("grantItems — non-stackable equipment", () => {
  test("one instance per unit, each at its own slot", async () => {
    const repo = createInMemoryInventoryRepository();
    const r = await repo.grantItems({
      ...base,
      grants: [{ itemId: "eq_weapon_training_blade", quantity: 2, stackable: false, uniqueEquipGroup: "wg" }],
    });
    expect(r.granted).toEqual([{ itemId: "eq_weapon_training_blade", quantity: 2 }]);
    const items = await repo.listCharacterItems("char1");
    expect(items).toHaveLength(2);
    expect(new Set(items.map((i) => i.slot))).toEqual(new Set([0, 1]));
    expect(items.every((i) => i.quantity === 1 && i.uniqueEquipGroup === "wg")).toBe(true);
  });
});

describe("grantItems — inventory full (§12.5 no silent loss)", () => {
  test("overflow returned when the bag has no free slot (stackable, no existing stack)", async () => {
    const repo = createInMemoryInventoryRepository();
    // fill the only 2 slots with unrelated equipment.
    seedStack(repo, { id: "a", itemId: "eq_head_cloth_band", slot: 0 });
    seedStack(repo, { id: "b", itemId: "eq_body_traveler_tunic", slot: 1 });
    const r = await repo.grantItems({
      accountId: "acc1",
      characterId: "char1",
      capacity: 2,
      grants: [{ itemId: "mat_coarse_hide", quantity: 3, stackable: true, uniqueEquipGroup: null }],
    });
    expect(r.granted).toEqual([]);
    expect(r.overflow).toEqual([{ itemId: "mat_coarse_hide", quantity: 3 }]);
  });

  test("partial placement: some units fit, the rest overflow (non-stackable)", async () => {
    const repo = createInMemoryInventoryRepository();
    seedStack(repo, { id: "a", itemId: "eq_head_cloth_band", slot: 0 });
    const r = await repo.grantItems({
      accountId: "acc1",
      characterId: "char1",
      capacity: 2, // 1 free slot
      grants: [{ itemId: "eq_weapon_reed_edge", quantity: 3, stackable: false, uniqueEquipGroup: null }],
    });
    expect(r.granted).toEqual([{ itemId: "eq_weapon_reed_edge", quantity: 1 }]);
    expect(r.overflow).toEqual([{ itemId: "eq_weapon_reed_edge", quantity: 2 }]);
  });

  test("existing stack still merges even when the bag is otherwise full", async () => {
    const repo = createInMemoryInventoryRepository();
    seedStack(repo, { id: "s", itemId: "mat_coarse_hide", quantity: 1, slot: 0 });
    seedStack(repo, { id: "b", itemId: "eq_body_traveler_tunic", slot: 1 });
    const r = await repo.grantItems({
      accountId: "acc1",
      characterId: "char1",
      capacity: 2, // full, but the mat stack absorbs the grant
      grants: [{ itemId: "mat_coarse_hide", quantity: 5, stackable: true, uniqueEquipGroup: null }],
    });
    expect(r.granted).toEqual([{ itemId: "mat_coarse_hide", quantity: 5 }]);
    expect(repo.get("s")!.quantity).toBe(6);
  });
});
