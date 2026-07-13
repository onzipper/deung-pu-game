// svg:build — the SVG-first build step. For every entity.json under svg/:
//   1. sanitize + palette-lint its source SVGs (hard-fail on danger / off-palette)
//   2. generate the merged manifest (engine 5-dir+mirror + Asset Bible §19)
//   3. compute the atlas grid layout (pixels)
//   4. raster SVG→PNG atlas — real backend (resvg, SVG-01) when the dep loads; PENDING fallback
//      when it doesn't (reported, not failed — build must never break for a missing native dep)
//   5. write manifest + atlas layout (+ PNG when rasterized) to svg/.build/ (generated, gitignored)
//   6. mirror runtime artifacts (manifests/atlases/icons) into public/assets/ for the client to load
//
// Run: `npm run svg:build` (tsx).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { findEntitySpecs, readEntitySpec, findSvgFiles } from "./discover";
import { sanitizeSvg, hasDangerous, DANGEROUS_KINDS } from "./sanitizer";
import { lintColors } from "./palette";
import { buildManifest } from "./manifest";
import { packAtlasGrid, enumerateFrames, PENDING_RASTER_BACKEND } from "./raster";
import type { RasterBackend } from "./raster";

const CWD = process.cwd();
const SVG_ROOT = resolve(CWD, "svg");
const OUT_ROOT = resolve(SVG_ROOT, ".build");
const PUBLIC_ROOT = resolve(CWD, "public", "assets");
const PUBLIC_MANIFESTS = join(PUBLIC_ROOT, "manifests");
const PUBLIC_ATLASES = join(PUBLIC_ROOT, "atlases");
const PUBLIC_ICONS = join(PUBLIC_ROOT, "icons");

/** โหลด resvg backend แบบ dynamic — ถ้า native dep ไม่มี/โหลดพัง ให้ตกกลับไปใช้ PENDING เงียบๆ (ห้าม build พัง). */
async function loadRasterBackend(): Promise<RasterBackend> {
  try {
    const mod = await import("./raster-resvg");
    return mod.RESVG_RASTER_BACKEND;
  } catch (e) {
    console.warn(
      `svg:build — โหลด resvg backend ไม่ได้ (${(e as Error).message}) — ใช้ PENDING (ไม่มี rasterizer dep)`,
    );
    return PENDING_RASTER_BACKEND;
  }
}

async function main(): Promise<void> {
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

  // ── build one manifest + atlas layout (+ PNG) per entity ──
  const specPaths = findEntitySpecs(SVG_ROOT);
  if (specPaths.length === 0) {
    console.log("svg:build — ไม่พบ entity.json (ยังไม่มี entity ให้ build)");
    return;
  }

  mkdirSync(join(OUT_ROOT, "manifests"), { recursive: true });
  mkdirSync(join(OUT_ROOT, "atlases"), { recursive: true });
  mkdirSync(PUBLIC_MANIFESTS, { recursive: true });
  mkdirSync(PUBLIC_ATLASES, { recursive: true });

  const backend = await loadRasterBackend();
  let pendingRaster = 0;
  let rasterFail = 0;

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

    const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
    const pngRelName = `${spec.assetId}.png`;
    const pngOutPath = join(OUT_ROOT, "atlases", pngRelName);

    let rasterized = false;
    if (backend.available) {
      try {
        await backend.rasterize(frames, layout, pngOutPath);
        rasterized = true;
      } catch (e) {
        rasterFail++;
        console.error(`FAIL raster ${spec.assetId}: ${(e as Error).message}`);
      }
    } else {
      pendingRaster++;
    }

    const atlasJson =
      JSON.stringify({ image: pngRelName, rasterized, ...layout }, null, 2) + "\n";

    writeFileSync(join(OUT_ROOT, "manifests", `${spec.assetId}.manifest.json`), manifestJson);
    writeFileSync(join(OUT_ROOT, "atlases", `${spec.assetId}.atlas.json`), atlasJson);

    // ── mirror ── manifest ไป public เสมอ (ของฝั่ง client โหลดเข้าเกม engine ต้องรู้ animations เสมอ)
    writeFileSync(join(PUBLIC_MANIFESTS, `${spec.assetId}.manifest.json`), manifestJson);
    if (rasterized) {
      writeFileSync(join(PUBLIC_ATLASES, `${spec.assetId}.atlas.json`), atlasJson);
      writeFileSync(join(PUBLIC_ATLASES, pngRelName), readFileSync(pngOutPath));
    } else {
      // กัน artifact stale บังคับ placeholder เงียบๆ — ไม่ mirror atlas ที่ยังไม่มี PNG จริงลง public
      console.warn(
        `svg:build — ข้าม mirror atlas "${spec.assetId}" ลง public/ (rasterized:false, กัน artifact ค้าง)`,
      );
    }

    console.log(
      `built ${spec.assetId}  (${Object.keys(manifest.animations).length} anim, ${frames.length} frames, atlas ${layout.width}x${layout.height}, rasterized=${rasterized})`,
    );
  }

  // ── mirror ── icon SVG เดี่ยว (ไฟล์ svg ที่ไม่ได้อยู่โฟลเดอร์ entity เช่น items/vfx/ui) → public/assets/icons/
  const specDirs = new Set(specPaths.map((p) => dirname(p)));
  const iconFiles = svgs.filter((f) => !specDirs.has(dirname(f)));
  if (iconFiles.length > 0) {
    mkdirSync(PUBLIC_ICONS, { recursive: true });
    for (const file of iconFiles) {
      const clean = sanitizeSvg(readFileSync(file, "utf8")).svg;
      // ชื่อไฟล์เดี่ยวๆ ไม่ชนกัน (ไม่มีโฟลเดอร์ย่อยซ้อนใน svg/items|vfx|ui จริง) — ใช้ basename ตรงๆ พอ
      const baseName = file.split(/[\\/]/).pop() as string;
      writeFileSync(join(PUBLIC_ICONS, baseName), clean);
    }
    console.log(`svg:build — mirror icon SVG ${iconFiles.length} ไฟล์ → ${relative(CWD, PUBLIC_ICONS)}/`);
  }

  console.log(`\nsvg:build — ${specPaths.length} entity → ${relative(CWD, OUT_ROOT)}/`);
  if (pendingRaster > 0) {
    console.log(
      `TODO(SVG-01 dep): PNG atlas ยังไม่ถูก raster (${pendingRaster} entity) — ไม่มี rasterizer dep บนเครื่องนี้ (@resvg/resvg-js). manifest + atlas layout พร้อมแล้ว.`,
    );
  }
  if (rasterFail > 0) {
    console.error(`\nsvg:build หยุด — raster ล้มเหลว ${rasterFail} entity`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
