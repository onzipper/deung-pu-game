import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function expectAll(path: string, fragments: string[]): void {
  const content = read(path);
  for (const fragment of fragments) {
    expect(content, `${path} must contain ${fragment}`).toContain(fragment);
  }
}

const EFFECTIVE_DIRECTION_POINTERS: Array<[string, string[]]> = [
  ["docs/design/deungpu_project_checkpoint_v15_p0_scope_lock_ready.md", ["D-067", "D-068", "CURRENT SOURCE OF TRUTH"]],
  ["docs/design/deungpu_OWNER_PRODUCTION_DECISIONS_P2B_TO_LAUNCH_v1.md", ["D-067", "CURRENT BOT DIRECTION", "SUPERSEDED ทั้ง section"]],
  ["docs/design/deungpu_P3_BOT_AND_REPORT_UI_IMPLEMENTATION_SPEC_v1.md", ["D-067", "D-068", "CURRENT SOURCE OF TRUTH"]],
  ["docs/design/deungpu_DUNG_DUNG_COMPANION_GUIDE_SYSTEM_SPEC_v1.md", ["D-068", "CURRENT SOURCE OF TRUTH", "FOLLOW state machine"]],
  ["docs/tech/deungpu_RUNTIME_BOT_CHANNEL_AND_SCHEMA_OWNERSHIP_DECISIONS_v1.md", ["D-067", "CURRENT BOT RUNTIME AUTHORITY", "SUPERSEDED ทั้ง section"]],
  ["docs/tech/deungpu_technical_architecture_v1_5_p0_scope_lock.md", ["D-067", "CURRENT BOT IMPLEMENTATION CONSTRAINT", "worker combat simulation"]],
];

describe("Bot autonomy and Dung-Dung direction docs lock", () => {
  test("D-067 locks real-character autonomy and tier parity", () => {
    expectAll("docs/decisions/D-067-character-autonomy.md", [
      "Character Autonomy",
      "ไม่มี clone",
      "worker entity",
      "manual movement",
      "combat/reward ceiling",
      "continuity คือ paid value หลัก",
      "tier แตกต่างด้วย continuity, recovery และ workflow complexity",
      "revive แล้ว return area หลังตาย",
    ]);
  });

  test("canonical tier matrices lock Plus and Pro death recovery", () => {
    expectAll("docs/design/deungpu_project_checkpoint_v15_p0_scope_lock_ready.md", [
      "revive แล้ว return area หลังตาย",
      "สืบทอด death recovery ของ Plus",
    ]);
    expectAll("docs/design/deungpu_OWNER_PRODUCTION_DECISIONS_P2B_TO_LAUNCH_v1.md", [
      "revive แล้ว return area หลังตาย",
      "สืบทอด death recovery ของ Plus",
    ]);
    expectAll("docs/design/deungpu_P3_BOT_AND_REPORT_UI_IMPLEMENTATION_SPEC_v1.md", [
      "revive แล้ว return area หลังตาย",
      "สืบทอด death recovery ของ Plus",
      "ordinary rare ใช้ item-event action ตามแผน",
      "manual input รับช่วงต่อทันที",
      "ไม่มี tier ใด opt-in risk ได้",
    ]);
  });

  test("technical architecture locally supersedes worker, risk, and elite paths", () => {
    expectAll("docs/tech/deungpu_technical_architecture_v1_5_p0_scope_lock.md", [
      "ข้อความ Bot runtime เดิมทุกจุดในไฟล์นี้",
      "historical \"bot sim\" worker label",
      "risk opt-in SUPERSEDED/forbidden by D-067",
      "historical secret_hints field SUPERSEDED/forbidden",
      "elite/boss/event/secret/risk ไม่เป็นเป้าหมาย automation",
    ]);
  });

  test("D-068 locks contextual Dung-Dung and separate Help", () => {
    expectAll("docs/decisions/D-068-dungdung-contextual-guide.md", [
      "ไม่ติดตามตัวละครตลอดเวลา",
      "searchable, categorized static knowledge base",
      "ดึ๋งๆ ไม่ใช่ Help database",
      "ไม่ควบคุม Bot",
      "ความสัมพันธ์ระหว่าง Bot กับดึ๋งๆ เป็น presentation เท่านั้น",
      "gameplay progression system",
    ]);
  });

  test.each(EFFECTIVE_DIRECTION_POINTERS)("%s carries the effective-direction pointer", (path, fragments) => {
    expectAll(path, fragments);
  });

  test("routing docs point agents to both decisions and flag implementation drift", () => {
    expectAll("docs/feature-map.md", ["D-067", "D-068", "noncanonical"]);
    expectAll("docs/current-state.md", ["D-067", "D-068", "not aligned"]);
  });
});
