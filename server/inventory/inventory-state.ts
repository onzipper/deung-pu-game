// P2-07 — inventory best-effort DB glue for MapRoom (pattern = server/characters/character-state.ts).
//
// The pure service (src/server/inventory/service.ts) is DB-agnostic; this thin layer wires it to the Prisma
// repo + the server-authoritative item catalog, and makes the JOIN-time load best-effort: no DATABASE_URL /
// DB down ⇒ empty inventory (warn once), **never break join** (dev/e2e have no DB). Mutations stay STRICT —
// they route through the repo and any DB error propagates to the caller (MapRoom turns it into a rejection,
// not a silent success: an item move that did not persist must not look like it worked).

import { getPrisma } from "../../src/server/db";
import { createPrismaInventoryRepository } from "../../src/server/inventory/prisma-repository";
import {
  DEFAULT_INVENTORY_CAPACITY,
  DEFAULT_ITEM_CATALOG,
  type ItemCatalog,
} from "../../src/server/inventory/item-catalog";
import type {
  InventoryRepository,
  ItemInstanceRecord,
} from "../../src/server/inventory/repository";

/** bag capacity used by the room (Storage §1.2). */
export const INVENTORY_CAPACITY = DEFAULT_INVENTORY_CAPACITY;
/** server-authoritative item definitions (slot + stat bonus, Design Knob §48). */
export const ITEM_CATALOG: ItemCatalog = DEFAULT_ITEM_CATALOG;

const repository: InventoryRepository = createPrismaInventoryRepository();
let inventoryWarned = false;

/** DATABASE_URL set? (no DB = dev/e2e → inventory not persisted, mutations rejected). */
export function inventoryPersistenceAvailable(): boolean {
  if (!process.env.DATABASE_URL) {
    if (!inventoryWarned) {
      console.warn(
        "[inventory] DATABASE_URL ไม่ถูกตั้ง — ข้าม inventory/equipment (dev/e2e). " +
          "ของในกระเป๋า/ที่สวมจะไม่ persist จนกว่าจะมี DB (production).",
      );
      inventoryWarned = true;
    }
    return false;
  }
  return true;
}

/** the Prisma-backed repository (mutations go through this — strict). */
export function getInventoryRepository(): InventoryRepository {
  return repository;
}

/**
 * load a character's bag + worn gear (best-effort). no DB / DB error → [] (warn once) so join never breaks.
 * Mutations do NOT use this path — they must surface DB errors.
 */
export async function loadCharacterItemsBestEffort(
  characterId: string,
): Promise<ItemInstanceRecord[]> {
  if (!inventoryPersistenceAvailable()) return [];
  try {
    return await repository.listCharacterItems(characterId);
  } catch (err) {
    if (!inventoryWarned) {
      console.warn(
        "[inventory] DB load ล้มเหลว — ข้าม inventory snapshot (เกมเล่นต่อได้): " +
          (err instanceof Error ? err.message : String(err)),
      );
      inventoryWarned = true;
    }
    return [];
  }
}
