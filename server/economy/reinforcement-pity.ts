// B4 — Field Boss reinforcement pity + fragment runtime wiring for MapRoom (pattern = server/economy/milestones.ts).
//
// The pure orchestrator (src/server/economy/reinforcement-pity.ts) is DB-agnostic; this thin layer pulls the
// reinforcement Design Knobs (Reinforcement §4.2 pity + §3.5 fragment) and injects the real Prisma seams: the
// per-account-per-boss pity row (reinforcement_pity, migration 0003), the inventory grant, and the Delivery Box
// fallback. No DB (`inventoryPersistenceAvailable()` false / no character) → all seams null + a process-local
// in-memory pity Map, so dev still evaluates the ladder (pity tracked for the process lifetime, items not
// persisted — same posture as milestone grants). Best-effort at the caller boundary — MapRoom already try/catches
// the kill-reward path (a DB error is logged money-loud, never crashes the room).
//
// ⛔ SERVER-ONLY. Pity/drop values never enter the client bundle (config = server-authoritative).

import { DEFAULT_REINFORCEMENT_CONFIG } from "../config/reinforcement";
import type { ReinforcementConfig } from "../config/types";
import { getPrisma } from "../../src/server/db";
import {
  INVENTORY_CAPACITY,
  ITEM_CATALOG,
  getInventoryRepository,
  inventoryPersistenceAvailable,
} from "../inventory/inventory-state";
import {
  grantFieldBossReinforcement,
  type FieldBossReinforcementContext,
  type FieldBossReinforcementOutcome,
  type PityStore,
  type ReinforcementDeliverySeam,
  type ReinforcementInventorySeam,
} from "../../src/server/economy/reinforcement-pity";
import type { ItemMeta } from "../../src/server/economy/kill-reward";
import type { RngFn } from "../../src/game/mob/rng";

export type { FieldBossReinforcementOutcome };

/** §4.4 reinforcement quantity per Field Boss drop — spec-fixed at 1 (not a tunable Design Knob dial). */
const REINFORCEMENT_DROP_QUANTITY = 1;

/** catalog lookup → stackable + uniqueEquipGroup stamp for a granted item (§12.1), same as the loot path. */
function itemMeta(itemId: string): ItemMeta {
  const def = ITEM_CATALOG.get(itemId);
  if (!def) return { stackable: false, uniqueEquipGroup: null };
  return { stackable: def.stackable, uniqueEquipGroup: def.uniqueEquipGroup ?? null };
}

/**
 * Prisma-backed pity store (reinforcement_pity, §4.2 scope account-per-boss). `getPityCount` reads the current
 * clears-since-drop; `applyClearResult` upserts the row: a drop resets to 0, else an ATOMIC `{ increment: 1 }`
 * (so a raced concurrent clear for the same account never loses an increment — see the B4 report on the read→write
 * race window, acceptable at per-account low frequency + session-takeover single-session).
 */
const prismaPityStore: PityStore = {
  async getPityCount(accountId, bossId) {
    const row = await getPrisma().reinforcementPity.findUnique({
      where: { accountId_bossId: { accountId, bossId } },
    });
    return row?.pityCount ?? 0;
  },
  async applyClearResult({ accountId, bossId, dropped }) {
    await getPrisma().reinforcementPity.upsert({
      where: { accountId_bossId: { accountId, bossId } },
      create: { accountId, bossId, pityCount: dropped ? 0 : 1 },
      update: dropped ? { pityCount: 0 } : { pityCount: { increment: 1 } },
    });
  },
};

/** process-local pity used only in no-DB mode (dev/e2e) — key `${accountId}:${bossId}`, process lifetime. */
const memoryPity = new Map<string, number>();
const memoryPityStore: PityStore = {
  async getPityCount(accountId, bossId) {
    return memoryPity.get(`${accountId}:${bossId}`) ?? 0;
  },
  async applyClearResult({ accountId, bossId, dropped }) {
    const key = `${accountId}:${bossId}`;
    memoryPity.set(key, dropped ? 0 : (memoryPity.get(key) ?? 0) + 1);
  },
};

/** item grant via the strict inventory repo (bag insert / stack merge, same as loot). */
const inventorySeam: ReinforcementInventorySeam = {
  grantItems: (input) => getInventoryRepository().grantItems(input),
};

/** §12.5 overflow → Delivery Box. source `achievement_reward` (never expires — storage §16.4 config; same as loot). */
const deliverySeam: ReinforcementDeliverySeam = {
  async createEntry(input) {
    await getPrisma().deliveryBoxEntry.create({
      data: { accountId: input.accountId, source: "achievement_reward", payload: { items: input.items } },
    });
  },
};

/**
 * grant the Field Boss reinforcement (§4.2 pity ladder) + fragment (§3.5) for one eligible clear (per account).
 * Wires the real seams when a character-bound session + DB are present; otherwise the pure module uses the
 * process-local pity Map + null grant seams (dev evaluates the ladder, items not persisted). Returns the outcome
 * the caller merges into the kill loot + progress message.
 */
export async function grantFieldBossReinforcementWired(
  ctx: FieldBossReinforcementContext,
  config: ReinforcementConfig = DEFAULT_REINFORCEMENT_CONFIG,
  rng: RngFn = Math.random,
): Promise<FieldBossReinforcementOutcome> {
  const wired = inventoryPersistenceAvailable() && ctx.characterId.length > 0;
  return grantFieldBossReinforcement(
    {
      pity: config.bossPity,
      reinforcementItemId: config.materialId,
      fragmentItemId: config.fragment.materialId,
      fragmentChancePercent: config.fragment.fragmentDropChancePercent,
      fragmentQuantity: config.fragment.quantity,
      reinforcementQuantity: REINFORCEMENT_DROP_QUANTITY,
      itemMeta,
      store: wired ? prismaPityStore : memoryPityStore,
      inventory: wired ? inventorySeam : null,
      delivery: wired ? deliverySeam : null,
      rng,
      capacity: INVENTORY_CAPACITY,
    },
    ctx,
  );
}
