// Agent context guard (chore/agent-context-optimization, 2026-07-13).
// Enforces the token budget as executable rules: entry docs must stay small,
// AGENTS.md must never regain the Next.js "read node_modules docs" block
// (next@16.2.10 has no re-inject mechanism — this test is the whole defense
// if a future create-next-app/codemod run writes it back), and the
// .claude/settings.json deny rules must keep node_modules closed at tool level.
// Byte caps use Buffer.byteLength (UTF-8 on-disk size), never string length.

import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

// Normalize CRLF→LF before measuring: git autocrlf on Windows re-materializes
// checked-out files with CRLF, inflating on-disk size past the cap while the
// committed content (and its token cost — what the budget actually models) is
// unchanged. Caps are content budgets, not disk budgets.
function bytesOf(relPath: string): number {
  const raw = readFileSync(join(ROOT, relPath), "utf8");
  return Buffer.byteLength(raw.replace(/\r\n/g, "\n"));
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
    "CLAUDE.md": 3_072,
    "AI.md": 6_656,
    "docs/agent-rules.md": 10_240,
    "docs/token-budget.md": 2_560,
    // 6144 → 8192 approved by owner 2026-07-13: the index grows ~110 B per
    // decision by design (integrity test pins every D-NNN file to one row).
    "docs/decision-index.md": 8_192,
    "docs/current-state.md": 3_072,
    "docs/feature-map.md": 6_144,
    "docs/CODEMAP.md": 8_192,
    // Per-layer context packs (C6, 2026-07-13): one pack = one layer's read.
    // An agent reads ONE pack, so each must stay small. Full war stories live in
    // docs/history/2026-07-13-known-traps-archive.md — trim the pack, don't raise the cap.
    "docs/context/engine.md": 8_192,
    "docs/context/game.md": 8_192,
    "docs/context/ui.md": 8_192,
    "docs/context/server.md": 8_192,
  };

  // The auto-import chain is injected into EVERY session's context (CLAUDE.md
  // @-imports AGENTS.md + AI.md + docs/current-state.md) — the single most
  // expensive recurring read in the project. Keep the sum hard-capped.
  test("auto-import chain (CLAUDE+AGENTS+AI+current-state) <= 13,312 bytes", () => {
    const chain =
      bytesOf("CLAUDE.md") +
      bytesOf("AGENTS.md") +
      bytesOf("AI.md") +
      bytesOf("docs/current-state.md");
    expect(chain).toBeLessThanOrEqual(13_312);
  });

  for (const [relPath, cap] of Object.entries(BYTE_CAPS)) {
    test(`byte cap: ${relPath} <= ${cap}`, () => {
      expect(existsSync(join(ROOT, relPath))).toBe(true);
      expect(bytesOf(relPath)).toBeLessThanOrEqual(cap);
    });
  }

  // Context packs replaced the monolithic docs/known-traps.md (C6, 2026-07-13):
  // an agent reads one per-layer pack, not one big file. These rules keep the split
  // honest — the old file is gone, every pack carries its Traps section, and no live
  // doc dangles a pointer to the deleted file (the archive filename is the only
  // legitimate mention, and it lives under docs/history/).
  describe("context packs replace known-traps.md", () => {
    const PACKS = [
      "docs/context/engine.md",
      "docs/context/game.md",
      "docs/context/ui.md",
      "docs/context/server.md",
    ];
    const ARCHIVE = "2026-07-13-known-traps-archive.md";

    test("docs/known-traps.md no longer exists (folded into packs + archive)", () => {
      expect(existsSync(join(ROOT, "docs/known-traps.md"))).toBe(false);
    });

    test("the verbatim archive exists under docs/history/", () => {
      expect(existsSync(join(ROOT, "docs/history", ARCHIVE))).toBe(true);
    });

    for (const pack of PACKS) {
      test(`${pack} exists and carries a "## Traps" section`, () => {
        expect(existsSync(join(ROOT, pack))).toBe(true);
        expect(textOf(pack)).toContain("## Traps");
      });
    }

    // Every live .md (outside docs/history) must not reference the deleted file.
    // The archive filename legitimately contains the substring "known-traps", so it
    // is stripped before the check — a pointer to the archive is allowed, a pointer
    // to the old docs/known-traps.md is not.
    test("no live tracked .md dangles a known-traps reference", () => {
      const mdFiles: string[] = [];

      const addMdIn = (relDir: string) => {
        const abs = join(ROOT, relDir);
        if (!existsSync(abs)) return;
        for (const f of readdirSync(abs)) {
          if (f.endsWith(".md")) mdFiles.push(join(relDir, f));
        }
      };
      // root *.md, docs/*.md, docs/context/*.md (non-recursive: skips docs/history)
      addMdIn(".");
      addMdIn("docs");
      addMdIn("docs/context");
      if (existsSync(join(ROOT, "docs/decisions/README.md"))) {
        mdFiles.push("docs/decisions/README.md");
      }
      // .claude/**/*.md (recursive)
      const walkClaude = (relDir: string) => {
        const abs = join(ROOT, relDir);
        if (!existsSync(abs)) return;
        for (const entry of readdirSync(abs, { withFileTypes: true })) {
          const rel = join(relDir, entry.name);
          if (entry.isDirectory()) walkClaude(rel);
          else if (entry.name.endsWith(".md")) mdFiles.push(rel);
        }
      };
      walkClaude(".claude");

      const offenders = mdFiles.filter((rel) => {
        const stripped = textOf(rel).split(ARCHIVE).join("");
        return stripped.includes("known-traps");
      });
      expect(offenders, `these live docs still mention known-traps: ${offenders.join(", ")}`).toEqual([]);
    });
  });

  // decision index <-> decisions/ integrity (chore/agent-context-optimization, 2026-07-13):
  // the thin English decision-index.md is navigation only; docs/decisions/D-NNN-*.md files
  // are the rationale authority. Every reference must resolve, and every file must be linked
  // exactly once, or the index and the directory have silently drifted apart.
  test("every persona contains Brief contract line", () => {
    const dir = join(ROOT, ".claude", "agents");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, `${f} is missing the Brief contract line`).toContain("Brief contract");
    }
  });

  describe("decision index <-> decisions/ integrity", () => {
    const DECISIONS_DIR = join(ROOT, "docs", "decisions");
    const PATH_RE = /docs\/decisions\/(D-\d{3}-[a-z0-9-]+\.md)/g;

    test("every referenced docs/decisions/D-NNN-*.md path exists on disk", () => {
      const indexText = textOf("docs/decision-index.md");
      const referenced = [...indexText.matchAll(PATH_RE)].map((m) => m[1]);
      expect(referenced.length).toBeGreaterThan(0);
      for (const fname of referenced) {
        expect(existsSync(join(DECISIONS_DIR, fname))).toBe(true);
      }
    });

    test("every file in docs/decisions/ (except README.md) is referenced exactly once", () => {
      const indexText = textOf("docs/decision-index.md");
      const referenced = [...indexText.matchAll(PATH_RE)].map((m) => m[1]);
      const files = readdirSync(DECISIONS_DIR).filter((f) => f !== "README.md");
      for (const fname of files) {
        const occurrences = referenced.filter((r) => r === fname).length;
        expect(occurrences).toBe(1);
      }
    });
  });
});
