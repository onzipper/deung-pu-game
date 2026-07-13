// P2-11 — starter NPC shop buy/sell (Economy §8 · Bible 3.5 · TA §7/§12.1). **SERVER-AUTHORITATIVE,
// never-downgrade zone (money + items).** Pure orchestration over injected seams (ledger / inventory) → unit
// tested with mocks + the in-memory repo, **never touches a real DB / .env**. Prices are Design Knobs read
// from ShopConfig (server/config/economy.ts) — the client never carries a price (§8.3).
//
// CROSS-RESOURCE ATOMICITY (the ledger and the inventory each own a separate DB transaction — they cannot be
// merged into one, so the two are sequenced so the COMMON failure of each op happens BEFORE the irreversible
// cross-resource step, and a rare post-commit failure is undone with a compensating ledger entry, TA §7):
//
//   BUY  (order: capacity precheck → gold debit → item grant → refund-on-failure)
//     1. precheck bag capacity for the full quantity → INVENTORY_FULL before any gold moves (common case).
//     2. debit gold (idempotent key) — insufficient_funds → INSUFFICIENT_GOLD, no side effect (common case).
//        a duplicate key = idempotent replay → return the current balance as success, DO NOT grant again.
//     3. grant the item; if the bag raced full (overflow) or the grant threw, append a COMPENSATING credit
//        (reason `compensation`) to refund the un-granted amount — the debit is never left un-backed by items.
//
//   SELL (order: consume item → credit gold)
//     1. consume the item under an optimistic-version guard — a stale/concurrent client fails HERE (common
//        case), before any gold moves, so nothing needs undoing.
//     2. credit gold (idempotent key). A credit has no business rejection (no overdraft); only a hard DB error
//        can fail it, and by then the DB just proved healthy in step 1 → the window is microscopic. Such a hard
//        error propagates loudly (money-loud) with a full audit trail (ledger + item tombstone) for manual
//        reconciliation; sell idempotency itself is carried by the bumped `version` (a replay re-consume fails).

import type { ItemMeta } from "./kill-reward";
import type {
  ConsumeForSaleInput,
  GrantItemsInput,
  GrantOutcome,
  ItemInstanceRecord,
} from "../inventory/repository";
import type { ShopConfig } from "../../../server/config/types";

/** upper bound on a single buy/sell transaction quantity (server abuse guard; §20.4 UI confirms >10). */
export const MAX_SHOP_TX_QUANTITY = 99;

/** ids that must never be sellable regardless of config (R1/R2 sell-ability undecided — §8.3/§14.4). */
export const NON_SELLABLE_ITEM_IDS: ReadonlySet<string> = new Set([
  "upg_reinforcement",
  "upg_reinforcement_fragment",
]);

/** Economy §23 shop reject codes the buy path can produce. */
export type ShopBuyReject =
  | "SHOP_ITEM_NOT_FOUND" // item not in the shop's buy catalog / malformed request
  | "SHOP_LOCKED" // unlock condition not met (reserved — not gated in P2)
  | "INSUFFICIENT_GOLD" // ledger balance < total price (no side effect)
  | "INVENTORY_FULL" // bag can't hold the purchase (rejected before any gold moves)
  | "TRANSACTION_CONFLICT"; // invalid quantity / lost optimistic race

/** Economy §23 shop reject codes the sell path can produce. */
export type ShopSellReject =
  | "SHOP_ITEM_NOT_FOUND" // instance not found / not owned
  | "ITEM_UNSELLABLE" // no sell price in config (Kraeng/quest/etc.)
  | "ITEM_EQUIPPED" // must unequip before selling (§8.3)
  | "TRANSACTION_CONFLICT"; // invalid quantity / stale version / not enough held

export type ShopBuyResult =
  | { ok: true; itemId: string; quantity: number; gold: bigint }
  | { ok: false; reason: ShopBuyReject };

export type ShopSellResult =
  | { ok: true; itemId: string; quantity: number; gold: bigint }
  | { ok: false; reason: ShopSellReject };

/** ledger seam (structural subset of server/db/ledger.ts appendEntry). Reasons limited to the shop set. */
export interface ShopLedgerSeam {
  appendEntry(entry: {
    characterId: string;
    currency: "gold";
    amount: bigint;
    reason: "shop_buy" | "shop_sell" | "compensation";
    refType?: string;
    refId?: string;
    idempotencyKey: string;
  }): Promise<{ status: "applied" | "duplicate" | "insufficient_funds"; balance: bigint }>;
}

/** inventory seam for buy (grant into the bag). */
export interface ShopBuyInventorySeam {
  listCharacterItems(characterId: string): Promise<ItemInstanceRecord[]>;
  grantItems(input: GrantItemsInput): Promise<GrantOutcome>;
}

/** inventory seam for sell (read + version-guarded consume). */
export interface ShopSellInventorySeam {
  listCharacterItems(characterId: string): Promise<ItemInstanceRecord[]>;
  consumeForSale(input: ConsumeForSaleInput): Promise<void>;
}

export interface ShopBuyDeps {
  shop: ShopConfig;
  /** catalog lookup → stackable + uniqueEquipGroup for the purchased item (§12.1 stamp). */
  itemMeta: (itemId: string) => ItemMeta;
  ledger: ShopLedgerSeam;
  inventory: ShopBuyInventorySeam;
}

export interface ShopSellDeps {
  shop: ShopConfig;
  ledger: ShopLedgerSeam;
  inventory: ShopSellInventorySeam;
}

export interface ShopBuyContext {
  characterId: string;
  accountId: string;
  capacity: number;
  itemId: string;
  quantity: number;
  idempotencyKey: string;
}

export interface ShopSellContext {
  characterId: string;
  capacity: number;
  instanceId: string;
  expectedVersion: number;
  quantity: number;
  idempotencyKey: string;
}

/** integer quantity in [1, MAX_SHOP_TX_QUANTITY], else null (malformed request → TRANSACTION_CONFLICT). */
function normalizeQuantity(raw: number): number | null {
  const q = Math.floor(Number(raw));
  if (!Number.isFinite(q) || q < 1 || q > MAX_SHOP_TX_QUANTITY) return null;
  return q;
}

/** can the bag hold `quantity` of an item given the current instances? (stackable merges; else needs N slots.) */
function bagCanHold(
  items: readonly ItemInstanceRecord[],
  itemId: string,
  stackable: boolean,
  quantity: number,
  capacity: number,
): boolean {
  const used = new Set<number>();
  let hasStack = false;
  for (const r of items) {
    if (r.location !== "CHARACTER_INVENTORY") continue;
    if (r.slot !== null) used.add(r.slot);
    if (stackable && r.itemId === itemId) hasStack = true;
  }
  if (stackable && hasStack) return true; // merges into the existing stack, no new slot needed
  let free = 0;
  for (let s = 0; s < capacity; s++) if (!used.has(s)) free++;
  return free >= (stackable ? 1 : quantity);
}

/**
 * buy `quantity` of `itemId` from the shop. Server-authoritative — the client sends only an intent; the price
 * is read from config. See the header for the full atomicity ordering + compensation contract.
 */
export async function buyShopItem(deps: ShopBuyDeps, ctx: ShopBuyContext): Promise<ShopBuyResult> {
  const quantity = normalizeQuantity(ctx.quantity);
  if (quantity === null) return { ok: false, reason: "TRANSACTION_CONFLICT" };

  const entry = deps.shop.entries.find((e) => e.itemId === ctx.itemId);
  if (!entry) return { ok: false, reason: "SHOP_ITEM_NOT_FOUND" };
  // §8.2 unlock: P2 has no tutorial-complete signal server-side → unlock is not gated (see the report); the
  // field is carried in config + MSG_SHOP_LIST for a future gate. SHOP_LOCKED stays reserved.

  const meta = deps.itemMeta(ctx.itemId);
  const totalCost = BigInt(entry.buyPrice) * BigInt(quantity);

  // 1) capacity precheck — reject before any gold moves (the common full-bag case).
  const before = await deps.inventory.listCharacterItems(ctx.characterId);
  if (!bagCanHold(before, ctx.itemId, meta.stackable, quantity, ctx.capacity)) {
    return { ok: false, reason: "INVENTORY_FULL" };
  }

  // 2) debit gold (idempotent). insufficient → reject (no side effect). duplicate → idempotent replay.
  const debit = await deps.ledger.appendEntry({
    characterId: ctx.characterId,
    currency: "gold",
    amount: -totalCost,
    reason: "shop_buy",
    refType: "shop_buy",
    refId: deps.shop.shopId,
    idempotencyKey: `shop-buy:${ctx.idempotencyKey}`,
  });
  if (debit.status === "insufficient_funds") return { ok: false, reason: "INSUFFICIENT_GOLD" };
  if (debit.status === "duplicate") {
    // the debit already happened on the original call → the item was already granted then; do NOT grant again.
    return { ok: true, itemId: ctx.itemId, quantity, gold: debit.balance };
  }

  // 3) grant the item; refund (compensating credit) whatever did not land in the bag.
  let outcome: GrantOutcome;
  try {
    outcome = await deps.inventory.grantItems({
      accountId: ctx.accountId,
      characterId: ctx.characterId,
      capacity: ctx.capacity,
      grants: [
        {
          itemId: ctx.itemId,
          quantity,
          stackable: meta.stackable,
          uniqueEquipGroup: meta.uniqueEquipGroup,
        },
      ],
    });
  } catch (err) {
    // hard grant failure after the debit → refund the full amount, then surface (money-loud) — never keep gold
    // debited with no item delivered.
    await refund(deps.ledger, ctx, totalCost);
    throw err;
  }

  const grantedQty = outcome.granted.reduce((s, g) => s + g.quantity, 0);
  const overflowQty = quantity - grantedQty;
  let gold = debit.balance;
  if (overflowQty > 0) {
    const refundAmount = BigInt(entry.buyPrice) * BigInt(overflowQty);
    const comp = await refund(deps.ledger, ctx, refundAmount);
    gold = comp.balance;
  }
  if (grantedQty === 0) return { ok: false, reason: "INVENTORY_FULL" }; // fully refunded above (race)
  return { ok: true, itemId: ctx.itemId, quantity: grantedQty, gold };
}

/** append a compensating credit that reverses (part of) a shop_buy debit (TA §7 compensating entry). */
function refund(
  ledger: ShopLedgerSeam,
  ctx: ShopBuyContext,
  amount: bigint,
): Promise<{ status: "applied" | "duplicate" | "insufficient_funds"; balance: bigint }> {
  return ledger.appendEntry({
    characterId: ctx.characterId,
    currency: "gold",
    amount, // positive = credit back
    reason: "compensation",
    refType: "shop_buy_refund",
    refId: ctx.idempotencyKey,
    idempotencyKey: `shop-buy-refund:${ctx.idempotencyKey}`,
  });
}

/**
 * sell `quantity` from an owned bag instance. Server-authoritative — the price is read from config. See the
 * header for the consume→credit ordering.
 */
export async function sellItem(deps: ShopSellDeps, ctx: ShopSellContext): Promise<ShopSellResult> {
  const quantity = normalizeQuantity(ctx.quantity);
  if (quantity === null) return { ok: false, reason: "TRANSACTION_CONFLICT" };

  const items = await deps.inventory.listCharacterItems(ctx.characterId);
  const target = items.find((r) => r.id === ctx.instanceId);
  if (!target) return { ok: false, reason: "SHOP_ITEM_NOT_FOUND" };
  if (target.location === "CHARACTER_EQUIPMENT") return { ok: false, reason: "ITEM_EQUIPPED" };
  if (target.location !== "CHARACTER_INVENTORY") return { ok: false, reason: "SHOP_ITEM_NOT_FOUND" };
  if (target.version !== ctx.expectedVersion) return { ok: false, reason: "TRANSACTION_CONFLICT" };

  // sell price from config (§8.3 "อ่านจาก Item Definition"); absent/null or hard-excluded id → unsellable.
  const price = deps.shop.sellPrices[target.itemId];
  if (price == null || NON_SELLABLE_ITEM_IDS.has(target.itemId)) {
    return { ok: false, reason: "ITEM_UNSELLABLE" };
  }
  if (quantity > target.quantity) return { ok: false, reason: "TRANSACTION_CONFLICT" };

  // 1) consume the item (version-guarded) — a stale/concurrent client fails here, before any gold moves.
  try {
    await deps.inventory.consumeForSale({
      instanceId: target.id,
      expectedVersion: target.version,
      quantity,
    });
  } catch {
    return { ok: false, reason: "TRANSACTION_CONFLICT" }; // lost the optimistic race; nothing consumed
  }

  // 2) credit gold (idempotent). A credit never has a business rejection; a hard DB error propagates.
  const totalGain = BigInt(price) * BigInt(quantity);
  const credit = await deps.ledger.appendEntry({
    characterId: ctx.characterId,
    currency: "gold",
    amount: totalGain,
    reason: "shop_sell",
    refType: "shop_sell",
    refId: deps.shop.shopId,
    idempotencyKey: `shop-sell:${ctx.idempotencyKey}`,
  });
  return { ok: true, itemId: target.itemId, quantity, gold: credit.balance };
}
