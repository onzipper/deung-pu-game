import { beforeEach, describe, expect, test } from "vitest";
import {
  buyShopItem,
  sellItem,
  type ShopBuyInventorySeam,
  type ShopLedgerSeam,
} from "../src/server/economy/shop";
import { createInMemoryInventoryRepository } from "../src/server/inventory/memory-repository";
import { DEFAULT_ITEM_CATALOG } from "../src/server/inventory/item-catalog";
import type { ItemInstanceRecord } from "../src/server/inventory/repository";
import { DEFAULT_ECONOMY_CONFIG } from "../server/config/economy";
import type { ItemMeta } from "../src/server/economy/kill-reward";

// P2-11 — starter shop buy/sell (Economy §8). **never-downgrade zone (money + items).** No DB / .env: all seams
// are the in-memory repo + a mock ledger. Prices asserted against DEFAULT config (§8.2 buy / §7 sell).

const SHOP = DEFAULT_ECONOMY_CONFIG.shop;
const ACCOUNT = "acc-1";
const CHAR = "char-1";
const CAPACITY = 40;

const itemMeta = (itemId: string): ItemMeta => {
  const def = DEFAULT_ITEM_CATALOG.get(itemId);
  return { stackable: def?.stackable ?? false, uniqueEquipGroup: def?.uniqueEquipGroup ?? null };
};

/** mock double-entry ledger (SUM = balance, idempotent by key, no overdraft) — mirrors appendEntry semantics. */
function createMockLedger(initial = 0n) {
  const seen = new Set<string>();
  const applied: { reason: string; amount: bigint; key: string }[] = [];
  let balance = initial;
  const ledger: ShopLedgerSeam = {
    async appendEntry(e) {
      if (seen.has(e.idempotencyKey)) return { status: "duplicate", balance };
      const next = balance + e.amount;
      if (next < 0n) return { status: "insufficient_funds", balance };
      balance = next;
      seen.add(e.idempotencyKey);
      applied.push({ reason: e.reason, amount: e.amount, key: e.idempotencyKey });
      return { status: "applied", balance };
    },
  };
  return { ledger, applied, balanceNow: () => balance };
}

function seedRecord(over: Partial<ItemInstanceRecord>): ItemInstanceRecord {
  return {
    id: "inst-x",
    accountId: ACCOUNT,
    characterId: CHAR,
    itemId: "con_small_potion",
    location: "CHARACTER_INVENTORY",
    slot: 0,
    quantity: 1,
    enhancementLevel: 0,
    uniqueEquipGroup: null,
    version: 0,
    ...over,
  };
}

describe("shop buy (Economy §8.2 · §23)", () => {
  let repo: ReturnType<typeof createInMemoryInventoryRepository>;
  beforeEach(() => {
    repo = createInMemoryInventoryRepository();
  });

  test("success: gold ลดตามราคา config, ของเข้ากระเป๋า, ledger บันทึก shop_buy", async () => {
    const { ledger, applied, balanceNow } = createMockLedger(1000n);
    const res = await buyShopItem(
      { shop: SHOP, itemMeta, ledger, inventory: repo },
      { characterId: CHAR, accountId: ACCOUNT, capacity: CAPACITY, itemId: "con_small_potion", quantity: 2, idempotencyKey: "buy-1" },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // §8.2 potion buyPrice = 18 → 2×18 = 36
    expect(balanceNow()).toBe(1000n - 36n);
    expect(res.gold).toBe(964n);
    expect(res.quantity).toBe(2);
    expect(applied).toHaveLength(1);
    expect(applied[0].reason).toBe("shop_buy");
    expect(applied[0].amount).toBe(-36n);
    const items = await repo.listCharacterItems(CHAR);
    expect(items.find((i) => i.itemId === "con_small_potion")?.quantity).toBe(2);
  });

  test("ราคาซื้อ = config เป๊ะ (§8.2 training blade 120)", async () => {
    const { ledger, balanceNow } = createMockLedger(500n);
    const res = await buyShopItem(
      { shop: SHOP, itemMeta, ledger, inventory: repo },
      { characterId: CHAR, accountId: ACCOUNT, capacity: CAPACITY, itemId: "eq_weapon_training_blade", quantity: 1, idempotencyKey: "buy-blade" },
    );
    expect(res.ok).toBe(true);
    expect(balanceNow()).toBe(500n - 120n);
  });

  test("เงินไม่พอ → INSUFFICIENT_GOLD, ไม่มี side effect (ไม่หักเงิน/ไม่ได้ของ)", async () => {
    const { ledger, applied, balanceNow } = createMockLedger(10n);
    const res = await buyShopItem(
      { shop: SHOP, itemMeta, ledger, inventory: repo },
      { characterId: CHAR, accountId: ACCOUNT, capacity: CAPACITY, itemId: "con_small_potion", quantity: 1, idempotencyKey: "buy-2" },
    );
    expect(res).toEqual({ ok: false, reason: "INSUFFICIENT_GOLD" });
    expect(balanceNow()).toBe(10n);
    expect(applied).toHaveLength(0);
    expect(await repo.listCharacterItems(CHAR)).toHaveLength(0);
  });

  test("กระเป๋าเต็ม → INVENTORY_FULL, reject ก่อนหักเงิน (ledger ว่าง)", async () => {
    // fill a tiny bag: 1-slot capacity, occupied by a non-mergeable item.
    repo.seed(seedRecord({ id: "occupy", itemId: "eq_head_cloth_band", slot: 0, quantity: 1 }));
    const { ledger, applied, balanceNow } = createMockLedger(1000n);
    const res = await buyShopItem(
      { shop: SHOP, itemMeta, ledger, inventory: repo },
      { characterId: CHAR, accountId: ACCOUNT, capacity: 1, itemId: "con_small_potion", quantity: 1, idempotencyKey: "buy-3" },
    );
    expect(res).toEqual({ ok: false, reason: "INVENTORY_FULL" });
    expect(balanceNow()).toBe(1000n); // never debited
    expect(applied).toHaveLength(0);
  });

  test("idempotent replay: ยิงซ้ำ key เดิม → หักเงินครั้งเดียว, ได้ของครั้งเดียว", async () => {
    const { ledger, applied, balanceNow } = createMockLedger(1000n);
    const args = {
      characterId: CHAR,
      accountId: ACCOUNT,
      capacity: CAPACITY,
      itemId: "con_small_potion",
      quantity: 1,
      idempotencyKey: "buy-dup",
    };
    const first = await buyShopItem({ shop: SHOP, itemMeta, ledger, inventory: repo }, args);
    const second = await buyShopItem({ shop: SHOP, itemMeta, ledger, inventory: repo }, args);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(balanceNow()).toBe(1000n - 18n); // charged once
    expect(applied.filter((a) => a.reason === "shop_buy")).toHaveLength(1);
    const stack = (await repo.listCharacterItems(CHAR)).find((i) => i.itemId === "con_small_potion");
    expect(stack?.quantity).toBe(1); // granted once (not 2)
  });

  test("item ไม่อยู่ใน catalog ร้าน → SHOP_ITEM_NOT_FOUND", async () => {
    const { ledger } = createMockLedger(1000n);
    const res = await buyShopItem(
      { shop: SHOP, itemMeta, ledger, inventory: repo },
      { characterId: CHAR, accountId: ACCOUNT, capacity: CAPACITY, itemId: "eq_weapon_resonant_edge", quantity: 1, idempotencyKey: "buy-4" },
    );
    expect(res).toEqual({ ok: false, reason: "SHOP_ITEM_NOT_FOUND" });
  });

  test("bag races full หลังหักเงิน → refund compensating entry + reject INVENTORY_FULL", async () => {
    // custom seam: precheck sees room, but grant reports full overflow (simulates a concurrent grant).
    const seam: ShopBuyInventorySeam = {
      async listCharacterItems() {
        return [];
      },
      async grantItems() {
        return { granted: [], overflow: [{ itemId: "con_small_potion", quantity: 1 }] };
      },
    };
    const { ledger, applied, balanceNow } = createMockLedger(1000n);
    const res = await buyShopItem(
      { shop: SHOP, itemMeta, ledger, inventory: seam },
      { characterId: CHAR, accountId: ACCOUNT, capacity: CAPACITY, itemId: "con_small_potion", quantity: 1, idempotencyKey: "buy-race" },
    );
    expect(res).toEqual({ ok: false, reason: "INVENTORY_FULL" });
    expect(balanceNow()).toBe(1000n); // debit then compensated back to whole
    expect(applied.map((a) => a.reason)).toEqual(["shop_buy", "compensation"]);
  });
});

describe("shop sell (Economy §7 sell / §8.3 · §23)", () => {
  let repo: ReturnType<typeof createInMemoryInventoryRepository>;
  beforeEach(() => {
    repo = createInMemoryInventoryRepository();
  });

  test("success: หักของ, เงินเข้า reason shop_sell, ราคา = config (§7 potion sell 4)", async () => {
    repo.seed(seedRecord({ id: "pot", itemId: "con_small_potion", quantity: 5, version: 0 }));
    const { ledger, applied, balanceNow } = createMockLedger(0n);
    const res = await sellItem(
      { shop: SHOP, ledger, inventory: repo },
      { characterId: CHAR, capacity: CAPACITY, instanceId: "pot", expectedVersion: 0, quantity: 3, idempotencyKey: "sell-1" },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.quantity).toBe(3);
    expect(balanceNow()).toBe(12n); // 3 × 4
    expect(applied[0].reason).toBe("shop_sell");
    expect(applied[0].amount).toBe(12n);
    // partial: 2 left in the stack
    expect(repo.get("pot")?.quantity).toBe(2);
  });

  test("ขาย stackable บางส่วนจนหมด → stack ออกจากกระเป๋า (DESTROYED)", async () => {
    repo.seed(seedRecord({ id: "gel", itemId: "mat_slime_gel", quantity: 2, version: 0 }));
    const { ledger, balanceNow } = createMockLedger(0n);
    const res = await sellItem(
      { shop: SHOP, ledger, inventory: repo },
      { characterId: CHAR, capacity: CAPACITY, instanceId: "gel", expectedVersion: 0, quantity: 2, idempotencyKey: "sell-gel" },
    );
    expect(res.ok).toBe(true);
    expect(balanceNow()).toBe(4n); // §7 slime gel sell 2 × 2
    expect(repo.get("gel")?.location).toBe("DESTROYED");
    expect((await repo.listCharacterItems(CHAR)).length).toBe(0);
  });

  test("ไม่ถือของ → SHOP_ITEM_NOT_FOUND", async () => {
    const { ledger } = createMockLedger(0n);
    const res = await sellItem(
      { shop: SHOP, ledger, inventory: repo },
      { characterId: CHAR, capacity: CAPACITY, instanceId: "ghost", expectedVersion: 0, quantity: 1, idempotencyKey: "sell-2" },
    );
    expect(res).toEqual({ ok: false, reason: "SHOP_ITEM_NOT_FOUND" });
  });

  test("ของที่สวมอยู่ → ITEM_EQUIPPED (ต้องถอดก่อน §8.3)", async () => {
    repo.seed(seedRecord({ id: "worn", itemId: "eq_weapon_training_blade", location: "CHARACTER_EQUIPMENT", slot: 0, quantity: 1 }));
    const { ledger } = createMockLedger(0n);
    const res = await sellItem(
      { shop: SHOP, ledger, inventory: repo },
      { characterId: CHAR, capacity: CAPACITY, instanceId: "worn", expectedVersion: 0, quantity: 1, idempotencyKey: "sell-3" },
    );
    expect(res).toEqual({ ok: false, reason: "ITEM_EQUIPPED" });
  });

  test("ไอเทมที่ไม่มีราคาขาย (upg_reinforcement) → ITEM_UNSELLABLE", async () => {
    repo.seed(seedRecord({ id: "reinf", itemId: "upg_reinforcement", quantity: 3, version: 0 }));
    const { ledger } = createMockLedger(0n);
    const res = await sellItem(
      { shop: SHOP, ledger, inventory: repo },
      { characterId: CHAR, capacity: CAPACITY, instanceId: "reinf", expectedVersion: 0, quantity: 1, idempotencyKey: "sell-4" },
    );
    expect(res).toEqual({ ok: false, reason: "ITEM_UNSELLABLE" });
  });

  test("version ไม่ตรง (stale/concurrent) → TRANSACTION_CONFLICT, ไม่หักของ/ไม่ได้เงิน", async () => {
    repo.seed(seedRecord({ id: "pot2", itemId: "con_small_potion", quantity: 5, version: 2 }));
    const { ledger, balanceNow } = createMockLedger(0n);
    const res = await sellItem(
      { shop: SHOP, ledger, inventory: repo },
      { characterId: CHAR, capacity: CAPACITY, instanceId: "pot2", expectedVersion: 0, quantity: 1, idempotencyKey: "sell-5" },
    );
    expect(res).toEqual({ ok: false, reason: "TRANSACTION_CONFLICT" });
    expect(balanceNow()).toBe(0n);
    expect(repo.get("pot2")?.quantity).toBe(5);
  });

  test("ขายเกินจำนวนที่ถือ → TRANSACTION_CONFLICT", async () => {
    repo.seed(seedRecord({ id: "pot3", itemId: "con_small_potion", quantity: 2, version: 0 }));
    const { ledger } = createMockLedger(0n);
    const res = await sellItem(
      { shop: SHOP, ledger, inventory: repo },
      { characterId: CHAR, capacity: CAPACITY, instanceId: "pot3", expectedVersion: 0, quantity: 5, idempotencyKey: "sell-6" },
    );
    expect(res).toEqual({ ok: false, reason: "TRANSACTION_CONFLICT" });
  });
});
