// PR5 — server-authoritative consumable use (heal potion), shared by manual play + the bot. Pure orchestration
// over the inventory seam (never touches Prisma) → unit-tested with the in-memory repo. **never-downgrade zone**
// (items are money-like): the consume COMMITS before any heal is computed/returned, so a failed consume heals
// nothing and changes nothing (mirrors shop.ts sell: consume-then-effect). The heal amount + cooldown are Design
// Knobs read from config (server/config/consumables.ts · Economy §7.1 LOCKED) — never hardcoded here.

import {
  VersionConflictError,
  type ConsumeForSaleInput,
  type ItemInstanceRecord,
} from "./repository";
import type { ItemCatalog } from "./item-catalog";

/** heal effect of a consumable (Economy §7.1): restore a % of Max HP, then lock use for cooldownMs. */
export interface ConsumableEffectHeal {
  kind: "heal_pct_max_hp";
  healPctMaxHp: number; // 0.35 for con_small_potion
  cooldownMs: number; // 12_000
}
export type ConsumableEffect = ConsumableEffectHeal;
/** itemId → its effect (config-driven Design Knob), or undefined = no effect defined (fail closed). */
export type ConsumableEffectLookup = (itemId: string) => ConsumableEffect | undefined;

/** inventory seam (structural subset of the repository): read the bag + version-guarded consume. */
export interface ConsumableInventorySeam {
  listCharacterItems(characterId: string): Promise<ItemInstanceRecord[]>;
  consumeForSale(input: ConsumeForSaleInput): Promise<void>;
}

/** reject codes useConsumable can produce. */
export type UseConsumableReject =
  | "unknown_item"
  | "no_effect"
  | "on_cooldown"
  | "hp_already_full"
  | "no_stock"
  | "version_conflict";

/**
 * how the caller selects the item to consume:
 *  • by instance — the manual client path: an exact instanceId + the version the client saw (stale ⟹ conflict).
 *  • by item — the bot path: the first bag stack of that itemId, consumed at its LIVE version.
 */
export type ConsumableSelector =
  | { by: "instance"; instanceId: string; expectedVersion: number }
  | { by: "item"; itemId: string };

export interface UseConsumableInput {
  characterId: string;
  selector: ConsumableSelector;
  hp: number;
  maxHp: number;
  nowMs: number;
  /** caller-owned per-actor cooldown value (the actor's next-allowed-use time, ms). */
  cooldownUntilMs: number;
}

export type UseConsumableResult =
  | {
      ok: true;
      itemId: string;
      consumedInstanceId: string;
      healedBy: number;
      healedToHp: number;
      cooldownUntilMs: number;
    }
  | { ok: false; reason: UseConsumableReject };

/**
 * use one consumable, server-authoritative. STRICT ordering (never-downgrade): the consume COMMITS before any
 * heal is computed/returned, so a failed consume heals nothing and changes nothing. See the numbered steps.
 */
export async function useConsumable(
  inventory: ConsumableInventorySeam,
  catalog: ItemCatalog,
  effects: ConsumableEffectLookup,
  input: UseConsumableInput,
): Promise<UseConsumableResult> {
  // 1) per-actor cooldown gate — no read/consume while cooling down.
  if (input.cooldownUntilMs > input.nowMs) return { ok: false, reason: "on_cooldown" };
  // 2) no waste at full HP.
  if (input.hp >= input.maxHp) return { ok: false, reason: "hp_already_full" };

  // 3) resolve the bag instance + the version to consume at (by-instance = client version; by-item = LIVE).
  const items = await inventory.listCharacterItems(input.characterId);
  let resolved: { record: ItemInstanceRecord; expectedVersion: number };
  if (input.selector.by === "instance") {
    const { instanceId, expectedVersion } = input.selector;
    const record = items.find(
      (r) => r.id === instanceId && r.location === "CHARACTER_INVENTORY",
    );
    if (!record) return { ok: false, reason: "unknown_item" };
    resolved = { record, expectedVersion };
  } else {
    const { itemId } = input.selector;
    const record = items.find(
      (r) => r.itemId === itemId && r.location === "CHARACTER_INVENTORY" && r.quantity > 0,
    );
    if (!record) return { ok: false, reason: "no_stock" };
    resolved = { record, expectedVersion: record.version };
  }
  const { record, expectedVersion } = resolved;

  // 4) must be a catalogued consumable.
  const def = catalog.get(record.itemId);
  if (!def || def.kind !== "consumable") return { ok: false, reason: "unknown_item" };

  // 5) must have an effect defined (fail closed — no effect ⟹ never consume).
  const effect = effects(record.itemId);
  if (!effect) return { ok: false, reason: "no_effect" };

  // 6) COMMIT the consume (version-guarded). Only a lost optimistic race is a reject; any other error propagates.
  try {
    await inventory.consumeForSale({
      instanceId: record.id,
      expectedVersion,
      quantity: 1,
    });
  } catch (err) {
    if (err instanceof VersionConflictError) return { ok: false, reason: "version_conflict" };
    throw err;
  }

  // 7) consume committed → compute the heal (clamped to Max HP). healedBy = the actual restored amount.
  const rawHeal = Math.round(effect.healPctMaxHp * input.maxHp);
  const healedToHp = Math.min(input.maxHp, input.hp + rawHeal);
  const healedBy = healedToHp - input.hp;
  return {
    ok: true,
    itemId: record.itemId,
    consumedInstanceId: record.id,
    healedBy,
    healedToHp,
    cooldownUntilMs: input.nowMs + effect.cooldownMs,
  };
}
