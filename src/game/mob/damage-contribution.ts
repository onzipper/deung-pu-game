// P2 G-lite — per-mob damage-contribution tracker (Economy §10.2/§10.3 reward eligibility). **PURE +
// SERVER-AUTHORITATIVE, never-downgrade zone (who gets the reward = money/EXP correctness).** No PixiJS/React
// — MapRoom holds the one mutable state and calls these helpers; they stay unit-testable with no room/DB.
//
// Model (Economy §10.2/§10.3):
//   • every damage application to a mob is recorded per session (recordDamage).
//   • at kill time the caller asks eligibleFor(): who may share the reward, gated by damage contribution +
//     presence (still connected · in Reward Radius · in-scene — the caller supplies presence from room state).
//   • SOLO channel (partyId=""): each player is gated on their OWN share ≥ threshold (normal 15% / elite-boss
//     5%). "Last Hit ไม่มีสิทธิ์พิเศษ" → the killer is just a contributor, excluded when below threshold.
//   • PARTY channel (partyId≠""): under filterBy(['mapId','partyId']) a party channel holds only party members,
//     so the party's COMBINED contribution = 100% of the mob's damage ≥ threshold whenever anyone dealt
//     damage → every PRESENT contributor shares (personal reward, no individual gate). §10.3 note "P2 Primary
//     Class ใช้ Damage Contribution ก่อน": a zero-damage member is not a contributor → not eligible yet
//     (support/aura contribution is a later phase).
//
// Lifecycle: a killed/despawned mob's ledger is dropped (clearMob / retainMobs from syncMobsToState — mob ids
// are monotonic so they never collide across respawns). A session that LEAVES keeps its recorded damage (it
// still counts toward everyone else's share denominator); presence filtering removes the leaver at kill time.

/** rank buckets that pick the eligibility threshold (Economy §10.2 normal vs §10.3 elite/boss). */
export type MobRewardRank = "normal" | "elite" | "boss";

/** per-mob damage ledger: mobId → (sessionId → cumulative damage dealt to that mob). */
export interface DamageContributionState {
  readonly byMob: Map<string, Map<string, number>>;
}

/** one contributor's slice of a mob's total damage. `sharePct` ∈ [0,100]. */
export interface DamageShare {
  sessionId: string;
  damage: number;
  sharePct: number;
}

/** eligibility query knobs — thresholds are Design Knobs (§48) injected from the economy config. */
export interface EligibilityQuery {
  rank: MobRewardRank;
  /** true = party channel (combined gate); false = solo channel (individual gate). */
  isParty: boolean;
  /** §10.2 normal-monster minimum damage-contribution percent (15). */
  normalMinSharePct: number;
  /** §10.3 elite/boss minimum damage-contribution percent (5). */
  eliteBossMinSharePct: number;
  /** present = still connected AND within Reward Radius AND in-scene (caller reads room state). */
  isPresent: (sessionId: string) => boolean;
}

export function createDamageContributionState(): DamageContributionState {
  return { byMob: new Map() };
}

/**
 * record damage a session dealt to a mob (accumulates across hits). `damage` ≤ 0 (or non-finite) is a no-op —
 * only real hp reduction counts toward contribution. O(1).
 */
export function recordDamage(
  state: DamageContributionState,
  mobId: string,
  sessionId: string,
  damage: number,
): void {
  if (!(damage > 0) || !Number.isFinite(damage)) return;
  let perSession = state.byMob.get(mobId);
  if (!perSession) {
    perSession = new Map();
    state.byMob.set(mobId, perSession);
  }
  perSession.set(sessionId, (perSession.get(sessionId) ?? 0) + damage);
}

/** drop one mob's whole ledger (death / respawn / despawn). O(1). */
export function clearMob(state: DamageContributionState, mobId: string): void {
  state.byMob.delete(mobId);
}

/**
 * keep only the mob ids in `liveIds`, dropping every other ledger (despawn cleanup — called from
 * syncMobsToState with the set of live sim mob ids). Bounds memory to the live mob count.
 */
export function retainMobs(state: DamageContributionState, liveIds: ReadonlySet<string>): void {
  for (const mobId of state.byMob.keys()) {
    if (!liveIds.has(mobId)) state.byMob.delete(mobId);
  }
}

/** total damage recorded on a mob (0 when the mob has no ledger). */
export function totalDamageFor(state: DamageContributionState, mobId: string): number {
  const perSession = state.byMob.get(mobId);
  if (!perSession) return 0;
  let total = 0;
  for (const dmg of perSession.values()) total += dmg;
  return total;
}

/**
 * per-contributor share of a mob's total damage, in insertion (first-hit) order. Empty when the mob took no
 * recorded damage. `sharePct` = damage / total × 100 (a lone contributor = 100%).
 */
export function contributionsFor(state: DamageContributionState, mobId: string): DamageShare[] {
  const perSession = state.byMob.get(mobId);
  if (!perSession) return [];
  const total = totalDamageFor(state, mobId);
  if (total <= 0) return [];
  const out: DamageShare[] = [];
  for (const [sessionId, damage] of perSession) {
    out.push({ sessionId, damage, sharePct: (damage / total) * 100 });
  }
  return out;
}

/**
 * count of distinct contributors on a mob whose share ≥ `minSharePct` — the party-size input for the boss
 * break window (§2.4: solo vs party). The caller clamps ≥ 1 (a boss with no recorded damage yet = solo).
 */
export function contributorCountAtLeast(
  state: DamageContributionState,
  mobId: string,
  minSharePct: number,
): number {
  let n = 0;
  for (const c of contributionsFor(state, mobId)) {
    if (c.sharePct >= minSharePct) n++;
  }
  return n;
}

/**
 * eligible reward recipients for a mob kill (Economy §10.2/§10.3). Returns each recipient with the share they
 * dealt (for per-member achievement payloads). See the module header for the solo-vs-party gate. Presence
 * (connected + Reward Radius + in-scene) is always required — a leaver's damage still counts toward everyone
 * else's denominator but the leaver themselves is filtered out here.
 */
export function eligibleFor(
  state: DamageContributionState,
  mobId: string,
  q: EligibilityQuery,
): { sessionId: string; sharePct: number }[] {
  const contribs = contributionsFor(state, mobId);
  if (contribs.length === 0) return [];
  const threshold = q.rank === "normal" ? q.normalMinSharePct : q.eliteBossMinSharePct;
  if (q.isParty) {
    // party channel: combined contribution = 100% (filterBy → no outsiders) ≥ threshold whenever anyone dealt
    // damage → every present contributor shares. No individual gate, no last-hit privilege (§10.2).
    return contribs
      .filter((c) => q.isPresent(c.sessionId))
      .map((c) => ({ sessionId: c.sessionId, sharePct: c.sharePct }));
  }
  // solo channel: each contributor gated on their own share ≥ threshold (killer included — no last-hit bonus).
  return contribs
    .filter((c) => c.sharePct >= threshold && q.isPresent(c.sessionId))
    .map((c) => ({ sessionId: c.sessionId, sharePct: c.sharePct }));
}
