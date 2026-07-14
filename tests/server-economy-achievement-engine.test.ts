import { describe, expect, test } from "vitest";
import {
  createAchievementService,
  evaluateAchievement,
  eventIndexFor,
  filterMatch,
  type AchDef,
  type AchievementLedgerSeam,
  type AchievementStoreSeam,
  type AchievementUnlockedView,
  type ProgressState,
  type SaveAchievementInput,
  type StoredAchievementProgress,
} from "../src/server/economy/achievement-engine";
import { ACHIEVEMENTS } from "../server/config/achievements";

// C2b — achievement tracking engine (never-downgrade zone: reward grants + combat-derived event fields).
// PURE evaluator tested against the real C2a shipping defs; the service is tested with mocked seams — ⛔ no DB.

/** the real shipping defs as the engine's structural view (id → def). */
function def(id: string): AchDef {
  const found = ACHIEVEMENTS.find((a) => a.id === id);
  if (!found) throw new Error(`unknown achievement ${id}`);
  return found as unknown as AchDef;
}

function initial(): ProgressState {
  return { currentValue: 0, distinctKeys: null, streakValue: 0, extra: {} };
}

/**
 * run a series of events through one def, threading progress. `completed` = did it complete at ANY event (the
 * service auto-claims on the first completion, so a later regression like a lower level does not "un-complete").
 */
function run(id: string, events: { type: string; payload?: Record<string, unknown>; nowMs?: number }[]) {
  const d = def(id);
  let state = initial();
  let completed = false;
  for (const e of events) {
    const res = evaluateAchievement(d, state, { type: e.type, payload: e.payload ?? {}, nowMs: e.nowMs ?? 0 });
    state = res.next;
    if (res.completed) completed = true;
  }
  return { state, completed };
}

// ── filters ──────────────────────────────────────────────────────────────────────────────────────────────
describe("filterMatch — exact + numeric-string patterns", () => {
  test("exact string / number / boolean match", () => {
    expect(filterMatch({ monsterId: "mon_map1_slime" }, { monsterId: "mon_map1_slime" })).toBe(true);
    expect(filterMatch({ monsterId: "mon_map1_bird" }, { monsterId: "mon_map1_slime" })).toBe(false);
    expect(filterMatch({ lastHitByPlayer: true }, { lastHitByPlayer: true })).toBe(true);
    expect(filterMatch({ hpFracBefore: 1 }, { hpFracBefore: 1.0 })).toBe(true);
  });
  test("'>300' overkill pattern", () => {
    expect(filterMatch({ overkillPct: 350 }, { overkillPct: ">300" })).toBe(true);
    expect(filterMatch({ overkillPct: 300 }, { overkillPct: ">300" })).toBe(false); // strict >
    expect(filterMatch({ overkillPct: 12 }, { overkillPct: ">300" })).toBe(false);
  });
  test("'<0.05' low-hp pattern", () => {
    expect(filterMatch({ playerHpFrac: 0.02 }, { playerHpFrac: "<0.05" })).toBe(true);
    expect(filterMatch({ playerHpFrac: 0.05 }, { playerHpFrac: "<0.05" })).toBe(false);
  });
  test("sameKey / sameCell directives are not equality filters", () => {
    expect(filterMatch({ npcId: "npc_x" }, { sameKey: "npcId" })).toBe(true);
    expect(filterMatch({ mapId: "map1" }, { sameCell: true })).toBe(true);
  });
});

// ── counter ─────────────────────────────────────────────────────────────────────────────────────────────
describe("counter rule", () => {
  test("plain occurrence count (ach_first_kill target 1)", () => {
    expect(run("ach_first_kill", [{ type: "mob.killed" }]).completed).toBe(true);
  });
  test("filtered count only counts matching payload (ach_slime_100)", () => {
    const evs = Array.from({ length: 100 }, () => ({ type: "mob.killed", payload: { monsterId: "mon_map1_slime" } }));
    // a non-slime kill in the middle must NOT count toward the slime target
    evs.splice(50, 0, { type: "mob.killed", payload: { monsterId: "mon_map1_bird" } });
    const r = run("ach_slime_100", evs);
    expect(r.state.currentValue).toBe(100);
    expect(r.completed).toBe(true);
  });
  test("valueField accumulation sums payload amount (ach_gold_earn_50k)", () => {
    const r = run("ach_gold_earn_50k", [
      { type: "gold.earned", payload: { amount: 20000 } },
      { type: "gold.earned", payload: { amount: 20000 } },
      { type: "gold.earned", payload: { amount: 10000 } },
    ]);
    expect(r.state.currentValue).toBe(50000);
    expect(r.completed).toBe(true);
  });
  test("sameKey groups per payload value — ANY group hitting target completes (ach_npc_100_same)", () => {
    // 60 talks to A + 100 talks to B → B's group completes even though the total is spread across two npcs
    const evs = [
      ...Array.from({ length: 60 }, () => ({ type: "npc.talk", payload: { npcId: "npc_a" } })),
      ...Array.from({ length: 100 }, () => ({ type: "npc.talk", payload: { npcId: "npc_b" } })),
    ];
    const r = run("ach_npc_100_same", evs);
    expect(r.completed).toBe(true);
    expect(r.state.currentValue).toBe(100); // best group
  });
  test("sameKey does NOT complete when spread across many small groups", () => {
    const evs = Array.from({ length: 100 }, (_v, i) => ({ type: "npc.talk", payload: { npcId: `npc_${i}` } }));
    expect(run("ach_npc_100_same", evs).completed).toBe(false);
  });
  test("sameCell groups by mapId+gridCell (ach_death_same_spot_10)", () => {
    const same = Array.from({ length: 10 }, () => ({ type: "death", payload: { mapId: "map1", gridCell: "5,5" } }));
    expect(run("ach_death_same_spot_10", same).completed).toBe(true);
    const spread = Array.from({ length: 10 }, (_v, i) => ({ type: "death", payload: { mapId: "map1", gridCell: `${i},0` } }));
    expect(run("ach_death_same_spot_10", spread).completed).toBe(false);
  });
});

// ── max_value ───────────────────────────────────────────────────────────────────────────────────────────
describe("max_value rule (monotonic)", () => {
  test("tracks the highest level, ignores regressions (ach_level_5)", () => {
    const r = run("ach_level_5", [
      { type: "level.up", payload: { newLevel: 3 } },
      { type: "level.up", payload: { newLevel: 5 } },
      { type: "level.up", payload: { newLevel: 2 } }, // regression ignored
    ]);
    expect(r.state.currentValue).toBe(5);
    expect(r.completed).toBe(true);
  });
  test("below target = not complete (ach_gold_1k)", () => {
    expect(run("ach_gold_1k", [{ type: "gold.balance", payload: { balance: 999 } }]).completed).toBe(false);
    expect(run("ach_gold_1k", [{ type: "gold.balance", payload: { balance: 1000 } }]).completed).toBe(true);
  });
});

// ── distinct_set ────────────────────────────────────────────────────────────────────────────────────────
describe("distinct_set rule", () => {
  test("distinct payload values, duplicates ignored (ach_map1_bestiary target 5)", () => {
    const ids = ["mon_map1_slime", "mon_map1_slime", "mon_map1_bird", "mon_map1_boar", "elite_map1_boar_rampage"];
    const r1 = run("ach_map1_bestiary", ids.map((monsterId) => ({ type: "mob.killed", payload: { monsterId } })));
    expect(r1.state.distinctKeys?.length).toBe(4); // the duplicate slime did not re-count
    expect(r1.completed).toBe(false);
    const r2 = run(
      "ach_map1_bestiary",
      [...ids, "boss_map1_boiling_boar"].map((monsterId) => ({ type: "mob.killed", payload: { monsterId } })),
    );
    expect(r2.state.distinctKeys?.length).toBe(5);
    expect(r2.completed).toBe(true);
  });
  test("value outside distinctAllowed is not counted", () => {
    const r = run("ach_all_phases", [
      { type: "phase.changed", payload: { phase: "noon" } }, // not in allowed
      { type: "phase.changed", payload: { phase: "dawn" } },
    ]);
    expect(r.state.distinctKeys).toEqual(["dawn"]);
  });
  test("eventType-synthetic distinct set spans multiple event TYPES (ach_all_systems target 5)", () => {
    const r = run("ach_all_systems", [
      { type: "enhance.success" },
      { type: "shop.buy" },
      { type: "shop.buy" }, // dup type ignored
      { type: "storage.deposit" },
      { type: "delivery.send" },
      { type: "npc.talk" },
    ]);
    expect(r.state.distinctKeys?.length).toBe(5);
    expect(r.completed).toBe(true);
  });
});

// ── streak ──────────────────────────────────────────────────────────────────────────────────────────────
describe("streak rule", () => {
  test("consecutive successes complete; a reset event zeroes the streak (ach_enh_streak5)", () => {
    expect(run("ach_enh_streak5", Array.from({ length: 5 }, () => ({ type: "enhance.success" }))).completed).toBe(true);
    const broken = run("ach_enh_streak5", [
      { type: "enhance.success" },
      { type: "enhance.success" },
      { type: "enhance.fail" }, // reset
      { type: "enhance.success" },
    ]);
    expect(broken.completed).toBe(false);
    expect(broken.state.streakValue).toBe(1);
  });
  test("fail streak resets on a success (ach_enh_fail10)", () => {
    const r = run("ach_enh_fail10", [
      ...Array.from({ length: 9 }, () => ({ type: "enhance.fail" })),
      { type: "enhance.success" }, // reset before hitting 10
      { type: "enhance.fail" },
    ]);
    expect(r.completed).toBe(false);
    expect(r.state.streakValue).toBe(1);
  });
});

// ── sequence ────────────────────────────────────────────────────────────────────────────────────────────
describe("sequence rule", () => {
  test("ordered steps within the window complete, matching sameKey across steps (ach_sell_buyback)", () => {
    const r = run("ach_sell_buyback", [
      { type: "shop.sell", payload: { itemId: "eq_x" }, nowMs: 1000 },
      { type: "shop.buy", payload: { itemId: "eq_x" }, nowMs: 20_000 }, // within 30s + same item
    ]);
    expect(r.completed).toBe(true);
  });
  test("sameKey mismatch across steps does not advance", () => {
    const r = run("ach_sell_buyback", [
      { type: "shop.sell", payload: { itemId: "eq_x" }, nowMs: 1000 },
      { type: "shop.buy", payload: { itemId: "eq_y" }, nowMs: 2000 }, // different item
    ]);
    expect(r.completed).toBe(false);
  });
  test("window expiry drops the sequence (ach_sell_buyback, 30s)", () => {
    const r = run("ach_sell_buyback", [
      { type: "shop.sell", payload: { itemId: "eq_x" }, nowMs: 1000 },
      { type: "shop.buy", payload: { itemId: "eq_x" }, nowMs: 40_000 }, // > 30s later
    ]);
    expect(r.completed).toBe(false);
  });
  test("re-anchoring on a fresh step-0 restarts the window (ach_return_town_1min)", () => {
    const r = run("ach_return_town_1min", [
      { type: "map.enter", payload: { mapId: "map1" }, nowMs: 0 },
      { type: "map.enter", payload: { mapId: "map1" }, nowMs: 120_000 }, // re-anchor (also step0), > window from first
      { type: "map.enter", payload: { mapId: "city-hub" }, nowMs: 150_000 }, // within 60s of the re-anchor
    ]);
    expect(r.completed).toBe(true);
  });
});

// ── composite ───────────────────────────────────────────────────────────────────────────────────────────
describe("composite rule", () => {
  test("all-of filters on one event (ach_boss_solo)", () => {
    expect(
      run("ach_boss_solo", [{ type: "mob.killed", payload: { rank: "boss", partySize: 1, damageSharePct: 100 } }]).completed,
    ).toBe(true);
    expect(
      run("ach_boss_solo", [{ type: "mob.killed", payload: { rank: "boss", partySize: 2, damageSharePct: 50 } }]).completed,
    ).toBe(false);
  });
  test("notOccurred poisons permanently once the guard event is seen (ach_die_before_kill)", () => {
    // die before any kill → complete
    expect(run("ach_die_before_kill", [{ type: "death" }]).completed).toBe(true);
    // kill first → poisoned → a later death can never complete
    const poisoned = run("ach_die_before_kill", [{ type: "mob.killed" }, { type: "death" }]);
    expect(poisoned.completed).toBe(false);
    expect(poisoned.state.extra?.poisoned).toBe(true);
  });
});

// ── time_accum ──────────────────────────────────────────────────────────────────────────────────────────
describe("time_accum rule", () => {
  test("accumulates fixed 1/event toward minute target, respecting filters (ach_rain_walk_30)", () => {
    const onMap = Array.from({ length: 30 }, () => ({ type: "weather.rain.tick", payload: { mapId: "map1" } }));
    expect(run("ach_rain_walk_30", onMap).completed).toBe(true);
    const offMap = Array.from({ length: 30 }, () => ({ type: "weather.rain.tick", payload: { mapId: "map2" } }));
    expect(run("ach_rain_walk_30", offMap).completed).toBe(false); // filtered out
  });
});

// ── eventIndexFor ───────────────────────────────────────────────────────────────────────────────────────
describe("eventIndexFor", () => {
  const index = eventIndexFor(ACHIEVEMENTS as unknown as AchDef[]);
  test("primary event routes to its def", () => {
    expect(index.get("mob.killed")?.some((d) => d.id === "ach_first_kill")).toBe(true);
  });
  test("streak resetEvent is indexed (ach_enh_streak5 listens to enhance.fail)", () => {
    expect(index.get("enhance.fail")?.some((d) => d.id === "ach_enh_streak5")).toBe(true);
  });
  test("composite notOccurredEvent is indexed (ach_die_before_kill listens to mob.killed)", () => {
    expect(index.get("mob.killed")?.some((d) => d.id === "ach_die_before_kill")).toBe(true);
  });
  test("sequence step events are indexed (ach_sell_buyback listens to shop.buy)", () => {
    expect(index.get("shop.buy")?.some((d) => d.id === "ach_sell_buyback")).toBe(true);
  });
  test("eventType distinct set indexes each allowed type (ach_all_systems listens to delivery.send)", () => {
    expect(index.get("delivery.send")?.some((d) => d.id === "ach_all_systems")).toBe(true);
  });
});

// ── service (DI with fakes) ─────────────────────────────────────────────────────────────────────────────
function fakeStore() {
  const rows = new Map<string, StoredAchievementProgress>();
  const saves: SaveAchievementInput[] = [];
  const seam: AchievementStoreSeam = {
    async load(scopeKey, achievementId) {
      return rows.get(`${scopeKey}:${achievementId}`) ?? null;
    },
    async save(input) {
      saves.push(input);
      rows.set(`${input.scopeKey}:${input.achievementId}`, {
        state: input.state,
        currentValue: input.currentValue,
        streakValue: input.streakValue,
        json: input.json,
        claimed: input.state === "claimed",
      });
    },
  };
  return { seam, saves, rows };
}

function fakeLedger() {
  const keys = new Set<string>();
  const calls: { amount: bigint; idempotencyKey: string; characterId: string }[] = [];
  let balance = 0n;
  const ledger: AchievementLedgerSeam = {
    async appendEntry(e) {
      calls.push({ amount: e.amount, idempotencyKey: e.idempotencyKey, characterId: e.characterId });
      if (keys.has(e.idempotencyKey)) return { status: "duplicate", balance };
      keys.add(e.idempotencyKey);
      balance += e.amount;
      return { status: "applied", balance };
    },
  };
  return { ledger, calls };
}

function serviceWith(over: Partial<Parameters<typeof createAchievementService>[0]> = {}) {
  return createAchievementService({
    defs: ACHIEVEMENTS as unknown as AchDef[],
    store: null,
    ledger: null,
    memory: new Map(),
    ...over,
  });
}

describe("createAchievementService — emit", () => {
  test("auto-claim + notify on completion (ach_first_kill, character scope)", async () => {
    const store = fakeStore();
    const notes: AchievementUnlockedView[] = [];
    const svc = serviceWith({ store: store.seam });
    await svc.emit({
      type: "mob.killed",
      payload: { monsterId: "mon_map1_slime" },
      characterId: "char1",
      accountId: "acc1",
      sessionId: "s1",
      nowMs: 1,
      notify: (m) => notes.push(m),
    });
    const row = store.rows.get("char1:ach_first_kill");
    expect(row?.state).toBe("claimed");
    expect(notes.some((n) => n.achievementId === "ach_first_kill")).toBe(true);
  });

  test("gold reward granted once via ledger; a second complete never double-grants", async () => {
    const store = fakeStore();
    const led = fakeLedger();
    const svc = serviceWith({ store: store.seam, ledger: led.ledger });
    // ach_level_5 = max_value newLevel≥5, character scope, gold 30
    await svc.emit({ type: "level.up", payload: { newLevel: 5 }, characterId: "char1", accountId: "acc1", nowMs: 1 });
    await svc.emit({ type: "level.up", payload: { newLevel: 6 }, characterId: "char1", accountId: "acc1", nowMs: 2 });
    const goldCalls = led.calls.filter((c) => c.idempotencyKey === "achievement:char1:ach_level_5");
    expect(goldCalls).toHaveLength(1); // claimed-state gate stops the 2nd evaluation entirely
    expect(goldCalls[0].amount).toBe(30n);
  });

  test("account-scope resolves by accountId; character-scope by characterId; missing id skips", async () => {
    const store = fakeStore();
    const svc = serviceWith({ store: store.seam });
    // ach_storage_first = counter storage.deposit target 1, ACCOUNT scope
    await svc.emit({ type: "storage.deposit", payload: {}, characterId: "char1", accountId: "acc1", nowMs: 1 });
    expect(store.rows.get("acc1:ach_storage_first")?.state).toBe("claimed");
    // no accountId → account-scoped def cannot track (skipped, no row)
    const store2 = fakeStore();
    const svc2 = serviceWith({ store: store2.seam });
    await svc2.emit({ type: "storage.deposit", payload: {}, characterId: "char1", nowMs: 1 });
    expect(store2.rows.get("acc1:ach_storage_first")).toBeUndefined();
    expect([...store2.rows.keys()].some((k) => k.includes("ach_storage_first"))).toBe(false);
  });

  test("in-progress persists between emits (in-memory fallback threads state)", async () => {
    const mem = new Map<string, StoredAchievementProgress>();
    const svc = serviceWith({ memory: mem });
    // ach_slime_100 needs 100 — two kills leaves it in_progress at 2
    await svc.emit({ type: "mob.killed", payload: { monsterId: "mon_map1_slime" }, characterId: "c1", accountId: "a1", nowMs: 1 });
    await svc.emit({ type: "mob.killed", payload: { monsterId: "mon_map1_slime" }, characterId: "c1", accountId: "a1", nowMs: 2 });
    const row = mem.get("c1:ach_slime_100");
    expect(row?.currentValue).toBe(2);
    expect(row?.state).toBe("in_progress");
  });

  test("expanded-phase defs are never processed", async () => {
    const store = fakeStore();
    const svc = serviceWith({ store: store.seam });
    // ach_map_2 (expanded) listens to map.enter{mapId:map2}
    await svc.emit({ type: "map.enter", payload: { mapId: "map2" }, characterId: "c1", accountId: "a1", nowMs: 1 });
    expect(store.rows.get("c1:ach_map_2")).toBeUndefined();
  });

  test("client-reported rate limit drops beyond 10/min/type (§13)", async () => {
    const store = fakeStore();
    const svc = serviceWith({ store: store.seam });
    // fire 15 distinct npc.talk (sameKey grouping means each npc is its own group; well under any target)
    for (let i = 0; i < 15; i++) {
      await svc.emit({
        type: "npc.talk",
        payload: { npcId: "npc_lungdeung" },
        characterId: "c1",
        accountId: "a1",
        sessionId: "s1",
        nowMs: 1000 + i,
        clientReported: true,
      });
    }
    // ach_npc_lungdeung_50 counts npc.talk{npcId:npc_lungdeung}; only 10 got through the bucket
    expect(store.rows.get("c1:ach_npc_lungdeung_50")?.currentValue).toBe(10);
  });

  test("server-reported events bypass the rate limit", async () => {
    const store = fakeStore();
    const svc = serviceWith({ store: store.seam });
    for (let i = 0; i < 15; i++) {
      await svc.emit({
        type: "npc.talk",
        payload: { npcId: "npc_lungdeung" },
        characterId: "c1",
        accountId: "a1",
        sessionId: "s1",
        nowMs: 1000 + i,
        clientReported: false,
      });
    }
    expect(store.rows.get("c1:ach_npc_lungdeung_50")?.currentValue).toBe(15);
  });
});
