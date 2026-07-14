import { describe, expect, test } from "vitest";
import { grantKillRewards, type ItemMeta } from "@/server/economy/kill-reward";
import type { DropTable } from "@/server/economy/drop-roll";
import { DEFAULT_ECONOMY_CONFIG, DEFAULT_REINFORCEMENT_CONFIG } from "../server/config";

// B4 (Reinforcement §4.2/§3.5) — the Field Boss หมูป่าหม้อเดือด is the reinforcement source, but the material +
// fragment come from the dedicated PITY PATH (server/economy/reinforcement-pity.ts), NOT the drop table. This
// file locks the boundary: the GENERIC drop roll grants the boss core + gear but NEVER the reinforcement/fragment
// ids for ANY monster (Field Boss included) — the R8 guard is now uniform (no per-boss exemption). The pity
// ladder + fragment roll are proven in server-reinforcement-pity.test.ts.

const MATERIAL = DEFAULT_REINFORCEMENT_CONFIG.materialId; // upg_reinforcement
const FRAGMENT = DEFAULT_REINFORCEMENT_CONFIG.fragment.materialId; // upg_reinforcement_fragment

const CATALOG = new Map(DEFAULT_ECONOMY_CONFIG.dropTables.map((t) => [t.dropTableId, t]));
const REWARDS = new Map(DEFAULT_ECONOMY_CONFIG.monsterRewards.map((r) => [r.monsterId, r]));

/** every itemId is a stackable material for this test (grant path only needs stackable + group). */
const itemMeta = (): ItemMeta => ({ stackable: true, uniqueEquipGroup: null });

/** capture what grantItems was asked to insert (no DB). */
function captureInventory() {
  const granted: { itemId: string; quantity: number }[] = [];
  return {
    granted,
    seam: {
      async grantItems(input: { grants: readonly { itemId: string; quantity: number }[] }) {
        for (const g of input.grants) granted.push({ itemId: g.itemId, quantity: g.quantity });
        return { granted: input.grants.map((g) => ({ itemId: g.itemId, quantity: g.quantity })), overflow: [] };
      },
    },
  };
}

async function runKill(monsterId: string, excludedItemIds: ReadonlySet<string>) {
  const reward = REWARDS.get(monsterId)!;
  const dropTable = CATALOG.get(reward.dropTableId)! as DropTable;
  const inv = captureInventory();
  await grantKillRewards(
    {
      reward: { monsterId: reward.monsterId, level: reward.level, exp: reward.exp, goldMin: reward.goldMin, goldMax: reward.goldMax, dropTableId: reward.dropTableId },
      dropTable,
      pools: DEFAULT_ECONOMY_CONFIG.equipmentPools,
      excludedItemIds,
      itemMeta,
      expCurve: DEFAULT_ECONOMY_CONFIG.expCurve,
      rng: () => 0, // 0 → every chance roll hits, guaranteed always grant
      dropTableVersion: 1,
      ledger: null,
      inventory: inv.seam,
      dropAudit: null,
      delivery: null,
    },
    { characterId: "c1", accountId: "a1", mobType: "boss_boiling_boar", playerLevel: 6, playerExp: 0, eligibleMembers: 1, capacity: 40, killEventId: "k1" },
  );
  return inv.granted;
}

// post-B4: the guard is uniform — BOTH reinforcement + fragment ids are excluded from the generic roll for every
// monster, the Field Boss included (they come from the pity path).
const FULL_GUARD = new Set([MATERIAL, FRAGMENT]);

describe("Field Boss generic loot (B4 — reinforcement moved to the pity path)", () => {
  test("Field Boss generic drop grants the boss core (guaranteed) but NOT reinforcement/fragment", async () => {
    const granted = await runKill("boss_map1_boiling_boar", FULL_GUARD);
    const ids = granted.map((g) => g.itemId);
    expect(ids).toContain("mat_boss_resonance_core");
    expect(ids).not.toContain(MATERIAL); // §4.2 reinforcement = pity path, not the drop table
    expect(ids).not.toContain(FRAGMENT); // §3.5 fragment = pity path, not the drop table
  });

  test("the R8 guard suppresses reinforcement even if a table listed it (defence-in-depth, off-boss too)", async () => {
    const granted = await runKill("boss_map1_boiling_boar", FULL_GUARD);
    expect(granted.map((g) => g.itemId)).not.toContain(MATERIAL);
  });
});
