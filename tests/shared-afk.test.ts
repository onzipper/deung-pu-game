// P2-13 (D-056): AFK idle-indicator + inert hard-cap pure logic. No DB / no colyseus — DI clocks only.

import { describe, expect, test } from "vitest";
import { isIdleAfk, exceedsAfkHardCap } from "@/shared/afk";

const IDLE_SEC = 60;

describe("isIdleAfk — idle indicator (D-056, idleIndicatorSec=60)", () => {
  test("not AFK before the threshold", () => {
    const lastInput = 1_000_000;
    expect(isIdleAfk(lastInput, lastInput + 59_000, IDLE_SEC)).toBe(false);
  });

  test("AFK exactly at the threshold (≥)", () => {
    const lastInput = 1_000_000;
    expect(isIdleAfk(lastInput, lastInput + 60_000, IDLE_SEC)).toBe(true);
  });

  test("AFK well past the threshold", () => {
    const lastInput = 1_000_000;
    expect(isIdleAfk(lastInput, lastInput + 5 * 60_000, IDLE_SEC)).toBe(true);
  });

  test("input resets the flag (fresh input → not AFK)", () => {
    const now = 2_000_000;
    // was AFK, then input arrives at `now` → lastInput = now → idle 0
    expect(isIdleAfk(now, now, IDLE_SEC)).toBe(false);
  });

  test("idleIndicatorSec ≤ 0 disables the indicator (never AFK)", () => {
    const lastInput = 0;
    expect(isIdleAfk(lastInput, lastInput + 10 * 60_000, 0)).toBe(false);
    expect(isIdleAfk(lastInput, lastInput + 10 * 60_000, -5)).toBe(false);
  });

  test("non-finite inputs are safe (false)", () => {
    expect(isIdleAfk(Number.NaN, 1_000, IDLE_SEC)).toBe(false);
    expect(isIdleAfk(0, Number.POSITIVE_INFINITY, IDLE_SEC)).toBe(false);
    expect(isIdleAfk(0, 1_000, Number.NaN)).toBe(false);
  });
});

describe("exceedsAfkHardCap — inert in P2 (afkHardCapHours=null)", () => {
  test("null cap is disabled — never exceeds even after days idle", () => {
    const connectedAt = 0;
    const days = 5 * 24 * 3_600_000;
    expect(exceedsAfkHardCap(connectedAt, connectedAt + days, null)).toBe(false);
  });

  test("cap ≤ 0 is disabled", () => {
    expect(exceedsAfkHardCap(0, 10 * 3_600_000, 0)).toBe(false);
    expect(exceedsAfkHardCap(0, 10 * 3_600_000, -1)).toBe(false);
  });

  test("positive cap (pre-alpha revisit) activates — below vs at/over", () => {
    const connectedAt = 1_000_000;
    const cap = 6; // hours
    expect(exceedsAfkHardCap(connectedAt, connectedAt + 5 * 3_600_000, cap)).toBe(false);
    expect(exceedsAfkHardCap(connectedAt, connectedAt + 6 * 3_600_000, cap)).toBe(true);
    expect(exceedsAfkHardCap(connectedAt, connectedAt + 7 * 3_600_000, cap)).toBe(true);
  });

  test("non-finite inputs are safe (false)", () => {
    expect(exceedsAfkHardCap(Number.NaN, 1_000, 6)).toBe(false);
    expect(exceedsAfkHardCap(0, Number.NaN, 6)).toBe(false);
    expect(exceedsAfkHardCap(0, 1_000, Number.NaN)).toBe(false);
  });
});
