// P2-07 — inventory/equipment service (orchestration). Depends only on InventoryRepository + ItemCatalog
// → unit-tested with the in-memory repo, no DB. **Server-authoritative: client sends an intent (instanceId +
// the version it last saw); the server decides everything** (TA §7/§8, Storage §22).
//
// DESIGN DECISIONS (chosen here — see the P2-07 report):
//  • Optimistic lock conflict ⇒ REJECT (never silent-retry). The intent carries `expectedVersion`; if the
//    freshly-read row disagrees (stale client), or another mutation slips in before applyPlan's row-locked
//    re-check, we return "version_conflict" and re-send a fresh snapshot. Retrying server-side could
//    double-apply or fight a takeover; a discrete user action is safe to just reject + resync.
//  • Occupied target ⇒ SWAP (not reject): equip onto a full slot swaps the worn item back into the vacated
//    bag slot; a bag move onto an occupied slot swaps the two. Net bag count never changes → no capacity edge.
//  • equip/unequip own the bag↔equipment path; `moveItem` is bag↔bag only (keeps each op's invariant simple).

import {
  VersionConflictError,
  type InstanceMutation,
  type InventoryRepository,
  type ItemInstanceRecord,
} from "./repository";
import { asEquippable, type ItemCatalog } from "./item-catalog";
import type { InventorySnapshot, InventoryItemView } from "@/shared/net-protocol";

export type InventoryOpReason =
  | "unknown_item" // instance not found / not owned by this character
  | "not_equippable" // item is not equipment, or is not in the bag to equip
  | "not_equipped" // unequip target is not currently worn
  | "inventory_full" // no free bag slot to receive an unequipped item
  | "invalid_slot" // move target slot out of range / not an integer
  | "unique_conflict" // §12.1 another worn item shares this uniqueEquipGroup
  | "version_conflict"; // optimistic lock mismatch (stale client / concurrent mutation)

export type InventoryOpResult =
  | { ok: true; snapshot: InventorySnapshot }
  | { ok: false; reason: InventoryOpReason };

function toView(r: ItemInstanceRecord): InventoryItemView {
  return {
    instanceId: r.id,
    itemId: r.itemId,
    location: r.location === "CHARACTER_EQUIPMENT" ? "CHARACTER_EQUIPMENT" : "CHARACTER_INVENTORY",
    slot: r.slot ?? -1,
    quantity: r.quantity,
    enhancementLevel: r.enhancementLevel,
    version: r.version,
  };
}

/** split a character's CHARACTER_* instances into the bag + worn-gear snapshot (server → client wire shape). */
export function buildSnapshot(items: readonly ItemInstanceRecord[], capacity: number): InventorySnapshot {
  const bag: InventoryItemView[] = [];
  const equipment: InventoryItemView[] = [];
  for (const r of items) {
    if (r.location === "CHARACTER_EQUIPMENT") equipment.push(toView(r));
    else if (r.location === "CHARACTER_INVENTORY") bag.push(toView(r));
  }
  bag.sort((a, b) => a.slot - b.slot);
  equipment.sort((a, b) => a.slot - b.slot);
  return { capacity, bag, equipment };
}

/** smallest free bag slot in [0, capacity), or -1 if the bag is full. */
function firstFreeBagSlot(items: readonly ItemInstanceRecord[], capacity: number): number {
  const used = new Set<number>();
  for (const r of items) {
    if (r.location === "CHARACTER_INVENTORY" && r.slot !== null) used.add(r.slot);
  }
  for (let s = 0; s < capacity; s++) if (!used.has(s)) return s;
  return -1;
}

/** commit a plan then return a fresh snapshot; map a lost optimistic race to "version_conflict". */
async function commit(
  repo: InventoryRepository,
  characterId: string,
  capacity: number,
  plan: readonly InstanceMutation[],
): Promise<InventoryOpResult> {
  try {
    await repo.applyPlan(plan);
  } catch (err) {
    if (err instanceof VersionConflictError) return { ok: false, reason: "version_conflict" };
    throw err; // strict: DB error propagates (never fake success on an item mutation)
  }
  const fresh = await repo.listCharacterItems(characterId);
  return { ok: true, snapshot: buildSnapshot(fresh, capacity) };
}

interface OpInput {
  characterId: string;
  instanceId: string;
  expectedVersion: number;
  capacity: number;
}

/** equip a bag item into its config slot; swap out the currently-worn item (if any) into the vacated slot. */
export async function equipItem(
  repo: InventoryRepository,
  catalog: ItemCatalog,
  input: OpInput,
): Promise<InventoryOpResult> {
  const items = await repo.listCharacterItems(input.characterId);
  const target = items.find((r) => r.id === input.instanceId);
  if (!target) return { ok: false, reason: "unknown_item" };
  if (target.version !== input.expectedVersion) return { ok: false, reason: "version_conflict" };
  if (target.location !== "CHARACTER_INVENTORY" || target.slot === null) {
    return { ok: false, reason: "not_equippable" };
  }
  const def = asEquippable(catalog.get(target.itemId));
  if (!def) return { ok: false, reason: "not_equippable" };
  const equipSlotId = def.equipSlotId;

  // §12.1 anti-dup: uniqueEquipGroup is stored PER-INSTANCE (schema.prisma ItemInstance.uniqueEquipGroup,
  // S3) — another *worn* item (different slot) sharing this instance's group blocks the equip.
  if (target.uniqueEquipGroup) {
    const clash = items.some(
      (r) =>
        r.id !== target.id &&
        r.location === "CHARACTER_EQUIPMENT" &&
        r.slot !== equipSlotId &&
        r.uniqueEquipGroup === target.uniqueEquipGroup,
    );
    if (clash) return { ok: false, reason: "unique_conflict" };
  }

  const bagSlot = target.slot;
  const occupant = items.find(
    (r) => r.location === "CHARACTER_EQUIPMENT" && r.slot === equipSlotId,
  );
  const plan: InstanceMutation[] = [
    { instanceId: target.id, expectedVersion: target.version, toLocation: "CHARACTER_EQUIPMENT", toSlot: equipSlotId },
  ];
  if (occupant) {
    // swap the worn item back into the bag slot the equipping item just vacated.
    plan.push({
      instanceId: occupant.id,
      expectedVersion: occupant.version,
      toLocation: "CHARACTER_INVENTORY",
      toSlot: bagSlot,
    });
  }
  return commit(repo, input.characterId, input.capacity, plan);
}

/** unequip a worn item into the first free bag slot; reject if the bag is full. */
export async function unequipItem(
  repo: InventoryRepository,
  _catalog: ItemCatalog,
  input: OpInput,
): Promise<InventoryOpResult> {
  const items = await repo.listCharacterItems(input.characterId);
  const target = items.find((r) => r.id === input.instanceId);
  if (!target) return { ok: false, reason: "unknown_item" };
  if (target.version !== input.expectedVersion) return { ok: false, reason: "version_conflict" };
  if (target.location !== "CHARACTER_EQUIPMENT") return { ok: false, reason: "not_equipped" };

  const freeSlot = firstFreeBagSlot(items, input.capacity);
  if (freeSlot < 0) return { ok: false, reason: "inventory_full" };

  const plan: InstanceMutation[] = [
    { instanceId: target.id, expectedVersion: target.version, toLocation: "CHARACTER_INVENTORY", toSlot: freeSlot },
  ];
  return commit(repo, input.characterId, input.capacity, plan);
}

/** reposition a bag item to another bag slot; swap with the occupant if that slot is taken. bag↔bag only. */
export async function moveItem(
  repo: InventoryRepository,
  input: OpInput & { toSlot: number },
): Promise<InventoryOpResult> {
  if (!Number.isInteger(input.toSlot) || input.toSlot < 0 || input.toSlot >= input.capacity) {
    return { ok: false, reason: "invalid_slot" };
  }
  const items = await repo.listCharacterItems(input.characterId);
  const target = items.find((r) => r.id === input.instanceId);
  if (!target) return { ok: false, reason: "unknown_item" };
  if (target.version !== input.expectedVersion) return { ok: false, reason: "version_conflict" };
  if (target.location !== "CHARACTER_INVENTORY" || target.slot === null) {
    return { ok: false, reason: "not_equippable" };
  }
  if (target.slot === input.toSlot) {
    return { ok: true, snapshot: buildSnapshot(items, input.capacity) }; // no-op reposition
  }
  const fromSlot = target.slot;
  const occupant = items.find(
    (r) => r.location === "CHARACTER_INVENTORY" && r.slot === input.toSlot,
  );
  const plan: InstanceMutation[] = [
    { instanceId: target.id, expectedVersion: target.version, toLocation: "CHARACTER_INVENTORY", toSlot: input.toSlot },
  ];
  if (occupant) {
    plan.push({
      instanceId: occupant.id,
      expectedVersion: occupant.version,
      toLocation: "CHARACTER_INVENTORY",
      toSlot: fromSlot,
    });
  }
  return commit(repo, input.characterId, input.capacity, plan);
}
