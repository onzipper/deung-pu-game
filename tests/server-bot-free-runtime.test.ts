import { describe, expect, test } from "vitest";
import {
  BotRuntime,
  type BotAttackOutcome,
  type BotHost,
  type BotPotionOutcome,
} from "../server/bot/runtime";
import type { SessionRepo } from "../server/bot/store";
import { DEFAULT_BOT_CONFIG, type BotConfig } from "../server/config/bot";
import {
  MSG_BOT_ALERT,
  MSG_BOT_STOPPED,
  type BotAlertMessage,
  type BotStoppedMessage,
} from "../src/shared/net-protocol";

const EMPTY_OUTCOME: BotAttackOutcome = {
  killed: 0,
  gold: 0,
  exp: 0,
  loot: [],
  bagOverflowed: false,
  overflow: [],
  leveledUp: false,
};

const UNAVAILABLE_POTION: BotPotionOutcome = { status: "unavailable", hpFraction: 1, cooldownUntilMs: 0 };

interface RuntimeHarnessOptions {
  config?: BotConfig;
  mobs?: ReturnType<BotHost["botMobs"]>;
  hpFraction?: number;
  stepToward?: () => boolean;
  attack?: () => Promise<BotAttackOutcome>;
  usePotion?: () => Promise<BotPotionOutcome>;
  rarityOf?: (itemId: string) => string | undefined;
}

function createRuntimeHarness(options: RuntimeHarnessOptions = {}) {
  let now = 1_000;
  let stepCount = 0;
  let stoppedCount = 0;
  const releases: string[] = [];
  const messages: { type: string; message: unknown }[] = [];
  const patches: Parameters<SessionRepo["patch"]>[] = [];
  const sessionRepo: SessionRepo = {
    insert: async () => undefined,
    patch: async (...args) => {
      patches.push(args);
    },
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
    },
    botMobs: () => options.mobs ?? [],
    botPos: () => ({ tx: 0, ty: 0 }),
    botHpFraction: () => options.hpFraction ?? 1,
    botAttackRange: () => 1,
    botBaseCooldownSeconds: () => 1,
    botStepToward: () => {
      stepCount += 1;
      return options.stepToward?.() ?? false;
    },
    botAttack: options.attack ?? (async () => EMPTY_OUTCOME),
    botOwnerSend: (_accountId, type, message) => {
      messages.push({ type, message });
      return true;
    },
    isForbiddenTargetType: () => false,
    pocketExists: () => true,
    botUsePotion: options.usePotion ?? (async () => UNAVAILABLE_POTION),
    botPlanPath: () => null,
    botPocketAnchor: () => null,
  };
  const runtime = new BotRuntime({
    host,
    config: options.config ?? DEFAULT_BOT_CONFIG,
    sessionRepo,
    rarityOf: options.rarityOf ?? (() => undefined),
    sessionRowId: "run-free",
    accountId: "account-a",
    characterId: "character-a",
    profileId: "profile-a",
    actorId: "actor:real",
    mapId: "map1",
    pocketId: "pocket",
    rules: { skillSlots: [0], potionThresholdPct: null, lootAll: true },
    tier: "free",
    resolveTier: async () => "free",
    baseCooldownSeconds: 1,
    startedAtMs: now,
    now: () => ++now,
    onStopped: () => {
      stoppedCount += 1;
    },
    onTakeoverSettled: () => undefined,
  });

  return {
    runtime,
    releases,
    messages,
    patches,
    stepCount: () => stepCount,
    stoppedCount: () => stoppedCount,
  };
}

describe("Free Character Autonomy runtime baseline", () => {
  test("a collision-blocked real actor stops safely and reports WAITING_FOR_OWNER", () => {
    const harness = createRuntimeHarness({
      config: { ...DEFAULT_BOT_CONFIG, stuckTickLimit: 2 },
      mobs: [{ id: "mob-1", mobType: "slime", tx: 8, ty: 0, hp: 10, pocketId: "pocket" }],
      stepToward: () => false,
    });

    harness.runtime.tick(2_000);
    expect(harness.runtime.continuitySnapshot).toMatchObject({ state: "TRAVELING" });
    harness.runtime.tick(2_000);

    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.runtime.continuitySnapshot).toMatchObject({
      state: "WAITING_FOR_OWNER",
      interruptedState: "TRAVELING",
    });
    expect(harness.stepCount()).toBe(2);
    expect(harness.releases).toEqual(["actor:real"]);
    expect(harness.stoppedCount()).toBe(1);

    const stopped = harness.messages.find((entry) => entry.type === MSG_BOT_STOPPED)?.message as BotStoppedMessage;
    expect(stopped).toMatchObject({
      profileId: "profile-a",
      sessionId: "run-free",
      reason: "stuck",
      continuity: { state: "WAITING_FOR_OWNER", interruptedState: "TRAVELING" },
    });

    harness.runtime.tick(10_000);
    expect(harness.stepCount()).toBe(2);
  });

  test("ordinary rare loot is kept, surfaced, and does not universally stop the plan", async () => {
    const harness = createRuntimeHarness({
      mobs: [{ id: "mob-1", mobType: "slime", tx: 0, ty: 0, hp: 10, pocketId: "pocket" }],
      rarityOf: (itemId) => (itemId === "rare-gem" ? "rare" : undefined),
      attack: async () => ({
        ...EMPTY_OUTCOME,
        killed: 1,
        loot: [{ itemId: "rare-gem", quantity: 1 }],
      }),
    });

    harness.runtime.tick(2_000);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(harness.runtime.isStopped).toBe(false);
    expect(harness.runtime.continuitySnapshot.state).toBe("COMBAT");
    expect(harness.releases).toEqual([]);
    expect(harness.messages.some((entry) => entry.type === MSG_BOT_STOPPED)).toBe(false);
    const alert = harness.messages.find((entry) => entry.type === MSG_BOT_ALERT)?.message as BotAlertMessage;
    expect(alert).toMatchObject({
      profileId: "profile-a",
      kind: "rare",
      itemId: "rare-gem",
      message: "เก็บของแรร์แล้ว",
    });
  });

  test("a Delivery Box fallback still counts as a Free inventory obstacle", async () => {
    const harness = createRuntimeHarness({
      mobs: [{ id: "mob-1", mobType: "slime", tx: 0, ty: 0, hp: 10, pocketId: "pocket" }],
      attack: async () => ({
        ...EMPTY_OUTCOME,
        killed: 1,
        loot: [{ itemId: "delivered-gel", quantity: 1 }],
        bagOverflowed: true,
        overflow: [],
      }),
    });

    harness.runtime.tick(2_000);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.runtime.continuitySnapshot).toMatchObject({
      state: "WAITING_FOR_OWNER",
      interruptedState: "COMBAT",
    });
    const stopped = harness.messages.find((entry) => entry.type === MSG_BOT_STOPPED)?.message as BotStoppedMessage;
    expect(stopped).toMatchObject({
      reason: "inventory_full",
      continuity: { state: "WAITING_FOR_OWNER" },
    });
  });
});
