// PR5 Phase C (D-069/D-070) — town-trip config + settlement + stop-reason label pins. The MapRoom-driven town
// transaction seams stay inert until the trip controller lands (next task); the behavioural tests come with it.
// Here we lock only the MapRoom-independent surface: the Design-Knob values D-070 locked, the town_trip_failed
// settlement route, and its owner-facing label.

import { describe, expect, test } from "vitest";
import { DEFAULT_BOT_CONFIG } from "../server/config/bot";
import { settlementForStoppedPlan } from "../server/bot/policy";
import { botStopReasonLabel } from "@/ui/panels/bot/bot-view";

describe("town-trip Design Knobs (D-070 locked 2026-07-16)", () => {
  const { townTrip } = DEFAULT_BOT_CONFIG;

  test("Plus/Pro only — Free never town-trips", () => {
    expect(townTrip.enabledTiers).toEqual(["plus", "pro"]);
    expect(townTrip.enabledTiers).not.toContain("free");
  });

  test("locked numeric + policy values match D-070", () => {
    expect(townTrip.cooldownMs).toBe(600_000); // 10 min between trips (D-069)
    expect(townTrip.townMapId).toBe("city-hub");
    expect(townTrip.townAnchor).toBeNull(); // null → target map safeCamp
    expect(townTrip.sellRarityMax).toBe("uncommon"); // sell only common/uncommon
    expect(townTrip.keepItemIds).toEqual(["con_small_potion"]);
    expect(townTrip.minGoldReserve).toBe(50);
    expect(townTrip.potionItemId).toBe("con_small_potion");
    expect(townTrip.potionRestockTarget).toBe(5);
    expect(townTrip.resumeMinFreeSlots).toBe(5);
    expect(townTrip.maxTxRetries).toBe(1);
    expect(townTrip.tripOnFirstOverflow).toBe(true);
  });
});

describe("town_trip_failed stop reason (D-069)", () => {
  test("settles as wait_for_owner — a failed warp is not a failed plan", () => {
    expect(settlementForStoppedPlan("town_trip_failed")).toBe("wait_for_owner");
  });

  test("owner-facing label exists and is town-specific (not the fallback)", () => {
    expect(botStopReasonLabel("town_trip_failed")).not.toBe("บอทหยุดทำงาน");
    expect(botStopReasonLabel("town_trip_failed")).toContain("เมือง");
  });
});
