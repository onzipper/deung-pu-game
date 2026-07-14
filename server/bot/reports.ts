// Batch 7b-server — Reports. A report IS a bot_sessions row; retention is enforced at QUERY time per tier
// (D-063: Free 1 / Plus 14 / Pro 90 days). PURE window math + shaping over a session repo seam (DI).

import { DEFAULT_BOT_CONFIG, type BotConfig, type BotTier } from "../config/bot";
import { capsFor } from "./tier";
import type { BotSessionRow } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The earliest `startedAt` still visible for a tier at `nowMs` (D-063 retention). */
export function retentionCutoffMs(nowMs: number, tier: BotTier, config: BotConfig = DEFAULT_BOT_CONFIG): number {
  return nowMs - capsFor(tier, config).reportRetentionDays * DAY_MS;
}

/** One session summarized for the Report list (P3 §8.1). Duration = stop − start (or now − start if still running). */
export interface BotReportSummary {
  id: string;
  mapId: string;
  profileId: string;
  startedAt: number;
  stoppedAt: number | null;
  stopReason: string | null;
  killCount: number;
  goldEarned: number;
  expEarned: number;
  durationMs: number;
  /** gold per hour over the session duration (0 when duration is ~0). */
  goldPerHour: number;
}

/** Full detail = the summary + the per-item drop aggregate (P3 §8.2). */
export interface BotReportDetail extends BotReportSummary {
  drops: Record<string, number>;
}

function durationOf(row: BotSessionRow, nowMs: number): number {
  const end = row.stoppedAt ?? nowMs;
  return Math.max(0, end - row.startedAt);
}

function summarize(row: BotSessionRow, nowMs: number): BotReportSummary {
  const durationMs = durationOf(row, nowMs);
  const hours = durationMs / (60 * 60 * 1000);
  return {
    id: row.id,
    mapId: row.mapId,
    profileId: row.profileId,
    startedAt: row.startedAt,
    stoppedAt: row.stoppedAt,
    stopReason: row.stopReason,
    killCount: row.killCount,
    goldEarned: row.goldEarned,
    expEarned: row.expEarned,
    durationMs,
    goldPerHour: hours > 0 ? Math.round(row.goldEarned / hours) : 0,
  };
}

/**
 * Filter + summarize sessions to the tier's retention window (newest first). PURE — the caller supplies the
 * rows (a repo already scoped to the account) and the clock. Sessions older than the cutoff are clipped (D-063).
 */
export function listReports(
  rows: readonly BotSessionRow[],
  tier: BotTier,
  nowMs: number,
  config: BotConfig = DEFAULT_BOT_CONFIG,
): BotReportSummary[] {
  const cutoff = retentionCutoffMs(nowMs, tier, config);
  return rows
    .filter((r) => r.startedAt >= cutoff)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((r) => summarize(r, nowMs));
}

/**
 * One session's full detail, but only if it is inside the tier's retention window (a clipped/foreign session →
 * null; the client shows the retention-clip line). PURE.
 */
export function fetchReport(
  row: BotSessionRow | null,
  tier: BotTier,
  nowMs: number,
  config: BotConfig = DEFAULT_BOT_CONFIG,
): BotReportDetail | null {
  if (!row) return null;
  if (row.startedAt < retentionCutoffMs(nowMs, tier, config)) return null;
  return { ...summarize(row, nowMs), drops: { ...row.drops } };
}
