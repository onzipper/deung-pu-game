import { describe, expect, test } from "vitest";
import { fetchReport, listReports, retentionCutoffMs } from "../server/bot/reports";
import type { BotSessionRow } from "../server/bot/types";

// Batch 7b — Reports: a session IS a report; retention clipped at query time per tier (D-063 Free 1/Plus 14/Pro 90).

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function session(id: string, startedAgoDays: number, over: Partial<BotSessionRow> = {}): BotSessionRow {
  return {
    id,
    accountId: "a",
    characterId: "c",
    profileId: "p",
    mapId: "map1",
    startedAt: NOW - startedAgoDays * DAY,
    stoppedAt: NOW - startedAgoDays * DAY + 2 * HOUR,
    stopReason: "manual",
    killCount: 40,
    goldEarned: 100,
    expEarned: 200,
    drops: { mat_slime_gel: 12 },
    updatedAt: NOW,
    ...over,
  };
}

describe("retention window math", () => {
  test("cutoff per tier", () => {
    expect(retentionCutoffMs(NOW, "free")).toBe(NOW - 1 * DAY);
    expect(retentionCutoffMs(NOW, "plus")).toBe(NOW - 14 * DAY);
    expect(retentionCutoffMs(NOW, "pro")).toBe(NOW - 90 * DAY);
  });
});

describe("listReports clips + sorts + computes gold/hour", () => {
  const rows = [session("today", 0.2), session("lastWeek", 7), session("old", 40)];

  test("free sees only the last day", () => {
    const r = listReports(rows, "free", NOW);
    expect(r.map((x) => x.id)).toEqual(["today"]);
  });
  test("plus sees 14 days, newest first", () => {
    const r = listReports(rows, "plus", NOW);
    expect(r.map((x) => x.id)).toEqual(["today", "lastWeek"]);
  });
  test("pro sees all 90-day rows", () => {
    expect(listReports(rows, "pro", NOW).map((x) => x.id)).toEqual(["today", "lastWeek", "old"]);
  });
  test("goldPerHour over a 2h session", () => {
    const r = listReports([session("s", 0.1)], "pro", NOW);
    expect(r[0].goldPerHour).toBe(50); // 100 gold / 2h
    expect(r[0].durationMs).toBe(2 * HOUR);
  });
  test("a still-running session uses now for duration", () => {
    const r = listReports([session("run", 0.05, { stoppedAt: null, stopReason: null })], "pro", NOW);
    expect(r[0].stoppedAt).toBeNull();
    expect(r[0].durationMs).toBeGreaterThan(0);
  });
});

describe("fetchReport respects retention", () => {
  test("in-window returns detail with drops", () => {
    const d = fetchReport(session("x", 0.2), "free", NOW);
    expect(d?.drops).toEqual({ mat_slime_gel: 12 });
  });
  test("clipped (older than retention) → null", () => {
    expect(fetchReport(session("x", 5), "free", NOW)).toBeNull();
  });
  test("null row → null", () => {
    expect(fetchReport(null, "pro", NOW)).toBeNull();
  });
});
