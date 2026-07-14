// Engine runtime bootstrap — ครอบ pixi Application.
// Plain TS + pixi เท่านั้น — ห้าม import React / Next.js (layer contract, tech §2).
// แยก calc (update state) ออกจาก render ไว้ตั้งแต่ต้น เพื่อเตรียม server-authoritative ตอน P1.
//
// P2-01 (docs/context/ui.md contract): game loop → publishHudState (throttled, `@/ui/store/game-store`
//   vanilla zustand store) → React subscribe. `game-store.ts` เป็น **vanilla** store (ไม่มี React import)
//   จึงนำเข้าที่นี่ได้โดยไม่ผิด "ห้าม import React" ด้านบน — React hook อยู่คนละไฟล์ (use-game-store.ts, UI เท่านั้น).
//
// P1-10 (GS §57.3 separated rooms + loading/fade): engine รองรับ **หลาย map + transition**.
//   โครง: outer shell (app/ui/fps/resize/transition/master tick) คงที่ · "world" (scene + player + mobs +
//   combat + net + input) = per-map, สร้างผ่าน mountWorld(map, spawn) แล้ว teardown+rebuild ตอนข้าม map.
//   transition = fade overlay (transition.ts) → จอมืดสุด → destroy world เดิม (net leave room = consented,
//   client อื่นเห็นหาย) → mount world ใหม่ (join room map ปลายทางที่ targetSpawn) → fade in. input lock ระหว่างนั้น.
//   online = server ตัดสิน (MSG_MAP_TRANSITION) · offline = client ตรวจ exit เอง (findExitAt) → ข้าม map local ได้.

import { Application, Container, Text, TextureSource, type Ticker } from "pixi.js";
import { type EngineConfig, resolveResolution } from "../config";
import { requireMap, getMap, hasMap } from "../map/registry";
import { findExitAt, type MapConfig } from "../map/types";
import { createMapScene, type MapSceneHandle } from "../render/scene";
import { createNameplateLayer } from "../render/nameplate-layer";
import { buildExitMarkerPolygons } from "../render/exit-marker";
import { createAssetRegistry } from "../assets/registry";
import { collectMapAssetIds } from "../assets/collect";
import { createLocalPlayer, type LocalPlayerHandle } from "../player/local-player";
import { createCompanion, type CompanionHandle } from "../player/companion";
import { createMobViewManager, type MobViewHandle, type MobBlip } from "@/game/mob/manager";
import { createMobSimulation, type MobSimulation } from "@/game/mob/simulation";
import { createNpcManager, type NpcManagerHandle } from "@/game/npc/manager";
import { NPC_CLICK_RADIUS_TILES } from "@/game/npc/npc-click";
import { createCombatStub, type CombatStubHandle } from "@/game/combat/combat-stub";
import {
  cancelEngage,
  startEngage,
  stepEngage,
  IDLE_ENGAGE_STATE,
  type EngageState,
} from "@/game/combat/target-engage";
import { createStressHarness, type StressHarnessHandle } from "@/game/combat/stress-harness";
import {
  inputModeFromPointerType,
  resolveTargetAssistRadius,
} from "@/engine/input/target-assist";
import type { EffectQuality } from "@/engine/config";
import { WARRIOR_SKILLS_CLIENT } from "@/game/skill/data/warrior-skills-client";
import { createNetClient, type NetClientHandle } from "../net/net-client";
import {
  clampDtMs,
  createVisibilityController,
  type VisibilityController,
} from "../net/visibility";
import { createSessionReconnectStore } from "../net/reconnect-store";
import { createRemotePlayerManager } from "../net/remote-player-manager";
import {
  advanceSendTimer,
  coerceAnim,
  snapshotChanged,
  toMoveMessage,
} from "../net/sync";
import { DEFAULT_MAP_ID, type PlayerSnapshot } from "@/shared/net-protocol";
import { partyIdFromLocation } from "../net/party";
import {
  readSelectedCharacterId,
  readSelectedCharacterMapId,
  rememberSelectedCharacterMapId,
  pickBootMapId,
} from "../net/character-session";
import { createTransitionController } from "./transition";
import { phaseAt, phaseTintAt, realMsPerGameMinute, worldMinuteAt } from "./world-clock";
import type { WeatherKind, WorldPhase } from "@/engine/config";
import { attachResize } from "./resize";
import { screenToTile, snapToTile, type TilePoint } from "../iso/coords";
import { buildDebugInfo, IDLE_NET_DEBUG_INFO, type EngineDebugInfo } from "./debug-info";
import {
  createHudPublisher,
  resetHudState,
  setActiveDialogue,
  setDeathNotice,
  setDeliveryResult,
  setDeliveryState,
  setEnhanceResult,
  setFragmentExchangeResult,
  setGoldFromProgress,
  setInventoryRejection,
  setInventoryState,
  setMilestoneNotice,
  setAchievementUnlocked,
  setAchievementsSnapshot,
  setPlayerDead,
  setPlayerExp,
  setPlayerLevel,
  setPlayerVitals,
  requestHelpPanel,
  setShopList,
  setShopResult,
  setSkillSlots,
  setStorageResult,
  setStorageState,
} from "@/ui/store/game-store";
import { getSoundManager } from "@/engine/audio/sound-manager";

/** handle สาธารณะที่ React (หรือ caller อื่น) ใช้คุมกับ engine — ห้ามให้ caller แตะ pixi ตรง ๆ นอกจากผ่าน app */
export interface EngineHandle {
  /** pixi Application instance (read-only ต่อ caller โดยมารยาท) */
  readonly app: Application;
  /** map scene ปัจจุบัน (P1-10: เปลี่ยนตาม world ที่ mount อยู่ — getter live). */
  readonly scene: MapSceneHandle;
  /** local player controller ปัจจุบัน (P1-10: getter live ตาม world). */
  readonly player: LocalPlayerHandle;
  /**
   * realtime net client ของ world ปัจจุบัน (P0-07) — null ถ้า config.net.enabled=false.
   * P1-10: getter live — หลัง transition = net ของ room map ใหม่.
   */
  readonly net: NetClientHandle | null;
  /**
   * snapshot ข้อมูล debug (P0-11, P0 §4.10): fps/player tile/pointer tile/entity count/net status.
   * **caller ต้อง poll ช้า ๆ เอง** (~200–300ms, ห้ามอ่านทุก frame เข้า React state — tech §2).
   */
  getDebugInfo(): EngineDebugInfo;
  /** เปิด/ปิด depth-rank text เหนือ entity ทุกตัว (debug tool, P0-11) — passthrough ไปที่ scene */
  setDepthDebug(enabled: boolean): void;
  /**
   * P2-15: ปุ่มโจมตีบนจอ (มือถือ) — target assist + engage/attack. UI (AttackButton) เรียกผ่าน handle นี้.
   * delegate ไป world ปัจจุบัน (getter live เหมือน scene/player/net).
   */
  pressAttack(): void;
  /**
   * A3 (P2 UI §8.3): cast สกิลช่อง slot (1-4 = S1-S4). Digit1-4 + ปุ่มสกิลมือถือเรียกผ่านนี้. ตรวจ unlock +
   * client predictive cooldown ก่อนส่ง cast (server เป็น authority สุดท้าย). delegate ไป world ปัจจุบัน.
   */
  castSlot(slot: number): void;
  /**
   * P2-15 (GS §17.10): ตั้ง effect quality tier ตอน runtime (UI settings) — mutate config.combatFeel
   * .effectQuality.current; combat-stub อ่านค่านี้ **live** ทุก frame (screen shake amplitude + damage
   * number concurrent cap) จึงมีผลทันทีทุก world. boss telegraph ไม่ถูกลด (invariant GS §18.5).
   */
  setEffectQuality(quality: EffectQuality): void;
  /** P2-15 (GS §17.5): เปิด/ปิด screen shake ตอน runtime — mutate config.combatFeel.screenShake.enabled (live). */
  setScreenShakeEnabled(enabled: boolean): void;
  /**
   * LW0: ปิด NPC bark dialogue ที่เปิดอยู่ (DialoguePanel เรียกตอนผู้เล่นปิด/ดูจบ) — เคลียร์ store ตรง ๆ
   * (ไม่ผูกกับ world เฉพาะ, เหมือน setEffectQuality) กัน DialoguePanel เขียน gameStore เอง (ui.md contract:
   * store read-only ฝั่ง UI, imperative command ต้องผ่าน EngineHandle).
   */
  closeDialogue(): void;
  /** เก็บกวาดครบ: ticker, resize observer, canvas, GPU resources */
  destroy(): void;
}

const FPS_SAMPLE_INTERVAL_MS = 250;

/**
 * P2-13 (D-056): เพดาน delta-time (ms) ต่อ tick — กัน movement/interpolation ก้าวเดียวพุ่งไกลเมื่อ browser
 * throttle rAF ตอนแท็บ hidden แล้ว refocus (dt กระโดดจากหลักวินาที). pixi ticker clamp ~100ms (minFPS 10)
 * อยู่แล้ว; ทำซ้ำที่นี่ให้ชัด/รับประกันไม่ว่า ticker จะถูกตั้งค่าใด (operational const ไม่ใช่ balance).
 */
const MAX_TICK_DELTA_MS = 100;

/**
 * "world" ต่อ 1 map (P1-10) — ทุกอย่างที่ผูกกับ map (scene/player/mobs/combat/net/input). สร้างใหม่
 * ทุกครั้งที่ข้าม map แล้ว destroy() ตัวเก่าให้สะอาด (กัน leak: mob view/entities/net handlers/listeners).
 */
interface WorldHandle {
  readonly scene: MapSceneHandle;
  readonly player: LocalPlayerHandle;
  readonly net: NetClientHandle | null;
  /** run 1 frame — locked=true (ระหว่าง transition) → freeze input/movement/net-send แต่ยัง render. */
  tick(dtSeconds: number, deltaMs: number, deltaTime: number, locked: boolean): void;
  /** P2-15: ปุ่มโจมตีมือถือ — target assist (keyboardAssist) + engage/attack (ดู pressAttack ใน mountWorld). */
  pressAttack(): void;
  /** A3 (P2 UI §8.3): cast สกิลช่อง slot (1-4) — ตรวจ unlock/cooldown แล้วส่ง cast (ดู castSlot ใน mountWorld). */
  castSlot(slot: number): void;
  getDebugInfo(fps: number): EngineDebugInfo;
  /** Minimap (§8.4) danger/elite/normal blips — mob view render positions, throttled ผ่าน hudPublisher เดียวกับ debugInfo (ไม่ publish ทุก frame) */
  getBlips(): MobBlip[];
  setDepthDebug(enabled: boolean): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

/**
 * สร้าง engine + render map แรก (DEFAULT_MAP_ID จาก registry) + รองรับ transition ข้าม map (P1-10).
 * PixiJS 8: ต้อง `await app.init(...)` (async) — ห้ามส่ง options เข้า constructor.
 */
export async function createEngine(
  container: HTMLElement,
  config: EngineConfig,
): Promise<EngineHandle> {
  const app = new Application();

  // D-065 art path ①: pixelate mode → ตั้ง scaleMode ของ texture ทุกใบ (nearest) **ก่อน** สร้าง texture ใด ๆ.
  // เป็น global default ของ pixi (module-level) — restore เป็น "linear" ใน destroy() กันค่าค้างข้าม
  // React StrictMode remount (mount→destroy→mount ใช้ default ตัวเดียวกันทั้ง process).
  if (config.render.pixelate) {
    TextureSource.defaultOptions.scaleMode = config.render.textureScaleMode;
  }

  // engine-scope atlas registry (P3): สร้างหลังตั้ง scaleMode (texture ที่ slice จะได้ scaleMode ถูกตั้งแต่แรก).
  // preload atlas ที่ map ต้องใช้ก่อน mount; call site (player/mob/prop) peek แล้วยืม texture (non-owning).
  const registry = createAssetRegistry(config.render.assetBaseUrl);

  // pixelate: ล็อก resolution สัมบูรณ์ (ไม่คูณ dpr → pixel size คงที่ทุกจอ) + ปิด antialias เสมอ.
  // ปกติ: resolve resolution ตาม config.resolution ?? devicePixelRatio.
  const resolution = config.render.pixelate
    ? config.render.renderResolution
    : resolveResolution(
        config,
        typeof globalThis !== "undefined" ? globalThis.devicePixelRatio : undefined,
      );

  await app.init({
    backgroundColor: config.backgroundColor,
    backgroundAlpha: config.backgroundAlpha,
    antialias: config.render.pixelate ? false : config.antialias,
    resolution,
    autoDensity: config.autoDensity,
    preference: config.preference,
    powerPreference: config.powerPreference,
    width: Math.max(1, container.clientWidth),
    height: Math.max(1, container.clientHeight),
    // ไม่ใช้ resizeTo ของ pixi — จัดการเองผ่าน attachResize เพื่อผูกกับ container ตรง ๆ
  });

  container.appendChild(app.canvas);
  app.canvas.style.display = "block";

  // pixelate: ให้ browser upscale canvas เองแบบ nearest (คมเป็นบล็อก ไม่เบลอ)
  if (config.render.pixelate && config.render.cssImageRendering) {
    app.canvas.style.imageRendering = "pixelated";
  }

  // World stays on the D-065 low-res pass; Thai/world labels render on a transparent native-res pass.
  const nameplateLayer = await createNameplateLayer(container, config);

  let viewW = Math.max(1, container.clientWidth);
  let viewH = Math.max(1, container.clientHeight);

  // --- shared UI layer (screen-space, ไม่โดน camera pan) — fps ฯลฯ. อยู่บน world; fade overlay อยู่บน ui อีกที ---
  const ui = new Container();
  app.stage.addChild(ui);
  const fpsText = new Text({
    text: "FPS —",
    style: { fill: 0xffffff, fontSize: 14, fontFamily: "monospace" },
  });
  // ย้ายลงใต้ E3 status cluster (HP/EXP/level มุมซ้ายบน left-4 top-4 ~ย 16-52) — เดิม (12,12) ถูก React overlay
  // ทับจนมองไม่เห็น (owner feedback 2026-07-13). วางที่ y 64 = ใต้ cluster พอดี, มุมซ้ายบนโล่งบน desktop.
  fpsText.position.set(12, 64);
  ui.addChild(fpsText);

  // --- transition controller (fade overlay บนสุด — ครอบ world + ui) ---
  const transition = createTransitionController(app.stage, config.transition, viewW, viewH);

  // P1-08: partyId ของ local player (URL `?party=xyz` > config default) — คงที่ทั้ง session (ทุก world).
  const localPartyId = partyIdFromLocation(config.net.partyId);

  // P2-05 (Storage §5/§7): characterId ที่เลือกจาก Game Hub (sessionStorage) — แนบใน joinOptions ทุก world.
  // undefined = anonymous (เข้า /game ตรง ๆ / dev) → server spawn default, ไม่ persist. คงที่ทั้ง session.
  const localCharacterId = readSelectedCharacterId();

  // P1-07-fix (§59.1): per-tab reconnect token store (sessionStorage) — คงข้าม refresh/reopen เพื่อ
  // reconnect เข้า seat เดิม (token in-memory หายตอน reload). ตัวเดียวทั้ง session (ทุก world/map ใช้ key
  // เดียว — token ตามหลัง map ปัจจุบัน; transition = consented leave ล้าง token → world ใหม่ fresh join).
  const reconnectStore = createSessionReconnectStore(config.reconnect.sessionStorageKey);

  // world ปัจจุบัน (mutable — สลับตอน transition). forward-declare ก่อน requestTransition/mountWorld.
  let currentWorld: WorldHandle;

  // Living World LW0 (Bible §3/§4): client-side world clock + manual weather toggle (§23 "one weather/map").
  // state ระดับ engine (คงข้ามการสลับ world/ข้าม map). rain แสดงเฉพาะ map ใน config.world.rainMapIds (§4.1 Map 1).
  // TODO LW1: world clock → server-authoritative (MSG_WORLD_TIME §3.2) + weather §4.2/§4.3 scheduler.
  let currentMapId = "";
  let weather: WeatherKind = "clear";
  let phaseOffsetMs = 0; // debug fast-forward (cyclePhaseKeyCode) — บวกกับ Date.now() เพื่อ demo phase
  // C2b (§13): living-world client-event edge state — report weather/phase only on TRANSITION edges + a rain
  //   accumulator (1 tick/min while raining on the rain map) for ach_rain_walk_30. engine-scope (คงข้าม world).
  let prevRainWeather: WeatherKind = "clear";
  let prevPhaseId: WorldPhase | null = null;
  let rainTickAccumMs = 0;

  /**
   * P1-10: ขอข้าม map. schedule swap ผ่าน transition controller — จอมืดสุด → teardown world เดิม +
   * mount world ใหม่ (map ปลายทาง, spawn = targetSpawn). no-op ถ้ากำลัง transition อยู่ (guard ใน controller).
   */
  const requestTransition = (
    targetMapId: string,
    targetSpawn: { x: number; y: number },
  ): void => {
    // P3: preload atlas ของ map ปลายทางทันที (ระหว่าง fade-out) — พอถึง mountWorld ตอนจอมืด peek มักพร้อม
    // (ยังไม่ทันก็ fallback placeholder). non-blocking — ไม่ถ่วง transition.
    const preTarget = getMap(targetMapId);
    if (preTarget) void registry.preload(collectMapAssetIds(preTarget, config));
    transition.start(() => {
      const targetMap = getMap(targetMapId);
      if (!targetMap) {
        console.warn(`[transition] ไม่รู้จัก map "${targetMapId}" — ยกเลิก transition`);
        return;
      }
      // owner-report#6 fix: จำ map ปลายทางไว้ (คู่กับ characterId ที่ hub เขียน) — refresh กลาง /game
      // หลังข้าม map ต้อง boot map ล่าสุดนี้ ไม่ใช่ map ตอนออกจาก hub
      rememberSelectedCharacterMapId(targetMapId);
      currentWorld.destroy();
      currentWorld = mountWorld(targetMap, targetSpawn);
      currentMapId = targetMap.mapId; // LW0: rain gating ตาม map ใหม่ (§4.1)
      currentWorld.resize(viewW, viewH);
    });
  };

  /**
   * สร้าง world สำหรับ 1 map (P1-10). spawn = จุดเกิด (map.spawnPoint ตอน boot / targetSpawn ตอน transition).
   */
  function mountWorld(map: MapConfig, spawn: { x: number; y: number }): WorldHandle {
    // --- map scene ---
    const scene = createMapScene(app, map, config, registry);
    // P1 fix: highlight พื้น exit area ให้เห็น "ทางออก" (owner เดินหา exit ไม่เจอเพราะ placeholder art ล้วน).
    // ground-level overlay ใต้ entity, ไม่แตะ depth-sort. teardown = scene.destroy() (world.destroy children)
    // ตอนสลับ map. placeholder จนกว่าจะมี art จริง (ประตู/ป้าย sprite).
    scene.setExitMarkers(
      buildExitMarkerPolygons(map.exits, config.tileSize),
      config.exitMarker,
    );

    // --- local player (P0-05): spawn ที่ map.spawnPoint แล้ว snap ไป spawn จริง (targetSpawn ตอน transition) ---
    const player = createLocalPlayer(
      scene,
      map,
      config,
      app.renderer,
      registry,
      nameplateLayer,
    );
    player.applyCorrection(spawn.x, spawn.y); // ย้าย + snap กล้องมาที่จุดเกิดจริง (idempotent ถ้า = spawnPoint)

    // --- ดึ๋งๆ companion (C4-MVP, §12.2/§5.1) — client-only cosmetic follow entity, มีทุก map (เมือง+field).
    //     ตามผู้เล่น local, no collision/combat (§3.2), depth-sort เข้า entity layer เหมือน mob/NPC. คลิก →
    //     help panel (onPointerDown ด้านล่าง). config.companion.enabled=false → ข้าม (null, update/destroy no-op). ---
    const companion: CompanionHandle | null = config.companion.enabled
      ? createCompanion(scene, config, registry, player, nameplateLayer)
      : null;

    // --- mobs (P1-03): server-authoritative → view manager render จาก snapshot ---
    const mobView: MobViewHandle = createMobViewManager(
      scene,
      config,
      app.renderer,
      registry,
      nameplateLayer,
    );

    // --- NPC (LW0 static bark) — ไม่มี movement/AI, seed ครั้งเดียวจาก npc-data.ts catalog ---
    const npcManager: NpcManagerHandle = createNpcManager(
      scene,
      config,
      map.mapId,
      nameplateLayer,
    );

    // --- combat (P1-05 server-authoritative): S1 นักดาบจาก client manifest ---
    // P1-11 (GS §14): ปิด combat ในโซน safe (เมือง) — disable ปุ่มโจมตี client (server ปฏิเสธ cast ซ้ำอีกชั้น).
    const combatAllowed = map.zoneType !== "safe";
    const firstWarriorSkill = WARRIOR_SKILLS_CLIENT[0];
    let net: NetClientHandle | null = null;
    const combat: CombatStubHandle = createCombatStub(scene, player, mobView, config, {
      skill: firstWarriorSkill,
      castSkill: (msg) => net?.sendCast(msg),
      isOnline: () => net?.status.state === "online",
      combatEnabled: combatAllowed,
      registry, // F4: skill VFX atlas lookup (ไม่มี = VFX no-op เงียบ)
    });

    // --- A3 skill hotbar (P2 UI §8.3 · P1_BALANCE §3.1): cast S2/S3/S4 (+S1 basic) จาก slot 1-4 (Digit1-4/มือถือ) ---
    //   client predictive cooldown + unlock-by-level (grey ช่องที่ยังไม่ปลด) → publish HUD; **server เป็น authority
    //   สุดท้าย** (unlock/cooldown/range re-validate ที่ handleCast). S1 (slot 1) route ผ่าน requestAttack เดิม
    //   (auto-attack loop คุม cooldown/aim/juice ของ basic). S2-4 = discrete cast (สกิลนักดาบ anchor ที่ caster).
    const skillCooldownReadyAt = new Map<string, number>(); // skillId → performance.now ms พร้อมใช้อีกครั้ง
    let hotbarPlayerLevel = 1; // จาก MSG_PLAYER_PROGRESS.level (default 1 ก่อนรู้ค่า → เฉพาะ S1 ปลด, S2-4 locked)
    const publishSkillSlots = (): void => {
      setSkillSlots(
        WARRIOR_SKILLS_CLIENT.map((s, i) => ({
          slot: i + 1,
          skillId: s.skillId,
          displayName: s.skillName,
          keyLabel: String(i + 1),
          unlockLevel: s.unlockLevel,
          unlocked: hotbarPlayerLevel >= s.unlockLevel,
          cooldownReadyAtMs: skillCooldownReadyAt.get(s.skillId) ?? 0,
          cooldownTotalMs: s.cooldown * 1000,
          isPrimary: i === 0,
        })),
      );
    };
    const castSlot = (slot: number): void => {
      if (!combatAllowed) return; // P1-11 safe zone (เมือง) → ไม่ cast (server ปฏิเสธซ้ำ)
      const skill = WARRIOR_SKILLS_CLIENT[slot - 1];
      if (!skill) return;
      if (hotbarPlayerLevel < skill.unlockLevel) return; // ยังไม่ปลด (server re-validate → reject "locked")
      const now = performance.now();
      if (now < (skillCooldownReadyAt.get(skill.skillId) ?? 0)) return; // client predictive cooldown gate
      if (slot === 1) {
        player.requestAttack(); // S1 basic → auto-attack path เดิม (cooldown/aim/juice ของ basic)
        return;
      }
      // S2-4: discrete cast — สกิลนักดาบ anchor ที่ caster (ไม่ ground-target) → aim = ตำแหน่ง+ทิศ caster ปัจจุบัน
      net?.sendCast({
        skillId: skill.skillId,
        aimTx: player.position.tx,
        aimTy: player.position.ty,
        direction: player.facing,
      });
      combat.playSkillVfx(skill.skillId); // F4: เล่น VFX สกิล client-side (juice — ไม่กระทบ authority)
      skillCooldownReadyAt.set(skill.skillId, now + skill.cooldown * 1000);
      publishSkillSlots();
    };
    publishSkillSlots(); // init (S1 ปลด; S2-4 locked จนกว่า progress แจ้ง level ใหม่)

    // --- stress harness (P1-06 §5, dev-only) — F4 synthetic load ---
    const stressHarness: StressHarnessHandle = createStressHarness({
      mobView,
      combat,
      map,
      config: config.stressHarness,
      mobTypes: Object.keys(config.mob.styles),
    });

    // --- realtime net (P0-07): remote players + position sync ---
    const localSnapshot = (): PlayerSnapshot => ({
      tx: player.position.tx,
      ty: player.position.ty,
      direction: player.facing,
      anim: coerceAnim(player.animation),
      partyId: localPartyId,
      name: "", // NAMEPLATES: server-authoritative (ตั้งจาก character.name ตอน join) — client ไม่ส่งชื่อขึ้น
    });
    let remotes: ReturnType<typeof createRemotePlayerManager> | null = null;
    let sendAccumMs = 0;
    let lastSent: PlayerSnapshot | null = null;
    if (config.net.enabled) {
      remotes = createRemotePlayerManager(
        scene,
        config,
        app.renderer,
        registry,
        nameplateLayer,
      );
      // joinOptions: mapId ของ world นี้ + spawn (server spawn player ที่นี่ตั้งแต่เฟรมแรก / ตอน transition ที่ targetSpawn)
      const initial: PlayerSnapshot = {
        tx: spawn.x,
        ty: spawn.y,
        direction: player.facing,
        anim: coerceAnim(player.animation),
        partyId: localPartyId,
        name: "", // NAMEPLATES: server-authoritative — join option ไม่ส่งชื่อ (server ตั้งจาก character.name)
      };
      net = createNetClient(
        {
          serverUrl: config.net.serverUrl,
          roomName: config.net.roomName,
          retry: config.reconnect.clientRetry,
          graceSeconds: config.reconnect.graceSeconds,
          store: reconnectStore,
        },
        { mapId: map.mapId, ...initial, partyId: localPartyId, characterId: localCharacterId },
        {
          onPlayerAdd: (id, snap) => remotes?.onPlayerAdd(id, snap),
          onPlayerChange: (id, snap) => remotes?.onPlayerChange(id, snap),
          onPlayerRemove: (id) => remotes?.onPlayerRemove(id),
          onPositionCorrection: (correction) => {
            player.applyCorrection(correction.tx, correction.ty);
            lastSent = null;
            sendAccumMs = 0;
          },
          // Fix issue #1/#2: หลัง join/reconnect → snap local player ไปตำแหน่ง authoritative ของ server
          // (spawn จริง / ตำแหน่ง hold ก่อน refresh) ก่อนส่ง move ก้าวแรก. ใช้ applyCorrection (snap
          // position + camera) — กัน "วาร์ปกลับจุดเดิม" + กัน exit detection พลาดเพราะ desync. fresh join
          // = ไม่มี goal → no-op; reconnect กลาง walk → resume goal เดิม (prod fix 2026-07-12).
          onSelfSpawn: (snap) => {
            player.applyCorrection(snap.tx, snap.ty);
            lastSent = null;
            sendAccumMs = 0;
            setPlayerDead(false); // A2: fresh join/reconnect → เคลียร์ death state ค้าง (กัน overlay ค้างข้าม world)
            // P2-11: ขอ catalog ร้านทันทีที่ self เข้า room สำเร็จ (fresh join/reconnect/ข้าม map ใหม่)
            // — server ตอบตาม map ปัจจุบัน (available:false = map นี้ไม่มีร้าน, HUD ปุ่มอ่านค่านี้).
            net?.sendShopListRequest({});
            // P2-17: ขอเปิดคลัง+กล่องส่งของทันทีเหมือนกัน — server ตอบ 2 snapshot (available:false = map
            // นี้ไม่มี storage NPC, HUD ปุ่ม "คลัง" อ่านค่านี้ pattern เดียวกับ shop).
            net?.sendStorageOpen();
            // C2b (Part 5): ขอ snapshot achievement ตอน self เข้า room → game-store field พร้อมให้ journal (C3) อ่าน.
            net?.sendAchievementsRequest();
          },
          // P2-13 (D-056): self AFK flag (server-set) → toggle ป้าย "AFK" ของตัวเอง (display-only).
          onSelfAfkChange: (isAfk) => player.setAfk(isAfk),
          // NAMEPLATES: self ชื่อตัวละคร (server-set จาก character.name) → ป้ายชื่อเหนือหัวตัวเอง (display-only).
          onSelfName: (name) => player.setName(name),
          // A1/A2 (§2/§10): hp/maxHp ของ self (server-authoritative) → HUD แถบ HP (E3). event-driven ไม่ throttle.
          onSelfVitals: (hp, maxHp) => setPlayerVitals(hp, maxHp),
          // E3 (§8.2): level ของ self (schema) → badge + refresh A3 hotbar unlock (ปลดสกิลถูกตั้งแต่เกิด/level-up)
          onSelfLevel: (level) => {
            setPlayerLevel(level);
            if (level !== hotbarPlayerLevel) {
              hotbarPlayerLevel = level;
              publishSkillSlots();
            }
          },
          // E3 (§8.2): exp ของ self (schema) → store (แถบ EXP + ตัวเลข % xx.xx%) — แสดงตั้งแต่เกิด
          onSelfExp: (exp, floor, ceil) => setPlayerExp(exp, floor, ceil),
          // A2 (§10): self ตาย → death state (E4 overlay อ่านต่อ). remote death anim = E-work ภายหลัง.
          onPlayerDeath: (msg) => {
            if (net !== null && net.status.selfSessionId === msg.sessionId) {
              setPlayerDead(true);
              setDeathNotice(); // E4: stamp timestamp → DeathToast แสดง toast สั้น (respawn instant ตามมาทันที)
            }
          },
          // A2 (§10): self respawn ที่ safe camp → snap local player + camera (client-predicted) + เคลียร์ death.
          //   remote: ตำแหน่งมาทาง schema อยู่แล้ว. hp เต็มมาทาง onSelfVitals (schema).
          onPlayerRespawn: (msg) => {
            if (net === null || net.status.selfSessionId !== msg.sessionId) return;
            player.applyCorrection(msg.tx, msg.ty);
            lastSent = null;
            sendAccumMs = 0;
            setPlayerDead(false);
          },
          // A1 (§2): "player damaged" signal — hit flash/damage number juice = E3/E4 (hp truth มาทาง onSelfVitals).
          //   ยังไม่ทำ visual รอบนี้ (out of scope); handler ผูกไว้ให้ E-work ต่อยอด (message ถูก consume ที่ net-client).
          onMobAdd: (snap) => mobView.onMobAdd(snap),
          onMobChange: (snap) => mobView.onMobChange(snap),
          onMobRemove: (mobId) => mobView.onMobRemove(mobId),
          // owner report "เราไม่เห็นคนอื่นกำลังโจมตีจากจอเรา": MSG_SKILL_RESULT broadcast ให้ทุกคนในห้อง
          // (server §7/§15) แต่ wire anim ไม่มี "attack" (coerceAnim whitelist idle/walk เท่านั้น) — สั่งเล่น
          // คลิป attack ของ remote ตรง ๆ ผ่าน event นี้แทน (ไม่ผ่าน position sync). isOwnCast เทียบกับ
          // net.status.selfSessionId ใช้ gate hit stop/screen shake ใน combat-stub ด้วย (เพื่อนตีมอบตายอีก
          // ฝั่งไม่ควรทำให้จอเราสั่น — เลข damage number ไม่ถูก gate, โชว์ทุก caster เหมือนเดิม).
          onSkillResult: (result) => {
            const isOwnCast = net !== null && net.status.selfSessionId === result.casterId;
            if (!isOwnCast) remotes?.playAttack(result.casterId);
            combat.onSkillResult(result, isOwnCast);
          },
          // P1-10: server บอกให้ข้าม map (server-authoritative exit detection) → schedule transition
          onMapTransition: (msg) =>
            requestTransition(msg.targetMapId, {
              x: msg.targetSpawn.x,
              y: msg.targetSpawn.y,
            }),
          // P2-07: inventory/equipment snapshot + mutation ปฏิเสธ → push เข้า Zustand bridge ตรง ๆ
          // (event-driven, ไม่ผ่าน hudPublisher throttle — ดู comment ที่ game-store.ts setInventoryState).
          onInventoryState: (snap) => setInventoryState(snap),
          onInventoryOpRejected: (rejected) => setInventoryRejection(rejected),
          // P2-10: ผลเสริมแกร่ง → Zustand bridge ตรง ๆ (event-driven, ดู comment ที่ game-store.ts setEnhanceResult)
          onEnhanceResult: (result) => setEnhanceResult(result),
          // B4: ผลแลกเศษ 5→1 → Zustand bridge ตรง ๆ (event-driven, เหมือน onEnhanceResult)
          onFragmentExchangeResult: (result) => setFragmentExchangeResult(result),
          // P2-11: catalog ร้าน + ผลซื้อ/ขาย → Zustand bridge ตรง ๆ (event-driven, เหมือน onEnhanceResult)
          onShopList: (list) => setShopList(list),
          onShopResult: (result) => setShopResult(result),
          // P2-09/P2-11: progression หลังฆ่ามอน — ใช้เฉพาะ gold รอบนี้ (ยังไม่มี HUD gold bar แยก)
          // Wave 2 SFX (D-065): message นี้มาถึงเฉพาะหลังฆ่ามอนที่มีสิทธิ์เท่านั้น → ใช้เป็น "loot/reward" cue
          onPlayerProgress: (msg) => {
            setGoldFromProgress(msg);
            getSoundManager().playSfx("loot");
            // A3: level เปลี่ยน (level-up) → refresh unlock ของ hotbar (S2 lv3, S3/S4 lv5 ปลด)
            if (msg.level !== hotbarPlayerLevel) {
              hotbarPlayerLevel = msg.level;
              publishSkillSlots();
            }
          },
          // C1 (§18): milestone ปลดล็อก → stamp notice ให้ MilestoneToast แสดง toast สั้น ๆ
          onMilestoneGranted: (msg) => setMilestoneNotice(msg),
          // C2b: achievement ปลดล็อก → AchievementToast; snapshot → game-store field (journal C3 consume)
          onAchievementUnlocked: (msg) => setAchievementUnlocked(msg),
          onAchievementsSnapshot: (msg) => setAchievementsSnapshot(msg),
          // P2-17: คลัง+กล่องส่งของ → Zustand bridge ตรง ๆ (event-driven, เหมือน onShopList/onShopResult)
          onStorageState: (state) => setStorageState(state),
          onStorageResult: (result) => setStorageResult(result),
          onDeliveryState: (state) => setDeliveryState(state),
          onDeliveryResult: (result) => setDeliveryResult(result),
        },

      );
    }

    // --- mob source controller (P1-03): server-driven (online) / local sim (offline) ---
    type MobMode = "pending" | "server" | "local";
    const simIntervalMs = 1000 / config.mob.ai.tickHz;
    const hpFor = (mobType: string): number =>
      (config.combatBalance.mobs[mobType] ?? config.combatBalance.defaultMob).hp;
    let mobMode: MobMode = "pending";
    let localSim: MobSimulation | null = null;
    let simAccumMs = 0;

    const desiredMobMode = (): MobMode => {
      const state = net ? net.status.state : "idle";
      if (state === "online") return "server";
      if (!config.net.enabled || state === "offline") return "local";
      return "pending";
    };

    const updateMobs = (dtSeconds: number, deltaMs: number): void => {
      const desired = desiredMobMode();
      if (desired !== mobMode) {
        if (mobMode === "local") {
          localSim = null;
          mobView.removeAll();
        }
        if (desired === "local") {
          mobView.removeAll();
          localSim = createMobSimulation({ map, config: config.mob, hpFor });
          simAccumMs = 0;
        }
        mobMode = desired;
      }

      if (mobMode === "local" && localSim) {
        simAccumMs += deltaMs;
        let stepped = false;
        while (simAccumMs >= simIntervalMs) {
          simAccumMs -= simIntervalMs;
          localSim.tick(simIntervalMs / 1000, [
            { id: "local", tx: player.position.tx, ty: player.position.ty },
          ], performance.now());
          stepped = true;
        }
        if (stepped) mobView.syncAll(localSim.snapshots());
      }

      mobView.update(dtSeconds, player.position);
    };

    // --- pointer → tile helper (P0-11 debug + P1-09 click-to-move) ---
    const footFromEvent = (e: PointerEvent): TilePoint => {
      const rect = app.canvas.getBoundingClientRect();
      return screenToTile(
        {
          sx: e.clientX - rect.left - scene.world.position.x,
          sy: e.clientY - rect.top - scene.world.position.y,
        },
        config.tileSize,
      );
    };

    let pointerTile: TilePoint | null = null;
    // FEATURE 2: ค้างปุ่มซ้าย = เดินตามเมาส์ต่อเนื่อง. leftHeld = กำลังค้างอยู่,
    // followTile = tile ปลายทางล่าสุดที่สั่งไป (throttle: re-issue moveTo เฉพาะตอน tile เปลี่ยน กัน spam server).
    let leftHeld = false;
    let followTile: TilePoint | null = null;
    const onPointerMove = (e: PointerEvent): void => {
      const foot = footFromEvent(e);
      pointerTile = snapToTile(foot);
      if (leftHeld && !transition.isLocked()) {
        if (!followTile || followTile.tx !== pointerTile.tx || followTile.ty !== pointerTile.ty) {
          followTile = pointerTile;
          player.moveTo(foot); // ใช้ foot ดิบเหมือน tap-to-move (เดินไปจุดที่ชี้จริง)
        }
      }
    };
    const onPointerLeave = (): void => {
      pointerTile = null;
      leftHeld = false; // ออกนอก canvas = หยุดตามเมาส์ (ปล่อยให้เดินถึงจุดสุดท้าย ไม่ force-stop)
    };
    // ปล่อยปุ่มซ้าย/pointer ถูกยกเลิก = เลิกตามเมาส์
    const onPointerUp = (): void => {
      leftHeld = false;
    };
    app.canvas.addEventListener("pointermove", onPointerMove);
    app.canvas.addEventListener("pointerleave", onPointerLeave);
    app.canvas.addEventListener("pointerup", onPointerUp);
    app.canvas.addEventListener("pointercancel", onPointerUp);

    // --- click-to-move + touch (P1-09, TA §17.3 · L11) ---
    const attackRange = firstWarriorSkill.range;
    // P2-15: รัศมี pick มอนแยกตาม input mode (Combat Bible §3) — caller ส่ง radius ที่ resolve ตาม pointerType.
    // logic เลือก "มอนใกล้จุดสุดในรัศมี" เหมือนเดิมทุกอย่าง (never-downgrade: targeting เท่านั้น ไม่แตะ combat calc).
    const mobUnderClick = (
      foot: TilePoint,
      radius: number,
    ): { id: string; pos: TilePoint } | null => {
      let best: { id: string; pos: TilePoint } | null = null;
      let bestSq = radius * radius;
      for (const t of mobView.getAliveTargets()) {
        const dsq = (t.pos.tx - foot.tx) ** 2 + (t.pos.ty - foot.ty) ** 2;
        if (dsq <= bestSq) {
          bestSq = dsq;
          best = { id: t.id, pos: { tx: t.pos.tx, ty: t.pos.ty } };
        }
      }
      return best;
    };
    const distTo = (p: TilePoint): number =>
      Math.hypot(p.tx - player.position.tx, p.ty - player.position.ty);
    // P1-09.1 (TA §17.3 walk-to-attack): คลิกมอบ 1 ครั้ง = engage ต่อเนื่อง (ไม่ใช่ตีทีเดียวจบ) — state
    // machine pure ใน target-engage.ts ตัดสิน attack/chase/idle ทุก tick, ที่นี่แค่ execute action จริง.
    let engageState: EngageState = IDLE_ENGAGE_STATE;

    /** engage มอน (tap/press): ถึงระยะ → หัน+ตี, ไกล → เดินเข้าไป (walk-to-attack). ใช้ทั้ง click และ pressAttack. */
    const engageMob = (mob: { id: string; pos: TilePoint }): void => {
      engageState = startEngage(mob.id);
      if (distTo(mob.pos) <= attackRange) {
        player.faceToward(mob.pos);
        player.requestAttack();
        player.cancelPath();
      } else {
        player.moveTo(mob.pos);
      }
    };

    const onPointerDown = (e: PointerEvent): void => {
      // FEATURE 1: ปุ่มกลาง = โจมตีมอนที่ใกล้ตัวสุด (ไม่จำกัดรัศมี — "นับทั้งแมพ" ตามที่ผู้เล่นขอ,
      // ไม่ cap ด้วย assist radius). reuse engageMob เดิม (หัน+ตี/เดินเข้า) — ไม่มี net message ใหม่.
      if (e.button === 1) {
        e.preventDefault(); // กัน autoscroll ของ browser (middle-click)
        if (transition.isLocked() || !combatAllowed) return;
        const nearest = mobUnderClick(player.position, Number.POSITIVE_INFINITY);
        if (nearest) engageMob(nearest);
        return;
      }
      if (e.button !== 0) return; // touch/pen primary contact = button 0 (PointerEvent ครอบ touch เอง)
      if (transition.isLocked()) return; // P1-10: input lock ระหว่างข้าม map
      const foot = footFromEvent(e);
      // LW0: คลิกโดน NPC (bark dialogue) — เช็คก่อน mob/ground เสมอ (dialogue ไม่ใช่ combat, ไม่ผูก
      // combatAllowed — NPC วางในโซนที่เดินได้อยู่แล้ว). โดน → เปิด dialogue + หยุด engage/path ค้าง แล้ว
      // จบ (ไม่ตกไป engage มอน/เดินตามเมาส์ ไม่ทับ FEATURE 1/2 ที่เหลือ).
      const npc = npcManager.npcUnderClick(foot, NPC_CLICK_RADIUS_TILES);
      if (npc) {
        engageState = cancelEngage();
        player.cancelPath();
        setActiveDialogue({ npcId: npc.npcId, displayName: npc.displayName, lines: npc.lines });
        // C2b (§13 client event): คุย NPC → achievement (ทักทายชาวบ้าน/ขาประจำ). server whitelist + rate-limit.
        net?.sendClientEvent({ type: "npc.talk", payload: { npcId: npc.npcId } });
        return;
      }
      // C4 (§5.1): คลิกโดนดึ๋งๆ companion (client-only cosmetic) — เช็คหลัง NPC (NPC ชนะ tie) ก่อน mob.
      // companion ไม่ใช่ combat → คลิก = ขอเปิด help ("ดึ๋งๆ ช่วยเหลือ"): ยกเลิก engage/path ค้าง แล้วจบ
      // (ไม่ตกไป engage มอน/เดินตามเมาส์). request ผ่าน store (engine ไม่ import React) → HelpPanel effect เปิด.
      if (companion) {
        const cp = companion.getPosition();
        const dsq = (cp.tx - foot.tx) ** 2 + (cp.ty - foot.ty) ** 2;
        if (dsq <= config.companion.clickRadiusTiles ** 2) {
          engageState = cancelEngage();
          player.cancelPath();
          requestHelpPanel();
          return;
        }
      }
      // P2-15: รัศมี pick ตาม input mode (mouse 0.60 / touch 0.80, Combat Bible §3).
      const assistRadius = resolveTargetAssistRadius(
        inputModeFromPointerType(e.pointerType),
        config.pathfinding.targetAssist,
      );
      // P1-11: safe zone (เมือง) ไม่มี combat → คลิกมอน = เดินเฉย ๆ (ไม่ tap-to-attack). เมืองไม่มีมอนอยู่แล้ว.
      const mob = combatAllowed ? mobUnderClick(foot, assistRadius) : null;
      if (mob) {
        // คลิกโดนมอน = engage (ตี/เดินเข้า) เหมือนเดิม — ไม่เริ่ม walk-follow
        engageMob(mob);
      } else {
        // คลิกพื้นเปล่า = ยกเลิก engage ที่ค้างอยู่ (manual override ชนะเสมอ, เหมือน WASD)
        player.moveTo(foot);
        engageState = cancelEngage();
        // FEATURE 2: เริ่มโหมดเดินตามเมาส์ — pointermove จะ re-issue moveTo ตอน tile เปลี่ยน,
        // ปล่อยปุ่ม/ออก canvas = หยุด. คลิกเร็ว (ไม่ลาก) = กลับเป็น tap-to-move จุดเดียวเหมือนเดิม.
        leftHeld = true;
        followTile = snapToTile(foot);
      }
    };
    app.canvas.addEventListener("pointerdown", onPointerDown);

    /**
     * P2-15: ปุ่มโจมตีบนจอ (มือถือ, แทน Space) → target assist แบบ keyboard (Combat Bible §3, 0.65 tile):
     * มีมอนใกล้ตัวในรัศมี → auto-engage (หัน+ตี/เดินเข้า, walk-to-attack เดิม); ไม่มี → ตีไปทางหน้าเฉย ๆ
     * (requestAttack เหมือน Space; combat-stub gate cooldown/safe-zone ต่อ). ไม่มี combat semantics ใหม่ —
     * reuse engage เดิม, แค่เลือกเป้าใกล้สุดในรัศมี assist.
     */
    const pressAttack = (): void => {
      if (transition.isLocked()) return;
      const assist = combatAllowed
        ? mobUnderClick(player.position, config.pathfinding.targetAssist.keyboardAssistRadius)
        : null;
      if (assist) engageMob(assist);
      else player.requestAttack();
    };

    /**
     * รันทุก frame (caller เช็ค !locked แล้ว): WASD (manual override) ยกเลิก engage ทันที; ไม่งั้นประเมิน
     * stepEngage แล้ว execute action ที่ได้ (attack ต่อเนื่อง / chase เมื่อเป้าหลุดระยะ / เงียบเมื่อ path
     * เดิมยังพาไปอยู่). เป้าตาย/หายไป → stepEngage คืน state idle เอง (ดู target-engage.ts).
     */
    const updateEngage = (): void => {
      if (player.manualInputActive) {
        engageState = cancelEngage();
        return;
      }
      if (engageState.status === "idle") return;
      // snapshot ลง const — engageState เป็น let, TS ไม่ narrow discriminated union ข้าม closure
      const engaged = engageState;
      const target = mobView.getAliveTargets().find((t) => t.id === engaged.targetId) ?? null;
      const result = stepEngage({
        state: engaged,
        target: target ? { id: target.id, pos: { tx: target.pos.tx, ty: target.pos.ty } } : null,
        playerPos: player.position,
        attackRange,
        hasActivePath: player.isFollowingPath,
      });
      engageState = result.state;
      if (result.action.type === "attack") {
        player.faceToward(result.action.pos);
        player.requestAttack();
        player.cancelPath();
      } else if (result.action.type === "chase") {
        // เป้าขยับหลุดระยะ + ไม่มี path พาไปอยู่แล้ว → replan ไปตำแหน่งใหม่. เดินไม่ถึง (เช่นเป้าติดกำแพง
        // เข้าไม่ถึง) → ยอมแพ้ (idle) กันเรียก moveTo/A* ซ้ำทุก frame ไม่มีที่สิ้นสุด.
        if (!player.moveTo(result.action.pos)) {
          engageState = cancelEngage();
        }
      }
    };

    // --- stress harness toggle (P1-06 §5, dev-only) — F4 ---
    const onStressToggleKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== config.stressHarness.toggleKeyCode) return;
      e.preventDefault();
      stressHarness.toggle();
    };
    window.addEventListener("keydown", onStressToggleKeyDown);

    // --- P1-10: offline exit detection (client-side fallback) — online = server เป็น authority (MSG_MAP_TRANSITION) ---
    // ยิงเฉพาะตอน "เพิ่งเข้า" exit (localLastExitId เปลี่ยน) เหมือน server. requestTransition แค่ schedule (swap
    // เกิดใน transition.update ทีหลัง) → เรียกจากใน tick ปลอดภัย (world ยังไม่ถูก destroy กลาง tick นี้).
    let localLastExitId: string | null = null;
    const checkLocalExit = (): void => {
      const cell = snapToTile(player.position);
      const exit = findExitAt(map, cell.tx, cell.ty);
      const exitId = exit?.exitId ?? null;
      if (exit && exitId !== localLastExitId) {
        localLastExitId = exitId;
        requestTransition(exit.targetMapId, {
          x: exit.targetSpawn.x,
          y: exit.targetSpawn.y,
        });
        return;
      }
      localLastExitId = exitId;
    };

    // P2-13 (D-056): Page Visibility — แท็บ hidden = **freeze input/net-send** (connection คงอยู่ ไม่มี
    //   disconnect/countdown); กลับมาเห็น = **fast-resync** snap remote จาก state ปัจจุบัน (กัน rubber band
    //   หลัง rAF ถูก browser throttle ตอน hidden). browser เท่านั้น (typeof document guard) → detach ตอน destroy.
    let tabHidden = false;
    const visibility: VisibilityController | null =
      typeof document !== "undefined"
        ? createVisibilityController({
            onHidden: () => {
              tabHidden = true;
            },
            onVisible: () => {
              tabHidden = false;
              remotes?.resyncNow();
            },
          })
        : null;

    return {
      scene,
      player,
      net,
      tick(dtSeconds, deltaMs, deltaTime, locked): void {
        // P2-13 (D-056): freeze input/net-send ตอน transition lock **หรือ** แท็บ hidden (บาง browser ยัง
        //   tick 1Hz ตอน background) — render (mob/combat/scene) เดินต่อ. connection ไม่ถูกแตะ (ไม่ disconnect).
        const frozen = locked || tabHidden;
        // calc: player intent → movement (freeze ตอน lock/hidden)
        if (!frozen) player.update(dtSeconds);
        // C4: companion follow-step (client-only cosmetic) — freeze คู่ player (ไม่ขยับตอน transition/hidden)
        if (!frozen) companion?.update(dtSeconds);
        // calc: mobs (server interpolation / offline sim) — render ต่อเนื่องแม้ frozen
        updateMobs(dtSeconds, deltaMs);
        if (!frozen) {
          updateEngage();
          // A3: poll ปุ่มสกิล (Digit1-4) → cast slot (edge-triggered, consume ครั้งเดียวต่อการกด)
          const slot = player.consumeSlotPressed();
          if (slot !== null) castSlot(slot);
        }
        // combat juice (damage number/fade) — no-op เมื่อไม่มี attack
        combat.update(dtSeconds);
        stressHarness.update(dtSeconds, deltaMs);

        // net: throttle ส่ง local position (freeze ตอน lock/hidden) + lerp remote players (ต่อเนื่อง)
        if (net && remotes) {
          if (!frozen) {
            const timer = advanceSendTimer(
              sendAccumMs,
              deltaMs,
              1000 / config.net.positionSyncHz,
            );
            sendAccumMs = timer.remainderMs;
            if (timer.fire) {
              const snap = localSnapshot();
              if (snapshotChanged(lastSent, snap, config.net.sendEpsilon)) {
                net.sendMove(toMoveMessage(snap.tx, snap.ty, snap.direction, snap.anim));
                lastSent = snap;
              }
            }
          }
          remotes.update(dtSeconds);
        }

        // P1-10: offline exit detection (online → server สั่งผ่าน message แทน) — freeze ตอน lock/hidden
        if (!frozen && net?.status.state !== "online") {
          checkLocalExit();
        }

        // render: camera follow (lerp) + depth resort ถ้า dirty
        scene.update(deltaTime);
      },
      pressAttack,
      castSlot,
      getDebugInfo(fps): EngineDebugInfo {
        return buildDebugInfo({
          fps,
          playerTile: player.position,
          facing: player.facing, // Minimap (§8.4) player arrow — screen-space 8-dir, ไม่ sync จาก server
          pointerTile,
          entityCount: scene.entityCount,
          net: net ? net.getNetDebugInfo() : IDLE_NET_DEBUG_INFO,
        });
      },
      getBlips(): MobBlip[] {
        return mobView.getBlips();
      },
      setDepthDebug(enabled): void {
        scene.setDepthDebug(enabled);
      },
      resize(width, height): void {
        scene.resize(width, height);
      },
      destroy(): void {
        app.canvas.removeEventListener("pointermove", onPointerMove);
        app.canvas.removeEventListener("pointerleave", onPointerLeave);
        app.canvas.removeEventListener("pointerup", onPointerUp);
        app.canvas.removeEventListener("pointercancel", onPointerUp);
        app.canvas.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("keydown", onStressToggleKeyDown);
        visibility?.detach(); // P2-13: ถอด visibilitychange listener
        net?.disconnect();
        remotes?.destroy();
        stressHarness.destroy();
        combat.destroy();
        mobView.destroy();
        npcManager.destroy();
        companion?.destroy();
        player.destroy();
        scene.destroy();
      },
    };
  }

  // --- boot world แรก (owner-report#6 fix: map ที่ตัวละครที่เลือก save ไว้ล่าสุด แทน DEFAULT_MAP_ID
  //     เสมอ — ไม่งั้น server pickLoadPosition mismatch mapId แล้วทิ้งตำแหน่ง save. ตำแหน่งจริงยังมาจาก
  //     server ผ่าน onSelfSpawn adoption เหมือนเดิม — ที่นี่แค่เลือก "map ไหน" ให้ join ถูกห้อง) ---
  const bootMapId = pickBootMapId(readSelectedCharacterMapId(), hasMap, DEFAULT_MAP_ID);
  const initialMap = requireMap(bootMapId);
  // P3: preload atlas ที่ map แรกต้องใช้ให้เสร็จก่อน mount (peek พร้อมตั้งแต่เฟรมแรก — ไม่กระพริบ placeholder→art).
  // พลาด/ไม่มี assetId = คืน null → call site ใช้ placeholder เดิม (fail-soft).
  await registry.preload(collectMapAssetIds(initialMap, config));
  currentWorld = mountWorld(initialMap, {
    x: initialMap.spawnPoint.x,
    y: initialMap.spawnPoint.y,
  });
  currentMapId = initialMap.mapId; // LW0: rain gating ตาม map แรก (§4.1)
  currentWorld.resize(viewW, viewH);

  // Living World LW0 debug keys (dev demo, §23): toggle rain clear↔rain + fast-forward day phase. engine-scope
  // listener (คงข้ามการสลับ world) — panel ที่เปิดอยู่ block keydown (PanelContext capture-phase) จึงไม่ชนกับ
  // การพิมพ์ใน panel. TODO LW1: rain มาจาก weather scheduler (§4.2), phase มาจาก server clock (§3.2).
  const onWorldDebugKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === config.world.toggleRainKeyCode) {
      weather = weather === "rain" ? "clear" : "rain";
    } else if (e.code === config.world.cyclePhaseKeyCode) {
      phaseOffsetMs += config.world.cyclePhaseStepMinutes * realMsPerGameMinute(config.world);
    }
  };
  window.addEventListener("keydown", onWorldDebugKey);

  const detachResize = attachResize(container, (width, height) => {
    viewW = width;
    viewH = height;
    app.renderer.resize(width, height);
    nameplateLayer.resize(width, height);
    currentWorld.resize(width, height);
    transition.resize(width, height);
  });

  // --- master update loop: world tick → transition step → fps → HUD publish (P2-01) ---
  // publisher cadence = debugOverlay.pollIntervalMs เดิม (~250ms/4Hz, P0-11) — ไม่ push ทุก frame เข้า store.
  const hudPublisher = createHudPublisher(config.debugOverlay.pollIntervalMs);
  let fpsSampleMs = 0;
  const onTick = (ticker: Ticker): void => {
    // P2-13 (D-056): clamp dt กันพุ่งตอน refocus (rAF throttle ตอน hidden). deltaTime (frame unit) pixi
    //   clamp เองตาม minFPS แล้ว → ส่งต่อได้; ที่ต้อง clamp คือ ms ที่ขับ movement/interpolation.
    const deltaMs = clampDtMs(ticker.deltaMS, MAX_TICK_DELTA_MS);
    const dtSeconds = deltaMs / 1000;
    const locked = transition.isLocked();
    currentWorld.tick(dtSeconds, deltaMs, ticker.deltaTime, locked);
    // transition step (อาจ swap world ตอนจอมืดสุด — เกิดหลัง tick ของ world เดิมเสร็จแล้ว)
    transition.update(deltaMs);
    nameplateLayer.syncCamera(currentWorld.scene.world);
    nameplateLayer.setTransitionAlpha(transition.getFadeAlpha());
    nameplateLayer.render();

    // Living World LW0 (Bible §3.3 tint · §4 rain): client-side clock → phase tint + rain overlay (screen-space,
    // ไม่แตะ collision/spawn §3.3). rain แสดงเฉพาะ map ใน rainMapIds (§4.1 Map 1); คำนวณ tint หลัง transition.update
    // (ใช้ scene ปัจจุบันหลัง swap). effect quality ลดจำนวน streak ก่อน (§4.4 degrade weather ก่อน telegraph).
    const worldNowMs = Date.now() + phaseOffsetMs;
    const tint = phaseTintAt(worldNowMs, config.world);
    const rainOn: WeatherKind =
      weather === "rain" && config.world.rainMapIds.includes(currentMapId) ? "rain" : "clear";
    currentWorld.scene.setPhaseTint(tint.color, tint.alpha);
    currentWorld.scene.setWeather(rainOn);
    currentWorld.scene.updateWeather(deltaMs, config.combatFeel.effectQuality.current);

    // C2b (§13 client events): report living-world state on TRANSITION EDGES only (not per frame). rain tick =
    //   1/min while raining on the rain map → ach_rain_walk_30 accumulator. server whitelists + rate-limits these.
    const worldNet = currentWorld.net;
    if (worldNet !== null) {
      const worldPhaseNow = phaseAt(worldMinuteAt(worldNowMs, config.world));
      if (rainOn !== prevRainWeather) {
        prevRainWeather = rainOn;
        worldNet.sendClientEvent({ type: "weather.changed", payload: { weather: rainOn } });
      }
      if (worldPhaseNow !== prevPhaseId) {
        prevPhaseId = worldPhaseNow;
        worldNet.sendClientEvent({ type: "phase.changed", payload: { phase: worldPhaseNow, mapId: currentMapId } });
      }
      if (rainOn === "rain") {
        rainTickAccumMs += deltaMs;
        if (rainTickAccumMs >= 60_000) {
          rainTickAccumMs -= 60_000;
          worldNet.sendClientEvent({ type: "weather.rain.tick", payload: { mapId: currentMapId } });
        }
      } else {
        rainTickAccumMs = 0;
      }
    }

    fpsSampleMs += ticker.deltaMS;
    if (fpsSampleMs >= FPS_SAMPLE_INTERVAL_MS) {
      fpsText.text = `FPS ${Math.round(app.ticker.FPS)}`;
      fpsSampleMs = 0;
    }

    // build() เป็น thunk — publisher เรียกเฉพาะตอนถึงคิว throttle จริง (กันประกอบ EngineDebugInfo/blips ทุก frame)
    hudPublisher.publish(performance.now(), () => ({
      debugInfo: currentWorld.getDebugInfo(app.ticker.FPS),
      // Minimap (§8.4): blips มากับ cadence เดียวกับ debugInfo (~4Hz) — ไม่เพิ่ม frequency ใหม่
      blips: currentWorld.getBlips(),
      // Living World LW0 (Bible §18 World Status chip): phase + weather ปัจจุบัน — throttled cadence เดียวกับ
      // debugInfo (~4Hz) ไม่ push ต่อ frame เข้า React (tech §2). WorldStatusChip subscribe ค่านี้.
      worldPhase: phaseAt(worldMinuteAt(worldNowMs, config.world)),
      weather: rainOn,
    }));
  };
  app.ticker.add(onTick);

  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    app.ticker.remove(onTick);
    window.removeEventListener("keydown", onWorldDebugKey); // LW0 debug keys
    detachResize();
    transition.destroy();
    currentWorld.destroy();
    nameplateLayer.destroy();
    // P3: ทำลาย atlas ทั้งหมด (texture + source PNG) หลัง world ปล่อย view หมดแล้ว — ก่อน app.destroy
    // ล้าง GPU context. entity ที่ยืม atlas texture ถูก remove ไปกับ currentWorld.destroy() แล้ว (non-owning).
    registry.destroy();
    // D-065: restore scaleMode global default กันค่าค้างข้าม StrictMode remount / engine ตัวถัดไป
    if (config.render.pixelate) {
      TextureSource.defaultOptions.scaleMode = "linear";
    }
    resetHudState(); // engine ถูก destroy (unmount/StrictMode/transient) — เคลียร์ store กัน overlay ค้างค่าเก่า
    // removeView: true → เอา canvas ออกจาก DOM ด้วย; ล้าง GPU/texture/context ให้หมด
    app.destroy(
      { removeView: true },
      { children: true, texture: true, textureSource: true, context: true },
    );
  };

  return {
    app,
    get scene(): MapSceneHandle {
      return currentWorld.scene;
    },
    get player(): LocalPlayerHandle {
      return currentWorld.player;
    },
    get net(): NetClientHandle | null {
      return currentWorld.net;
    },
    getDebugInfo(): EngineDebugInfo {
      return currentWorld.getDebugInfo(app.ticker.FPS);
    },
    setDepthDebug(enabled: boolean): void {
      currentWorld.setDepthDebug(enabled);
    },
    pressAttack(): void {
      currentWorld.pressAttack();
    },
    castSlot(slot: number): void {
      currentWorld.castSlot(slot);
    },
    setEffectQuality(quality: EffectQuality): void {
      // mutate ตัว config เดียวกับที่ mountWorld/combat-stub อ่าน live — มีผลทุก world (คงค่าข้าม transition)
      config.combatFeel.effectQuality.current = quality;
    },
    setScreenShakeEnabled(enabled: boolean): void {
      config.combatFeel.screenShake.enabled = enabled;
    },
    closeDialogue(): void {
      setActiveDialogue(null);
    },
    destroy,
  };
}
