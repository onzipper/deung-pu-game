import { describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { packAtlasGrid, type RasterFrame } from "../scripts/svg/raster";
import { assembleAtlasSvgForTest } from "../scripts/svg/raster-resvg";

// PNG header (spec): width @ byte 16, height @ byte 20, both big-endian uint32 (no extra dep needed).
function readPngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("resvg backend — native dep smoke test (Windows-safe import + render)", () => {
  test("imports and renders a tiny SVG to PNG", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#FF0000"/></svg>';
    const rendered = new Resvg(svg).render();
    expect(rendered.width).toBe(4);
    expect(rendered.height).toBe(4);
    const png = rendered.asPng();
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.length).toBeGreaterThan(0);
  });
});

describe("svg:build — real rasterize against svg/ (golden mon_slime_leaf)", () => {
  test("PNG atlas size matches the packed layout + atlas json flips to rasterized:true", () => {
    const cwd = process.cwd();
    // run svg:build for real; invoke tsx via node directly (npm shim's `'node' is not recognized`
    // trap on Windows — docs/agent-rules.md Shell & tooling traps).
    const tsxCli = join(cwd, "node_modules", "tsx", "dist", "cli.mjs");
    execFileSync(process.execPath, [tsxCli, "scripts/svg/build.ts"], { cwd, stdio: "pipe" });

    const atlasJsonPath = join(cwd, "svg", ".build", "atlases", "mon_slime_leaf.atlas.json");
    const pngPath = join(cwd, "svg", ".build", "atlases", "mon_slime_leaf.png");
    expect(existsSync(atlasJsonPath)).toBe(true);
    expect(existsSync(pngPath)).toBe(true);

    const atlas = JSON.parse(readFileSync(atlasJsonPath, "utf8")) as {
      rasterized: boolean;
      width: number;
      height: number;
    };
    expect(atlas.rasterized).toBe(true);

    const size = readPngSize(pngPath);
    expect(size.width).toBe(atlas.width);
    expect(size.height).toBe(atlas.height);
  }, 30000);
});

describe("raster-resvg — id/url/href rewrite prevents cross-frame collisions", () => {
  test("two frames sharing id=\"g\" get distinct per-cell prefixes, not a clash", () => {
    const dir = mkdtempSync(join(tmpdir(), "svg-raster-idtest-"));
    try {
      const svgA =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g"><stop offset="0" stop-color="#D84848"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/></svg>';
      const svgB =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g"><stop offset="0" stop-color="#6F9658"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/></svg>';
      const pathA = join(dir, "a.svg");
      const pathB = join(dir, "b.svg");
      writeFileSync(pathA, svgA);
      writeFileSync(pathB, svgB);

      const frames: RasterFrame[] = [
        { animation: "idle", direction: "s", frame: 0, svgPath: pathA },
        { animation: "idle", direction: "s", frame: 1, svgPath: pathB },
      ];
      const layout = packAtlasGrid(["idle_s_0", "idle_s_1"], [64, 64]);
      const atlasSvg = assembleAtlasSvgForTest(frames, layout);

      // no raw unprefixed "g" id survives — each cell got its own f<index>_ prefix.
      expect(atlasSvg).not.toMatch(/id="g"/);
      expect(atlasSvg).toMatch(/id="f0_g"/);
      expect(atlasSvg).toMatch(/id="f1_g"/);
      expect(atlasSvg).toMatch(/url\(#f0_g\)/);
      expect(atlasSvg).toMatch(/url\(#f1_g\)/);

      // and the assembled atlas still renders (proves the rewrite kept the doc valid).
      const rendered = new Resvg(atlasSvg).render();
      expect(rendered.width).toBe(layout.width);
      expect(rendered.height).toBe(layout.height);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
