import { describe, expect, test } from "vitest";
import { BotManager, type BotManagerDeps } from "../server/bot/manager";
import type { ProfileRepo } from "../server/bot/profiles";
import type { SessionRepo, TierRepo } from "../server/bot/store";
import type { BotProfileRow } from "../server/bot/types";
import { DEFAULT_BOT_CONFIG } from "../server/config/bot";
import { MSG_BOT_OP_RESULT, type BotOpResultMessage } from "../src/shared/net-protocol";

// Fix A (prod crash root cause, docs/deploy-checklist.md §1): an entry method that throws unexpectedly (e.g. a
// stale generated Prisma client after a schema migration the process's cached `npm install` build never
// regenerated against) must never leave an unhandled rejection with no bot:opResult — the `guarded` wrapper in
// server/bot/manager.ts catches it and replies `internal_error` instead. Driven through the REAL BotManager with
// a repo that throws, mirroring tests/server-character-authority.test.ts's harness shape.

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

function harness(overrides: Partial<BotManagerDeps> = {}) {
  const messages: { type: string; message: unknown }[] = [];
  const send = (type: string, message: unknown) => messages.push({ type, message });

  const profileRepo: ProfileRepo = {
    listByAccount: async (accountId) => (accountId === PROFILE.accountId ? [PROFILE] : []),
    getById: async (accountId, id) => (accountId === PROFILE.accountId && id === PROFILE.id ? PROFILE : null),
    insert: async () => undefined,
    update: async () => undefined,
    remove: async () => undefined,
  };
  const tierRepo: TierRepo = { get: async () => null, upsert: async () => undefined };
  const sessionRepo: SessionRepo = {
    insert: async () => undefined,
    patch: async () => undefined,
    listByAccount: async () => [],
    getById: async () => null,
    markOpenAsRestart: async () => 0,
  };
  const deps: BotManagerDeps = {
    config: DEFAULT_BOT_CONFIG,
    tierRepo,
    profileRepo,
    sessionRepo,
    rarityOf: () => undefined,
    dbAvailable: () => true,
    now: () => 1_000,
    ...overrides,
  };
  return { manager: new BotManager(deps), messages, send };
}

function lastOpResult(messages: { type: string; message: unknown }[]): BotOpResultMessage | undefined {
  return messages.filter((m) => m.type === MSG_BOT_OP_RESULT).map((m) => m.message as BotOpResultMessage).at(-1);
}

describe("BotManager fail-soft guard (Fix A)", () => {
  test("onProfileCreate: a throwing tierRepo never throws out — replies opResult internal_error", async () => {
    const { manager, messages, send } = harness({
      tierRepo: {
        get: async () => {
          throw new TypeError("Cannot read properties of undefined (reading 'findUnique')");
        },
        upsert: async () => undefined,
      },
    });

    await expect(
      manager.onProfileCreate("account-a", send, { name: "n", mapId: "map1", pocketId: "map1-slime-center", rules: PROFILE.rules }),
    ).resolves.toBeUndefined();

    expect(lastOpResult(messages)).toEqual({ op: "profileCreate", ok: false, reason: "internal_error", refId: undefined });
  });

  test("onProfileList: a throwing profileRepo never throws out — replies opResult internal_error", async () => {
    const { manager, messages, send } = harness({
      profileRepo: {
        listByAccount: async () => {
          throw new Error("boom");
        },
        getById: async () => null,
        insert: async () => undefined,
        update: async () => undefined,
        remove: async () => undefined,
      },
    });

    await expect(manager.onProfileList("account-a", send)).resolves.toBeUndefined();

    expect(lastOpResult(messages)).toEqual({ op: "profileList", ok: false, reason: "internal_error", refId: undefined });
  });

  test("a validation reject (not a throw) is unaffected by the guard — normal reject reason passes through", async () => {
    const { manager, messages, send } = harness();

    await manager.onProfileCreate("account-a", send, { name: "", mapId: "map1", pocketId: "map1-slime-center", rules: PROFILE.rules });

    expect(lastOpResult(messages)?.reason).not.toBe("internal_error");
  });
});
