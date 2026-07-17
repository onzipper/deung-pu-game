// Batch 7b-server / PR5 · M2a (D-073) — recovery planner (PURE, no I/O). One side-effect-free decision the runtime
// calls each tick to choose between the normal PR4 farm loop and a recovery action. Tier settlement, async
// drinks, A* routing, respawn detection, and DB access all stay in the runtime; this module only decides.
//
// Owner-locked semantics (D-063 · §6.2 no power sold · D-073):
//   • Free tier recovers with POTIONS ONLY (auto-drink + the low-hp floor stop) — D-073 gave Free auto-potion, a
//     convenience, never combat power. Free NEVER gets death recovery or pocket fallback (that stays paid — the
//     Free branch structurally cannot return plan_return/follow_route/arrived/fallback_pocket/stop("death")).
//   • Auto-potion is OPT-IN for every tier: no plan rule (potionThresholdFraction === null) ⇒ never drink; the
//     low-hp floor stop still applies exactly as it did for Free before.
//   • Death recovery (Plus/Pro only): the game respawns the real character at full HP at the safe camp; the planner
//     observes that respawn, then plans a route back to the assigned pocket.
//   • Pocket fallback (Plus/Pro only): a dry active pocket hands off to another allowed pocket that still has mobs;
//     the assigned pocket wins back as soon as it has alive mobs when preferAssignedPocket.

import type { BotConfig, BotStopReason, BotTier } from "../config/bot";
import { squaredDistance, withinRange, type Vec2 } from "./agent";

/**
 * Where a run currently sits inside recovery. Owned by the runtime (it sets the phase from async drink results,
 * death/respawn observation, and A* planning); the planner only reads it. `none` = not mid-recovery this tick.
 */
export type RecoveryPhase =
  | { kind: "none" }
  | { kind: "potion_pending" } // an async drink is in flight — wait for its result
  | { kind: "potion_backoff"; retryAtMs: number } // drink failed (no_potion / on_cooldown) — no retry before retryAtMs
  | { kind: "awaiting_respawn"; diedAtMs: number } // died; waiting to observe the game's safe-camp respawn
  | { kind: "returning"; targetPocketId: string; waypoints: Vec2[]; nextIndex: number }; // walking the planned route back

/** Everything the planner needs for one tick. All fields are read-only inputs; the planner mutates nothing. */
export interface RecoverySnapshot {
  nowMs: number;
  tier: BotTier; // "free" → always baseline
  hpFraction: number;
  position: Vec2 | null;
  assignedPocketId: string; // the profile's pocket — wins back when it has mobs (preferAssignedPocket)
  activePocketId: string; // the pocket currently being farmed (may be a fallback)
  allowedPockets: readonly string[]; // already filtered to pockets that exist in this room
  pocketsWithAliveMobs: ReadonlySet<string>;
  pocketAnchors: ReadonlyMap<string, Vec2>; // anchor position per allowed pocket (distance ordering + arrival)
  potionThresholdFraction: number | null; // null = no potion rule (opt-in)
  lowHpStopFraction: number; // floor (config, 0.15 today)
  idleDecisions: number; // consecutive idle decisions on the active pocket
  deathRecoveryCount: number; // runtime-owned gate input; the planner never re-gates on it (see planRecovery doc)
  phase: RecoveryPhase;
}

/** The single action the runtime applies this tick. `baseline` = run the normal PR4 farm loop. */
export type RecoveryDecision =
  | { kind: "baseline" }
  | { kind: "hold" } // stay in recovery, do nothing this tick (drink in flight / awaiting respawn / backoff wait)
  | { kind: "use_potion" }
  | { kind: "plan_return"; targetPocketId: string }
  | { kind: "follow_route" }
  | { kind: "arrived" }
  | { kind: "fallback_pocket"; targetPocketId: string }
  | { kind: "stop"; reason: BotStopReason };

/**
 * Deterministic recovery decision for one tick. Precedence (first match wins):
 *   1. tier "free" → potion decision + low-hp floor ONLY (D-073). Free skips the death phases and pocket fallback
 *      entirely, so it can never return plan_return/follow_route/arrived/fallback_pocket/stop("death").
 *   2. death phases (paid):
 *        • awaiting_respawn: respawn observed → plan_return(assigned); timed out → stop("death"); else hold.
 *        • returning: route consumed OR within arrive radius of the last waypoint → arrived; else follow_route.
 *   3. potion (only with a rule, and only once past the death phases):
 *        • potion_pending → hold; hp ≤ threshold & phase none → use_potion (drink-first, beats the floor stop);
 *        • hp ≤ threshold & backoff: elapsed → use_potion; not elapsed → fall through.
 *   4. low-hp floor: hp ≤ lowHpStopFraction with no potion path available (no rule, or backoff cooling) → stop("low_hp").
 *   5. pocket fallback (paid): assigned regained mobs while on a fallback pocket → switch back immediately (no idle
 *      wait); else after pocketFallbackIdleDecisions idle decisions, switch to a qualifying pocket (assigned
 *      preferred, else nearest).
 *   6. else baseline.
 * The maxDeathRecoveriesPerSession gate lives where death recovery STARTS (runtime); the planner never re-gates —
 * it proceeds even if deathRecoveryCount already exceeds the cap, so the two owners of that gate cannot disagree.
 */
export function planRecovery(s: RecoverySnapshot, cfg: BotConfig["recovery"]): RecoveryDecision {
  // 1 — Free (D-073): potion decision + low-hp floor only. No death phases, no pocket fallback (tier boundary).
  if (s.tier === "free") return planPotionOrFloor(s) ?? { kind: "baseline" };

  const phase = s.phase;

  // 2 — Death recovery phases take precedence over the potion/fallback loop (paid).
  if (phase.kind === "awaiting_respawn") {
    if (s.position !== null && s.hpFraction >= cfg.respawnObserveMinHpFraction) {
      return { kind: "plan_return", targetPocketId: s.assignedPocketId };
    }
    if (s.nowMs - phase.diedAtMs > cfg.respawnObserveTimeoutMs) {
      return { kind: "stop", reason: "death" };
    }
    return { kind: "hold" };
  }
  if (phase.kind === "returning") {
    const consumed = phase.nextIndex >= phase.waypoints.length;
    const last = phase.waypoints.length > 0 ? phase.waypoints[phase.waypoints.length - 1] : null;
    const arrived =
      consumed ||
      (s.position !== null && last !== null && withinRange(s.position, last, cfg.pocketArriveRadiusTiles));
    return arrived ? { kind: "arrived" } : { kind: "follow_route" };
  }

  // 3+4 — Auto-potion (opt-in) + low-hp floor, shared with the Free branch.
  const recover = planPotionOrFloor(s);
  if (recover) return recover;

  // 5 — Pocket fallback (dry active pocket, or the assigned pocket regaining mobs).
  const fallback = planPocketFallback(s, cfg);
  if (fallback) return fallback;

  // 6 — Nothing to recover: run the normal farm loop.
  return { kind: "baseline" };
}

/**
 * The tier-shared potion + low-hp-floor sub-decision (D-073 gave Free this exact path — potions + floor, nothing
 * else). Returns null when neither applies (the caller falls through to death/fallback/baseline). Auto-potion is
 * opt-in (a plan rule sets the threshold); a drink-first beats the floor stop.
 */
function planPotionOrFloor(s: RecoverySnapshot): RecoveryDecision | null {
  const phase = s.phase;
  // D-075: a positive fraction = auto-potion on; null (never set) OR 0 (player turned it off, arriving here as the
  // pct-0 sentinel via the runtime) both mean "no potion path" — the same semantics as botPotionThresholdEnabled.
  if (s.potionThresholdFraction !== null && s.potionThresholdFraction > 0) {
    if (phase.kind === "potion_pending") return { kind: "hold" };
    if (s.hpFraction <= s.potionThresholdFraction) {
      if (phase.kind === "none") return { kind: "use_potion" };
      if (phase.kind === "potion_backoff" && s.nowMs >= phase.retryAtMs) return { kind: "use_potion" };
      // backoff not elapsed → fall through to the floor stop / baseline.
    }
  }
  // Low-hp floor: no potion path available (no rule, or backoff still cooling) and at/below the floor.
  if (s.hpFraction <= s.lowHpStopFraction) return { kind: "stop", reason: "low_hp" };
  return null;
}

/**
 * Pocket-fallback sub-decision. Returns null when no switch applies (caller falls through to baseline, where the
 * existing stuck counter still owns the terminal `stuck` stop).
 */
function planPocketFallback(s: RecoverySnapshot, cfg: BotConfig["recovery"]): RecoveryDecision | null {
  // The assigned pocket wins back the moment it has mobs again — no idle wait (preferAssignedPocket).
  if (
    cfg.preferAssignedPocket &&
    s.activePocketId !== s.assignedPocketId &&
    s.pocketsWithAliveMobs.has(s.assignedPocketId)
  ) {
    return { kind: "fallback_pocket", targetPocketId: s.assignedPocketId };
  }

  // Otherwise only switch once the active pocket has been dry for enough consecutive idle decisions.
  if (s.idleDecisions < cfg.pocketFallbackIdleDecisions) return null;

  const candidates = s.allowedPockets.filter(
    (p) => p !== s.activePocketId && s.pocketsWithAliveMobs.has(p),
  );
  if (candidates.length === 0) return null; // let the stuck counter settle it via baseline.

  if (cfg.preferAssignedPocket && candidates.includes(s.assignedPocketId)) {
    return { kind: "fallback_pocket", targetPocketId: s.assignedPocketId };
  }
  return { kind: "fallback_pocket", targetPocketId: nearestPocket(candidates, s.position, s.pocketAnchors) };
}

/**
 * Nearest candidate pocket by squared-Euclidean anchor distance to `position`. Ties resolve to the earliest in
 * `candidates` order (which preserves allowedPockets order). A null position, or no candidate with a known
 * anchor, falls back to the first candidate.
 */
function nearestPocket(
  candidates: readonly string[],
  position: Vec2 | null,
  anchors: ReadonlyMap<string, Vec2>,
): string {
  if (position === null) return candidates[0];
  let best = candidates[0];
  let bestDist = Infinity;
  for (const p of candidates) {
    const anchor = anchors.get(p);
    if (!anchor) continue;
    const d = squaredDistance(position, anchor);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}
