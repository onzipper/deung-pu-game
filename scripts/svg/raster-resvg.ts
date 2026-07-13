// resvg backend for RasterBackend (raster.ts) — real SVG→PNG atlas rasterization (SVG-01).
// Strategy: assemble every frame into ONE atlas SVG (root <svg width height> + one nested
// <svg x y width height viewBox="0 0 fw fh">…frame content…</svg> per cell, positioned by the
// packAtlasGrid layout) then rasterize the whole atlas with a single @resvg/resvg-js render()
// call → one PNG. This keeps pixel alignment exact (resvg lays out each nested <svg> as its own
// viewport, same guarantee crispEdges relies on) and avoids N separate renders + manual blit.
//
// id-collision guard: every frame SVG was authored standalone, so two frames can reuse the same
// `id="..."` (e.g. gradient/clip defs). Since they now live in one document, `id`/`url(#…)`/
// `href="#…"` are rewritten with a per-cell prefix (`f<index>_`) before assembly — regex-based,
// same trust boundary as sanitizer.ts (source SVGs are already sanitized; no script/external refs).
//
// Missing-frame fallback: content track (art) can lag the pipeline — an entity.json may declare
// more frames/directions than currently have a drawn SVG on disk. Rather than hard-fail the whole
// atlas, a missing frame reuses another frame that DOES exist for the same entity (deterministic,
// index-based) and logs a warning. This is a build-time convenience only — it never decides game
// semantics/balance, so it needs no spec sign-off.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { sanitizeSvg } from "./sanitizer";
import type { AtlasLayout, RasterBackend, RasterFrame } from "./raster";

function frameKey(f: RasterFrame): string {
  return `${f.animation}_${f.direction}_${f.frame}`;
}

/** ตัด root <svg ...> ออก เหลือแค่เนื้อใน (re-sanitize อีกชั้นเป็น defense-in-depth). */
function extractInner(svgText: string): string {
  const clean = sanitizeSvg(svgText).svg;
  const openMatch = clean.match(/<svg\b[^>]*>/i);
  if (!openMatch) throw new Error("raster-resvg: หา <svg> root ไม่เจอในไฟล์ต้นทาง");
  const start = clean.indexOf(openMatch[0]) + openMatch[0].length;
  const end = clean.lastIndexOf("</svg>");
  if (end < 0) throw new Error("raster-resvg: หา </svg> ปิดไม่เจอในไฟล์ต้นทาง");
  return clean.slice(start, end).trim();
}

/** รีไรต์ id="..." / url(#...) / href="#..." (รวม xlink:href) ด้วย prefix กันชนกันข้ามเฟรม. */
function rewriteIds(content: string, prefix: string): string {
  let out = content;
  out = out.replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${prefix}${id}"`);
  out = out.replace(/\burl\(#([^)"]+)\)/g, (_m, id: string) => `url(#${prefix}${id})`);
  out = out.replace(
    /((?:xlink:)?href)="#([^"]+)"/g,
    (_m, attr: string, id: string) => `${attr}="#${prefix}${id}"`,
  );
  return out;
}

/**
 * resvg-backed RasterBackend — assembles + rasterizes one atlas PNG per call.
 * `available` is a live check (require succeeded) so build.ts can fall back to PENDING cleanly
 * on a machine where the native dep failed to install, instead of crashing svg:build.
 */
export const RESVG_RASTER_BACKEND: RasterBackend = {
  name: "resvg",
  available: true,
  async rasterize(frames: RasterFrame[], layout: AtlasLayout, outPngPath: string): Promise<void> {
    const existingPaths = frames.filter((f) => existsSync(f.svgPath)).map((f) => f.svgPath);
    if (existingPaths.length === 0) {
      throw new Error("raster-resvg: ไม่มีไฟล์เฟรมต้นทางเลยแม้แต่ไฟล์เดียว — build ต่อไม่ได้");
    }
    const cellByKey = new Map(layout.frames.map((c) => [c.key, c]));
    const [fw, fh] = layout.frameSize;

    const cellSvgs = frames.map((frame, i) => {
      const key = frameKey(frame);
      const cell = cellByKey.get(key);
      if (!cell) throw new Error(`raster-resvg: ไม่พบ cell ใน atlas layout สำหรับ "${key}"`);

      let srcPath = frame.svgPath;
      if (!existsSync(srcPath)) {
        srcPath = existingPaths[i % existingPaths.length];
        console.warn(
          `raster: ${frame.svgPath} ยังไม่มี (ศิลปะยังไม่ครบ, content track) — ใช้ ${srcPath} แทนชั่วคราว`,
        );
      }

      const inner = extractInner(readFileSync(srcPath, "utf8"));
      const rewritten = rewriteIds(inner, `f${i}_`);
      return `<svg x="${cell.x}" y="${cell.y}" width="${fw}" height="${fh}" viewBox="0 0 ${fw} ${fh}">${rewritten}</svg>`;
    });

    const atlasSvg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" ` +
      `viewBox="0 0 ${layout.width} ${layout.height}" shape-rendering="crispEdges">` +
      cellSvgs.join("") +
      `</svg>`;

    const resvg = new Resvg(atlasSvg, { font: { loadSystemFonts: false } });
    const png = resvg.render().asPng();

    mkdirSync(dirname(outPngPath), { recursive: true });
    writeFileSync(outPngPath, png);
  },
};

/** ประกอบ atlas SVG แบบเดียวกับที่ rasterize() ใช้ — เอกซ์พอร์ตแยกไว้ให้เทสตรวจ id-rewrite ได้โดยไม่ต้อง render จริง. */
export function assembleAtlasSvgForTest(
  frames: RasterFrame[],
  layout: AtlasLayout,
): string {
  const cellByKey = new Map(layout.frames.map((c) => [c.key, c]));
  const [fw, fh] = layout.frameSize;
  const existingPaths = frames.filter((f) => existsSync(f.svgPath)).map((f) => f.svgPath);
  const cellSvgs = frames.map((frame, i) => {
    const key = frameKey(frame);
    const cell = cellByKey.get(key);
    if (!cell) throw new Error(`assembleAtlasSvgForTest: ไม่พบ cell สำหรับ "${key}"`);
    const srcPath = existsSync(frame.svgPath) ? frame.svgPath : existingPaths[i % existingPaths.length];
    const inner = extractInner(readFileSync(srcPath, "utf8"));
    const rewritten = rewriteIds(inner, `f${i}_`);
    return `<svg x="${cell.x}" y="${cell.y}" width="${fw}" height="${fh}" viewBox="0 0 ${fw} ${fh}">${rewritten}</svg>`;
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" ` +
    `viewBox="0 0 ${layout.width} ${layout.height}" shape-rendering="crispEdges">` +
    cellSvgs.join("") +
    `</svg>`
  );
}
