// Config: engine root — renderer prefs, EngineConfig aggregate + default, createEngineConfig factory, resolution/channel helpers.
// Composes every domain module below into the single engine runtime config. Plain TS only.

import type { CombatBalanceConfig, CombatStubConfig } from "./combat";
import { DEFAULT_COMBAT_BALANCE_CONFIG, DEFAULT_COMBAT_STUB_CONFIG } from "./combat";
import type { CombatFeelConfig, StressHarnessConfig } from "./combat-feel";
import { DEFAULT_COMBAT_FEEL_CONFIG, DEFAULT_STRESS_HARNESS_CONFIG } from "./combat-feel";
import type { MobConfig } from "./mob";
import { DEFAULT_MOB_CONFIG } from "./mob";
import type {
  MovementValidationConfig,
  NetConfig,
  PersistenceConfig,
  ReconnectConfig,
} from "./net";
import {
  DEFAULT_MOVEMENT_VALIDATION_CONFIG,
  DEFAULT_NET_CONFIG,
  DEFAULT_PERSISTENCE_CONFIG,
  DEFAULT_RECONNECT_CONFIG,
} from "./net";
import type { PathfindingConfig, PlayerConfig } from "./player";
import { DEFAULT_PATHFINDING_CONFIG, DEFAULT_PLAYER_CONFIG } from "./player";
import type { RenderStyleConfig } from "./render";
import { DEFAULT_RENDER_STYLE_CONFIG } from "./render";
import type {
  CameraConfig,
  DebugOverlayConfig,
  ExitMarkerConfig,
  MapZoneType,
  SceneTheme,
  TileSize,
  TransitionConfig,
} from "./scene";
import {
  DEFAULT_CAMERA_CONFIG,
  DEFAULT_DEBUG_OVERLAY_CONFIG,
  DEFAULT_EXIT_MARKER_CONFIG,
  DEFAULT_SCENE_THEME,
  DEFAULT_TRANSITION_CONFIG,
} from "./scene";

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
  /** pathfinding + click-to-move + touch knob (P1-09, TA §17.3 · L11) */
  pathfinding: PathfindingConfig;
  /** map transition fade knob (P1-10, GS §57.3) — fade overlay ตอนข้าม map */
  transition: TransitionConfig;
  /** exit marker knob (P1 fix) — highlight พื้น exit area ให้เห็นทางออก (placeholder art) */
  exitMarker: ExitMarkerConfig;
  /** server-authoritative movement validation knob (P1-02) — mirror client/server */
  movementValidation: MovementValidationConfig;
  /** dummy mob pocket spawn + wander + placeholder style (P0-09) */
  mob: MobConfig;
  /** realtime/network knob (P0-07) */
  net: NetConfig;
  /** reconnect knob (P1-07, GS §59.1) — grace seconds (server) + client retry/backoff (mirror) */
  reconnect: ReconnectConfig;
  /** combat stub knob (P0-10) — hit test/dummy damage (offline)/hitbox debug/death feedback */
  combat: CombatStubConfig;
  /** server combat balance knob (P1-05, TA §15) — k/player stat/mob stat (PENDING OWNER) */
  combatBalance: CombatBalanceConfig;
  /** combat feel knob (P1-06, GS §17 · TA §11) — damage number pool/aggregate, hit stop, screen shake, effect quality */
  combatFeel: CombatFeelConfig;
  /** dev-only stress harness knob (P1-06 §5) — F4 hotkey synthetic load */
  stressHarness: StressHarnessConfig;
  /** debug overlay knob (P0-11) — poll interval/default visibility/depth label style */
  debugOverlay: DebugOverlayConfig;
  /** character save/load persistence knob (P2-05, Storage §24) — server knob (save interval) */
  persistence: PersistenceConfig;
  /** pixelate render style knob (D-065 art path ①) — low-res + nearest upscale ทั้งเกม + asset base URL */
  render: RenderStyleConfig;
}

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
  pathfinding: DEFAULT_PATHFINDING_CONFIG,
  transition: DEFAULT_TRANSITION_CONFIG,
  exitMarker: DEFAULT_EXIT_MARKER_CONFIG,
  movementValidation: DEFAULT_MOVEMENT_VALIDATION_CONFIG,
  mob: DEFAULT_MOB_CONFIG,
  net: DEFAULT_NET_CONFIG,
  reconnect: DEFAULT_RECONNECT_CONFIG,
  combat: DEFAULT_COMBAT_STUB_CONFIG,
  combatBalance: DEFAULT_COMBAT_BALANCE_CONFIG,
  combatFeel: DEFAULT_COMBAT_FEEL_CONFIG,
  stressHarness: DEFAULT_STRESS_HARNESS_CONFIG,
  debugOverlay: DEFAULT_DEBUG_OVERLAY_CONFIG,
  persistence: DEFAULT_PERSISTENCE_CONFIG,
  render: DEFAULT_RENDER_STYLE_CONFIG,
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
    transition: {
      ...DEFAULT_ENGINE_CONFIG.transition,
      ...overrides.transition,
    },
    exitMarker: {
      ...DEFAULT_ENGINE_CONFIG.exitMarker,
      ...overrides.exitMarker,
    },
    // theme/player/mob มี nested object — override ทั้งก้อนเมื่อกำหนด, ไม่งั้นใช้ default
    theme: overrides.theme ?? DEFAULT_ENGINE_CONFIG.theme,
    player: overrides.player ?? DEFAULT_ENGINE_CONFIG.player,
    pathfinding: overrides.pathfinding ?? DEFAULT_ENGINE_CONFIG.pathfinding,
    movementValidation:
      overrides.movementValidation ?? DEFAULT_ENGINE_CONFIG.movementValidation,
    mob: overrides.mob ?? DEFAULT_ENGINE_CONFIG.mob,
    combat: overrides.combat ?? DEFAULT_ENGINE_CONFIG.combat,
    combatBalance: overrides.combatBalance ?? DEFAULT_ENGINE_CONFIG.combatBalance,
    combatFeel: overrides.combatFeel ?? DEFAULT_ENGINE_CONFIG.combatFeel,
    stressHarness: overrides.stressHarness ?? DEFAULT_ENGINE_CONFIG.stressHarness,
    // net = shallow-merge (override บาง knob เช่น serverUrl จาก env โดยคงค่าอื่น)
    net: { ...DEFAULT_ENGINE_CONFIG.net, ...overrides.net },
    // reconnect = shallow-merge (override เช่น graceSeconds โดยคง clientRetry เดิม)
    reconnect: { ...DEFAULT_ENGINE_CONFIG.reconnect, ...overrides.reconnect },
    // debugOverlay = shallow-merge (override เช่น defaultVisible โดยคง poll interval เดิม)
    debugOverlay: { ...DEFAULT_ENGINE_CONFIG.debugOverlay, ...overrides.debugOverlay },
    // persistence = shallow-merge (override saveIntervalMs โดยคงค่าอื่นเดิม)
    persistence: { ...DEFAULT_ENGINE_CONFIG.persistence, ...overrides.persistence },
    // render = shallow-merge (override เช่น pixelate/renderResolution โดยคงค่าอื่นเดิม)
    render: { ...DEFAULT_ENGINE_CONFIG.render, ...overrides.render },
  };
}

/**
 * capacity ต่อ solo channel ตาม zone ของ map (P1-11, TA §6) — **pure decision** (แยกจาก env override glue
 * ใน MapRoom): safe zone (เมือง — ไม่มี combat) ใช้ cityHubCapacity; field ใช้ channelCapacity.
 * MapRoom ส่งค่าที่ resolve env แล้วเข้ามา (dev/test override) — logic เลือก knob = ตรงนี้ (testable).
 */
export function soloChannelCapacityForZone(
  zoneType: MapZoneType,
  channelCapacity: number,
  cityHubCapacity: number,
): number {
  return zoneType === "safe" ? cityHubCapacity : channelCapacity;
}

/** resolve resolution จริงตอน runtime: config.resolution ?? devicePixelRatio ?? 1 */
export function resolveResolution(
  config: EngineConfig,
  devicePixelRatio: number | undefined,
): number {
  if (config.resolution != null) return config.resolution;
  return devicePixelRatio && devicePixelRatio > 0 ? devicePixelRatio : 1;
}
