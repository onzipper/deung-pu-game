// P2-07 — inventory repository contract (pattern = src/server/characters/repository.ts).
//
// service.ts depends ONLY on this interface (never on Prisma) → unit-tested via memory-repository.ts.
// Prisma-backed impl (FOR UPDATE + optimistic `version` check inside a $transaction) = prisma-repository.ts.
// **ห้ามให้ service/memory-repo import Prisma** (keeps combat/inventory logic testable with no DB).

/**
 * item location — mirrors the `ItemLocation` enum in prisma/schema.prisma (§50.1: field/enum names are
 * copied verbatim, never renamed). Declared as a local union so the pure service + tests need no Prisma
 * client. P2-07 only moves items between CHARACTER_INVENTORY and CHARACTER_EQUIPMENT.
 */
export type ItemLocationValue =
  | "CHARACTER_INVENTORY"
  | "CHARACTER_EQUIPMENT"
  | "ACCOUNT_STORAGE"
  | "DELIVERY_BOX"
  | "MARKET_ESCROW"
  | "WORLD_LOOT"
  | "DESTROYED";

/** subset of prisma model ItemInstance that inventory logic needs (schema.prisma model ItemInstance). */
export interface ItemInstanceRecord {
  id: string;
  accountId: string;
  /** required when location = CHARACTER_* (schema invariant) */
  characterId: string | null;
  itemId: string;
  location: ItemLocationValue;
  /** bag slot / equipment slot id (null = unslotted) */
  slot: number | null;
  quantity: number;
  enhancementLevel: number;
  /** §12.1 anti-dup group (null = none) */
  uniqueEquipGroup: string | null;
  /** optimistic lock — bumped on every mutation (TA §7/§22) */
  version: number;
}

/**
 * one atomic instance move within a plan. `expectedVersion` = the version the service read; applyPlan must
 * re-verify it under a row lock (concurrent mutation between read and write ⟹ mismatch ⟹ conflict).
 */
export interface InstanceMutation {
  instanceId: string;
  expectedVersion: number;
  toLocation: ItemLocationValue;
  toSlot: number;
}

/** thrown by applyPlan when any instance's version no longer matches (nothing is applied — all-or-nothing). */
export class VersionConflictError extends Error {
  constructor() {
    super("item instance version conflict (optimistic lock)");
    this.name = "VersionConflictError";
  }
}

/**
 * P2-10 guaranteed reinforcement audit row (schema.prisma model EnhancementLog, append-only, §50.1 names).
 * No idempotencyKey column exists on enhancement_logs, so the double-apply guard is the target's optimistic
 * `version` (a retry with a stale expectedVersion is rejected before this row is written).
 */
export interface EnhancementLogInput {
  characterId: string;
  /** target equipment instance id (item_instances.id) */
  itemInstanceId: string;
  beforeLevel: number;
  afterLevel: number;
  /** enhancement/economy config version in effect (EnhancementLog.configVersion, nullable). */
  configVersion: number | null;
}

/**
 * one guaranteed-reinforcement transaction (Reinforcement §2.3): consume 1 material + raise the target's
 * enhancement level, all under row locks. `nextLevel` = target.enhancementLevel + 1 (server computed).
 */
export interface EnhancementCommit {
  target: { instanceId: string; expectedVersion: number; nextLevel: number };
  /** the `upg_reinforcement` stack to spend 1 from (qty-1; the stack is destroyed when it hits 0). */
  material: { instanceId: string; expectedVersion: number };
  log: EnhancementLogInput;
}

/**
 * P2-09 drop grant — one item to insert into the bag. `stackable` items merge into an existing bag stack of the
 * same itemId (quantity+n); non-stackable (equipment) create one instance per unit, each taking its own slot.
 * `uniqueEquipGroup` is the §12.1 anti-dup stamp from the item def (equipment; null otherwise).
 */
export interface ItemGrantRequest {
  itemId: string;
  quantity: number;
  stackable: boolean;
  uniqueEquipGroup: string | null;
}

/**
 * result of grantItems. `granted` = what actually landed in the bag; `overflow` = what didn't fit (bag full).
 * §12.5 forbids silent loss — the caller audits overflow (inventory_full) and signals the client. No ground-loot
 * entity exists in this runtime, so overflow items are NOT persisted (see the P2-09 report deviation).
 */
export interface GrantOutcome {
  granted: { itemId: string; quantity: number }[];
  overflow: { itemId: string; quantity: number }[];
}

export interface GrantItemsInput {
  /** owning account (ItemInstance.accountId — the true owner, Storage §22). */
  accountId: string;
  characterId: string;
  /** bag capacity — bag slots are [0, capacity); a grant that can't find a free slot overflows. */
  capacity: number;
  grants: readonly ItemGrantRequest[];
}

export interface InventoryRepository {
  /** all CHARACTER_INVENTORY + CHARACTER_EQUIPMENT instances of one character (the bag + worn gear). */
  listCharacterItems(characterId: string): Promise<ItemInstanceRecord[]>;
  /**
   * P2-09 loot grant (never-downgrade zone: items are money-like): insert dropped items into the bag in ONE
   * transaction. Stackable items merge into an existing same-itemId bag stack (quantity+n, bump version);
   * non-stackable items create one instance per unit at the next free slot. When the bag is full a grant
   * overflows (returned, NOT persisted — §12.5 no-silent-loss handled by the caller's audit + client signal).
   * **Strict** — a DB error propagates (a drop that did not persist must not look granted).
   */
  grantItems(input: GrantItemsInput): Promise<GrantOutcome>;
  /**
   * apply every mutation atomically (all-or-nothing): lock each row (FOR UPDATE), verify `version` ===
   * `expectedVersion`, then set location+slot and bump version. Any mismatch → throw VersionConflictError
   * (no partial write). Empty plan = no-op. **Strict** (DB error propagates — never silently succeed).
   */
  applyPlan(plan: readonly InstanceMutation[]): Promise<void>;
  /**
   * P2-10 guaranteed reinforcement (Reinforcement §2.3, never-downgrade zone): in ONE transaction, lock the
   * target + material rows (FOR UPDATE), verify both versions (and material quantity ≥ 1), then set the
   * target's enhancementLevel = `nextLevel` (+bump version), spend 1 material (qty-1; destroy the stack at 0),
   * and append the enhancement_logs row. Any version mismatch / material depleted → VersionConflictError
   * (nothing applied). **Strict** — DB error propagates (a reinforcement that did not persist must not look
   * like it worked). No RNG (guaranteed 100%): the log's `rngRoll` is a fixed sentinel.
   */
  commitEnhancement(commit: EnhancementCommit): Promise<void>;
  /**
   * P2-11 shop sell (never-downgrade zone: items are money-like): consume `quantity` from ONE owned bag
   * instance in a single row-locked transaction. Lock the row (FOR UPDATE), verify `version` ===
   * `expectedVersion` **and** the stock is ≥ `quantity`; then decrement `quantity` (bump version). A stack
   * that hits 0 leaves the bag (location DESTROYED, slot cleared — tombstone for audit). Any version mismatch
   * / insufficient stock → VersionConflictError (nothing applied). **Strict** — DB error propagates.
   */
  consumeForSale(input: ConsumeForSaleInput): Promise<void>;
}

/** one shop-sell consume (P2-11): spend `quantity` from a bag instance under an optimistic-version guard. */
export interface ConsumeForSaleInput {
  instanceId: string;
  expectedVersion: number;
  quantity: number;
}

// ── P2-17 personal storage + delivery box (Storage §13/§14/§16/§22) ───────────────────────────────────
//
// Deposit/withdraw **relocate one whole instance** (no quantity split / no stack-merge in P2 — the §13.3
// merge is a UI optimization deferred; whole-instance relocation keeps the instanceId stable so the
// storage_transaction_log idempotency key always references a live row → never-downgrade safe). Every move is
// atomic + idempotent through `storage_transaction_log` (unique key): a replay is a no-op that reports the
// prior result. All money-like item mutations here are a **never-downgrade zone** — DB errors propagate.

/** one storage_transaction_log row read back for idempotency (schema.prisma StorageTransactionLog, §22). */
export interface StorageTxRecord {
  idempotencyKey: string;
  action: "deposit" | "withdraw" | "claim_to_inventory" | "claim_to_storage";
  itemInstanceId: string | null;
  itemId: string | null;
  quantity: number;
}

/** deposit one bag instance → ACCOUNT_STORAGE (§13). storageCapacity = account-shared cap (§10.1). */
export interface DepositInput {
  accountId: string;
  characterId: string;
  instanceId: string;
  expectedVersion: number;
  storageCapacity: number;
  idempotencyKey: string;
}

/** withdraw one ACCOUNT_STORAGE instance → the withdrawing character's bag (§14). bagCapacity = §1.2. */
export interface WithdrawInput {
  accountId: string;
  characterId: string;
  instanceId: string;
  expectedVersion: number;
  bagCapacity: number;
  idempotencyKey: string;
}

/**
 * outcome of an atomic storage move (mirrors the ledger's status discriminant):
 *   applied · duplicate (idempotency replay → move already done) · version_conflict (optimistic-lock mismatch
 *   OR the instance is no longer in the expected source location) · capacity_full (destination has no free slot).
 */
export type StorageMoveStatus = "applied" | "duplicate" | "version_conflict" | "capacity_full";
export interface StorageMoveOutcome {
  status: StorageMoveStatus;
}

/** one delivery entry the client sees (§16.6). payload is materialized into instances only on claim (§16). */
export interface DeliveryEntryRecord {
  id: string;
  accountId: string;
  /** DeliverySource enum value (schema.prisma) — drives the expiry policy (§16.4). */
  source: string;
  /** items carried by the entry (parsed from the JSON payload). */
  items: { itemId: string; quantity: number }[];
  /** "unclaimed" | "claimed" (§16.8 per-entry atomic). */
  claimStatus: string;
  /** absolute expiry (§16.4) — null = never. */
  expiresAt: Date | null;
  createdAt: Date;
}

/** claim one delivery entry's items into the character's bag (all-or-nothing per entry, §16.5/§16.8). */
export interface ClaimDeliveryInput {
  accountId: string;
  characterId: string;
  entryId: string;
  bagCapacity: number;
  /** server time (ms) for the expiry check — injected for testability. */
  nowMs: number;
  idempotencyKey: string;
}

/**
 * claim outcome: applied (items granted, entry marked claimed) · duplicate (entry already claimed / replay →
 * items already granted) · not_found · expired (§16.4) · inventory_full (bag can't hold ALL items → nothing
 * granted, entry stays unclaimed so the reward is never lost, §16.5).
 */
export type ClaimDeliveryStatus = "applied" | "duplicate" | "not_found" | "expired" | "inventory_full";
export interface ClaimDeliveryOutcome {
  status: ClaimDeliveryStatus;
  granted: { itemId: string; quantity: number }[];
}

/**
 * account-level storage + delivery (Storage §10–§16, §22). Same `item_instances` table as the character
 * inventory (location model) → a deposited item is one UPDATE of location, and a different character on the
 * same account sees it via {@link listAccountStorage}. Implemented by both the in-memory + Prisma repos.
 */
export interface StorageRepository {
  /** every ACCOUNT_STORAGE instance of the account (shared across all its characters, §10.1). */
  listAccountStorage(accountId: string): Promise<ItemInstanceRecord[]>;
  /** the committed storage_transaction_log row for `idempotencyKey`, or null (idempotency pre-check, §22). */
  findStorageTx(idempotencyKey: string): Promise<StorageTxRecord | null>;
  /**
   * deposit: CHARACTER_INVENTORY → ACCOUNT_STORAGE in ONE transaction — check the idempotency key, lock the
   * instance (FOR UPDATE), verify it is the character's bag item at `expectedVersion`, verify storage has a
   * free slot (< storageCapacity), relocate it (characterId→null, next storage slot, bump version), and append
   * the storage_transaction_log row. **Strict** — DB errors propagate.
   */
  deposit(input: DepositInput): Promise<StorageMoveOutcome>;
  /** withdraw: ACCOUNT_STORAGE → the withdrawing character's bag. Mirror of deposit; guards bag capacity. */
  withdraw(input: WithdrawInput): Promise<StorageMoveOutcome>;
  /** every delivery entry of the account (§16.6) with its items + absolute expiry (server computes status). */
  listDeliveryEntries(accountId: string): Promise<DeliveryEntryRecord[]>;
  /**
   * claim one delivery entry's items into the character's bag, atomic + idempotent (§16.5/§16.8): lock the
   * entry, reject if not this account / expired, precheck the bag holds ALL items (else inventory_full,
   * nothing granted), grant them, mark the entry claimed, append the log row. **Strict**.
   */
  claimDelivery(input: ClaimDeliveryInput): Promise<ClaimDeliveryOutcome>;
}
