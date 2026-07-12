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

import { Application, Container, Text, type Ticker } from "pixi.js";
import { type EngineConfig, resolveResolution } from "../config";
import { requireMap, getMap, hasMap } from "../map/registry";
import { findExitAt, type MapConfig } from "../map/types";
import { createMapScene, type MapSceneHandle } from "../render/scene";
import { buildExitMarkerPolygons } from "../render/exit-marker";
import { createLocalPlayer, type LocalPlayerHandle } from "../player/local-player";
import { createMobViewManager, type MobViewHandle } from "@/game/mob/manager";
import { createMobSimulation, type MobSimulation } from "@/game/mob/simulation";
import { createCombatStub, type CombatStubHandle } from "@/game/combat/combat-stub";
import {
  cancelEngage,
  startEngage,
  stepEngage,
  IDLE_ENGAGE_STATE,
  type EngageState,
} from "@/game/combat/target-engage";
import { createStressHarness, type StressHarnessHandle } from "@/game/combat/stress-harness";
import { WARRIOR_SKILLS_CLIENT } from "@/game/skill/data/warrior-skills-client";
import { createNetClient, type NetClientHandle } from "../net/net-client";
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
import { attachResize } from "./resize";
import { screenToTile, snapToTile, type TilePoint } from "../iso/coords";
import { buildDebugInfo, IDLE_NET_DEBUG_INFO, type EngineDebugInfo } from "./debug-info";
import { createHudPublisher, resetHudState } from "@/ui/store/game-store";

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
  /** เก็บกวาดครบ: ticker, resize observer, canvas, GPU resources */
  destroy(): void;
}

const FPS_SAMPLE_INTERVAL_MS = 250;

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
  getDebugInfo(fps: number): EngineDebugInfo;
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

  const resolution = resolveResolution(
    config,
    typeof globalThis !== "undefined" ? globalThis.devicePixelRatio : undefined,
  );

  await app.init({
    backgroundColor: config.backgroundColor,
    backgroundAlpha: config.backgroundAlpha,
    antialias: config.antialias,
    resolution,
    autoDensity: config.autoDensity,
    preference: config.preference,
    powerPreference: config.powerPreference,
    width: Math.max(1, container.clientWidth),
    height: Math.max(1, container.clientHeight),
    // ไม่ใช้ resizeTo ของ pixi — จัดการเองผ่าน attachResize เพื่อผูกกับ container ตรง ๆ
  });

  container.appendChild(app.canvas);

  let viewW = Math.max(1, container.clientWidth);
  let viewH = Math.max(1, container.clientHeight);

  // --- shared UI layer (screen-space, ไม่โดน camera pan) — fps ฯลฯ. อยู่บน world; fade overlay อยู่บน ui อีกที ---
  const ui = new Container();
  app.stage.addChild(ui);
  const fpsText = new Text({
    text: "FPS —",
    style: { fill: 0xffffff, fontSize: 14, fontFamily: "monospace" },
  });
  fpsText.position.set(12, 12);
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

  /**
   * P1-10: ขอข้าม map. schedule swap ผ่าน transition controller — จอมืดสุด → teardown world เดิม +
   * mount world ใหม่ (map ปลายทาง, spawn = targetSpawn). no-op ถ้ากำลัง transition อยู่ (guard ใน controller).
   */
  const requestTransition = (
    targetMapId: string,
    targetSpawn: { x: number; y: number },
  ): void => {
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
      currentWorld.resize(viewW, viewH);
    });
  };

  /**
   * สร้าง world สำหรับ 1 map (P1-10). spawn = จุดเกิด (map.spawnPoint ตอน boot / targetSpawn ตอน transition).
   */
  function mountWorld(map: MapConfig, spawn: { x: number; y: number }): WorldHandle {
    // --- map scene ---
    const scene = createMapScene(app, map, config);
    // P1 fix: highlight พื้น exit area ให้เห็น "ทางออก" (owner เดินหา exit ไม่เจอเพราะ placeholder art ล้วน).
    // ground-level overlay ใต้ entity, ไม่แตะ depth-sort. teardown = scene.destroy() (world.destroy children)
    // ตอนสลับ map. placeholder จนกว่าจะมี art จริง (ประตู/ป้าย sprite).
    scene.setExitMarkers(
      buildExitMarkerPolygons(map.exits, config.tileSize),
      config.exitMarker,
    );

    // --- local player (P0-05): spawn ที่ map.spawnPoint แล้ว snap ไป spawn จริง (targetSpawn ตอน transition) ---
    const player = createLocalPlayer(scene, map, config, app.renderer);
    player.applyCorrection(spawn.x, spawn.y); // ย้าย + snap กล้องมาที่จุดเกิดจริง (idempotent ถ้า = spawnPoint)

    // --- mobs (P1-03): server-authoritative → view manager render จาก snapshot ---
    const mobView: MobViewHandle = createMobViewManager(scene, config, app.renderer);

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
    });

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
    });
    let remotes: ReturnType<typeof createRemotePlayerManager> | null = null;
    let sendAccumMs = 0;
    let lastSent: PlayerSnapshot | null = null;
    if (config.net.enabled) {
      remotes = createRemotePlayerManager(scene, config, app.renderer);
      // joinOptions: mapId ของ world นี้ + spawn (server spawn player ที่นี่ตั้งแต่เฟรมแรก / ตอน transition ที่ targetSpawn)
      const initial: PlayerSnapshot = {
        tx: spawn.x,
        ty: spawn.y,
        direction: player.facing,
        anim: coerceAnim(player.animation),
        partyId: localPartyId,
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
          },
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

      mobView.update(dtSeconds);
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
    const onPointerMove = (e: PointerEvent): void => {
      pointerTile = snapToTile(footFromEvent(e));
    };
    const onPointerLeave = (): void => {
      pointerTile = null;
    };
    app.canvas.addEventListener("pointermove", onPointerMove);
    app.canvas.addEventListener("pointerleave", onPointerLeave);

    // --- click-to-move + touch (P1-09, TA §17.3 · L11) ---
    const attackRange = firstWarriorSkill.range;
    const pickRadiusSq = config.pathfinding.clickMobPickRadius ** 2;
    const mobUnderClick = (foot: TilePoint): { id: string; pos: TilePoint } | null => {
      let best: { id: string; pos: TilePoint } | null = null;
      let bestSq = pickRadiusSq;
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

    const onPointerDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      if (transition.isLocked()) return; // P1-10: input lock ระหว่างข้าม map
      const foot = footFromEvent(e);
      // P1-11: safe zone (เมือง) ไม่มี combat → คลิกมอน = เดินเฉย ๆ (ไม่ tap-to-attack). เมืองไม่มีมอนอยู่แล้ว.
      const mob = combatAllowed ? mobUnderClick(foot) : null;
      if (mob) {
        engageState = startEngage(mob.id);
        if (distTo(mob.pos) <= attackRange) {
          player.faceToward(mob.pos);
          player.requestAttack();
          player.cancelPath();
        } else {
          player.moveTo(mob.pos);
        }
      } else {
        // คลิกพื้นเปล่า = ยกเลิก engage ที่ค้างอยู่ (manual override ชนะเสมอ, เหมือน WASD)
        player.moveTo(foot);
        engageState = cancelEngage();
      }
    };
    app.canvas.addEventListener("pointerdown", onPointerDown);

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

    return {
      scene,
      player,
      net,
      tick(dtSeconds, deltaMs, deltaTime, locked): void {
        // calc: player intent → movement (freeze ตอน transition lock)
        if (!locked) player.update(dtSeconds);
        // calc: mobs (server interpolation / offline sim) — render ต่อเนื่องแม้ locked
        updateMobs(dtSeconds, deltaMs);
        if (!locked) {
          updateEngage();
        }
        // combat juice (damage number/fade) — no-op เมื่อไม่มี attack
        combat.update(dtSeconds);
        stressHarness.update(dtSeconds, deltaMs);

        // net: throttle ส่ง local position (freeze ตอน locked) + lerp remote players (ต่อเนื่อง)
        if (net && remotes) {
          if (!locked) {
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

        // P1-10: offline exit detection (online → server สั่งผ่าน message แทน)
        if (!locked && net?.status.state !== "online") {
          checkLocalExit();
        }

        // render: camera follow (lerp) + depth resort ถ้า dirty
        scene.update(deltaTime);
      },
      getDebugInfo(fps): EngineDebugInfo {
        return buildDebugInfo({
          fps,
          playerTile: player.position,
          pointerTile,
          entityCount: scene.entityCount,
          net: net ? net.getNetDebugInfo() : IDLE_NET_DEBUG_INFO,
        });
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
        app.canvas.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("keydown", onStressToggleKeyDown);
        net?.disconnect();
        remotes?.destroy();
        stressHarness.destroy();
        combat.destroy();
        mobView.destroy();
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
  currentWorld = mountWorld(initialMap, {
    x: initialMap.spawnPoint.x,
    y: initialMap.spawnPoint.y,
  });
  currentWorld.resize(viewW, viewH);

  const detachResize = attachResize(container, (width, height) => {
    viewW = width;
    viewH = height;
    app.renderer.resize(width, height);
    currentWorld.resize(width, height);
    transition.resize(width, height);
  });

  // --- master update loop: world tick → transition step → fps → HUD publish (P2-01) ---
  // publisher cadence = debugOverlay.pollIntervalMs เดิม (~250ms/4Hz, P0-11) — ไม่ push ทุก frame เข้า store.
  const hudPublisher = createHudPublisher(config.debugOverlay.pollIntervalMs);
  let fpsSampleMs = 0;
  const onTick = (ticker: Ticker): void => {
    const dtSeconds = ticker.deltaMS / 1000;
    const locked = transition.isLocked();
    currentWorld.tick(dtSeconds, ticker.deltaMS, ticker.deltaTime, locked);
    // transition step (อาจ swap world ตอนจอมืดสุด — เกิดหลัง tick ของ world เดิมเสร็จแล้ว)
    transition.update(ticker.deltaMS);

    fpsSampleMs += ticker.deltaMS;
    if (fpsSampleMs >= FPS_SAMPLE_INTERVAL_MS) {
      fpsText.text = `FPS ${Math.round(app.ticker.FPS)}`;
      fpsSampleMs = 0;
    }

    // build() เป็น thunk — publisher เรียกเฉพาะตอนถึงคิว throttle จริง (กันประกอบ EngineDebugInfo ทุก frame)
    hudPublisher.publish(performance.now(), () => ({
      debugInfo: currentWorld.getDebugInfo(app.ticker.FPS),
    }));
  };
  app.ticker.add(onTick);

  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    app.ticker.remove(onTick);
    detachResize();
    transition.destroy();
    currentWorld.destroy();
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
    destroy,
  };
}
