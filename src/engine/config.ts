// Engine shared config + types.
// Plain TS only — ห้าม import React / Next.js / pixi.js runtime ที่นี่ (type-only ได้ถ้าจำเป็น).
// ทุกค่าที่ปรับได้ต้องอยู่ในนี้ (Design Knob discipline, AI.md §กฎเหล็ก) — ห้าม hardcode กระจายในโค้ด render.

import { MAP_ROOM_NAME } from "@/shared/net-protocol";

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
}

/**
 * Placeholder graphic ของ local player (P0-05). sprite จริงมา P0-06 —
 * ตอนนี้เป็น body ellipse + "nose" marker ชี้ทิศ facing เพื่อเห็น direction resolver ทำงาน.
 * วาดโดยเท้า (foot) อยู่ที่ local (0,0) เหมือน prop (anchor ฐาน → depth ตรงตำแหน่ง tile).
 */
export interface PlayerStyle {
  /** สี body (0xRRGGBB) */
  bodyColor: number;
  /** ความกว้าง body (px) */
  bodyWidth: number;
  /** ความสูง body วัดจากเท้าขึ้นบน (px) */
  bodyHeight: number;
  /** สี nose marker (จุดบอกทิศหน้า) */
  noseColor: number;
  /** รัศมี nose marker (px) */
  noseRadius: number;
  /** ระยะ nose ยื่นจากกลาง body ตามทิศ facing (px) */
  noseReach: number;
}

/**
 * Visual knob ของ placeholder sprite ที่ generate ด้วยโค้ด (P0-06) — แทน body/nose ของ P0-05.
 * วาดโดยเท้า (foot) อยู่ที่ local (0,0). ตัวละคร **ไม่สมมาตร** (accent ข้างเดียว) โดยจงใจ
 * เพื่อพิสูจน์ด้วยตาว่าการ mirror (SE←SW, E←W, NE←NW) ทำงานจริง.
 */
export interface PlayerSpriteStyle {
  /** สีลำตัว (0xRRGGBB) */
  bodyColor: number;
  /** สีหัว */
  headColor: number;
  /** สี marker บอก "ด้านหน้า" (หันไปทางไหน) */
  faceColor: number;
  /** สี accent ข้างเดียว (ไหล่/กระเป๋า) — ตัวชี้ asymmetry ที่ต้อง flip ตอน mirror */
  accentColor: number;
  /** สีขา (สลับตอน walk) */
  legColor: number;
  /** ความกว้างลำตัว (px) */
  bodyWidth: number;
  /** ความสูงรวมจากเท้าถึงหัว (px) */
  bodyHeight: number;
  /** ระยะเด้งตัวสูงสุดตอน walk (px) */
  walkBob: number;
}

/**
 * Animation config (P0-06) — data-driven, ทุกค่าเป็น Design Knob.
 * frameDuration หน่วย "ms/เฟรม"; frameCount = จำนวนเฟรมที่ generator สร้างต่อ (animation, ทิศ).
 * manifest จริง (drawn dirs + mirror map) ประกอบใน animation/manifest.ts จากค่าเหล่านี้.
 */
export interface PlayerAnimationConfig {
  /** ms/เฟรม ตอน idle */
  idleFrameDuration: number;
  /** ms/เฟรม ตอน walk */
  walkFrameDuration: number;
  /** ms/เฟรม ตอน attack */
  attackFrameDuration: number;
  /** จำนวนเฟรม idle (≥1) */
  idleFrames: number;
  /** จำนวนเฟรม walk (2–4 แนะนำ) */
  walkFrames: number;
  /** จำนวนเฟรม attack */
  attackFrames: number;
  /** visual knob ของ placeholder */
  style: PlayerSpriteStyle;
}

/**
 * พฤติกรรม local player movement (P0-05). ทุกค่าเป็น Design Knob — ห้าม hardcode ใน mover.
 */
export interface PlayerConfig {
  /** ความเร็วเดิน หน่วย tile/วินาที (วัดในระยะ tile-space euclidean) */
  speed: number;
  /**
   * clamp dt สูงสุดต่อ 1 movement step (วินาที) — กัน tunneling ทะลุกำแพงตอน dt กระโดด
   * (เช่นสลับ tab กลับมา rAF ค้างนาน). speed·maxStepSeconds ต้อง < 1 tile เพื่อไม่ข้ามบล็อก.
   */
  maxStepSeconds: number;
  /** style ของ placeholder graphic (P0-05 — nose marker; ยังเก็บไว้ให้ debug) */
  style: PlayerStyle;
  /** sprite animation config (P0-06) — data-driven, 5-dir + mirror */
  animation: PlayerAnimationConfig;
}

/**
 * Realtime/network knob (P0-07). ทุกค่าปรับได้ที่นี่ (Design Knob discipline).
 * P0 = local dev เท่านั้น; serverUrl override ได้ผ่าน env ตอน bootstrap (GameCanvas).
 */
export interface NetConfig {
  /** เปิด/ปิด realtime ทั้งหมด — false = solo ล้วน (ไม่ connect) */
  enabled: boolean;
  /** ws endpoint ของ Colyseus (default local dev) */
  serverUrl: string;
  /** ชื่อ room (ต้องตรง server) — default = MAP_ROOM_NAME */
  roomName: string;
  /** อัตราส่ง position ขึ้น server (Hz) — tech §6 แนะนำ 10–15Hz */
  positionSyncHz: number;
  /** ระยะ (tile) ที่ต้องขยับเกินถึงจะส่ง — กัน spam idle frame */
  sendEpsilon: number;
  /** ความแข็งของ lerp remote player เข้าหา target ต่อ frame 0..1 */
  remoteLerp: number;
  /** สีตัว remote player (แยกจาก local ด้วยตา) */
  remotePlayerColor: number;
  /** สี accent (ไหล่) ของ remote player */
  remotePlayerAccentColor: number;
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
  /** local player movement + placeholder style (P0-05) */
  player: PlayerConfig;
  /** realtime/network knob (P0-07) */
  net: NetConfig;
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
};

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  followLerp: 0.12,
  edgeMargin: 96,
};

export const DEFAULT_PLAYER_ANIMATION_CONFIG: PlayerAnimationConfig = {
  idleFrameDuration: 500, // เด้งหายใจช้า ๆ
  walkFrameDuration: 140, // ~7fps ก้าวเดิน
  attackFrameDuration: 90,
  idleFrames: 2,
  walkFrames: 4,
  attackFrames: 3,
  style: {
    bodyColor: 0xffd24a,
    headColor: 0xf1c27d,
    faceColor: 0x1b1b23,
    accentColor: 0xd64545, // แดง = ไหล่ข้างเดียว (asymmetry ให้เห็น mirror)
    legColor: 0x5a4a2a,
    bodyWidth: 20,
    bodyHeight: 34,
    walkBob: 3,
  },
};

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  // speed·maxStepSeconds = 0.4 tile/step < 1 → กัน tunneling บล็อก 1 tile.
  speed: 4,
  maxStepSeconds: 0.1,
  style: {
    bodyColor: 0xffd24a,
    bodyWidth: 20,
    bodyHeight: 34,
    noseColor: 0x1b1b23,
    noseRadius: 3,
    noseReach: 14,
  },
  animation: DEFAULT_PLAYER_ANIMATION_CONFIG,
};

export const DEFAULT_NET_CONFIG: NetConfig = {
  enabled: true,
  serverUrl: "ws://localhost:2567",
  roomName: MAP_ROOM_NAME,
  positionSyncHz: 12, // 10–15Hz (tech §6) — 12 = กลางช่วง
  sendEpsilon: 0.02, // tile — ต่ำกว่านี้ = ผู้เล่นแทบไม่ขยับ, ไม่ต้องส่ง
  remoteLerp: 0.2, // นุ่มพอสำหรับ iso movement ที่ 12Hz broadcast
  remotePlayerColor: 0x4aa3ff, // ฟ้า = คนอื่น (local = เหลือง)
  remotePlayerAccentColor: 0x1b5fa8,
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
  player: DEFAULT_PLAYER_CONFIG,
  net: DEFAULT_NET_CONFIG,
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
    // theme/player มี nested object — override ทั้งก้อนเมื่อกำหนด, ไม่งั้นใช้ default
    theme: overrides.theme ?? DEFAULT_ENGINE_CONFIG.theme,
    player: overrides.player ?? DEFAULT_ENGINE_CONFIG.player,
    // net = shallow-merge (override บาง knob เช่น serverUrl จาก env โดยคงค่าอื่น)
    net: { ...DEFAULT_ENGINE_CONFIG.net, ...overrides.net },
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
