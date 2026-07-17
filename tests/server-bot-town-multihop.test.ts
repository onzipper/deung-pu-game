import { describe, expect, test } from "vitest";
import { createWarpHarness, FakeWorld, warpConfig, type BagSeed, type FakeHost } from "./helpers/warp-world";
import type { Vec2 } from "../server/bot/agent";
import type { BotAttackOutcome } from "../server/bot/runtime";
import type { BotConfig, BotTier } from "../server/config/bot";

// D-071 M2b (2026-07-17) — multi-hop Free walk town trip. A Free bot farming map2–map4 has no DIRECT portal to the
// city-hub; it must cross the real chain city-hub↔map1↔map2↔map3↔map4 one hop at a time. The controller recomputes
// the next hop per leg (BFS over the real map graph) and transfers at each gate, holding RETURNING_TO_TOWN across the
// whole outbound chain and RETURNING_TO_WORK across the whole return chain. Drives the REAL BotRuntime over a
// walk-capable multi-host FakeWorld. Invariant re-asserted after every tick: Σ hosts containing the actor === 1.

const ACTOR = "actor:real";
const OUT: Vec2 = { tx: 20, ty: 2 }; // each map's portal approach toward the town (inward)
const RETURN: Vec2 = { tx: 20, ty: 38 }; // each map's portal approach back toward the farm (outward)
const LANDING: Vec2 = { tx: 20, ty: 20 }; // arrival spawn on every map (a transfer lands here)
const TOWN_CAMP: Vec2 = { tx: 16, ty: 20 }; // city-hub service anchor (safe camp next to shop + storage)

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

interface ChainOptions {
  farmMapId?: string; // where the actor starts farming (default map3 → 2 hops to town)
  tier?: BotTier;
  gold?: number;
  bag?: BagSeed[];
  config?: BotConfig;
  blockAcquire?: string[]; // maps acquireHostForMap must refuse (mid-chain failure)
}

/**
 * Build the full portal chain city-hub↔map1↔map2↔map3 as four walk-capable FakeHosts, each carrying the exits the
 * real registry declares (so the runtime's BFS next-hop matches the host's own exit lookup). The actor starts on the
 * farm host; every other host is pre-registered so acquireHostForMap resolves the SAME host on the outbound and the
 * return (no duplicate rooms). Returns the harness plus a mapId→host lookup for per-host seam assertions.
 */
function chainScene(opts: ChainOptions = {}) {
  const farmMapId = opts.farmMapId ?? "map3";
  const world = new FakeWorld({ actorId: ACTOR, gold: opts.gold ?? 20, buyPrice: 18, bag: opts.bag ?? standardBag() });
  for (const m of opts.blockAcquire ?? []) world.blockAcquire.add(m);

  const hosts: Record<string, FakeHost> = {};
  const add = (mapId: string, exits: FakeHost["exits"], safeCamp: Vec2) => {
    hosts[mapId] = world.addHost({
      roomId: `room-${mapId}`,
      mapId,
      safeCamp,
      walk: { start: { ...LANDING }, step: 6 },
      exits,
      mobs: () => [{ id: "m1", mobType: "slime", tx: LANDING.tx, ty: LANDING.ty, hp: 10, pocketId: "A" }],
      attack: async () => clean(),
    });
  };
  // Each host carries BOTH directions: the inward exit (toward the town) and the outward exit (back to the farm).
  add("map3", [{ targetMapId: "map2", approach: { ...OUT }, landing: { ...LANDING } }], { tx: 8, ty: 20 });
  add(
    "map2",
    [
      { targetMapId: "map1", approach: { ...OUT }, landing: { ...LANDING } },
      { targetMapId: "map3", approach: { ...RETURN }, landing: { ...LANDING } },
    ],
    { tx: 8, ty: 20 },
  );
  add(
    "map1",
    [
      { targetMapId: "city-hub", approach: { ...OUT }, landing: { ...LANDING } },
      { targetMapId: "map2", approach: { ...RETURN }, landing: { ...LANDING } },
    ],
    { tx: 8, ty: 20 },
  );
  add("city-hub", [{ targetMapId: "map1", approach: { ...RETURN }, landing: { ...LANDING } }], { ...TOWN_CAMP });

  const farmHost = hosts[farmMapId];
  farmHost.players.add(ACTOR); // the actor starts materialized on the farm.

  const config = opts.config ?? { ...warpConfig(), botAllowedPockets: { [farmMapId]: ["A"] } };
  const harness = createWarpHarness({ world, farmHost, tier: opts.tier ?? "free", config });
  return { world, hosts, farmHost, townHost: hosts["city-hub"], harness };
}

function dedupe(states: string[]): string[] {
  return states.filter((s, i) => i === 0 || s !== states[i - 1]);
}

/** Drive ticks, recording per-tick {state, count, mapId}, until the trip completes and farming resumes (or a stop). */
async function driveTrip(harness: ReturnType<typeof createWarpHarness>, world: FakeWorld, maxTicks = 120) {
  const trail: { state: string; count: number; mapId: string }[] = [];
  let sawServices = false;
  for (let i = 0; i < maxTicks; i++) {
    await harness.tickAndSettle();
    const state = harness.state();
    trail.push({ state, count: world.actorCount(), mapId: world.hostsContaining(ACTOR)[0]?.mapId ?? "none" });
    if (harness.runtime.isStopped) break;
    if (state === "SELLING" || state === "DEPOSITING" || state === "RESTOCKING") sawServices = true;
    if (sawServices && state === "WORKING") break; // route_home advanced WORKING → the trip is done.
  }
  return trail;
}

describe("Free multi-hop walk town trip — map3 → 2 hops → city-hub → back (D-071 M2b)", () => {
  test("crosses map3→map2→map1→city-hub and back, one host every tick, fixed continuity", async () => {
    const { world, townHost, harness } = chainScene({ farmMapId: "map3" });
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);

    const trail = await driveTrip(harness, world);

    // Invariant: exactly one host holds the actor after every tick (walking + all six transfers).
    for (const step of trail) expect(step.count).toBe(1);

    // The actor visited the full chain to town and back — never skipping a hop.
    const mapTrail = dedupe(trail.map((t) => t.mapId));
    expect(mapTrail).toEqual(["map3", "map2", "map1", "city-hub", "map1", "map2", "map3"]);

    // Continuity held RETURNING_TO_TOWN across the whole outbound chain and RETURNING_TO_WORK across the whole return.
    expect(dedupe(trail.map((t) => t.state))).toEqual([
      "RETURNING_TO_TOWN",
      "SELLING",
      "DEPOSITING",
      "RESTOCKING",
      "RETURNING_TO_WORK",
      "WORKING",
    ]);
    expect(harness.runtime.isStopped).toBe(false);

    // acquireHostForMap was called for each hop in order — no duplicate rooms (the same pre-registered hosts resolve).
    expect(world.acquireCalls).toEqual(["map2", "map1", "city-hub", "map1", "map2", "map3"]);

    // The economy ran entirely on the town host (transfer rebind proof) with the deterministic idempotency keys.
    expect(townHost.calls.sell).toEqual([
      "bot:run-warp:t0:sell:s1",
      "bot:run-warp:t0:sell:s2",
      "bot:run-warp:t0:sell:s3",
    ]);
    expect(townHost.calls.deposit).toEqual(["bot:run-warp:t0:deposit:s4"]);
    expect(townHost.calls.buy.length).toBeGreaterThan(0);

    // Same D-070 economy outcome: bag freed, rare deposited, gold reserve held.
    expect(world.usedSlots()).toBe(1); // only the restocked potion stack among non-equipped slots
    expect(world.storage.map((r) => r.instanceId)).toEqual(["s4"]);
    expect(world.gold).toBe(56); // 20 +90 sells −54 (3×18) = 56 ≥ 50 reserve
  });

  test("map1 farm is a single hop (regression: the direct-portal case still works)", async () => {
    const { world, harness } = chainScene({ farmMapId: "map1" });
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);

    const trail = await driveTrip(harness, world);

    for (const step of trail) expect(step.count).toBe(1);
    expect(dedupe(trail.map((t) => t.mapId))).toEqual(["map1", "city-hub", "map1"]);
    expect(world.acquireCalls).toEqual(["city-hub", "map1"]);
    expect(harness.runtime.isStopped).toBe(false);
    expect(world.usedSlots()).toBe(1);
  });
});

describe("Free multi-hop walk town trip — unroutable maps (D-071 M2b)", () => {
  test("proactive trigger + no route from an isolated map → stop town_trip_no_route (wait_for_owner)", async () => {
    const world = new FakeWorld({ actorId: ACTOR, gold: 20, buyPrice: 18, bag: standardBag() });
    const farmHost = world.addHost({
      roomId: "room-island",
      mapId: "island", // NOT in the registry graph → no chain to the city-hub
      safeCamp: { tx: 8, ty: 20 },
      walk: { start: { ...LANDING }, step: 6 },
      exits: [],
    });
    farmHost.players.add(ACTOR);
    const config: BotConfig = { ...warpConfig(), botAllowedPockets: { island: ["A"] } };
    const harness = createWarpHarness({ world, farmHost, tier: "free", config });

    expect(harness.runtime.beginTownTrip("bag_pressure")).toBe(true); // a proactive trigger
    await harness.tickAndSettle(); // walk_out → planNextHop returns null → outboundNoRoute

    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(world.stoppedMessage()?.reason).toBe("town_trip_no_route");
    expect(world.acquireCalls).toHaveLength(0); // never left the farm
  });

  test("bag_full + no route → retryable abort back to WORKING (the runtime's inventory_full fallback guards it)", async () => {
    const world = new FakeWorld({ actorId: ACTOR, gold: 20, buyPrice: 18, bag: standardBag() });
    const farmHost = world.addHost({
      roomId: "room-island",
      mapId: "island",
      safeCamp: { tx: 8, ty: 20 },
      walk: { start: { ...LANDING }, step: 6 },
      exits: [],
    });
    farmHost.players.add(ACTOR);
    const config: BotConfig = { ...warpConfig(), botAllowedPockets: { island: ["A"] } };
    const harness = createWarpHarness({ world, farmHost, tier: "free", config });

    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);
    await harness.tickAndSettle(); // walk_out → no route → abortOutbound (retryable)

    expect(harness.runtime.isStopped).toBe(false);
    expect(harness.state()).toBe("WORKING"); // resumed farming (never left the farm)
    expect(world.acquireCalls).toHaveLength(0);
  });
});

describe("Free multi-hop walk town trip — failure mid-chain (D-071 M2b)", () => {
  test("host creation fails at hop 2 → stop town_trip_failed, actor parked on the intermediate map (one host)", async () => {
    const { world, harness } = chainScene({ farmMapId: "map3", blockAcquire: ["map1"] });
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);

    const counts: number[] = [];
    for (let i = 0; i < 40 && !harness.runtime.isStopped; i++) {
      await harness.tickAndSettle();
      counts.push(world.actorCount());
    }

    for (const c of counts) expect(c).toBe(1); // no duplicate actor at any tick boundary
    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(world.stoppedMessage()?.reason).toBe("town_trip_failed");
    // First hop (map3→map2) succeeded; the second (map2→map1) could not acquire a host → parked on map2.
    expect(world.hostsContaining(ACTOR).map((h) => h.mapId)).toEqual(["map2"]);
    expect(world.acquireCalls).toEqual(["map2", "map1"]); // hop 1 ok, hop 2 refused
  });
});

describe("Free multi-hop walk town trip — takeover settles in place (D-071 M2b)", () => {
  test("takeover mid hop-2 outbound → pause in place on the intermediate map, no return journey", async () => {
    const { world, harness } = chainScene({ farmMapId: "map3" });
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);

    // Drive until the actor has completed hop 1 and is walking on map2 (mid hop-2 outbound).
    for (let i = 0; i < 40; i++) {
      await harness.tickAndSettle();
      if (world.hostsContaining(ACTOR)[0]?.mapId === "map2" && harness.state() === "RETURNING_TO_TOWN") break;
    }
    expect(world.hostsContaining(ACTOR)[0]?.mapId).toBe("map2");
    const acquiresBefore = world.acquireCalls.length; // only hop 1 so far

    harness.runtime.takeover("cp-mid", harness.now()); // owner reclaims mid-walk
    await harness.tickAndSettle(); // next tick: settleWalkAbort → pause in place

    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("PAUSED");
    expect(world.actorCount()).toBe(1);
    expect(world.hostsContaining(ACTOR)[0]?.mapId).toBe("map2"); // paused where it stood — NOT walked home
    expect(world.acquireCalls.length).toBe(acquiresBefore); // no further transfer after the takeover
  });

  test("takeover during SELLING (walk) → the in-flight sell drains, then settle in place in town", async () => {
    const { world, townHost, harness } = chainScene({ farmMapId: "map3" });

    // Gate the FIRST town sell so the takeover fires while it is in flight (it must drain before authority release).
    let releaseSell!: () => void;
    const sellGate = new Promise<void>((resolve) => {
      releaseSell = resolve;
    });
    let firstSell = true;
    let sellStarted = false;
    const realSell = townHost.botTownSell.bind(townHost);
    townHost.botTownSell = async (a, i, v, q, k) => {
      if (firstSell) {
        firstSell = false;
        sellStarted = true;
        await sellGate;
      }
      return realSell(a, i, v, q, k);
    };

    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);
    for (let i = 0; i < 60 && !sellStarted; i++) await harness.tickAndSettle();
    expect(sellStarted).toBe(true);
    expect(world.hostsContaining(ACTOR)[0]?.mapId).toBe("city-hub");
    expect(harness.state()).toBe("SELLING");

    harness.runtime.takeover("cp-sell", harness.now());
    releaseSell();
    await harness.flush(); // the in-flight sell commits

    for (let i = 0; i < 20 && !harness.runtime.isStopped; i++) await harness.tickAndSettle();

    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("PAUSED");
    expect(world.actorCount()).toBe(1);
    expect(world.hostsContaining(ACTOR)[0]?.mapId).toBe("city-hub"); // settled in town, NOT walked back to the farm
    expect(townHost.calls.sell).toHaveLength(1); // exactly the in-flight sell completed
    expect(townHost.calls.deposit).toHaveLength(0); // no further transactions after the takeover
    expect(townHost.calls.buy).toHaveLength(0);
  });
});
