// P2-10 — guaranteed reinforcement service (เสริมแกร่งการันตี). **PURE + SERVER-AUTHORITATIVE, never-downgrade
// zone (item + combat stat).** Depends only on InventoryRepository + ItemCatalog + plain config values → unit
// tested with the in-memory repo, no DB.
//
// Transaction (Reinforcement §2.3, verbatim): validate item → level < max → material ≥ 1 → consume ×1 →
// level +1 → persist atomically. 100% success, NO RNG / fail / crack / repair / protection / gold cost.
//
// Server checks the `noReinforcement` flag first (R8/D-052): P2 ships this true → every request is rejected
// with NO_REINFORCEMENT (the whole system is inert until the boss arrives in P2B), yet the mechanism below is
// fully functional the moment the flag flips.
//
// Idempotency / retry safety: the target's optimistic `version` IS the double-apply guard — after a success the
// version is bumped, so a replay carrying the same expectedVersion is rejected (ITEM_LOCKED) and never +2s.
// The wire `idempotencyKey` is carried as the client's transaction id (telemetry / future persistent dedup);
// enhancement_logs has no idempotencyKey column (schema is owner-gated §59.4) — see the P2-10 report.

import {
  VersionConflictError,
  type InventoryRepository,
} from "./repository";
import { buildSnapshot } from "./service";
import type { ItemCatalog } from "./item-catalog";
import type { InventorySnapshot } from "@/shared/net-protocol";

/**
 * reject reasons = the canonical Reinforcement §2.4 UI states the server can produce:
 *   NO_ITEM (target missing / not owned / not equipment) · NO_REINFORCEMENT (flag off or no material) ·
 *   MAX_LEVEL (already at cap) · ITEM_LOCKED (optimistic-lock conflict / stale retry).
 */
export type EnhanceRejectReason = "NO_ITEM" | "NO_REINFORCEMENT" | "MAX_LEVEL" | "ITEM_LOCKED";

export type EnhanceResult =
  | { ok: true; newLevel: number; snapshot: InventorySnapshot }
  | { ok: false; reason: EnhanceRejectReason };

/** reinforcement rules the service reads (structural subset of ReinforcementConfig — server/config/types.ts). */
export interface ReinforcementRules {
  /** canonical material id spent per upgrade (`upg_reinforcement`, R10). */
  materialId: string;
  /** R8: true = system inert (Map 1 has no source until P2B) → reject with NO_REINFORCEMENT. */
  noReinforcement: boolean;
}

/** enhancement limits the service reads (structural subset of EnhancementCurveConfig). */
export interface EnhancementLimits {
  /** enhancement cap (D-048 = 15) — reject at level >= maxLevel. */
  maxLevel: number;
}

export interface EnhanceInput {
  characterId: string;
  /** target equipment instance to raise +1. */
  instanceId: string;
  /** version the client last saw of the target (optimistic lock — mismatch = ITEM_LOCKED). */
  expectedVersion: number;
  /** client transaction id (carried for telemetry; the version lock is the durable retry guard — see header). */
  idempotencyKey: string;
  /** bag capacity for the returned snapshot. */
  capacity: number;
}

export interface EnhanceDeps {
  repo: InventoryRepository;
  catalog: ItemCatalog;
  reinforcement: ReinforcementRules;
  limits: EnhancementLimits;
  /** enhancement/economy config version written to the audit row (nullable). */
  configVersion: number | null;
}

/** run one guaranteed reinforcement (+1). Server-authoritative — the client only sends an intent. */
export async function enhanceEquipment(
  deps: EnhanceDeps,
  input: EnhanceInput,
): Promise<EnhanceResult> {
  // R8/D-052: flag on = the whole feature is inert (no source in P2). Guarded first, before any read.
  if (deps.reinforcement.noReinforcement) return { ok: false, reason: "NO_REINFORCEMENT" };

  const items = await deps.repo.listCharacterItems(input.characterId);

  const target = items.find((r) => r.id === input.instanceId);
  if (!target) return { ok: false, reason: "NO_ITEM" };
  if (target.version !== input.expectedVersion) return { ok: false, reason: "ITEM_LOCKED" };

  // only equipment can be reinforced (materials/consumables reject as an invalid target).
  const def = deps.catalog.get(target.itemId);
  if (!def || def.kind !== "equipment") return { ok: false, reason: "NO_ITEM" };

  if (target.enhancementLevel >= deps.limits.maxLevel) return { ok: false, reason: "MAX_LEVEL" };

  // one `upg_reinforcement` stack in the bag with stock to spend.
  const material = items.find(
    (r) =>
      r.itemId === deps.reinforcement.materialId &&
      r.location === "CHARACTER_INVENTORY" &&
      r.quantity >= 1,
  );
  if (!material) return { ok: false, reason: "NO_REINFORCEMENT" };

  const nextLevel = target.enhancementLevel + 1;
  try {
    await deps.repo.commitEnhancement({
      target: { instanceId: target.id, expectedVersion: target.version, nextLevel },
      material: { instanceId: material.id, expectedVersion: material.version },
      log: {
        characterId: input.characterId,
        itemInstanceId: target.id,
        beforeLevel: target.enhancementLevel,
        afterLevel: nextLevel,
        configVersion: deps.configVersion,
      },
    });
  } catch (err) {
    // lost the optimistic race (target moved / material spent concurrently) → resync, never fake success.
    if (err instanceof VersionConflictError) return { ok: false, reason: "ITEM_LOCKED" };
    throw err; // strict: DB error propagates
  }

  const fresh = await deps.repo.listCharacterItems(input.characterId);
  return { ok: true, newLevel: nextLevel, snapshot: buildSnapshot(fresh, input.capacity) };
}
