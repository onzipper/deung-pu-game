import { describe, expect, test } from "vitest";
import { createWarpHarness, FakeWorld, warpConfig, type BagSeed } from "./helpers/warp-world";
import type { BotAttackOutcome } from "../server/bot/runtime";
import type { Vec2 } from "../server/bot/agent";
import type { BotTier } from "../server/config/bot";

// D-071 (2026-07-16) — Free tier walk-to-town. A Free bag overflow diverts to a WALK town trip: the runtime walks
// the ONE real actor across the farm to its portal, transfers at the gate (landing at the town portal entry, NOT a
// warp anchor), walks to the shop, runs the SAME D-070 sell → deposit → restock cycle, walks to the town gate,
// transfers back, and resumes farming. The paid tiers still WARP (byte-identical to D-069) — the tier difference is
// speed, never capability. The whole cycle drives the REAL BotRuntime over a walk-capable FakeWorld. The invariant
// asserted after every tick: the single actor is materialized in exactly ONE host (Σ hosts containing it === 1).

const ACTOR = "actor:real";
// Portal geometry mirrors the real maps (map1 north-gate ↔ city-hub south-gate).
const FARM_START: Vec2 = { tx: 20, ty: 18 }; // a farm pocket tile — where the actor overflows.
const FARM_PORTAL: Vec2 = { tx: 20, ty: 1 }; // map1 north-gate approach tile.
const TOWN_LANDING: Vec2 = { tx: 16, ty: 27 }; // city-hub spawn from the north-gate exit.
const TOWN_CAMP: Vec2 = { tx: 16, ty: 20 }; // city-hub central plaza (service anchor).
const TOWN_PORTAL: Vec2 = { tx: 16, ty: 31 }; // city-hub south-gate approach tile.
const FARM_LANDING: Vec2 = { tx: 20, ty: 5 }; // map1 spawn from the south-gate exit.

function overflow(): BotAttackOutcome {
  return { killed: 1, gold: 0, exp: 0, loot: [], bagOverflowed: true, overflow: [], leveledUp: false };
}
function clean(): BotAttackOutcome {
  return { killed: 1, gold: 0, exp: 0, loot: [], bagOverflowed: false, overflow: [], leveledUp: false };
}

/** Standard farm bag: 3 sellable materials, 1 rare (deposit-only), 1 equipped (ignored). Mirrors the warp-handoff bag. */
function standardBag(): BagSeed[] {
  return [
    { instanceId: "s1", itemId: "mat_a", rarity: "common", sellPrice: 30, deliverable: true },
    { instanceId: "s2", itemId: "mat_b", rarity: "common", sellPrice: 30, deliverable: true },
    { instanceId: "s3", itemId: "mat_c", rarity: "uncommon", sellPrice: 30, deliverable: true },
    { instanceId: "s4", itemId: "mat_rare", rarity: "rare", sellPrice: null, deliverable: true },
    { instanceId: "eq1", itemId: "eq_weapon", rarity: "rare", sellPrice: 99, deliverable: true, equipped: true },
  ];
}

/** A bag that no service can free: `n` non-sellable, non-deliverable junk instances (drives the anti-loop guard). */
function fullJunkBag(n: number): BagSeed[] {
  return Array.from({ length: n }, (_, i) => ({
    instanceId: `junk-${i}`,
    itemId: "mat_junk",
    rarity: "common",
    sellPrice: null,
    deliverable: false,
  }));
}

interface WalkSceneOptions {
  tier?: BotTier;
  gold?: number;
  bag?: BagSeed[];
  farmBlocked?: boolean;
  stuckTickLimit?: number;
  cooldownMs?: number;
}

function walkScene(opts: WalkSceneOptions = {}) {
  const world = new FakeWorld({ actorId: ACTOR, gold: opts.gold ?? 20, buyPrice: 18, bag: opts.bag ?? standardBag() });
  let attacked = false;
  const farmHost = world.addHost({
    roomId: "room-farm",
    mapId: "map1",
    safeCamp: { tx: 20, ty: 6 },
    walk: { start: { ...FARM_START }, step: 6, blocked: opts.farmBlocked },
    exits: [{ targetMapId: "city-hub", approach: { ...FARM_PORTAL }, landing: { ...TOWN_LANDING } }],
    mobs: () => [{ id: "m1", mobType: "slime", tx: FARM_START.tx, ty: FARM_START.ty, hp: 10, pocketId: "A" }],
    attack: async () => {
      if (!attacked) {
        attacked = true;
        return overflow();
      }
      return clean();
    },
  });
  farmHost.players.add(ACTOR); // the actor starts materialized on the farm.
  const townHost = world.addHost({
    roomId: "room-town",
    mapId: "city-hub",
    safeCamp: { ...TOWN_CAMP },
    walk: { start: { ...TOWN_LANDING }, step: 6 },
    exits: [{ targetMapId: "map1", approach: { ...TOWN_PORTAL }, landing: { ...FARM_LANDING } }],
  });
  const config = {
    ...warpConfig(opts.cooldownMs != null ? { cooldownMs: opts.cooldownMs } : {}),
    ...(opts.stuckTickLimit ? { stuckTickLimit: opts.stuckTickLimit } : {}),
  };
  const harness = createWarpHarness({ world, farmHost, tier: opts.tier ?? "free", config });
  return { world, farmHost, townHost, harness };
}

function dedupe(states: string[]): string[] {
  return states.filter((s, i) => i === 0 || s !== states[i - 1]);
}

/** Drive ticks, recording per-tick state + actor count, until the trip completes and farming resumes (or a stop). */
async function driveTrip(
  harness: ReturnType<typeof createWarpHarness>,
  world: FakeWorld,
  maxTicks = 40,
) {
  const trail: { state: string; count: number }[] = [];
  let sawServices = false;
  for (let i = 0; i < maxTicks; i++) {
    await harness.tickAndSettle();
    const state = harness.state();
    trail.push({ state, count: world.actorCount() });
    if (harness.runtime.isStopped) break;
    if (state === "SELLING" || state === "DEPOSITING" || state === "RESTOCKING") sawServices = true;
    if (sawServices && state === "WORKING") break; // route_home advanced WORKING → the trip is done.
  }
  return trail;
}

describe("Free walk town trip — happy path (D-071)", () => {
  test("overflow → walk to town → sell/deposit/restock → walk home → resume, one host every tick", async () => {
    const { world, farmHost, townHost, harness } = walkScene();
    expect(harness.state()).toBe("WORKING");

    const trail = await driveTrip(harness, world);

    // Invariant: the single actor is materialized in exactly one host after every tick (walking + transfers).
    for (const step of trail) expect(step.count).toBe(1);

    // Continuity visited the fixed town cycle (RETURNING_TO_TOWN held across the whole outbound walk) and returned.
    expect(dedupe(trail.map((t) => t.state))).toEqual([
      "RETURNING_TO_TOWN",
      "SELLING",
      "DEPOSITING",
      "RESTOCKING",
      "RETURNING_TO_WORK",
      "WORKING",
    ]);
    expect(harness.runtime.isStopped).toBe(false);

    // The walk took several ticks before the transfer (proving it is a walk, not a warp).
    const firstTownTick = trail.findIndex((t) => t.state === "SELLING");
    expect(firstTownTick).toBeGreaterThan(3);

    // The town transactions hit the TOWN host with the deterministic idempotency keys (transfer rebind proof).
    expect(townHost.calls.sell).toEqual([
      "bot:run-warp:t0:sell:s1",
      "bot:run-warp:t0:sell:s2",
      "bot:run-warp:t0:sell:s3",
    ]);
    expect(townHost.calls.deposit).toEqual(["bot:run-warp:t0:deposit:s4"]);
    expect(townHost.calls.buy.length).toBeGreaterThan(0);
    expect(farmHost.calls.sell).toHaveLength(0); // the farm host never transacted (all routed through the town host)

    // Same D-070 economy outcome as the paid warp trip: bag freed, rare deposited, gold reserve held.
    expect(world.usedSlots()).toBe(1); // only the restocked potion stack among non-equipped slots
    expect(world.storage.map((r) => r.instanceId)).toEqual(["s4"]);
    expect(world.gold).toBe(56); // 20 +90 sells −54 (3×18) = 56 ≥ 50 reserve
  });
});

describe("Free walk town trip — no recovery (D-071)", () => {
  test("death mid-walk stops immediately (Free has no recovery) → WAITING_FOR_OWNER", async () => {
    const { world, harness } = walkScene();
    await harness.tickAndSettle(); // overflow → begin walk trip
    await harness.tickAndSettle(); // walk_out — walking toward the farm portal
    expect(harness.state()).toBe("RETURNING_TO_TOWN");

    harness.runtime.onActorDied();
    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(world.stoppedMessage()?.reason).toBe("death");
    expect(world.hostsContaining(ACTOR).map((h) => h.mapId)).toEqual(["map1"]); // died before the transfer
  });

  test("a blocked walk to the portal settles stuck → WAITING_FOR_OWNER (Free obstacle baseline)", async () => {
    const { world, harness } = walkScene({ farmBlocked: true, stuckTickLimit: 2 });

    for (let i = 0; i < 12 && !harness.runtime.isStopped; i++) await harness.tickAndSettle();

    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(world.stoppedMessage()?.reason).toBe("stuck");
    expect(world.acquireCalls).toHaveLength(0); // never reached the portal → never transferred
  });
});

describe("Free walk town trip — anti-loop safety (D-070/D-071)", () => {
  test("services free nothing → route_home stops inventory_full instead of re-triggering a trip", async () => {
    const { world, harness } = walkScene({ bag: fullJunkBag(36), gold: 0 });

    for (let i = 0; i < 40 && !harness.runtime.isStopped; i++) await harness.tickAndSettle();

    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(world.stoppedMessage()?.reason).toBe("inventory_full");
    expect(world.hostsContaining(ACTOR).map((h) => h.mapId)).toEqual(["map1"]); // the trip walked home before stopping
    expect(world.acquireCalls).toContain("city-hub"); // the trip actually ran (walked to town) first
  });
});

describe("Free walk town trip — cooldown (D-069 knob, shared by every tier)", () => {
  test("D-075 default (cooldown 0): a second trip opens immediately after one completes", async () => {
    const { world, harness } = walkScene(); // warpConfig() → cooldownMs 0 (the shipped default)
    await driveTrip(harness, world);
    expect(harness.state()).toBe("WORKING");

    // No cooldown → a Free bot may walk back to restock right away.
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);
  });

  test("cooldown knob >0: a second trip within cooldownMs refuses after one completes", async () => {
    const { world, harness } = walkScene({ cooldownMs: 60_000 });
    await driveTrip(harness, world);
    expect(harness.state()).toBe("WORKING");

    // With an explicit >0 cooldown the same gate still blocks a second trip.
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(false);
  });
});

describe("Free walks but paid tiers still warp (D-071 — modes never mix)", () => {
  test("plus transfers on its first trip tick (warp); free is still walking after the same tick", async () => {
    // Plus: mode "warp" → the actor reaches the town host on the very first trip tick (no walk phase).
    const plus = walkScene({ tier: "plus" });
    expect(plus.harness.runtime.beginTownTrip("bag_full")).toBe(true);
    await plus.harness.tickAndSettle();
    expect(plus.world.hostsContaining(ACTOR)[0]).toBe(plus.townHost); // instant server-owned transfer

    // Free: mode "walk" → the same first trip tick only steps toward the portal; the actor is still on the farm.
    const free = walkScene({ tier: "free" });
    expect(free.harness.runtime.beginTownTrip("bag_full")).toBe(true);
    await free.harness.tickAndSettle();
    expect(free.world.hostsContaining(ACTOR)[0]).toBe(free.farmHost); // still walking, no transfer yet
  });
});
