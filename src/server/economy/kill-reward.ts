// P2-09 — mob-kill reward orchestration (Economy §9–§12). **SERVER-AUTHORITATIVE, never-downgrade zone
// (RNG + money + items).** Depends only on the pure resolvers (exp.ts / drop-roll.ts) + injected seams
// (ledger / inventory / drop-audit) → unit-tested with mocks, **never touches a real DB / .env**.
//
// One eligible kill (Economy §11.1 order):
//   1. EXP   → computeMonsterExp (level-diff §9.3 + party pool §9.4) → applyExpGain (level-up §9.1/§9.2).
//   2. Gold  → uniform roll in [goldMin, goldMax] → ledger.appendEntry (reason `drop`, idempotent §12.2).
//   3. Drops → rollDropTable → inventory.grantItems (bag; overflow = §12.5 no-silent-loss, caller signals).
//   4. Audit → one DropAudit row per roll/guaranteed grant (DoD 8: "drop ทุกชิ้นมี audit trail").
//
// The RNG draw order (gold → drops) is fixed regardless of DB presence so seeded tests are stable whether or
// not the ledger/inventory seams are wired. EXP persistence + client notify + combat-stat recompute happen in
// the caller (MapRoom) — this returns the computed new level/exp.

import type { RngFn } from "@/game/mob/rng";
import { applyExpGain, computeMonsterExp, type ExpCurve, type ExpGainResult } from "./exp";
import {
  rollDropTable,
  type DropAuditRecord,
  type DropTable,
  type EquipmentPool,
} from "./drop-roll";
import type { GrantItemsInput, GrantOutcome } from "../inventory/repository";

/** monster reward baseline the orchestrator reads (Economy §10.1) — structural subset of MonsterReward. */
export interface MonsterRewardView {
  monsterId: string;
  level: number;
  exp: number;
  goldMin: number;
  goldMax: number;
  dropTableId: string;
}

/** per-item metadata needed to build a grant request (from the item catalog, §12.1 stamp). */
export interface ItemMeta {
  stackable: boolean;
  uniqueEquipGroup: string | null;
}

/** ledger seam (structural subset of server/db/ledger.ts appendEntry) — null = no DB → gold skipped. */
export interface LedgerSeam {
  appendEntry(entry: {
    characterId: string;
    currency: "gold";
    amount: bigint;
    reason: "drop";
    refType?: string;
    refId?: string;
    idempotencyKey: string;
  }): Promise<{ status: "applied" | "duplicate" | "insufficient_funds"; balance: bigint }>;
}

/** inventory seam (structural subset of InventoryRepository.grantItems) — null = no DB → drops skipped. */
export interface InventorySeam {
  grantItems(input: GrantItemsInput): Promise<GrantOutcome>;
}

/** one DropAudit row (schema.prisma DropAudit — §50.1 field names). */
export interface DropAuditRow {
  characterId: string;
  mobType: string;
  dropTableVersion: number;
  rngRoll: number;
  resultItemId: string | null;
}

/** drop-audit seam (append-only writer) — null = no DB → audit skipped. */
export interface DropAuditSeam {
  write(rows: readonly DropAuditRow[]): Promise<void>;
}

export interface KillRewardDeps {
  reward: MonsterRewardView;
  dropTable: DropTable;
  pools: readonly EquipmentPool[];
  /** item ids that must never be granted (Kraeng/reinforcement guard, R8). */
  excludedItemIds: ReadonlySet<string>;
  /** catalog lookup → stackable + uniqueEquipGroup for a granted item id. */
  itemMeta: (itemId: string) => ItemMeta;
  expCurve: ExpCurve;
  rng: RngFn;
  /** DropAudit.dropTableVersion = economy config version in effect. */
  dropTableVersion: number;
  ledger: LedgerSeam | null;
  inventory: InventorySeam | null;
  dropAudit: DropAuditSeam | null;
}

export interface KillContext {
  characterId: string;
  accountId: string;
  /** engine mobType (DropAudit.mob_type). */
  mobType: string;
  playerLevel: number;
  /** current total cumulative EXP (Character.exp). */
  playerExp: number;
  /** eligible party members for the pool (§9.4). 1 = solo. */
  eligibleMembers: number;
  capacity: number;
  /** unique id for this kill (ledger idempotency + audit ref) — the caller generates it once per kill. */
  killEventId: string;
}

export type GoldStatus = "applied" | "duplicate" | "insufficient_funds" | "skipped";

export interface KillRewardOutcome {
  /** new level/exp after the EXP gain (caller persists + notifies). */
  exp: ExpGainResult;
  /** EXP awarded this kill (post level-diff / party). */
  expGained: number;
  goldRolled: number;
  goldStatus: GoldStatus;
  /** ledger balance after the gold entry, or null when skipped. */
  goldBalance: bigint | null;
  granted: { itemId: string; quantity: number }[];
  /** items that did not fit the bag (§12.5) — caller signals inventory_full (not persisted). */
  overflow: { itemId: string; quantity: number }[];
  /** audit rows produced (also written to the seam when present). */
  audits: DropAuditRecord[];
}

/** run the full reward grant for one eligible kill. Best-effort per seam (a null seam skips that part). */
export async function grantKillRewards(
  deps: KillRewardDeps,
  ctx: KillContext,
): Promise<KillRewardOutcome> {
  // 1) EXP — level-diff (§9.3) + party pool (§9.4), then roll across level thresholds (§9.2, cap §9.1).
  const expGained = computeMonsterExp({
    baseExp: deps.reward.exp,
    monsterLevel: deps.reward.level,
    playerLevel: ctx.playerLevel,
    curve: deps.expCurve,
    eligibleMembers: ctx.eligibleMembers,
  });
  const exp = applyExpGain({
    level: ctx.playerLevel,
    exp: ctx.playerExp,
    gained: expGained,
    curve: deps.expCurve,
  });

  // 2) GOLD — uniform integer in [goldMin, goldMax] (draw first so the drop RNG stream is DB-independent).
  const goldRolled = rollGold(deps.reward.goldMin, deps.reward.goldMax, deps.rng);
  let goldStatus: GoldStatus = "skipped";
  let goldBalance: bigint | null = null;
  if (deps.ledger && goldRolled > 0) {
    const res = await deps.ledger.appendEntry({
      characterId: ctx.characterId,
      currency: "gold",
      amount: BigInt(goldRolled),
      reason: "drop",
      refType: "drop",
      refId: ctx.killEventId,
      idempotencyKey: `drop-gold:${ctx.killEventId}`,
    });
    goldStatus = res.status;
    goldBalance = res.balance;
  }

  // 3) DROPS — roll the table, then insert into the bag (overflow returned, not persisted).
  const roll = rollDropTable(deps.dropTable, deps.pools, deps.rng, {
    excludedItemIds: deps.excludedItemIds,
  });
  let granted: { itemId: string; quantity: number }[] = [];
  let overflow: { itemId: string; quantity: number }[] = [];
  if (deps.inventory && roll.grants.length > 0) {
    const outcome = await deps.inventory.grantItems({
      accountId: ctx.accountId,
      characterId: ctx.characterId,
      capacity: ctx.capacity,
      grants: roll.grants.map((g) => {
        const meta = deps.itemMeta(g.itemId);
        return {
          itemId: g.itemId,
          quantity: g.quantity,
          stackable: meta.stackable,
          uniqueEquipGroup: meta.uniqueEquipGroup,
        };
      }),
    });
    granted = outcome.granted;
    overflow = outcome.overflow;
  } else {
    overflow = roll.grants.map((g) => ({ itemId: g.itemId, quantity: g.quantity }));
  }

  // 4) AUDIT — every roll/guaranteed record (hit or miss). resultItemId reflects the roll, not the bag fit.
  if (deps.dropAudit && roll.audits.length > 0) {
    await deps.dropAudit.write(
      roll.audits.map((a) => ({
        characterId: ctx.characterId,
        mobType: ctx.mobType,
        dropTableVersion: deps.dropTableVersion,
        rngRoll: a.rngRoll,
        resultItemId: a.resultItemId,
      })),
    );
  }

  return { exp, expGained, goldRolled, goldStatus, goldBalance, granted, overflow, audits: roll.audits };
}

/** uniform integer gold in [min, max] inclusive from one rng draw (§12.2 "Server Roll Gold"). */
function rollGold(min: number, max: number, rng: RngFn): number {
  const lo = Math.floor(min);
  const hi = Math.floor(max);
  if (hi <= lo) return Math.max(0, lo);
  return lo + Math.floor(rng() * (hi - lo + 1));
}
