// B4 — fragment exchange service (เศษเสริมแกร่ง 5 → เสริมแกร่ง 1). **PURE + SERVER-AUTHORITATIVE, never-downgrade
// zone (item conversion — no dupe).** Depends only on InventoryRepository + ItemCatalog + plain config → unit
// tested with the in-memory repo, no DB. Mirrors enhancement-service.ts.
//
// Transaction (Reinforcement §3.5): validate the fragment stack → held ≥ inputCount → spend inputCount → grant
// outputCount `upg_reinforcement`, all atomic in repo.commitFragmentExchange (FOR UPDATE + optimistic version).
//
// Idempotency / retry safety: the fragment stack's optimistic `version` IS the double-apply guard — the client
// sends the version it last saw; a network retry carries the now-stale version → TRANSACTION_CONFLICT (never a
// second 5→1). The wire `idempotencyKey` is carried for telemetry only (no dedup table — schema owner-gated).

import { VersionConflictError, type InventoryRepository } from "./repository";
import { buildSnapshot } from "./service";
import type { ItemCatalog } from "./item-catalog";
import type { InventorySnapshot } from "@/shared/net-protocol";

/**
 * reject reasons the server can produce:
 *   NO_DB (anonymous/dev — nothing to persist; set by the caller) · NOT_ENOUGH_FRAGMENTS (held < inputCount) ·
 *   INVENTORY_FULL (no bag room for the reinforcement) · TRANSACTION_CONFLICT (stale version / lost race).
 */
export type FragmentExchangeRejectReason =
  | "NO_DB"
  | "NOT_ENOUGH_FRAGMENTS"
  | "INVENTORY_FULL"
  | "TRANSACTION_CONFLICT";

export type FragmentExchangeResult =
  | { ok: true; consumed: number; grantedReinforcement: number; snapshot: InventorySnapshot }
  | { ok: false; reason: FragmentExchangeRejectReason };

/** exchange knobs the service reads (structural subset of ReinforcementConfig.fragment — §3.5). */
export interface FragmentExchangeRules {
  /** `upg_reinforcement_fragment` (§3.5). */
  fragmentMaterialId: string;
  /** `upg_reinforcement` (§3.1). */
  reinforcementMaterialId: string;
  /** §3.5 exchange input (5). */
  inputCount: number;
  /** §3.5 exchange output (1). */
  outputCount: number;
}

export interface FragmentExchangeDeps {
  repo: InventoryRepository;
  catalog: ItemCatalog;
  rules: FragmentExchangeRules;
}

export interface FragmentExchangeInput {
  characterId: string;
  accountId: string;
  /** the fragment stack instance the client is spending from. */
  instanceId: string;
  /** version the client last saw of that stack (optimistic lock + retry guard). */
  expectedVersion: number;
  /** client transaction id (telemetry; the version lock is the durable retry guard — see header). */
  idempotencyKey: string;
  /** bag capacity for the returned snapshot + the grant's free-slot check. */
  capacity: number;
}

/** run one 5→1 fragment exchange. Server-authoritative — the client only sends an intent. */
export async function exchangeFragments(
  deps: FragmentExchangeDeps,
  input: FragmentExchangeInput,
): Promise<FragmentExchangeResult> {
  const items = await deps.repo.listCharacterItems(input.characterId);

  const stack = items.find((r) => r.id === input.instanceId);
  if (!stack || stack.itemId !== deps.rules.fragmentMaterialId || stack.location !== "CHARACTER_INVENTORY") {
    return { ok: false, reason: "NOT_ENOUGH_FRAGMENTS" };
  }
  if (stack.version !== input.expectedVersion) return { ok: false, reason: "TRANSACTION_CONFLICT" };
  if (stack.quantity < deps.rules.inputCount) return { ok: false, reason: "NOT_ENOUGH_FRAGMENTS" };

  // the granted reinforcement carries the catalog's anti-dup stamp (materials → null).
  const reinforcementDef = deps.catalog.get(deps.rules.reinforcementMaterialId);
  const uniqueEquipGroup = reinforcementDef?.uniqueEquipGroup ?? null;

  let outcome;
  try {
    outcome = await deps.repo.commitFragmentExchange({
      accountId: input.accountId,
      characterId: input.characterId,
      fragmentInstanceId: stack.id,
      fragmentExpectedVersion: stack.version,
      consumeCount: deps.rules.inputCount,
      reinforcementItemId: deps.rules.reinforcementMaterialId,
      reinforcementQuantity: deps.rules.outputCount,
      reinforcementUniqueEquipGroup: uniqueEquipGroup,
      capacity: input.capacity,
    });
  } catch (err) {
    if (err instanceof VersionConflictError) return { ok: false, reason: "TRANSACTION_CONFLICT" };
    throw err; // strict: real DB error propagates
  }

  switch (outcome.status) {
    case "applied": {
      const fresh = await deps.repo.listCharacterItems(input.characterId);
      return {
        ok: true,
        consumed: deps.rules.inputCount,
        grantedReinforcement: outcome.grantedReinforcement,
        snapshot: buildSnapshot(fresh, input.capacity),
      };
    }
    case "insufficient":
      return { ok: false, reason: "NOT_ENOUGH_FRAGMENTS" };
    case "inventory_full":
      return { ok: false, reason: "INVENTORY_FULL" };
    case "conflict":
    default:
      return { ok: false, reason: "TRANSACTION_CONFLICT" };
  }
}
