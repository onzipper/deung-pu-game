import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// CODEMAP path guard (AI Operating System Starter Kit, หน้า 7):
// ทุก path ที่อ้างใน docs routing ต้องมีอยู่จริง — ลบ/ย้ายไฟล์แล้วลืมอัปเดต docs = test แดง

const ROOT = resolve(__dirname, "..");

const DOC_FILES = [
  "docs/CODEMAP.md",
  "docs/feature-map.md",
  ...readdirSync(join(ROOT, "docs/context"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `docs/context/${f}`),
];

/** ดึง token ใน backtick ที่หน้าตาเป็น path — ข้ามบรรทัดที่มาร์ก (planned) และ token ที่มี wildcard/space */
function extractPaths(docPath: string): { path: string; line: number }[] {
  const out: { path: string; line: number }[] = [];
  const lines = readFileSync(join(ROOT, docPath), "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes("(planned)")) return;
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      const token = m[1];
      if (/[\s*<>|]/.test(token)) continue; // คำสั่ง/wildcard/placeholder
      if (!token.includes("/") && !/\.[a-z]+$/i.test(token)) continue; // ไม่ใช่ path
      out.push({ path: token, line: i + 1 });
    }
  });
  return out;
}

describe("docs path guard", () => {
  for (const doc of DOC_FILES) {
    test(`${doc}: ทุก path ที่อ้างต้องมีจริง`, () => {
      const missing = extractPaths(doc).filter(
        ({ path }) => !existsSync(join(ROOT, path)),
      );
      expect(
        missing,
        missing.map((m) => `${doc}:${m.line} อ้าง "${m.path}" แต่ไฟล์ไม่มีจริง`).join("\n"),
      ).toEqual([]);
    });
  }
});
