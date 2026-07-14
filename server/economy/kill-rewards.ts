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
import { ECONOMY_CONFIG_DEF, loadEconomyConfig, type ConfigVersionSource } from "../config/loader";
import type { EconomyConfig, MonsterReward } from "../config/types";
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
  type DropDeliverySeam,
  type ItemMeta,
  type KillRewardOutcome,
  type MonsterRewardView,
} from "../../src/server/economy/kill-reward";
import type { DropTable } from "../../src/server/economy/drop-roll";
import { grantFieldBossReinforcementWired } from "./reinforcement-pity";

/**
 * engine mobType → economy monsterId (§10.1). mushroom = test-field placeholder (no economy reward → no drop).
 * Kept next to the config it bridges; the annotated pairs live in combat.ts/mob.ts/economy.ts.
 */
const MONSTER_ID_BY_MOB_TYPE: Readonly<Record<string, string>> = {
  slime: "mon_map1_slime",
  bird: "mon_map1_bird",
  boar: "mon_map1_boar",
  boar_elite: "elite_map1_boar_rampage",
  boss_boiling_boar: "boss_map1_boiling_boar", // Field Boss (D-064) — ship OB (phase P2)
};

/**
 * ITEM 3 (config DB override) — the economy Design Knobs one MapRoom runs with. `config` = the EconomyConfig
 * loaded once at room create (loader.ts DB `config_versions` override, or DEFAULT when no DB/on error); `version`
 * = the config_versions version stamped on DropAudit. Immutable per room after the single onCreate load — the
 * room passes its own bundle in, so drops/EXP/party thresholds all read from ONE consistent source (not the
 * module DEFAULT). No-DB rooms keep the DEFAULT bundle → behavior byte-identical to before this wiring.
 */
export interface RoomEconomyConfig {
  config: EconomyConfig;
  version: number;
}
/** the fallback bundle (in-code DEFAULT) — every room starts here and swaps to a DB bundle only if one loads. */
export const DEFAULT_ROOM_ECONOMY: RoomEconomyConfig = {
  config: DEFAULT_ECONOMY_CONFIG,
  version: ECONOMY_CONFIG_DEF.defaultVersion,
};

/**
 * ITEM 3 — load the room's economy config ONCE (best-effort). DATABASE_URL set → the active `config_versions`
 * row via loader.ts (which itself falls back to DEFAULT on missing/invalid payload/DB error); no DATABASE_URL →
 * DEFAULT silently. **Never throws** — any failure yields the DEFAULT bundle so a room always has a usable
 * config. MapRoom calls this once at onCreate (async, non-blocking) and treats the result as immutable for the
 * room's lifetime (no mid-room swaps). The real Prisma client is injected via the loader's structural seam.
 */
export async function loadRoomEconomy(): Promise<RoomEconomyConfig> {
  try {
    const source: ConfigVersionSource | null = process.env.DATABASE_URL
      ? (getPrisma() as unknown as ConfigVersionSource)
      : null;
    const loaded = await loadEconomyConfig(source);
    return { config: loaded.value, version: loaded.version };
  } catch {
    return DEFAULT_ROOM_ECONOMY; // best-effort — never break room create over config
  }
}

/** per-config lookup tables (reward + drop table by id) memoized by config identity → built once per config. */
interface EconomyTables {
  rewardByMonsterId: Map<string, MonsterReward>;
  dropTableById: Map<string, DropTable>;
}
const tablesByConfig = new WeakMap<EconomyConfig, EconomyTables>();
function economyTablesFor(config: EconomyConfig): EconomyTables {
  let t = tablesByConfig.get(config);
  if (!t) {
    t = {
      rewardByMonsterId: new Map(config.monsterRewards.map((r) => [r.monsterId, r])),
      dropTableById: new Map(config.dropTables.map((tbl) => [tbl.dropTableId, tbl as DropTable])),
    };
    tablesByConfig.set(config, t);
  }
  return t;
}

/**
 * C1 (Economy §18.1): engine mobType → milestone mob class (normal hunt / elite / boss) for milestone triggers.
 * Derived from the monsterId prefix (mon_/elite_/boss_) so it stays in lock-step with MONSTER_ID_BY_MOB_TYPE.
 * Unmapped / test mob (mushroom) → null (no milestone).
 */
export function mobClassForMobType(mobType: string): "normal" | "elite" | "boss" | null {
  const monsterId = MONSTER_ID_BY_MOB_TYPE[mobType];
  if (!monsterId) return null;
  if (monsterId.startsWith("boss_")) return "boss";
  if (monsterId.startsWith("elite_")) return "elite";
  return "normal";
}

/**
 * C2b (Achievement §10.1 identity): engine mobType → economy monsterId (mon_map1_slime / elite_map1_boar_rampage
 * / boss_map1_boiling_boar). Achievement filters key on the monsterId, not the engine mobType — the mob.killed
 * event must carry the mapped id. Unmapped / test mob → null.
 */
export function monsterIdForMobType(mobType: string): string | null {
  return MONSTER_ID_BY_MOB_TYPE[mobType] ?? null;
}

/**
 * R8 loot guard (defence-in-depth): the reinforcement + fragment ids must never come through the GENERIC drop
 * roll — not even for the Field Boss. B4 makes the Field Boss's reinforcement (§4.2 pity ladder) + fragment
 * (§3.5) come from the dedicated pity path (grantFieldBossReinforcementWired), NOT the drop table, so ALL
 * monsters (Field Boss included) exclude BOTH ids from the generic roll. (This supersedes the OB shortcut where
 * the drop table guaranteed `upg_reinforcement` directly and the Field Boss excluded only the fragment.)
 */
const EXCLUDED_ITEM_IDS: ReadonlySet<string> = new Set([
  DEFAULT_REINFORCEMENT_CONFIG.materialId,
  DEFAULT_REINFORCEMENT_CONFIG.fragment.materialId,
]);

/** Field Boss monsterId (D-064) — the sanctioned reinforcement source (§4.2 pity ladder wraps its kill). */
const FIELD_BOSS_MONSTER_ID = DEFAULT_REINFORCEMENT_CONFIG.bossId;

/** the player progression baseline table (D-055 §2) — DEFAULT fallback (rooms read this.economy.config instead). */
export const PLAYER_BASELINE_TABLE = DEFAULT_ECONOMY_CONFIG.playerBaseline;
/** the EXP curve (Economy §9) — DEFAULT fallback for MapRoom field init (rooms read this.economy.config.expCurve). */
export const EXP_CURVE = DEFAULT_ECONOMY_CONFIG.expCurve;
/** G-lite party reward knobs (Economy §9.4 + §10.2/§10.3) — DEFAULT fallback (rooms read this.economy.config). */
export const PARTY_REWARD_CONFIG = DEFAULT_ECONOMY_CONFIG.partyReward;

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

/**
 * ITEM 2 — §12.5 bag→Delivery Box fallback for kill loot (mirror the milestone deliverySeam in milestones.ts).
 * Overflow loot is persisted to the account's Delivery Box so it is never silently lost (before this, the room
 * only reported `lootOverflow` and the item was dropped). source `achievement_reward` = never-expiry (storage
 * §16.4) → strongest no-silent-loss guarantee, reusing the milestone seam's source.
 * ⚠️ FLAG(owner): a dedicated `loot_overflow` DeliverySource enum (schema change via §59.4) would be clearer
 *    than reusing `achievement_reward`; kept minimal for OB (no DB schema change without owner). Ground-loot
 *    entity (§12.5 "drop on the ground when bag full") = OUT OF SCOPE (deferred) — delivery is the safe fallback.
 */
const deliverySeam: DropDeliverySeam = {
  async createEntry(input) {
    await getPrisma().deliveryBoxEntry.create({
      data: { accountId: input.accountId, source: "achievement_reward", payload: { items: input.items } },
    });
  },
};

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

/** B4: reinforcement pity progress for the client (§4.2) — "ประกันบอส: pityCount/guaranteedAtClear". */
export interface ReinforcementProgressView {
  /** clears-since-drop AFTER this kill (0 right after a drop). */
  pityCount: number;
  /** §4.2 guaranteedAtClear (15) — the denominator of the pity display. */
  guaranteedAtClear: number;
}

/** KillRewardOutcome plus the Field Boss's reinforcement pity progress (present only on a Field Boss kill). */
export interface WiredKillRewardOutcome extends KillRewardOutcome {
  reinforcementProgress?: ReinforcementProgressView;
}

/**
 * grant one eligible kill's rewards. Returns null for an unmapped mobType or a non-P2 monster (boss = P2B, drop
 * not shipped in P2). EXP is always computed; gold/drops/audit run only when `persist` (DB + character). For the
 * Field Boss (§4.2 source) it also runs the reinforcement pity ladder + fragment roll (§3.5) and merges those
 * grants into the loot + attaches `reinforcementProgress`.
 */
export async function grantKillRewardsForMob(
  req: KillRewardRequest,
  economy: RoomEconomyConfig = DEFAULT_ROOM_ECONOMY,
): Promise<WiredKillRewardOutcome | null> {
  const monsterId = MONSTER_ID_BY_MOB_TYPE[req.mobType];
  if (!monsterId) return null;
  const { rewardByMonsterId, dropTableById } = economyTablesFor(economy.config);
  const reward = rewardByMonsterId.get(monsterId);
  if (!reward || reward.phase !== "P2") return null; // Story boss (P2B) / unknown → no live reward
  const dropTable = dropTableById.get(reward.dropTableId);
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

  // generic loot/EXP/gold — the reinforcement + fragment ids are always excluded (R8); they come from the
  // dedicated Field Boss pity path below, never the drop table.
  const outcome: WiredKillRewardOutcome = await grantKillRewards(
    {
      reward: rewardView,
      dropTable: dropTable as DropTable,
      pools: economy.config.equipmentPools,
      excludedItemIds: EXCLUDED_ITEM_IDS,
      itemMeta,
      expCurve: economy.config.expCurve,
      rng: Math.random,
      dropTableVersion: economy.version,
      ledger: wired ? { appendEntry: (e) => appendEntry(e) } : null,
      inventory: wired ? { grantItems: (input) => getInventoryRepository().grantItems(input) } : null,
      dropAudit: wired ? { write: writeDropAudit } : null,
      delivery: wired ? deliverySeam : null,
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

  // B4 — Field Boss reinforcement (§4.2 pity ladder) + fragment (§3.5). Per ACCOUNT per boss (D-064); each
  // eligible member's grant reads/writes its own pity row. The pity module picks Prisma vs in-memory + null grant
  // seams internally (no-DB dev tracks pity in memory, items not persisted). Grants merge into the kill loot so
  // the existing snapshot-refresh + loot toast pick them up; the pity progress rides `reinforcementProgress`.
  if (monsterId === FIELD_BOSS_MONSTER_ID) {
    const r = await grantFieldBossReinforcementWired({
      accountId: req.accountId,
      characterId: req.characterId,
      bossId: FIELD_BOSS_MONSTER_ID,
    });
    if (r.granted.length > 0) outcome.granted.push(...r.granted);
    if (r.delivered.length > 0) outcome.delivered.push(...r.delivered);
    if (r.overflow.length > 0) outcome.overflow.push(...r.overflow);
    outcome.reinforcementProgress = { pityCount: r.pityCount, guaranteedAtClear: r.guaranteedAtClear };
  }

  return outcome;
}
