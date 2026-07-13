// Runtime atlas/manifest format — the PURE parse + map layer between the SVG-01 build pipeline
// (svg/.build/manifests/*.manifest.json + atlases/*.atlas.json) and the engine animation system.
// Plain TS ONLY — ห้าม import pixi / React / Next, และ **ห้าม import จาก scripts/** (คนละ boundary:
// build ↔ runtime). runtime นิยาม type ของตัวเองแล้ว validate เข้ม — ไฟล์ build เพี้ยนต้องพังตอน load
// พร้อมข้อความไทยชัด (สไตล์เดียวกับ pipeline) ไม่ใช่ไปพังเงียบ ๆ ตอน render.
//
// โซนใกล้ depth-sort/anchor (ความถูกต้องห้ามพลาด):
//   • frameRects: normalize key ทุกอันเป็น "<anim>:<DIR ตัวใหญ่>:<index>" — แปลง dir ตัวเล็ก→Direction
//     ตัวใหญ่ "จุดเดียว" (dirFromAtlasToken) กันคนละที่แปลงคนละแบบ.
//   • anchorFromPivot: pivot(px) → สัดส่วน 0-1 = foot anchor ที่ depth-sort พึ่ง. ผิด = sprite ลอย/จม.

import type { Direction } from "@/engine/movement/direction";
import type {
  AnimationDef,
  AnimationManifest,
} from "@/engine/animation/manifest";

// ── Runtime types (นิยามเอง — mirror ของ build output แต่คนละ boundary) ──────────

/** 1 animation ใน manifest ที่ build เขียนออกมา (engine fields + Asset Bible §19 fields). */
export interface RuntimeAnimationDef {
  frames: number[];
  frameDuration: number;
  loop: boolean;
  fps: number;
  directions: string[];
  contactFrame?: number;
}

/** per-entity manifest ที่ build เขียนลง svg/.build/manifests/<assetId>.manifest.json. */
export interface RuntimeEntityManifest {
  assetId: string;
  category: string;
  frameSize: [number, number];
  pivot: [number, number];
  mirrorSafe: boolean;
  drawnDirections: Direction[];
  mirrorMap: Partial<Record<Direction, Direction>>;
  animations: Record<string, RuntimeAnimationDef>;
}

/** 1 frame rect ใน atlas image (pixels). */
export interface RuntimeAtlasFrame {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** atlas layout ที่ build เขียนลง svg/.build/atlases/<assetId>.atlas.json. */
export interface RuntimeAtlas {
  image: string;
  rasterized: boolean;
  width: number;
  height: number;
  frameSize: [number, number];
  frames: RuntimeAtlasFrame[];
}

// ── Direction conversion (จุดเดียว) ─────────────────────────────────────────────

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
const DIRECTION_SET = new Set<string>(KNOWN_DIRECTIONS);

/**
 * แปลง direction token ของ atlas/build (ตัวพิมพ์เล็ก เช่น "sw") → Direction ตัวพิมพ์ใหญ่ ("SW").
 * ตรวจว่าเป็น 1 ใน 8 ทิศจริง — ไม่ใช่ → throw. **จุดเดียว** ที่ทำ mapping นี้ในทั้ง runtime.
 */
export function dirFromAtlasToken(token: string): Direction {
  const upper = token.toUpperCase();
  if (!DIRECTION_SET.has(upper)) {
    throw new Error(`atlas: direction token ไม่รู้จัก "${token}"`);
  }
  return upper as Direction;
}

// ── validation helpers (สไตล์ fail-loud เหมือน map loader / pipeline) ────────────

function asRecord(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new Error(`${path} ต้องเป็น object (got ${describe(v)})`);
  }
  return v as Record<string, unknown>;
}

function asArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) {
    throw new Error(`${path} ต้องเป็น array (got ${describe(v)})`);
  }
  return v;
}

function reqString(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${path} ต้องเป็น string ไม่ว่าง (got ${describe(v)})`);
  }
  return v;
}

function reqBool(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") {
    throw new Error(`${path} ต้องเป็น boolean (got ${describe(v)})`);
  }
  return v;
}

function reqFiniteNumber(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`${path} ต้องเป็น number finite (got ${describe(v)})`);
  }
  return v;
}

function reqInt(v: unknown, path: string): number {
  const n = reqFiniteNumber(v, path);
  if (!Number.isInteger(n)) {
    throw new Error(`${path} ต้องเป็น integer (got ${n})`);
  }
  return n;
}

/** [w,h] tuple ของ number finite > 0. */
function reqSize(v: unknown, path: string): [number, number] {
  const arr = asArray(v, path);
  if (arr.length !== 2) {
    throw new Error(`${path} ต้องเป็น [w,h] 2 ค่า (got length ${arr.length})`);
  }
  const w = reqFiniteNumber(arr[0], `${path}[0]`);
  const h = reqFiniteNumber(arr[1], `${path}[1]`);
  if (w <= 0 || h <= 0) {
    throw new Error(`${path} ต้อง > 0 ทั้ง w,h (got [${w},${h}])`);
  }
  return [w, h];
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function reqDirection(v: unknown, path: string): Direction {
  const s = reqString(v, path);
  if (!DIRECTION_SET.has(s)) {
    throw new Error(`${path} ทิศไม่รู้จัก "${s}" (ต้องเป็นตัวพิมพ์ใหญ่ 1 ใน 8 ทิศ)`);
  }
  return s as Direction;
}

// ── parsers ──────────────────────────────────────────────────────────────────

function parseAnimationDef(v: unknown, path: string): RuntimeAnimationDef {
  const o = asRecord(v, path);
  const framesRaw = asArray(o.frames, `${path}.frames`);
  if (framesRaw.length === 0) {
    throw new Error(`${path}.frames ต้องมีอย่างน้อย 1 เฟรม`);
  }
  const frames = framesRaw.map((f, i) => {
    const n = reqInt(f, `${path}.frames[${i}]`);
    if (n < 0) throw new Error(`${path}.frames[${i}] ต้อง ≥ 0 (got ${n})`);
    return n;
  });
  const fps = reqFiniteNumber(o.fps, `${path}.fps`);
  if (fps <= 0) throw new Error(`${path}.fps ต้อง > 0 (got ${fps})`);

  const directions = asArray(o.directions, `${path}.directions`).map((d, i) =>
    reqString(d, `${path}.directions[${i}]`),
  );

  const def: RuntimeAnimationDef = {
    frames,
    frameDuration: reqInt(o.frameDuration, `${path}.frameDuration`),
    loop: reqBool(o.loop, `${path}.loop`),
    fps,
    directions,
  };
  if (o.contactFrame !== undefined) {
    def.contactFrame = reqInt(o.contactFrame, `${path}.contactFrame`);
  }
  return def;
}

/**
 * Validate + parse per-entity manifest json (unknown) → RuntimeEntityManifest.
 * ตรวจ invariant เดียวกับที่ engine resolver คาดหวัง: drawnDirections ≥ 1, mirror source ต้องวาดจริง.
 */
export function parseEntityManifest(json: unknown): RuntimeEntityManifest {
  const o = asRecord(json, "manifest");
  const assetId = reqString(o.assetId, "manifest.assetId");
  const category = reqString(o.category, "manifest.category");
  const frameSize = reqSize(o.frameSize, "manifest.frameSize");
  const pivot = reqSize(o.pivot, "manifest.pivot");
  const mirrorSafe = reqBool(o.mirrorSafe, "manifest.mirrorSafe");

  const drawnRaw = asArray(o.drawnDirections, "manifest.drawnDirections");
  if (drawnRaw.length === 0) {
    throw new Error(`manifest(${assetId}): drawnDirections ต้องมีอย่างน้อย 1 ทิศ`);
  }
  const drawnDirections = drawnRaw.map((d, i) =>
    reqDirection(d, `manifest.drawnDirections[${i}]`),
  );
  const drawnSet = new Set<Direction>(drawnDirections);

  const mirrorRaw = asRecord(o.mirrorMap, "manifest.mirrorMap");
  const mirrorMap: Partial<Record<Direction, Direction>> = {};
  for (const [dir, source] of Object.entries(mirrorRaw)) {
    const d = reqDirection(dir, `manifest.mirrorMap key "${dir}"`);
    const s = reqDirection(source, `manifest.mirrorMap.${dir}`);
    if (!drawnSet.has(s)) {
      throw new Error(
        `manifest(${assetId}): mirror ${d}→${s} แต่ source ไม่อยู่ใน drawnDirections`,
      );
    }
    mirrorMap[d] = s;
  }

  const animsRaw = asRecord(o.animations, "manifest.animations");
  const keys = Object.keys(animsRaw);
  if (keys.length === 0) {
    throw new Error(`manifest(${assetId}): animations ว่างไม่ได้`);
  }
  const animations: Record<string, RuntimeAnimationDef> = {};
  for (const name of keys) {
    animations[name] = parseAnimationDef(
      animsRaw[name],
      `manifest.animations.${name}`,
    );
  }

  return {
    assetId,
    category,
    frameSize,
    pivot,
    mirrorSafe,
    drawnDirections,
    mirrorMap,
    animations,
  };
}

/** Validate + parse atlas layout json (unknown) → RuntimeAtlas. */
export function parseAtlas(json: unknown): RuntimeAtlas {
  const o = asRecord(json, "atlas");
  const image = reqString(o.image, "atlas.image");
  const rasterized = reqBool(o.rasterized, "atlas.rasterized");
  const width = reqInt(o.width, "atlas.width");
  const height = reqInt(o.height, "atlas.height");
  if (width <= 0 || height <= 0) {
    throw new Error(`atlas: width/height ต้อง > 0 (got ${width}x${height})`);
  }
  const frameSize = reqSize(o.frameSize, "atlas.frameSize");

  const framesRaw = asArray(o.frames, "atlas.frames");
  if (framesRaw.length === 0) {
    throw new Error("atlas: frames ว่างไม่ได้");
  }
  const frames: RuntimeAtlasFrame[] = framesRaw.map((f, i) => {
    const fr = asRecord(f, `atlas.frames[${i}]`);
    return {
      key: reqString(fr.key, `atlas.frames[${i}].key`),
      x: reqInt(fr.x, `atlas.frames[${i}].x`),
      y: reqInt(fr.y, `atlas.frames[${i}].y`),
      w: reqInt(fr.w, `atlas.frames[${i}].w`),
      h: reqInt(fr.h, `atlas.frames[${i}].h`),
    };
  });

  return { image, rasterized, width, height, frameSize, frames };
}

// ── mappers ────────────────────────────────────────────────────────────────────

/**
 * แปลง RuntimeEntityManifest → AnimationManifest ที่ animator resolver ใช้ (engine format).
 * เก็บเฉพาะ field ที่ resolver ต้องการ: drawnDirections + mirrorMap + animations{frames,frameDuration,loop}
 * (fps/directions/contactFrame เป็นข้อมูล build/atlas — resolver ไม่ใช้).
 */
export function toAnimationManifest(m: RuntimeEntityManifest): AnimationManifest {
  const animations: Record<string, AnimationDef> = {};
  for (const [name, def] of Object.entries(m.animations)) {
    animations[name] = {
      frames: def.frames,
      frameDuration: def.frameDuration,
      loop: def.loop,
    };
  }
  return {
    drawnDirections: m.drawnDirections,
    mirrorMap: m.mirrorMap,
    animations,
  };
}

/**
 * Index atlas frames เป็น Map ที่ loader ใช้หา rect ต่อ (animation, drawnDirection, frameIndex).
 * key normalize = "<anim>:<DIR ตัวใหญ่>:<index>" (แปลง dir ตัวเล็กของ atlas → Direction ตัวใหญ่จุดเดียว).
 *
 * atlas key ดิบ = "<anim>_<dir>_<frame>" (dir ตัวเล็ก). anim อาจมี "_" ได้ → split จากขวา:
 * segment สุดท้าย = frame index, ก่อนหน้า = direction, ที่เหลือ = animation name.
 */
export function frameRects(
  atlas: RuntimeAtlas,
): Map<string, { x: number; y: number; w: number; h: number }> {
  const out = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const f of atlas.frames) {
    const parts = f.key.split("_");
    if (parts.length < 3) {
      throw new Error(
        `atlas frame key "${f.key}" ผิดรูป — ต้องเป็น "<anim>_<dir>_<frame>"`,
      );
    }
    const frameToken = parts[parts.length - 1];
    const dirToken = parts[parts.length - 2];
    const anim = parts.slice(0, parts.length - 2).join("_");
    const frameIndex = Number(frameToken);
    if (!Number.isInteger(frameIndex) || frameIndex < 0) {
      throw new Error(
        `atlas frame key "${f.key}": frame index ต้องเป็น integer ≥ 0 (got "${frameToken}")`,
      );
    }
    const dir = dirFromAtlasToken(dirToken);
    const normalized = `${anim}:${dir}:${frameIndex}`;
    if (out.has(normalized)) {
      throw new Error(`atlas: frame key ซ้ำหลัง normalize ("${normalized}")`);
    }
    out.set(normalized, { x: f.x, y: f.y, w: f.w, h: f.h });
  }
  return out;
}

/**
 * แปลง foot pivot (px, จาก manifest) + frameSize (px) → anchor สัดส่วน 0-1 สำหรับ Sprite.anchor.
 * เช่น pivot [32,54] / frameSize [64,64] → { x: 0.5, y: 0.84375 }.
 * **จุดนี้คือ foot anchor ที่ depth-sort พึ่ง — ผิดแม้ครึ่ง px = sprite ลอย/จมทั้งเกม.**
 */
export function anchorFromPivot(
  pivot: [number, number],
  frameSize: [number, number],
): { x: number; y: number } {
  const [px, py] = pivot;
  const [w, h] = frameSize;
  if (w <= 0 || h <= 0) {
    throw new Error(`anchorFromPivot: frameSize ต้อง > 0 (got [${w},${h}])`);
  }
  return { x: px / w, y: py / h };
}
