import { describe, expect, test, vi } from "vitest";
import {
  BotRuntime,
  type BotAttackOutcome,
  type BotHost,
  type BotPotionOutcome,
} from "../server/bot/runtime";
import type { SessionRepo } from "../server/bot/store";
import type { AgentMob, Vec2 } from "../server/bot/agent";
import type { BotRulesV1 } from "../server/bot/types";
import { DEFAULT_BOT_CONFIG, type BotConfig, type BotTier } from "../server/config/bot";
import {
  MSG_BOT_STATUS,
  MSG_BOT_STOPPED,
  type BotStatusMessage,
  type BotStoppedMessage,
} from "../src/shared/net-protocol";

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

describe("Free tier gate — byte-identical to PR4 (no recovery)", () => {
  test("low HP stops low_hp with zero potion/route/anchor/tier host calls, and death stops immediately", () => {
    const harness = createPlusHarness({
      tier: "free",
      rules: POTION_RULES, // a potion rule is present but Free must never act on it
      hpFraction: () => 0.1,
      mobs: () => [],
    });

    harness.runtime.tick(2_000);

    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(harness.stoppedMessage()).toMatchObject({ reason: "low_hp" });
    expect(harness.usePotionCalls).toHaveLength(0);
    expect(harness.planPathCalls).toHaveLength(0);
    expect(harness.pocketAnchorCalls).toHaveLength(0);
    expect(harness.resolveTierCalls()).toBe(0);

    const death = createPlusHarness({ tier: "free", rules: POTION_RULES, hpFraction: () => 1, mobs: () => [] });
    death.runtime.onActorDied();
    expect(death.runtime.isStopped).toBe(true);
    expect(death.stoppedMessage()).toMatchObject({ reason: "death" });
  });
});
