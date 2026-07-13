import { describe, expect, test } from "vitest";
import { createInMemoryInventoryRepository } from "@/server/inventory/memory-repository";
import { DEFAULT_ITEM_CATALOG, EQUIPMENT_SLOTS } from "@/server/inventory/item-catalog";
import { grantStarterLoadout, STARTER_LOADOUT } from "@/server/inventory/starter-loadout";

// Economy §7.7 — new characters receive + wear a fixed starter set (5 equipment) + 5 potions in the bag.

describe("starter loadout (Economy §7.7)", () => {
  test("grants + equips the full starter set on a fresh character", async () => {
    const repo = createInMemoryInventoryRepository();
    const res = await grantStarterLoadout(repo, DEFAULT_ITEM_CATALOG, {
      accountId: "acc-1",
      characterId: "char-1",
    });
    expect(res).toEqual({ granted: true });

    const items = await repo.listCharacterItems("char-1");
    const worn = items.filter((r) => r.location === "CHARACTER_EQUIPMENT");
    const bag = items.filter((r) => r.location === "CHARACTER_INVENTORY");

    // all 5 equipment worn, each in its correct config slot
    expect(worn).toHaveLength(STARTER_LOADOUT.equipment.length);
    for (const itemId of STARTER_LOADOUT.equipment) {
      const def = DEFAULT_ITEM_CATALOG.get(itemId)!;
      const inst = worn.find((r) => r.itemId === itemId);
      expect(inst, `${itemId} should be worn`).toBeDefined();
      expect(inst!.slot).toBe(def.equipSlotId);
    }
    // every equipment slot filled exactly once
    expect(new Set(worn.map((r) => r.slot))).toEqual(new Set(EQUIPMENT_SLOTS.map((s) => s.slotId)));

    // potion ×5 sits in the bag as one stack
    expect(bag).toHaveLength(1);
    expect(bag[0].itemId).toBe("con_small_potion");
    expect(bag[0].quantity).toBe(5);
  });

  test("is idempotent — a second call does not double-grant", async () => {
    const repo = createInMemoryInventoryRepository();
    await grantStarterLoadout(repo, DEFAULT_ITEM_CATALOG, { accountId: "acc-1", characterId: "char-1" });
    const res2 = await grantStarterLoadout(repo, DEFAULT_ITEM_CATALOG, {
      accountId: "acc-1",
      characterId: "char-1",
    });
    expect(res2).toEqual({ granted: false, reason: "already_initialized" });

    const items = await repo.listCharacterItems("char-1");
    expect(items).toHaveLength(6); // 5 equipment + 1 potion stack — no duplicates
  });
});
