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

import type { ItemLocation } from "@prisma/client";
import { getPrisma } from "../db";
import {
  VersionConflictError,
  type InstanceMutation,
  type InventoryRepository,
  type ItemInstanceRecord,
  type ItemLocationValue,
} from "./repository";

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
  };
}
