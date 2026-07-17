import { describe, expect, test } from "vitest";
import { DEFAULT_BOT_CONFIG } from "../server/config/bot";
import { applyMockPurchase, buildBotTierPlans, capsFor, resolveTier } from "../server/bot/tier";
import type { BotTierStateRow } from "../server/bot/types";

// Batch 7b — Tier service (pure). Canon = D-063 (LOCKED): free forever/24-7; caps 1/3/10 · 3/10/25 · 1/14/90;
// passes Plus 9/39/79 · Pro 15/69/149 for 1/10/30 days; expiry→free fallback; renew appends; cross-tier overwrites.

const NOW = 1_800_000_000_000; // fixed clock
const DAY = 24 * 60 * 60 * 1000;

describe("bot tier caps (verbatim D-063 · §15)", () => {
  test("free caps", () => {
    expect(capsFor("free")).toEqual({
      profiles: 1,
      rules: 3,
      reportRetentionDays: 1,
      notifications: false,
      schedules: 0,
      analytics: false,
    });
  });
  test("plus caps", () => {
    expect(capsFor("plus")).toEqual({
      profiles: 3,
      rules: 10,
      reportRetentionDays: 14,
      notifications: true,
      schedules: 2,
      analytics: false,
    });
  });
  test("pro caps", () => {
    expect(capsFor("pro")).toEqual({
      profiles: 10,
      rules: 25,
      reportRetentionDays: 90,
      notifications: true,
      schedules: 10,
      analytics: true,
    });
  });
  test("pass prices (MOCK, D-061)", () => {
    expect(DEFAULT_BOT_CONFIG.tiers.plus.passes).toEqual([
      { days: 1, priceThb: 9 },
      { days: 10, priceThb: 39 },
      { days: 30, priceThb: 79 },
    ]);
    expect(DEFAULT_BOT_CONFIG.tiers.pro.passes).toEqual([
      { days: 1, priceThb: 15 },
      { days: 10, priceThb: 69 },
      { days: 30, priceThb: 149 },
    ]);
    expect(DEFAULT_BOT_CONFIG.tiers.free.passes).toEqual([]);
  });
});

describe("M1 buildBotTierPlans (config is the single truth — client stops hard-coding)", () => {
  test("every tier's caps + prices come straight from DEFAULT_BOT_CONFIG", () => {
    const plans = buildBotTierPlans();
    expect(plans.map((p) => p.tier)).toEqual(["free", "plus", "pro"]);

    const free = plans.find((p) => p.tier === "free")!;
    expect(free.passes).toEqual([]);
    expect(free.caps).toEqual(DEFAULT_BOT_CONFIG.tiers.free.caps);

    const plus = plans.find((p) => p.tier === "plus")!;
    expect(plus.caps).toEqual(DEFAULT_BOT_CONFIG.tiers.plus.caps);
    expect(plus.passes).toEqual(DEFAULT_BOT_CONFIG.tiers.plus.passes); // 9/39/79

    const pro = plans.find((p) => p.tier === "pro")!;
    expect(pro.caps).toEqual(DEFAULT_BOT_CONFIG.tiers.pro.caps);
    expect(pro.passes).toEqual(DEFAULT_BOT_CONFIG.tiers.pro.passes); // 15/69/149
  });

  test("caps retain the dormant `schedules` field (D-072)", () => {
    const plans = buildBotTierPlans();
    expect(plans.every((p) => "schedules" in p.caps)).toBe(true);
  });
});

describe("resolveTier + expiry fallback", () => {
  test("no row → free", () => {
    expect(resolveTier(null, NOW)).toEqual({ tier: "free", fellBackToFree: false, heldTier: "free", passExpiresAt: null });
  });
  test("active paid → that tier", () => {
    const row: BotTierStateRow = { accountId: "a", tier: "pro", passExpiresAt: NOW + DAY, updatedAt: NOW };
    const r = resolveTier(row, NOW);
    expect(r.tier).toBe("pro");
    expect(r.fellBackToFree).toBe(false);
  });
  test("expired paid → free, but heldTier remembered (read-only excess)", () => {
    const row: BotTierStateRow = { accountId: "a", tier: "pro", passExpiresAt: NOW - 1, updatedAt: NOW };
    const r = resolveTier(row, NOW);
    expect(r.tier).toBe("free");
    expect(r.fellBackToFree).toBe(true);
    expect(r.heldTier).toBe("pro");
  });
});

describe("applyMockPurchase (renew-append / cross-tier-overwrite / new)", () => {
  test("new pass from free", () => {
    const res = applyMockPurchase(null, { tier: "plus", days: 10 }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mode).toBe("new");
    expect(res.row.tier).toBe("plus");
    expect(res.row.passExpiresAt).toBe(NOW + 10 * DAY);
    expect(res.priceThb).toBe(39);
    expect(res.lostMs).toBe(0);
  });

  test("free tier is not purchasable", () => {
    const res = applyMockPurchase(null, { tier: "free", days: 10 }, NOW);
    expect(res).toEqual({ ok: false, reason: "free_not_purchasable" });
  });

  test("unknown pass duration rejected", () => {
    const res = applyMockPurchase(null, { tier: "plus", days: 7 }, NOW);
    expect(res).toEqual({ ok: false, reason: "unknown_pass_duration" });
  });

  test("renew same tier APPENDS to the tail (no cap, no lost time)", () => {
    const row: BotTierStateRow = { accountId: "a", tier: "plus", passExpiresAt: NOW + 5 * DAY, updatedAt: NOW };
    const res = applyMockPurchase(row, { tier: "plus", days: 10 }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mode).toBe("renew");
    expect(res.row.passExpiresAt).toBe(NOW + 5 * DAY + 10 * DAY); // appended
    expect(res.lostMs).toBe(0);
  });

  test("cross-tier OVERWRITES now + reports the lost remaining time", () => {
    const row: BotTierStateRow = { accountId: "a", tier: "plus", passExpiresAt: NOW + 5 * DAY, updatedAt: NOW };
    const res = applyMockPurchase(row, { tier: "pro", days: 1 }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mode).toBe("overwrite");
    expect(res.row.tier).toBe("pro");
    expect(res.row.passExpiresAt).toBe(NOW + 1 * DAY); // reset, old remaining lost
    expect(res.lostMs).toBe(5 * DAY);
  });

  test("expired pass → buying same tier is a NEW pass (not a renew of dead time)", () => {
    const row: BotTierStateRow = { accountId: "a", tier: "plus", passExpiresAt: NOW - 100, updatedAt: NOW };
    const res = applyMockPurchase(row, { tier: "plus", days: 30 }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mode).toBe("new");
    expect(res.row.passExpiresAt).toBe(NOW + 30 * DAY);
  });
});
