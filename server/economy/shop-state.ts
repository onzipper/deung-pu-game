// P2-11 — starter-shop wiring for MapRoom (pattern = server/economy/kill-rewards.ts).
//
// The pure orchestrator (src/server/economy/shop.ts) is DB-agnostic; this thin layer pulls the DEFAULT shop
// Design Knobs (Economy §8) and resolves whether the shop is reachable from a given mapId (server-authoritative
// availability — the NPC lives in the starter district / city hub, §8.1). The Prisma seams (ledger / inventory
// repo) are injected by MapRoom itself (it already holds getInventoryRepository + appendEntry).
//
// ⛔ SERVER-ONLY. Prices never enter the client bundle (TA §6.2) — the client learns buy prices only via
//    MSG_SHOP_LIST.

import { DEFAULT_ECONOMY_CONFIG } from "../config/economy";
import type { ShopConfig } from "../config/types";
import { ITEM_CATALOG } from "../inventory/inventory-state";
import type { ItemMeta } from "../../src/server/economy/kill-reward";

/** the single P2 starter shop (Economy §8) — in-code DEFAULT (DB override via loader.ts not wired into the room). */
export const SHOP_CONFIG: ShopConfig = DEFAULT_ECONOMY_CONFIG.shop;

/** the shop reachable on `mapId`, or null (server rejects shop MSGs off the shop's map). */
export function shopForMap(mapId: string): ShopConfig | null {
  return SHOP_CONFIG.mapId === mapId ? SHOP_CONFIG : null;
}

/** catalog lookup → stackable + uniqueEquipGroup stamp for a purchased item (§12.1), same as the loot path. */
export function shopItemMeta(itemId: string): ItemMeta {
  const def = ITEM_CATALOG.get(itemId);
  if (!def) return { stackable: false, uniqueEquipGroup: null };
  return { stackable: def.stackable, uniqueEquipGroup: def.uniqueEquipGroup ?? null };
}
