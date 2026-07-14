import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Batch 7b — Bot DB schema guard (never-downgrade zone). File-level, no live DB (mirrors db-schema.test.ts):
// the 0004_bot migration + prisma models must carry the 3 bot tables with the columns/indexes the brief locks.

const ROOT = resolve(__dirname, "..");
const SCHEMA = readFileSync(resolve(ROOT, "prisma/schema.prisma"), "utf8");
const MIGRATION = readFileSync(resolve(ROOT, "prisma/migrations/0004_bot/migration.sql"), "utf8");

function tableBlock(name: string): string {
  const start = MIGRATION.indexOf("CREATE TABLE `" + name + "`");
  expect(start, `missing CREATE TABLE ${name}`).toBeGreaterThanOrEqual(0);
  return MIGRATION.slice(start, MIGRATION.indexOf(";", start));
}

describe("0004_bot migration", () => {
  test("creates exactly the 3 bot tables", () => {
    const created = [...MIGRATION.matchAll(/CREATE TABLE `([a-z_]+)`/g)].map((m) => m[1]);
    expect(created.sort()).toEqual(["bot_profiles", "bot_sessions", "bot_tier_state"]);
  });

  test("MariaDB-compatible collation (no MySQL-8-only feature)", () => {
    expect(MIGRATION).toContain("utf8mb4_unicode_ci");
    expect(MIGRATION).not.toMatch(/utf8mb4_0900/);
  });

  test("bot_tier_state: accountId PK + tier default free + nullable expiry", () => {
    const b = tableBlock("bot_tier_state");
    expect(b).toMatch(/`tier`\s+VARCHAR\(191\)\s+NOT NULL\s+DEFAULT 'free'/);
    expect(b).toMatch(/`pass_expires_at`\s+DATETIME\(3\)\s+NULL/);
    expect(b).toMatch(/PRIMARY KEY \(`account_id`\)/);
  });

  test("bot_profiles: rules_json + account_id index", () => {
    const b = tableBlock("bot_profiles");
    expect(b).toMatch(/`rules_json`\s+JSON\s+NOT NULL/);
    expect(b).toContain("bot_profiles_account_id_idx");
  });

  test("bot_sessions: counters + drops + (account_id, started_at) index", () => {
    const b = tableBlock("bot_sessions");
    for (const col of ["kill_count", "gold_earned", "exp_earned"]) {
      expect(b).toMatch(new RegExp("`" + col + "`\\s+INTEGER\\s+NOT NULL\\s+DEFAULT 0"));
    }
    expect(b).toMatch(/`drops_json`\s+JSON\s+NOT NULL/);
    expect(b).toContain("bot_sessions_account_id_started_at_idx");
  });
});

describe("prisma models mirror the migration", () => {
  test("schema declares the 3 bot models mapped to the 3 tables", () => {
    for (const map of ["bot_tier_state", "bot_profiles", "bot_sessions"]) {
      expect(SCHEMA).toContain(`@@map("${map}")`);
    }
  });
  test("BotTierState.accountId is the id (1 row per account)", () => {
    const start = SCHEMA.indexOf("model BotTierState");
    const block = SCHEMA.slice(start, SCHEMA.indexOf("}", start));
    expect(block).toMatch(/accountId\s+String\s+@id/);
  });
});
