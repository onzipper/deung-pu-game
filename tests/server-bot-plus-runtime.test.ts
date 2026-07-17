import { describe, expect, test, vi } from "vitest";
import {
  BotRuntime,
  type BotAttackOutcome,
  type BotHost,
  type BotPotionOutcome,
  type BotTownTxResult,
} from "../server/bot/runtime";
import { BotManager, type BotManagerDeps } from "../server/bot/manager";
import type { ProfileRepo } from "../server/bot/profiles";
import type { SessionRepo, TierRepo } from "../server/bot/store";
import type { AgentMob, Vec2 } from "../server/bot/agent";
import type { BotProfileRow, BotRulesV1, BotTierStateRow } from "../server/bot/types";
import { MSG_BOT_OP_RESULT, type BotOpResultMessage } from "../src/shared/net-protocol";
import { DEFAULT_BOT_CONFIG, type BotConfig, type BotTier } from "../server/config/bot";
import {
  MSG_BOT_ALERT,
  MSG_BOT_STATUS,
  MSG_BOT_STOPPED,
  type BotAlertMessage,
  type BotStatusMessage,
  type BotStoppedMessage,
} from "../src/shared/net-protocol";
import { createWarpHarness, FakeWorld, warpConfig, type BagSeed } from "./helpers/warp-world";

// PR5 Phase A — Plus/Pro recovery runtime. The Free baseline stays byte-identical (see
// server-bot-free-runtime.test.ts); this suite drives the paid recovery loop (auto-potion, death respawn/return,
// pocket fallback, live tier recheck) around the same PR4 farm body. Fake clock + injectable host seams; async
// host ops (drink/attack) are drained with `await flush()`.

const EMPTY_OUTCOME: BotAttackOutcome = {
  killed: 0,
  gold: 0,
  exp: 0,
  loot: [],
  bagOverflowed: false,
  overflow: [],
  leveledUp: false,
};

const UNAVAILABLE_POTION: BotPotionOutcome = { status: "unavailable", hpFraction: 1, cooldownUntilMs: 0 };
const HEALED_POTION: BotPotionOutcome = { status: "healed", hpFraction: 1, cooldownUntilMs: 0 };
const NO_POTION: BotPotionOutcome = { status: "no_potion", hpFraction: 0.1, cooldownUntilMs: 0 };

const POTION_RULES: BotRulesV1 = { skillSlots: [0], potionThresholdPct: 50, lootAll: true };
const NO_POTION_RULES: BotRulesV1 = { skillSlots: [0], potionThresholdPct: null, lootAll: true };

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeConfig(
  top: Partial<BotConfig> = {},
  recovery: Partial<BotConfig["recovery"]> = {},
): BotConfig {
  return {
    ...DEFAULT_BOT_CONFIG,
    botAllowedPockets: { map1: ["A"] },
    ...top,
    recovery: { ...DEFAULT_BOT_CONFIG.recovery, ...recovery },
  };
}

interface PlusHarnessOptions {
  config?: BotConfig;
  tier?: BotTier;
  mapId?: string;
  pocketId?: string;
  rules?: BotRulesV1;
  mobs?: () => AgentMob[];
  hpFraction?: () => number;
  pos?: () => Vec2 | null;
  startPos?: Vec2 | null;
  stepToward?: (target: Vec2) => boolean;
  attack?: (target: Vec2) => Promise<BotAttackOutcome>;
  usePotion?: () => Promise<BotPotionOutcome>;
  planPath?: (goal: Vec2) => Vec2[] | null;
  pocketAnchor?: (pocketId: string) => Vec2 | null;
  pocketExists?: (pocketId: string) => boolean;
  resolveTier?: () => Promise<BotTier>;
}

function createPlusHarness(options: PlusHarnessOptions = {}) {
  let clock = 10_000;
  let stoppedCount = 0;
  let resolveTierCalls = 0;
  let currentPos: Vec2 | null = options.startPos ?? { tx: 0, ty: 0 };
  const releases: string[] = [];
  const messages: { type: string; message: unknown }[] = [];
  const patches: Parameters<SessionRepo["patch"]>[] = [];
  const usePotionCalls: Array<[string, string]> = [];
  const planPathCalls: Vec2[] = [];
  const pocketAnchorCalls: string[] = [];
  const stepTargets: Vec2[] = [];
  const attackTargets: Vec2[] = [];

  const sessionRepo: SessionRepo = {
    insert: async () => undefined,
    patch: async (...args) => {
      patches.push(args);
    },
    listByAccount: async () => [],
    getById: async () => null,
    markOpenAsRestart: async () => 0,
  };

  const host: BotHost = {
    mapId: options.mapId ?? "map1",
    roomId: "room-1",
    botClaimAuthority: () => "actor",
    botReleaseAuthority: (actorId) => {
      releases.push(actorId);
    },
    botMobs: () => options.mobs?.() ?? [],
    botPos: () => (options.pos ? options.pos() : currentPos),
    botHpFraction: () => options.hpFraction?.() ?? 1,
    botAttackRange: () => 1,
    botBaseCooldownSeconds: () => 1,
    botStepToward: (_actorId, target) => {
      stepTargets.push({ tx: target.tx, ty: target.ty });
      const progressed = options.stepToward ? options.stepToward(target) : false;
      if (progressed && currentPos) currentPos = { tx: target.tx, ty: target.ty };
      return progressed;
    },
    botAttack: async (_actorId, target) => {
      attackTargets.push({ tx: target.tx, ty: target.ty });
      return options.attack ? options.attack(target) : EMPTY_OUTCOME;
    },
    botOwnerSend: (_accountId, type, message) => {
      messages.push({ type, message });
      return true;
    },
    isForbiddenTargetType: () => false,
    pocketExists: (pocketId) => options.pocketExists?.(pocketId) ?? true,
    botUsePotion: (actorId, itemId) => {
      usePotionCalls.push([actorId, itemId]);
      return options.usePotion ? options.usePotion() : Promise.resolve(UNAVAILABLE_POTION);
    },
    botPlanPath: (_actorId, goal) => {
      planPathCalls.push({ tx: goal.tx, ty: goal.ty });
      return options.planPath ? options.planPath(goal) : null;
    },
    botPocketAnchor: (pocketId) => {
      pocketAnchorCalls.push(pocketId);
      return options.pocketAnchor ? options.pocketAnchor(pocketId) : null;
    },
    partyId: "",
    botReserveWarpSeat: () => true,
    botReleaseWarpSeat: () => undefined,
    botExportActor: () => null,
    botAttachWarpedActor: () => false,
    botPersistNow: () => undefined,
    botBagItems: async () => [],
    botTownSell: async () => ({ ok: false, reason: "unavailable" }),
    botTownDeposit: async () => ({ ok: false, reason: "unavailable" }),
    botTownBuy: async () => ({ ok: false, reason: "unavailable" }),
    botGoldBalance: async () => null,
    botSafeCampAnchor: () => ({ tx: 0, ty: 0 }),
  };

  const runtime = new BotRuntime({
    host,
    config: options.config ?? makeConfig(),
    sessionRepo,
    rarityOf: () => undefined,
    sessionRowId: "run-plus",
    accountId: "account-a",
    characterId: "character-a",
    profileId: "profile-a",
    actorId: "actor",
    mapId: options.mapId ?? "map1",
    pocketId: options.pocketId ?? "A",
    rules: options.rules ?? NO_POTION_RULES,
    tier: options.tier ?? "plus",
    resolveTier: options.resolveTier
      ? () => {
          resolveTierCalls += 1;
          return options.resolveTier!();
        }
      : async () => {
          resolveTierCalls += 1;
          return options.tier ?? "plus";
        },
    baseCooldownSeconds: 1,
    startedAtMs: clock,
    now: () => clock,
    onStopped: () => {
      stoppedCount += 1;
    },
    onTakeoverSettled: () => undefined,
  });

  return {
    runtime,
    host,
    releases,
    messages,
    patches,
    usePotionCalls,
    planPathCalls,
    pocketAnchorCalls,
    stepTargets,
    attackTargets,
    resolveTierCalls: () => resolveTierCalls,
    stoppedCount: () => stoppedCount,
    advanceClock: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    statusPocketIds: () =>
      messages
        .filter((m) => m.type === MSG_BOT_STATUS)
        .map((m) => (m.message as BotStatusMessage).pocketId),
    stoppedMessage: () =>
      messages.find((m) => m.type === MSG_BOT_STOPPED)?.message as BotStoppedMessage | undefined,
    state: () => runtime.continuitySnapshot.state,
    revision: () => runtime.continuitySnapshot.revision,
  };
}

const slime = (id: string, pocketId: string, tx = 0, ty = 0, hp = 10): AgentMob => ({
  id,
  mobType: "slime",
  tx,
  ty,
  hp,
  pocketId,
});

describe("Plus recovery runtime — auto-potion", () => {
  test("potion happy path heals in place and resumes the farm (WORKING→RECOVERING→WORKING)", async () => {
    let hp = 0.4;
    const harness = createPlusHarness({
      rules: POTION_RULES,
      hpFraction: () => hp,
      usePotion: async () => HEALED_POTION,
      mobs: () => [slime("m1", "A")],
    });

    const trail: Array<{ state: string; revision: number }> = [
      { state: harness.state(), revision: harness.revision() },
    ];
    harness.runtime.tick(2_000); // hp ≤ threshold + phase none → use_potion → RECOVERING, drink in flight
    trail.push({ state: harness.state(), revision: harness.revision() });
    await flush(); // healed → back to WORKING
    trail.push({ state: harness.state(), revision: harness.revision() });

    expect(trail.map((t) => t.state)).toEqual(["WORKING", "RECOVERING", "WORKING"]);
    expect(trail.map((t) => t.revision)).toEqual([0, 1, 2]); // strictly increasing, revision-fenced
    expect(harness.usePotionCalls).toEqual([["actor", "con_small_potion"]]);

    // Farm resumes now that HP is restored.
    hp = 1;
    harness.runtime.tick(2_000);
    expect(harness.runtime.isStopped).toBe(false);
    expect(harness.attackTargets).toHaveLength(1);
  });

  test("potion exhausted backs off, never re-drinks before retry, then the floor stops it low_hp", async () => {
    let hp = 0.1; // ≤ threshold (0.5) AND ≤ floor (0.15)
    const harness = createPlusHarness({
      rules: POTION_RULES,
      hpFraction: () => hp,
      usePotion: async () => NO_POTION,
      mobs: () => [],
    });

    harness.runtime.tick(2_000); // use_potion → RECOVERING, drink in flight
    await flush(); // no_potion → potion_backoff, WORKING
    expect(harness.state()).toBe("WORKING");

    hp = 0.3; // between floor and threshold: backoff not elapsed → baseline, no second drink
    harness.runtime.tick(2_000);
    expect(harness.runtime.isStopped).toBe(false);

    hp = 0.1; // at/below floor while still backing off → floor stop
    harness.runtime.tick(2_000);

    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(harness.usePotionCalls).toHaveLength(1); // backoff respected
    expect(harness.stoppedMessage()).toMatchObject({
      reason: "low_hp",
      continuity: { state: "WAITING_FOR_OWNER" },
    });
  });
});

describe("Plus recovery runtime — death respawn/return", () => {
  test("death → RECOVERING → RETURNING_TO_WORK, consumes the route, arrives WORKING", () => {
    const harness = createPlusHarness({
      rules: NO_POTION_RULES,
      hpFraction: () => 1,
      mobs: () => [],
      planPath: () => [
        { tx: 5, ty: 0 },
        { tx: 10, ty: 0 },
      ],
      pocketAnchor: () => ({ tx: 10, ty: 0 }),
      stepToward: () => true, // harness teleports the actor onto the waypoint
    });

    harness.runtime.onActorDied();
    expect(harness.state()).toBe("RECOVERING");

    harness.runtime.tick(2_000); // respawn observed → plan_return → RETURNING_TO_WORK + route
    expect(harness.state()).toBe("RETURNING_TO_WORK");
    expect(harness.planPathCalls).toEqual([{ tx: 10, ty: 0 }]);

    harness.runtime.tick(2_000); // waypoint 0
    harness.runtime.tick(2_000); // waypoint 1
    expect(harness.stepTargets).toEqual([
      { tx: 5, ty: 0 },
      { tx: 10, ty: 0 },
    ]);

    harness.runtime.tick(2_000); // route consumed → arrived → WORKING
    expect(harness.state()).toBe("WORKING");
    expect(harness.runtime.isStopped).toBe(false);
  });

  test("an unroutable return (planPath null) stops stuck → wait for owner", () => {
    const harness = createPlusHarness({
      rules: NO_POTION_RULES,
      hpFraction: () => 1,
      mobs: () => [],
      planPath: () => null,
      pocketAnchor: () => ({ tx: 10, ty: 0 }),
    });

    harness.runtime.onActorDied();
    harness.runtime.tick(2_000); // plan_return → anchor ok, route null → stop("stuck")

    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(harness.stoppedMessage()).toMatchObject({ reason: "stuck" });
  });

  test("a missing pocket anchor stops stuck → wait for owner", () => {
    const harness = createPlusHarness({
      rules: NO_POTION_RULES,
      hpFraction: () => 1,
      mobs: () => [],
      planPath: () => [{ tx: 5, ty: 0 }],
      pocketAnchor: () => null,
    });

    harness.runtime.onActorDied();
    harness.runtime.tick(2_000); // plan_return → anchor null → stop("stuck")

    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(harness.stoppedMessage()).toMatchObject({ reason: "stuck" });
    expect(harness.planPathCalls).toHaveLength(0); // never reached routing
  });

  test("the per-session death cap settles a second death as death", () => {
    const harness = createPlusHarness({
      config: makeConfig({}, { maxDeathRecoveriesPerSession: 1 }),
      rules: NO_POTION_RULES,
      hpFraction: () => 1,
      mobs: () => [],
    });

    harness.runtime.onActorDied(); // 1st: under cap → RECOVERING
    expect(harness.state()).toBe("RECOVERING");
    expect(harness.runtime.isStopped).toBe(false);

    harness.runtime.onActorDied(); // 2nd: cap reached → stop("death")
    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.stoppedMessage()).toMatchObject({ reason: "death" });
  });
});

describe("Plus recovery runtime — takeover, tier recheck, fallback", () => {
  test("manual takeover mid-drink fences all commands; the lease drains, then finalizeStop runs", async () => {
    let resolvePotion!: (outcome: BotPotionOutcome) => void;
    const pending = new Promise<BotPotionOutcome>((resolve) => {
      resolvePotion = resolve;
    });
    const harness = createPlusHarness({
      rules: POTION_RULES,
      hpFraction: () => 0.4,
      usePotion: () => pending,
      mobs: () => [],
    });

    harness.runtime.tick(2_000); // use_potion → RECOVERING, drink pending
    expect(harness.state()).toBe("RECOVERING");

    const paused = harness.runtime.takeover("cp-1", harness.now());
    expect(paused).not.toBeNull();
    expect(harness.state()).toBe("PAUSED");
    expect(harness.stoppedCount()).toBe(0); // finalizeStop deferred while the potion lease is held

    resolvePotion(HEALED_POTION);
    await flush();

    expect(harness.stoppedCount()).toBe(1); // lease drained → finalizeStop
    expect(harness.usePotionCalls).toHaveLength(1); // no second drink after PAUSED
    expect(harness.attackTargets).toHaveLength(0);
    expect(harness.stoppedMessage()).toMatchObject({
      reason: "manual",
      continuity: { state: "PAUSED", interruptedState: "RECOVERING" },
    });
  });

  test("a mid-run downgrade to Free stops the run expired_readonly → wait for owner", async () => {
    const harness = createPlusHarness({
      config: makeConfig({}, { tierRecheckIntervalMs: 1_000 }),
      rules: NO_POTION_RULES,
      resolveTier: async () => "free",
      mobs: () => [],
    });

    harness.runtime.tick(2_000); // past the recheck interval → recheckTier fires
    await flush();

    expect(harness.resolveTierCalls()).toBe(1);
    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(harness.stoppedMessage()).toMatchObject({ reason: "expired_readonly" });
  });

  test("a flaky tier recheck (DB error) keeps the run alive and warns once", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const harness = createPlusHarness({
        config: makeConfig({}, { tierRecheckIntervalMs: 1_000 }),
        rules: NO_POTION_RULES,
        resolveTier: async () => {
          throw new Error("db down");
        },
        mobs: () => [],
      });

      harness.runtime.tick(2_000);
      await flush();

      expect(harness.runtime.isStopped).toBe(false); // kept last tier
      expect(warnSpy).toHaveBeenCalledTimes(1);

      harness.runtime.tick(2_000); // still running
      expect(harness.runtime.isStopped).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("a dry pocket hands off to a live one, and the assigned pocket wins back when it regains mobs", async () => {
    let assignedHasMobs = false;
    const harness = createPlusHarness({
      config: makeConfig(
        { botAllowedPockets: { map1: ["A", "B", "C"] } },
        { pocketFallbackIdleDecisions: 2, preferAssignedPocket: true },
      ),
      rules: NO_POTION_RULES,
      pocketId: "A",
      hpFraction: () => 1,
      mobs: () => [
        slime("b1", "B"),
        ...(assignedHasMobs ? [slime("a1", "A")] : []),
      ],
      pocketAnchor: (p) => (p === "A" ? { tx: 0, ty: 0 } : p === "B" ? { tx: 10, ty: 0 } : { tx: 20, ty: 0 }),
      pocketExists: () => true,
    });

    harness.runtime.tick(2_000); // idle 1 on dry A
    harness.runtime.tick(2_000); // idle 2 on dry A
    harness.runtime.tick(2_000); // idle ≥ threshold → fallback to B (activePocketId = B)
    harness.runtime.tick(2_000); // baseline farms B → status pocketId "B"
    await flush();
    expect(harness.statusPocketIds().at(-1)).toBe("B");

    assignedHasMobs = true;
    harness.runtime.tick(2_000); // assigned regained mobs → immediate swap back to A
    harness.runtime.tick(2_000); // baseline farms A → status pocketId "A"
    expect(harness.statusPocketIds().at(-1)).toBe("A");
  });
});

describe("Free tier — auto-potion (D-073), still no death recovery / pocket fallback / tier recheck", () => {
  // D-073 (2026-07): Free gained auto-potion — the SAME drink path as paid (a convenience, never combat power).
  // It STILL has no death recovery, no pocket fallback, and never rechecks tier (tier boundary D-063/D-067).

  test("Free with a potion rule drinks at/below the threshold, heals in place, and resumes (D-073)", async () => {
    let hp = 0.4;
    const harness = createPlusHarness({
      tier: "free",
      rules: POTION_RULES,
      hpFraction: () => hp,
      usePotion: async () => HEALED_POTION,
      mobs: () => [],
    });

    harness.runtime.tick(2_000); // hp ≤ threshold + phase none → use_potion (Free now heals, D-073)
    expect(harness.state()).toBe("RECOVERING");
    expect(harness.usePotionCalls).toEqual([["actor", "con_small_potion"]]);

    await flush(); // healed → back to WORKING
    expect(harness.state()).toBe("WORKING");
    hp = 1;
    expect(harness.runtime.isStopped).toBe(false);
    expect(harness.resolveTierCalls()).toBe(0); // Free never rechecks tier
    expect(harness.planPathCalls).toHaveLength(0); // no death-recovery routing
    expect(harness.pocketAnchorCalls).toHaveLength(0); // no pocket fallback
  });

  test("Free with NO potion rule floor-stops low_hp with zero potion/route/anchor/tier host calls (pre-D-073 baseline)", () => {
    const harness = createPlusHarness({
      tier: "free",
      rules: NO_POTION_RULES,
      hpFraction: () => 0.1,
      mobs: () => [],
    });

    harness.runtime.tick(2_000);

    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(harness.stoppedMessage()).toMatchObject({ reason: "low_hp" });
    expect(harness.usePotionCalls).toHaveLength(0); // no rule → never drinks
    expect(harness.planPathCalls).toHaveLength(0);
    expect(harness.pocketAnchorCalls).toHaveLength(0);
    expect(harness.resolveTierCalls()).toBe(0);
  });

  test("Free death stops immediately — no death recovery (D-063/D-067)", () => {
    const death = createPlusHarness({ tier: "free", rules: POTION_RULES, hpFraction: () => 1, mobs: () => [] });
    death.runtime.onActorDied();
    expect(death.runtime.isStopped).toBe(true);
    expect(death.stoppedMessage()).toMatchObject({ reason: "death" });
  });
});

// ── M1 Plus single-goal + completion action ─────────────────────────────────────────────────────────────────
// A paid single-pocket run may carry rules.goal (kills/gold/exp/durationMs). When the whole-run session counters
// reach the target, the completion action fires once: safe_stop / notify_continue / town_stop / town_continue.

const KILL_OUTCOME: BotAttackOutcome = { killed: 1, gold: 5, exp: 3, loot: [], bagOverflowed: false, overflow: [], leveledUp: false };

function goalRules(over: Partial<BotRulesV1>): BotRulesV1 {
  return { skillSlots: [0], potionThresholdPct: null, lootAll: true, ...over };
}

const lastStatus = (msgs: { type: string; message: unknown }[]): BotStatusMessage | undefined =>
  [...msgs].reverse().find((m) => m.type === MSG_BOT_STATUS)?.message as BotStatusMessage | undefined;

describe("M1 Plus single-goal — completion actions (in-place)", () => {
  test("safe_stop: reaching the kill target completes (goal_complete → COMPLETED)", async () => {
    const h = createPlusHarness({
      tier: "plus",
      rules: goalRules({ goal: { type: "kills", target: 1 }, completionAction: "safe_stop" }),
      mobs: () => [slime("m1", "A")],
      attack: async () => KILL_OUTCOME,
    });
    h.runtime.tick(2_000); // farm → attack dispatched
    await flush(); // killCount → 1
    expect(h.runtime.isStopped).toBe(false);

    h.runtime.tick(2_000); // goal met → safe_stop
    expect(h.runtime.isStopped).toBe(true);
    expect(h.state()).toBe("COMPLETED");
    expect(h.stoppedMessage()).toMatchObject({ reason: "goal_complete", continuity: { state: "COMPLETED" } });
  });

  test("notify_continue: fires ONE alert (kind goal) then keeps farming", async () => {
    const h = createPlusHarness({
      tier: "plus",
      rules: goalRules({ goal: { type: "kills", target: 1 }, completionAction: "notify_continue" }),
      mobs: () => [slime("m1", "A")],
      attack: async () => KILL_OUTCOME,
    });
    for (let i = 0; i < 3; i++) {
      h.runtime.tick(2_000);
      await flush();
    }
    const alerts = h.messages.filter((m) => m.type === MSG_BOT_ALERT).map((m) => m.message as BotAlertMessage);
    expect(alerts).toHaveLength(1); // fenced by goalReached — never a second alert
    expect(alerts[0]).toMatchObject({ kind: "goal" });
    expect(h.runtime.isStopped).toBe(false); // farmed on past the goal
  });

  test("duration goal (fake clock): elapsed reaching the target completes", () => {
    const h = createPlusHarness({
      tier: "plus",
      rules: goalRules({ goal: { type: "durationMs", target: 3_000 }, completionAction: "safe_stop" }),
      mobs: () => [],
    });
    h.runtime.tick(2_000); // elapsed 0 → not met
    expect(h.runtime.isStopped).toBe(false);

    h.advanceClock(4_000); // elapsed 4000 ≥ 3000
    h.runtime.tick(2_000); // goal met → safe_stop
    expect(h.runtime.isStopped).toBe(true);
    expect(h.stoppedMessage()).toMatchObject({ reason: "goal_complete" });
  });

  test("live goal progress rides every status push (type/target/done = whole-run counter)", async () => {
    const h = createPlusHarness({
      tier: "plus",
      rules: goalRules({ goal: { type: "kills", target: 100 }, completionAction: "safe_stop" }),
      mobs: () => [slime("m1", "A")],
      attack: async () => KILL_OUTCOME,
    });
    for (let i = 0; i < 3; i++) {
      h.runtime.tick(2_000);
      await flush();
    }
    const s = lastStatus(h.messages);
    expect(s?.goal).toMatchObject({ type: "kills", target: 100 });
    expect(s?.goal?.done).toBe(s?.killCount); // done = the same live counter carried in the push
    expect(s!.killCount).toBeGreaterThanOrEqual(1);
  });
});

// ── M1 warp town trip completion actions + live stats ────────────────────────────────────────────────────────
// town_stop parks in the city-hub and completes; town_continue services then resumes farming. Driven over the real
// FakeWorld warp handoff (createWarpHarness).

const OVERFLOW_OUTCOME: BotAttackOutcome = { killed: 1, gold: 0, exp: 0, loot: [], bagOverflowed: true, overflow: [], leveledUp: false };
const CLEAN_OUTCOME: BotAttackOutcome = { killed: 1, gold: 0, exp: 0, loot: [], bagOverflowed: false, overflow: [], leveledUp: false };
const FARM_MOB: AgentMob = { id: "m1", mobType: "slime", tx: 0, ty: 0, hp: 10, pocketId: "A" };

interface WarpSceneOpts {
  gold?: number;
  bag?: BagSeed[];
  rules?: BotRulesV1;
  attack?: (target: Vec2) => Promise<BotAttackOutcome>;
  townEnabledTiers?: readonly BotTier[];
  withTownHost?: boolean;
}

function warpScene(opts: WarpSceneOpts = {}) {
  const world = new FakeWorld({ actorId: "actor:real", gold: opts.gold ?? 20, buyPrice: 18, bag: opts.bag ?? [] });
  const farmHost = world.addHost({
    roomId: "room-farm",
    mapId: "map1",
    mobs: () => [FARM_MOB],
    attack: opts.attack ?? (async () => KILL_OUTCOME),
  });
  farmHost.players.add("actor:real");
  if (opts.withTownHost ?? true) world.addHost({ roomId: "room-town", mapId: "city-hub" });
  const config = opts.townEnabledTiers ? warpConfig({ enabledTiers: opts.townEnabledTiers }) : warpConfig();
  const harness = createWarpHarness({ world, farmHost, tier: "plus", config, rules: opts.rules });
  return { world, farmHost, harness };
}

describe("M1 Plus single-goal — town_stop / town_continue (warp)", () => {
  test("town_stop: services run, then the actor parks in town and completes", async () => {
    const { world, harness } = warpScene({
      rules: goalRules({ goal: { type: "kills", target: 1 }, completionAction: "town_stop" }),
    });
    for (let i = 0; i < 40 && !harness.runtime.isStopped; i++) await harness.tickAndSettle();

    expect(harness.runtime.isStopped).toBe(true);
    expect(world.stoppedMessage()?.reason).toBe("goal_complete");
    expect(harness.state()).toBe("COMPLETED");
    expect(world.acquireCalls).toContain("city-hub"); // the service trip actually ran
    expect(world.hostsContaining("actor:real")[0]?.mapId).toBe("city-hub"); // parked in town (no return leg)
  });

  test("town_stop with a refused begin completes in place (no trip)", async () => {
    const { world, harness } = warpScene({
      townEnabledTiers: ["pro"], // plus not enabled → beginTownTrip refuses
      withTownHost: false,
      rules: goalRules({ goal: { type: "kills", target: 1 }, completionAction: "town_stop" }),
    });
    for (let i = 0; i < 5 && !harness.runtime.isStopped; i++) await harness.tickAndSettle();

    expect(harness.runtime.isStopped).toBe(true);
    expect(world.stoppedMessage()?.reason).toBe("goal_complete");
    expect(world.acquireCalls).toHaveLength(0); // begin refused → no trip
    expect(world.hostsContaining("actor:real")[0]?.mapId).toBe("map1"); // never left the farm
  });

  test("town_continue: services run, then farming resumes (no stop; goal fenced)", async () => {
    const { world, harness } = warpScene({
      gold: 200,
      rules: goalRules({ goal: { type: "kills", target: 1 }, completionAction: "town_continue" }),
    });
    for (let i = 0; i < 40 && !harness.runtime.isStopped; i++) {
      await harness.tickAndSettle();
      if (harness.state() === "WORKING" && world.acquireCalls.includes("city-hub")) break;
    }
    expect(harness.runtime.isStopped).toBe(false);
    expect(world.acquireCalls).toContain("city-hub"); // trip ran
    expect(harness.state()).toBe("WORKING"); // resumed farming after returning home
    expect(world.hostsContaining("actor:real")[0]?.mapId).toBe("map1"); // returned to the farm
  });

  test("town_continue with a refused begin marks reached and keeps farming", async () => {
    const { world, harness } = warpScene({
      townEnabledTiers: ["pro"],
      withTownHost: false,
      rules: goalRules({ goal: { type: "kills", target: 1 }, completionAction: "town_continue" }),
    });
    for (let i = 0; i < 5; i++) await harness.tickAndSettle();

    expect(harness.runtime.isStopped).toBe(false); // never stopped — farmed on
    expect(world.acquireCalls).toHaveLength(0); // begin refused → no trip
  });
});

describe("M1 live stats", () => {
  test("potionsUsed increments on a successful drink", async () => {
    let hp = 0.4;
    const h = createPlusHarness({
      tier: "plus",
      rules: POTION_RULES,
      hpFraction: () => hp,
      usePotion: async () => HEALED_POTION,
      mobs: () => [],
    });
    h.runtime.tick(2_000); // use_potion → RECOVERING
    await flush(); // healed → potionsUsed → 1, WORKING
    hp = 1;
    h.runtime.tick(2_000); // farm tick → status push carries the stats
    expect(lastStatus(h.messages)?.stats?.potionsUsed).toBe(1);
  });

  test("a full round-trip records townTrips=1 with msWalking + msInTown split into buckets", async () => {
    let overflowed = false;
    const { world, harness } = warpScene({
      gold: 200,
      bag: [
        { instanceId: "s1", itemId: "mat_a", rarity: "common", sellPrice: 30, deliverable: true },
        { instanceId: "s2", itemId: "mat_b", rarity: "common", sellPrice: 30, deliverable: true },
      ],
      attack: async () => {
        if (!overflowed) {
          overflowed = true;
          return OVERFLOW_OUTCOME; // first kill overflows → bag-full town trip
        }
        return CLEAN_OUTCOME; // afterwards clean → no re-trigger
      },
    });
    for (let i = 0; i < 60 && !harness.runtime.isStopped; i++) {
      await harness.tickAndSettle();
      if (harness.state() === "WORKING" && world.acquireCalls.includes("city-hub")) {
        await harness.tickAndSettle(); // one more farm tick pushes a status with the final stats
        await harness.tickAndSettle();
        break;
      }
    }
    const s = lastStatus(world.messages);
    expect(s?.stats?.townTrips).toBe(1);
    expect(s?.stats?.msWalking).toBeGreaterThan(0); // RETURNING_TO_TOWN + RETURNING_TO_WORK ticks
    expect(s?.stats?.msInTown).toBeGreaterThan(0); // SELLING / DEPOSITING / RESTOCKING ticks
  });
});

// ── M1 start re-gate: SELECTED_TYPES re-validated against the live pocket ─────────────────────────────────────
// A profile can be saved when its pocket held the selected type, then the map/pocket data changes. `start`
// re-checks selectedMobTypes against the LIVE pocket (resolveTargetCtx) and rejects mob_type_not_in_pocket.

function regateManager(profile: BotProfileRow) {
  const profileRepo: ProfileRepo = {
    listByAccount: async (a) => (a === profile.accountId ? [profile] : []),
    getById: async (a, id) => (a === profile.accountId && id === profile.id ? profile : null),
    insert: async () => undefined,
    update: async () => undefined,
    remove: async () => undefined,
  };
  const paidRow: BotTierStateRow = { accountId: profile.accountId, tier: "plus", passExpiresAt: 10_000_000_000, updatedAt: 0 };
  const tierRepo: TierRepo = { get: async () => paidRow, upsert: async () => undefined };
  const sessionRepo: SessionRepo = {
    insert: async () => undefined,
    patch: async () => undefined,
    listByAccount: async () => [],
    getById: async () => null,
    markOpenAsRestart: async () => 0,
  };
  const noTx: BotTownTxResult = { ok: false, reason: "unavailable" };
  const host: BotHost = {
    mapId: "map1",
    roomId: "room-1",
    partyId: "",
    botClaimAuthority: () => "actor:real",
    botReleaseAuthority: () => undefined,
    botMobs: () => [],
    botPos: () => ({ tx: 0, ty: 0 }),
    botHpFraction: () => 1,
    botAttackRange: () => 1,
    botBaseCooldownSeconds: () => 1,
    botStepToward: () => false,
    botAttack: async () => CLEAN_OUTCOME,
    botOwnerSend: () => true,
    isForbiddenTargetType: () => false,
    pocketExists: () => true,
    botUsePotion: async () => ({ status: "unavailable", hpFraction: 1, cooldownUntilMs: 0 }),
    botPlanPath: () => null,
    botPocketAnchor: () => null,
    botReserveWarpSeat: () => true,
    botReleaseWarpSeat: () => undefined,
    botExportActor: () => null,
    botAttachWarpedActor: () => false,
    botPersistNow: () => undefined,
    botBagItems: async () => [],
    botTownSell: async () => noTx,
    botTownDeposit: async () => noTx,
    botTownBuy: async () => noTx,
    botGoldBalance: async () => null,
    botSafeCampAnchor: () => ({ tx: 0, ty: 0 }),
  };
  const deps: BotManagerDeps = {
    config: DEFAULT_BOT_CONFIG,
    tierRepo,
    profileRepo,
    sessionRepo,
    rarityOf: () => undefined,
    dbAvailable: () => true,
    now: () => 1_000,
  };
  return { manager: new BotManager(deps), host };
}

function selectedTypesProfile(selectedMobTypes: string[]): BotProfileRow {
  return {
    id: "p-regate",
    accountId: "acc",
    name: "selected",
    mapId: "map1",
    pocketId: "map1-slime-center", // live mobType = "slime"
    rules: { skillSlots: [0], potionThresholdPct: null, lootAll: true, targetMode: "SELECTED_TYPES", selectedMobTypes },
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("M1 start re-gate — SELECTED_TYPES vs live pocket", () => {
  test("a selected type absent from the assigned pocket rejects mob_type_not_in_pocket", async () => {
    // "boar" is a real normal mob, but it lives in map1-boar-southwest, not the slime pocket.
    const { manager, host } = regateManager(selectedTypesProfile(["boar"]));
    const messages: { type: string; message: unknown }[] = [];
    await manager.onStart(host, "controller-1", "acc", "character-a", (type, message) => messages.push({ type, message }), {
      profileId: "p-regate",
    });
    const result = messages.find((m) => m.type === MSG_BOT_OP_RESULT)?.message as BotOpResultMessage | undefined;
    expect(result).toMatchObject({ op: "start", ok: false, reason: "mob_type_not_in_pocket" });
    expect(manager.activeActorForAccount("acc")).toBeNull();
  });

  test("a selected type present in the assigned pocket starts", async () => {
    const { manager, host } = regateManager(selectedTypesProfile(["slime"]));
    const messages: { type: string; message: unknown }[] = [];
    await manager.onStart(host, "controller-1", "acc", "character-a", (type, message) => messages.push({ type, message }), {
      profileId: "p-regate",
    });
    const rejects = messages
      .filter((m) => m.type === MSG_BOT_OP_RESULT)
      .map((m) => m.message as BotOpResultMessage)
      .filter((r) => r.ok === false);
    expect(rejects).toHaveLength(0);
    expect(manager.activeActorForAccount("acc")).not.toBeNull();
  });
});
