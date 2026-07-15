// Batch 7b-server — Bot agent decision core (PURE, no I/O). Everything the runtime needs to decide a tick;
// tier-neutral obstacle signals stay unit-testable while runtime policy chooses Free/Plus/Pro disposition.
//
// Efficiency model (§6.2): the bot's attack cadence is skill.cooldown ÷ botEfficiencyTarget (slower than
// optimal). Movement stays normal speed. A manual expert therefore always out-DPS's the bot (no power sold).

import type { BotStopReason } from "../config/bot";
import type { BotSessionCounters } from "./types";

/** A live mob as the agent sees it (projected from the sim's SimMob). */
export interface AgentMob {
  id: string;
  mobType: string;
  tx: number;
  ty: number;
  hp: number;
  pocketId: string;
}

export interface Vec2 {
  tx: number;
  ty: number;
}

// ── target selection ─────────────────────────────────────────────────────────

/**
 * Nearest alive mob that belongs to the bot's pocket (§bot farms its assigned pocket only). Boss/elite pockets
 * are never the bot's pocket (forbidden at create/start), so this naturally excludes them. Returns null when the
 * pocket has no alive mob this tick (drives the `stuck` counter).
 */
export function pickTarget(botPos: Vec2, mobs: readonly AgentMob[], pocketId: string): AgentMob | null {
  let best: AgentMob | null = null;
  let bestDist = Infinity;
  for (const m of mobs) {
    if (m.pocketId !== pocketId || m.hp <= 0) continue;
    const dx = m.tx - botPos.tx;
    const dy = m.ty - botPos.ty;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

/** Squared-distance range test (avoids a sqrt). true when `target` is within `range` tiles of `from`. */
export function withinRange(from: Vec2, target: Vec2, range: number): boolean {
  const dx = target.tx - from.tx;
  const dy = target.ty - from.ty;
  return dx * dx + dy * dy <= range * range;
}

/**
 * One movement step (≤ stepTiles) from `from` toward `to`. Normal movement speed (efficiency throttles ONLY the
 * attack cadence, not movement — §6.2). The caller checks the result against the collision grid and only applies
 * it if walkable. When already within stepTiles, returns `to` exactly.
 */
export function nextStepToward(from: Vec2, to: Vec2, stepTiles: number): Vec2 {
  const dx = to.tx - from.tx;
  const dy = to.ty - from.ty;
  const dist = Math.hypot(dx, dy);
  if (dist <= stepTiles || dist === 0) return { tx: to.tx, ty: to.ty };
  const f = stepTiles / dist;
  return { tx: from.tx + dx * f, ty: from.ty + dy * f };
}

// ── efficiency throttle (§6.2) ───────────────────────────────────────────────

/**
 * The throttled attack cooldown in ms: the base skill cooldown (seconds) divided by the efficiency target, so a
 * lower efficiency ⇒ LONGER gap between attacks ⇒ fewer kills/hour than a manual expert. Clamped to a sane floor.
 */
export function throttledAttackCooldownMs(baseCooldownSeconds: number, efficiencyTarget: number): number {
  const eff = efficiencyTarget > 0 ? efficiencyTarget : 1;
  const base = Math.max(0, baseCooldownSeconds) * 1000;
  return Math.max(50, base / eff);
}

// ── Tier-neutral obstacle and event predicates ───────────────────────────────────────────────────────
// Tier settlement lives in runtime/policy; PR5-PR6 may recover before a predicate becomes a terminal stop.

/** A kill produced bag overflow (the grant returned overflow). */
export function stopForInventoryOverflow(overflowCount: number): BotStopReason | null {
  return overflowCount > 0 ? "inventory_full" : null;
}

/**
 * Low-HP proxy until potion/recovery exists. Signals when the bot's hp fraction is at/below the config floor.
 * hp = 0 is `death` (separate path), so this fires just above.
 */
export function stopForLowHp(hpFraction: number, lowHpFraction: number): BotStopReason | null {
  return hpFraction > 0 && hpFraction <= lowHpFraction ? "low_hp" : null;
}

/** Detect a banked rare/high-value loot line for notification or a future explicit plan action. */
export function findRareDrop(
  lootItemIds: readonly string[],
  rarityOf: (itemId: string) => string | undefined,
  minRarity: "uncommon" | "rare",
): { itemId: string } | null {
  for (const id of lootItemIds) {
    const r = rarityOf(id);
    if (r && rarityAtLeast(r, minRarity)) return { itemId: id };
  }
  return null;
}

/** rarity ordering (Economy §5.1). true when `rarity` ≥ `min`. Unknown rarity → false (never over-stops). */
export function rarityAtLeast(rarity: string, min: "uncommon" | "rare"): boolean {
  const order: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  const rv = order[rarity];
  const mv = order[min];
  if (rv === undefined || mv === undefined) return false;
  return rv >= mv;
}

/**
 * Forbidden-target encounter — a boss/elite/event/unknown entity is within `radius` tiles of automation.
 * `isForbiddenTarget(mobType)` is injected by the authoritative world host.
 */
export function stopForForbiddenTargetInRange(
  botPos: Vec2,
  mobs: readonly AgentMob[],
  isForbiddenTarget: (mobType: string) => boolean,
  radius: number,
): BotStopReason | null {
  for (const m of mobs) {
    if (m.hp <= 0 || !isForbiddenTarget(m.mobType)) continue;
    if (withinRange(botPos, m, radius)) return "boss_or_event";
  }
  return null;
}

/** #5 map unsafe — no reachable target for `limit` consecutive ticks (pocket empty / unreachable) → stop `stuck`. */
export function stopForStuck(consecutiveIdleTicks: number, limit: number): BotStopReason | null {
  return consecutiveIdleTicks >= limit ? "stuck" : null;
}

// ── session counters ─────────────────────────────────────────────────────────

/** Fold one kill's rewards into the running counters (flushed to bot_sessions periodically + on stop). */
export function accumulateKill(
  counters: BotSessionCounters,
  gold: number,
  exp: number,
  loot: readonly { itemId: string; quantity: number }[],
): void {
  counters.killCount += 1;
  counters.goldEarned += Math.max(0, Math.round(gold));
  counters.expEarned += Math.max(0, Math.round(exp));
  for (const line of loot) {
    counters.drops[line.itemId] = (counters.drops[line.itemId] ?? 0) + line.quantity;
  }
}

/** A fresh zeroed counter set. */
export function emptyCounters(): BotSessionCounters {
  return { killCount: 0, goldEarned: 0, expEarned: 0, drops: {} };
}
