// P2-07 — in-memory InventoryRepository (tests + local reasoning, no DB).
// Simulates the optimistic-lock + atomic-apply semantics of the Prisma impl so service.ts can be proven
// without a database (never-downgrade zone: item mutations are tested, not guessed).

import {
  VersionConflictError,
  type ClaimDeliveryInput,
  type ClaimDeliveryOutcome,
  type ConsumeForSaleInput,
  type DeliveryEntryRecord,
  type DepositInput,
  type EnhancementCommit,
  type EnhancementLogInput,
  type FragmentExchangeCommit,
  type FragmentExchangeOutcome,
  type GrantItemsInput,
  type GrantOutcome,
  type InstanceMutation,
  type InventoryRepository,
  type ItemInstanceRecord,
  type StorageMoveOutcome,
  type StorageRepository,
  type StorageTxRecord,
  type WithdrawInput,
} from "./repository";

/** a delivery entry seeded for tests (no real sender exists in P2 — §16 seed path). */
export interface SeedDeliveryEntry {
  id: string;
  accountId: string;
  source: string;
  items: { itemId: string; quantity: number }[];
  /** absolute expiry (ms epoch) — null = never. */
  expiresAtMs: number | null;
  createdAtMs?: number;
}

export interface InMemoryInventoryRepository extends InventoryRepository, StorageRepository {
  /** seed a starting instance (test setup). Returns a clone. */
  seed(record: ItemInstanceRecord): ItemInstanceRecord;
  /** raw read of one instance (assertions). */
  get(instanceId: string): ItemInstanceRecord | undefined;
  /** force-bump a version out-of-band to simulate a concurrent mutation (conflict tests). */
  bumpVersion(instanceId: string): void;
  /** append-only enhancement_logs written by commitEnhancement (assertions). */
  enhancementLogs(): EnhancementLogInput[];
  /** seed a delivery-box entry (the P2 §16 test/seed path — no real sender). */
  seedDeliveryEntry(entry: SeedDeliveryEntry): void;
}

interface DeliveryStored {
  id: string;
  accountId: string;
  source: string;
  items: { itemId: string; quantity: number }[];
  claimStatus: string;
  expiresAtMs: number | null;
  createdAtMs: number;
}

function clone(r: ItemInstanceRecord): ItemInstanceRecord {
  return { ...r };
}

export function createInMemoryInventoryRepository(): InMemoryInventoryRepository {
  const byId = new Map<string, ItemInstanceRecord>();
  const logs: EnhancementLogInput[] = [];
  const storageTx = new Map<string, StorageTxRecord>();
  const deliveries = new Map<string, DeliveryStored>();
  let grantSeq = 0;

  /** grant items into a character's bag (stack-merge / new slot). Shared by grantItems + claimDelivery. */
  function grantIntoBag(
    accountId: string,
    characterId: string,
    capacity: number,
    grants: readonly { itemId: string; quantity: number; stackable: boolean; uniqueEquipGroup: string | null }[],
  ): GrantOutcome {
    const bag = Array.from(byId.values()).filter(
      (r) => r.characterId === characterId && r.location === "CHARACTER_INVENTORY",
    );
    const used = new Set<number>();
    for (const r of bag) if (r.slot !== null) used.add(r.slot);
    const nextFreeSlot = (): number => {
      for (let s = 0; s < capacity; s++) if (!used.has(s)) return s;
      return -1;
    };
    const granted: { itemId: string; quantity: number }[] = [];
    const overflow: { itemId: string; quantity: number }[] = [];

    const placeNewInstance = (itemId: string, quantity: number, group: string | null): boolean => {
      const slot = nextFreeSlot();
      if (slot < 0) return false;
      used.add(slot);
      const id = `grant-${++grantSeq}`;
      const rec: ItemInstanceRecord = {
        id,
        accountId,
        characterId,
        itemId,
        location: "CHARACTER_INVENTORY",
        slot,
        quantity,
        enhancementLevel: 0,
        uniqueEquipGroup: group,
        version: 0,
      };
      byId.set(id, rec);
      bag.push(rec);
      return true;
    };

    for (const g of grants) {
      if (g.quantity <= 0) continue;
      if (g.stackable) {
        const stack = bag.find((r) => r.itemId === g.itemId && r.location === "CHARACTER_INVENTORY");
        if (stack) {
          stack.quantity += g.quantity;
          stack.version += 1;
          granted.push({ itemId: g.itemId, quantity: g.quantity });
        } else if (placeNewInstance(g.itemId, g.quantity, g.uniqueEquipGroup)) {
          granted.push({ itemId: g.itemId, quantity: g.quantity });
        } else {
          overflow.push({ itemId: g.itemId, quantity: g.quantity });
        }
      } else {
        let placed = 0;
        for (let n = 0; n < g.quantity; n++) {
          if (placeNewInstance(g.itemId, 1, g.uniqueEquipGroup)) placed += 1;
          else break;
        }
        if (placed > 0) granted.push({ itemId: g.itemId, quantity: placed });
        if (placed < g.quantity) overflow.push({ itemId: g.itemId, quantity: g.quantity - placed });
      }
    }
    return { granted, overflow };
  }

  return {
    enhancementLogs(): EnhancementLogInput[] {
      return logs.map((l) => ({ ...l }));
    },

    seed(record: ItemInstanceRecord): ItemInstanceRecord {
      byId.set(record.id, clone(record));
      return clone(record);
    },

    get(instanceId: string): ItemInstanceRecord | undefined {
      const r = byId.get(instanceId);
      return r ? clone(r) : undefined;
    },

    bumpVersion(instanceId: string): void {
      const r = byId.get(instanceId);
      if (r) r.version += 1;
    },

    async listCharacterItems(characterId: string): Promise<ItemInstanceRecord[]> {
      return Array.from(byId.values())
        .filter(
          (r) =>
            r.characterId === characterId &&
            (r.location === "CHARACTER_INVENTORY" || r.location === "CHARACTER_EQUIPMENT"),
        )
        .map(clone);
    },

    async applyPlan(plan: readonly InstanceMutation[]): Promise<void> {
      // verify ALL versions first (atomic: no partial write) — mirrors the tx FOR UPDATE + check.
      for (const m of plan) {
        const r = byId.get(m.instanceId);
        if (!r || r.version !== m.expectedVersion) throw new VersionConflictError();
      }
      for (const m of plan) {
        const r = byId.get(m.instanceId)!;
        r.location = m.toLocation;
        r.slot = m.toSlot;
        r.version += 1;
      }
    },

    async grantItems(input: GrantItemsInput): Promise<GrantOutcome> {
      return grantIntoBag(input.accountId, input.characterId, input.capacity, input.grants);
    },

    async commitEnhancement(commit: EnhancementCommit): Promise<void> {
      // verify BOTH rows before touching either (all-or-nothing; mirrors the tx FOR UPDATE + check).
      const t = byId.get(commit.target.instanceId);
      if (!t || t.version !== commit.target.expectedVersion) throw new VersionConflictError();
      const m = byId.get(commit.material.instanceId);
      if (!m || m.version !== commit.material.expectedVersion || m.quantity < 1) {
        throw new VersionConflictError();
      }
      // target: +1 level, bump version (the version guards a replay from double-applying).
      t.enhancementLevel = commit.target.nextLevel;
      t.version += 1;
      // material: spend 1; a depleted stack leaves the bag (location DESTROYED) so it never shows as an empty stack.
      m.quantity -= 1;
      m.version += 1;
      if (m.quantity === 0) {
        m.location = "DESTROYED";
        m.slot = null;
      }
      logs.push({ ...commit.log });
    },

    async consumeForSale(input: ConsumeForSaleInput): Promise<void> {
      const r = byId.get(input.instanceId);
      if (
        !r ||
        r.version !== input.expectedVersion ||
        input.quantity < 1 ||
        r.quantity < input.quantity
      ) {
        throw new VersionConflictError();
      }
      r.quantity -= input.quantity;
      r.version += 1;
      // a depleted stack leaves the bag (tombstone) so it never lingers as an empty slot.
      if (r.quantity === 0) {
        r.location = "DESTROYED";
        r.slot = null;
      }
    },

    async commitFragmentExchange(commit: FragmentExchangeCommit): Promise<FragmentExchangeOutcome> {
      const frag = byId.get(commit.fragmentInstanceId);
      // verify BEFORE touching anything (all-or-nothing; mirrors the tx FOR UPDATE + check).
      if (!frag || frag.location !== "CHARACTER_INVENTORY" || frag.version !== commit.fragmentExpectedVersion) {
        return { status: "conflict", grantedReinforcement: 0 };
      }
      if (commit.consumeCount < 1 || frag.quantity < commit.consumeCount) {
        return { status: "insufficient", grantedReinforcement: 0 };
      }
      // can the granted reinforcement be placed? an existing reinforcement stack always merges; otherwise it needs
      // a free slot AFTER the fragment consume (a depleted fragment stack frees its own slot).
      const bag = Array.from(byId.values()).filter(
        (r) => r.characterId === commit.characterId && r.location === "CHARACTER_INVENTORY",
      );
      const mergeStack = bag.find(
        (r) => r.itemId === commit.reinforcementItemId && r.id !== frag.id,
      );
      const fragDepletes = frag.quantity - commit.consumeCount === 0;
      if (!mergeStack) {
        const used = new Set<number>();
        for (const r of bag) if (r.slot !== null && r.id !== frag.id) used.add(r.slot);
        if (!fragDepletes && frag.slot !== null) used.add(frag.slot); // fragment slot stays occupied
        let freeSlot = -1;
        for (let s = 0; s < commit.capacity; s++) if (!used.has(s)) { freeSlot = s; break; }
        if (freeSlot < 0) return { status: "inventory_full", grantedReinforcement: 0 };
      }
      // WRITE fragment: spend consumeCount (destroy at 0).
      frag.quantity -= commit.consumeCount;
      frag.version += 1;
      if (frag.quantity === 0) {
        frag.location = "DESTROYED";
        frag.slot = null;
      }
      // WRITE reinforcement: merge or new slot (grantIntoBag re-scans the now-updated bag).
      grantIntoBag(commit.accountId, commit.characterId, commit.capacity, [
        {
          itemId: commit.reinforcementItemId,
          quantity: commit.reinforcementQuantity,
          stackable: true,
          uniqueEquipGroup: commit.reinforcementUniqueEquipGroup,
        },
      ]);
      return { status: "applied", grantedReinforcement: commit.reinforcementQuantity };
    },

    // ── P2-17 storage + delivery ─────────────────────────────────────────────
    seedDeliveryEntry(entry: SeedDeliveryEntry): void {
      deliveries.set(entry.id, {
        id: entry.id,
        accountId: entry.accountId,
        source: entry.source,
        items: entry.items.map((i) => ({ ...i })),
        claimStatus: "unclaimed",
        expiresAtMs: entry.expiresAtMs,
        createdAtMs: entry.createdAtMs ?? Date.now(),
      });
    },

    async listAccountStorage(accountId: string): Promise<ItemInstanceRecord[]> {
      return Array.from(byId.values())
        .filter((r) => r.accountId === accountId && r.location === "ACCOUNT_STORAGE")
        .map(clone);
    },

    async findStorageTx(idempotencyKey: string): Promise<StorageTxRecord | null> {
      const tx = storageTx.get(idempotencyKey);
      return tx ? { ...tx } : null;
    },

    async deposit(input: DepositInput): Promise<StorageMoveOutcome> {
      if (storageTx.has(input.idempotencyKey)) return { status: "duplicate" };
      const r = byId.get(input.instanceId);
      // source must be THIS character's bag item, at the expected version, owned by THIS account.
      if (
        !r ||
        r.location !== "CHARACTER_INVENTORY" ||
        r.characterId !== input.characterId ||
        r.accountId !== input.accountId
      ) {
        return { status: "version_conflict" };
      }
      if (r.version !== input.expectedVersion) return { status: "version_conflict" };
      const stored = Array.from(byId.values()).filter(
        (x) => x.accountId === input.accountId && x.location === "ACCOUNT_STORAGE",
      );
      if (stored.length >= input.storageCapacity) return { status: "capacity_full" };
      const used = new Set<number>();
      for (const x of stored) if (x.slot !== null) used.add(x.slot);
      let slot = 0;
      while (used.has(slot)) slot++;
      r.location = "ACCOUNT_STORAGE";
      r.characterId = null;
      r.slot = slot;
      r.version += 1;
      storageTx.set(input.idempotencyKey, {
        idempotencyKey: input.idempotencyKey,
        action: "deposit",
        itemInstanceId: r.id,
        itemId: r.itemId,
        quantity: r.quantity,
      });
      return { status: "applied" };
    },

    async withdraw(input: WithdrawInput): Promise<StorageMoveOutcome> {
      if (storageTx.has(input.idempotencyKey)) return { status: "duplicate" };
      const r = byId.get(input.instanceId);
      if (!r || r.location !== "ACCOUNT_STORAGE" || r.accountId !== input.accountId) {
        return { status: "version_conflict" };
      }
      if (r.version !== input.expectedVersion) return { status: "version_conflict" };
      const bag = Array.from(byId.values()).filter(
        (x) => x.characterId === input.characterId && x.location === "CHARACTER_INVENTORY",
      );
      const used = new Set<number>();
      for (const x of bag) if (x.slot !== null) used.add(x.slot);
      let slot = -1;
      for (let s = 0; s < input.bagCapacity; s++) {
        if (!used.has(s)) {
          slot = s;
          break;
        }
      }
      if (slot < 0) return { status: "capacity_full" };
      r.location = "CHARACTER_INVENTORY";
      r.characterId = input.characterId;
      r.slot = slot;
      r.version += 1;
      storageTx.set(input.idempotencyKey, {
        idempotencyKey: input.idempotencyKey,
        action: "withdraw",
        itemInstanceId: r.id,
        itemId: r.itemId,
        quantity: r.quantity,
      });
      return { status: "applied" };
    },

    async listDeliveryEntries(accountId: string): Promise<DeliveryEntryRecord[]> {
      return Array.from(deliveries.values())
        .filter((e) => e.accountId === accountId)
        .map((e) => ({
          id: e.id,
          accountId: e.accountId,
          source: e.source,
          items: e.items.map((i) => ({ ...i })),
          claimStatus: e.claimStatus,
          expiresAt: e.expiresAtMs === null ? null : new Date(e.expiresAtMs),
          createdAt: new Date(e.createdAtMs),
        }));
    },

    async claimDelivery(input: ClaimDeliveryInput): Promise<ClaimDeliveryOutcome> {
      if (storageTx.has(input.idempotencyKey)) return { status: "duplicate", granted: [] };
      const entry = deliveries.get(input.entryId);
      if (!entry || entry.accountId !== input.accountId) return { status: "not_found", granted: [] };
      if (entry.claimStatus === "claimed") return { status: "duplicate", granted: [] };
      if (entry.expiresAtMs !== null && entry.expiresAtMs <= input.nowMs) {
        return { status: "expired", granted: [] };
      }
      // precheck bag holds ALL items (all-or-nothing §16.5): dry-run against a scratch capacity model.
      const bag = Array.from(byId.values()).filter(
        (x) => x.characterId === input.characterId && x.location === "CHARACTER_INVENTORY",
      );
      const usedSlots = new Set<number>();
      for (const x of bag) if (x.slot !== null) usedSlots.add(x.slot);
      let freeSlots = 0;
      for (let s = 0; s < input.bagCapacity; s++) if (!usedSlots.has(s)) freeSlots++;
      const existingStackItems = new Set(bag.map((x) => x.itemId));
      // delivery items are treated as stackable (materials/consumables) — one that has no existing stack needs a
      // slot; the payload may still carry equipment (non-stackable) → one slot each. metadata comes from the
      // service via the grant call below; here we approximate by itemId uniqueness for the precheck.
      const newStackNeeds = new Set<string>();
      for (const it of entry.items) {
        if (!existingStackItems.has(it.itemId)) newStackNeeds.add(it.itemId);
      }
      if (newStackNeeds.size > freeSlots) return { status: "inventory_full", granted: [] };

      const outcome = grantIntoBag(
        input.accountId,
        input.characterId,
        input.bagCapacity,
        entry.items.map((i) => ({ itemId: i.itemId, quantity: i.quantity, stackable: true, uniqueEquipGroup: null })),
      );
      if (outcome.overflow.length > 0) {
        // precheck said it fits — an overflow here would mean a modeling bug; treat as inventory_full (nothing
        // is half-committed in the mem repo because grantIntoBag already mutated, but the precheck prevents this).
        return { status: "inventory_full", granted: [] };
      }
      entry.claimStatus = "claimed";
      storageTx.set(input.idempotencyKey, {
        idempotencyKey: input.idempotencyKey,
        action: "claim_to_inventory",
        itemInstanceId: null,
        itemId: null,
        quantity: entry.items.reduce((s, i) => s + i.quantity, 0),
      });
      return { status: "applied", granted: outcome.granted };
    },
  };
}
