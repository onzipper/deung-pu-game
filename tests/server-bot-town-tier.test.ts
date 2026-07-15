import { describe, expect, test } from "vitest";
import { createWarpHarness, FakeWorld, warpConfig, type BagSeed } from "./helpers/warp-world";
import { DEFAULT_BOT_CONFIG, type BotConfig, type BotTier } from "../server/config/bot";
import type { AgentMob, Vec2 } from "../server/bot/agent";
import type { BotAttackOutcome } from "../server/bot/runtime";

// PR5 Phase C (D-069/D-070) — town-trip cooldown gate + tier-expiry/death boundaries. Drives the REAL BotRuntime
// over the FakeWorld (one character-scoped economy across sibling hosts). D-069 locked semantics under test:
//   • trip cooldown = config.townTrip.cooldownMs between trips (a fresh overflow inside the window safe-stops).
//   • tier expiry mid-trip → remaining paid transactions skipped, the return warp still runs (actor safety ≠ paid
//     value), then stop("expired_readonly") → WAITING_FOR_OWNER.
//   • a death in the outbound window settles death with no transfer and no duplicate actor.
// Invariant re-asserted after every tick: the single actor is materialized in exactly ONE host (Σ === 1).

const ACTOR = "actor:real";
const MOB_A: AgentMob = { id: "m1", mobType: "slime", tx: 0, ty: 0, hp: 10, pocketId: "A" };

function overflowOutcome(): BotAttackOutcome {
  return { killed: 1, gold: 0, exp: 0, loot: [], bagOverflowed: true, overflow: [], leveledUp: false };
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

/** warpConfig (townTrip knobs) plus a recovery override so a test can force the throttled tier recheck. */
function tierConfig(
  townOver: Partial<BotConfig["townTrip"]> = {},
  recoveryOver: Partial<BotConfig["recovery"]> = {},
): BotConfig {
  const base = warpConfig(townOver);
  return { ...base, recovery: { ...base.recovery, ...recoveryOver } };
}

interface SceneOptions {
  tier?: BotTier;
  gold?: number;
  config?: BotConfig;
  attack?: (target: Vec2) => Promise<BotAttackOutcome>;
  mobs?: () => AgentMob[];
  resolveTier?: () => Promise<BotTier>;
}

function scene(opts: SceneOptions = {}) {
  const world = new FakeWorld({ actorId: ACTOR, gold: opts.gold ?? 20, buyPrice: 18, bag: tripBag() });
  const farmHost = world.addHost({
    roomId: "room-farm",
    mapId: "map1",
    mobs: opts.mobs ?? (() => [MOB_A]),
    attack: opts.attack ?? (async () => overflowOutcome()),
  });
  farmHost.players.add(ACTOR);
  const townHost = world.addHost({ roomId: "room-town", mapId: "city-hub" });
  const harness = createWarpHarness({
    world,
    farmHost,
    tier: opts.tier ?? "plus",
    config: opts.config ?? warpConfig(),
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

describe("town-trip cooldown gate (D-069)", () => {
  test("within cooldownMs a fresh overflow refuses a second trip and safe-stops inventory_full", async () => {
    const { world, harness } = scene({ tier: "plus" });

    await driveToWorking(harness); // first overflow → full trip → home; markTripComplete arms the cooldown
    expect(harness.state()).toBe("WORKING");
    expect(harness.runtime.isStopped).toBe(false);
    const acquiresAfterTrip = world.acquireCalls.length;

    harness.advanceClock(DEFAULT_BOT_CONFIG.townTrip.cooldownMs - 1); // still inside the cooldown window
    for (let i = 0; i < 12 && !harness.runtime.isStopped; i++) await harness.tickAndSettle();

    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(world.stoppedMessage()?.reason).toBe("inventory_full");
    expect(world.acquireCalls.length).toBe(acquiresAfterTrip); // refused before any acquire → no second warp
  });

  test("past cooldownMs a fresh overflow is allowed to open a second trip", async () => {
    const { world, harness } = scene({ tier: "plus" });

    await driveToWorking(harness); // first trip home; cooldown armed at the (constant) clock
    expect(harness.state()).toBe("WORKING");

    harness.advanceClock(DEFAULT_BOT_CONFIG.townTrip.cooldownMs + 1); // step past the cooldown
    await harness.tickAndSettle(); // overflow → beginTownTrip allowed → RETURNING_TO_TOWN

    expect(harness.runtime.isStopped).toBe(false);
    expect(harness.state()).toBe("RETURNING_TO_TOWN");
    expect(world.actorCount()).toBe(1);
  });
});

describe("town-trip tier expiry (D-069)", () => {
  test("expiry mid-SELLING skips the remaining paid tx, still returns home, stops expired_readonly", async () => {
    let tierNow: BotTier = "plus";
    const { world, farmHost, townHost, harness } = scene({
      tier: "plus",
      config: tierConfig({}, { tierRecheckIntervalMs: 1_000 }),
      resolveTier: async () => tierNow,
    });

    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);
    const counts: number[] = [];
    for (let i = 0; i < 20; i++) {
      await harness.tickAndSettle();
      counts.push(world.actorCount());
      if (harness.state() === "SELLING") break;
    }
    expect(harness.state()).toBe("SELLING");
    expect(world.hostsContaining(ACTOR)[0]).toBe(townHost); // warped out to the city-hub

    tierNow = "free"; // the pass lapses mid-trip; the throttled recheck fires on the next tick
    for (let i = 0; i < 30 && !harness.runtime.isStopped; i++) {
      await harness.tickAndSettle();
      counts.push(world.actorCount());
    }

    for (const c of counts) expect(c).toBe(1); // Σ hosts containing the actor === 1 after every tick
    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(world.stoppedMessage()?.reason).toBe("expired_readonly");
    // remaining paid transactions skipped (deposit + restock never ran) …
    expect(townHost.calls.deposit).toHaveLength(0);
    expect(townHost.calls.buy).toHaveLength(0);
    // … but the return warp still ran: actor safety is not paid value.
    expect(world.hostsContaining(ACTOR)[0]).toBe(farmHost);
  });

  test("expiry during warp_out (before transfer) stops expired_readonly at the farm — no transfer", async () => {
    let tierNow: BotTier = "plus";
    const { world, farmHost, townHost, harness } = scene({
      tier: "plus",
      config: tierConfig({}, { tierRecheckIntervalMs: 1_000 }),
      resolveTier: async () => tierNow,
    });

    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);
    tierNow = "free"; // lapses before the first warp tick; the recheck aborts before the transfer runs
    await harness.tickAndSettle();

    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(world.stoppedMessage()?.reason).toBe("expired_readonly");
    expect(farmHost.calls.export).toBe(0); // never exported → no transfer
    expect(townHost.calls.attach).toBe(0);
    expect(world.actorCount()).toBe(1);
    expect(world.hostsContaining(ACTOR)[0]).toBe(farmHost);
  });
});

describe("town-trip outbound death (D-069)", () => {
  test("actor death in the outbound window stops death with no transfer and no duplicate actor", async () => {
    const { world, farmHost, townHost, harness } = scene({ tier: "plus" });

    expect(harness.runtime.beginTownTrip("bag_full")).toBe(true);
    harness.runtime.onActorDied(); // between begin and the first warp tick

    expect(harness.runtime.isStopped).toBe(true);
    expect(world.stoppedMessage()?.reason).toBe("death");

    await harness.tickAndSettle(); // a post-death tick must not transfer (tick is a no-op once stopped)
    expect(farmHost.calls.export).toBe(0);
    expect(townHost.calls.reserve).toBe(0);
    expect(townHost.calls.attach).toBe(0);
    expect(world.actorCount()).toBe(1);
    expect(world.hostsContaining(ACTOR)[0]).toBe(farmHost);
  });
});
