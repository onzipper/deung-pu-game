// B4 — Field Boss reinforcement pity ladder + fragment drop (Reinforcement §4.2 + §3.5). **PURE +
// SERVER-AUTHORITATIVE, never-downgrade zone (reinforcement is the premium-adjacent progression item — no
// double-grant, no dupe).** Depends only on injected seams (pity store / inventory / delivery) + an RngFn →
// unit-tested with fakes, never touches a real DB / .env. The wiring that supplies the real Prisma seams lives
// in server/economy/reinforcement-pity-store.ts (mirrors kill-reward.ts ↔ kill-rewards.ts, milestone.ts ↔
// milestones.ts).
//
// §4.2 Bad-luck Protection (verbatim, Map Boss):
//   baseDropChancePercent: 8 · startIncreasingAfterClears: 8 (clears 1–8 = base 8%) ·
//   increasePerClearPercent: 4 (clear 9 = 12%, clear 10 = 16%, …) · guaranteedAtClear: 15 (clear 15 = 100%) ·
//   resetOnDrop: true · scope: account-per-boss.
//   pityCount (stored) = eligible clears since the last reinforcement drop from this boss. The Nth clear-since-
//   drop is `clearNumber = pityCount + 1`; a drop resets pityCount to 0, else it increments by 1.
//
// §3.5 fragment (independent, does NOT touch pity):
//   fragmentDropChancePercent: 10.7 · quantity: 1 · one clear can yield BOTH the full item and a fragment.
//
// The reinforcement full item is granted at §4.4 `quantity: 1` (the OB drop-table shortcut of 1–2 guaranteed is
// SUPERSEDED by this ladder — the ladder is the §4.2 spec; see the B4 report). Grants flow through the same
// item-grant → bag → Delivery Box fallback path as loot (§12.5 no-silent-loss).

import type { RngFn } from "@/game/mob/rng";
import type { ItemMeta } from "./kill-reward";

/** §4.2 pity knobs the decision reads (structural subset of ReinforcementBossPity — server/config/types.ts). */
export interface ReinforcementPityConfig {
  baseDropChancePercent: number;
  startIncreasingAfterClears: number;
  increasePerClearPercent: number;
  guaranteedAtClear: number;
}

/**
 * §4.2: effective reinforcement drop chance (%) for the Nth clear-since-drop (1-based).
 *   clear ≤ startIncreasingAfterClears → base · clear > start → base + inc×(clear − start) · clear ≥ guaranteed → 100.
 */
export function reinforcementDropChancePercent(
  clearNumber: number,
  cfg: ReinforcementPityConfig,
): number {
  if (clearNumber >= cfg.guaranteedAtClear) return 100;
  if (clearNumber > cfg.startIncreasingAfterClears) {
    return cfg.baseDropChancePercent + cfg.increasePerClearPercent * (clearNumber - cfg.startIncreasingAfterClears);
  }
  return cfg.baseDropChancePercent;
}

/** result of one clear's pity roll (pure). */
export interface PityEvaluation {
  /** the Nth eligible clear since the last drop (pityCount + 1). */
  clearNumber: number;
  /** the §4.2 effective drop chance used for this clear (%). */
  effectiveChancePercent: number;
  /** §4.2 guaranteedAtClear reached (chance forced to 100). */
  guaranteed: boolean;
  /** the reinforcement full item dropped this clear. */
  dropped: boolean;
  /** pityCount to persist: 0 on a drop (resetOnDrop), else clearNumber (= currentPityCount + 1). */
  nextPityCount: number;
}

/** evaluate one eligible clear given the current stored pityCount (§4.2). rng() ∈ [0,1). */
export function evaluateReinforcementPity(
  currentPityCount: number,
  cfg: ReinforcementPityConfig,
  rng: RngFn,
): PityEvaluation {
  const clearNumber = Math.max(0, Math.floor(currentPityCount)) + 1;
  const effectiveChancePercent = reinforcementDropChancePercent(clearNumber, cfg);
  const guaranteed = clearNumber >= cfg.guaranteedAtClear;
  const dropped = guaranteed || rng() * 100 < effectiveChancePercent;
  return {
    clearNumber,
    effectiveChancePercent,
    guaranteed,
    dropped,
    nextPityCount: dropped ? 0 : clearNumber,
  };
}

/** §3.5 independent fragment roll — separate RNG draw, does not read/reset pity. */
export function evaluateFragmentDrop(chancePercent: number, rng: RngFn): boolean {
  if (chancePercent <= 0) return false;
  return rng() * 100 < chancePercent;
}

/**
 * per-account-per-boss pity store seam (§4.2 scope). `getPityCount` reads the current clears-since-drop (0 when
 * none). `applyClearResult` persists one clear: `dropped` → reset to 0, else increment by 1 (the Prisma impl
 * uses an atomic `{ increment: 1 }` so a raced concurrent clear never loses an increment). null store is not
 * allowed — the wiring picks a Prisma-backed store (DB) or a process-local in-memory store (no DB).
 */
export interface PityStore {
  getPityCount(accountId: string, bossId: string): Promise<number>;
  applyClearResult(input: { accountId: string; bossId: string; dropped: boolean }): Promise<void>;
}

/** inventory grant seam (structural subset of InventoryRepository.grantItems) — null = no DB → grants skipped. */
export interface ReinforcementInventorySeam {
  grantItems(input: {
    accountId: string;
    characterId: string;
    capacity: number;
    grants: readonly { itemId: string; quantity: number; stackable: boolean; uniqueEquipGroup: string | null }[];
  }): Promise<{ granted: { itemId: string; quantity: number }[]; overflow: { itemId: string; quantity: number }[] }>;
}

/** §12.5 Delivery Box fallback seam (overflow → Delivery Box) — null = no DB → overflow reported, not persisted. */
export interface ReinforcementDeliverySeam {
  createEntry(input: { accountId: string; items: readonly { itemId: string; quantity: number }[] }): Promise<void>;
}

export interface FieldBossReinforcementDeps {
  pity: ReinforcementPityConfig;
  /** canonical `upg_reinforcement` (§3.1) — full item, quantity 1 per drop (§4.4). */
  reinforcementItemId: string;
  /** `upg_reinforcement_fragment` (§3.5). */
  fragmentItemId: string;
  /** §3.5 fragmentDropChancePercent (10.7). */
  fragmentChancePercent: number;
  /** §3.5 fragment quantity (1). */
  fragmentQuantity: number;
  /** §4.4 reinforcement quantity per drop (1). */
  reinforcementQuantity: number;
  itemMeta: (itemId: string) => ItemMeta;
  store: PityStore;
  inventory: ReinforcementInventorySeam | null;
  delivery: ReinforcementDeliverySeam | null;
  rng: RngFn;
  capacity: number;
}

export interface FieldBossReinforcementContext {
  accountId: string;
  characterId: string;
  bossId: string;
}

export interface FieldBossReinforcementOutcome {
  reinforcementDropped: boolean;
  fragmentDropped: boolean;
  /** §4.2 telemetry-ish view: the Nth clear-since-drop this kill counted as. */
  clearNumber: number;
  /** the §4.2 drop chance in effect for this clear (%). */
  effectiveChancePercent: number;
  /** pityCount AFTER this clear (0 after a drop; else the incremented count). */
  pityCount: number;
  /** §4.2 guaranteedAtClear (client shows "ประกันบอส: pityCount/guaranteedAtClear"). */
  guaranteedAtClear: number;
  /** reinforcement/fragment that landed in the bag (merged into the kill loot toast by the caller). */
  granted: { itemId: string; quantity: number }[];
  /** reinforcement/fragment routed to the Delivery Box (bag full, §12.5). */
  delivered: { itemId: string; quantity: number }[];
  /** reinforcement/fragment neither placed nor persisted (no DB) — reported, not lost silently. */
  overflow: { itemId: string; quantity: number }[];
}

/**
 * run the Field Boss reinforcement grant for one eligible clear (per account, §4.2 scope + §3.5 fragment).
 *
 * Order (mirrors milestone MARKER-FIRST, §18.2): read pity → roll (pity + fragment) → **persist the pity result
 * first**, then grant items. A crash/DB error between the persist and the grant under-grants that clear (the
 * counter already advanced) — chosen deliberately over the worse failure of double-granting the material. The
 * fragment does not touch pity, so a lost fragment has no ladder side-effect.
 */
export async function grantFieldBossReinforcement(
  deps: FieldBossReinforcementDeps,
  ctx: FieldBossReinforcementContext,
): Promise<FieldBossReinforcementOutcome> {
  const currentPity = await deps.store.getPityCount(ctx.accountId, ctx.bossId);
  const pityEval = evaluateReinforcementPity(currentPity, deps.pity, deps.rng);
  const fragmentDropped = evaluateFragmentDrop(deps.fragmentChancePercent, deps.rng);

  // persist the pity result FIRST (at-most-once posture) — the fragment roll never affects pity.
  await deps.store.applyClearResult({ accountId: ctx.accountId, bossId: ctx.bossId, dropped: pityEval.dropped });

  const grants: { itemId: string; quantity: number; stackable: boolean; uniqueEquipGroup: string | null }[] = [];
  if (pityEval.dropped && deps.reinforcementQuantity > 0) {
    const meta = deps.itemMeta(deps.reinforcementItemId);
    grants.push({
      itemId: deps.reinforcementItemId,
      quantity: deps.reinforcementQuantity,
      stackable: meta.stackable,
      uniqueEquipGroup: meta.uniqueEquipGroup,
    });
  }
  if (fragmentDropped && deps.fragmentQuantity > 0) {
    const meta = deps.itemMeta(deps.fragmentItemId);
    grants.push({
      itemId: deps.fragmentItemId,
      quantity: deps.fragmentQuantity,
      stackable: meta.stackable,
      uniqueEquipGroup: meta.uniqueEquipGroup,
    });
  }

  let granted: { itemId: string; quantity: number }[] = [];
  let delivered: { itemId: string; quantity: number }[] = [];
  let overflow: { itemId: string; quantity: number }[] = [];
  if (grants.length > 0) {
    if (deps.inventory) {
      const outcome = await deps.inventory.grantItems({
        accountId: ctx.accountId,
        characterId: ctx.characterId,
        capacity: deps.capacity,
        grants,
      });
      granted = outcome.granted;
      if (outcome.overflow.length > 0) {
        if (deps.delivery) {
          await deps.delivery.createEntry({ accountId: ctx.accountId, items: outcome.overflow });
          delivered = outcome.overflow;
        } else {
          overflow = outcome.overflow;
        }
      }
    } else {
      overflow = grants.map((g) => ({ itemId: g.itemId, quantity: g.quantity }));
    }
  }

  return {
    reinforcementDropped: pityEval.dropped,
    fragmentDropped,
    clearNumber: pityEval.clearNumber,
    effectiveChancePercent: pityEval.effectiveChancePercent,
    pityCount: pityEval.nextPityCount,
    guaranteedAtClear: deps.pity.guaranteedAtClear,
    granted,
    delivered,
    overflow,
  };
}
