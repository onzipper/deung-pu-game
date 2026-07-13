// Starter loadout grant (Economy §7.7) — a freshly-created character receives and *wears* a fixed starter set,
// plus 5 potions in the bag. Reuses the P2-07/P2-09 money-like item paths (grantItems → applyPlan) so the same
// optimistic-version + atomic-apply invariants proven for drops/equip apply here (never-downgrade zone).
//
// SPEC-LOCKED (Economy §7.7): the item ids + potion×5 are transcribed verbatim from the spec — no invented set.
// Starter items are shareable/sellable (Category-A default) per §7.7; anti-Gold-exploit is a config lever there
// (Starter Sell → 0), not enforced here.

import type { InstanceMutation, InventoryRepository } from "./repository";
import { DEFAULT_INVENTORY_CAPACITY, asEquippable, type ItemCatalog } from "./item-catalog";

/** Economy §7.7 — the fixed set every new character gets: one item per equipment slot + a potion stack. */
export const STARTER_LOADOUT = {
  /** worn on creation — exactly one per equipment slot (weapon/head/body/accessory/talisman). */
  equipment: [
    "eq_weapon_training_blade",
    "eq_head_cloth_band",
    "eq_body_traveler_tunic",
    "eq_accessory_plain_cord",
    "eq_talisman_blank",
  ],
  /** placed in the bag (stackable consumable). */
  consumables: [{ itemId: "con_small_potion", quantity: 5 }],
} as const;

export type GrantStarterLoadoutResult =
  | { granted: true }
  | { granted: false; reason: "already_initialized" };

export interface GrantStarterLoadoutInput {
  accountId: string;
  characterId: string;
}

/**
 * Grant + equip the §7.7 starter loadout for a new character. **Idempotent**: if the character already owns any
 * instance (bag or worn), this is a no-op (`already_initialized`) so a create retry or a login-time repair pass
 * never double-grants. **Strict** on the repo — a DB error propagates (a loadout that did not persist must not
 * look granted); the caller decides whether to treat creation as best-effort around that.
 */
export async function grantStarterLoadout(
  repo: InventoryRepository,
  catalog: ItemCatalog,
  input: GrantStarterLoadoutInput,
): Promise<GrantStarterLoadoutResult> {
  const existing = await repo.listCharacterItems(input.characterId);
  if (existing.length > 0) return { granted: false, reason: "already_initialized" };

  const grants = [
    ...STARTER_LOADOUT.equipment.map((itemId) => ({
      itemId,
      quantity: 1,
      stackable: false,
      uniqueEquipGroup: catalog.get(itemId)?.uniqueEquipGroup ?? null,
    })),
    ...STARTER_LOADOUT.consumables.map((c) => ({
      itemId: c.itemId,
      quantity: c.quantity,
      stackable: true,
      uniqueEquipGroup: null,
    })),
  ];

  await repo.grantItems({
    accountId: input.accountId,
    characterId: input.characterId,
    capacity: DEFAULT_INVENTORY_CAPACITY,
    grants,
  });

  // Equip each starter piece into its config slot (bag → CHARACTER_EQUIPMENT). Each occupies a distinct slot, so
  // there is no swap/collision — one atomic plan moves them all (re-read to pick up the just-created instances).
  const afterGrant = await repo.listCharacterItems(input.characterId);
  const plan: InstanceMutation[] = [];
  for (const itemId of STARTER_LOADOUT.equipment) {
    const def = asEquippable(catalog.get(itemId));
    if (!def) continue; // spec-locked ids are all equippable; defensive skip keeps a bad catalog from throwing
    const inst = afterGrant.find((r) => r.itemId === itemId && r.location === "CHARACTER_INVENTORY");
    if (!inst) continue;
    plan.push({
      instanceId: inst.id,
      expectedVersion: inst.version,
      toLocation: "CHARACTER_EQUIPMENT",
      toSlot: def.equipSlotId,
    });
  }
  if (plan.length > 0) await repo.applyPlan(plan);

  return { granted: true };
}
