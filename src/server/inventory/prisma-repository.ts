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

import type { EnhancementResult, ItemLocation } from "@prisma/client";
import { getPrisma } from "../db";
import {
  VersionConflictError,
  type ConsumeForSaleInput,
  type EnhancementCommit,
  type GrantItemsInput,
  type GrantOutcome,
  type InstanceMutation,
  type InventoryRepository,
  type ItemInstanceRecord,
  type ItemLocationValue,
} from "./repository";

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

export function createPrismaInventoryRepository(): InventoryRepository {
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
  };
}
