import { beforeEach, describe, expect, test } from "vitest";
import {
  useConsumable,
  type ConsumableEffectLookup,
  type ConsumableInventorySeam,
} from "../src/server/inventory/consumable-service";
import { createInMemoryInventoryRepository } from "../src/server/inventory/memory-repository";
import { DEFAULT_ITEM_CATALOG } from "../src/server/inventory/item-catalog";
import type { ItemInstanceRecord } from "../src/server/inventory/repository";
import { DEFAULT_CONSUMABLE_CONFIG } from "../server/config/consumables";

// PR5 — server-authoritative consumable use (Economy §7.1). **never-downgrade zone (items are money-like):** no
// heal without a real consume; a failed consume heals nothing and changes nothing. No DB / .env — the seam is
// the in-memory repo. Heal %/cooldown asserted against DEFAULT config (§7.1 = 35% Max HP, CD 12s).

const ACCOUNT = "acc-1";
const CHAR = "char-1";
const MAX_HP = 200;
const POTION = "con_small_potion";
const HEAL = DEFAULT_CONSUMABLE_CONFIG.effects[POTION]; // { healPctMaxHp: 0.35, cooldownMs: 12_000 }

/** effect lookup backed by the DEFAULT config (Design Knob §48). */
const effects: ConsumableEffectLookup = (id) => DEFAULT_CONSUMABLE_CONFIG.effects[id];

function seedRecord(over: Partial<ItemInstanceRecord>): ItemInstanceRecord {
  return {
    id: "pot",
    accountId: ACCOUNT,
    characterId: CHAR,
    itemId: POTION,
    location: "CHARACTER_INVENTORY",
    slot: 0,
    quantity: 5,
    enhancementLevel: 0,
    uniqueEquipGroup: null,
    version: 0,
    ...over,
  };
}

describe("useConsumable — heal potion (Economy §7.1)", () => {
  let repo: ReturnType<typeof createInMemoryInventoryRepository>;
  beforeEach(() => {
    repo = createInMemoryInventoryRepository();
  });

  test("happy path (by-instance): consume 1, heal 35% Max HP, version bumped", async () => {
    repo.seed(seedRecord({ id: "pot", quantity: 5, version: 0 }));
    const res = await useConsumable(repo, DEFAULT_ITEM_CATALOG, effects, {
      characterId: CHAR,
      selector: { by: "instance", instanceId: "pot", expectedVersion: 0 },
      hp: 50,
      maxHp: MAX_HP,
      nowMs: 1000,
      cooldownUntilMs: 0,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.itemId).toBe(POTION);
    expect(res.consumedInstanceId).toBe("pot");
    expect(res.healedBy).toBe(Math.round(0.35 * MAX_HP)); // 70
    expect(res.healedToHp).toBe(50 + Math.round(0.35 * MAX_HP)); // 120
    expect(res.cooldownUntilMs).toBe(1000 + HEAL.cooldownMs);
    const after = repo.get("pot");
    expect(after?.quantity).toBe(4);
    expect(after?.version).toBe(1);
  });

  test("clamp: hp near max → healedToHp === maxHp, healedBy = clamped delta", async () => {
    const HP = 190;
    repo.seed(seedRecord({ id: "pot", quantity: 5, version: 0 }));
    const res = await useConsumable(repo, DEFAULT_ITEM_CATALOG, effects, {
      characterId: CHAR,
      selector: { by: "instance", instanceId: "pot", expectedVersion: 0 },
      hp: HP,
      maxHp: MAX_HP,
      nowMs: 0,
      cooldownUntilMs: 0,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.healedToHp).toBe(MAX_HP);
    expect(res.healedBy).toBe(res.healedToHp - HP); // clamped delta (not the raw 35%)
  });

  test("consume-before-heal: generic consume error propagates, repo unchanged (nothing healed)", async () => {
    repo.seed(seedRecord({ id: "pot", quantity: 5, version: 0 }));
    // seam reads the real repo but a hard (non-version) error fails the consume → must propagate, not heal.
    const seam: ConsumableInventorySeam = {
      listCharacterItems: (cid) => repo.listCharacterItems(cid),
      async consumeForSale() {
        throw new Error("db down");
      },
    };
    await expect(
      useConsumable(seam, DEFAULT_ITEM_CATALOG, effects, {
        characterId: CHAR,
        selector: { by: "instance", instanceId: "pot", expectedVersion: 0 },
        hp: 50,
        maxHp: MAX_HP,
        nowMs: 0,
        cooldownUntilMs: 0,
      }),
    ).rejects.toThrow("db down");
    // never-downgrade: no consume ⟹ quantity/version untouched.
    expect(repo.get("pot")?.quantity).toBe(5);
    expect(repo.get("pot")?.version).toBe(0);
  });

  test("on_cooldown: cooldownUntilMs > nowMs → reject, quantity unchanged", async () => {
    repo.seed(seedRecord({ id: "pot", quantity: 5, version: 0 }));
    const res = await useConsumable(repo, DEFAULT_ITEM_CATALOG, effects, {
      characterId: CHAR,
      selector: { by: "instance", instanceId: "pot", expectedVersion: 0 },
      hp: 50,
      maxHp: MAX_HP,
      nowMs: 1000,
      cooldownUntilMs: 5000,
    });
    expect(res).toEqual({ ok: false, reason: "on_cooldown" });
    expect(repo.get("pot")?.quantity).toBe(5);
  });

  test("hp_already_full → reject, quantity unchanged", async () => {
    repo.seed(seedRecord({ id: "pot", quantity: 5, version: 0 }));
    const res = await useConsumable(repo, DEFAULT_ITEM_CATALOG, effects, {
      characterId: CHAR,
      selector: { by: "instance", instanceId: "pot", expectedVersion: 0 },
      hp: MAX_HP,
      maxHp: MAX_HP,
      nowMs: 0,
      cooldownUntilMs: 0,
    });
    expect(res).toEqual({ ok: false, reason: "hp_already_full" });
    expect(repo.get("pot")?.quantity).toBe(5);
  });

  test("version_conflict: stale expectedVersion → reject, quantity unchanged", async () => {
    repo.seed(seedRecord({ id: "pot", quantity: 5, version: 2 }));
    const res = await useConsumable(repo, DEFAULT_ITEM_CATALOG, effects, {
      characterId: CHAR,
      selector: { by: "instance", instanceId: "pot", expectedVersion: 0 }, // stale
      hp: 50,
      maxHp: MAX_HP,
      nowMs: 0,
      cooldownUntilMs: 0,
    });
    expect(res).toEqual({ ok: false, reason: "version_conflict" });
    expect(repo.get("pot")?.quantity).toBe(5);
  });

  test("by-item selector: picks the first bag stack, consumes exactly one unit total", async () => {
    repo.seed(seedRecord({ id: "potA", slot: 0, quantity: 3, version: 0 }));
    repo.seed(seedRecord({ id: "potB", slot: 1, quantity: 2, version: 0 }));
    const res = await useConsumable(repo, DEFAULT_ITEM_CATALOG, effects, {
      characterId: CHAR,
      selector: { by: "item", itemId: POTION },
      hp: 50,
      maxHp: MAX_HP,
      nowMs: 0,
      cooldownUntilMs: 0,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.consumedInstanceId).toBe("potA"); // first stack
    const total = (repo.get("potA")?.quantity ?? 0) + (repo.get("potB")?.quantity ?? 0);
    expect(total).toBe(4); // 5 - 1 consumed
  });

  test("by-item selector: no stock → no_stock", async () => {
    const res = await useConsumable(repo, DEFAULT_ITEM_CATALOG, effects, {
      characterId: CHAR,
      selector: { by: "item", itemId: POTION },
      hp: 50,
      maxHp: MAX_HP,
      nowMs: 0,
      cooldownUntilMs: 0,
    });
    expect(res).toEqual({ ok: false, reason: "no_stock" });
  });

  test("non-consumable itemId (a weapon) → unknown_item, quantity unchanged", async () => {
    repo.seed(seedRecord({ id: "wpn", itemId: "eq_weapon_training_blade", quantity: 1, version: 0 }));
    const res = await useConsumable(repo, DEFAULT_ITEM_CATALOG, effects, {
      characterId: CHAR,
      selector: { by: "instance", instanceId: "wpn", expectedVersion: 0 },
      hp: 50,
      maxHp: MAX_HP,
      nowMs: 0,
      cooldownUntilMs: 0,
    });
    expect(res).toEqual({ ok: false, reason: "unknown_item" });
    expect(repo.get("wpn")?.quantity).toBe(1);
  });

  test("consumable with no effect entry → no_effect (fail closed, not consumed)", async () => {
    repo.seed(seedRecord({ id: "pot", quantity: 5, version: 0 }));
    const noEffects: ConsumableEffectLookup = () => undefined;
    const res = await useConsumable(repo, DEFAULT_ITEM_CATALOG, noEffects, {
      characterId: CHAR,
      selector: { by: "instance", instanceId: "pot", expectedVersion: 0 },
      hp: 50,
      maxHp: MAX_HP,
      nowMs: 0,
      cooldownUntilMs: 0,
    });
    expect(res).toEqual({ ok: false, reason: "no_effect" });
    expect(repo.get("pot")?.quantity).toBe(5); // never consumed
  });

  test("stack-to-zero: last unit consumed → stack leaves the bag (DESTROYED, qty 0)", async () => {
    repo.seed(seedRecord({ id: "pot", quantity: 1, version: 0 }));
    const res = await useConsumable(repo, DEFAULT_ITEM_CATALOG, effects, {
      characterId: CHAR,
      selector: { by: "instance", instanceId: "pot", expectedVersion: 0 },
      hp: 50,
      maxHp: MAX_HP,
      nowMs: 0,
      cooldownUntilMs: 0,
    });
    expect(res.ok).toBe(true);
    const after = repo.get("pot");
    expect(after?.quantity).toBe(0);
    expect(after?.location).toBe("DESTROYED");
    expect(await repo.listCharacterItems(CHAR)).toHaveLength(0);
  });
});
