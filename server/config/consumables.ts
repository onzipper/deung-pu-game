// PR5 — DEFAULT consumable config (server-authoritative Design Knob §48).
// Values copied verbatim from the cited § (never typed from memory — AI.md iron-rule #1).
//
// ⛔ SERVER-ONLY. Plain TS only.

import type { ConsumableEffect } from "../../src/server/inventory/consumable-service";

export interface ConsumableConfig {
  effects: Record<string, ConsumableEffect>;
}

export const DEFAULT_CONSUMABLE_CONFIG: ConsumableConfig = {
  effects: {
    // Economy spec §7.1 (LOCKED): ฟื้น 35% Max HP, CD 12s
    con_small_potion: { kind: "heal_pct_max_hp", healPctMaxHp: 0.35, cooldownMs: 12_000 },
  },
};
