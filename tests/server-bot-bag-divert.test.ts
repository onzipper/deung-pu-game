import { describe, expect, test } from "vitest";
import { createWarpHarness, FakeWorld, warpConfig, type BagSeed } from "./helpers/warp-world";
import {
  BotManager,
  freeBagSlots,
  type BotManagerDeps,
} from "../server/bot/manager";
import type { ProfileRepo } from "../server/bot/profiles";
import type { SessionRepo, TierRepo } from "../server/bot/store";
import type { BotProfileRow, BotTierStateRow } from "../server/bot/types";
import type {
  BotAttackOutcome,
  BotBagItemView,
  BotHost,
  BotPotionOutcome,
  BotTownTxResult,
} from "../server/bot/runtime";
import type { AgentMob, Vec2 } from "../server/bot/agent";
import { DEFAULT_BOT_CONFIG, type BotTier } from "../server/config/bot";
import { DEFAULT_INVENTORY_CAPACITY } from "../src/server/inventory/item-catalog";

// D-069/D-070 — bag-full divert + proactive preflight. A paid bag overflow diverts to a town trip instead of the
// Free safe-stop; Free stays byte-identical (stop "inventory_full"). The proactive preflight opens a run whose bag
// is already full with a town trip before it farms a single mob. Drives the REAL BotRuntime over the FakeWorld.

const ACTOR = "actor:real";
const MOB_A: AgentMob = { id: "m1", mobType: "slime", tx: 0, ty: 0, hp: 10, pocketId: "A" };

function overflowOutcome(): BotAttackOutcome {
  return { killed: 1, gold: 0, exp: 0, loot: [], bagOverflowed: true, overflow: [], leveledUp: false };
}
function cleanOutcome(): BotAttackOutcome {
  return { killed: 1, gold: 0, exp: 0, loot: [], bagOverflowed: false, overflow: [], leveledUp: false };
}

/** Farm bag: 3 sellable materials, 1 rare (deposit-only), 1 equipped (ignored). Mirrors the warp-handoff bag. */
function tripBag(): BagSeed[] {
  return [
    { instanceId: "s1", itemId: "mat_a", rarity: "common", sellPrice: 30, deliverable: true },
    { instanceId: "s2", itemId: "mat_b", rarity: "common", sellPrice: 30, deliverable: true },
    { instanceId: "s3", itemId: "mat_c", rarity: "uncommon", sellPrice: 30, deliverable: true },
    { instanceId: "s4", itemId: "mat_rare", rarity: "rare", sellPrice: null, deliverable: true },
    { instanceId: "eq1", itemId: "eq_weapon", rarity: "rare", sellPrice: 99, deliverable: true, equipped: true },
  ];
}

interface DivertSceneOptions {
  tier?: BotTier;
  gold?: number;
  attack?: (target: Vec2) => Promise<BotAttackOutcome>;
  mobs?: () => AgentMob[];
  initialTownTrip?: boolean;
  townEnabledTiers?: readonly BotTier[];
  resolveTier?: () => Promise<BotTier>;
}

function divertScene(opts: DivertSceneOptions = {}) {
  const world = new FakeWorld({ actorId: ACTOR, gold: opts.gold ?? 20, buyPrice: 18, bag: tripBag() });
  const farmHost = world.addHost({
    roomId: "room-farm",
    mapId: "map1",
    mobs: opts.mobs ?? (() => [MOB_A]),
    attack: opts.attack ?? (async () => overflowOutcome()),
  });
  farmHost.players.add(ACTOR);
  const townHost = world.addHost({ roomId: "room-town", mapId: "city-hub" });
  const config = opts.townEnabledTiers
    ? warpConfig({ enabledTiers: opts.townEnabledTiers })
    : warpConfig();
  const harness = createWarpHarness({
    world,
    farmHost,
    tier: opts.tier ?? "plus",
    config,
    initialTownTrip: opts.initialTownTrip,
    resolveTier: opts.resolveTier,
  });
  return { world, farmHost, townHost, harness };
}

async function driveToWorking(harness: ReturnType<typeof createWarpHarness>, maxTicks = 60) {
  for (let i = 0; i < maxTicks; i++) {
    await harness.tickAndSettle();
    if (harness.runtime.isStopped) break;
    if (harness.state() === "WORKING") break;
  }
}

// ── slot math ───────────────────────────────────────────────────────────────────────────────────────────────

describe("freeBagSlots — proactive preflight slot math", () => {
  const item = (over: Partial<BotBagItemView> = {}): BotBagItemView => ({
    instanceId: "i",
    itemId: "x",
    quantity: 1,
    version: 1,
    rarity: "common",
    equipped: false,
    sellPrice: null,
    deliverable: false,
    ...over,
  });

  test("an empty bag is entirely free", () => {
    expect(freeBagSlots([], DEFAULT_INVENTORY_CAPACITY)).toBe(DEFAULT_INVENTORY_CAPACITY);
  });

  test("only non-equipped instances occupy a slot (equipped gear ignored — matches the trip's route-home math)", () => {
    const bag = [item(), item(), item({ equipped: true }), item({ equipped: true })];
    expect(freeBagSlots(bag, 40)).toBe(38);
  });

  test("the < resumeMinFreeSlots boundary decides a preflight", () => {
    const four = Array.from({ length: 4 }, () => item());
    expect(freeBagSlots(four, 8)).toBe(4); // free 4 < 5 → preflight
    expect(freeBagSlots(four.slice(0, 3), 8)).toBe(5); // free 5, NOT < 5 → no preflight
  });
});

// ── bag-full divert ──────────────────────────────────────────────────────────────────────────────────────────

describe("bag-full divert (D-069/D-070)", () => {
  test("(a) paid overflow past cooldown diverts to a full town trip (RETURNING_TO_TOWN entered, no stop)", async () => {
    const { world, harness } = divertScene({ tier: "plus" });
    expect(harness.state()).toBe("WORKING");

    await harness.tickAndSettle(); // farm → attack → overflow → beginTownTrip("bag_full")
    expect(harness.state()).toBe("RETURNING_TO_TOWN");
    expect(harness.runtime.isStopped).toBe(false);
    expect(world.actorCount()).toBe(1); // still on the farm — no transfer in the attack continuation

    await driveToWorking(harness);
    expect(harness.state()).toBe("WORKING");
    expect(harness.runtime.isStopped).toBe(false);
    expect(world.actorCount()).toBe(1);
    expect(world.acquireCalls).toContain("city-hub"); // the trip actually ran
  });

  test("(b) paid overflow within cooldown stops inventory_full — no fresh acquire (begin refused before warp)", async () => {
    const { world, harness } = divertScene({ tier: "plus" });

    await driveToWorking(harness); // first overflow → full trip → home; markTripComplete arms the cooldown
    expect(harness.state()).toBe("WORKING");
    expect(harness.runtime.isStopped).toBe(false);
    const acquiresAfterTrip = world.acquireCalls.length;

    // The clock never advanced past cooldownMs, so the next overflow is refused and settles a safe stop.
    for (let i = 0; i < 12 && !harness.runtime.isStopped; i++) await harness.tickAndSettle();

    expect(harness.runtime.isStopped).toBe(true);
    expect(world.stoppedMessage()?.reason).toBe("inventory_full");
    expect(world.acquireCalls.length).toBe(acquiresAfterTrip); // refused before any acquire → no warp attempt
  });

  test("(c) Free overflow diverts to a WALK town trip (D-071), not an immediate stop", async () => {
    // D-071 (2026-07-16): Free walk-to-town — a Free bag overflow now diverts to a WALK trip (RETURNING_TO_TOWN)
    // instead of stopping inventory_full. The town host is acquired only after the actor walks to the portal, so
    // one tick after begin nothing is acquired yet and Free never rechecks tier (its tick skips the paid recheck).
    // The full walk cycle (walk → transfer → sell/deposit/buy → walk home → farm) lives in
    // server-bot-free-town-walk.test.ts; here we lock only the divert decision.
    let tierCalls = 0;
    const { world, farmHost, townHost, harness } = divertScene({
      tier: "free",
      resolveTier: async () => {
        tierCalls += 1;
        return "free";
      },
    });

    await harness.tickAndSettle(); // Free farm → attack → overflow → beginTownTrip("bag_full") walk divert
    expect(harness.runtime.isStopped).toBe(false);
    expect(harness.state()).toBe("RETURNING_TO_TOWN");

    expect(world.acquireCalls).toHaveLength(0); // walk hasn't reached the portal yet → no transfer acquire
    expect(tierCalls).toBe(0); // Free never rechecks tier
    for (const h of [farmHost, townHost]) {
      expect(h.calls.sell).toHaveLength(0);
      expect(h.calls.deposit).toHaveLength(0);
      expect(h.calls.buy).toHaveLength(0);
    }
  });

  test("(f) an overflow while the attack lease is held: the town transfer waits until the lease drains", async () => {
    let resolveAttack!: (o: BotAttackOutcome) => void;
    const pending = new Promise<BotAttackOutcome>((r) => {
      resolveAttack = r;
    });
    const { world, farmHost, townHost, harness } = divertScene({ tier: "plus", attack: () => pending });

    await harness.tickAndSettle(); // dispatches the attack; the lease is held while botAttack is in flight
    expect(harness.state()).toBe("COMBAT");
    expect(farmHost.calls.attack).toBe(1);
    expect(townHost.calls.reserve).toBe(0);

    await harness.tickAndSettle(); // no second attack (lease held), no trip
    expect(farmHost.calls.attack).toBe(1);
    expect(harness.state()).toBe("COMBAT");

    resolveAttack(overflowOutcome()); // the divert runs in the continuation; the lease releases right after
    await harness.flush();
    expect(harness.state()).toBe("RETURNING_TO_TOWN");
    expect(townHost.calls.reserve).toBe(0); // transfer deferred — nothing warped in the attack microtask
    expect(farmHost.calls.export).toBe(0);

    await harness.tickAndSettle(); // the lease has drained → the first warp export now runs
    expect(townHost.calls.reserve).toBeGreaterThanOrEqual(1);
    expect(world.actorCount()).toBe(1);
  });
});

// ── proactive preflight ──────────────────────────────────────────────────────────────────────────────────────

describe("proactive preflight (D-069/D-070)", () => {
  test("(d) initialTownTrip opens a town trip on the first tick before any farm command", async () => {
    const { farmHost, harness } = divertScene({ tier: "plus", initialTownTrip: true, attack: async () => cleanOutcome() });
    expect(harness.state()).toBe("WORKING");

    await harness.tickAndSettle(); // first paid tick → preflight → beginTownTrip("preflight")
    expect(["RETURNING_TO_TOWN", "SELLING"]).toContain(harness.state());
    expect(farmHost.calls.attack).toBe(0); // never farmed a mob
    expect(farmHost.calls.step).toBe(0); // never stepped toward one
    expect(harness.runtime.isStopped).toBe(false);
  });

  test("(e) a refused preflight clears the flag and farms normally (no trip, no acquire)", async () => {
    const { world, farmHost, harness } = divertScene({
      tier: "plus",
      initialTownTrip: true,
      townEnabledTiers: ["pro"], // plus not enabled → beginTownTrip refuses (an equivalent begin refusal to cooldown)
      attack: async () => cleanOutcome(),
    });

    await harness.tickAndSettle(); // preflight refused → farm normally
    expect(harness.runtime.isStopped).toBe(false);
    expect(world.acquireCalls).toHaveLength(0); // no trip → no acquire
    expect(farmHost.calls.attack).toBeGreaterThanOrEqual(1); // farmed a mob
    expect(["WORKING", "COMBAT"]).toContain(harness.state());
  });
});

// ── manager preflight gating ─────────────────────────────────────────────────────────────────────────────────

const GATING_PROFILE: BotProfileRow = {
  id: "p1",
  accountId: "acc",
  name: "field plan",
  mapId: "map1",
  pocketId: "map1-slime-center",
  rules: { skillSlots: [0], potionThresholdPct: null, lootAll: true },
  createdAt: 1,
  updatedAt: 1,
};

function gatingHost(onBagItems: () => void): BotHost {
  const noTx: BotTownTxResult = { ok: false, reason: "unavailable" };
  const noPotion: BotPotionOutcome = { status: "unavailable", hpFraction: 1, cooldownUntilMs: 0 };
  return {
    mapId: "map1",
    roomId: "room-1",
    partyId: "",
    botClaimAuthority: () => "actor:real-existing",
    botReleaseAuthority: () => undefined,
    botMobs: () => [],
    botPos: () => ({ tx: 0, ty: 0 }),
    botHpFraction: () => 1,
    botAttackRange: () => 1,
    botBaseCooldownSeconds: () => 1,
    botStepToward: () => false,
    botAttack: async () => cleanOutcome(),
    botOwnerSend: () => true,
    isForbiddenTargetType: () => false,
    pocketExists: () => true,
    botUsePotion: async () => noPotion,
    botPlanPath: () => null,
    botPocketAnchor: () => null,
    botReserveWarpSeat: () => true,
    botReleaseWarpSeat: () => undefined,
    botExportActor: () => null,
    botAttachWarpedActor: () => false,
    botPersistNow: () => undefined,
    botBagItems: async () => {
      onBagItems();
      return [];
    },
    botTownSell: async () => noTx,
    botTownDeposit: async () => noTx,
    botTownBuy: async () => noTx,
    botGoldBalance: async () => null,
    botSafeCampAnchor: () => ({ tx: 0, ty: 0 }),
  };
}

function gatingManager(tierRow: BotTierStateRow | null) {
  let bagCalls = 0;
  const profileRepo: ProfileRepo = {
    listByAccount: async (a) => (a === "acc" ? [GATING_PROFILE] : []),
    getById: async (a, id) => (a === "acc" && id === "p1" ? GATING_PROFILE : null),
    insert: async () => undefined,
    update: async () => undefined,
    remove: async () => undefined,
  };
  const tierRepo: TierRepo = { get: async () => tierRow, upsert: async () => undefined };
  const sessionRepo: SessionRepo = {
    insert: async () => undefined,
    patch: async () => undefined,
    listByAccount: async () => [],
    getById: async () => null,
    markOpenAsRestart: async () => 0,
  };
  const host = gatingHost(() => {
    bagCalls += 1;
  });
  const deps: BotManagerDeps = {
    config: DEFAULT_BOT_CONFIG,
    tierRepo,
    profileRepo,
    sessionRepo,
    rarityOf: () => undefined,
    dbAvailable: () => true,
    now: () => 1_000,
  };
  return { manager: new BotManager(deps), host, bagCalls: () => bagCalls };
}

describe("manager preflight gating (D-069/D-070)", () => {
  test("a Free start never reads the bag", async () => {
    const h = gatingManager(null); // no row → Free
    await h.manager.onStart(h.host, "controller-1", "acc", "character-a", () => undefined, { profileId: "p1" });
    expect(h.manager.activeActorForAccount("acc")).not.toBeNull();
    expect(h.bagCalls()).toBe(0);
  });

  test("a paid start reads the bag once (through botBagItems) for the preflight", async () => {
    const paidRow: BotTierStateRow = { accountId: "acc", tier: "plus", passExpiresAt: 10_000_000_000, updatedAt: 0 };
    const h = gatingManager(paidRow);
    await h.manager.onStart(h.host, "controller-1", "acc", "character-a", () => undefined, { profileId: "p1" });
    expect(h.manager.activeActorForAccount("acc")).not.toBeNull();
    expect(h.bagCalls()).toBe(1);
  });
});
