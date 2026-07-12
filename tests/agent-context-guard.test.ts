// Agent context guard (chore/agent-context-optimization, 2026-07-13).
// Enforces the token budget as executable rules: entry docs must stay small,
// AGENTS.md must never regain the Next.js "read node_modules docs" block
// (next@16.2.10 has no re-inject mechanism — this test is the whole defense
// if a future create-next-app/codemod run writes it back), and the
// .claude/settings.json deny rules must keep node_modules closed at tool level.
// Byte caps use Buffer.byteLength (UTF-8 on-disk size), never string length.

import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

function bytesOf(relPath: string): number {
  return Buffer.byteLength(readFileSync(join(ROOT, relPath)));
}

function textOf(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8");
}

describe("agent context guard", () => {
  test("AGENTS.md has no Next.js node_modules-docs pointer", () => {
    const agents = textOf("AGENTS.md");
    expect(agents).not.toContain("nextjs-agent-rules");
    expect(agents).not.toContain("node_modules/next/dist/docs");
  });

  test(".claude/settings.json denies node_modules reads", () => {
    const raw = textOf(".claude/settings.json");
    const settings = JSON.parse(raw) as {
      permissions?: { deny?: string[]; ask?: string[] };
    };
    expect(settings.permissions?.deny).toContain("Read(./node_modules/**)");
    expect(settings.permissions?.deny).toContain("Read(./.next/**)");
  });

  // Byte caps — rows are appended in the commit that thins each file.
  // A red row here means the file grew past its budget: trim it or move
  // content to docs/history/ — do NOT raise the cap without owner approval.
  const BYTE_CAPS: Record<string, number> = {
    "AGENTS.md": 1_024,
  };

  for (const [relPath, cap] of Object.entries(BYTE_CAPS)) {
    test(`byte cap: ${relPath} <= ${cap}`, () => {
      expect(existsSync(join(ROOT, relPath))).toBe(true);
      expect(bytesOf(relPath)).toBeLessThanOrEqual(cap);
    });
  }
});
