import { describe, expect, test } from "vitest";
import { FakeWorld, warpConfig, type BagSeed, type FakeHost } from "./helpers/warp-world";
import { BotManager, type BotManagerDeps } from "../server/bot/manager";
import type { BotHost, BotRuntime } from "../server/bot/runtime";
import type { ProfileRepo } from "../server/bot/profiles";
import type { SessionRepo, TierRepo } from "../server/bot/store";
import type { BotProfileRow, BotTierStateRow } from "../server/bot/types";
import { MSG_BOT_CHECKPOINT, type BotCheckpointMessage } from "../src/shared/net-protocol";

// PR5 Phase C (D-069) — manual takeover fired at each town-trip boundary, driven through the REAL BotManager +
// BotRuntime over the FakeWorld. D-069 locked semantics under test: a mid-trip takeover is finish-and-return-then-
// pause (fence new transactions immediately, drain the in-flight one, run the return warp, PAUSE at the farm with a
// checkpoint byte-compatible with the farm map). A return-warp failure PAUSES in place at the city-hub AND the
// checkpoint must tell the truth about where the actor is — the manager stamps checkpoint.mapId from the runtime's
// current host at settle time (server/bot/manager.ts settleTakeoverCheckpoint). Invariant re-asserted after every
// tick: the single actor is materialized in exactly ONE host (Σ === 1).

const ACTOR = "actor:real";
const ACCOUNT = "account-a";
const CHARACTER = "character-a";

/** Farm bag: 3 sellable materials, 1 rare (deposit-only), 1 equipped (ignored). Leaves 36 free slots → no preflight. */
function standardBag(): BagSeed[] {
  return [
    { instanceId: "s1", itemId: "mat_a", rarity: "common", sellPrice: 30, deliverable: true },
    { instanceId: "s2", itemId: "mat_b", rarity: "common", sellPrice: 30, deliverable: true },
    { instanceId: "s3", itemId: "mat_c", rarity: "uncommon", sellPrice: 30, deliverable: true },
    { instanceId: "s4", itemId: "mat_rare", rarity: "rare", sellPrice: null, deliverable: true },
    { instanceId: "eq1", itemId: "eq_weapon", rarity: "rare", sellPrice: 99, deliverable: true, equipped: true },
  ];
}

const PROFILE: BotProfileRow = {
  id: "profile-1",
  accountId: ACCOUNT,
  name: "field plan",
  mapId: "map1",
  pocketId: "A",
  rules: { skillSlots: [0], potionThresholdPct: null, lootAll: true },
  createdAt: 1,
  updatedAt: 1,
};

const PLUS_ROW: BotTierStateRow = { accountId: ACCOUNT, tier: "plus", passExpiresAt: 10_000_000_000, updatedAt: 0 };

/** Read-only projection of the manager's internal StoredCheckpoint (not exported) — state + wire map fields. */
type CheckpointView = { id: string; state: string; mapId: string; pocketId: string };

async function startScene(opts: { patch?: SessionRepo["patch"] } = {}) {
  const world = new FakeWorld({ actorId: ACTOR, gold: 20, buyPrice: 18, bag: standardBag() });
  const farmHost = world.addHost({ roomId: "room-farm", mapId: "map1" });
  farmHost.players.add(ACTOR); // the actor starts materialized on the farm
  const townHost = world.addHost({ roomId: "room-town", mapId: "city-hub" });

  let clock = 100_000;
  const send = (type: string, message: unknown) => {
    world.messages.push({ type, message });
  };

  const profileRepo: ProfileRepo = {
    listByAccount: async (a) => (a === ACCOUNT ? [PROFILE] : []),
    getById: async (a, id) => (a === ACCOUNT && id === PROFILE.id ? PROFILE : null),
    insert: async () => undefined,
    update: async () => undefined,
    remove: async () => undefined,
  };
  const tierRepo: TierRepo = { get: async () => PLUS_ROW, upsert: async () => undefined };
  const sessionRepo: SessionRepo = {
    insert: async () => undefined,
    patch: opts.patch ?? (async () => undefined),
    listByAccount: async () => [],
    getById: async () => null,
    markOpenAsRestart: async () => 0,
  };
  const deps: BotManagerDeps = {
    config: warpConfig(),
    tierRepo,
    profileRepo,
    sessionRepo,
    rarityOf: () => undefined,
    dbAvailable: () => true,
    now: () => clock,
  };
  const manager = new BotManager(deps);
  // Route the town-trip warp acquisition through the FakeWorld's scriptable multi-host registry (colyseus
  // matchMaker is unavailable in a unit test); register both hosts so the manager's ownerSend fan-out + the
  // settled checkpoint push reach the actor's owner channel.
  (manager as unknown as { acquireHostForMap: (m: string) => Promise<BotHost | null> }).acquireHostForMap =
    world.acquireHostForMap;
  manager.registerRoom(farmHost);
  manager.registerRoom(townHost);

  await manager.onStart(farmHost, "controller-1", ACCOUNT, CHARACTER, send, { profileId: PROFILE.id });
  const runtime = (manager as unknown as { bots: Map<string, BotRuntime> }).bots.get(ACCOUNT)!;
  expect(runtime).toBeDefined();

  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return {
    world,
    farmHost,
    townHost,
    manager,
    runtime,
    send,
    advanceClock: (ms: number) => {
      clock += ms;
    },
    tickAndSettle: async (dtMs = 2_000) => {
      runtime.tick(dtMs);
      await flush();
    },
    flush,
    state: () => runtime.continuitySnapshot.state,
    actorCount: () => world.actorCount(),
    tripController: () => (runtime as unknown as { tripController: unknown }).tripController,
    checkpoint: (): CheckpointView | undefined =>
      (manager as unknown as { checkpoints: Map<string, CheckpointView> }).checkpoints.get(ACCOUNT),
    onTakeover: () => manager.onTakeover(ACCOUNT, ACTOR, send, { requestId: "tk", source: "move" }),
  };
}

describe("town-trip manual takeover boundaries (D-069)", () => {
  test("(a) takeover during warp_out (before transfer): no transfer, pause at farm, checkpoint ready farm map", async () => {
    const s = await startScene();
    const { world, farmHost, townHost, runtime } = s;

    expect(runtime.beginTownTrip("bag_full")).toBe(true);
    expect(s.onTakeover()).toBe(true); // fired before the warp tick → abort observed before any transfer
    expect(s.checkpoint()?.state).toBe("saving");

    const counts: number[] = [];
    for (let i = 0; i < 10 && !runtime.isStopped; i++) {
      await s.tickAndSettle();
      counts.push(world.actorCount());
    }
    await s.flush();

    for (const c of counts) expect(c).toBe(1);
    expect(farmHost.calls.export).toBe(0); // never left the farm
    expect(townHost.calls.reserve).toBe(0);
    expect(townHost.calls.attach).toBe(0);
    expect(world.hostsContaining(ACTOR)[0]).toBe(farmHost);
    expect(s.state()).toBe("PAUSED");

    const cp = s.checkpoint();
    expect(cp?.state).toBe("ready");
    expect(cp?.mapId).toBe("map1");
  });

  test("(b) mid-SELLING takeover: the in-flight sell drains, no further tx, return home, checkpoint ready farm map", async () => {
    const s = await startScene();
    const { world, farmHost, townHost, runtime } = s;

    // Gate the FIRST town sell so the takeover can fire while it is in flight (drains before authority moves).
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

    expect(runtime.beginTownTrip("bag_full")).toBe(true);
    const counts: number[] = [];
    for (let i = 0; i < 8 && !sellStarted; i++) {
      await s.tickAndSettle();
      counts.push(world.actorCount());
    }
    expect(sellStarted).toBe(true);
    expect(runtime.host.mapId).toBe("city-hub"); // the actor is at the town host
    expect(world.hostsContaining(ACTOR)[0]).toBe(townHost);
    expect(s.state()).toBe("SELLING");

    expect(s.onTakeover()).toBe(true);
    expect(s.checkpoint()?.state).toBe("saving");

    releaseSell();
    await s.flush(); // the in-flight sell commits
    for (let i = 0; i < 30 && !runtime.isStopped; i++) {
      await s.tickAndSettle();
      counts.push(world.actorCount());
    }
    await s.flush();

    for (const c of counts) expect(c).toBe(1);
    expect(runtime.isStopped).toBe(true);
    expect(s.state()).toBe("PAUSED");
    expect(world.hostsContaining(ACTOR)[0]).toBe(farmHost); // returned home before pausing
    expect(townHost.calls.sell).toHaveLength(1); // exactly the in-flight sell completed
    expect(townHost.calls.deposit).toHaveLength(0); // no further transactions after the takeover
    expect(townHost.calls.buy).toHaveLength(0);

    const cp = s.checkpoint();
    expect(cp?.state).toBe("ready");
    expect(cp?.mapId).toBe("map1"); // a normal farm landing is byte-compatible with the pre-trip checkpoint
  });

  test("(c) takeover between phases (RESTOCKING entered, before any buy): no buys, return + pause at farm", async () => {
    const s = await startScene();
    const { world, farmHost, townHost, runtime } = s;

    expect(runtime.beginTownTrip("bag_full")).toBe(true);
    const counts: number[] = [];
    for (let i = 0; i < 20; i++) {
      await s.tickAndSettle();
      counts.push(world.actorCount());
      if (s.state() === "RESTOCKING") break;
    }
    expect(s.state()).toBe("RESTOCKING");
    expect(townHost.calls.buy).toHaveLength(0); // the restock buy has not run yet

    expect(s.onTakeover()).toBe(true);
    for (let i = 0; i < 20 && !runtime.isStopped; i++) {
      await s.tickAndSettle();
      counts.push(world.actorCount());
    }
    await s.flush();

    for (const c of counts) expect(c).toBe(1);
    expect(townHost.calls.buy).toHaveLength(0); // no buy ever ran (remaining work skipped)
    expect(world.hostsContaining(ACTOR)[0]).toBe(farmHost);
    expect(s.state()).toBe("PAUSED");

    const cp = s.checkpoint();
    expect(cp?.state).toBe("ready");
    expect(cp?.mapId).toBe("map1");
  });

  test("(d) takeover while walking back (trip handed to recovery): pause on the farm host, no second transfer", async () => {
    const s = await startScene();
    const { world, farmHost, runtime } = s;

    expect(runtime.beginTownTrip("bag_full")).toBe(true);
    const counts: number[] = [];
    // Drive the whole trip until it hands control back to recovery (tripController cleared) with the actor home.
    for (let i = 0; i < 40; i++) {
      await s.tickAndSettle();
      counts.push(world.actorCount());
      if (s.tripController() === null && world.hostsContaining(ACTOR)[0] === farmHost && !runtime.isStopped) break;
    }
    expect(s.tripController()).toBeNull();
    expect(world.hostsContaining(ACTOR)[0]).toBe(farmHost);
    const exportsBefore = farmHost.calls.export; // the single outbound export

    expect(s.onTakeover()).toBe(true); // now an immediate pause — no active trip to drive home
    await s.flush();

    for (const c of counts) expect(c).toBe(1);
    expect(world.actorCount()).toBe(1);
    expect(world.hostsContaining(ACTOR)[0]).toBe(farmHost); // paused in place — no second transfer
    expect(farmHost.calls.export).toBe(exportsBefore);
    expect(s.state()).toBe("PAUSED");

    const cp = s.checkpoint();
    expect(cp?.state).toBe("ready");
    expect(cp?.mapId).toBe("map1");
  });

  test("(e) return-warp failure: PAUSED in place at the city-hub, checkpoint ready city-hub map (reconciliation)", async () => {
    const s = await startScene();
    const { world, farmHost, townHost, runtime } = s;

    // Script the farm side to reject the return warp (belt-and-suspenders); the acquire itself returns null below.
    farmHost.reserveFails = true;
    farmHost.attachFails = true;

    expect(runtime.beginTownTrip("bag_full")).toBe(true);
    const counts: number[] = [];
    for (let i = 0; i < 8; i++) {
      await s.tickAndSettle();
      counts.push(world.actorCount());
      if (world.hostsContaining(ACTOR)[0] === townHost) break;
    }
    expect(world.hostsContaining(ACTOR)[0]).toBe(townHost);
    world.blockAcquire.add("map1"); // the farm host can no longer be acquired for the return warp

    expect(s.onTakeover()).toBe(true); // finish-and-return-then-pause; the return warp fails
    for (let i = 0; i < 30 && !runtime.isStopped; i++) {
      await s.tickAndSettle();
      counts.push(world.actorCount());
    }
    await s.flush();

    for (const c of counts) expect(c).toBe(1); // no duplicate actor at any tick boundary
    expect(runtime.isStopped).toBe(true);
    expect(s.state()).toBe("PAUSED");
    expect(world.hostsContaining(ACTOR)[0]).toBe(townHost); // parked safely in the city-hub

    // Manual takeover owns the settlement — NOT a town_trip_failed stop.
    const stopped = world.stoppedMessage();
    expect(stopped?.reason).toBe("manual");
    expect(stopped?.reason).not.toBe("town_trip_failed");

    const cp = s.checkpoint();
    expect(cp?.state).toBe("ready");
    expect(cp?.mapId).toBe("city-hub"); // the reconciliation: the checkpoint tells the truth about the actor
    expect(cp?.pocketId).toBe("A"); // the plan's assigned pocket is unchanged
  });

  test("(f) checkpoint lifecycle: saving until the accepted report flush drains, then ready", async () => {
    let releaseFinalPatch!: () => void;
    const finalPatch = new Promise<void>((resolve) => {
      releaseFinalPatch = resolve;
    });
    const s = await startScene({
      // gate ONLY the terminal stop flush (stop arg present); periodic flushes (null) resolve immediately.
      patch: async (_id, _counters, stop) => {
        if (stop) await finalPatch;
      },
    });
    const { world, runtime } = s;

    expect(runtime.beginTownTrip("bag_full")).toBe(true);
    expect(s.onTakeover()).toBe(true); // fire during warp_out → the trip settles at the farm
    expect(s.checkpoint()?.state).toBe("saving");

    for (let i = 0; i < 10 && !runtime.isStopped; i++) await s.tickAndSettle();
    expect(runtime.isStopped).toBe(true);
    await s.flush();
    expect(s.checkpoint()?.state).toBe("saving"); // still saving — the accepted report write has not drained

    releaseFinalPatch();
    await s.flush();
    expect(s.checkpoint()?.state).toBe("ready"); // drained → ready

    // The owner saw the saving→ready progression on the wire.
    const states = world.messages
      .filter((m) => m.type === MSG_BOT_CHECKPOINT)
      .map((m) => (m.message as BotCheckpointMessage).checkpoint?.state);
    expect(states[0]).toBe("saving");
    expect(states.at(-1)).toBe("ready");
    expect(s.checkpoint()?.mapId).toBe("map1"); // returned to the farm before pausing
  });
});
