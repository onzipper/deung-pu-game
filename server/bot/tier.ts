// Batch 7b-server — Tier service (PURE, DI clock). Resolves the effective bot tier and the MOCK purchase op.
//
// Rules are canon = D-063 (LOCKED):
//   • Free forever, 24/7, all tiers — capability differs, never power.
//   • pass = duration pass (1/10/30 days), age counted from purchase, no pause.
//   • expiry → fall back to Free automatically (excess profiles/rules become read-only elsewhere).
//   • renew (same tier) → APPEND days to the tail, no cap, no warning (it's a positive).
//   • cross-tier overwrite → replace immediately; the old pass's remaining days are LOST (UI warns + confirms
//     before this is called — §12.5). Server overwrites and reports the lost time for the audit/warning.
//
// ⛔ Payment = MOCK ONLY in beta (D-061) — this computes the entitlement row; no real billing anywhere.

import { DEFAULT_BOT_CONFIG, type BotConfig, type BotTier, type BotTierCaps } from "../config/bot";
import type { BotTierStateRow } from "./types";

/** Effective tier after applying expiry (D-063 fallback). */
export interface ResolvedTier {
  tier: BotTier;
  /** true when a paid row expired and we fell back to Free (drives the `expired-fallback` UI + read-only excess). */
  fellBackToFree: boolean;
  /** the paid tier the account most recently held (for read-only-excess reasoning) — equals `tier` unless fell back. */
  heldTier: BotTier;
  passExpiresAt: number | null;
}

/**
 * Resolve the effective tier from a persisted row + the clock (D-063). No row → Free. A paid row whose
 * `passExpiresAt` is in the past → Free (fell back). `heldTier` keeps the row's tier so callers can pin the
 * profiles/rules that exceed Free's cap as read-only (never delete — §12.4).
 */
export function resolveTier(row: BotTierStateRow | null, nowMs: number): ResolvedTier {
  if (!row || row.tier === "free") {
    return { tier: "free", fellBackToFree: false, heldTier: "free", passExpiresAt: null };
  }
  const active = row.passExpiresAt != null && row.passExpiresAt > nowMs;
  if (active) {
    return { tier: row.tier, fellBackToFree: false, heldTier: row.tier, passExpiresAt: row.passExpiresAt };
  }
  // paid row but expired → Free, but remember what they held (read-only excess reasoning).
  return { tier: "free", fellBackToFree: true, heldTier: row.tier, passExpiresAt: row.passExpiresAt };
}

/** Caps for a tier (verbatim table, D-063 · §15). */
export function capsFor(tier: BotTier, config: BotConfig = DEFAULT_BOT_CONFIG): BotTierCaps {
  return config.tiers[tier].caps;
}

/** A validated pass purchase request (MOCK). `tier` must be a paid tier; `days` one of that tier's pass lengths. */
export interface MockPurchaseRequest {
  tier: BotTier;
  days: number;
}

export type MockPurchaseResult =
  | {
      ok: true;
      /** the row to persist (accountId filled by the caller). */
      row: Omit<BotTierStateRow, "accountId">;
      /** "renew" = same-tier append · "overwrite" = cross-tier replace · "new" = from Free/expired. */
      mode: "renew" | "overwrite" | "new";
      /** remaining ms of the pass that was overwritten (cross-tier only) — 0 otherwise. For the audit/warning. */
      lostMs: number;
      priceThb: number;
    }
  | { ok: false; reason: string };

/**
 * Apply a MOCK pass purchase (D-063 renew-append / cross-tier-overwrite). PURE: takes the current row + clock,
 * returns the next row (or a rejection). The caller persists it and, for `overwrite`, has already shown the
 * confirm modal (§12.5) — this function does not gate on confirmation, it just computes the outcome.
 */
export function applyMockPurchase(
  current: BotTierStateRow | null,
  req: MockPurchaseRequest,
  nowMs: number,
  config: BotConfig = DEFAULT_BOT_CONFIG,
): MockPurchaseResult {
  if (req.tier === "free") return { ok: false, reason: "free_not_purchasable" };
  const def = config.tiers[req.tier];
  if (!def) return { ok: false, reason: "unknown_tier" };
  const pass = def.passes.find((p) => p.days === req.days);
  if (!pass) return { ok: false, reason: "unknown_pass_duration" };

  const durationMs = req.days * 24 * 60 * 60 * 1000;
  const resolved = resolveTier(current, nowMs);
  const activePaid = current && current.tier !== "free" && current.passExpiresAt != null && current.passExpiresAt > nowMs;

  // Same tier + still active → RENEW: append onto the existing tail (no cap, §12.6).
  if (activePaid && current!.tier === req.tier) {
    const base = current!.passExpiresAt!; // > nowMs (activePaid)
    return {
      ok: true,
      mode: "renew",
      lostMs: 0,
      priceThb: pass.priceThb,
      row: { tier: req.tier, passExpiresAt: base + durationMs, updatedAt: nowMs },
    };
  }

  // Different active tier → CROSS-TIER OVERWRITE: replace now, old remaining days are lost (§12.5).
  if (activePaid && current!.tier !== req.tier) {
    const lostMs = Math.max(0, current!.passExpiresAt! - nowMs);
    return {
      ok: true,
      mode: "overwrite",
      lostMs,
      priceThb: pass.priceThb,
      row: { tier: req.tier, passExpiresAt: nowMs + durationMs, updatedAt: nowMs },
    };
  }

  // No active pass (Free / expired) → NEW pass from now.
  void resolved;
  return {
    ok: true,
    mode: "new",
    lostMs: 0,
    priceThb: pass.priceThb,
    row: { tier: req.tier, passExpiresAt: nowMs + durationMs, updatedAt: nowMs },
  };
}
