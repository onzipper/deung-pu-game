import { describe, expect, test } from "vitest";
import { DEFAULT_BOT_CONFIG, type BotConfig } from "../server/config/bot";
import { pocketsWithAliveMobs, type AgentMob, type Vec2 } from "../server/bot/agent";
import {
  planRecovery,
  type RecoveryPhase,
  type RecoverySnapshot,
} from "../server/bot/recovery";

// PR5 recovery planner (pure): deterministic per-tick decision. Table-style, local snapshot factory with
// overrides, cfg spread-overridden from DEFAULT_BOT_CONFIG.recovery.

const snap = (o: Partial<RecoverySnapshot> = {}): RecoverySnapshot => ({
  nowMs: 1000,
  tier: "plus",
  hpFraction: 0.9,
  position: { tx: 0, ty: 0 },
  assignedPocketId: "A",
  activePocketId: "A",
  allowedPockets: ["A", "B", "C"],
  pocketsWithAliveMobs: new Set<string>(),
  pocketAnchors: new Map<string, Vec2>(),
  potionThresholdFraction: null,
  lowHpStopFraction: 0.15,
  idleDecisions: 0,
  deathRecoveryCount: 0,
  phase: { kind: "none" },
  ...o,
});

const cfg = (o: Partial<BotConfig["recovery"]> = {}): BotConfig["recovery"] => ({
  ...DEFAULT_BOT_CONFIG.recovery,
  ...o,
});

const mob = (id: string, pocketId: string, hp: number): AgentMob => ({
  id,
  mobType: "slime",
  tx: 0,
  ty: 0,
  hp,
  pocketId,
});

describe("free tier", () => {
  test("never recovers — baseline even at hp 0.01 mid death-recovery", () => {
    const d = planRecovery(
      snap({ tier: "free", hpFraction: 0.01, phase: { kind: "awaiting_respawn", diedAtMs: 0 } }),
      cfg(),
    );
    expect(d).toEqual({ kind: "baseline" });
  });
});

describe("potion (opt-in)", () => {
  test("threshold null → never drinks; at/below floor → stop low_hp", () => {
    expect(planRecovery(snap({ potionThresholdFraction: null, hpFraction: 0.1 }), cfg())).toEqual({
      kind: "stop",
      reason: "low_hp",
    });
  });
  test("threshold 0.5 + hp 0.4 → use_potion", () => {
    expect(
      planRecovery(snap({ potionThresholdFraction: 0.5, hpFraction: 0.4 }), cfg()),
    ).toEqual({ kind: "use_potion" });
  });
  test("hp above threshold → baseline", () => {
    expect(
      planRecovery(snap({ potionThresholdFraction: 0.5, hpFraction: 0.8 }), cfg()),
    ).toEqual({ kind: "baseline" });
  });
  test("potion_pending → hold", () => {
    expect(
      planRecovery(
        snap({ potionThresholdFraction: 0.5, hpFraction: 0.4, phase: { kind: "potion_pending" } }),
        cfg(),
      ),
    ).toEqual({ kind: "hold" });
  });
  test("backoff not elapsed + hp between floor and threshold → baseline", () => {
    const phase: RecoveryPhase = { kind: "potion_backoff", retryAtMs: 5000 };
    expect(
      planRecovery(snap({ potionThresholdFraction: 0.5, hpFraction: 0.3, nowMs: 1000, phase }), cfg()),
    ).toEqual({ kind: "baseline" });
  });
  test("backoff not elapsed + hp ≤ floor → stop low_hp", () => {
    const phase: RecoveryPhase = { kind: "potion_backoff", retryAtMs: 5000 };
    expect(
      planRecovery(snap({ potionThresholdFraction: 0.5, hpFraction: 0.1, nowMs: 1000, phase }), cfg()),
    ).toEqual({ kind: "stop", reason: "low_hp" });
  });
  test("backoff elapsed + hp ≤ threshold → use_potion", () => {
    const phase: RecoveryPhase = { kind: "potion_backoff", retryAtMs: 1000 };
    expect(
      planRecovery(snap({ potionThresholdFraction: 0.5, hpFraction: 0.3, nowMs: 1000, phase }), cfg()),
    ).toEqual({ kind: "use_potion" });
  });
  test("hp ≤ floor + threshold set + phase none → use_potion (drink-first over floor stop)", () => {
    expect(
      planRecovery(snap({ potionThresholdFraction: 0.5, hpFraction: 0.1 }), cfg()),
    ).toEqual({ kind: "use_potion" });
  });
});

describe("death recovery", () => {
  test("awaiting_respawn + full-hp position observed → plan_return(assigned)", () => {
    const d = planRecovery(
      snap({
        assignedPocketId: "A",
        hpFraction: 1.0,
        position: { tx: 5, ty: 5 },
        phase: { kind: "awaiting_respawn", diedAtMs: 0 },
      }),
      cfg({ respawnObserveMinHpFraction: 0.9 }),
    );
    expect(d).toEqual({ kind: "plan_return", targetPocketId: "A" });
  });
  test("awaiting_respawn + timed out (not yet observed) → stop death", () => {
    const d = planRecovery(
      snap({ position: null, nowMs: 20_000, phase: { kind: "awaiting_respawn", diedAtMs: 0 } }),
      cfg({ respawnObserveTimeoutMs: 10_000 }),
    );
    expect(d).toEqual({ kind: "stop", reason: "death" });
  });
  test("awaiting_respawn + not observed + within timeout → hold", () => {
    const d = planRecovery(
      snap({ position: null, nowMs: 5000, phase: { kind: "awaiting_respawn", diedAtMs: 0 } }),
      cfg({ respawnObserveTimeoutMs: 10_000 }),
    );
    expect(d).toEqual({ kind: "hold" });
  });
  test("returning mid-route → follow_route", () => {
    const phase: RecoveryPhase = {
      kind: "returning",
      targetPocketId: "A",
      waypoints: [
        { tx: 2, ty: 0 },
        { tx: 10, ty: 0 },
      ],
      nextIndex: 0,
    };
    const d = planRecovery(snap({ position: { tx: 0, ty: 0 }, phase }), cfg({ pocketArriveRadiusTiles: 2 }));
    expect(d).toEqual({ kind: "follow_route" });
  });
  test("returning + all waypoints consumed → arrived", () => {
    const phase: RecoveryPhase = {
      kind: "returning",
      targetPocketId: "A",
      waypoints: [{ tx: 10, ty: 0 }],
      nextIndex: 1,
    };
    const d = planRecovery(snap({ position: { tx: 0, ty: 0 }, phase }), cfg({ pocketArriveRadiusTiles: 2 }));
    expect(d).toEqual({ kind: "arrived" });
  });
  test("returning + position within arrive radius of last waypoint → arrived", () => {
    const phase: RecoveryPhase = {
      kind: "returning",
      targetPocketId: "A",
      waypoints: [
        { tx: 2, ty: 0 },
        { tx: 10, ty: 0 },
      ],
      nextIndex: 0,
    };
    const d = planRecovery(snap({ position: { tx: 10.5, ty: 0 }, phase }), cfg({ pocketArriveRadiusTiles: 2 }));
    expect(d).toEqual({ kind: "arrived" });
  });
});

describe("pocket fallback", () => {
  test("idle below threshold → baseline", () => {
    const d = planRecovery(
      snap({
        activePocketId: "A",
        assignedPocketId: "A",
        idleDecisions: 2,
        pocketsWithAliveMobs: new Set(["B"]),
      }),
      cfg({ pocketFallbackIdleDecisions: 3 }),
    );
    expect(d).toEqual({ kind: "baseline" });
  });
  test("idle at threshold + assigned has mobs + prefer → fallback to assigned", () => {
    const d = planRecovery(
      snap({
        activePocketId: "B",
        assignedPocketId: "A",
        idleDecisions: 3,
        pocketsWithAliveMobs: new Set(["A"]),
      }),
      cfg({ pocketFallbackIdleDecisions: 3, preferAssignedPocket: true }),
    );
    expect(d).toEqual({ kind: "fallback_pocket", targetPocketId: "A" });
  });
  test("assigned empty → nearest candidate by anchor distance", () => {
    const d = planRecovery(
      snap({
        activePocketId: "A",
        assignedPocketId: "A",
        allowedPockets: ["A", "B", "C", "D"],
        idleDecisions: 3,
        position: { tx: 0, ty: 0 },
        pocketsWithAliveMobs: new Set(["B", "C", "D"]),
        pocketAnchors: new Map<string, Vec2>([
          ["B", { tx: 5, ty: 0 }], // dist² 25
          ["C", { tx: 3, ty: 0 }], // dist² 9  ← nearest
          ["D", { tx: 10, ty: 0 }], // dist² 100
        ]),
      }),
      cfg({ pocketFallbackIdleDecisions: 3, preferAssignedPocket: true }),
    );
    expect(d).toEqual({ kind: "fallback_pocket", targetPocketId: "C" });
  });
  test("nearest tie → first in allowedPockets order", () => {
    const d = planRecovery(
      snap({
        activePocketId: "A",
        assignedPocketId: "A",
        allowedPockets: ["A", "B", "C", "D"],
        idleDecisions: 3,
        position: { tx: 0, ty: 0 },
        pocketsWithAliveMobs: new Set(["B", "C", "D"]),
        pocketAnchors: new Map<string, Vec2>([
          ["B", { tx: 3, ty: 0 }], // dist² 9 (tie)
          ["C", { tx: 3, ty: 0 }], // dist² 9 (tie) — B is earlier in allowedPockets
          ["D", { tx: 10, ty: 0 }], // dist² 100
        ]),
      }),
      cfg({ pocketFallbackIdleDecisions: 3, preferAssignedPocket: true }),
    );
    expect(d).toEqual({ kind: "fallback_pocket", targetPocketId: "B" });
  });
  test("no candidate with mobs → baseline (stuck counter settles it)", () => {
    const d = planRecovery(
      snap({
        activePocketId: "A",
        assignedPocketId: "A",
        idleDecisions: 5,
        pocketsWithAliveMobs: new Set<string>(),
      }),
      cfg({ pocketFallbackIdleDecisions: 3 }),
    );
    expect(d).toEqual({ kind: "baseline" });
  });
  test("farming a fallback pocket while assigned regains mobs → immediate fallback (no idle requirement)", () => {
    const d = planRecovery(
      snap({
        activePocketId: "B",
        assignedPocketId: "A",
        idleDecisions: 0,
        pocketsWithAliveMobs: new Set(["A", "B"]),
      }),
      cfg({ pocketFallbackIdleDecisions: 3, preferAssignedPocket: true }),
    );
    expect(d).toEqual({ kind: "fallback_pocket", targetPocketId: "A" });
  });
});

describe("pocketsWithAliveMobs helper", () => {
  test("collects pockets with at least one alive mob, drops all-dead pockets", () => {
    const mobs = [
      mob("a1", "P", 10),
      mob("a2", "P", 0), // dead — P already counted
      mob("b1", "Q", 0), // dead — Q has no alive mob
      mob("c1", "R", 5),
    ];
    expect(pocketsWithAliveMobs(mobs)).toEqual(new Set(["P", "R"]));
  });
});
