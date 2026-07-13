// Full-surface snapshot lock for the engine config (Design Knobs).
// Purpose: freeze every runtime value + the export/type surface BEFORE the config.ts
// monolith is split into domain modules, so the split can only be a pure move —
// any changed balance value or dropped export fails here. Never edit the snapshot to pass.

import { describe, expect, test } from "vitest";
import {
  DEFAULT_AFK_CONFIG,
  DEFAULT_CAMERA_CONFIG,
  DEFAULT_COMBAT_BALANCE_CONFIG,
  DEFAULT_COMBAT_FEEL_CONFIG,
  DEFAULT_COMBAT_STUB_CONFIG,
  DEFAULT_DEBUG_OVERLAY_CONFIG,
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_EXIT_MARKER_CONFIG,
  DEFAULT_INPUT_CONFIG,
  DEFAULT_MOB_CONFIG,
  DEFAULT_MOVEMENT_VALIDATION_CONFIG,
  DEFAULT_NET_CONFIG,
  DEFAULT_PATHFINDING_CONFIG,
  DEFAULT_PERSISTENCE_CONFIG,
  DEFAULT_PLAYER_ANIMATION_CONFIG,
  DEFAULT_PLAYER_CONFIG,
  DEFAULT_RECONNECT_CONFIG,
  DEFAULT_RENDER_STYLE_CONFIG,
  DEFAULT_SCENE_THEME,
  DEFAULT_STRESS_HARNESS_CONFIG,
  DEFAULT_TRANSITION_CONFIG,
  createEngineConfig,
  resolveResolution,
  soloChannelCapacityForZone,
} from "@/engine/config";
import type {
  AfkConfig,
  AttackShapeConfig,
  CameraConfig,
  CombatBalanceConfig,
  CombatFeelConfig,
  CombatStubConfig,
  DamageNumberPoolConfig,
  DamageNumberStyleConfig,
  DeathFeedbackConfig,
  DebugOverlayConfig,
  DummyDamageRange,
  EffectQuality,
  EffectQualityConfig,
  EffectQualityTierConfig,
  EngineConfig,
  ExitMarkerConfig,
  HitboxDebugConfig,
  HitStopConfig,
  HitTolerance,
  InputConfig,
  JoystickConfig,
  MapZoneType,
  MobAiConfig,
  MobAnimationConfig,
  MobCombatStats,
  MobConfig,
  MobHpBarConfig,
  MobLodConfig,
  MobSpawnConfig,
  MobStyle,
  MobWanderConfig,
  MovementValidationConfig,
  MsRange,
  NetConfig,
  NetInterpolationConfig,
  PathfindingConfig,
  PathMarkerStyle,
  PersistenceConfig,
  PlayerAnimationConfig,
  PlayerCombatStats,
  PlayerConfig,
  PlayerSpriteStyle,
  PlayerStyle,
  PowerPreference,
  PropStyle,
  ReconnectClientRetryConfig,
  ReconnectConfig,
  RendererPreference,
  RenderStyleConfig,
  SceneTheme,
  ScreenShakeConfig,
  ScreenShakeLevelConfig,
  StressHarnessConfig,
  TargetAssistConfig,
  TileSize,
  TransitionConfig,
} from "@/engine/config";

/**
 * Type-surface guard: reference every exported interface/type once. tests are type-checked
 * by `next build`, so a dropped/renamed exported type breaks the build here. Exported so
 * no-unused-vars treats it as used; carries no runtime footprint.
 */
export type _ConfigTypeSurface =
  | AfkConfig
  | AttackShapeConfig
  | CameraConfig
  | CombatBalanceConfig
  | CombatFeelConfig
  | CombatStubConfig
  | DamageNumberPoolConfig
  | DamageNumberStyleConfig
  | DeathFeedbackConfig
  | DebugOverlayConfig
  | DummyDamageRange
  | EffectQuality
  | EffectQualityConfig
  | EffectQualityTierConfig
  | EngineConfig
  | ExitMarkerConfig
  | HitboxDebugConfig
  | HitStopConfig
  | HitTolerance
  | InputConfig
  | JoystickConfig
  | MapZoneType
  | MobAiConfig
  | MobAnimationConfig
  | MobCombatStats
  | MobConfig
  | MobHpBarConfig
  | MobLodConfig
  | MobSpawnConfig
  | MobStyle
  | MobWanderConfig
  | MovementValidationConfig
  | MsRange
  | NetConfig
  | NetInterpolationConfig
  | PathfindingConfig
  | PathMarkerStyle
  | PersistenceConfig
  | PlayerAnimationConfig
  | PlayerCombatStats
  | PlayerConfig
  | PlayerSpriteStyle
  | PlayerStyle
  | PowerPreference
  | PropStyle
  | ReconnectClientRetryConfig
  | ReconnectConfig
  | RendererPreference
  | RenderStyleConfig
  | SceneTheme
  | ScreenShakeConfig
  | ScreenShakeLevelConfig
  | StressHarnessConfig
  | TargetAssistConfig
  | TileSize
  | TransitionConfig;

// The 24 runtime value exports (21 DEFAULT_* consts + 3 functions). Types erase at runtime,
// so Object.keys(module) returns exactly these — a dropped/renamed value export fails here.
const EXPECTED_VALUE_EXPORTS = [
  "DEFAULT_AFK_CONFIG",
  "DEFAULT_CAMERA_CONFIG",
  "DEFAULT_COMBAT_BALANCE_CONFIG",
  "DEFAULT_COMBAT_FEEL_CONFIG",
  "DEFAULT_COMBAT_STUB_CONFIG",
  "DEFAULT_DEBUG_OVERLAY_CONFIG",
  "DEFAULT_ENGINE_CONFIG",
  "DEFAULT_EXIT_MARKER_CONFIG",
  "DEFAULT_INPUT_CONFIG",
  "DEFAULT_MOB_CONFIG",
  "DEFAULT_MOVEMENT_VALIDATION_CONFIG",
  "DEFAULT_NET_CONFIG",
  "DEFAULT_PATHFINDING_CONFIG",
  "DEFAULT_PERSISTENCE_CONFIG",
  "DEFAULT_PLAYER_ANIMATION_CONFIG",
  "DEFAULT_PLAYER_CONFIG",
  "DEFAULT_RECONNECT_CONFIG",
  "DEFAULT_RENDER_STYLE_CONFIG",
  "DEFAULT_SCENE_THEME",
  "DEFAULT_STRESS_HARNESS_CONFIG",
  "DEFAULT_TRANSITION_CONFIG",
  "createEngineConfig",
  "resolveResolution",
  "soloChannelCapacityForZone",
].sort();

const MAP_ZONE_TYPES: MapZoneType[] = ["safe", "field"];

describe("engine config — export-name identity", () => {
  test("module exposes exactly the 24 runtime value exports", async () => {
    const mod = await import("@/engine/config");
    expect(Object.keys(mod).sort()).toEqual(EXPECTED_VALUE_EXPORTS);
  });
});

describe("engine config — value identity (DEFAULT_* consts)", () => {
  test("DEFAULT_AFK_CONFIG", () => expect(DEFAULT_AFK_CONFIG).toMatchSnapshot());
  test("DEFAULT_CAMERA_CONFIG", () => expect(DEFAULT_CAMERA_CONFIG).toMatchSnapshot());
  test("DEFAULT_COMBAT_BALANCE_CONFIG", () => expect(DEFAULT_COMBAT_BALANCE_CONFIG).toMatchSnapshot());
  test("DEFAULT_COMBAT_FEEL_CONFIG", () => expect(DEFAULT_COMBAT_FEEL_CONFIG).toMatchSnapshot());
  test("DEFAULT_COMBAT_STUB_CONFIG", () => expect(DEFAULT_COMBAT_STUB_CONFIG).toMatchSnapshot());
  test("DEFAULT_DEBUG_OVERLAY_CONFIG", () => expect(DEFAULT_DEBUG_OVERLAY_CONFIG).toMatchSnapshot());
  test("DEFAULT_ENGINE_CONFIG", () => expect(DEFAULT_ENGINE_CONFIG).toMatchSnapshot());
  test("DEFAULT_EXIT_MARKER_CONFIG", () => expect(DEFAULT_EXIT_MARKER_CONFIG).toMatchSnapshot());
  test("DEFAULT_INPUT_CONFIG", () => expect(DEFAULT_INPUT_CONFIG).toMatchSnapshot());
  test("DEFAULT_MOB_CONFIG", () => expect(DEFAULT_MOB_CONFIG).toMatchSnapshot());
  test("DEFAULT_MOVEMENT_VALIDATION_CONFIG", () =>
    expect(DEFAULT_MOVEMENT_VALIDATION_CONFIG).toMatchSnapshot());
  test("DEFAULT_NET_CONFIG", () => expect(DEFAULT_NET_CONFIG).toMatchSnapshot());
  test("DEFAULT_PATHFINDING_CONFIG", () => expect(DEFAULT_PATHFINDING_CONFIG).toMatchSnapshot());
  test("DEFAULT_PERSISTENCE_CONFIG", () => expect(DEFAULT_PERSISTENCE_CONFIG).toMatchSnapshot());
  test("DEFAULT_PLAYER_ANIMATION_CONFIG", () =>
    expect(DEFAULT_PLAYER_ANIMATION_CONFIG).toMatchSnapshot());
  test("DEFAULT_PLAYER_CONFIG", () => expect(DEFAULT_PLAYER_CONFIG).toMatchSnapshot());
  test("DEFAULT_RECONNECT_CONFIG", () => expect(DEFAULT_RECONNECT_CONFIG).toMatchSnapshot());
  test("DEFAULT_RENDER_STYLE_CONFIG", () => expect(DEFAULT_RENDER_STYLE_CONFIG).toMatchSnapshot());
  test("DEFAULT_SCENE_THEME", () => expect(DEFAULT_SCENE_THEME).toMatchSnapshot());
  test("DEFAULT_STRESS_HARNESS_CONFIG", () => expect(DEFAULT_STRESS_HARNESS_CONFIG).toMatchSnapshot());
  test("DEFAULT_TRANSITION_CONFIG", () => expect(DEFAULT_TRANSITION_CONFIG).toMatchSnapshot());
});

describe("engine config — value identity (factory / pure functions)", () => {
  test("createEngineConfig() no-arg", () => expect(createEngineConfig()).toMatchSnapshot());
  test("createEngineConfig({})", () => expect(createEngineConfig({})).toMatchSnapshot());

  test("soloChannelCapacityForZone for every MapZoneType", () => {
    const result = Object.fromEntries(
      MAP_ZONE_TYPES.map((zone) => [zone, soloChannelCapacityForZone(zone, 8, 80)]),
    );
    expect(result).toMatchSnapshot();
  });

  test("resolveResolution representative inputs", () => {
    const result = {
      explicitResolution: resolveResolution({ ...DEFAULT_ENGINE_CONFIG, resolution: 1.5 }, 3),
      autoWithDpr: resolveResolution(DEFAULT_ENGINE_CONFIG, 2),
      autoNoDpr: resolveResolution(DEFAULT_ENGINE_CONFIG, undefined),
    };
    expect(result).toMatchSnapshot();
  });
});
