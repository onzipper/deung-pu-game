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

export interface InventoryRepository {
  /** all CHARACTER_INVENTORY + CHARACTER_EQUIPMENT instances of one character (the bag + worn gear). */
  listCharacterItems(characterId: string): Promise<ItemInstanceRecord[]>;
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
}
