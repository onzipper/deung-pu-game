// C1 — milestone runtime wiring for MapRoom (pattern = server/economy/kill-rewards.ts).
//
// The pure orchestrator (src/server/economy/milestone.ts) is DB-agnostic; this thin layer pulls the milestone
// Design Knobs (Economy §18.1 baseline + §18.3 D-053 Gold) and injects the real Prisma seams: the one-time
// grant marker (milestone_grants unique), the ledger (reason `quest_reward`), the inventory grant, and the
// Delivery Box fallback. No DB (`inventoryPersistenceAvailable()` false) → all seams null → the pure module
// uses a process-local marker set, so dev still fires each milestone once per account per process (EXP-only,
// same posture as kill rewards). Best-effort at the caller boundary — MapRoom `void`s these (fire-and-forget).
//
// ⛔ SERVER-ONLY. Milestone reward values never enter the client bundle (config = server-authoritative).

import { DEFAULT_ECONOMY_CONFIG } from "../config/economy";
import { getPrisma } from "../../src/server/db";
import { appendEntry, isDuplicateKeyError } from "../db/ledger";
import {
  INVENTORY_CAPACITY,
  ITEM_CATALOG,
  getInventoryRepository,
  inventoryPersistenceAvailable,
} from "../inventory/inventory-state";
import {
  grantMilestone,
  milestonesForTrigger,
  type MilestoneDeliverySeam,
  type MilestoneDeps,
  type MilestoneGrantOutcome,
  type MilestoneGrantSeam,
  type MilestoneInventorySeam,
  type MilestoneLedgerSeam,
  type MilestoneRewardView,
  type MilestoneTrigger,
} from "../../src/server/economy/milestone";
import type { ItemMeta } from "../../src/server/economy/kill-reward";

// re-export the pure decision helper + types so MapRoom imports everything milestone-related from here.
export { milestonesForTrigger };
export type { MilestoneTrigger, MilestoneGrantOutcome };
export { mobClassForMobType, monsterIdForMobType } from "./kill-rewards";

/** milestone Design Knobs (Economy §18.1 / D-053) as the structural subset the orchestrator reads. */
const MILESTONES: readonly MilestoneRewardView[] = DEFAULT_ECONOMY_CONFIG.milestones.map((m) => ({
  milestoneId: m.milestoneId,
  phase: m.phase,
  exp: m.exp,
  gold: m.gold,
  items: m.items.map((i) => ({ itemId: i.itemId, quantity: i.quantity })),
}));

/** process-local at-most-once set used only in no-DB mode (dev/e2e) — key `${accountId}:${milestoneId}`. */
const memoryMilestoneGrants = new Set<string>();

/** warn once per unknown milestoneId (config lookup miss) — don't spam the log on every trigger. */
const unknownWarned = new Set<string>();
function warnUnknown(milestoneId: string): void {
  if (unknownWarned.has(milestoneId)) return;
  unknownWarned.add(milestoneId);
  console.warn(`[milestones] milestoneId "${milestoneId}" ไม่มีใน config — ข้าม grant (no-op).`);
}

/** catalog lookup → stackable + uniqueEquipGroup stamp for a granted item (§12.1), same as the loot path. */
function milestoneItemMeta(itemId: string): ItemMeta {
  const def = ITEM_CATALOG.get(itemId);
  if (!def) return { stackable: false, uniqueEquipGroup: null };
  return { stackable: def.stackable, uniqueEquipGroup: def.uniqueEquipGroup ?? null };
}

/** the one-time grant marker (milestone_grants unique) — INSERT; duplicate-key = already granted (false). */
const grantSeam: MilestoneGrantSeam = {
  async recordGrant(input) {
    try {
      await getPrisma().milestoneGrant.create({ data: input });
      return true; // fresh
    } catch (err) {
      if (isDuplicateKeyError(err)) return false; // unique(account, milestone) violation → already granted
      throw err; // real DB error → strict (no marker, no reward → caller retries safely on a later trigger)
    }
  },
};

/** gold via the strict double-entry ledger (reason quest_reward, §18.2). */
const ledgerSeam: MilestoneLedgerSeam = { appendEntry: (e) => appendEntry(e) };

/** item grant via the strict inventory repo (bag insert / stack merge, same as loot). */
const inventorySeam: MilestoneInventorySeam = {
  grantItems: (input) => getInventoryRepository().grantItems(input),
};

/** §18.2 overflow → Delivery Box. source `achievement_reward` (never expires — storage §16.4 config). */
const deliverySeam: MilestoneDeliverySeam = {
  async createEntry(input) {
    await getPrisma().deliveryBoxEntry.create({
      data: { accountId: input.accountId, source: "achievement_reward", payload: { items: input.items } },
    });
  },
};

/**
 * grant one milestone (idempotent, §18.2). Wires the real seams when a character-bound session + DB are present;
 * otherwise the pure module uses the process-local marker set (dev fires once/account/process, EXP-only). The
 * returned outcome carries the EXP the caller applies through the session-progress path + what to notify.
 */
export async function grantMilestoneWired(input: {
  accountId: string;
  characterId: string;
  milestoneId: string;
  sessionId: string;
}): Promise<MilestoneGrantOutcome> {
  const wired = inventoryPersistenceAvailable() && input.characterId.length > 0;
  const deps: MilestoneDeps = {
    config: MILESTONES,
    grantSeam: wired ? grantSeam : null,
    ledger: wired ? ledgerSeam : null,
    inventory: wired ? inventorySeam : null,
    delivery: wired ? deliverySeam : null,
    memoryGrants: memoryMilestoneGrants,
    itemMeta: milestoneItemMeta,
    capacity: INVENTORY_CAPACITY,
    onUnknown: warnUnknown,
  };
  return grantMilestone(deps, input);
}
