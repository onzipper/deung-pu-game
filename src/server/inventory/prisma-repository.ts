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
  type EnhancementCommit,
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
  };
}
