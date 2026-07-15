import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { BotManager, type BotManagerDeps } from "../server/bot/manager";
import type { ProfileRepo } from "../server/bot/profiles";
import { BotRuntime, type BotAttackOutcome, type BotHost } from "../server/bot/runtime";
import type { SessionRepo, TierRepo } from "../server/bot/store";
import type { BotProfileRow, BotSessionRow } from "../server/bot/types";
import { CharacterAuthorityRegistry } from "../server/characters/authority";
import { DEFAULT_BOT_CONFIG } from "../server/config/bot";
import {
  MSG_BOT_CHECKPOINT,
  MSG_BOT_OP_RESULT,
  MSG_BOT_STATUS,
  MSG_BOT_STOPPED,
  type BotCheckpointMessage,
  type BotOpResultMessage,
  type BotStatusMessage,
} from "../src/shared/net-protocol";

describe("stable character actor authority", () => {
  test("a replacement controller reattaches to the same opaque actor without resetting its authority", () => {
    let serial = 0;
    const registry = new CharacterAuthorityRegistry(() => `issued-${++serial}`);

    const first = registry.bindCharacter("account-a", "character-private-id", "controller-1");
    expect(first.created).toBe(true);
    expect(first.actor.actorId).toBe("actor:issued-1");
    expect(first.actor.actorId).not.toContain("character-private-id");
    expect(
      registry.beginAutonomy(first.actor.actorId, "controller-1", "account-a", "character-private-id"),
    ).toBe(true);

    expect(registry.detachController("controller-1")).toBe(first.actor);
    expect(first.actor.mode).toBe("autonomy");
    const second = registry.bindCharacter("account-a", "character-private-id", "controller-2");

    expect(second.created).toBe(false);
    expect(second.actor).toBe(first.actor);
    expect(second.actor.actorId).toBe("actor:issued-1");
    expect(second.actor.mode).toBe("autonomy");
    expect(registry.detachController("controller-1")).toBeNull();
    expect(registry.actorForController("controller-2")).toBe(first.actor);
  });

  test("ownership is verified and removing an actor clears the character binding", () => {
    let serial = 0;
    const registry = new CharacterAuthorityRegistry(() => `issued-${++serial}`);
    const actor = registry.bindCharacter("account-a", "character-a", "controller-1").actor;

    expect(() => registry.bindCharacter("account-b", "character-a", "controller-2")).toThrow(
      "character_actor_ownership_conflict",
    );
    expect(registry.beginAutonomy(actor.actorId, "controller-1", "account-b", "character-a")).toBe(false);
    expect(registry.removeActor(actor.actorId)).toBe(actor);

    const replacement = registry.bindCharacter("account-a", "character-a", "controller-3").actor;
    expect(replacement.actorId).toBe("actor:issued-2");
  });

  test("guest transports cannot claim character autonomy", () => {
    const registry = new CharacterAuthorityRegistry(() => "unused");
    const guest = registry.bindGuest("guest-controller").actor;
    expect(registry.beginAutonomy(guest.actorId, "guest-controller", "account", "character")).toBe(false);
  });
});

const PROFILE: BotProfileRow = {
  id: "profile-1",
  accountId: "account-a",
  name: "field plan",
  mapId: "map1",
  pocketId: "map1-slime-center",
  rules: { skillSlots: [0], potionThresholdPct: null, lootAll: true },
  createdAt: 1,
  updatedAt: 1,
};

function createManagerHarness(options: { insert?: SessionRepo["insert"] } = {}) {
  const claims: unknown[] = [];
  const releases: string[] = [];
  const inserted: BotSessionRow[] = [];
  const patched: string[] = [];
  const messages: { type: string; message: unknown }[] = [];

  const profileRepo: ProfileRepo = {
    listByAccount: async (accountId) => (accountId === PROFILE.accountId ? [PROFILE] : []),
    getById: async (accountId, id) => (accountId === PROFILE.accountId && id === PROFILE.id ? PROFILE : null),
    insert: async () => undefined,
    update: async () => undefined,
    remove: async () => undefined,
  };
  const tierRepo: TierRepo = {
    get: async () => null,
    upsert: async () => undefined,
  };
  const sessionRepo: SessionRepo = {
    insert: options.insert ?? (async (row) => { inserted.push(row); }),
    patch: async (id) => { patched.push(id); },
    listByAccount: async () => [],
    getById: async () => null,
    markOpenAsRestart: async () => 0,
  };
  const host: BotHost = {
    mapId: "map1",
    roomId: "room-1",
    botClaimAuthority: (input) => {
      claims.push(input);
      return "actor:real-existing";
    },
    botReleaseAuthority: (actorId) => { releases.push(actorId); },
    botMobs: () => [],
    botPos: () => ({ tx: 7, ty: 9 }),
    botHpFraction: () => 0.42,
    botAttackRange: () => 1,
    botBaseCooldownSeconds: () => 1,
    botStepToward: () => false,
    botAttack: async () => ({
      killed: 0,
      gold: 0,
      exp: 0,
      loot: [],
      bagOverflowed: false,
      overflow: [],
      leveledUp: false,
    }),
    botOwnerSend: (_accountId, type, message) => {
      messages.push({ type, message });
      return true;
    },
    isForbiddenTargetType: () => false,
    pocketExists: () => true,
  };
  const deps: BotManagerDeps = {
    config: DEFAULT_BOT_CONFIG,
    tierRepo,
    profileRepo,
    sessionRepo,
    rarityOf: () => undefined,
    dbAvailable: () => true,
    now: () => 1_000,
  };
  return {
    manager: new BotManager(deps),
    host,
    claims,
    releases,
    inserted,
    patched,
    messages,
    send: (type: string, message: unknown) => messages.push({ type, message }),
  };
}

describe("BotManager character-authority lifecycle", () => {
  test("starts on the existing actor and stop releases authority without an entity-removal seam", async () => {
    const h = createManagerHarness();
    await h.manager.onStart(
      h.host,
      "controller-1",
      "account-a",
      "character-a",
      h.send,
      { profileId: PROFILE.id },
    );

    expect(h.claims).toEqual([{
      controllerSessionId: "controller-1",
      accountId: "account-a",
      characterId: "character-a",
      profileId: PROFILE.id,
      allowedSlots: [0],
      pocketId: "map1-slime-center",
    }]);
    expect(h.inserted[0]).toMatchObject({ accountId: "account-a", characterId: "character-a" });
    expect(h.manager.activeActorForAccount("account-a")).toMatchObject({
      actorId: "actor:real-existing",
      characterId: "character-a",
      roomId: "room-1",
    });

    h.manager.onStop("account-a", h.send, {});
    expect(h.releases).toEqual(["actor:real-existing"]);
    expect(h.manager.activeActorForAccount("account-a")).toBeNull();
    expect(h.messages).toContainEqual({
      type: MSG_BOT_OP_RESULT,
      message: expect.objectContaining({ op: "stop", ok: true }),
    });
  });

  test("deleting a profile aborts only its matching run and never reports completion", async () => {
    const h = createManagerHarness();
    await h.manager.onStart(
      h.host,
      "controller-1",
      "account-a",
      "character-a",
      h.send,
      { profileId: PROFILE.id },
    );

    await h.manager.onProfileDelete("account-a", h.send, { id: "different-profile" });
    expect(h.manager.activeActorForAccount("account-a")).not.toBeNull();
    expect(h.releases).toEqual([]);

    await h.manager.onProfileDelete("account-a", h.send, { id: PROFILE.id });
    expect(h.manager.activeActorForAccount("account-a")).toBeNull();
    expect(h.releases).toEqual(["actor:real-existing"]);
    expect(h.messages).toContainEqual({
      type: MSG_BOT_STOPPED,
      message: expect.objectContaining({
        profileId: PROFILE.id,
        reason: "profile_deleted",
        continuity: expect.objectContaining({ state: "FAILED" }),
      }),
    });
  });

  test("deleting the requested profile fences a start whose session insert is still pending", async () => {
    let finishInsert!: () => void;
    let markInsertStarted!: () => void;
    const insertStarted = new Promise<void>((resolve) => {
      markInsertStarted = resolve;
    });
    const h = createManagerHarness({
      insert: () =>
        new Promise<void>((resolveInsert) => {
          finishInsert = resolveInsert;
          markInsertStarted();
        }),
    });
    const start = h.manager.onStart(
      h.host,
      "controller-1",
      "account-a",
      "character-a",
      h.send,
      { profileId: PROFILE.id },
    );
    await insertStarted;

    await h.manager.onProfileDelete("account-a", h.send, { id: PROFILE.id });
    expect(h.releases).toEqual(["actor:real-existing"]);
    expect(h.manager.activeActorForAccount("account-a")).toBeNull();

    finishInsert();
    await start;
    expect(h.releases).toEqual(["actor:real-existing"]);
    expect(h.patched).toHaveLength(1);
    expect(h.manager.activeActorForAccount("account-a")).toBeNull();
  });

  test("publishes room affinity immediately after claim while the session row is still inserting", async () => {
    let finishInsert!: () => void;
    let markInsertStarted!: () => void;
    const insertStarted = new Promise<void>((resolve) => {
      markInsertStarted = resolve;
    });
    const h = createManagerHarness({
      insert: () => new Promise<void>((resolveInsert) => {
        finishInsert = resolveInsert;
        markInsertStarted();
      }),
    });
    const start = h.manager.onStart(
      h.host,
      "controller-1",
      "account-a",
      "character-a",
      h.send,
      { profileId: PROFILE.id },
    );

    await insertStarted;
    expect(h.manager.activeActorForAccount("account-a")).toMatchObject({
      actorId: "actor:real-existing",
      roomId: "room-1",
    });
    finishInsert();
    await start;
  });

  test("concurrent starts reserve the account synchronously and a failed insert releases the claim", async () => {
    const h = createManagerHarness({ insert: async () => { throw new Error("db down"); } });
    const first = h.manager.onStart(
      h.host,
      "controller-1",
      "account-a",
      "character-a",
      h.send,
      { profileId: PROFILE.id },
    );
    const second = h.manager.onStart(
      h.host,
      "controller-1",
      "account-a",
      "character-a",
      h.send,
      { profileId: PROFILE.id },
    );
    await Promise.all([first, second]);

    expect(h.claims).toHaveLength(1);
    expect(h.releases).toEqual(["actor:real-existing"]);
    expect(h.manager.activeActorForAccount("account-a")).toBeNull();
    const results = h.messages
      .filter((entry) => entry.type === MSG_BOT_OP_RESULT)
      .map((entry) => entry.message as BotOpResultMessage);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: "start", ok: false, reason: "already_running" }),
      expect.objectContaining({ op: "start", ok: false, reason: "db_error" }),
    ]));
  });

  test("stop cancels a claimed start while its session insert is in flight", async () => {
    let finishInsert!: () => void;
    let markInsertStarted!: () => void;
    const insertStarted = new Promise<void>((resolve) => { markInsertStarted = resolve; });
    const h = createManagerHarness({
      insert: () => new Promise<void>((resolve) => {
        finishInsert = resolve;
        markInsertStarted();
      }),
    });
    const start = h.manager.onStart(
      h.host,
      "controller-1",
      "account-a",
      "character-a",
      h.send,
      { profileId: PROFILE.id },
    );
    await insertStarted;

    h.manager.onStop("account-a", h.send, {});
    expect(h.releases).toEqual(["actor:real-existing"]);
    expect(h.manager.activeActorForAccount("account-a")).toBeNull();
    finishInsert();
    await start;

    expect(h.releases).toEqual(["actor:real-existing"]);
    expect(h.patched).toHaveLength(1);
    expect(h.manager.activeActorForAccount("account-a")).toBeNull();
    const results = h.messages
      .filter((entry) => entry.type === MSG_BOT_OP_RESULT)
      .map((entry) => entry.message as BotOpResultMessage);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: "stop", ok: true }),
      expect.objectContaining({ op: "start", ok: false, reason: "cancelled" }),
    ]));
  });

  test("takeover during session insert owns PAUSED/checkpoint before releasing authority", async () => {
    let finishInsert!: () => void;
    let markInsertStarted!: () => void;
    const insertStarted = new Promise<void>((resolve) => { markInsertStarted = resolve; });
    const h = createManagerHarness({
      insert: () => new Promise<void>((resolve) => {
        finishInsert = resolve;
        markInsertStarted();
      }),
    });
    const statesAtRelease: Array<string | null> = [];
    const release = h.host.botReleaseAuthority;
    h.host.botReleaseAuthority = (actorId) => {
      const checkpoints = (h.manager as unknown as {
        checkpoints: Map<string, { continuity: { state: string } }>;
      }).checkpoints;
      statesAtRelease.push(checkpoints.get("account-a")?.continuity.state ?? null);
      release(actorId);
    };

    const start = h.manager.onStart(
      h.host,
      "controller-1",
      "account-a",
      "character-a",
      h.send,
      { profileId: PROFILE.id },
    );
    await insertStarted;

    expect(h.manager.onTakeover(
      "account-a",
      "actor:real-existing",
      h.send,
      { requestId: "takeover-during-insert", source: "move" },
    )).toBe(true);
    expect(statesAtRelease).toEqual(["PAUSED"]);
    expect(h.releases).toEqual(["actor:real-existing"]);
    expect(h.manager.activeActorForAccount("account-a")).toBeNull();

    const saving = h.messages.find((entry) => entry.type === MSG_BOT_CHECKPOINT)?.message as BotCheckpointMessage;
    expect(saving.checkpoint).toMatchObject({
      profileId: PROFILE.id,
      state: "saving",
      continuity: { state: "PAUSED", revision: 1, interruptedState: "WORKING" },
    });

    finishInsert();
    await start;

    expect(h.releases).toEqual(["actor:real-existing"]);
    expect(h.patched).toHaveLength(1);
    const checkpointMessages = h.messages
      .filter((entry) => entry.type === MSG_BOT_CHECKPOINT)
      .map((entry) => entry.message as BotCheckpointMessage);
    expect(checkpointMessages.at(-1)?.checkpoint).toMatchObject({
      id: saving.checkpoint?.id,
      state: "ready",
      continuity: { state: "PAUSED", interruptedState: "WORKING" },
    });
    expect(h.messages).toContainEqual({
      type: MSG_BOT_OP_RESULT,
      message: expect.objectContaining({ op: "start", ok: false, reason: "cancelled" }),
    });
  });

  test("takeover checkpoint fails closed when the pending session insert is rejected", async () => {
    let rejectInsert!: (reason?: unknown) => void;
    let markInsertStarted!: () => void;
    const insertStarted = new Promise<void>((resolve) => { markInsertStarted = resolve; });
    const h = createManagerHarness({
      insert: () => new Promise<void>((_resolve, reject) => {
        rejectInsert = reject;
        markInsertStarted();
      }),
    });
    const start = h.manager.onStart(
      h.host,
      "controller-1",
      "account-a",
      "character-a",
      h.send,
      { profileId: PROFILE.id },
    );
    await insertStarted;

    expect(h.manager.onTakeover(
      "account-a",
      "actor:real-existing",
      h.send,
      { requestId: "takeover-before-insert-failure", source: "skill" },
    )).toBe(true);
    rejectInsert(new Error("db down"));
    await start;

    const checkpointMessages = h.messages
      .filter((entry) => entry.type === MSG_BOT_CHECKPOINT)
      .map((entry) => entry.message as BotCheckpointMessage);
    expect(checkpointMessages.at(-1)?.checkpoint).toMatchObject({
      state: "failed",
      continuity: { state: "PAUSED", interruptedState: "WORKING" },
    });
    expect(h.releases).toEqual(["actor:real-existing"]);
    expect(h.patched).toHaveLength(0);
    expect(h.messages).toContainEqual({
      type: MSG_BOT_OP_RESULT,
      message: expect.objectContaining({ op: "start", ok: false, reason: "cancelled" }),
    });
  });

  test("manual takeover releases authority synchronously, saves a checkpoint, then resumes the same plan", async () => {
    const h = createManagerHarness();
    await h.manager.onStart(
      h.host,
      "controller-1",
      "account-a",
      "character-a",
      h.send,
      { profileId: PROFILE.id },
    );

    expect(h.manager.onTakeover(
      "account-a",
      "actor:real-existing",
      h.send,
      { requestId: "takeover-1", source: "move" },
    )).toBe(true);
    expect(h.releases).toEqual(["actor:real-existing"]);
    expect(h.manager.activeActorForAccount("account-a")).toBeNull();
    expect(h.messages).toContainEqual({
      type: MSG_BOT_OP_RESULT,
      message: expect.objectContaining({ op: "takeover", ok: true, refId: "takeover-1" }),
    });

    const saving = h.messages.find((entry) => entry.type === MSG_BOT_CHECKPOINT)?.message as BotCheckpointMessage;
    expect(saving.checkpoint).toMatchObject({
      profileId: PROFILE.id,
      sourceSessionId: h.inserted[0]?.id,
      mapId: PROFILE.mapId,
      pocketId: PROFILE.pocketId,
      state: "saving",
      continuity: {
        state: "PAUSED",
        interruptedState: "WORKING",
      },
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const checkpointMessages = h.messages
      .filter((entry) => entry.type === MSG_BOT_CHECKPOINT)
      .map((entry) => entry.message as BotCheckpointMessage);
    expect(checkpointMessages.at(-1)?.checkpoint?.state).toBe("ready");

    h.messages.length = 0;
    await h.manager.onProfileList("account-a", h.send);
    expect(h.messages).toContainEqual({
      type: MSG_BOT_CHECKPOINT,
      message: expect.objectContaining({ checkpoint: expect.objectContaining({ id: saving.checkpoint!.id, state: "ready" }) }),
    });

    await h.manager.onResume(
      h.host,
      "controller-1",
      "account-a",
      "character-a",
      h.send,
      { checkpointId: saving.checkpoint!.id },
    );
    expect(h.claims).toHaveLength(2);
    expect(h.inserted).toHaveLength(2);
    expect(h.messages).toContainEqual({
      type: MSG_BOT_OP_RESULT,
      message: expect.objectContaining({ op: "resume", ok: true, refId: PROFILE.id }),
    });
    expect(checkpointMessages.at(-1)?.checkpoint?.state).toBe("ready");
    expect(h.messages).toContainEqual({ type: MSG_BOT_CHECKPOINT, message: { checkpoint: null } });
  });
});

describe("MapRoom no-clone implementation guard", () => {
  test("authority claim and release never create or delete a PlayerState", () => {
    const source = readFileSync(resolve(process.cwd(), "server/rooms/MapRoom.ts"), "utf8");
    const claim = source.slice(source.indexOf("  botClaimAuthority("), source.indexOf("  botReleaseAuthority("));
    const release = source.slice(source.indexOf("  botReleaseAuthority("), source.indexOf("  botMobs("));

    expect(claim).not.toContain("new PlayerState");
    expect(claim).not.toContain("state.players.set");
    expect(release).not.toContain("state.players.delete");
    expect(source).not.toContain("bot#");
  });

  test("the observing client locks local prediction while autonomy owns the actor", () => {
    const net = readFileSync(resolve(process.cwd(), "src/engine/net/net-client.ts"), "utf8");
    const player = readFileSync(resolve(process.cwd(), "src/engine/player/local-player.ts"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "src/engine/runtime/app.ts"), "utf8");

    expect(net).toContain('listen("isBot"');
    expect(net).toContain("onSelfAutonomyChange");
    expect(player).toContain("setAuthorityLocked(locked: boolean)");
    expect(player).toContain("if (authorityLocked) clearPath()");
    expect(player).toContain("keyboard.consumeSlotPressed()");
    expect(app).toContain("player.setAuthorityLocked(true)");
    expect(app).toContain("player.setAuthorityLocked(false)");
    expect(app).toContain("player.applyAuthorityState(");
    expect(app).toContain("const frozen = locked || tabHidden || characterAutonomyActive");
  });

  test("manual move and skill both invoke the server takeover fence before their existing handlers", () => {
    const room = readFileSync(resolve(process.cwd(), "server/rooms/MapRoom.ts"), "utf8");
    const manager = readFileSync(resolve(process.cwd(), "server/bot/manager.ts"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "src/engine/runtime/app.ts"), "utf8");
    const panel = readFileSync(resolve(process.cwd(), "src/ui/panels/bot/BotPanel.tsx"), "utf8");
    expect(room).toContain('this.takeManualAuthority(client, "move")');
    expect(room).toContain('this.takeManualAuthority(client, "skill")');
    expect(manager).toContain("runtime.takeover(checkpoint.id, checkpoint.savedAt)");
    expect(app).toContain("!pending.schemaManual || !pending.acked");
    expect(app).toContain("consumeManualTakeoverIntent()");
    expect(panel).toContain("รับช่วงต่อ");
    expect(panel).toContain("หยุดแผน");
  });

  test("world seams fail closed for forbidden targets and preserve Delivery Box bag pressure", () => {
    const room = readFileSync(resolve(process.cwd(), "server/rooms/MapRoom.ts"), "utf8");
    expect(room).toContain("isForbiddenAutomationMobClass(mobClassForMobType(mobType))");
    expect(room).toContain("loot: [...outcome.granted, ...outcome.delivered]");
    expect(room).toContain("outcome.delivered.length > 0 || outcome.overflow.length > 0");
  });
});

describe("BotRuntime authority drain", () => {
  test("publishes server-owned WORKING/TRAVELING/COMBAT state before issuing world commands", async () => {
    let pos = { tx: 0, ty: 0 };
    let mobs = [{ id: "mob-1", mobType: "slime", tx: 5, ty: 0, hp: 10, pocketId: "pocket" }];
    let now = 1_000;
    const observed: string[] = [];
    const messages: { type: string; message: unknown }[] = [];
    const sessionRepo: SessionRepo = {
      insert: async () => undefined,
      patch: async () => undefined,
      listByAccount: async () => [],
      getById: async () => null,
      markOpenAsRestart: async () => 0,
    };
    const host: BotHost = {
      mapId: "map1",
      roomId: "room-1",
      botClaimAuthority: () => "actor:real",
      botReleaseAuthority: () => undefined,
      botMobs: () => mobs,
      botPos: () => pos,
      botHpFraction: () => 1,
      botAttackRange: () => 1,
      botBaseCooldownSeconds: () => 1,
      botStepToward: () => {
        observed.push(runtime.continuitySnapshot.state);
        return true;
      },
      botAttack: async () => {
        observed.push(runtime.continuitySnapshot.state);
        return {
          killed: 0,
          gold: 0,
          exp: 0,
          loot: [],
          bagOverflowed: false,
          overflow: [],
          leveledUp: false,
        };
      },
      botOwnerSend: (_accountId, type, message) => {
        messages.push({ type, message });
        return true;
      },
      isForbiddenTargetType: () => false,
      pocketExists: () => true,
    };
    const runtime = new BotRuntime({
      host,
      config: DEFAULT_BOT_CONFIG,
      sessionRepo,
      rarityOf: () => undefined,
      sessionRowId: "run-continuity",
      accountId: "account-a",
      characterId: "character-a",
      profileId: "profile-a",
      actorId: "actor:real",
      mapId: "map1",
      pocketId: "pocket",
      rules: { skillSlots: [0], potionThresholdPct: null, lootAll: true },
      baseCooldownSeconds: 1,
      startedAtMs: now,
      now: () => ++now,
      onStopped: () => undefined,
      onTakeoverSettled: () => undefined,
    });

    expect(runtime.continuitySnapshot).toMatchObject({ state: "WORKING", revision: 0 });
    runtime.tick(100);
    expect(runtime.continuitySnapshot.state).toBe("TRAVELING");
    expect(observed).toEqual(["TRAVELING"]);

    pos = { tx: 5, ty: 0 };
    runtime.tick(2_000);
    await Promise.resolve();
    expect(runtime.continuitySnapshot.state).toBe("COMBAT");
    expect(observed).toEqual(["TRAVELING", "COMBAT"]);
    const status = messages.find((entry) => entry.type === MSG_BOT_STATUS)?.message as BotStatusMessage;
    expect(status).toMatchObject({ continuity: { state: "COMBAT" }, action: "attacking" });

    mobs = [];
    runtime.tick(100);
    expect(runtime.continuitySnapshot.state).toBe("WORKING");
  });

  test("does not release the real actor until an in-flight reward is reflected in the final report", async () => {
    let finishAttack!: (outcome: BotAttackOutcome) => void;
    const attack = new Promise<BotAttackOutcome>((resolve) => { finishAttack = resolve; });
    const releases: string[] = [];
    const patches: Parameters<SessionRepo["patch"]>[] = [];
    const sessionRepo: SessionRepo = {
      insert: async () => undefined,
      patch: async (...args) => { patches.push(args); },
      listByAccount: async () => [],
      getById: async () => null,
      markOpenAsRestart: async () => 0,
    };
    const host: BotHost = {
      mapId: "map1",
      roomId: "room-1",
      botClaimAuthority: () => "actor:real",
      botReleaseAuthority: (actorId) => { releases.push(actorId); },
      botMobs: () => [{ id: "mob-1", mobType: "slime", tx: 0, ty: 0, hp: 10, pocketId: "pocket" }],
      botPos: () => ({ tx: 0, ty: 0 }),
      botHpFraction: () => 1,
      botAttackRange: () => 2,
      botBaseCooldownSeconds: () => 1,
      botStepToward: () => false,
      botAttack: () => attack,
      botOwnerSend: () => false,
      isForbiddenTargetType: () => false,
      pocketExists: () => true,
    };
    let stopped = 0;
    const runtime = new BotRuntime({
      host,
      config: DEFAULT_BOT_CONFIG,
      sessionRepo,
      rarityOf: () => undefined,
      sessionRowId: "run-1",
      accountId: "account-a",
      characterId: "character-a",
      profileId: "profile-a",
      actorId: "actor:real",
      mapId: "map1",
      pocketId: "pocket",
      rules: { skillSlots: [0], potionThresholdPct: null, lootAll: true },
      baseCooldownSeconds: 1,
      startedAtMs: 0,
      now: () => 1,
      onStopped: () => { stopped += 1; },
      onTakeoverSettled: () => undefined,
    });

    runtime.tick(2_000);
    runtime.stop("manual");
    expect(runtime.continuitySnapshot.state).toBe("COMPLETED");
    expect(releases).toEqual([]);
    expect(stopped).toBe(0);

    finishAttack({
      killed: 1,
      gold: 7,
      exp: 11,
      loot: [{ itemId: "gel", quantity: 2 }],
      bagOverflowed: false,
      overflow: [],
      leveledUp: false,
    });
    await attack;
    await Promise.resolve();

    expect(releases).toEqual(["actor:real"]);
    expect(stopped).toBe(1);
    expect(patches.at(-1)?.[1]).toEqual({
      killCount: 1,
      goldEarned: 7,
      expEarned: 11,
      drops: { gel: 2 },
    });
    expect(patches.at(-1)?.[2]).toMatchObject({ stopReason: "manual" });
  });

  test("takeover fences future commands immediately while an accepted reward drains into the checkpoint", async () => {
    let finishAttack!: (outcome: BotAttackOutcome) => void;
    const attack = new Promise<BotAttackOutcome>((resolve) => { finishAttack = resolve; });
    const releases: string[] = [];
    const releaseStates: string[] = [];
    const settled: { checkpointId: string; saved: boolean }[] = [];
    let attacks = 0;
    const sessionRepo: SessionRepo = {
      insert: async () => undefined,
      patch: async () => undefined,
      listByAccount: async () => [],
      getById: async () => null,
      markOpenAsRestart: async () => 0,
    };
    const host: BotHost = {
      mapId: "map1",
      roomId: "room-1",
      botClaimAuthority: () => "actor:real",
      botReleaseAuthority: (actorId) => {
        releases.push(actorId);
        releaseStates.push(runtime.continuitySnapshot.state);
      },
      botMobs: () => [{ id: "mob-1", mobType: "slime", tx: 0, ty: 0, hp: 10, pocketId: "pocket" }],
      botPos: () => ({ tx: 0, ty: 0 }),
      botHpFraction: () => 1,
      botAttackRange: () => 2,
      botBaseCooldownSeconds: () => 1,
      botStepToward: () => false,
      botAttack: () => { attacks += 1; return attack; },
      botOwnerSend: () => false,
      isForbiddenTargetType: () => false,
      pocketExists: () => true,
    };
    const runtime = new BotRuntime({
      host,
      config: DEFAULT_BOT_CONFIG,
      sessionRepo,
      rarityOf: () => undefined,
      sessionRowId: "run-takeover",
      accountId: "account-a",
      characterId: "character-a",
      profileId: "profile-a",
      actorId: "actor:real",
      mapId: "map1",
      pocketId: "pocket",
      rules: { skillSlots: [0], potionThresholdPct: null, lootAll: true },
      baseCooldownSeconds: 1,
      startedAtMs: 0,
      now: () => 1,
      onStopped: () => undefined,
      onTakeoverSettled: (_accountId, checkpointId, saved) => settled.push({ checkpointId, saved }),
    });

    runtime.tick(2_000);
    expect(runtime.takeover("checkpoint-1", 123)).toMatchObject({
      state: "PAUSED",
      interruptedState: "COMBAT",
    });
    expect(releases).toEqual(["actor:real"]);
    expect(releaseStates).toEqual(["PAUSED"]);
    runtime.tick(10_000);
    expect(attacks).toBe(1);
    expect(settled).toEqual([]);

    finishAttack({
      killed: 1,
      gold: 7,
      exp: 11,
      loot: [{ itemId: "gel", quantity: 2 }],
      bagOverflowed: false,
      overflow: [],
      leveledUp: false,
    });
    await attack;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(releases).toEqual(["actor:real"]);
    expect(settled).toEqual([{ checkpointId: "checkpoint-1", saved: true }]);
    expect(runtime.continuitySnapshot).toMatchObject({ state: "PAUSED", interruptedState: "COMBAT" });
  });

  test("final checkpoint write waits behind an older periodic report flush", async () => {
    let finishFirstPatch!: () => void;
    const firstPatch = new Promise<void>((resolve) => { finishFirstPatch = resolve; });
    const patches: Parameters<SessionRepo["patch"]>[] = [];
    const settled: boolean[] = [];
    const sessionRepo: SessionRepo = {
      insert: async () => undefined,
      patch: (...args) => {
        patches.push(args);
        return patches.length === 1 ? firstPatch : Promise.resolve();
      },
      listByAccount: async () => [],
      getById: async () => null,
      markOpenAsRestart: async () => 0,
    };
    const host: BotHost = {
      mapId: "map1",
      roomId: "room-1",
      botClaimAuthority: () => "actor:real",
      botReleaseAuthority: () => undefined,
      botMobs: () => [],
      botPos: () => ({ tx: 0, ty: 0 }),
      botHpFraction: () => 1,
      botAttackRange: () => 2,
      botBaseCooldownSeconds: () => 1,
      botStepToward: () => false,
      botAttack: async () => ({
        killed: 0,
        gold: 0,
        exp: 0,
        loot: [],
        bagOverflowed: false,
        overflow: [],
        leveledUp: false,
      }),
      botOwnerSend: () => false,
      isForbiddenTargetType: () => false,
      pocketExists: () => true,
    };
    const runtime = new BotRuntime({
      host,
      config: DEFAULT_BOT_CONFIG,
      sessionRepo,
      rarityOf: () => undefined,
      sessionRowId: "run-serialized",
      accountId: "account-a",
      characterId: "character-a",
      profileId: "profile-a",
      actorId: "actor:real",
      mapId: "map1",
      pocketId: "pocket",
      rules: { skillSlots: [0], potionThresholdPct: null, lootAll: true },
      baseCooldownSeconds: 1,
      startedAtMs: 0,
      now: () => 1,
      onStopped: () => undefined,
      onTakeoverSettled: (_accountId, _checkpointId, saved) => settled.push(saved),
    });

    runtime.tick(DEFAULT_BOT_CONFIG.sessionFlushIntervalMs + 1);
    await Promise.resolve();
    expect(patches).toHaveLength(1);
    expect(runtime.takeover("checkpoint-serialized", 456)).toMatchObject({ state: "PAUSED" });
    await Promise.resolve();
    expect(patches).toHaveLength(1);
    expect(settled).toEqual([]);

    finishFirstPatch();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(patches).toHaveLength(2);
    expect(patches[1]?.[2]).toMatchObject({ stoppedAt: 456, stopReason: "manual" });
    expect(settled).toEqual([true]);
  });
});
