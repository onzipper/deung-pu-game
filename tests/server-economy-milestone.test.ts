import { describe, expect, test } from "vitest";
import {
  grantMilestone,
  milestonesForTrigger,
  type MilestoneDeliverySeam,
  type MilestoneDeps,
  type MilestoneGrantSeam,
  type MilestoneInventorySeam,
  type MilestoneLedgerSeam,
  type MilestoneRewardView,
} from "../src/server/economy/milestone";
import { DEFAULT_ECONOMY_CONFIG } from "../server/config";

// C1 — milestone reward orchestration (Economy §18). never-downgrade zone (economy grants — idempotency).
// All seams are mocked — ⛔ no real DB, no .env read (mirrors server-economy-kill-reward.test.ts).

/** the live milestone Design Knobs as the orchestrator's structural view (Economy §18.1 / D-053). */
const CONFIG: MilestoneRewardView[] = DEFAULT_ECONOMY_CONFIG.milestones.map((m) => ({
  milestoneId: m.milestoneId,
  phase: m.phase,
  exp: m.exp,
  gold: m.gold,
  items: m.items.map((i) => ({ itemId: i.itemId, quantity: i.quantity })),
}));

/** grant-marker mock: an in-memory unique set — first record of a key = fresh (true), else already granted (false). */
function mockGrantSeam() {
  const keys = new Set<string>();
  const calls: string[] = [];
  const seam: MilestoneGrantSeam = {
    async recordGrant(input) {
      const key = `${input.accountId}:${input.milestoneId}`;
      calls.push(key);
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    },
  };
  return { seam, calls };
}

/** ledger mock: running balance + idempotency by key (mirrors appendEntry contract). */
function mockLedger() {
  const keys = new Set<string>();
  const calls: { amount: bigint; reason: string; refType?: string; refId?: string; idempotencyKey: string }[] = [];
  let balance = 0n;
  const ledger: MilestoneLedgerSeam = {
    async appendEntry(e) {
      calls.push({ amount: e.amount, reason: e.reason, refType: e.refType, refId: e.refId, idempotencyKey: e.idempotencyKey });
      if (keys.has(e.idempotencyKey)) return { status: "duplicate", balance };
      keys.add(e.idempotencyKey);
      balance += e.amount;
      return { status: "applied", balance };
    },
  };
  return { ledger, calls, get balance() { return balance; } };
}

function mockInventory(overflow: { itemId: string; quantity: number }[] = []) {
  const calls: { itemId: string; quantity: number }[][] = [];
  const inventory: MilestoneInventorySeam = {
    async grantItems(input) {
      const grants = input.grants.map((g) => ({ itemId: g.itemId, quantity: g.quantity }));
      calls.push(grants);
      const overflowIds = new Set(overflow.map((o) => o.itemId));
      return { granted: grants.filter((g) => !overflowIds.has(g.itemId)), overflow };
    },
  };
  return { inventory, calls };
}

function mockDelivery() {
  const calls: { itemId: string; quantity: number }[][] = [];
  const delivery: MilestoneDeliverySeam = {
    async createEntry(input) {
      calls.push(input.items.map((i) => ({ itemId: i.itemId, quantity: i.quantity })));
    },
  };
  return { delivery, calls };
}

function baseDeps(over: Partial<MilestoneDeps> = {}): MilestoneDeps {
  return {
    config: CONFIG,
    grantSeam: null,
    ledger: null,
    inventory: null,
    delivery: null,
    memoryGrants: new Set<string>(),
    itemMeta: (id) => ({ stackable: id.startsWith("mat_") || id.startsWith("con_"), uniqueEquipGroup: null }),
    capacity: 40,
    onUnknown: () => {},
    ...over,
  };
}

const INPUT = { accountId: "acc1", characterId: "char1", milestoneId: "ms_shop_intro", sessionId: "sess1" };

describe("milestonesForTrigger — §18.1 trigger → milestoneId mapping", () => {
  test("normal mob kill → first hunt only", () => {
    expect(milestonesForTrigger({ kind: "mob_kill", mobClass: "normal" })).toEqual(["ms_first_hunt"]);
  });
  test("elite kill → first hunt + first elite (an elite is a hunt too)", () => {
    expect(milestonesForTrigger({ kind: "mob_kill", mobClass: "elite" })).toEqual(["ms_first_hunt", "ms_first_elite"]);
  });
  test("boss kill → boss first kill (phase-gated later)", () => {
    expect(milestonesForTrigger({ kind: "mob_kill", mobClass: "boss" })).toEqual(["ms_boss_first_kill"]);
  });
  test("storage open / shop transaction → intro milestones", () => {
    expect(milestonesForTrigger({ kind: "storage_open" })).toEqual(["ms_storage_intro"]);
    expect(milestonesForTrigger({ kind: "shop_transaction" })).toEqual(["ms_shop_intro"]);
  });
  test("unbuilt-system triggers still map (mapping is pure; hooks decide liveness)", () => {
    expect(milestonesForTrigger({ kind: "intro_complete" })).toEqual(["ms_intro_complete"]);
    expect(milestonesForTrigger({ kind: "map1_complete" })).toEqual(["ms_map1_complete"]);
    expect(milestonesForTrigger({ kind: "enhancement_ready" })).toEqual(["ms_enhancement_ready"]);
    expect(milestonesForTrigger({ kind: "enhancement_success" })).toEqual(["ach_first_upgrade"]);
  });
});

describe("grantMilestone — idempotency (never-downgrade zone)", () => {
  test("in-memory path: same (account, milestone) twice → 2nd is a no-op duplicate", async () => {
    const memoryGrants = new Set<string>();
    const first = await grantMilestone(baseDeps({ memoryGrants }), INPUT);
    const second = await grantMilestone(baseDeps({ memoryGrants }), INPUT);
    expect(first.status).toBe("granted");
    expect(second.status).toBe("duplicate");
    expect(second.exp).toBe(0); // duplicate grants no EXP (caller must not re-apply)
  });

  test("DB-seam path: 2nd grant is duplicate → gold credited once only", async () => {
    const grant = mockGrantSeam();
    const led = mockLedger();
    const first = await grantMilestone(baseDeps({ grantSeam: grant.seam, ledger: led.ledger }), INPUT);
    const second = await grantMilestone(baseDeps({ grantSeam: grant.seam, ledger: led.ledger }), INPUT);
    expect(first.status).toBe("granted");
    expect(first.goldStatus).toBe("applied");
    expect(second.status).toBe("duplicate");
    expect(second.goldStatus).toBe("skipped"); // marker-first: a duplicate never touches the ledger
    expect(led.calls).toHaveLength(1); // gold ledger hit exactly once
    expect(led.balance).toBe(100n); // ms_shop_intro gold (§18.3 D-053)
  });
});

describe("grantMilestone — reward composition (gold + exp + item → the right seams)", () => {
  test("ms_first_hunt: exp returned, gold via quest_reward ledger key, item via inventory seam", async () => {
    const grant = mockGrantSeam();
    const led = mockLedger();
    const inv = mockInventory();
    const deps = baseDeps({ grantSeam: grant.seam, ledger: led.ledger, inventory: inv.inventory });
    const out = await grantMilestone(deps, { ...INPUT, milestoneId: "ms_first_hunt" });

    expect(out.status).toBe("granted");
    expect(out.exp).toBe(160); // §18.1 ms_first_hunt EXP (caller applies to session progress)
    expect(out.gold).toBe(100);
    expect(led.calls[0]).toMatchObject({
      amount: 100n,
      reason: "quest_reward",
      refType: "milestone",
      refId: "ms_first_hunt",
      idempotencyKey: "milestone:acc1:ms_first_hunt",
    });
    expect(inv.calls[0]).toEqual([{ itemId: "con_small_potion", quantity: 3 }]);
    expect(out.granted).toEqual([{ itemId: "con_small_potion", quantity: 3 }]);
    expect(out.delivered).toEqual([]);
  });

  test("item overflow (bag full) → Delivery Box fallback (§18.2 system reward never lost)", async () => {
    const inv = mockInventory([{ itemId: "con_small_potion", quantity: 3 }]);
    const del = mockDelivery();
    const deps = baseDeps({ grantSeam: mockGrantSeam().seam, ledger: mockLedger().ledger, inventory: inv.inventory, delivery: del.delivery });
    const out = await grantMilestone(deps, { ...INPUT, milestoneId: "ms_first_hunt" });
    expect(out.granted).toEqual([]);
    expect(out.delivered).toEqual([{ itemId: "con_small_potion", quantity: 3 }]);
    expect(del.calls[0]).toEqual([{ itemId: "con_small_potion", quantity: 3 }]);
  });
});

describe("grantMilestone — gates", () => {
  test("unknown milestoneId → no_op + warns once", async () => {
    let warned: string | null = null;
    const out = await grantMilestone(baseDeps({ onUnknown: (id) => (warned = id) }), { ...INPUT, milestoneId: "ms_nope" });
    expect(out.status).toBe("no_op");
    expect(warned).toBe("ms_nope");
  });

  test("phase P2B milestone (ms_boss_first_kill) → no_op (not shipped in P2)", async () => {
    const grant = mockGrantSeam();
    const led = mockLedger();
    const out = await grantMilestone(baseDeps({ grantSeam: grant.seam, ledger: led.ledger }), { ...INPUT, milestoneId: "ms_boss_first_kill" });
    expect(out.status).toBe("no_op");
    expect(grant.calls).toHaveLength(0); // phase gate short-circuits BEFORE the marker (no state touched)
    expect(led.calls).toHaveLength(0);
  });

  test("no DB (all seams null) → granted, exp present, gold + items skipped", async () => {
    const out = await grantMilestone(baseDeps(), { ...INPUT, milestoneId: "ms_first_hunt" });
    expect(out.status).toBe("granted");
    expect(out.exp).toBe(160);
    expect(out.goldStatus).toBe("skipped");
    expect(out.granted).toEqual([]);
  });
});
