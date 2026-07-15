import { describe, expect, test } from "vitest";
import { createWarpHarness, FakeWorld, warpConfig, type BagSeed } from "./helpers/warp-world";
import type { BotTier } from "../server/config/bot";

// PR5 Phase C (D-069/D-070) — town-trip warp handoff. Drives the REAL BotRuntime through beginTownTrip + ticks over
// a FakeWorld of multiple hosts sharing one character-scoped economy. The load-bearing invariant asserted after
// every tick: the single actor is materialized in exactly ONE host (Σ hosts containing it === 1). Takeover/expiry
// mid-trip suites land in the NEXT task; here we lock the transfer mechanics + the sell/deposit/restock flow.

const ACTOR = "actor:real";

/** Standard farm bag: 3 sellable materials, 1 rare (deposit-only), 1 equipped (ignored). No potions held → need 5. */
function standardBag(): BagSeed[] {
  return [
    { instanceId: "s1", itemId: "mat_a", rarity: "common", sellPrice: 30, deliverable: true },
    { instanceId: "s2", itemId: "mat_b", rarity: "common", sellPrice: 30, deliverable: true },
    { instanceId: "s3", itemId: "mat_c", rarity: "uncommon", sellPrice: 30, deliverable: true },
    { instanceId: "s4", itemId: "mat_rare", rarity: "rare", sellPrice: null, deliverable: true },
    { instanceId: "eq1", itemId: "eq_weapon", rarity: "rare", sellPrice: 99, deliverable: true, equipped: true },
  ];
}

interface SceneOptions {
  tier?: BotTier;
  gold?: number;
  buyPrice?: number;
  bag?: BagSeed[];
  townReserveFails?: boolean;
  townAttachFails?: boolean;
  farmAttachFails?: boolean;
  farmExportReturnsNull?: boolean;
  blockTown?: boolean;
}

function scene(opts: SceneOptions = {}) {
  const world = new FakeWorld({
    actorId: ACTOR,
    gold: opts.gold ?? 20,
    buyPrice: opts.buyPrice ?? 18,
    bag: opts.bag ?? standardBag(),
  });
  const farmHost = world.addHost({
    roomId: "room-farm",
    mapId: "map1",
    attachFails: opts.farmAttachFails,
    exportReturnsNull: opts.farmExportReturnsNull,
  });
  farmHost.players.add(ACTOR); // the actor starts materialized on the farm.
  const townHost = world.addHost({
    roomId: "room-town",
    mapId: "city-hub",
    reserveFails: opts.townReserveFails,
    attachFails: opts.townAttachFails,
  });
  if (opts.blockTown) world.blockAcquire.add("city-hub");
  const harness = createWarpHarness({ world, farmHost, tier: opts.tier ?? "plus", config: warpConfig() });
  return { world, farmHost, townHost, harness };
}

/** Drive ticks until the run returns home to WORKING (or stops), recording the per-tick state + actor count. */
async function driveToWorking(
  harness: ReturnType<typeof createWarpHarness>,
  world: FakeWorld,
  maxTicks = 60,
) {
  const trail: { state: string; revision: number; count: number }[] = [];
  for (let i = 0; i < maxTicks; i++) {
    await harness.tickAndSettle();
    trail.push({ state: harness.state(), revision: harness.revision(), count: world.actorCount() });
    if (harness.runtime.isStopped) break;
    if (harness.state() === "WORKING") break;
  }
  return trail;
}

function dedupe(states: string[]): string[] {
  return states.filter((s, i) => i === 0 || s !== states[i - 1]);
}

describe("town-trip warp handoff — happy path", () => {
  test("full trip WORKING→…→WORKING with the actor in exactly one host after every tick", async () => {
    const { world, farmHost, townHost, harness } = scene();

    expect(harness.state()).toBe("WORKING");
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);
    expect(harness.state()).toBe("RETURNING_TO_TOWN"); // advanced before any warp
    expect(world.actorCount()).toBe(1); // still on the farm

    const trail = await driveToWorking(harness, world);

    // Invariant: the actor is materialized in exactly one host after every tick.
    for (const step of trail) expect(step.count).toBe(1);

    // Continuity visited the fixed town cycle and returned home.
    const states = dedupe(["RETURNING_TO_TOWN", ...trail.map((t) => t.state)]);
    expect(states).toEqual([
      "RETURNING_TO_TOWN",
      "SELLING",
      "DEPOSITING",
      "RESTOCKING",
      "RETURNING_TO_WORK",
      "WORKING",
    ]);

    // Revisions never decrease and strictly increased overall.
    const revisions = trail.map((t) => t.revision);
    for (let i = 1; i < revisions.length; i++) expect(revisions[i]).toBeGreaterThanOrEqual(revisions[i - 1]);
    expect(harness.revision()).toBeGreaterThan(0);
    expect(harness.runtime.isStopped).toBe(false);

    // Sells/deposits/buys hit the TOWN host with deterministic idempotency keys (rebind proof).
    expect(townHost.calls.sell).toEqual([
      "bot:run-warp:t0:sell:s1",
      "bot:run-warp:t0:sell:s2",
      "bot:run-warp:t0:sell:s3",
    ]);
    expect(townHost.calls.deposit).toEqual(["bot:run-warp:t0:deposit:s4"]);
    expect(townHost.calls.buy).toEqual([
      "bot:run-warp:t0:buy:con_small_potion:0",
      "bot:run-warp:t0:buy:con_small_potion:1",
      "bot:run-warp:t0:buy:con_small_potion:2",
    ]);
    // The farm host never ran a transaction (all routed through the rebound town host).
    expect(farmHost.calls.sell).toHaveLength(0);
    expect(farmHost.calls.buy).toHaveLength(0);

    // Bag freed (3 sold + 1 deposited; +1 potion stack) and the gold reserve held (buys stopped before dipping <50).
    expect(world.usedSlots()).toBe(1); // only the potion stack remains among non-equipped slots
    expect(world.gold).toBe(56); // 20 +90 sells −54 (3×18) = 56 ≥ 50
    expect(world.storage.map((r) => r.instanceId)).toEqual(["s4"]);
  });
});

describe("town-trip warp handoff — outbound aborts (actor never leaves the farm)", () => {
  test("seat capacity fail: no transfer, continuity back to WORKING, farming resumes, no stop", async () => {
    const { world, farmHost, townHost, harness } = scene({ townReserveFails: true });
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);

    await harness.tickAndSettle(); // warp_out: reserve fails → outbound abort
    expect(harness.state()).toBe("WORKING");
    expect(world.actorCount()).toBe(1);
    expect(world.hostsContaining(ACTOR)[0]).toBe(farmHost); // still home
    expect(farmHost.calls.export).toBe(0); // never exported (reserve is checked first)
    expect(townHost.calls.reserve).toBeGreaterThanOrEqual(1);
    expect(harness.runtime.isStopped).toBe(false);

    await harness.tickAndSettle(); // farming resumes cleanly
    expect(harness.runtime.isStopped).toBe(false);
    expect(harness.state()).toBe("WORKING");
  });

  test("acquireHostForMap null: outbound abort with a retry backoff (no busy-loop of acquire attempts)", async () => {
    const { world, harness } = scene({ blockTown: true });
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);

    await harness.tickAndSettle();
    expect(harness.state()).toBe("WORKING");
    expect(world.actorCount()).toBe(1);
    expect(world.acquireCalls.filter((m) => m === "city-hub")).toHaveLength(1);

    // A second begin within the backoff window refuses — no fresh acquire attempt.
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(false);
    expect(world.acquireCalls.filter((m) => m === "city-hub")).toHaveLength(1);
  });

  test("attach fail re-attaches to the farm (WORKING abort); a double failure stops town_trip_failed", async () => {
    const recovered = scene({ townAttachFails: true });
    expect(recovered.harness.runtime.beginTownTrip("bag_full")).toBe(true);
    await recovered.harness.tickAndSettle();
    expect(recovered.harness.state()).toBe("WORKING");
    expect(recovered.world.actorCount()).toBe(1);
    expect(recovered.world.hostsContaining(ACTOR)[0]).toBe(recovered.farmHost); // re-attached home
    expect(recovered.farmHost.calls.attach).toBeGreaterThanOrEqual(1);
    expect(recovered.harness.runtime.isStopped).toBe(false);

    const fatal = scene({ townAttachFails: true, farmAttachFails: true });
    expect(fatal.harness.runtime.beginTownTrip("bag_full")).toBe(true);
    await fatal.harness.tickAndSettle();
    expect(fatal.harness.runtime.isStopped).toBe(true);
    expect(fatal.harness.state()).toBe("WAITING_FOR_OWNER");
    expect(fatal.world.stoppedMessage()).toMatchObject({ reason: "town_trip_failed" });
  });

  test("export null (death raced): the target seat is released, no transfer, no crash", async () => {
    const { world, farmHost, townHost, harness } = scene({ farmExportReturnsNull: true });
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);

    await harness.tickAndSettle();
    expect(townHost.calls.reserve).toBe(1);
    expect(townHost.calls.release).toBe(1); // seat balanced (reserved then released)
    expect(townHost.calls.attach).toBe(0); // no attach at the town
    expect(townHost.players.size).toBe(0);
    expect(world.actorCount()).toBe(1);
    expect(world.hostsContaining(ACTOR)[0]).toBe(farmHost); // export null = actor stayed put
    expect(harness.state()).toBe("WORKING");
  });
});

describe("town-trip warp handoff — return warp target selection", () => {
  test("original farm host disposed mid-trip → the return warp lands in a NEW farm host (count still 1)", async () => {
    const { world, farmHost, townHost, harness } = scene();
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);

    await harness.tickAndSettle(); // warp out → actor in town
    expect(world.hostsContaining(ACTOR)[0]).toBe(townHost);
    world.disposeHost(farmHost); // the original farm MapRoom disposes while the actor is away

    const trail = await driveToWorking(harness, world);
    for (const step of trail) expect(step.count).toBe(1);
    expect(harness.state()).toBe("WORKING");
    expect(harness.runtime.isStopped).toBe(false);

    const home = world.hostsContaining(ACTOR)[0];
    expect(home).toBeDefined();
    expect(home!.roomId).not.toBe(farmHost.roomId); // a freshly-created farm host
    expect(home!.mapId).toBe("map1");
  });
});

describe("town-trip warp handoff — begin guards", () => {
  test("free tier refuses a trip: no continuity advance, no acquire", async () => {
    const { world, harness } = scene({ tier: "free" });
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(false);
    expect(harness.state()).toBe("WORKING");
    expect(world.acquireCalls).toHaveLength(0);
  });

  test("cooldown: a second trip within cooldownMs refuses after one completes", async () => {
    const { world, harness } = scene();
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);
    await driveToWorking(harness, world);
    expect(harness.state()).toBe("WORKING");

    // Immediately after completion the cooldown blocks a second trip.
    expect(harness.runtime.beginTownTrip("bag_full")).toBe(false);
  });
});
