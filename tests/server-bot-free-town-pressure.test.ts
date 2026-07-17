import { describe, expect, test, vi } from "vitest";
import { createWarpHarness, FakeWorld, warpConfig, type BagSeed } from "./helpers/warp-world";
import type { Vec2 } from "../server/bot/agent";
import type { BotRulesV1 } from "../server/bot/types";
import type { BotAttackOutcome } from "../server/bot/runtime";
import type { BotConfig, BotTier } from "../server/config/bot";

// M2a (D-073) — Free proactive town-trip pressure. A Free bot now WALKS to town proactively (before a hard 40/40
// overflow or a floor stop) when potions run low / the bag is nearly full / hp is low with no potion to drink.
// Drives the REAL BotRuntime over a walk-capable FakeWorld (paid tiers warp on the same triggers; see runRecovery).
// Free still has NO death recovery and NO pocket fallback (tier boundary D-063/D-067) — those live elsewhere.

const ACTOR = "actor:real";
const FARM_START: Vec2 = { tx: 20, ty: 18 };
const FARM_PORTAL: Vec2 = { tx: 20, ty: 1 };
const TOWN_LANDING: Vec2 = { tx: 16, ty: 27 };
const TOWN_CAMP: Vec2 = { tx: 16, ty: 20 };
const TOWN_PORTAL: Vec2 = { tx: 16, ty: 31 };
const FARM_LANDING: Vec2 = { tx: 20, ty: 5 };

const POTION = "con_small_potion";
const POTION_RULES: BotRulesV1 = { skillSlots: [0], potionThresholdPct: 50, lootAll: true };
const NO_POTION_RULES: BotRulesV1 = { skillSlots: [0], potionThresholdPct: null, lootAll: true };

function clean(): BotAttackOutcome {
  return { killed: 1, gold: 0, exp: 0, loot: [], bagOverflowed: false, overflow: [], leveledUp: false };
}

/** `n` slot-occupying junk instances (non-sellable, non-deliverable) — drives freeSlots down without a potion. */
function junk(n: number): BagSeed[] {
  return Array.from({ length: n }, (_, i) => ({
    instanceId: `junk-${i}`,
    itemId: "mat_junk",
    rarity: "common",
    sellPrice: null,
    deliverable: false,
  }));
}
/** one potion stack of `qty` (the runtime sums quantity of non-equipped town potions). */
function potions(qty: number): BagSeed[] {
  return qty > 0 ? [{ instanceId: "pot", itemId: POTION, quantity: qty, rarity: "common", sellPrice: 18, deliverable: true }] : [];
}

interface SceneOptions {
  tier?: BotTier;
  rules?: BotRulesV1;
  bag?: BagSeed[];
  hp?: () => number;
  config?: BotConfig;
  initialTownTrip?: boolean;
}

function scene(opts: SceneOptions = {}) {
  const world = new FakeWorld({ actorId: ACTOR, gold: 100, buyPrice: 18, bag: opts.bag ?? [] });
  const farmHost = world.addHost({
    roomId: "room-farm",
    mapId: "map1",
    safeCamp: { tx: 20, ty: 6 },
    walk: { start: { ...FARM_START }, step: 6 },
    exits: [{ targetMapId: "city-hub", approach: { ...FARM_PORTAL }, landing: { ...TOWN_LANDING } }],
    mobs: () => [{ id: "m1", mobType: "slime", tx: FARM_START.tx, ty: FARM_START.ty, hp: 10, pocketId: "A" }],
    attack: async () => clean(),
    hpFraction: opts.hp,
  });
  farmHost.players.add(ACTOR); // the actor starts materialized on the farm.
  const townHost = world.addHost({
    roomId: "room-town",
    mapId: "city-hub",
    safeCamp: { ...TOWN_CAMP },
    walk: { start: { ...TOWN_LANDING }, step: 6 },
    exits: [{ targetMapId: "map1", approach: { ...TOWN_PORTAL }, landing: { ...FARM_LANDING } }],
  });
  const harness = createWarpHarness({
    world,
    farmHost,
    tier: opts.tier ?? "free",
    rules: opts.rules ?? NO_POTION_RULES,
    config: opts.config ?? warpConfig(),
    initialTownTrip: opts.initialTownTrip,
  });
  return { world, farmHost, townHost, harness };
}

const triggers = (spy: ReturnType<typeof vi.spyOn>): string[] =>
  spy.mock.calls.map((c: unknown[]) => c[0] as string);

describe("Free proactive town pressure — potion_low (D-073)", () => {
  test("potions at the reserve → beginTownTrip('potion_low'), walk trip starts", async () => {
    const { harness } = scene({ rules: POTION_RULES, bag: [...potions(1), ...junk(2)] }); // freeSlots 37, 1 potion
    const spy = vi.spyOn(harness.runtime, "beginTownTrip");

    await harness.tickAndSettle(); // farm tick 1 — samples the bag (async read resolves on the flush)
    await harness.tickAndSettle(); // tick 2 — sample present, potions ≤ reserve → potion_low

    expect(triggers(spy)).toContain("potion_low");
    expect(harness.state()).toBe("RETURNING_TO_TOWN");
    expect(harness.runtime.isStopped).toBe(false);
  });

  test("D-075 follow-up: a fresh actor (auto-potion on, 0 potions, full HP) FARMS — no potion_low bootstrap trip", async () => {
    // The bug this locks: F1 default-on 30% + potionCount 0 ≤ reserve + F4 no cooldown dragged a brand-new broke
    // character to town on the first bag read and parked it (never farmed). "ยาหมดแล้ว → ไปซื้อ", not "ไม่มียา = ห้ามฟาร์ม".
    let hp = 1;
    const { harness } = scene({ rules: POTION_RULES, bag: junk(2), hp: () => hp }); // freeSlots 38, 0 potions, full HP
    const spy = vi.spyOn(harness.runtime, "beginTownTrip");

    for (let i = 0; i < 4; i++) await harness.tickAndSettle(); // bag sampled (0 potions) → keeps farming, no trip
    expect(triggers(spy)).not.toContain("potion_low");
    expect(harness.state()).not.toBe("RETURNING_TO_TOWN");
    expect(harness.runtime.isStopped).toBe(false);

    hp = 0.3; // HP finally falls to/below the drink threshold with no potion in the bag → the hp_no_potion path opens
    await harness.tickAndSettle();
    expect(triggers(spy)).toContain("hp_no_potion");
    expect(triggers(spy)).not.toContain("potion_low"); // still never a bootstrap potion_low
  });
});

describe("Free proactive town pressure — bag_pressure (D-073)", () => {
  test("free slots at/below the pressure floor → beginTownTrip('bag_pressure')", async () => {
    const { harness } = scene({ rules: NO_POTION_RULES, bag: junk(36) }); // freeSlots 4 ≤ pressureMinFreeSlots 5
    const spy = vi.spyOn(harness.runtime, "beginTownTrip");

    await harness.tickAndSettle();
    await harness.tickAndSettle();

    expect(triggers(spy)).toContain("bag_pressure");
    expect(harness.state()).toBe("RETURNING_TO_TOWN");
    expect(harness.runtime.isStopped).toBe(false);
  });
});

describe("Free proactive town pressure — hp_no_potion (D-073)", () => {
  test("out of potions + hp low → beginTownTrip('hp_no_potion'), walks to restock (not a stop)", async () => {
    let hp = 1;
    const { harness } = scene({ rules: NO_POTION_RULES, bag: junk(2), hp: () => hp }); // freeSlots 38, 0 potions
    const spy = vi.spyOn(harness.runtime, "beginTownTrip");

    await harness.tickAndSettle(); // hp 1 → sample the bag, no trigger yet
    hp = 0.1; // ≤ the low-hp floor with no potion to drink
    await harness.tickAndSettle();

    expect(triggers(spy)).toContain("hp_no_potion");
    expect(harness.state()).toBe("RETURNING_TO_TOWN"); // walked to restock instead of stopping
    expect(harness.runtime.isStopped).toBe(false);
  });

  test("hp_no_potion but the trip is refused at/below the floor → stop low_hp (never farm to death)", async () => {
    let hp = 1;
    const { world, harness } = scene({
      rules: NO_POTION_RULES,
      bag: junk(2),
      hp: () => hp,
      config: warpConfig({ enabledTiers: ["plus", "pro"] }), // Free not enabled → beginTownTrip refuses
    });
    const spy = vi.spyOn(harness.runtime, "beginTownTrip");

    await harness.tickAndSettle(); // hp 1 → sample the bag
    hp = 0.1;
    await harness.tickAndSettle();

    expect(triggers(spy)).toContain("hp_no_potion"); // a proactive trip WAS attempted first
    expect(harness.runtime.isStopped).toBe(true);
    expect(world.stoppedMessage()?.reason).toBe("low_hp");
  });
});

describe("Free proactive preflight (D-073)", () => {
  test("initialTownTrip opens a walk town trip on the first Free tick before farming a mob", async () => {
    const { farmHost, harness } = scene({ rules: NO_POTION_RULES, bag: junk(37), initialTownTrip: true });
    const spy = vi.spyOn(harness.runtime, "beginTownTrip");
    expect(harness.state()).toBe("WORKING");

    await harness.tickAndSettle(); // first Free tick → preflight → beginTownTrip("preflight") → walk out begins

    expect(triggers(spy)).toContain("preflight");
    expect(harness.state()).toBe("RETURNING_TO_TOWN");
    expect(farmHost.calls.attack).toBe(0); // never farmed a mob
    expect(harness.runtime.isStopped).toBe(false);
  });
});

describe("paid tiers warp on the same proactive triggers (D-073)", () => {
  test("a Plus bot bag_pressure begins a WARP town trip (same trigger; warp, not walk)", async () => {
    const { world, townHost, harness } = scene({ tier: "plus", rules: NO_POTION_RULES, bag: junk(36) });
    const spy = vi.spyOn(harness.runtime, "beginTownTrip");

    await harness.tickAndSettle(); // paid farm tick 1 — samples the bag
    await harness.tickAndSettle(); // tick 2 — free slots ≤ floor → bag_pressure (via runRecoveryFarm baseline)

    expect(triggers(spy)).toContain("bag_pressure");
    expect(harness.state()).toBe("RETURNING_TO_TOWN");

    await harness.tickAndSettle(); // warp_out — instant server-owned transfer (proves warp, not a Free walk)
    expect(world.hostsContaining(ACTOR)[0]).toBe(townHost);
  });
});

describe("Free bag-sample cadence (D-073)", () => {
  test("botBagItems is sampled on the pressure cadence, NOT every tick", async () => {
    const { farmHost, harness } = scene({ rules: NO_POTION_RULES, bag: junk(3) }); // comfortable → no trip
    const ticks = 20;
    for (let i = 0; i < ticks; i++) await harness.tickAndSettle();

    expect(harness.runtime.isStopped).toBe(false);
    expect(harness.state()).not.toBe("RETURNING_TO_TOWN"); // comfortable bag + full hp + no rule → never tripped
    expect(farmHost.calls.bagItems).toBeGreaterThanOrEqual(1); // sampled at least once
    expect(farmHost.calls.bagItems).toBeLessThan(ticks); // but NOT every tick — proves the cadence guard
    expect(farmHost.calls.bagItems).toBeLessThanOrEqual(4); // ~3 samples over 20 × 2s ticks at the 15s cadence
  });
});
