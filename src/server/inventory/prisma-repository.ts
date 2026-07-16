// P2-07 — Prisma-backed InventoryRepository (model ItemInstance — schema.prisma, P2-02b).
//
// Atomicity contract (TA §7/§22, mirror server/db/ledger.ts): every mutation runs inside a single
// $transaction that (1) SELECT ... FOR UPDATE locks each affected row in a deterministic order (deadlock
// safe), (2) verifies `version` === expectedVersion (optimistic lock) — mismatch ⇒ VersionConflictError,
// nothing written, (3) UPDATE location+slot and bump version. Reads use `characterId` scope only (ownership
// is enforced upstream by onAuth; service never crosses accounts). **Strict** — DB errors propagate.
//
// ⚠️ Not unit-tested against a real DB (repo rule: no live DB in tests). Correctness is reviewed against the
//    ledger pattern; the pure decision logic it applies is covered via the in-memory repo.

import type { EnhancementResult, ItemLocation, StorageTxAction } from "@prisma/client";
import { getPrisma } from "../db";
import {
  VersionConflictError,
  type ClaimDeliveryInput,
  type ClaimDeliveryOutcome,
  type ConsumeForSaleInput,
  type DeliveryEntryRecord,
  type DepositInput,
  type EnhancementCommit,
  type FragmentExchangeCommit,
  type FragmentExchangeOutcome,
  type GrantItemsInput,
  type GrantOutcome,
  type InstanceMutation,
  type InventoryRepository,
  type ItemInstanceRecord,
  type ItemLocationValue,
  type StorageMoveOutcome,
  type StorageRepository,
  type StorageTxRecord,
  type WithdrawInput,
} from "./repository";

/** minimal duplicate-key detection (mirrors server/db/ledger.ts) — a raced unique(idempotency_key) = replay. */
function isDuplicateKeyError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
  if (e.code === "P2002") return true;
  if (e.code === "P2010" && e.meta?.code === "1062") return true;
  return typeof e.message === "string" && /Duplicate entry/i.test(e.message);
}

/** one delivery payload item (schema.prisma DeliveryBoxEntry.payload JSON — `{ items: [...] }`). */
interface DeliveryPayloadItem {
  itemId: string;
  quantity: number;
}
function parsePayloadItems(payload: unknown): DeliveryPayloadItem[] {
  if (typeof payload !== "object" || payload === null) return [];
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const out: DeliveryPayloadItem[] = [];
  for (const it of items) {
    if (typeof it !== "object" || it === null) continue;
    const r = it as { itemId?: unknown; quantity?: unknown };
    if (typeof r.itemId === "string" && typeof r.quantity === "number" && r.quantity > 0) {
      out.push({ itemId: r.itemId, quantity: Math.floor(r.quantity) });
    }
  }
  return out;
}

/**
 * Guaranteed reinforcement is 100% success with NO RNG (Reinforcement §2.1), but schema.prisma
 * EnhancementLog.rngRoll is a required Float. We write this fixed sentinel to satisfy the column while making
 * it unmistakable that no roll happened (schema is owner-gated — a dedicated flag would need §59.4).
 */
const GUARANTEED_RNG_ROLL = 1;
const ENHANCEMENT_SUCCESS: EnhancementResult = "success";

interface ItemInstanceRow {
  id: string;
  accountId: string;
  characterId: string | null;
  itemId: string;
  location: string;
  slot: number | null;
  quantity: number;
  enhancementLevel: number;
  uniqueEquipGroup: string | null;
  version: number;
}

function toRecord(row: ItemInstanceRow): ItemInstanceRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    characterId: row.characterId,
    itemId: row.itemId,
    location: row.location as ItemLocationValue,
    slot: row.slot,
    quantity: row.quantity,
    enhancementLevel: row.enhancementLevel,
    uniqueEquipGroup: row.uniqueEquipGroup,
    version: row.version,
  };
}

const CHARACTER_LOCATIONS = ["CHARACTER_INVENTORY", "CHARACTER_EQUIPMENT"] as ItemLocation[];

export function createPrismaInventoryRepository(): InventoryRepository & StorageRepository {
  return {
    async listCharacterItems(characterId: string): Promise<ItemInstanceRecord[]> {
      const rows = await getPrisma().itemInstance.findMany({
        where: { characterId, location: { in: CHARACTER_LOCATIONS } },
      });
      return rows.map((r) => toRecord(r as unknown as ItemInstanceRow));
    },

    async applyPlan(plan: readonly InstanceMutation[]): Promise<void> {
      if (plan.length === 0) return;
      // deterministic lock order (by instanceId) → no lock-cycle deadlock across concurrent swaps.
      const ordered = [...plan].sort((a, b) => a.instanceId.localeCompare(b.instanceId));

      await getPrisma().$transaction(async (tx) => {
        // 1) LOCK + 2) CHECK every row first (all-or-nothing) — any mismatch aborts before a single write.
        for (const m of ordered) {
          const rows = await tx.$queryRaw<{ version: number }[]>`
            SELECT version FROM item_instances WHERE id = ${m.instanceId} FOR UPDATE
          `;
          const current = rows[0];
          if (!current || current.version !== m.expectedVersion) {
            throw new VersionConflictError(); // rolls back the transaction — nothing applied
          }
        }
        // 3) WRITE — set location+slot, bump version (version guards the next reader).
        for (const m of ordered) {
          await tx.itemInstance.update({
            where: { id: m.instanceId },
            data: {
              location: m.toLocation as ItemLocation,
              slot: m.toSlot,
              version: { increment: 1 },
            },
          });
        }
      });
    },

    async grantItems(input: GrantItemsInput): Promise<GrantOutcome> {
      const granted: { itemId: string; quantity: number }[] = [];
      const overflow: { itemId: string; quantity: number }[] = [];
      if (input.grants.length === 0) return { granted, overflow };

      await getPrisma().$transaction(async (tx) => {
        // lock the character's bag rows (character-scoped) → serialize grants vs concurrent equip/move so two
        // grants can't race for the same free slot. new inserts are protected by the same range.
        await tx.$queryRaw`
          SELECT id FROM item_instances
          WHERE character_id = ${input.characterId} AND location = 'CHARACTER_INVENTORY'
          FOR UPDATE
        `;
        const bagRows = await tx.itemInstance.findMany({
          where: { characterId: input.characterId, location: "CHARACTER_INVENTORY" as ItemLocation },
        });
        const used = new Set<number>();
        for (const r of bagRows) if (r.slot !== null && r.slot !== undefined) used.add(r.slot);
        const stacks = new Map<string, ItemInstanceRow>();
        for (const r of bagRows) {
          const row = r as unknown as ItemInstanceRow;
          if (!stacks.has(row.itemId)) stacks.set(row.itemId, row);
        }
        const nextFreeSlot = (): number => {
          for (let s = 0; s < input.capacity; s++) if (!used.has(s)) return s;
          return -1;
        };

        for (const g of input.grants) {
          if (g.quantity <= 0) continue;
          // FK: item_instances.item_id → items.id. auto-register the def id (idempotent registry, not a schema
          // change) so a fresh drop never fails the FK on an empty items table.
          await tx.item.upsert({ where: { id: g.itemId }, create: { id: g.itemId }, update: {} });

          if (g.stackable) {
            const stack = stacks.get(g.itemId);
            if (stack) {
              await tx.itemInstance.update({
                where: { id: stack.id },
                data: { quantity: { increment: g.quantity }, version: { increment: 1 } },
              });
              granted.push({ itemId: g.itemId, quantity: g.quantity });
            } else {
              const slot = nextFreeSlot();
              if (slot < 0) {
                overflow.push({ itemId: g.itemId, quantity: g.quantity });
                continue;
              }
              used.add(slot);
              const created = await tx.itemInstance.create({
                data: {
                  accountId: input.accountId,
                  characterId: input.characterId,
                  itemId: g.itemId,
                  location: "CHARACTER_INVENTORY" as ItemLocation,
                  slot,
                  quantity: g.quantity,
                  uniqueEquipGroup: g.uniqueEquipGroup,
                },
              });
              stacks.set(g.itemId, created as unknown as ItemInstanceRow);
              granted.push({ itemId: g.itemId, quantity: g.quantity });
            }
          } else {
            let placed = 0;
            for (let n = 0; n < g.quantity; n++) {
              const slot = nextFreeSlot();
              if (slot < 0) break;
              used.add(slot);
              await tx.itemInstance.create({
                data: {
                  accountId: input.accountId,
                  characterId: input.characterId,
                  itemId: g.itemId,
                  location: "CHARACTER_INVENTORY" as ItemLocation,
                  slot,
                  quantity: 1,
                  uniqueEquipGroup: g.uniqueEquipGroup,
                },
              });
              placed += 1;
            }
            if (placed > 0) granted.push({ itemId: g.itemId, quantity: placed });
            if (placed < g.quantity) overflow.push({ itemId: g.itemId, quantity: g.quantity - placed });
          }
        }
      });
      return { granted, overflow };
    },

    async commitEnhancement(commit: EnhancementCommit): Promise<void> {
      const { target, material, log } = commit;
      await getPrisma().$transaction(async (tx) => {
        // 1) LOCK both rows in deterministic id order (deadlock-safe across concurrent enhances/moves).
        const lockOrder = [target.instanceId, material.instanceId].sort();
        const locked = new Map<string, { version: number; quantity: number }>();
        for (const id of lockOrder) {
          const rows = await tx.$queryRaw<{ version: number; quantity: number }[]>`
            SELECT version, quantity FROM item_instances WHERE id = ${id} FOR UPDATE
          `;
          if (rows[0]) locked.set(id, rows[0]);
        }
        // 2) CHECK versions (+ material still has stock) — any mismatch aborts before a single write.
        const t = locked.get(target.instanceId);
        if (!t || t.version !== target.expectedVersion) throw new VersionConflictError();
        const m = locked.get(material.instanceId);
        if (!m || m.version !== material.expectedVersion || m.quantity < 1) {
          throw new VersionConflictError();
        }

        // 3) WRITE target: +1 level, bump version.
        await tx.itemInstance.update({
          where: { id: target.instanceId },
          data: { enhancementLevel: target.nextLevel, version: { increment: 1 } },
        });
        // 4) WRITE material: spend 1; a depleted stack leaves the bag (DESTROYED, slot cleared).
        const nextQty = m.quantity - 1;
        await tx.itemInstance.update({
          where: { id: material.instanceId },
          data:
            nextQty === 0
              ? { quantity: 0, location: "DESTROYED" as ItemLocation, slot: null, version: { increment: 1 } }
              : { quantity: nextQty, version: { increment: 1 } },
        });
        // 5) APPEND audit (append-only, TA §7) — no RNG: rngRoll is the guaranteed sentinel.
        await tx.enhancementLog.create({
          data: {
            characterId: log.characterId,
            itemInstanceId: log.itemInstanceId,
            beforeLevel: log.beforeLevel,
            afterLevel: log.afterLevel,
            result: ENHANCEMENT_SUCCESS,
            rngRoll: GUARANTEED_RNG_ROLL,
            configVersion: log.configVersion,
          },
        });
      });
    },

    async commitFragmentExchange(commit: FragmentExchangeCommit): Promise<FragmentExchangeOutcome> {
      return getPrisma().$transaction(async (tx): Promise<FragmentExchangeOutcome> => {
        // 1) LOCK the fragment stack (FOR UPDATE) → serialize against concurrent exchange/sell/move on it.
        const fragRows = await tx.$queryRaw<{ version: number; quantity: number; slot: number | null; location: string }[]>`
          SELECT version, quantity, slot, location FROM item_instances
          WHERE id = ${commit.fragmentInstanceId} FOR UPDATE
        `;
        const frag = fragRows[0];
        // 2) CHECK version (+ still in the bag) then stock — a stale replay / concurrent spend aborts here.
        if (!frag || frag.location !== "CHARACTER_INVENTORY" || frag.version !== commit.fragmentExpectedVersion) {
          return { status: "conflict", grantedReinforcement: 0 };
        }
        if (commit.consumeCount < 1 || frag.quantity < commit.consumeCount) {
          return { status: "insufficient", grantedReinforcement: 0 };
        }

        // 3) LOCK the bag range + decide reinforcement placement (merge existing stack, else a free slot AFTER
        //    the fragment consume — a depleted fragment stack frees its own slot). No place → inventory_full (abort).
        await tx.$queryRaw`
          SELECT id FROM item_instances
          WHERE character_id = ${commit.characterId} AND location = 'CHARACTER_INVENTORY' FOR UPDATE
        `;
        const bag = await tx.itemInstance.findMany({
          where: { characterId: commit.characterId, location: "CHARACTER_INVENTORY" as ItemLocation },
        });
        const mergeStack = bag.find(
          (r) => r.itemId === commit.reinforcementItemId && r.id !== commit.fragmentInstanceId,
        );
        const fragDepletes = frag.quantity - commit.consumeCount === 0;
        if (!mergeStack) {
          const used = new Set<number>();
          for (const r of bag) {
            if (r.slot === null || r.slot === undefined) continue;
            if (r.id === commit.fragmentInstanceId && fragDepletes) continue; // freed by the consume below
            used.add(r.slot);
          }
          let freeSlot = -1;
          for (let s = 0; s < commit.capacity; s++) if (!used.has(s)) { freeSlot = s; break; }
          if (freeSlot < 0) return { status: "inventory_full", grantedReinforcement: 0 };
          // 4a) WRITE fragment consume + 5a) CREATE the reinforcement stack at the free slot.
          await tx.itemInstance.update({
            where: { id: commit.fragmentInstanceId },
            data: fragDepletes
              ? { quantity: 0, location: "DESTROYED" as ItemLocation, slot: null, version: { increment: 1 } }
              : { quantity: frag.quantity - commit.consumeCount, version: { increment: 1 } },
          });
          await tx.item.upsert({ where: { id: commit.reinforcementItemId }, create: { id: commit.reinforcementItemId }, update: {} });
          await tx.itemInstance.create({
            data: {
              accountId: commit.accountId,
              characterId: commit.characterId,
              itemId: commit.reinforcementItemId,
              location: "CHARACTER_INVENTORY" as ItemLocation,
              slot: freeSlot,
              quantity: commit.reinforcementQuantity,
              uniqueEquipGroup: commit.reinforcementUniqueEquipGroup,
            },
          });
          return { status: "applied", grantedReinforcement: commit.reinforcementQuantity };
        }

        // 4b) WRITE fragment consume + 5b) MERGE into the existing reinforcement stack (quantity+, bump version).
        await tx.itemInstance.update({
          where: { id: commit.fragmentInstanceId },
          data: fragDepletes
            ? { quantity: 0, location: "DESTROYED" as ItemLocation, slot: null, version: { increment: 1 } }
            : { quantity: frag.quantity - commit.consumeCount, version: { increment: 1 } },
        });
        await tx.itemInstance.update({
          where: { id: mergeStack.id },
          data: { quantity: { increment: commit.reinforcementQuantity }, version: { increment: 1 } },
        });
        return { status: "applied", grantedReinforcement: commit.reinforcementQuantity };
      });
    },

    async consumeForSale(input: ConsumeForSaleInput): Promise<void> {
      await getPrisma().$transaction(async (tx) => {
        // 1) LOCK the row (FOR UPDATE) → serialize against concurrent equip/move/enhance on the same instance.
        const rows = await tx.$queryRaw<{ version: number; quantity: number }[]>`
          SELECT version, quantity FROM item_instances WHERE id = ${input.instanceId} FOR UPDATE
        `;
        const cur = rows[0];
        // 2) CHECK version + stock (mismatch / not enough held) → abort (nothing written).
        if (
          !cur ||
          cur.version !== input.expectedVersion ||
          input.quantity < 1 ||
          cur.quantity < input.quantity
        ) {
          throw new VersionConflictError();
        }
        // 3) WRITE: spend `quantity`; a depleted stack leaves the bag (DESTROYED, slot cleared).
        const nextQty = cur.quantity - input.quantity;
        await tx.itemInstance.update({
          where: { id: input.instanceId },
          data:
            nextQty === 0
              ? { quantity: 0, location: "DESTROYED" as ItemLocation, slot: null, version: { increment: 1 } }
              : { quantity: nextQty, version: { increment: 1 } },
        });
      });
    },

    // ── P2-17 personal storage + delivery box (Storage §13/§14/§16/§22) ──────────
    async listAccountStorage(accountId: string): Promise<ItemInstanceRecord[]> {
      const rows = await getPrisma().itemInstance.findMany({
        where: { accountId, location: "ACCOUNT_STORAGE" as ItemLocation },
      });
      return rows.map((r) => toRecord(r as unknown as ItemInstanceRow));
    },

    async findStorageTx(idempotencyKey: string): Promise<StorageTxRecord | null> {
      const row = await getPrisma().storageTransactionLog.findUnique({ where: { idempotencyKey } });
      if (!row) return null;
      return {
        idempotencyKey: row.idempotencyKey,
        action: row.action as StorageTxRecord["action"],
        itemInstanceId: row.itemInstanceId,
        itemId: row.itemId,
        quantity: row.quantity,
      };
    },

    async deposit(input: DepositInput): Promise<StorageMoveOutcome> {
      return getPrisma().$transaction(async (tx): Promise<StorageMoveOutcome> => {
        // 1) idempotency — a committed log row for this key = replay (move already done).
        const existing = await tx.storageTransactionLog.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return { status: "duplicate" };

        // 2) LOCK the instance + verify it is this character's bag item at the expected version.
        const cur = (
          await tx.$queryRaw<
            { version: number; location: string; character_id: string | null; account_id: string; quantity: number; item_id: string }[]
          >`
            SELECT version, location, character_id, account_id, quantity, item_id
            FROM item_instances WHERE id = ${input.instanceId} FOR UPDATE
          `
        )[0];
        if (
          !cur ||
          cur.location !== "CHARACTER_INVENTORY" ||
          cur.character_id !== input.characterId ||
          cur.account_id !== input.accountId ||
          cur.version !== input.expectedVersion
        ) {
          return { status: "version_conflict" };
        }

        // 3) LOCK the account's storage range + capacity check + next free storage slot.
        await tx.$queryRaw`
          SELECT id FROM item_instances
          WHERE account_id = ${input.accountId} AND location = 'ACCOUNT_STORAGE' FOR UPDATE
        `;
        const stored = await tx.itemInstance.findMany({
          where: { accountId: input.accountId, location: "ACCOUNT_STORAGE" as ItemLocation },
        });
        if (stored.length >= input.storageCapacity) return { status: "capacity_full" };
        const used = new Set<number>();
        for (const s of stored) if (s.slot !== null && s.slot !== undefined) used.add(s.slot);
        let slot = 0;
        while (used.has(slot)) slot++;

        // 4) MOVE (characterId → null, ACCOUNT_STORAGE, bump version) + 5) APPEND the audit/idempotency row.
        await tx.itemInstance.update({
          where: { id: input.instanceId },
          data: {
            location: "ACCOUNT_STORAGE" as ItemLocation,
            characterId: null,
            slot,
            version: { increment: 1 },
          },
        });
        try {
          await tx.storageTransactionLog.create({
            data: {
              accountId: input.accountId,
              characterId: input.characterId,
              action: "deposit" as StorageTxAction,
              itemInstanceId: input.instanceId,
              itemId: cur.item_id,
              quantity: cur.quantity,
              fromLocation: "CHARACTER_INVENTORY" as ItemLocation,
              toLocation: "ACCOUNT_STORAGE" as ItemLocation,
              idempotencyKey: input.idempotencyKey,
            },
          });
        } catch (err) {
          if (isDuplicateKeyError(err)) throw new VersionConflictError(); // raced replay → abort this tx
          throw err;
        }
        return { status: "applied" };
      }).catch((err) => {
        if (err instanceof VersionConflictError) return { status: "duplicate" as const };
        throw err;
      });
    },

    async withdraw(input: WithdrawInput): Promise<StorageMoveOutcome> {
      return getPrisma().$transaction(async (tx): Promise<StorageMoveOutcome> => {
        const existing = await tx.storageTransactionLog.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return { status: "duplicate" };

        const cur = (
          await tx.$queryRaw<
            { version: number; location: string; account_id: string; quantity: number; item_id: string }[]
          >`
            SELECT version, location, account_id, quantity, item_id
            FROM item_instances WHERE id = ${input.instanceId} FOR UPDATE
          `
        )[0];
        if (
          !cur ||
          cur.location !== "ACCOUNT_STORAGE" ||
          cur.account_id !== input.accountId ||
          cur.version !== input.expectedVersion
        ) {
          return { status: "version_conflict" };
        }

        // LOCK the receiving bag range + free-slot check.
        await tx.$queryRaw`
          SELECT id FROM item_instances
          WHERE character_id = ${input.characterId} AND location = 'CHARACTER_INVENTORY' FOR UPDATE
        `;
        const bag = await tx.itemInstance.findMany({
          where: { characterId: input.characterId, location: "CHARACTER_INVENTORY" as ItemLocation },
        });
        const used = new Set<number>();
        for (const s of bag) if (s.slot !== null && s.slot !== undefined) used.add(s.slot);
        let slot = -1;
        for (let n = 0; n < input.bagCapacity; n++) {
          if (!used.has(n)) {
            slot = n;
            break;
          }
        }
        if (slot < 0) return { status: "capacity_full" };

        await tx.itemInstance.update({
          where: { id: input.instanceId },
          data: {
            location: "CHARACTER_INVENTORY" as ItemLocation,
            characterId: input.characterId,
            slot,
            version: { increment: 1 },
          },
        });
        try {
          await tx.storageTransactionLog.create({
            data: {
              accountId: input.accountId,
              characterId: input.characterId,
              action: "withdraw" as StorageTxAction,
              itemInstanceId: input.instanceId,
              itemId: cur.item_id,
              quantity: cur.quantity,
              fromLocation: "ACCOUNT_STORAGE" as ItemLocation,
              toLocation: "CHARACTER_INVENTORY" as ItemLocation,
              idempotencyKey: input.idempotencyKey,
            },
          });
        } catch (err) {
          if (isDuplicateKeyError(err)) throw new VersionConflictError();
          throw err;
        }
        return { status: "applied" };
      }).catch((err) => {
        if (err instanceof VersionConflictError) return { status: "duplicate" as const };
        throw err;
      });
    },

    async listDeliveryEntries(accountId: string): Promise<DeliveryEntryRecord[]> {
      const rows = await getPrisma().deliveryBoxEntry.findMany({
        where: { accountId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((e) => ({
        id: e.id,
        accountId: e.accountId,
        source: e.source as string,
        items: parsePayloadItems(e.payload),
        claimStatus: e.claimStatus,
        expiresAt: e.expiresAt,
        createdAt: e.createdAt,
      }));
    },

    async claimDelivery(input: ClaimDeliveryInput): Promise<ClaimDeliveryOutcome> {
      return getPrisma().$transaction(async (tx): Promise<ClaimDeliveryOutcome> => {
        // idempotency.
        const existing = await tx.storageTransactionLog.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return { status: "duplicate", granted: [] };

        // LOCK the entry + validate ownership / claim state / expiry.
        const entryRow = (
          await tx.$queryRaw<
            { account_id: string; claim_status: string; expires_at: Date | null }[]
          >`
            SELECT account_id, claim_status, expires_at
            FROM delivery_box_entries WHERE id = ${input.entryId} FOR UPDATE
          `
        )[0];
        if (!entryRow || entryRow.account_id !== input.accountId) return { status: "not_found", granted: [] };
        if (entryRow.claim_status === "claimed") return { status: "duplicate", granted: [] };
        if (entryRow.expires_at !== null && entryRow.expires_at.getTime() <= input.nowMs) {
          return { status: "expired", granted: [] };
        }

        const entry = await tx.deliveryBoxEntry.findUnique({ where: { id: input.entryId } });
        const payloadItems = parsePayloadItems(entry?.payload);

        // LOCK the bag + precheck it holds ALL items (all-or-nothing §16.5). Delivery items are stackable.
        await tx.$queryRaw`
          SELECT id FROM item_instances
          WHERE character_id = ${input.characterId} AND location = 'CHARACTER_INVENTORY' FOR UPDATE
        `;
        const bag = await tx.itemInstance.findMany({
          where: { characterId: input.characterId, location: "CHARACTER_INVENTORY" as ItemLocation },
        });
        const used = new Set<number>();
        const stackByItem = new Map<string, { id: string }>();
        for (const r of bag) {
          if (r.slot !== null && r.slot !== undefined) used.add(r.slot);
          if (!stackByItem.has(r.itemId)) stackByItem.set(r.itemId, { id: r.id });
        }
        const newStackIds = new Set<string>();
        for (const it of payloadItems) if (!stackByItem.has(it.itemId)) newStackIds.add(it.itemId);
        let freeSlots = 0;
        for (let n = 0; n < input.bagCapacity; n++) if (!used.has(n)) freeSlots++;
        if (newStackIds.size > freeSlots) return { status: "inventory_full", granted: [] };

        // GRANT (merge into an existing stack, else a new slot). FK: register item def ids.
        const nextFreeSlot = (): number => {
          for (let n = 0; n < input.bagCapacity; n++) if (!used.has(n)) return n;
          return -1;
        };
        const granted: { itemId: string; quantity: number }[] = [];
        for (const it of payloadItems) {
          await tx.item.upsert({ where: { id: it.itemId }, create: { id: it.itemId }, update: {} });
          const stack = stackByItem.get(it.itemId);
          if (stack) {
            await tx.itemInstance.update({
              where: { id: stack.id },
              data: { quantity: { increment: it.quantity }, version: { increment: 1 } },
            });
          } else {
            const slot = nextFreeSlot();
            used.add(slot);
            const created = await tx.itemInstance.create({
              data: {
                accountId: input.accountId,
                characterId: input.characterId,
                itemId: it.itemId,
                location: "CHARACTER_INVENTORY" as ItemLocation,
                slot,
                quantity: it.quantity,
              },
            });
            stackByItem.set(it.itemId, { id: created.id });
          }
          granted.push({ itemId: it.itemId, quantity: it.quantity });
        }

        // MARK claimed + APPEND the audit/idempotency row.
        await tx.deliveryBoxEntry.update({
          where: { id: input.entryId },
          data: { claimStatus: "claimed", claimedAt: new Date() },
        });
        try {
          await tx.storageTransactionLog.create({
            data: {
              accountId: input.accountId,
              characterId: input.characterId,
              action: "claim_to_inventory" as StorageTxAction,
              quantity: payloadItems.reduce((s, i) => s + i.quantity, 0),
              fromLocation: "DELIVERY_BOX" as ItemLocation,
              toLocation: "CHARACTER_INVENTORY" as ItemLocation,
              refType: "delivery",
              refId: input.entryId,
              idempotencyKey: input.idempotencyKey,
            },
          });
        } catch (err) {
          if (isDuplicateKeyError(err)) throw new VersionConflictError();
          throw err;
        }
        return { status: "applied", granted };
      }).catch((err) => {
        if (err instanceof VersionConflictError) return { status: "duplicate" as const, granted: [] };
        throw err;
      });
    },
  };
}
