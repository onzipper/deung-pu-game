import { describe, expect, test } from "vitest";
import {
  grantKillRewards,
  type DropAuditRow,
  type InventorySeam,
  type KillRewardDeps,
  type LedgerSeam,
  type MonsterRewardView,
} from "../src/server/economy/kill-reward";
import type { DropTable } from "../src/server/economy/drop-roll";
import type { GrantItemsInput, GrantOutcome } from "../src/server/inventory/repository";
import type { RngFn } from "../src/game/mob/rng";
import { DEFAULT_ECONOMY_CONFIG } from "../server/config";

// P2-09 — kill-reward orchestration (exp + gold + drops + audit). never-downgrade zone (RNG/money/items).
// All seams are mocked — ⛔ no real DB, no .env read.

const CURVE = DEFAULT_ECONOMY_CONFIG.expCurve;

function scriptedRng(values: number[]): RngFn {
  let i = 0;
  return () => (i < values.length ? values[i++] : values[values.length - 1]);
}

/** ledger mock: running balance + idempotency by key (mirrors appendEntry contract). */
function mockLedger() {
  const keys = new Set<string>();
  const calls: { amount: bigint; reason: string; idempotencyKey: string }[] = [];
  let balance = 0n;
  const ledger: LedgerSeam = {
    async appendEntry(e) {
      calls.push({ amount: e.amount, reason: e.reason, idempotencyKey: e.idempotencyKey });
      if (keys.has(e.idempotencyKey)) return { status: "duplicate", balance };
      keys.add(e.idempotencyKey);
      balance += e.amount;
      return { status: "applied", balance };
    },
  };
  return { ledger, calls, get balance() { return balance; } };
}

function mockInventory(outcome?: GrantOutcome) {
  const calls: GrantItemsInput[] = [];
  const inventory: InventorySeam = {
    async grantItems(input) {
      calls.push(input);
      if (outcome) return outcome;
      // default: everything fits.
      return { granted: input.grants.map((g) => ({ itemId: g.itemId, quantity: g.quantity })), overflow: [] };
    },
  };
  return { inventory, calls };
}

function mockAudit() {
  const rows: DropAuditRow[] = [];
  return { audit: { async write(r: readonly DropAuditRow[]) { rows.push(...r); } }, rows };
}

/** slime reward + table (2 rolls we control via scripted rng). */
const SLIME_REWARD: MonsterRewardView = {
  monsterId: "mon_map1_slime",
  level: 1,
  exp: 14,
  goldMin: 3,
  goldMax: 5,
  dropTableId: "drop_map1_slime_v1",
};
const SLIME_TABLE = DEFAULT_ECONOMY_CONFIG.dropTables.find((t) => t.dropTableId === "drop_map1_slime_v1")! as DropTable;

function baseDeps(over: Partial<KillRewardDeps> = {}): KillRewardDeps {
  return {
    reward: SLIME_REWARD,
    dropTable: SLIME_TABLE,
    pools: DEFAULT_ECONOMY_CONFIG.equipmentPools,
    excludedItemIds: new Set(["upg_reinforcement"]),
    itemMeta: (id) => ({ stackable: id.startsWith("mat_") || id.startsWith("con_"), uniqueEquipGroup: null }),
    expCurve: CURVE,
    rng: scriptedRng([0.0]),
    dropTableVersion: 1,
    ledger: null,
    inventory: null,
    dropAudit: null,
    ...over,
  };
}

const ctx = {
  characterId: "char1",
  accountId: "acc1",
  mobType: "slime",
  playerLevel: 1,
  playerExp: 0,
  eligibleMembers: 1,
  capacity: 40,
  killEventId: "kill-1",
};

describe("grantKillRewards — EXP + gold + audit on one kill", () => {
  test("gold rolled in [min,max] → ledger applied; audit written per roll; exp gained", async () => {
    const led = mockLedger();
    const inv = mockInventory();
    const aud = mockAudit();
    // draws: gold .0 → 3 (min). then rolls: material .0<70 hit, mat qty .0→1, potion .99 miss, equip .99 miss
    const rng = scriptedRng([0.0, 0.0, 0.0, 0.99, 0.99]);
    const deps = baseDeps({ ledger: led.ledger, inventory: inv.inventory, dropAudit: aud.audit, rng });
    const out = await grantKillRewards(deps, ctx);

    expect(out.goldRolled).toBe(3);
    expect(out.goldStatus).toBe("applied");
    expect(out.goldBalance).toBe(3n);
    expect(led.calls[0]).toMatchObject({ amount: 3n, reason: "drop", idempotencyKey: "drop-gold:kill-1" });

    // slime base 14, matched level → +14 exp, no level-up.
    expect(out.expGained).toBe(14);
    expect(out.exp).toMatchObject({ level: 1, exp: 14, leveledUp: false });

    // audit: one row per roll (3 rolls in slime table), regardless of hit/miss.
    expect(aud.rows).toHaveLength(SLIME_TABLE.rolls.length);
    expect(aud.rows.every((r) => r.mobType === "slime" && r.dropTableVersion === 1)).toBe(true);
    expect(aud.rows[0]).toMatchObject({ resultItemId: "mat_slime_gel" });

    // granted material went to inventory seam.
    expect(inv.calls).toHaveLength(1);
    expect(out.granted).toEqual([{ itemId: "mat_slime_gel", quantity: 1 }]);
  });

  test("idempotency: same killEventId granted twice → 2nd gold is duplicate (no double-credit)", async () => {
    const led = mockLedger();
    const deps = baseDeps({ ledger: led.ledger, inventory: mockInventory().inventory, dropAudit: mockAudit().audit, rng: scriptedRng([0.0, 0.0, 0.0, 0.99, 0.99]) });
    const first = await grantKillRewards(deps, ctx);
    const deps2 = baseDeps({ ledger: led.ledger, inventory: mockInventory().inventory, dropAudit: mockAudit().audit, rng: scriptedRng([0.0, 0.0, 0.0, 0.99, 0.99]) });
    const second = await grantKillRewards(deps2, ctx);
    expect(first.goldStatus).toBe("applied");
    expect(second.goldStatus).toBe("duplicate");
    expect(led.balance).toBe(3n); // credited once only
  });
});

describe("grantKillRewards — level-up crosses threshold", () => {
  test("a big base EXP rolls the player up a level and recomputes", async () => {
    const led = mockLedger();
    const deps = baseDeps({ reward: { ...SLIME_REWARD, exp: 200 }, ledger: led.ledger, rng: scriptedRng([0.0, 0.99, 0.99, 0.99]) });
    const out = await grantKillRewards(deps, { ...ctx, playerLevel: 1, playerExp: 0 });
    expect(out.expGained).toBe(200);
    expect(out.exp).toMatchObject({ level: 2, exp: 200, leveledUp: true, levelsGained: 1 });
  });
});

describe("grantKillRewards — inventory full (§12.5)", () => {
  test("overflow from the inventory seam is surfaced (no silent loss)", async () => {
    const overflow: GrantOutcome = { granted: [], overflow: [{ itemId: "mat_slime_gel", quantity: 1 }] };
    const inv = mockInventory(overflow);
    const deps = baseDeps({ ledger: mockLedger().ledger, inventory: inv.inventory, dropAudit: mockAudit().audit, rng: scriptedRng([0.0, 0.0, 0.0, 0.99, 0.99]) });
    const out = await grantKillRewards(deps, ctx);
    expect(out.granted).toEqual([]);
    expect(out.overflow).toEqual([{ itemId: "mat_slime_gel", quantity: 1 }]);
  });
});

describe("grantKillRewards — reinforcement never rolled (R8)", () => {
  test("an excluded id in the table is suppressed from grants + audited null", async () => {
    const kraengTable: DropTable = {
      dropTableId: "x",
      guaranteed: [],
      rolls: [{ rollId: "kraeng", chancePercent: 100, itemId: "upg_reinforcement", poolId: null, quantity: { min: 1, max: 1 } }],
    };
    const inv = mockInventory();
    const aud = mockAudit();
    const deps = baseDeps({ dropTable: kraengTable, inventory: inv.inventory, dropAudit: aud.audit, ledger: mockLedger().ledger, rng: scriptedRng([0.0, 0.0]) });
    const out = await grantKillRewards(deps, ctx);
    expect(out.granted).toEqual([]);
    expect(inv.calls).toHaveLength(0); // nothing to grant → seam not called
    expect(aud.rows[aud.rows.length - 1]).toMatchObject({ resultItemId: null });
  });
});

describe("grantKillRewards — no DB (all seams null) → EXP only", () => {
  test("exp computed, gold skipped, drops become overflow, audit not written", async () => {
    const deps = baseDeps({ rng: scriptedRng([0.0, 0.0, 0.0, 0.99, 0.99]) });
    const out = await grantKillRewards(deps, ctx);
    expect(out.expGained).toBe(14);
    expect(out.goldStatus).toBe("skipped");
    expect(out.goldBalance).toBeNull();
    expect(out.granted).toEqual([]);
    // the material that rolled becomes overflow (not persisted anywhere).
    expect(out.overflow).toEqual([{ itemId: "mat_slime_gel", quantity: 1 }]);
  });
});
