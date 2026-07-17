import { describe, expect, test } from "vitest";
import { createWarpHarness, FakeWorld, warpConfig } from "./helpers/warp-world";
import type { BotAttackOutcome } from "../server/bot/runtime";
import type { AgentMob } from "../server/bot/agent";
import type { BotRulesV1 } from "../server/bot/types";
import type { BotWorkflowFallback, BotWorkflowStep, BotWorkflowV1 } from "../src/shared/bot-workflow";

// PR6b — cross-map goal-chain farm step. When a step's map differs from the current host, the engine advances
// TRAVELING → transfers the ONE actor to the new map (the SAME warp.transferActor the town trip uses) → walks into
// the pocket via the recovery machinery. Mirrors server-bot-warp-handoff: the load-bearing invariant is the actor
// materialized in exactly ONE host after every settled tick. Covers ok / reserve_fail / attach_recovered / fatal.

const ACTOR = "actor:real";

function kill(): BotAttackOutcome {
  return { killed: 1, gold: 0, exp: 0, loot: [], bagOverflowed: false, overflow: [], leveledUp: false };
}
const bMob: AgentMob = { id: "b", mobType: "slime", tx: 0, ty: 0, hp: 10, pocketId: "B" };

const crossMapFarm = (fallbacks: BotWorkflowFallback[] = []): BotWorkflowStep => ({
  id: "s1",
  kind: "farm",
  mapId: "map2",
  pocketId: "B",
  goal: { type: "kills", target: 1_000_000 }, // unreachable — the transfer + arrival is what's under test
  fallbacks,
});
const wf = (...steps: BotWorkflowStep[]): BotWorkflowV1 => ({ version: 1, steps });

interface SceneOptions {
  map2ReserveFails?: boolean;
  map2AttachFails?: boolean;
  farmAttachFails?: boolean;
  fallbacks?: BotWorkflowFallback[];
}

function scene(opts: SceneOptions = {}) {
  const world = new FakeWorld({ actorId: ACTOR, gold: 200, buyPrice: 18, bag: [] });
  const farmHost = world.addHost({
    roomId: "room-map1",
    mapId: "map1",
    mobs: () => [],
    attack: async () => kill(),
    attachFails: opts.farmAttachFails,
  });
  farmHost.players.add(ACTOR); // the actor starts on map1
  const map2Host = world.addHost({
    roomId: "room-map2",
    mapId: "map2",
    mobs: () => [bMob],
    attack: async () => kill(),
    reserveFails: opts.map2ReserveFails,
    attachFails: opts.map2AttachFails,
  });
  const rules: BotRulesV1 = {
    skillSlots: [0],
    potionThresholdPct: null,
    lootAll: true,
    workflow: wf(crossMapFarm(opts.fallbacks)),
  };
  const harness = createWarpHarness({ world, farmHost, tier: "pro", config: warpConfig(), rules });
  return { world, farmHost, map2Host, harness };
}

async function drive(h: ReturnType<typeof createWarpHarness>, world: FakeWorld, max = 40) {
  const counts: number[] = [];
  for (let i = 0; i < max; i++) {
    await h.tickAndSettle();
    counts.push(world.actorCount());
    if (h.runtime.isStopped) break;
    if (h.state() === "WORKING" && world.hostsContaining(ACTOR)[0]?.mapId === "map2") break;
  }
  return counts;
}

describe("cross-map farm step — transfer succeeds", () => {
  test("the actor warps to the step's map, walks into the pocket, and farms there (count always 1)", async () => {
    const { world, map2Host, harness } = scene();

    const counts = await drive(harness, world);
    for (const c of counts) expect(c).toBe(1); // exactly one host at every settled tick

    expect(harness.runtime.isStopped).toBe(false);
    expect(world.hostsContaining(ACTOR)[0]).toBe(map2Host); // landed on map2
    expect(harness.runtime.runningCheckpoint.mapId).toBe("map2");
    expect(harness.state()).toBe("WORKING");
    expect(map2Host.calls.attach).toBe(1);
    // The cross-map transfer pushed exactly one owner-follow to map2 (a watching owner follows the goal-chain warp).
    expect(world.followMaps()).toEqual(["map2"]);
  });
});

describe("cross-map farm step — transfer fails", () => {
  test("reserve_fail: the actor never leaves the source map; no matching fallback stops stuck", async () => {
    const { world, farmHost, map2Host, harness } = scene({ map2ReserveFails: true });

    await drive(harness, world);
    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(world.stoppedMessage()?.reason).toBe("stuck");
    expect(world.actorCount()).toBe(1);
    expect(world.hostsContaining(ACTOR)[0]).toBe(farmHost); // still home
    expect(map2Host.calls.attach).toBe(0);
    expect(world.followMaps()).toHaveLength(0); // never transferred → no owner-follow push
  });

  test("attach at the target fails but re-attaches to the source (recovered) → stuck stop, actor home", async () => {
    const { world, farmHost, harness } = scene({ map2AttachFails: true });

    await drive(harness, world);
    expect(harness.runtime.isStopped).toBe(true);
    expect(world.stoppedMessage()?.reason).toBe("stuck");
    expect(world.actorCount()).toBe(1);
    expect(world.hostsContaining(ACTOR)[0]).toBe(farmHost); // re-attached home
  });

  test("a stuck fallback of next_step recovers a failed transfer without stopping the run", async () => {
    // s1 (map2) can't be reached (reserve fails) → the stuck fallback advances to s2 (a farm on map1).
    const world = new FakeWorld({ actorId: ACTOR, gold: 200, buyPrice: 18, bag: [] });
    const farmHost = world.addHost({ roomId: "room-map1", mapId: "map1", mobs: () => [{ id: "a", mobType: "slime", tx: 0, ty: 0, hp: 10, pocketId: "A" }], attack: async () => kill() });
    farmHost.players.add(ACTOR);
    world.addHost({ roomId: "room-map2", mapId: "map2", reserveFails: true });
    const rules: BotRulesV1 = {
      skillSlots: [0],
      potionThresholdPct: null,
      lootAll: true,
      workflow: wf(crossMapFarm([{ when: "stuck", action: "next_step" }]), {
        id: "s2",
        kind: "farm",
        mapId: "map1",
        pocketId: "A",
        goal: { type: "kills", target: 1_000_000 },
        fallbacks: [],
      }),
    };
    const harness = createWarpHarness({ world, farmHost, tier: "pro", config: warpConfig(), rules });

    for (let i = 0; i < 8; i++) {
      await harness.tickAndSettle();
      if (harness.runtime.workflowCheckpoint?.stepIndex === 1) break;
    }
    expect(harness.runtime.workflowCheckpoint?.stepIndex).toBe(1); // advanced to the map1 fallback step
    expect(harness.runtime.isStopped).toBe(false);
    expect(world.actorCount()).toBe(1);
    expect(world.hostsContaining(ACTOR)[0]).toBe(farmHost);
  });

  test("attach fails on BOTH the target and the source (fatal) → stop map_unsafe, actor unrecoverable", async () => {
    const { world, harness } = scene({ map2AttachFails: true, farmAttachFails: true });

    await drive(harness, world);
    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("FAILED");
    expect(world.stoppedMessage()?.reason).toBe("map_unsafe");
    expect(world.actorCount()).toBe(0); // exported from map1, attachable nowhere
  });
});
