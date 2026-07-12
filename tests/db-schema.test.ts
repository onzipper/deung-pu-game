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
  "item_instances", // P2-02b: rename จาก inventory → location model
  "currency_ledger",
  "enhancement_logs",
  "drop_audit",
  "delivery_box_entries", // P2-02b
  "storage_transaction_log", // P2-02b
  "session_lease", // P2-02b
  "config_versions",
  "game_events",
];

describe("P2-02 DB schema", () => {
  test("มีครบ 13 ตารางตาม brief (ไม่ขาดไม่เกิน)", () => {
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

  // ── item_instances: location model + optimistic lock (P2-02b, Storage §22) ──
  test("item_instances มี version column (optimistic lock)", () => {
    const block = tableBlock("item_instances");
    expect(block).toMatch(/`version` INTEGER NOT NULL DEFAULT 0/);
  });

  test("item_instances: account_id required + character_id nullable (location model)", () => {
    const block = tableBlock("item_instances");
    expect(block).toMatch(/`account_id` CHAR\(36\) NOT NULL/); // เจ้าของจริง §22
    expect(block).toMatch(/`character_id` CHAR\(36\) NULL/); // pointer เมื่ออยู่กับตัวละคร
  });

  test("item_instances: location enum ครบ 7 แบบ (§22 invariant)", () => {
    const block = tableBlock("item_instances");
    for (const loc of [
      "CHARACTER_INVENTORY",
      "CHARACTER_EQUIPMENT",
      "ACCOUNT_STORAGE",
      "DELIVERY_BOX",
      "MARKET_ESCROW",
      "WORLD_LOOT",
      "DESTROYED",
    ]) {
      expect(block, `location enum ต้องมี ${loc}`).toMatch(
        new RegExp("'" + loc + "'"),
      );
    }
    // มี default location + per-instance fields (S3)
    expect(block).toMatch(/`location` ENUM\([^)]*\) NOT NULL DEFAULT 'CHARACTER_INVENTORY'/);
    expect(block).toMatch(/`expires_at` DATETIME/);
    expect(block).toMatch(/`unique_equip_group` VARCHAR/);
  });

  // ── accounts: P2-02b fields (5 slots / 200 storage / last played) ──
  test("accounts มี character_slots(5) + storage_capacity(200) + last_played_character_id", () => {
    const block = tableBlock("accounts");
    expect(block).toMatch(/`character_slots` INTEGER NOT NULL DEFAULT 5/);
    expect(block).toMatch(/`storage_capacity` INTEGER NOT NULL DEFAULT 200/);
    expect(block).toMatch(/`last_played_character_id` CHAR\(36\) NULL/);
  });

  // ── delivery_box_entries: source + payload + expiry + claim status (§16) ──
  test("delivery_box_entries มี source enum + payload + expires_at + claim_status", () => {
    const block = tableBlock("delivery_box_entries");
    expect(block).toMatch(/`source` ENUM\(/);
    expect(block).toMatch(/`payload` JSON NOT NULL/);
    expect(block).toMatch(/`expires_at` DATETIME/);
    expect(block).toMatch(/`claim_status`/);
  });

  // ── storage_transaction_log: append-only audit + idempotency unique (§22) ──
  test("storage_transaction_log มี idempotency_key unique + from/to location", () => {
    const block = tableBlock("storage_transaction_log");
    expect(block).toMatch(/`from_location` ENUM\(/);
    expect(block).toMatch(/`to_location` ENUM\(/);
    expect(MIGRATION).toMatch(
      /UNIQUE INDEX `storage_transaction_log_idempotency_key_key`\(`idempotency_key`\)/,
    );
  });

  test("storage_transaction_log ไม่มี balance column (append-only audit เท่านั้น)", () => {
    const block = tableBlock("storage_transaction_log");
    expect(block).not.toMatch(/`balance`/i);
  });

  // ── session_lease: 1 active session/บัญชี — account_id = PK unique (§4.1) ──
  test("session_lease: account_id เป็น PRIMARY KEY (1 lease/บัญชี) + session_id + heartbeat_at", () => {
    const block = tableBlock("session_lease");
    expect(block).toMatch(/`account_id` CHAR\(36\) NOT NULL/);
    expect(block).toMatch(/`session_id` VARCHAR/);
    expect(block).toMatch(/`heartbeat_at` DATETIME/);
    expect(block).toMatch(/PRIMARY KEY \(`account_id`\)/);
  });

  // ── character name: case-insensitive unique (§3.3) — collation ci ยืนยันที่ตาราง ──
  test("characters: name unique + ตาราง collation = *_ci (case-insensitive §3.3)", () => {
    const block = tableBlock("characters");
    expect(block).toMatch(/UNIQUE INDEX `characters_name_key`\(`name`\)/);
    // collation _ci = case-insensitive → "Jom"/"jom" ชนกันที่ระดับ DB (ไม่ต้อง lower() เอง)
    expect(MIGRATION).toMatch(/CREATE TABLE `characters`[\s\S]*?COLLATE utf8mb4_unicode_ci/);
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
