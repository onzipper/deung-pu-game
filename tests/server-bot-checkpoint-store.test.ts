import { describe, expect, test } from "vitest";
import { FakeWorld, warpConfig } from "./helpers/warp-world";
import { BotManager, type BotManagerDeps } from "../server/bot/manager";
import type { BotHost, BotRuntime } from "../server/bot/runtime";
import type { ProfileRepo } from "../server/bot/profiles";
import type {
  BotCheckpointRow,
  BotCheckpointUpsert,
  CheckpointRepo,
  SessionRepo,
  TierRepo,
} from "../server/bot/store";
import type { BotProfileRow, BotTierStateRow } from "../server/bot/types";
import type { BotTier } from "../server/config/bot";

// PR6a (D-067) — durable checkpoint persistence hooks, driven through the REAL BotManager + BotRuntime over the
// FakeWorld with an injected fake CheckpointRepo. Four write-behind hooks under test:
//   (1) a ready takeover checkpoint upserts kind='takeover' — Pro only (any other tier persists nothing);
//   (2) a live Pro run upserts kind='running' on its flush cadence — Plus never does;
//   (3) a graceful server_restart shutdown upserts a final running snapshot for a Pro run — Plus never does;
//   (4) a successful start clears the durable row (delete).
// The in-process behavior of every tier is unchanged — persistence is best-effort on top of it.

const ACTOR = "actor:real";
const ACCOUNT = "account-a";
const CHARACTER = "character-a";

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

function fakeCheckpointRepo() {
  const rows = new Map<string, BotCheckpointRow>();
  const upserts: BotCheckpointUpsert[] = [];
  const removes: string[] = [];
  const repo: CheckpointRepo = {
    get: async (accountId) => rows.get(accountId) ?? null,
    upsert: async (row) => {
      upserts.push(row);
      rows.set(row.accountId, { ...row, updatedAt: row.savedAt });
    },
    remove: async (accountId) => {
      removes.push(accountId);
      rows.delete(accountId);
    },
    markRunningAsRestart: async () => {
      let n = 0;
      for (const [k, r] of rows) {
        if (r.kind === "running") {
          rows.set(k, { ...r, kind: "restart", state: "ready" });
          n += 1;
        }
      }
      return n;
    },
  };
  return {
    repo,
    upserts,
    removes,
    kinds: () => upserts.map((u) => u.kind),
    lastUpsert: () => upserts.at(-1),
  };
}

function scene(opts: { tier: BotTier }) {
  const world = new FakeWorld({ actorId: ACTOR, gold: 20, buyPrice: 18, bag: [] });
  const farmHost = world.addHost({ roomId: "room-farm", mapId: "map1" });
  farmHost.players.add(ACTOR);

  let clock = 100_000;
  const send = (type: string, message: unknown) => world.messages.push({ type, message });

  const tierRow: BotTierStateRow = {
    accountId: ACCOUNT,
    tier: opts.tier,
    passExpiresAt: 10_000_000_000,
    updatedAt: 0,
  };
  const profileRepo: ProfileRepo = {
    listByAccount: async (a) => (a === ACCOUNT ? [PROFILE] : []),
    getById: async (a, id) => (a === ACCOUNT && id === PROFILE.id ? PROFILE : null),
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
  const cp = fakeCheckpointRepo();
  const deps: BotManagerDeps = {
    config: warpConfig(),
    tierRepo,
    profileRepo,
    sessionRepo,
    checkpointRepo: cp.repo,
    rarityOf: () => undefined,
    dbAvailable: () => true,
    now: () => clock,
  };
  const manager = new BotManager(deps);
  (manager as unknown as { acquireHostForMap: (m: string) => Promise<BotHost | null> }).acquireHostForMap =
    world.acquireHostForMap;
  manager.registerRoom(farmHost);

  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return {
    world,
    farmHost,
    manager,
    send,
    cp,
    advanceClock: (ms: number) => {
      clock += ms;
    },
    flush,
    start: () => manager.onStart(farmHost, "controller-1", ACCOUNT, CHARACTER, send, { profileId: PROFILE.id }),
    runtime: () => (manager as unknown as { bots: Map<string, BotRuntime> }).bots.get(ACCOUNT),
    onTakeover: () => manager.onTakeover(ACCOUNT, ACTOR, send, { requestId: "tk", source: "move" }),
  };
}

async function settle(s: ReturnType<typeof scene>): Promise<void> {
  for (let i = 0; i < 5; i++) await s.flush();
}

describe("PR6a checkpoint persistence — hook 1: takeover settle (Pro only)", () => {
  test("a ready Pro takeover checkpoint upserts kind='takeover' state='ready'", async () => {
    const s = scene({ tier: "pro" });
    await s.start();
    s.cp.upserts.length = 0; // ignore the start's clear-delete; assert on the takeover upsert only

    expect(s.onTakeover()).toBe(true);
    await settle(s);

    const upsert = s.cp.upserts.find((u) => u.kind === "takeover");
    expect(upsert).toBeDefined();
    expect(upsert).toMatchObject({
      accountId: ACCOUNT,
      characterId: CHARACTER,
      profileId: PROFILE.id,
      kind: "takeover",
      state: "ready",
      mapId: "map1",
      pocketId: "A",
    });
  });

  test("a Plus takeover checkpoint persists NOTHING (in-process settle only)", async () => {
    const s = scene({ tier: "plus" });
    await s.start();
    s.cp.upserts.length = 0;

    expect(s.onTakeover()).toBe(true);
    await settle(s);

    expect(s.cp.upserts.filter((u) => u.kind === "takeover")).toHaveLength(0);
  });
});

describe("PR6a checkpoint persistence — hook 2: periodic running snapshot", () => {
  test("a Pro run upserts kind='running' on the flush cadence", async () => {
    const s = scene({ tier: "pro" });
    await s.start();
    await settle(s);
    s.cp.upserts.length = 0;

    s.runtime()!.tick(30_000); // past sessionFlushIntervalMs → flush + persist running snapshot
    await settle(s);

    const running = s.cp.upserts.find((u) => u.kind === "running");
    expect(running).toBeDefined();
    expect(running).toMatchObject({ accountId: ACCOUNT, kind: "running", state: "ready", mapId: "map1", pocketId: "A" });
  });

  test("a Plus run never persists a running snapshot", async () => {
    const s = scene({ tier: "plus" });
    await s.start();
    await settle(s);
    s.cp.upserts.length = 0;

    s.runtime()!.tick(30_000);
    await settle(s);

    expect(s.cp.upserts.filter((u) => u.kind === "running")).toHaveLength(0);
  });
});

describe("PR6a checkpoint persistence — hook 3: graceful shutdown", () => {
  test("a Pro run's server_restart stop persists a final running snapshot before settling", async () => {
    const s = scene({ tier: "pro" });
    await s.start();
    await settle(s);
    s.cp.upserts.length = 0;

    s.manager.unregisterRoom(s.farmHost); // disposes the host → stop('server_restart') for its bots
    await settle(s);

    expect(s.cp.upserts.some((u) => u.kind === "running")).toBe(true);
  });

  test("a Plus run's server_restart stop persists nothing", async () => {
    const s = scene({ tier: "plus" });
    await s.start();
    await settle(s);
    s.cp.upserts.length = 0;

    s.manager.unregisterRoom(s.farmHost);
    await settle(s);

    expect(s.cp.upserts).toHaveLength(0);
  });
});

describe("PR6a checkpoint persistence — hook 4: start clears the durable row", () => {
  test("a successful start deletes the account's durable checkpoint row", async () => {
    const s = scene({ tier: "pro" });
    await s.start();
    await settle(s);

    expect(s.cp.removes).toContain(ACCOUNT);
  });
});
