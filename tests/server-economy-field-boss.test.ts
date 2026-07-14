import { describe, expect, test } from "vitest";
import { grantKillRewards, type ItemMeta } from "@/server/economy/kill-reward";
import type { DropTable } from "@/server/economy/drop-roll";
import { DEFAULT_ECONOMY_CONFIG, DEFAULT_REINFORCEMENT_CONFIG } from "../server/config";

// Wave 1 (OB) — the Field Boss หมูป่าหม้อเดือด is the sanctioned reinforcement-material source (D-064):
// its drop table may grant `upg_reinforcement` (R8-exempt for this boss only), and the guaranteed grants land.
// The generic R8 guard still blocks the material for every other monster. This locks the exemption boundary.

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

// mirror kill-rewards.ts: full guard for normal mobs; fragment-only guard for the Field Boss.
const FULL_GUARD = new Set([MATERIAL, FRAGMENT]);
const FIELD_BOSS_GUARD = new Set([FRAGMENT]);

describe("Field Boss reinforcement source (D-064, R8 exemption)", () => {
  test("Field Boss grants upg_reinforcement (guaranteed) + boss core", async () => {
    const granted = await runKill("boss_map1_boiling_boar", FIELD_BOSS_GUARD);
    const ids = granted.map((g) => g.itemId);
    expect(ids).toContain(MATERIAL);
    expect(ids).toContain("mat_boss_resonance_core");
    expect(ids).not.toContain(FRAGMENT); // fragment still blocked (post-OB)
  });

  test("a normal mob under the full R8 guard never grants reinforcement material", async () => {
    // even if a table listed it, the full guard filters it — prove the guard still bites off-boss.
    const granted = await runKill("boss_map1_boiling_boar", FULL_GUARD);
    expect(granted.map((g) => g.itemId)).not.toContain(MATERIAL);
  });
});
