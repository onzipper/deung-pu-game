// svg:lint — gate every source SVG under svg/ through the sanitizer (security) + palette lint.
// Run: `npm run svg:lint` (tsx). Exit 1 on any dangerous sanitize finding or off-palette color.

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { findSvgFiles } from "./discover";
import { sanitizeSvg, hasDangerous, DANGEROUS_KINDS } from "./sanitizer";
import { lintColors } from "./palette";

const SVG_ROOT = resolve(process.cwd(), "svg");

function main(): void {
  const files = findSvgFiles(SVG_ROOT);
  if (files.length === 0) {
    console.log("svg:lint — ไม่พบไฟล์ .svg ใน svg/ (ยังไม่มี asset)");
    return;
  }

  let failed = 0;
  for (const file of files) {
    const rel = relative(process.cwd(), file);
    const raw = readFileSync(file, "utf8");
    const problems: string[] = [];

    const san = sanitizeSvg(raw);
    if (hasDangerous(san)) {
      for (const f of san.findings) {
        if (DANGEROUS_KINDS.has(f.kind)) problems.push(`ไม่ปลอดภัย [${f.kind}] ${f.detail}`);
      }
    }

    const pal = lintColors(raw);
    if (!pal.ok) problems.push(`สีเถื่อน (นอก 32 palette): ${pal.illegal.join(", ")}`);

    if (problems.length > 0) {
      failed++;
      console.error(`FAIL  ${rel}`);
      for (const p of problems) console.error(`        - ${p}`);
    } else {
      console.log(`ok    ${rel}`);
    }
  }

  console.log(`\nsvg:lint — ${files.length} ไฟล์, ผ่าน ${files.length - failed}, ตก ${failed}`);
  if (failed > 0) process.exit(1);
}

main();
