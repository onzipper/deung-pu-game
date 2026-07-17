import { describe, expect, test } from "vitest";
import { planTownPressure, type TownPressureInput } from "../server/bot/town-pressure";

// M2a (D-073) proactive town-pressure planner (pure): deterministic per-sample decision. Table-style, local
// factory with overrides. Defaults = a comfortable state (no trigger): a full-ish bag, stocked potions, full hp.

const input = (o: Partial<TownPressureInput> = {}): TownPressureInput => ({
  freeSlots: 40,
  potionCount: 5,
  hpFraction: 1,
  potionThresholdPct: 50,
  potionLowReserve: 1,
  pressureMinFreeSlots: 5,
  lowHpStopFraction: 0.15,
  // Default = a run that HAS carried potions (the common "running low" case) so the potion_low tests read naturally;
  // the fresh-actor bootstrap cases set this false explicitly.
  hadPotionsThisRun: true,
  ...o,
});

describe("planTownPressure — no trigger", () => {
  test("comfortable state → none", () => {
    expect(planTownPressure(input())).toEqual({ kind: "none" });
  });
});

describe("planTownPressure — bag_pressure", () => {
  test("free slots at the floor → bag_pressure", () => {
    expect(planTownPressure(input({ freeSlots: 5 }))).toEqual({ kind: "town_trip", trigger: "bag_pressure" });
  });
  test("free slots below the floor → bag_pressure", () => {
    expect(planTownPressure(input({ freeSlots: 2 }))).toEqual({ kind: "town_trip", trigger: "bag_pressure" });
  });
  test("free slots just above the floor → none", () => {
    expect(planTownPressure(input({ freeSlots: 6 }))).toEqual({ kind: "none" });
  });
});

describe("planTownPressure — potion_low", () => {
  test("potions at the reserve with auto-potion on → potion_low", () => {
    expect(planTownPressure(input({ potionCount: 1, potionLowReserve: 1 }))).toEqual({
      kind: "town_trip",
      trigger: "potion_low",
    });
  });
  test("potions above the reserve → none", () => {
    expect(planTownPressure(input({ potionCount: 2, potionLowReserve: 1 }))).toEqual({ kind: "none" });
  });
  test("auto-potion OFF (threshold null) → never potion_low, even with zero potions and hp fine", () => {
    // potionCount 0 but hp high → hp_no_potion needs hp ≤ floor (not met), potion_low needs a rule → none.
    expect(planTownPressure(input({ potionThresholdPct: null, potionCount: 0, hpFraction: 1 }))).toEqual({
      kind: "none",
    });
  });
});

describe("planTownPressure — hp_no_potion", () => {
  test("zero potions and hp exactly at the drink threshold → hp_no_potion", () => {
    expect(planTownPressure(input({ potionCount: 0, hpFraction: 0.5, potionThresholdPct: 50 }))).toEqual({
      kind: "town_trip",
      trigger: "hp_no_potion",
    });
  });
  test("zero potions and hp below the drink threshold → hp_no_potion", () => {
    expect(planTownPressure(input({ potionCount: 0, hpFraction: 0.4, potionThresholdPct: 50 }))).toEqual({
      kind: "town_trip",
      trigger: "hp_no_potion",
    });
  });
  test("threshold null → hp_no_potion uses the low-hp floor as the bound (hp at the floor)", () => {
    expect(
      planTownPressure(input({ potionThresholdPct: null, potionCount: 0, hpFraction: 0.15, freeSlots: 40 })),
    ).toEqual({ kind: "town_trip", trigger: "hp_no_potion" });
  });
  test("threshold null + hp just above the floor + 0 potions → none", () => {
    expect(
      planTownPressure(input({ potionThresholdPct: null, potionCount: 0, hpFraction: 0.2, freeSlots: 40 })),
    ).toEqual({ kind: "none" });
  });
  test("has potions → never hp_no_potion even at low hp (the bot can still drink)", () => {
    // hp low but potions held → not hp_no_potion; hp above the threshold so no potion decision here → potion_low
    // fires only when at/below the reserve. With 3 potions (> reserve 1) and free slots → none.
    expect(planTownPressure(input({ potionCount: 3, hpFraction: 0.1, freeSlots: 40 }))).toEqual({ kind: "none" });
  });
});

describe("planTownPressure — D-075 follow-up: potion_low means RAN OUT mid-run, not a fresh empty bag", () => {
  test("(ก) had potions then ran out (hadPotionsThisRun) + full HP → potion_low (ยาหมด → ไปซื้อ)", () => {
    expect(
      planTownPressure(input({ hadPotionsThisRun: true, potionCount: 0, hpFraction: 1, potionLowReserve: 1 })),
    ).toEqual({ kind: "town_trip", trigger: "potion_low" });
  });
  test("(ข) never carried potions + full HP → none (fresh actor farms bootstrap, does not get dragged to town)", () => {
    expect(
      planTownPressure(input({ hadPotionsThisRun: false, potionCount: 0, hpFraction: 1, potionLowReserve: 1 })),
    ).toEqual({ kind: "none" });
  });
  test("(ค) never carried potions + hp ≤ the threshold → hp_no_potion (the existing floor/low-hp path, unchanged)", () => {
    expect(
      planTownPressure(input({ hadPotionsThisRun: false, potionCount: 0, hpFraction: 0.3, potionThresholdPct: 50 })),
    ).toEqual({ kind: "town_trip", trigger: "hp_no_potion" });
  });
  test("potionCount in (0, reserve] still trips even for a fresh run when auto-potion is on and it holds a potion", () => {
    // A run that currently holds a potion at the reserve implies it carried one (a sample saw > 0) → potion_low.
    expect(
      planTownPressure(input({ hadPotionsThisRun: true, potionCount: 1, hpFraction: 1, potionLowReserve: 1 })),
    ).toEqual({ kind: "town_trip", trigger: "potion_low" });
  });
});

describe("planTownPressure — D-075: threshold 0 = player turned auto-potion off (reads the same as null)", () => {
  test("threshold 0 → never potion_low even at/below the reserve", () => {
    expect(planTownPressure(input({ potionThresholdPct: 0, potionCount: 1, potionLowReserve: 1 }))).toEqual({
      kind: "none",
    });
  });
  test("threshold 0 → hp_no_potion uses the low-hp floor bound (not the 0% threshold)", () => {
    // At 0% the threshold bound would be 0 (never triggers); D-075 makes 0 = off → hp_no_potion falls back to the
    // floor. hp at the floor with zero potions → hp_no_potion; just above the floor → none.
    expect(
      planTownPressure(input({ potionThresholdPct: 0, potionCount: 0, hpFraction: 0.15, freeSlots: 40 })),
    ).toEqual({ kind: "town_trip", trigger: "hp_no_potion" });
    expect(
      planTownPressure(input({ potionThresholdPct: 0, potionCount: 0, hpFraction: 0.2, freeSlots: 40 })),
    ).toEqual({ kind: "none" });
  });
});

describe("planTownPressure — priority (hp_no_potion > bag_pressure > potion_low)", () => {
  test("hp_no_potion beats bag_pressure", () => {
    expect(
      planTownPressure(input({ potionCount: 0, hpFraction: 0.1, freeSlots: 2, potionThresholdPct: 50 })),
    ).toEqual({ kind: "town_trip", trigger: "hp_no_potion" });
  });
  test("hp_no_potion beats potion_low", () => {
    expect(
      planTownPressure(input({ potionCount: 0, hpFraction: 0.3, freeSlots: 40, potionThresholdPct: 50 })),
    ).toEqual({ kind: "town_trip", trigger: "hp_no_potion" });
  });
  test("bag_pressure beats potion_low", () => {
    // hp high (no hp_no_potion), bag at the floor AND potions at the reserve → bag_pressure wins.
    expect(
      planTownPressure(input({ potionCount: 1, potionLowReserve: 1, freeSlots: 3, hpFraction: 1 })),
    ).toEqual({ kind: "town_trip", trigger: "bag_pressure" });
  });
});
