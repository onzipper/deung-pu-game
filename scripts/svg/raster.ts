// Raster → atlas step (interface + grid packing). SVG-first requires build-time raster→atlas for
// world entities ("no runtime inline SVG for world entities" — D-043 V2 / spec §2.2).
//
// TODO(SVG-01): the actual SVG→PNG rasterize needs a native lib (sharp or @resvg/resvg-js) that is
// NOT in package.json. Per brief we do NOT add a dependency here — the interface + atlas layout +
// manifest format are complete; wiring a real backend is the only remaining step. See report.
//
// Pure grid packer (packAtlasGrid) is fully implemented + dep-free so the atlas manifest shape is
// real today; only the pixel bytes are pending a rasterizer.

import type { SvgEntityManifest } from "./manifest";

/** One frame the rasterizer must produce: source SVG → cell in the atlas. */
export interface RasterFrame {
  /** e.g. "idle" */
  animation: string;
  /** drawn direction, lowercase (e.g. "s") */
  direction: string;
  /** 0-based frame index within the animation */
  frame: number;
  /** absolute path to the source SVG for this frame */
  svgPath: string;
}

/** Rect of one frame inside the packed atlas image (pixels). */
export interface AtlasFrameRect {
  key: string; // `${animation}_${direction}_${frame}`
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasLayout {
  /** packed atlas image dimensions (pixels). */
  width: number;
  height: number;
  frameSize: [number, number];
  frames: AtlasFrameRect[];
}

/**
 * Pack N frames of a fixed cell size into a near-square grid (row-major).
 * Deterministic + pure — this is the layout the rasterizer fills and the loader reads.
 */
export function packAtlasGrid(
  frameKeys: string[],
  frameSize: [number, number],
): AtlasLayout {
  const [fw, fh] = frameSize;
  const n = frameKeys.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const frames: AtlasFrameRect[] = frameKeys.map((key, i) => ({
    key,
    x: (i % cols) * fw,
    y: Math.floor(i / cols) * fh,
    w: fw,
    h: fh,
  }));
  return { width: cols * fw, height: rows * fh, frameSize, frames };
}

/** Enumerate every (animation, direction, frame) cell a manifest needs rastered. */
export function enumerateFrames(
  manifest: SvgEntityManifest,
  svgPathFor: (animation: string, direction: string, frame: number) => string,
): RasterFrame[] {
  const out: RasterFrame[] = [];
  for (const [animation, def] of Object.entries(manifest.animations)) {
    for (const direction of def.directions) {
      for (const frame of def.frames) {
        out.push({ animation, direction, frame, svgPath: svgPathFor(animation, direction, frame) });
      }
    }
  }
  return out;
}

/** Backend that turns SVG frames into a packed PNG atlas. */
export interface RasterBackend {
  readonly name: string;
  /** false ⇒ no rasterizer dependency installed; svg:build emits the manifest + skips PNG bytes. */
  readonly available: boolean;
  rasterize(frames: RasterFrame[], layout: AtlasLayout, outPngPath: string): Promise<void>;
}

/**
 * Placeholder backend used until a real rasterizer dependency is approved (see TODO above).
 * `available:false` lets svg:build produce the full atlas manifest and report the pending PNG,
 * instead of failing the pipeline.
 */
export const PENDING_RASTER_BACKEND: RasterBackend = {
  name: "pending(no-dep)",
  available: false,
  async rasterize() {
    throw new Error(
      "raster: ยังไม่มี rasterizer backend (ต้องติดตั้ง sharp หรือ @resvg/resvg-js — รอ owner อนุมัติ, ดู SVG-01)",
    );
  },
};
