// Filesystem discovery for the svg/ source tree. Node-only (fs). Keeps IO out of the pure modules
// (palette/sanitizer/manifest) so those stay unit-testable without a filesystem.

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EntitySpec } from "./manifest";

/** Recursively collect every *.svg path under `root`. */
export function findSvgFiles(root: string): string[] {
  const out: string[] = [];
  walk(root, (p) => {
    if (p.toLowerCase().endsWith(".svg")) out.push(p);
  });
  return out;
}

/** Recursively collect every entity.json path under `root`. */
export function findEntitySpecs(root: string): string[] {
  const out: string[] = [];
  walk(root, (p) => {
    if (p.toLowerCase().endsWith("entity.json")) out.push(p);
  });
  return out;
}

/** Read + parse one entity.json into an EntitySpec (throws with the path on bad JSON). */
export function readEntitySpec(path: string): EntitySpec {
  const raw = readFileSync(path, "utf8");
  try {
    return JSON.parse(raw) as EntitySpec;
  } catch (e) {
    throw new Error(`readEntitySpec: JSON เสียที่ ${path}: ${(e as Error).message}`);
  }
}

function walk(dir: string, onFile: (path: string) => void): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // missing dir → nothing to do (svg/ may not exist yet)
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // โฟลเดอร์ขึ้นต้น "_" = work-in-progress (เช่น _extra ท่าที่ format ยังไม่รองรับ) —
      // ข้ามทั้ง lint/build เพื่อไม่ให้หลุดไปเป็น icon/entity โดยไม่ตั้งใจ
      if (name.startsWith("_")) continue;
      walk(full, onFile);
    } else onFile(full);
  }
}
