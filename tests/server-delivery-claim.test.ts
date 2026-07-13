import { describe, expect, test } from "vitest";
import { createInMemoryInventoryRepository } from "../src/server/inventory/memory-repository";
import type { ItemInstanceRecord } from "../src/server/inventory/repository";
import {
  claimDeliveryEntry,
  buildDeliverySnapshot,
  deliveryStatusOf,
  type DeliveryServiceDeps,
} from "../src/server/inventory/storage-service";

// P2-17 — Delivery Box claim + expiry/warning (Storage §16). All-or-nothing per entry, idempotent; the reward
// is never lost on a full bag, and expiry status is computed server-side (§16.4 "ห้ามหมดอายุเงียบ").

type Repo = ReturnType<typeof createInMemoryInventoryRepository>;

const DAY = 86_400_000;
const NOW = 1_000_000_000_000; // fixed clock

function deliveryDeps(repo: Repo): DeliveryServiceDeps {
  return { repo, maxEntries: 50, warnDaysBeforeExpiry: 7, urgentDaysBeforeExpiry: 1 };
}

function fillBag(repo: Repo, characterId: string, capacity: number): void {
  for (let s = 0; s < capacity; s++) {
    const rec: ItemInstanceRecord = {
      id: `b${s}`,
      accountId: "acc1",
      characterId,
      itemId: "eq_head_cloth_band",
      location: "CHARACTER_INVENTORY",
      slot: s,
      quantity: 1,
      enhancementLevel: 0,
      uniqueEquipGroup: null,
      version: 0,
    };
    repo.seed(rec);
  }
}

describe("delivery claim (§16.5)", () => {
  test("claim grants the entry items into the bag + marks the entry claimed", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seedDeliveryEntry({
      id: "e1",
      accountId: "acc1",
      source: "compensation",
      items: [{ itemId: "mat_slime_gel", quantity: 3 }, { itemId: "con_small_potion", quantity: 2 }],
      expiresAtMs: NOW + 30 * DAY,
    });

    const r = await claimDeliveryEntry(deliveryDeps(repo), {
      accountId: "acc1",
      characterId: "char1",
      entryId: "e1",
      bagCapacity: 40,
      nowMs: NOW,
      idempotencyKey: "c1",
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.granted).toEqual([
        { itemId: "mat_slime_gel", quantity: 3 },
        { itemId: "con_small_potion", quantity: 2 },
      ]);
      expect(r.delivery.entries[0].claimStatus).toBe("claimed");
    }
    const bag = await repo.listCharacterItems("char1");
    expect(bag).toHaveLength(2);
  });

  test("replaying the claim key is a no-op success (items granted once)", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seedDeliveryEntry({
      id: "e1",
      accountId: "acc1",
      source: "event_reward",
      items: [{ itemId: "mat_slime_gel", quantity: 3 }],
      expiresAtMs: NOW + 30 * DAY,
    });
    const base = {
      accountId: "acc1",
      characterId: "char1",
      entryId: "e1",
      bagCapacity: 40,
      nowMs: NOW,
      idempotencyKey: "c1",
    };
    await claimDeliveryEntry(deliveryDeps(repo), base);
    const replay = await claimDeliveryEntry(deliveryDeps(repo), base);
    expect(replay.ok).toBe(true);
    const stack = (await repo.listCharacterItems("char1")).find((r) => r.itemId === "mat_slime_gel")!;
    expect(stack.quantity).toBe(3); // not 6
  });

  test("expired entry → EXPIRED (no grant)", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seedDeliveryEntry({
      id: "e1",
      accountId: "acc1",
      source: "event_reward",
      items: [{ itemId: "mat_slime_gel", quantity: 1 }],
      expiresAtMs: NOW - DAY, // already past
    });
    const r = await claimDeliveryEntry(deliveryDeps(repo), {
      accountId: "acc1",
      characterId: "char1",
      entryId: "e1",
      bagCapacity: 40,
      nowMs: NOW,
      idempotencyKey: "c1",
    });
    expect(r).toEqual({ ok: false, reason: "EXPIRED" });
    expect(await repo.listCharacterItems("char1")).toHaveLength(0);
  });

  test("bag can't hold all items → INVENTORY_FULL, entry stays unclaimed (no loss, §16.5)", async () => {
    const repo = createInMemoryInventoryRepository();
    fillBag(repo, "char1", 2); // bag capacity 2, both slots taken by unrelated items
    repo.seedDeliveryEntry({
      id: "e1",
      accountId: "acc1",
      source: "compensation",
      items: [{ itemId: "mat_slime_gel", quantity: 1 }], // needs a new slot → none free
      expiresAtMs: null,
    });
    const r = await claimDeliveryEntry(deliveryDeps(repo), {
      accountId: "acc1",
      characterId: "char1",
      entryId: "e1",
      bagCapacity: 2,
      nowMs: NOW,
      idempotencyKey: "c1",
    });
    expect(r).toEqual({ ok: false, reason: "INVENTORY_FULL" });
    const snap = await buildDeliverySnapshot(deliveryDeps(repo), "acc1", NOW, true);
    expect(snap.entries[0].claimStatus).toBe("unclaimed"); // still claimable later
  });

  test("wrong account / missing entry → NOT_FOUND", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seedDeliveryEntry({
      id: "e1",
      accountId: "accOTHER",
      source: "gm_gift",
      items: [{ itemId: "mat_slime_gel", quantity: 1 }],
      expiresAtMs: null,
    });
    const r = await claimDeliveryEntry(deliveryDeps(repo), {
      accountId: "acc1",
      characterId: "char1",
      entryId: "e1",
      bagCapacity: 40,
      nowMs: NOW,
      idempotencyKey: "c1",
    });
    expect(r).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

describe("delivery expiry status (§16.4 — server computed)", () => {
  test("never (null) → none · >7d → none · ≤7d → expiring_soon · ≤1d → expiring_urgent · past → expired", () => {
    expect(deliveryStatusOf(null, NOW, 7, 1)).toBe("none");
    expect(deliveryStatusOf(new Date(NOW + 30 * DAY), NOW, 7, 1)).toBe("none");
    expect(deliveryStatusOf(new Date(NOW + 5 * DAY), NOW, 7, 1)).toBe("expiring_soon");
    expect(deliveryStatusOf(new Date(NOW + 12 * 60 * 60 * 1000), NOW, 7, 1)).toBe("expiring_urgent");
    expect(deliveryStatusOf(new Date(NOW - DAY), NOW, 7, 1)).toBe("expired");
  });

  test("snapshot carries source, absolute expiry (ISO) + computed status per entry", async () => {
    const repo = createInMemoryInventoryRepository();
    repo.seedDeliveryEntry({
      id: "e-soon",
      accountId: "acc1",
      source: "event_reward",
      items: [{ itemId: "mat_slime_gel", quantity: 1 }],
      expiresAtMs: NOW + 3 * DAY,
    });
    const snap = await buildDeliverySnapshot(deliveryDeps(repo), "acc1", NOW, true);
    expect(snap.maxEntries).toBe(50);
    expect(snap.used).toBe(1);
    const e = snap.entries[0];
    expect(e.source).toBe("event_reward");
    expect(e.status).toBe("expiring_soon");
    expect(e.expiresAt).toBe(new Date(NOW + 3 * DAY).toISOString());
  });
});
