import { describe, expect, test } from "vitest";
import { FakeWorld, warpConfig } from "./helpers/warp-world";
import { BotManager, type BotManagerDeps } from "../server/bot/manager";
import type { BotHost, BotRuntime } from "../server/bot/runtime";
import type { ProfileRepo } from "../server/bot/profiles";
import type {
  BotCheckpointRow,
  CheckpointRepo,
  SessionRepo,
  TierRepo,
} from "../server/bot/store";
import type { BotProfileRow, BotSessionRow, BotTierStateRow } from "../server/bot/types";
import type { BotTier } from "../server/config/bot";
import {
  MSG_BOT_CHECKPOINT,
  MSG_BOT_OP_RESULT,
  type BotCheckpointMessage,
  type BotOpResultMessage,
} from "../src/shared/net-protocol";

// PR6a (D-067 · Runtime Bot doc §0.0) — validated restart resume. A durable checkpoint that survived a server
// restart resumes for PRO ONLY; Free/Plus safe-stop. Resume is a NEW run through the same `startReserved` flow
// (WORKING revision 0, live re-validation) — the interrupted continuity is diagnostic and never replayed. Boot
// converts every running snapshot into a restart candidate. Driven through the REAL BotManager over the FakeWorld.

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

/** A durable checkpoint as it looks AFTER a restart boot sweep (kind='restart', ready). Diagnostic continuity. */
function restartRow(over: Partial<BotCheckpointRow> = {}): BotCheckpointRow {
  return {
    accountId: ACCOUNT,
    id: "cp-restart-1",
    characterId: CHARACTER,
    profileId: PROFILE.id,
    sourceSessionId: "old-session-1",
    mapId: "map1",
    pocketId: "A",
    kind: "restart",
    state: "ready",
    continuity: { state: "COMBAT", revision: 7, enteredAt: 1_000, interruptedState: null },
    savedAt: 90_000,
    updatedAt: 90_000,
    ...over,
  };
}

function fakeCheckpointRepo(seed?: BotCheckpointRow) {
  const rows = new Map<string, BotCheckpointRow>();
  if (seed) rows.set(seed.accountId, seed);
  const removes: string[] = [];
  const repo: CheckpointRepo = {
    get: async (accountId) => rows.get(accountId) ?? null,
    upsert: async (row) => {
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
  return { repo, rows, removes, get: () => rows.get(ACCOUNT) ?? null };
}

function scene(opts: { tier: BotTier; seed?: BotCheckpointRow }) {
  const world = new FakeWorld({ actorId: ACTOR, gold: 20, buyPrice: 18, bag: [] });
  const farmHost = world.addHost({ roomId: "room-farm", mapId: "map1" });
  farmHost.players.add(ACTOR); // the real actor is materialized on the farm (a fresh process, no bot attached)

  const clock = 100_000;
  const send = (type: string, message: unknown) => world.messages.push({ type, message });

  const tierRow: BotTierStateRow = {
    accountId: ACCOUNT,
    tier: opts.tier,
    passExpiresAt: 10_000_000_000,
    updatedAt: 0,
  };
  const inserted: BotSessionRow[] = [];
  const profileRepo: ProfileRepo = {
    listByAccount: async (a) => (a === ACCOUNT ? [PROFILE] : []),
    getById: async (a, id) => (a === ACCOUNT && id === PROFILE.id ? PROFILE : null),
    insert: async () => undefined,
    update: async () => undefined,
    remove: async () => undefined,
  };
  const tierRepo: TierRepo = { get: async () => tierRow, upsert: async () => undefined };
  const sessionRepo: SessionRepo = {
    insert: async (row) => {
      inserted.push(row);
    },
    patch: async () => undefined,
    listByAccount: async () => [],
    getById: async () => null,
    markOpenAsRestart: async () => 0,
  };
  const cp = fakeCheckpointRepo(opts.seed);
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

  return {
    world,
    farmHost,
    manager,
    send,
    cp,
    inserted,
    runtime: () => (manager as unknown as { bots: Map<string, BotRuntime> }).bots.get(ACCOUNT),
    profileList: () => manager.onProfileList(ACCOUNT, send),
    resume: (checkpointId: string, characterId = CHARACTER) =>
      manager.onResume(farmHost, "controller-1", ACCOUNT, characterId, send, { checkpointId }),
    lastOpResult: () =>
      [...world.messages].reverse().find((m) => m.type === MSG_BOT_OP_RESULT)?.message as
        | BotOpResultMessage
        | undefined,
    lastCheckpointMsg: () =>
      [...world.messages].reverse().find((m) => m.type === MSG_BOT_CHECKPOINT)?.message as
        | BotCheckpointMessage
        | undefined,
  };
}

describe("PR6a boot sweep — running snapshots become restart candidates", () => {
  test("onBoot marks a surviving running checkpoint as kind='restart' state='ready'", async () => {
    const running = restartRow({ kind: "running", state: "ready" });
    const s = scene({ tier: "pro", seed: running });

    await s.manager.onBoot();

    const row = s.cp.get();
    expect(row?.kind).toBe("restart");
    expect(row?.state).toBe("ready");
  });
});

describe("PR6a restart resume — Pro", () => {
  test("resumes as a NEW run at WORKING revision 0, no world command from the interrupted state", async () => {
    const s = scene({ tier: "pro", seed: restartRow() });

    await s.resume("cp-restart-1");

    // A brand-new session row was inserted (not the checkpoint's old sourceSessionId).
    expect(s.inserted).toHaveLength(1);
    expect(s.inserted[0].id).not.toBe("old-session-1");

    const rt = s.runtime();
    expect(rt).toBeDefined();
    expect(rt!.continuitySnapshot.state).toBe("WORKING");
    expect(rt!.continuitySnapshot.revision).toBe(0); // fresh run — the interrupted COMBAT rev7 is never replayed

    // No movement/attack was issued from the old continuity (resume re-validates; it never replays commands).
    expect(s.farmHost.calls.step).toBe(0);
    expect(s.farmHost.calls.attack).toBe(0);

    // The durable row is consumed on a successful resume.
    expect(s.cp.removes).toContain(ACCOUNT);
    expect(s.cp.get()).toBeNull();
  });
});

describe("PR6a restart resume — non-Pro safe-stop", () => {
  test("a downgraded (Plus) tier is rejected checkpoint_requires_pro and the row is deleted", async () => {
    const s = scene({ tier: "plus", seed: restartRow() });

    await s.resume("cp-restart-1");

    expect(s.lastOpResult()).toMatchObject({ op: "resume", ok: false, reason: "checkpoint_requires_pro" });
    expect(s.inserted).toHaveLength(0); // never started a run
    expect(s.cp.removes).toContain(ACCOUNT);
    expect(s.cp.get()).toBeNull();
  });

  test("a Free tier hydrate surfaces NO checkpoint (null) and drops the durable row", async () => {
    const s = scene({ tier: "free", seed: restartRow() });

    await s.profileList();

    expect(s.lastCheckpointMsg()?.checkpoint).toBeNull();
    expect(s.cp.get()).toBeNull(); // dropped — Free safe-stops across a restart
  });

  test("a Pro hydrate surfaces the restart checkpoint (kind='restart') and keeps the row", async () => {
    const s = scene({ tier: "pro", seed: restartRow() });

    await s.profileList();

    expect(s.lastCheckpointMsg()?.checkpoint).toMatchObject({ id: "cp-restart-1", kind: "restart", state: "ready" });
    expect(s.cp.get()).not.toBeNull();
  });
});

describe("PR6a restart resume — validation", () => {
  test("a character mismatch is rejected checkpoint_character_mismatch (before the tier gate)", async () => {
    const s = scene({ tier: "pro", seed: restartRow({ characterId: "character-other" }) });

    await s.resume("cp-restart-1", CHARACTER);

    expect(s.lastOpResult()).toMatchObject({ op: "resume", ok: false, reason: "checkpoint_character_mismatch" });
    expect(s.inserted).toHaveLength(0);
  });

  test("an unknown checkpoint id is rejected checkpoint_not_found", async () => {
    const s = scene({ tier: "pro", seed: restartRow() });

    await s.resume("cp-does-not-exist");

    expect(s.lastOpResult()).toMatchObject({ op: "resume", ok: false, reason: "checkpoint_not_found" });
    expect(s.inserted).toHaveLength(0);
  });
});
