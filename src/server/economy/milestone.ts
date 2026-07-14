// C1 — milestone reward orchestration (Economy §18). **PURE + SERVER-AUTHORITATIVE, never-downgrade zone
// (economy grants — idempotency must be bulletproof).** Depends only on injected seams (grant marker / ledger /
// inventory / delivery) → unit-tested with fakes, **never touches a real DB / .env**. The wiring that supplies
// the real Prisma seams lives in server/economy/milestones.ts (mirrors kill-reward.ts ↔ kill-rewards.ts).
//
// Grant order (§18.2 "Grant Transaction ต้อง Idempotent") = **MARKER-FIRST (at-most-once)**:
//   1. record the one-time (account, milestone) marker — a FRESH marker is the gate; a duplicate = no-op.
//   2. only a fresh marker proceeds to grant Gold (idempotent ledger key `milestone:{acct}:{ms}`, reason
//      `quest_reward`) + Item (bag → Delivery Box fallback, §18.2 "system reward ห้ามหาย").
// The item grant (grantItems) is NOT itself idempotent, so marker-first guarantees at-most-once (never
// double-grants the potions). Tradeoff: a crash/DB-error between the marker and the reward under-grants that
// milestone (marker blocks the retry) — chosen deliberately over the worse failure of double-granting items.
// Gold stays idempotent via the ledger key regardless, as defence-in-depth.

import type { ItemMeta } from "./kill-reward";

/** §18.1 trigger event → milestoneId(s). Pure — the caller (MapRoom hooks) supplies the event. */
export type MilestoneTrigger =
  | { kind: "mob_kill"; mobClass: "normal" | "elite" | "boss" }
  | { kind: "storage_open" } // §18.1 "เปิดคลังครั้งแรก"
  | { kind: "shop_transaction" } // §18.1 "ซื้อ/ขายครั้งแรก" (buy OR sell)
  | { kind: "intro_complete" } // §18.1 "จบ Intro" — no tutorial system in P2 (mapping only, no live hook)
  | { kind: "map1_complete" } // §18.1 "จบ Main Map 1" — no main-quest system in P2 (mapping only)
  | { kind: "enhancement_ready" } // §18.1 "ก่อนทดลองตีบวก" — enhancement inert in P2 (R8) (mapping only)
  | { kind: "enhancement_success" }; // §18.1 "ตีบวกสำเร็จครั้งแรก" — no success possible in P2 (R8) (mapping only)

/**
 * §18.1 trigger→milestone mapping (verbatim from the table). A `mob_kill` maps to `ms_first_hunt` for ANY mob
 * (an elite is a hunt too, so the very first kill always fires it) plus `ms_first_elite` for an elite; a boss
 * kill maps to `ms_boss_first_kill` (phase-gated to P2B inside grantMilestone → not granted live in P2).
 */
export function milestonesForTrigger(trigger: MilestoneTrigger): string[] {
  switch (trigger.kind) {
    case "mob_kill":
      if (trigger.mobClass === "boss") return ["ms_boss_first_kill"];
      if (trigger.mobClass === "elite") return ["ms_first_hunt", "ms_first_elite"];
      return ["ms_first_hunt"];
    case "storage_open":
      return ["ms_storage_intro"];
    case "shop_transaction":
      return ["ms_shop_intro"];
    case "intro_complete":
      return ["ms_intro_complete"];
    case "map1_complete":
      return ["ms_map1_complete"];
    case "enhancement_ready":
      return ["ms_enhancement_ready"];
    case "enhancement_success":
      return ["ach_first_upgrade"];
  }
}

/** milestone reward the orchestrator reads (structural subset of MilestoneReward — server/config/types.ts). */
export interface MilestoneRewardView {
  milestoneId: string;
  /** only "P2" grants live; "P2B" is not shipped (mirror kill-rewards.ts phase gate). */
  phase: string;
  exp: number;
  gold: number;
  items: { itemId: string; quantity: number }[];
}

/** idempotency marker seam — record the one-time grant. true = FRESH (first time), false = already granted. */
export interface MilestoneGrantSeam {
  recordGrant(input: { accountId: string; characterId: string; milestoneId: string }): Promise<boolean>;
}

/** gold ledger seam (reason `quest_reward`, §18.2) — null = no DB → gold skipped. */
export interface MilestoneLedgerSeam {
  appendEntry(entry: {
    characterId: string;
    currency: "gold";
    amount: bigint;
    reason: "quest_reward";
    refType?: string;
    refId?: string;
    idempotencyKey: string;
  }): Promise<{ status: "applied" | "duplicate" | "insufficient_funds"; balance: bigint }>;
}

/** item grant seam (structural subset of InventoryRepository.grantItems) — null = no DB → items skipped. */
export interface MilestoneInventorySeam {
  grantItems(input: {
    accountId: string;
    characterId: string;
    capacity: number;
    grants: readonly { itemId: string; quantity: number; stackable: boolean; uniqueEquipGroup: string | null }[];
  }): Promise<{ granted: { itemId: string; quantity: number }[]; overflow: { itemId: string; quantity: number }[] }>;
}

/** delivery-box fallback seam (§18.2 overflow → Delivery Box) — null = no DB → overflow reported, not persisted. */
export interface MilestoneDeliverySeam {
  createEntry(input: { accountId: string; items: readonly { itemId: string; quantity: number }[] }): Promise<void>;
}

export interface MilestoneDeps {
  config: readonly MilestoneRewardView[];
  /** null = no DB → the process-local `memoryGrants` set is the idempotency gate instead. */
  grantSeam: MilestoneGrantSeam | null;
  ledger: MilestoneLedgerSeam | null;
  inventory: MilestoneInventorySeam | null;
  delivery: MilestoneDeliverySeam | null;
  /** process-local idempotency set (no-DB mode) — key `${accountId}:${milestoneId}`. */
  memoryGrants: Set<string>;
  itemMeta: (itemId: string) => ItemMeta;
  capacity: number;
  /** warn-once sink for an unknown milestoneId (config lookup miss). */
  onUnknown: (milestoneId: string) => void;
}

export interface MilestoneGrantInput {
  accountId: string;
  characterId: string;
  milestoneId: string;
  /** carried for the caller's context/telemetry — idempotency is the marker, not this. */
  sessionId: string;
}

export type MilestoneGoldStatus = "applied" | "duplicate" | "skipped";
export type MilestoneStatus = "granted" | "duplicate" | "no_op";

export interface MilestoneGrantOutcome {
  /** granted = fresh grant (rewards applied) · duplicate = already granted (idempotent replay) · no_op = unknown/non-P2. */
  status: MilestoneStatus;
  milestoneId: string;
  /** milestone EXP the caller applies to session progress (via applyExpGain). 0 unless granted. */
  exp: number;
  gold: number;
  goldStatus: MilestoneGoldStatus;
  /** items that landed in the bag this grant. */
  granted: { itemId: string; quantity: number }[];
  /** items that overflowed the bag → Delivery Box (§18.2). */
  delivered: { itemId: string; quantity: number }[];
}

/** grant one milestone's reward, idempotent (§18.2). Best-effort per seam (a null seam skips that part). */
export async function grantMilestone(
  deps: MilestoneDeps,
  input: MilestoneGrantInput,
): Promise<MilestoneGrantOutcome> {
  const cfg = deps.config.find((m) => m.milestoneId === input.milestoneId);
  if (!cfg) {
    deps.onUnknown(input.milestoneId);
    return noOp(input.milestoneId);
  }
  // phase gate — only P2 milestones grant live (P2B = Story Boss / not shipped; mirror kill-rewards.ts).
  if (cfg.phase !== "P2") return noOp(cfg.milestoneId);

  // 1) IDEMPOTENCY MARKER (at-most-once). DB seam or process-local set — a duplicate short-circuits everything.
  const fresh = await claimGrant(deps, input);
  if (!fresh) {
    return {
      status: "duplicate",
      milestoneId: cfg.milestoneId,
      exp: 0,
      gold: cfg.gold,
      goldStatus: "skipped",
      granted: [],
      delivered: [],
    };
  }

  // 2) GOLD — reason quest_reward, idempotencyKey milestone:{acct}:{ms} (§18.2). skip when 0 / no DB.
  let goldStatus: MilestoneGoldStatus = "skipped";
  if (deps.ledger && cfg.gold > 0) {
    const res = await deps.ledger.appendEntry({
      characterId: input.characterId,
      currency: "gold",
      amount: BigInt(cfg.gold),
      reason: "quest_reward",
      refType: "milestone",
      refId: cfg.milestoneId,
      idempotencyKey: `milestone:${input.accountId}:${cfg.milestoneId}`,
    });
    goldStatus = res.status === "insufficient_funds" ? "skipped" : res.status;
  }

  // 3) ITEMS — bag → Delivery Box fallback (§18.2 system reward ห้ามหาย). skip when none / no DB.
  let granted: { itemId: string; quantity: number }[] = [];
  let delivered: { itemId: string; quantity: number }[] = [];
  if (cfg.items.length > 0 && deps.inventory) {
    const outcome = await deps.inventory.grantItems({
      accountId: input.accountId,
      characterId: input.characterId,
      capacity: deps.capacity,
      grants: cfg.items.map((it) => {
        const meta = deps.itemMeta(it.itemId);
        return {
          itemId: it.itemId,
          quantity: it.quantity,
          stackable: meta.stackable,
          uniqueEquipGroup: meta.uniqueEquipGroup,
        };
      }),
    });
    granted = outcome.granted;
    if (outcome.overflow.length > 0) {
      if (deps.delivery) await deps.delivery.createEntry({ accountId: input.accountId, items: outcome.overflow });
      delivered = outcome.overflow; // reported either way (persisted only when a delivery seam is present)
    }
  }

  return { status: "granted", milestoneId: cfg.milestoneId, exp: cfg.exp, gold: cfg.gold, goldStatus, granted, delivered };
}

/** at-most-once marker: DB seam when present, else the process-local set (no-DB dev fires once per process). */
async function claimGrant(deps: MilestoneDeps, input: MilestoneGrantInput): Promise<boolean> {
  if (deps.grantSeam) {
    return deps.grantSeam.recordGrant({
      accountId: input.accountId,
      characterId: input.characterId,
      milestoneId: input.milestoneId,
    });
  }
  const key = `${input.accountId}:${input.milestoneId}`;
  if (deps.memoryGrants.has(key)) return false;
  deps.memoryGrants.add(key);
  return true;
}

function noOp(milestoneId: string): MilestoneGrantOutcome {
  return { status: "no_op", milestoneId, exp: 0, gold: 0, goldStatus: "skipped", granted: [], delivered: [] };
}
