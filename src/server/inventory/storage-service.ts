// P2-17 — personal storage + delivery box service (orchestration). **PURE + SERVER-AUTHORITATIVE,
// never-downgrade zone (items are money-like).** Depends only on the repo seams + ItemCatalog + plain config
// values → unit tested with the in-memory repo, no DB / no .env.
//
// The client sends an intent (instanceId + the version it last saw + an idempotency key); the server decides
// everything (Storage §22). Idempotency is layered: a pre-check on `findStorageTx` covers the replay case
// (where the item has already moved and policy can no longer be evaluated from the bag), and the repo's own
// in-transaction idempotency covers the concurrent race — a replay is always a no-op that reports success.
//
// DESIGN DECISIONS (chosen here — see the P2-17 report):
//  • Deposit/withdraw relocate the WHOLE instance (no quantity split, no §13.3 stack-merge in P2) → the
//    instanceId is stable, so the storage_transaction_log idempotency key always points at a live row.
//  • CONDITIONAL storagePolicy is refused (ITEM_BOUND) in P2: no generic way to evaluate the "remove the
//    condition first" gate, and no Map 1 item is CONDITIONAL — conservative, never mislays an item.
//  • Delivery claim treats payload items as stackable (materials/consumables) — the P2 reward shape; an
//    equipment/market delivery is a P2B/P4 concern (§16.2).

import type { InventoryRepository, ItemInstanceRecord, StorageRepository } from "./repository";
import { sharingPolicyOf, type ItemCatalog } from "./item-catalog";
import { buildSnapshot } from "./service";
import type {
  DeliveryEntryStatus,
  DeliveryEntryView,
  DeliveryStateMessage,
  InventorySnapshot,
  LootLine,
  StorageFillState,
  StorageItemView,
  StorageStateMessage,
} from "@/shared/net-protocol";

const MS_PER_DAY = 86_400_000;

/** deposit reject codes (§13.2) + withdraw (§14). */
export type StorageOpReason =
  | "NO_ITEM" // instance not owned by this character / not an inventory item
  | "ITEM_BOUND" // §12.4 CHARACTER_BOUND / BLOCKED / CONDITIONAL policy — cannot deposit
  | "ITEM_EQUIPPED" // §12.3 must unequip first
  | "STORAGE_FULL" // §15 storage at capacity
  | "INVENTORY_FULL" // §14 receiving bag full on withdraw
  | "ITEM_CHANGED" // §19.4 stale version / instance moved
  | "TRANSACTION_CONFLICT"; // lost optimistic race

export type StorageOpResult =
  | { ok: true; storage: StorageStateMessage }
  | { ok: false; reason: StorageOpReason };

/** claim reject codes (§16.4/§16.5). */
export type DeliveryClaimReason = "NOT_FOUND" | "EXPIRED" | "INVENTORY_FULL" | "TRANSACTION_CONFLICT";

export type DeliveryClaimResult =
  | { ok: true; granted: LootLine[]; delivery: DeliveryStateMessage }
  | { ok: false; reason: DeliveryClaimReason };

export interface StorageServiceDeps {
  repo: InventoryRepository & StorageRepository;
  catalog: ItemCatalog;
  /** account-shared storage capacity (§10.1 = 200). */
  capacity: number;
  /** §15.1 fill-state thresholds (80 / 90). */
  fill: { warnPercent: number; alertPercent: number };
}

export interface DeliveryServiceDeps {
  repo: StorageRepository;
  /** §16.3 = 50. */
  maxEntries: number;
  /** §16.4 warning thresholds. */
  warnDaysBeforeExpiry: number;
  urgentDaysBeforeExpiry: number;
}

export interface StorageMoveIntent {
  accountId: string;
  characterId: string;
  instanceId: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface DeliveryClaimIntent {
  accountId: string;
  characterId: string;
  entryId: string;
  /** bag capacity of the receiving character (§1.2). */
  bagCapacity: number;
  /** server time (ms) — expiry check. */
  nowMs: number;
  idempotencyKey: string;
}

// ── snapshot builders (server-authoritative wire shapes) ─────────────────────

function toStorageView(r: ItemInstanceRecord): StorageItemView {
  return {
    instanceId: r.id,
    itemId: r.itemId,
    slot: r.slot ?? -1,
    quantity: r.quantity,
    enhancementLevel: r.enhancementLevel,
    version: r.version,
  };
}

/** §15.1 fill state from used/capacity (full at 100%, alert ≥90%, warn ≥80%). */
export function fillStateOf(
  used: number,
  capacity: number,
  fill: { warnPercent: number; alertPercent: number },
): StorageFillState {
  if (capacity <= 0 || used >= capacity) return "full";
  const pct = (used / capacity) * 100;
  if (pct >= fill.alertPercent) return "alert";
  if (pct >= fill.warnPercent) return "warn";
  return "normal";
}

/** build the account-storage snapshot (§11.1). `available` = whether the caller's map has the storage NPC. */
export function buildStorageSnapshot(
  items: readonly ItemInstanceRecord[],
  capacity: number,
  fill: { warnPercent: number; alertPercent: number },
  available: boolean,
): StorageStateMessage {
  const views = items.map(toStorageView).sort((a, b) => a.slot - b.slot);
  return {
    available,
    capacity,
    used: views.length,
    fillState: fillStateOf(views.length, capacity, fill),
    items: views,
  };
}

/** §16.4 warn state from expiry vs now (server computes — reward must never expire silently). */
export function deliveryStatusOf(
  expiresAt: Date | null,
  nowMs: number,
  warnDays: number,
  urgentDays: number,
): DeliveryEntryStatus {
  if (!expiresAt) return "none";
  const remainMs = expiresAt.getTime() - nowMs;
  if (remainMs <= 0) return "expired";
  const remainDays = remainMs / MS_PER_DAY;
  if (remainDays <= urgentDays) return "expiring_urgent";
  if (remainDays <= warnDays) return "expiring_soon";
  return "none";
}

/** build the Delivery Box snapshot (§16.6) with server-computed per-entry expiry status. */
export async function buildDeliverySnapshot(
  deps: DeliveryServiceDeps,
  accountId: string,
  nowMs: number,
  available: boolean,
): Promise<DeliveryStateMessage> {
  const entries = await deps.repo.listDeliveryEntries(accountId);
  const views: DeliveryEntryView[] = entries.map((e) => ({
    entryId: e.id,
    source: e.source,
    items: e.items.map((i): LootLine => ({ itemId: i.itemId, quantity: i.quantity })),
    claimStatus: e.claimStatus,
    expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
    status: deliveryStatusOf(e.expiresAt, nowMs, deps.warnDaysBeforeExpiry, deps.urgentDaysBeforeExpiry),
  }));
  return { available, maxEntries: deps.maxEntries, used: views.length, entries: views };
}

/** load bag + worn gear then build the inventory snapshot (used by the MapRoom after a storage move). */
export async function buildBagSnapshot(
  repo: InventoryRepository,
  characterId: string,
  bagCapacity: number,
): Promise<InventorySnapshot> {
  const items = await repo.listCharacterItems(characterId);
  return buildSnapshot(items, bagCapacity);
}

// ── operations ───────────────────────────────────────────────────────────────

async function storageSnapshot(deps: StorageServiceDeps, accountId: string): Promise<StorageStateMessage> {
  const items = await deps.repo.listAccountStorage(accountId);
  return buildStorageSnapshot(items, deps.capacity, deps.fill, true);
}

/** deposit one bag item into account storage (§13). Server-authoritative — policy + capacity from config. */
export async function depositToStorage(
  deps: StorageServiceDeps,
  input: StorageMoveIntent,
): Promise<StorageOpResult> {
  // idempotency pre-check — a replay's item has already moved out of the bag, so validate nothing, report done.
  const prior = await deps.repo.findStorageTx(input.idempotencyKey);
  if (prior) return { ok: true, storage: await storageSnapshot(deps, input.accountId) };

  const items = await deps.repo.listCharacterItems(input.characterId);
  const target = items.find((r) => r.id === input.instanceId);
  if (!target) return { ok: false, reason: "ITEM_CHANGED" };
  if (target.location === "CHARACTER_EQUIPMENT") return { ok: false, reason: "ITEM_EQUIPPED" };
  if (target.location !== "CHARACTER_INVENTORY") return { ok: false, reason: "NO_ITEM" };
  if (target.version !== input.expectedVersion) return { ok: false, reason: "ITEM_CHANGED" };

  // §12.4 policy gate: CHARACTER_BOUND / BLOCKED / CONDITIONAL cannot be deposited.
  const policy = sharingPolicyOf(deps.catalog.get(target.itemId));
  if (
    policy.bindType === "CHARACTER_BOUND" ||
    policy.storagePolicy === "BLOCKED" ||
    policy.storagePolicy === "CONDITIONAL"
  ) {
    return { ok: false, reason: "ITEM_BOUND" };
  }

  const outcome = await deps.repo.deposit({
    accountId: input.accountId,
    characterId: input.characterId,
    instanceId: input.instanceId,
    expectedVersion: input.expectedVersion,
    storageCapacity: deps.capacity,
    idempotencyKey: input.idempotencyKey,
  });
  switch (outcome.status) {
    case "applied":
    case "duplicate":
      return { ok: true, storage: await storageSnapshot(deps, input.accountId) };
    case "capacity_full":
      return { ok: false, reason: "STORAGE_FULL" };
    case "version_conflict":
      return { ok: false, reason: "TRANSACTION_CONFLICT" };
  }
}

/** withdraw one storage item back into the character's bag (§14). */
export async function withdrawFromStorage(
  deps: StorageServiceDeps,
  input: StorageMoveIntent & { bagCapacity: number },
): Promise<StorageOpResult> {
  const prior = await deps.repo.findStorageTx(input.idempotencyKey);
  if (prior) return { ok: true, storage: await storageSnapshot(deps, input.accountId) };

  const stored = await deps.repo.listAccountStorage(input.accountId);
  const target = stored.find((r) => r.id === input.instanceId);
  if (!target) return { ok: false, reason: "ITEM_CHANGED" };
  if (target.version !== input.expectedVersion) return { ok: false, reason: "ITEM_CHANGED" };

  const outcome = await deps.repo.withdraw({
    accountId: input.accountId,
    characterId: input.characterId,
    instanceId: input.instanceId,
    expectedVersion: input.expectedVersion,
    bagCapacity: input.bagCapacity,
    idempotencyKey: input.idempotencyKey,
  });
  switch (outcome.status) {
    case "applied":
    case "duplicate":
      return { ok: true, storage: await storageSnapshot(deps, input.accountId) };
    case "capacity_full":
      return { ok: false, reason: "INVENTORY_FULL" };
    case "version_conflict":
      return { ok: false, reason: "TRANSACTION_CONFLICT" };
  }
}

/** claim one delivery entry into the character's bag (§16.5). All-or-nothing per entry, idempotent. */
export async function claimDeliveryEntry(
  deps: DeliveryServiceDeps,
  input: DeliveryClaimIntent,
): Promise<DeliveryClaimResult> {
  const outcome = await deps.repo.claimDelivery({
    accountId: input.accountId,
    characterId: input.characterId,
    entryId: input.entryId,
    bagCapacity: input.bagCapacity,
    nowMs: input.nowMs,
    idempotencyKey: input.idempotencyKey,
  });
  switch (outcome.status) {
    case "applied":
    case "duplicate": {
      const delivery = await buildDeliverySnapshot(deps, input.accountId, input.nowMs, true);
      const granted = outcome.granted.map((g): LootLine => ({ itemId: g.itemId, quantity: g.quantity }));
      return { ok: true, granted, delivery };
    }
    case "not_found":
      return { ok: false, reason: "NOT_FOUND" };
    case "expired":
      return { ok: false, reason: "EXPIRED" };
    case "inventory_full":
      return { ok: false, reason: "INVENTORY_FULL" };
  }
}
