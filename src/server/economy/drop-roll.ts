// P2-09 — drop-table roll (Economy §11). **PURE + SERVER-AUTHORITATIVE, never-downgrade zone (loot RNG).**
// No DB / no config import — the caller injects the table + pools (structural subsets of server/config/types.ts)
// and an RngFn, so the weight distribution is unit-tested deterministically (seeded LCG).
//
// Semantics (Economy §11.1):
//   • guaranteed[] always drop (Elite/Boss); rolls[] are independent chance rolls (Normal monsters).
//   • an entry pointing at a poolId picks ONE item from the weighted equipment pool (§11.2–§11.6 weights).
//   • quantity is a uniform integer in [min, max].
// Every roll (hit AND miss) plus every guaranteed grant emits one audit record (DropAudit — "drop ทุกชิ้นมี
// audit trail", DoD 8 + shadow-compare economy). The Kraeng/reinforcement rows are SUPERSEDED to 0% in config
// (Reinforcement §4) — `excludedItemIds` is a defence-in-depth guard so those ids can never be granted (R8).

import type { RngFn } from "@/game/mob/rng";

/** uniform integer quantity range for a drop (§11 "Quantity" column). */
export interface DropQuantity {
  min: number;
  max: number;
}

/** a guaranteed drop entry (Elite/Boss guaranteed[]) — a fixed itemId OR a weighted poolId. */
export interface DropGuaranteedEntry {
  itemId: string | null;
  poolId: string | null;
  quantity: DropQuantity;
}

/** a chance roll (Normal monster rolls[]) — chancePercent 0–100; emits a fixed itemId OR a weighted poolId. */
export interface DropRoll {
  rollId: string;
  chancePercent: number;
  itemId: string | null;
  poolId: string | null;
  quantity: DropQuantity;
}

/** one drop table (structural subset of DropTable — server/config/types.ts). */
export interface DropTable {
  dropTableId: string;
  guaranteed: DropGuaranteedEntry[];
  rolls: DropRoll[];
}

/** one weighted equipment pool (structural subset of EquipmentPool). */
export interface EquipmentPool {
  poolId: string;
  entries: { itemId: string; weight: number }[];
}

/** one granted item (goes to the bag). */
export interface GrantedDrop {
  itemId: string;
  quantity: number;
}

/** one audit record per roll/guaranteed grant (→ DropAudit row). resultItemId null = no drop (miss/suppressed). */
export interface DropAuditRecord {
  rollId: string;
  /** the primary RNG value used for the decision (0..1). guaranteed fixed items use the sentinel below. */
  rngRoll: number;
  resultItemId: string | null;
  /** granted quantity (0 when no drop). */
  quantity: number;
}

export interface DropRollResult {
  grants: GrantedDrop[];
  audits: DropAuditRecord[];
}

/** rngRoll stored for a guaranteed fixed-item grant (no chance roll happened). */
export const GUARANTEED_NO_ROLL = 1;
/** guaranteed[] entries use this synthetic rollId prefix in the audit (§11.5/§11.6 guaranteed). */
const GUARANTEED_ROLL_PREFIX = "guaranteed:";

export interface DropRollOptions {
  /** item ids that must never be granted regardless of the table (Kraeng/reinforcement guard, R8). */
  excludedItemIds?: ReadonlySet<string>;
}

/** uniform integer in [min, max] inclusive from one rng draw. */
function rollQuantity(q: DropQuantity, r: number): number {
  const min = Math.floor(q.min);
  const max = Math.floor(q.max);
  if (max <= min) return min;
  return min + Math.floor(r * (max - min + 1));
}

/** pick one item from a weighted pool (§11.2–§11.6). null if the pool is missing/empty. */
function pickFromPool(
  poolId: string,
  pools: readonly EquipmentPool[],
  r: number,
): string | null {
  const pool = pools.find((p) => p.poolId === poolId);
  if (!pool || pool.entries.length === 0) return null;
  const total = pool.entries.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) return null;
  let threshold = r * total;
  for (const e of pool.entries) {
    threshold -= e.weight;
    if (threshold < 0) return e.itemId;
  }
  return pool.entries[pool.entries.length - 1].itemId; // rounding safety
}

/** resolve one entry's item (fixed itemId or weighted pool pick), honouring the exclusion guard. */
function resolveItem(
  itemId: string | null,
  poolId: string | null,
  pools: readonly EquipmentPool[],
  rng: RngFn,
  excluded: ReadonlySet<string>,
): string | null {
  let resolved: string | null = null;
  if (poolId) resolved = pickFromPool(poolId, pools, rng());
  else resolved = itemId;
  if (resolved !== null && excluded.has(resolved)) return null; // suppressed (Kraeng guard)
  return resolved;
}

/**
 * roll one monster's drop table into { grants, audits }. Deterministic under a seeded RngFn — draw order is
 * fixed: guaranteed entries first (in order), then rolls (in order). Per entry the draws are: [chance (rolls
 * only)] → [pool pick if poolId] → [quantity]. This ordering is the test contract (see server-economy-drop-roll).
 */
export function rollDropTable(
  table: DropTable,
  pools: readonly EquipmentPool[],
  rng: RngFn,
  options: DropRollOptions = {},
): DropRollResult {
  const excluded = options.excludedItemIds ?? new Set<string>();
  const grants: GrantedDrop[] = [];
  const audits: DropAuditRecord[] = [];

  // guaranteed[] — always drop (chance = 100%). fixed items record the sentinel rngRoll.
  for (let i = 0; i < table.guaranteed.length; i++) {
    const g = table.guaranteed[i];
    const rngRoll = g.poolId ? rng() : GUARANTEED_NO_ROLL;
    let item = g.poolId ? pickFromPool(g.poolId, pools, rngRoll) : g.itemId;
    if (item !== null && excluded.has(item)) item = null; // suppressed (Kraeng guard)
    const rollId = `${GUARANTEED_ROLL_PREFIX}${i}`;
    if (item === null) {
      audits.push({ rollId, rngRoll, resultItemId: null, quantity: 0 });
      continue;
    }
    const qty = rollQuantity(g.quantity, rng());
    grants.push({ itemId: item, quantity: qty });
    audits.push({ rollId, rngRoll, resultItemId: item, quantity: qty });
  }

  // rolls[] — independent chance rolls.
  for (const roll of table.rolls) {
    const chanceRoll = rng();
    const hit = chanceRoll * 100 < roll.chancePercent;
    if (!hit) {
      audits.push({ rollId: roll.rollId, rngRoll: chanceRoll, resultItemId: null, quantity: 0 });
      continue;
    }
    const item = resolveItem(roll.itemId, roll.poolId, pools, rng, excluded);
    if (item === null) {
      audits.push({ rollId: roll.rollId, rngRoll: chanceRoll, resultItemId: null, quantity: 0 });
      continue;
    }
    const qty = rollQuantity(roll.quantity, rng());
    grants.push({ itemId: item, quantity: qty });
    audits.push({ rollId: roll.rollId, rngRoll: chanceRoll, resultItemId: item, quantity: qty });
  }

  return { grants, audits };
}
