// Manifest generator — merges the engine animation format (src/engine/animation/manifest.ts:
//   drawnDirections + mirrorMap + animations{frames,frameDuration,loop}) with the Asset Bible
//   runtime contract (§19: assetId, frameSize, pivot, mirrorSafe, animations{fps,loop,directions,
//   contactFrame}). Output = one file per entity that both the atlas loader and the engine resolver
//   can read. Pure — no fs; the CLI reads entity.json specs and writes the result.
//
// Direction is imported *as a type* from the engine so this generator can never drift from the
// 5 drawn directions (S/SW/W/NW/N) + mirror (SE←SW / E←W / NE←NW) the resolver expects.

import type { Direction } from "@/engine/movement/direction";

/** One animation as declared in an entity spec (entity.json). */
export interface EntityAnimationSpec {
  /** frames per second (Asset Bible §19). */
  fps: number;
  loop: boolean;
  /** number of drawn frames per direction (≥1). */
  frameCount: number;
  /** contact frame for attacks (Asset Bible §19) — optional. */
  contactFrame?: number;
}

/** The per-entity source spec (entity.json next to the SVG frames). */
export interface EntitySpec {
  assetId: string;
  /** svg/ subtree the entity lives under (monsters/items/vfx/…). */
  category: string;
  /** source canvas [w,h] (Asset Bible §2 — e.g. [64,64]). */
  frameSize: [number, number];
  /** foot pivot [x,y] (depth-sort origin — Asset Bible §2, e.g. [32,54]). */
  pivot: [number, number];
  /** false ⇒ asymmetric art that breaks when mirrored (Asset Bible §5). */
  mirrorSafe: boolean;
  drawnDirections: Direction[];
  mirrorMap: Partial<Record<Direction, Direction>>;
  animations: Record<string, EntityAnimationSpec>;
}

/** One resolved animation — engine fields + bible fields side by side. */
export interface SvgAnimationDef {
  // engine (src/engine/animation/manifest.ts AnimationDef)
  frames: number[];
  frameDuration: number;
  loop: boolean;
  // Asset Bible §19
  fps: number;
  directions: string[];
  contactFrame?: number;
}

/** The generated per-entity manifest (superset of engine + bible). */
export interface SvgEntityManifest {
  assetId: string;
  category: string;
  frameSize: [number, number];
  pivot: [number, number];
  mirrorSafe: boolean;
  drawnDirections: Direction[];
  mirrorMap: Partial<Record<Direction, Direction>>;
  animations: Record<string, SvgAnimationDef>;
}

const KNOWN_DIRECTIONS: readonly Direction[] = [
  "S",
  "SW",
  "W",
  "NW",
  "N",
  "NE",
  "E",
  "SE",
];

/** [0,1,…,n-1] — straight frame run of n frames (matches the engine's seq()). */
function seq(n: number): number[] {
  return Array.from({ length: Math.max(1, n) }, (_, i) => i);
}

/**
 * Build one entity manifest from its spec, validating the same invariants the engine resolver
 * enforces at runtime (throwing clear errors so a bad entity.json fails svg:build, not the game).
 */
export function buildManifest(spec: EntitySpec): SvgEntityManifest {
  if (!spec.assetId) throw new Error("buildManifest: assetId ว่างไม่ได้");
  if (spec.drawnDirections.length === 0) {
    throw new Error(`buildManifest(${spec.assetId}): drawnDirections ต้องมีอย่างน้อย 1 ทิศ`);
  }
  for (const d of spec.drawnDirections) {
    if (!KNOWN_DIRECTIONS.includes(d)) {
      throw new Error(`buildManifest(${spec.assetId}): ทิศไม่รู้จัก "${d}"`);
    }
  }
  // mirror sources must be drawn (same rule as resolveClip in the engine).
  for (const [dir, source] of Object.entries(spec.mirrorMap) as [
    Direction,
    Direction,
  ][]) {
    if (!spec.drawnDirections.includes(source)) {
      throw new Error(
        `buildManifest(${spec.assetId}): mirror ${dir}→${source} แต่ source ไม่อยู่ใน drawnDirections`,
      );
    }
  }

  const animations: Record<string, SvgAnimationDef> = {};
  const directions = spec.drawnDirections.map((d) => d.toLowerCase());
  for (const [name, a] of Object.entries(spec.animations)) {
    if (a.fps <= 0) {
      throw new Error(`buildManifest(${spec.assetId}.${name}): fps ต้อง > 0`);
    }
    if (a.frameCount < 1) {
      throw new Error(`buildManifest(${spec.assetId}.${name}): frameCount ต้อง ≥ 1`);
    }
    const def: SvgAnimationDef = {
      frames: seq(a.frameCount),
      frameDuration: Math.round(1000 / a.fps),
      loop: a.loop,
      fps: a.fps,
      directions,
    };
    if (a.contactFrame !== undefined) def.contactFrame = a.contactFrame;
    animations[name] = def;
  }

  return {
    assetId: spec.assetId,
    category: spec.category,
    frameSize: spec.frameSize,
    pivot: spec.pivot,
    mirrorSafe: spec.mirrorSafe,
    drawnDirections: spec.drawnDirections,
    mirrorMap: spec.mirrorMap,
    animations,
  };
}
