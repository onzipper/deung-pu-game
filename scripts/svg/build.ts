// svg:build — the SVG-first build step. For every entity.json under svg/:
//   1. sanitize + palette-lint its source SVGs (hard-fail on danger / off-palette)
//   2. generate the merged manifest (engine 5-dir+mirror + Asset Bible §19)
//   3. compute the atlas grid layout (pixels)
//   4. raster SVG→PNG atlas   ← TODO: needs a rasterizer dep (see raster.ts) — reported, not failed
//   5. write manifest + atlas layout to svg/.build/ (generated artifacts, gitignored)
//
// Run: `npm run svg:build` (tsx).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { findEntitySpecs, readEntitySpec, findSvgFiles } from "./discover";
import { sanitizeSvg, hasDangerous, DANGEROUS_KINDS } from "./sanitizer";
import { lintColors } from "./palette";
import { buildManifest } from "./manifest";
import { packAtlasGrid, enumerateFrames, PENDING_RASTER_BACKEND } from "./raster";

const CWD = process.cwd();
const SVG_ROOT = resolve(CWD, "svg");
const OUT_ROOT = resolve(SVG_ROOT, ".build");

function main(): void {
  // ── gate: every source SVG must be clean before we build anything ──
  const svgs = findSvgFiles(SVG_ROOT);
  let lintFail = 0;
  for (const file of svgs) {
    const raw = readFileSync(file, "utf8");
    const san = sanitizeSvg(raw);
    const pal = lintColors(raw);
    if (hasDangerous(san) || !pal.ok) {
      lintFail++;
      console.error(`FAIL lint  ${relative(CWD, file)}`);
      if (hasDangerous(san)) {
        for (const f of san.findings) {
          if (DANGEROUS_KINDS.has(f.kind)) console.error(`        - ไม่ปลอดภัย [${f.kind}]`);
        }
      }
      if (!pal.ok) console.error(`        - สีเถื่อน: ${pal.illegal.join(", ")}`);
    }
  }
  if (lintFail > 0) {
    console.error(`\nsvg:build หยุด — lint ตก ${lintFail} ไฟล์ (แก้ให้ผ่าน svg:lint ก่อน)`);
    process.exit(1);
  }

  // ── build one manifest + atlas layout per entity ──
  const specPaths = findEntitySpecs(SVG_ROOT);
  if (specPaths.length === 0) {
    console.log("svg:build — ไม่พบ entity.json (ยังไม่มี entity ให้ build)");
    return;
  }

  mkdirSync(join(OUT_ROOT, "manifests"), { recursive: true });
  mkdirSync(join(OUT_ROOT, "atlases"), { recursive: true });

  let pendingRaster = 0;
  for (const specPath of specPaths) {
    const spec = readEntitySpec(specPath);
    const manifest = buildManifest(spec);
    const specDir = dirname(specPath);

    const frames = enumerateFrames(manifest, (anim, dir, frame) =>
      join(specDir, `${spec.assetId}_${anim}_${dir}_${String(frame).padStart(3, "0")}.svg`),
    );
    const layout = packAtlasGrid(
      frames.map((f) => `${f.animation}_${f.direction}_${f.frame}`),
      manifest.frameSize,
    );

    writeFileSync(
      join(OUT_ROOT, "manifests", `${spec.assetId}.manifest.json`),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    writeFileSync(
      join(OUT_ROOT, "atlases", `${spec.assetId}.atlas.json`),
      JSON.stringify({ image: `${spec.assetId}.png`, rasterized: false, ...layout }, null, 2) + "\n",
    );

    if (!PENDING_RASTER_BACKEND.available) pendingRaster++;
    console.log(
      `built ${spec.assetId}  (${Object.keys(manifest.animations).length} anim, ${frames.length} frames, atlas ${layout.width}x${layout.height})`,
    );
  }

  console.log(`\nsvg:build — ${specPaths.length} entity → ${relative(CWD, OUT_ROOT)}/`);
  if (pendingRaster > 0) {
    console.log(
      `TODO(SVG-01): PNG atlas ยังไม่ถูก raster (${pendingRaster} entity) — ต้องมี rasterizer dep (sharp/@resvg). manifest + atlas layout พร้อมแล้ว.`,
    );
  }
}

main();
