import { describe, expect, test } from "vitest";
import {
  grantKillRewardsForMob,
  loadRoomEconomy,
  DEFAULT_ROOM_ECONOMY,
  type RoomEconomyConfig,
} from "../server/economy/kill-rewards";
import { DEFAULT_ECONOMY_CONFIG } from "../server/config";
import type { EconomyConfig } from "../server/config/types";

// ITEM 3 (config DB override) — the room's EconomyConfig bundle (loader DB override, else DEFAULT) flows into the
// kill-reward path: reward/EXP/drops/version all read from the passed bundle, not the module DEFAULT. persist:false
// → EXP-only (wired=false short-circuits before any env/DB access) → these tests never touch a DB / read .env.

function req(mobType: string) {
  return {
    mobType,
    characterId: "",
    accountId: "",
    playerLevel: 1,
    playerExp: 0,
    eligibleMembers: 1,
    killEventId: "k1",
    persist: false,
  };
}

describe("ITEM 3 — kill rewards honor the room's economy config bundle", () => {
  test("no bundle arg → DEFAULT config exp for the monster", async () => {
    const out = await grantKillRewardsForMob(req("slime"));
    const slime = DEFAULT_ECONOMY_CONFIG.monsterRewards.find((r) => r.monsterId === "mon_map1_slime")!;
    expect(out?.expGained).toBe(slime.exp); // matched level (1 vs 1) → full base
  });

  test("a custom bundle's monster exp is picked up (override, not DEFAULT)", async () => {
    // clone DEFAULT + bump slime exp → the outcome must reflect the DB-config value, proving the swap wired through.
    const custom: EconomyConfig = {
      ...DEFAULT_ECONOMY_CONFIG,
      monsterRewards: DEFAULT_ECONOMY_CONFIG.monsterRewards.map((r) =>
        r.monsterId === "mon_map1_slime" ? { ...r, exp: 999 } : r,
      ),
    };
    const bundle: RoomEconomyConfig = { config: custom, version: 7 };
    const out = await grantKillRewardsForMob(req("slime"), bundle);
    expect(out?.expGained).toBe(999); // custom config value, not the DEFAULT 14
  });
});

describe("ITEM 3 — loadRoomEconomy fallback (no DB → DEFAULT silently, never throws)", () => {
  test("no DATABASE_URL → DEFAULT bundle", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const bundle = await loadRoomEconomy();
      expect(bundle.config).toBe(DEFAULT_ECONOMY_CONFIG);
      expect(bundle.version).toBe(DEFAULT_ROOM_ECONOMY.version);
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });
});
