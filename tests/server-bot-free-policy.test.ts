import { describe, expect, test } from "vitest";
import { isForbiddenAutomationMobClass, settlementForStoppedPlan } from "../server/bot/policy";
import type { BotStopReason } from "../server/config/bot";

const ALL_STOP_REASONS = [
  "inventory_full",
  "low_hp",
  "death",
  "map_unsafe",
  "stuck",
  "rare_found",
  "boss_or_event",
  "secret_trigger",
  "captcha",
  "manual",
  "profile_deleted",
  "server_restart",
  "expired_readonly",
  "town_trip_failed",
  "workflow_complete", // PR6b: goal chain จบครบทุกขั้น
  "goal_complete", // M1: Plus single-goal ถึงเป้า → complete
  "town_trip_no_route", // M1: หาเส้นทางเดินไปเมืองไม่ได้ → wait_for_owner
] as const satisfies readonly BotStopReason[];

describe("Free Character Autonomy stop settlement", () => {
  test("only catalogued normal mobs are valid automation targets", () => {
    expect(isForbiddenAutomationMobClass("normal")).toBe(false);
    expect(isForbiddenAutomationMobClass("elite")).toBe(true);
    expect(isForbiddenAutomationMobClass("boss")).toBe(true);
    expect(isForbiddenAutomationMobClass(null)).toBe(true);
  });

  test("an explicit owner stop completes the single assigned goal", () => {
    expect(settlementForStoppedPlan("manual")).toBe("complete");
    expect(settlementForStoppedPlan("workflow_complete")).toBe("complete");
    expect(settlementForStoppedPlan("goal_complete")).toBe("complete"); // M1 Plus single-goal
  });

  test("a walking town trip with no route waits for the owner (M1)", () => {
    expect(settlementForStoppedPlan("town_trip_no_route")).toBe("wait_for_owner");
  });

  test.each(["map_unsafe", "server_restart", "boss_or_event", "secret_trigger", "profile_deleted"] as const)(
    "%s fails closed because the assigned world state is invalid or forbidden",
    (reason) => {
      expect(settlementForStoppedPlan(reason)).toBe("fail");
    },
  );

  test("ordinary Free obstacles stop safely and wait for the owner", () => {
    const failed = new Set<BotStopReason>([
      "map_unsafe",
      "server_restart",
      "boss_or_event",
      "secret_trigger",
      "profile_deleted",
    ]);
    const completes = new Set<BotStopReason>(["manual", "workflow_complete", "goal_complete"]);
    const waiting = ALL_STOP_REASONS.filter((reason) => !completes.has(reason) && !failed.has(reason));

    expect(waiting).toEqual([
      "inventory_full",
      "low_hp",
      "death",
      "stuck",
      "rare_found",
      "captcha",
      "expired_readonly",
      "town_trip_failed",
      "town_trip_no_route",
    ]);
    for (const reason of waiting) {
      expect(settlementForStoppedPlan(reason), reason).toBe("wait_for_owner");
    }
  });

  test("the settlement table accounts for every stop reason", () => {
    type MissingStopReason = Exclude<BotStopReason, (typeof ALL_STOP_REASONS)[number]>;
    const stopReasonSetIsExhaustive: [MissingStopReason] extends [never] ? true : false = true;

    expect(stopReasonSetIsExhaustive).toBe(true);
    expect(ALL_STOP_REASONS).toHaveLength(17);
    for (const reason of ALL_STOP_REASONS) {
      expect(["wait_for_owner", "complete", "fail"]).toContain(settlementForStoppedPlan(reason));
    }
  });
});
