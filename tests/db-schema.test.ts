import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// P2-02 schema guard (never-downgrade zone: DB schema) — ตรวจที่ระดับไฟล์ ไม่ต้องมี DB จริง
// (pattern เดียวกับ tests/docs-guard.test.ts: อ่านไฟล์มา assert). กัน regression บนโครง DB ชุดแรกของ P2.

const ROOT = resolve(__dirname, "..");
const SCHEMA = readFileSync(resolve(ROOT, "prisma/schema.prisma"), "utf8");
const MIGRATION = readFileSync(
  resolve(ROOT, "prisma/migrations/0001_init/migration.sql"),
  "utf8",
);

/** ดึงบล็อก `CREATE TABLE \`name\` ( ... )` ของตารางที่ระบุจาก migration SQL */
function tableBlock(name: string): string {
  const start = MIGRATION.indexOf("CREATE TABLE `" + name + "`");
  expect(start, `ไม่พบ CREATE TABLE ของ ${name}`).toBeGreaterThanOrEqual(0);
  const semi = MIGRATION.indexOf(";", start);
  return MIGRATION.slice(start, semi);
}

const EXPECTED_TABLES = [
  "accounts",
  "characters",
  "character_state",
  "items",
  "inventory",
  "currency_ledger",
  "enhancement_logs",
  "drop_audit",
  "config_versions",
  "game_events",
];

describe("P2-02 DB schema", () => {
  test("มีครบ 10 ตารางตาม brief (ไม่ขาดไม่เกิน)", () => {
    const created = [...MIGRATION.matchAll(/CREATE TABLE `([a-z_]+)`/g)].map(
      (m) => m[1],
    );
    expect(created.sort()).toEqual([...EXPECTED_TABLES].sort());
  });

  test("datasource = mysql", () => {
    expect(SCHEMA).toMatch(/provider\s*=\s*"mysql"/);
  });

  // ── currency_ledger: double-entry, ไม่มี balance column ที่ไหนทั้งนั้น (TA §7) ──
  test("currency_ledger ไม่มี column ชื่อ balance", () => {
    const block = tableBlock("currency_ledger");
    expect(block).not.toMatch(/`balance`/i);
  });

  test("migration ทั้งไฟล์ไม่มี column `balance` เลย (double-entry: ยอด = SUM)", () => {
    // กัน balance หลุดเข้าไปในตารางไหนก็ตาม (SUM(amount) AS balance เป็น alias ใน raw SQL คนละไฟล์)
    expect(MIGRATION).not.toMatch(/`balance`/i);
  });

  test("currency_ledger มี amount + reason + idempotency_key unique", () => {
    const block = tableBlock("currency_ledger");
    expect(block).toMatch(/`amount`/);
    expect(block).toMatch(/`reason` ENUM\(/);
    expect(MIGRATION).toMatch(
      /UNIQUE INDEX `currency_ledger_idempotency_key_key`\(`idempotency_key`\)/,
    );
  });

  // ── game_events: eventId unique (dedup), index (eventType, occurredAt) — AJ §4.3/§20 ──
  test("game_events มี event_id unique (dedup)", () => {
    expect(MIGRATION).toMatch(
      /UNIQUE INDEX `game_events_event_id_key`\(`event_id`\)/,
    );
  });

  test("game_events มี index (event_type, occurred_at) + index occurred_at (retention)", () => {
    expect(MIGRATION).toMatch(
      /INDEX `game_events_event_type_occurred_at_idx`\(`event_type`, `occurred_at`\)/,
    );
    expect(MIGRATION).toMatch(
      /INDEX `game_events_occurred_at_idx`\(`occurred_at`\)/,
    );
  });

  // ── inventory: optimistic lock version column (TA §7) ──
  test("inventory มี version column (optimistic lock)", () => {
    const block = tableBlock("inventory");
    expect(block).toMatch(/`version` INTEGER NOT NULL DEFAULT 0/);
  });

  // ── accounts: guest upgrade (email nullable + is_guest flag) ──
  test("accounts รองรับ guest upgrade (email nullable + is_guest)", () => {
    const block = tableBlock("accounts");
    expect(block).toMatch(/`email` VARCHAR\(\d+\) NULL/);
    expect(block).toMatch(/`is_guest` BOOLEAN NOT NULL/);
  });

  // ── character_state: แยกจาก characters (map + ตำแหน่ง + updated_at) ──
  test("character_state มี map_id + tx/ty + updated_at", () => {
    const block = tableBlock("character_state");
    expect(block).toMatch(/`map_id`/);
    expect(block).toMatch(/`tx` DOUBLE/);
    expect(block).toMatch(/`ty` DOUBLE/);
    expect(block).toMatch(/`updated_at`/);
  });
});
