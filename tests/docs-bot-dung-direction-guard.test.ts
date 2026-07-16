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

const CONTINUITY_STATES = [
  "WORKING",
  "TRAVELING",
  "COMBAT",
  "LOOTING",
  "RECOVERING",
  "RETURNING_TO_TOWN",
  "SELLING",
  "DEPOSITING",
  "RESTOCKING",
  "RETURNING_TO_WORK",
  "PAUSED",
  "WAITING_FOR_OWNER",
  "COMPLETED",
  "FAILED",
];

describe("Bot autonomy and Dung-Dung direction docs lock", () => {
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

  test.each([
    "docs/design/deungpu_project_checkpoint_v15_p0_scope_lock_ready.md",
    "docs/design/deungpu_P3_BOT_AND_REPORT_UI_IMPLEMENTATION_SPEC_v1.md",
    "docs/tech/deungpu_RUNTIME_BOT_CHANNEL_AND_SCHEMA_OWNERSHIP_DECISIONS_v1.md",
  ])("%s locks the PR3 continuity vocabulary", (path) => {
    expectAll(path, CONTINUITY_STATES);
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

  test.each(EFFECTIVE_DIRECTION_POINTERS)("%s carries the effective-direction pointer", (path, fragments) => {
    expectAll(path, fragments);
  });

  test("routing docs point agents to both decisions and flag implementation drift", () => {
    expectAll("README.md", ["Canonical game spec (v15.5)", "§4.2 Continuity"]);
    expectAll("docs/context/server.md", [
      "PR4 Free is live",
      "one assigned area + one continuous goal",
      "WAITING_FOR_OWNER/COMPLETED/FAILED",
      "PR5 live: Plus recovery + town warp",
      "PR6 owns workflow/restart resume",
    ]);
    expectAll("docs/context/ui.md", ["PR4 status/stopped messages", "PR7 UX"]);
    expectAll("docs/CODEMAP.md", ["policy.ts", "PR4 Free one-area/one-goal safe-stop settlement"]);
    expectAll("docs/design/deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md", [
      "CURRENT BOT SOURCE OF TRUTH",
      "D-067",
      "stop on rare drop",
      "SUPERSEDED",
      "combat/reward ceiling",
    ]);
  });
});
