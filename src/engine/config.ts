// Engine shared config + types.
// Plain TS only — ห้าม import React / Next.js / pixi.js runtime ที่นี่ (type-only ได้ถ้าจำเป็น).
// ทุกค่าที่ปรับได้ต้องอยู่ในนี้ (Design Knob discipline, AI.md §กฎเหล็ก) — ห้าม hardcode กระจายในโค้ด render.

/** ขนาด diamond tile ของ iso grid (locked ~64×32, tech §17). ยังไม่ใช้จริงใน P0-01 — วางไว้ให้ layer ถัดไป. */
export interface TileSize {
  /** ความกว้าง diamond (px) ที่ resolution = 1 */
  width: number;
  /** ความสูง diamond (px) ที่ resolution = 1 */
  height: number;
}

/**
 * Style ของ prop placeholder 1 ชนิด (ยังไม่มี texture จริง — P0-06 จะแทนด้วย sprite).
 * วาดโดย "เท้า" (foot) อยู่ที่ local (0,0) แล้วตัวสูงขึ้นไปทาง −y (anchor ที่ฐาน).
 */
export interface PropStyle {
  /** สี fill (0xRRGGBB) */
  color: number;
  /** ความกว้าง placeholder (px) */
  width: number;
  /** ความสูง placeholder (px) — วัดจากเท้าขึ้นบน */
  height: number;
  /** รูปทรง placeholder */
  shape: "box" | "ellipse";
}

/**
 * Theme ของ map scene — สีทั้งหมดเป็น config (Design Knob discipline, ห้าม hardcode ใน renderer).
 * props: map propId → style; ไม่พบ → defaultProp.
 */
export interface SceneTheme {
  /** สีพื้น tile ช่องคู่ (checker A) */
  tileColorA: number;
  /** สีพื้น tile ช่องคี่ (checker B) */
  tileColorB: number;
  /** สีเส้น grid diamond */
  gridLineColor: number;
  /** ความทึบเส้น grid 0..1 */
  gridLineAlpha: number;
  /** สี tile ที่ block (กำแพง/บ่อ/สิ่งกีดขวาง) */
  blockedColor: number;
  /** style เริ่มต้นเมื่อ propId ไม่ตรงใน props map */
  defaultProp: PropStyle;
  /** style ต่อ propId */
  props: Record<string, PropStyle>;
  /** style ของ debug pointer entity (พิสูจน์ dynamic depth sort ด้วยตา) */
  debugEntity: PropStyle;
}

/** พฤติกรรมกล้อง (fixed iso · no rotation · no zoom — P0). */
export interface CameraConfig {
  /** ความแข็งของ follow lerp ต่อ frame 0..1 (สูง=ตามเร็ว, 1=snap) */
  followLerp: number;
  /** ระยะ (px) ที่ยอมให้กล้องเห็นเลยขอบ map ก่อน clamp */
  edgeMargin: number;
}

/** renderer preference ที่ pixi autoDetect รองรับ */
export type RendererPreference = "webgl" | "webgpu";

// ตรงกับ pixi GpuPowerPreference (ไม่มี "default" — ถ้าอยากให้ browser เลือกเอง ใช้ webgl default ผ่าน preference)
export type PowerPreference = "high-performance" | "low-power";

/**
 * Config กลางของ engine runtime.
 * ค่า resolution = null หมายถึง "auto" → resolve เป็น devicePixelRatio ตอน runtime (config เป็น plain TS ไม่แตะ window).
 */
export interface EngineConfig {
  /** สีพื้นหลัง canvas (0xRRGGBB) */
  backgroundColor: number;
  /** ความทึบพื้นหลัง 0..1 */
  backgroundAlpha: number;
  /** เปิด antialias หรือไม่ (pixel art มักปิด แต่ P0-01 ยังเป็น placeholder จึงเปิดไว้ก่อน) */
  antialias: boolean;
  /** resolution scale; null = ใช้ devicePixelRatio ตอน runtime */
  resolution: number | null;
  /** ให้ pixi ปรับ CSS size ตาม resolution เอง */
  autoDensity: boolean;
  /** ตัวเลือก renderer backend */
  preference: RendererPreference;
  /** hint การใช้ GPU */
  powerPreference: PowerPreference;
  /** เป้า fps (ยังไม่ throttle ใน P0-01 — pixi ticker วิ่งตาม rAF) */
  targetFps: number;
  /** ขนาด iso tile (diamond projection) */
  tileSize: TileSize;
  /** สี/สไตล์ของ map scene (P0-04) */
  theme: SceneTheme;
  /** พฤติกรรมกล้อง (P0-04) */
  camera: CameraConfig;
  /**
   * เปิด debug pointer entity (วงจี๊ดเดินตาม pointer) เพื่อพิสูจน์ depth sort ด้วยตา.
   * P0-05 จะแทนด้วย player จริง — ตอนนั้นปิด flag นี้ได้.
   */
  debugPointerEntity: boolean;
}

export const DEFAULT_SCENE_THEME: SceneTheme = {
  tileColorA: 0x3a4a3f,
  tileColorB: 0x33423a,
  gridLineColor: 0x5c7a68,
  gridLineAlpha: 0.35,
  blockedColor: 0x7a4a3a,
  defaultProp: { color: 0x8a8a8a, width: 20, height: 28, shape: "box" },
  props: {
    tree: { color: 0x2f7d4f, width: 22, height: 44, shape: "box" },
    rock: { color: 0x9099a0, width: 24, height: 18, shape: "ellipse" },
    bush: { color: 0x3f9d5f, width: 26, height: 20, shape: "ellipse" },
    signpost: { color: 0xc9a24b, width: 12, height: 34, shape: "box" },
    stump: { color: 0x7a5a3a, width: 20, height: 16, shape: "ellipse" },
  },
  debugEntity: { color: 0xff2d78, width: 22, height: 22, shape: "ellipse" },
};

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  followLerp: 0.12,
  edgeMargin: 96,
};

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  backgroundColor: 0x1b1b23,
  backgroundAlpha: 1,
  antialias: true,
  resolution: null,
  autoDensity: true,
  preference: "webgl",
  powerPreference: "high-performance",
  targetFps: 60,
  tileSize: { width: 64, height: 32 },
  theme: DEFAULT_SCENE_THEME,
  camera: DEFAULT_CAMERA_CONFIG,
  debugPointerEntity: true,
};

/**
 * สร้าง config โดย override บางค่าจาก default (deep-merge เฉพาะ tileSize).
 * ใช้ตอน bootstrap engine เพื่อกันการกระจาย literal ทั่วโค้ด.
 */
export function createEngineConfig(
  overrides: Partial<EngineConfig> = {},
): EngineConfig {
  return {
    ...DEFAULT_ENGINE_CONFIG,
    ...overrides,
    tileSize: {
      ...DEFAULT_ENGINE_CONFIG.tileSize,
      ...overrides.tileSize,
    },
    camera: {
      ...DEFAULT_ENGINE_CONFIG.camera,
      ...overrides.camera,
    },
    // theme มี nested Record (props) — override ทั้งก้อนเมื่อกำหนด, ไม่งั้นใช้ default
    theme: overrides.theme ?? DEFAULT_ENGINE_CONFIG.theme,
  };
}

/** resolve resolution จริงตอน runtime: config.resolution ?? devicePixelRatio ?? 1 */
export function resolveResolution(
  config: EngineConfig,
  devicePixelRatio: number | undefined,
): number {
  if (config.resolution != null) return config.resolution;
  return devicePixelRatio && devicePixelRatio > 0 ? devicePixelRatio : 1;
}
