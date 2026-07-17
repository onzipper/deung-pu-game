import { describe, expect, test } from "vitest";
import {
  accumulateKill,
  emptyCounters,
  nextStepToward,
  pickTarget,
  rarityAtLeast,
  stopForForbiddenTargetInRange,
  stopForInventoryOverflow,
  stopForLowHp,
  findRareDrop,
  stopForStuck,
  throttledAttackCooldownMs,
  withinRange,
  type AgentMob,
} from "../server/bot/agent";

// Agent decision core (pure): target/throttle plus tier-neutral obstacle and event predicates.

const mob = (id: string, tx: number, ty: number, pocketId = "P", hp = 10, mobType = "slime"): AgentMob => ({
  id,
  mobType,
  tx,
  ty,
  hp,
  pocketId,
});

describe("target selection", () => {
  test("picks the nearest ALIVE mob in the bot's pocket", () => {
    const mobs = [mob("far", 10, 0), mob("near", 2, 0), mob("dead", 1, 0, "P", 0), mob("other", 1, 0, "Q")];
    const t = pickTarget({ tx: 0, ty: 0 }, mobs, "P");
    expect(t?.id).toBe("near");
  });
  test("empty pocket → null", () => {
    expect(pickTarget({ tx: 0, ty: 0 }, [mob("x", 1, 1, "Q")], "P")).toBeNull();
  });

  // M1 SELECTED_TYPES: an optional allow-list restricts targeting to the chosen mob types in the pocket.
  test("SELECTED_TYPES picks only an allowed type; other types in the pocket are skipped", () => {
    const mobs = [
      mob("bird-near", 1, 0, "P", 10, "bird"), // nearer, but a disallowed type
      mob("slime-far", 5, 0, "P", 10, "slime"), // farther, but the allowed type
    ];
    const t = pickTarget({ tx: 0, ty: 0 }, mobs, "P", new Set(["slime"]));
    expect(t?.id).toBe("slime-far");
  });
  test("SELECTED_TYPES with no matching type in the pocket → null (farm loop idles)", () => {
    const mobs = [mob("bird", 1, 0, "P", 10, "bird"), mob("boar", 2, 0, "P", 10, "boar")];
    expect(pickTarget({ tx: 0, ty: 0 }, mobs, "P", new Set(["slime"]))).toBeNull();
  });
  test("an undefined allow-list is ALL_IN_AREA (every bot-safe mob in the pocket)", () => {
    const mobs = [mob("bird", 1, 0, "P", 10, "bird"), mob("slime", 5, 0, "P", 10, "slime")];
    expect(pickTarget({ tx: 0, ty: 0 }, mobs, "P", undefined)?.id).toBe("bird");
  });
});

describe("range + movement", () => {
  test("withinRange", () => {
    expect(withinRange({ tx: 0, ty: 0 }, { tx: 3, ty: 4 }, 5)).toBe(true);
    expect(withinRange({ tx: 0, ty: 0 }, { tx: 3, ty: 4 }, 4.9)).toBe(false);
  });
  test("nextStepToward clamps to step, snaps when close", () => {
    const s = nextStepToward({ tx: 0, ty: 0 }, { tx: 10, ty: 0 }, 2);
    expect(s).toEqual({ tx: 2, ty: 0 });
    expect(nextStepToward({ tx: 0, ty: 0 }, { tx: 1, ty: 0 }, 2)).toEqual({ tx: 1, ty: 0 });
  });
});

describe("efficiency throttle (§6.2)", () => {
  test("cooldown ÷ efficiency = slower cadence", () => {
    expect(throttledAttackCooldownMs(1, 0.7)).toBeCloseTo(1000 / 0.7, 3);
    expect(throttledAttackCooldownMs(1, 1)).toBe(1000);
    // lower efficiency ⇒ longer gap ⇒ fewer kills than manual
    expect(throttledAttackCooldownMs(1, 0.6)).toBeGreaterThan(throttledAttackCooldownMs(1, 0.8));
    expect(throttledAttackCooldownMs(0, 0.7)).toBe(50); // floor
  });
});

describe("tier-neutral obstacle and event predicates", () => {
  test("#1 inventory overflow", () => {
    expect(stopForInventoryOverflow(1)).toBe("inventory_full");
    expect(stopForInventoryOverflow(0)).toBeNull();
  });
  test("#2 low hp (potion substitution) — fires above 0, not at death", () => {
    expect(stopForLowHp(0.1, 0.15)).toBe("low_hp");
    expect(stopForLowHp(0.15, 0.15)).toBe("low_hp");
    expect(stopForLowHp(0.5, 0.15)).toBeNull();
    expect(stopForLowHp(0, 0.15)).toBeNull(); // hp 0 = death path, not low_hp
  });
  test("rarity ordering", () => {
    expect(rarityAtLeast("rare", "rare")).toBe(true);
    expect(rarityAtLeast("epic", "rare")).toBe(true);
    expect(rarityAtLeast("uncommon", "rare")).toBe(false);
    expect(rarityAtLeast("common", "uncommon")).toBe(false);
    expect(rarityAtLeast("???", "rare")).toBe(false);
  });
  test("#6 rare/high-value drop", () => {
    const rarity = (id: string) => ({ gem: "rare", junk: "common" })[id];
    expect(findRareDrop(["junk", "gem"], rarity, "rare")).toEqual({ itemId: "gem" });
    expect(findRareDrop(["junk"], rarity, "rare")).toBeNull();
  });
  test("forbidden boss/elite/event target in range", () => {
    const mobs = [mob("elite", 3, 0, "B", 100, "elite_boar"), mob("slime", 1, 0)];
    const isForbidden = (type: string) => type.startsWith("boss_") || type.startsWith("elite_");
    expect(stopForForbiddenTargetInRange({ tx: 0, ty: 0 }, mobs, isForbidden, 8)).toBe("boss_or_event");
    expect(stopForForbiddenTargetInRange({ tx: 0, ty: 0 }, mobs, isForbidden, 2)).toBeNull();
    expect(stopForForbiddenTargetInRange({ tx: 0, ty: 0 }, [mob("s", 1, 0)], isForbidden, 8)).toBeNull();
  });
  test("#5 stuck", () => {
    expect(stopForStuck(6, 6)).toBe("stuck");
    expect(stopForStuck(5, 6)).toBeNull();
  });
});

describe("session counters", () => {
  test("accumulateKill folds gold/exp/kills/drops", () => {
    const c = emptyCounters();
    accumulateKill(c, 12, 30, [{ itemId: "mat", quantity: 2 }]);
    accumulateKill(c, 8, 20, [{ itemId: "mat", quantity: 1 }, { itemId: "gel", quantity: 3 }]);
    expect(c.killCount).toBe(2);
    expect(c.goldEarned).toBe(20);
    expect(c.expEarned).toBe(50);
    expect(c.drops).toEqual({ mat: 3, gel: 3 });
  });
});
