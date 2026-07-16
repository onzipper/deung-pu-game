import { describe, expect, test } from "vitest";
import {
  createDamageContributionState,
  recordDamage,
  clearMob,
  retainMobs,
  totalDamageFor,
  contributionsFor,
  contributorCountAtLeast,
  eligibleFor,
  type EligibilityQuery,
} from "../src/game/mob/damage-contribution";
import { DEFAULT_ECONOMY_CONFIG } from "../server/config";

// P2 G-lite — damage-contribution tracker (Economy §10.2/§10.3 reward eligibility). PURE, never-downgrade
// (who shares the reward = money/EXP correctness). No DB / room — state + present() are injected.

const KNOBS = DEFAULT_ECONOMY_CONFIG.partyReward; // §10.2 15% · §10.3 5% (config, not hardcoded)

/** eligibility query for a mob rank, with an explicit "present" allow-set (default = everyone present). */
function query(
  rank: EligibilityQuery["rank"],
  isParty: boolean,
  present?: ReadonlySet<string>,
): EligibilityQuery {
  return {
    rank,
    isParty,
    normalMinSharePct: KNOBS.normalMinSharePct,
    eliteBossMinSharePct: KNOBS.eliteBossMinSharePct,
    isPresent: (sid) => (present ? present.has(sid) : true),
  };
}

/** seed a mob with a session→damage map and return the state. */
function seed(mobId: string, dmg: Record<string, number>) {
  const s = createDamageContributionState();
  for (const [sid, d] of Object.entries(dmg)) recordDamage(s, mobId, sid, d);
  return s;
}

describe("recordDamage / totalDamageFor", () => {
  test("accumulates per session across hits", () => {
    const s = createDamageContributionState();
    recordDamage(s, "m1", "A", 10);
    recordDamage(s, "m1", "A", 5);
    recordDamage(s, "m1", "B", 20);
    expect(totalDamageFor(s, "m1")).toBe(35);
    expect(contributionsFor(s, "m1").find((c) => c.sessionId === "A")!.damage).toBe(15);
  });

  test("≤0 and non-finite damage is a no-op (only real hp reduction counts)", () => {
    const s = createDamageContributionState();
    recordDamage(s, "m1", "A", 0);
    recordDamage(s, "m1", "A", -50);
    recordDamage(s, "m1", "A", Number.NaN);
    recordDamage(s, "m1", "A", Number.POSITIVE_INFINITY);
    expect(totalDamageFor(s, "m1")).toBe(0);
    expect(contributionsFor(s, "m1")).toEqual([]);
  });

  test("unknown mob → total 0, empty contributions", () => {
    const s = createDamageContributionState();
    expect(totalDamageFor(s, "ghost")).toBe(0);
    expect(contributionsFor(s, "ghost")).toEqual([]);
  });
});

describe("contributionsFor — shares", () => {
  test("share % = damage / total, insertion order preserved, sums to 100", () => {
    const s = seed("m1", { A: 60, B: 30, C: 10 });
    const c = contributionsFor(s, "m1");
    expect(c.map((x) => x.sessionId)).toEqual(["A", "B", "C"]); // first-hit order
    expect(c.map((x) => x.sharePct)).toEqual([60, 30, 10]);
    expect(c.reduce((sum, x) => sum + x.sharePct, 0)).toBeCloseTo(100, 10);
  });

  test("lone contributor = 100%", () => {
    expect(contributionsFor(seed("m1", { A: 999 }), "m1")).toEqual([
      { sessionId: "A", damage: 999, sharePct: 100 },
    ]);
  });
});

describe("contributorCountAtLeast — boss break party-size input (§2.4)", () => {
  const s = seed("boss", { A: 50, B: 40, C: 6, D: 4 }); // total 100 → shares 50/40/6/4
  test("counts distinct contributors ≥ threshold (elite/boss 5%)", () => {
    expect(contributorCountAtLeast(s, "boss", KNOBS.eliteBossMinSharePct)).toBe(3); // A,B,C (D=4% out)
  });
  test("higher threshold shrinks the count", () => {
    expect(contributorCountAtLeast(s, "boss", 45)).toBe(1); // only A (50%)
  });
  test("no damage → 0 (caller clamps ≥1 = solo window)", () => {
    expect(contributorCountAtLeast(createDamageContributionState(), "boss", 5)).toBe(0);
  });
});

describe("eligibleFor — SOLO channel (individual gate, §10.2/§10.3)", () => {
  test("normal mob: each contributor gated on own share ≥ 15%", () => {
    const s = seed("m1", { A: 86, B: 14 }); // A 86% in, B 14% out
    expect(eligibleFor(s, "m1", query("normal", false)).map((e) => e.sessionId)).toEqual(["A"]);
  });

  test("killer below threshold is excluded — no last-hit privilege (§10.2)", () => {
    // killer K landed the last hit but dealt only 10% → excluded; D/E (50/40) qualify.
    const s = seed("m1", { D: 50, E: 40, K: 10 });
    expect(eligibleFor(s, "m1", query("normal", false)).map((e) => e.sessionId)).toEqual(["D", "E"]);
  });

  test("elite/boss threshold is 5% (lower than normal)", () => {
    const s = seed("boss", { A: 94, B: 6 }); // B 6% qualifies for boss, would fail normal 15%
    expect(eligibleFor(s, "boss", query("boss", false)).map((e) => e.sessionId)).toEqual(["A", "B"]);
    expect(eligibleFor(s, "boss", query("normal", false)).map((e) => e.sessionId)).toEqual(["A"]);
  });

  test("all below threshold → nobody eligible (rare, per spec no floor)", () => {
    const s = seed("m1", { A: 14, B: 14, C: 14, D: 14, E: 14, F: 14, G: 16 });
    // only G (16%) clears 15%.
    expect(eligibleFor(s, "m1", query("normal", false)).map((e) => e.sessionId)).toEqual(["G"]);
  });

  test("carries each recipient's own share (for per-member achievement payload)", () => {
    const s = seed("m1", { A: 70, B: 30 });
    expect(eligibleFor(s, "m1", query("normal", false))).toEqual([
      { sessionId: "A", sharePct: 70 },
      { sessionId: "B", sharePct: 30 },
    ]);
  });
});

describe("eligibleFor — PARTY channel (combined gate, §10.2)", () => {
  test("every present contributor shares even below the individual %", () => {
    // party did 100% combined → all present members eligible; the 10% member (excluded in solo) is IN.
    const s = seed("m1", { D: 50, E: 40, K: 10 });
    expect(eligibleFor(s, "m1", query("normal", true)).map((e) => e.sessionId)).toEqual(["D", "E", "K"]);
  });

  test("zero-damage member is not a contributor → not eligible (P2 damage-contribution only, §10.3)", () => {
    const s = seed("m1", { A: 100 }); // B dealt nothing → absent from the ledger
    const eligible = eligibleFor(s, "m1", query("normal", true, new Set(["A", "B"])));
    expect(eligible.map((e) => e.sessionId)).toEqual(["A"]);
  });
});

describe("eligibleFor — presence filter (connected + Reward Radius + in-scene)", () => {
  test("a leaver is excluded but their damage still counts toward others' denominator", () => {
    const s = seed("m1", { A: 50, LEAVER: 50 }); // shares 50/50
    // A present, LEAVER gone → only A eligible; A's share stays 50% (denominator keeps the leaver's damage).
    const eligible = eligibleFor(s, "m1", query("normal", true, new Set(["A"])));
    expect(eligible).toEqual([{ sessionId: "A", sharePct: 50 }]);
    // sanity: the raw contribution table is untouched by presence.
    expect(contributionsFor(s, "m1").map((c) => c.sharePct)).toEqual([50, 50]);
  });

  test("solo channel also applies presence after the threshold gate", () => {
    const s = seed("m1", { A: 80, B: 20 }); // both clear 15%
    const eligible = eligibleFor(s, "m1", query("normal", false, new Set(["B"])));
    expect(eligible.map((e) => e.sessionId)).toEqual(["B"]); // A filtered out (not present)
  });
});

describe("clearMob / retainMobs — lifecycle cleanup", () => {
  test("clearMob drops a single mob's ledger", () => {
    const s = seed("m1", { A: 10 });
    recordDamage(s, "m2", "A", 5);
    clearMob(s, "m1");
    expect(totalDamageFor(s, "m1")).toBe(0);
    expect(totalDamageFor(s, "m2")).toBe(5);
  });

  test("retainMobs keeps only live ids (despawn prune)", () => {
    const s = createDamageContributionState();
    recordDamage(s, "m1", "A", 10);
    recordDamage(s, "m2", "A", 10);
    recordDamage(s, "m3", "A", 10);
    retainMobs(s, new Set(["m2"]));
    expect(totalDamageFor(s, "m1")).toBe(0);
    expect(totalDamageFor(s, "m2")).toBe(10);
    expect(totalDamageFor(s, "m3")).toBe(0);
  });
});
