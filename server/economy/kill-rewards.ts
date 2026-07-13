// P2-09 — kill-reward wiring for MapRoom (pattern = server/inventory/inventory-state.ts).
//
// The pure orchestrator (src/server/economy/kill-reward.ts) is DB-agnostic; this thin layer resolves the engine
// `mobType` → economy monsterId (§10.1 identity), pulls the DEFAULT config Design Knobs, and injects the real
// Prisma seams (ledger / inventory repo / drop-audit). EXP is always computed (pure, in-memory levelling works
// with no DB); Gold + Drops + DropAudit are wired ONLY when `persist` is true (a character-bound session + DB) —
// the ledger is strict (would throw with no DB) so it must never run in dev/e2e.
//
// ⛔ SERVER-ONLY. mobType↔monsterId mapping is engine↔economy glue (annotated in src/engine/config/combat.ts +
//    server/config/economy.ts): keys "slime"/"bird"/"boar"/"boar_elite" ↔ mon_map1_*/elite_map1_boar_rampage.

import { DEFAULT_ECONOMY_CONFIG } from "../config/economy";
import { DEFAULT_REINFORCEMENT_CONFIG } from "../config/reinforcement";
import { ECONOMY_CONFIG_DEF } from "../config/loader";
import { getPrisma } from "../../src/server/db";
import { appendEntry } from "../db/ledger";
import {
  ITEM_CATALOG,
  INVENTORY_CAPACITY,
  getInventoryRepository,
  inventoryPersistenceAvailable,
} from "../inventory/inventory-state";
import {
  grantKillRewards,
  type DropAuditRow,
  type ItemMeta,
  type KillRewardOutcome,
  type MonsterRewardView,
} from "../../src/server/economy/kill-reward";
import type { DropTable } from "../../src/server/economy/drop-roll";

/**
 * engine mobType → economy monsterId (§10.1). mushroom = test-field placeholder (no economy reward → no drop).
 * Kept next to the config it bridges; the annotated pairs live in combat.ts/mob.ts/economy.ts.
 */
const MONSTER_ID_BY_MOB_TYPE: Readonly<Record<string, string>> = {
  slime: "mon_map1_slime",
  bird: "mon_map1_bird",
  boar: "mon_map1_boar",
  boar_elite: "elite_map1_boar_rampage",
};

/** DropAudit.dropTableVersion = economy config version in effect (in-code DEFAULT). */
const DROP_TABLE_VERSION = ECONOMY_CONFIG_DEF.defaultVersion;

/** Kraeng/reinforcement ids that must never be granted as loot in P2 (R8 defence-in-depth). */
const EXCLUDED_ITEM_IDS: ReadonlySet<string> = new Set([
  DEFAULT_REINFORCEMENT_CONFIG.materialId,
  DEFAULT_REINFORCEMENT_CONFIG.fragment.materialId,
]);

const REWARD_BY_MONSTER_ID = new Map(
  DEFAULT_ECONOMY_CONFIG.monsterRewards.map((r) => [r.monsterId, r]),
);
const DROP_TABLE_BY_ID = new Map(DEFAULT_ECONOMY_CONFIG.dropTables.map((t) => [t.dropTableId, t]));

/** the player progression baseline table (D-055 §2) — MapRoom folds it into per-level combat stats. */
export const PLAYER_BASELINE_TABLE = DEFAULT_ECONOMY_CONFIG.playerBaseline;
/** the EXP curve (Economy §9) — exposed for the client progress message (level floor/ceil). */
export const EXP_CURVE = DEFAULT_ECONOMY_CONFIG.expCurve;

function itemMeta(itemId: string): ItemMeta {
  const def = ITEM_CATALOG.get(itemId);
  if (!def) return { stackable: false, uniqueEquipGroup: null };
  return { stackable: def.stackable, uniqueEquipGroup: def.uniqueEquipGroup ?? null };
}

/** append-only DropAudit writer (best-effort at the caller boundary — a failed audit must not crash the room). */
async function writeDropAudit(rows: readonly DropAuditRow[]): Promise<void> {
  await getPrisma().dropAudit.createMany({
    data: rows.map((r) => ({
      characterId: r.characterId,
      mobType: r.mobType,
      dropTableVersion: r.dropTableVersion,
      rngRoll: r.rngRoll,
      resultItemId: r.resultItemId,
    })),
  });
}

export interface KillRewardRequest {
  mobType: string;
  /** "" when anonymous/dev (EXP still computed in-memory; gold/drops skipped). */
  characterId: string;
  accountId: string;
  playerLevel: number;
  playerExp: number;
  eligibleMembers: number;
  killEventId: string;
  /** true = character-bound session with a DB → wire gold/drop/audit seams; false = EXP-only. */
  persist: boolean;
}

/**
 * grant one eligible kill's rewards. Returns null for an unmapped mobType or a non-P2 monster (boss = P2B, drop
 * not shipped in P2). EXP is always computed; gold/drops/audit run only when `persist` (DB + character).
 */
export async function grantKillRewardsForMob(
  req: KillRewardRequest,
): Promise<KillRewardOutcome | null> {
  const monsterId = MONSTER_ID_BY_MOB_TYPE[req.mobType];
  if (!monsterId) return null;
  const reward = REWARD_BY_MONSTER_ID.get(monsterId);
  if (!reward || reward.phase !== "P2") return null; // boss (P2B) / unknown → no live reward in P2
  const dropTable = DROP_TABLE_BY_ID.get(reward.dropTableId);
  if (!dropTable) return null;

  const wired = req.persist && inventoryPersistenceAvailable() && req.characterId.length > 0;

  const rewardView: MonsterRewardView = {
    monsterId: reward.monsterId,
    level: reward.level,
    exp: reward.exp,
    goldMin: reward.goldMin,
    goldMax: reward.goldMax,
    dropTableId: reward.dropTableId,
  };

  return grantKillRewards(
    {
      reward: rewardView,
      dropTable: dropTable as DropTable,
      pools: DEFAULT_ECONOMY_CONFIG.equipmentPools,
      excludedItemIds: EXCLUDED_ITEM_IDS,
      itemMeta,
      expCurve: EXP_CURVE,
      rng: Math.random,
      dropTableVersion: DROP_TABLE_VERSION,
      ledger: wired ? { appendEntry: (e) => appendEntry(e) } : null,
      inventory: wired ? { grantItems: (input) => getInventoryRepository().grantItems(input) } : null,
      dropAudit: wired ? { write: writeDropAudit } : null,
    },
    {
      characterId: req.characterId,
      accountId: req.accountId,
      mobType: req.mobType,
      playerLevel: req.playerLevel,
      playerExp: req.playerExp,
      eligibleMembers: req.eligibleMembers,
      capacity: INVENTORY_CAPACITY,
      killEventId: req.killEventId,
    },
  );
}
