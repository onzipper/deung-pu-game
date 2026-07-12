// Engine runtime bootstrap — ครอบ pixi Application.
// Plain TS + pixi เท่านั้น — ห้าม import React / Next.js (layer contract, tech §2).
// แยก calc (update state) ออกจาก render ไว้ตั้งแต่ต้น เพื่อเตรียม server-authoritative ตอน P1.

import { Application, Container, Text, type Ticker } from "pixi.js";
import { type EngineConfig, resolveResolution } from "../config";
import { loadMapConfig } from "../map/loader";
import { P0_TEST_FIELD } from "../map/p0-test-field";
import { createMapScene, type MapSceneHandle } from "../render/scene";
import { createLocalPlayer, type LocalPlayerHandle } from "../player/local-player";
import { createMobViewManager, type MobViewHandle } from "@/game/mob/manager";
import { createMobSimulation, type MobSimulation } from "@/game/mob/simulation";
import { createCombatStub, type CombatStubHandle } from "@/game/combat/combat-stub";
import { createStressHarness, type StressHarnessHandle } from "@/game/combat/stress-harness";
import { WARRIOR_SKILLS_CLIENT } from "@/game/skill/data/warrior-skills-client";
import { createNetClient, type NetClientHandle } from "../net/net-client";
import { createRemotePlayerManager } from "../net/remote-player-manager";
import {
  advanceSendTimer,
  coerceAnim,
  snapshotChanged,
  toMoveMessage,
} from "../net/sync";
import { DEFAULT_MAP_ID, type PlayerSnapshot } from "@/shared/net-protocol";
import { partyIdFromLocation } from "../net/party";
import { attachResize } from "./resize";
import { screenToTile, snapToTile, type TilePoint } from "../iso/coords";
import { buildDebugInfo, IDLE_NET_DEBUG_INFO, type EngineDebugInfo } from "./debug-info";

/** handle สาธารณะที่ React (หรือ caller อื่น) ใช้คุมกับ engine — ห้ามให้ caller แตะ pixi ตรง ๆ นอกจากผ่าน app */
export interface EngineHandle {
  /** pixi Application instance (read-only ต่อ caller โดยมารยาท) */
  readonly app: Application;
  /** map scene ปัจจุบัน — layer ถัดไป (P0-06/09) ใช้ entity API ผ่านนี้ */
  readonly scene: MapSceneHandle;
  /** local player controller (P0-05) — keyboard movement + collision + camera follow */
  readonly player: LocalPlayerHandle;
  /**
   * realtime net client (P0-07) — null ถ้า config.net.enabled=false.
   * connect เป็น best-effort/async: status.state = connecting → online/offline.
   * P0-11 debug overlay อ่านผ่าน `net.getNetDebugInfo()` (status/mapId/roomId/channelId/playerCount).
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
 * สร้าง engine + render P0 Test Field (iso map จริง: grid + props + depth sort + camera).
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

  // --- map scene: load P0 Test Field ผ่าน loader (validate) แล้ว render ---
  const map = loadMapConfig(P0_TEST_FIELD);
  const scene = createMapScene(app, map, config);

  // --- local player (P0-05): keyboard movement + collision slide + camera follow ---
  // spawn + snap กล้องมาที่ player + attach keyboard เกิดภายใน createLocalPlayer
  const player = createLocalPlayer(scene, map, config, app.renderer);

  // --- mobs (P1-03): server-authoritative → view manager render จาก snapshot (interpolation, TA §18/§6) ---
  // spawn/AI/leash/respawn อยู่ที่ authority (server sim); view manager แค่ interpolate+วาด (ไม่มี game logic).
  const mobView: MobViewHandle = createMobViewManager(scene, config, app.renderer);

  // --- combat (P1-05 server-authoritative): Space → anticipation anim + cast intent → server result ---
  // skill แรกนักดาบจาก **client manifest** (ClientSkillView) — ไม่มี server-only field แม้เป็น literal
  // (balance/สูตรไม่รั่ว client bundle, TA §16.1; server-only data อยู่ warrior-skills-server.ts). S1 = index 0.
  const firstWarriorSkill = WARRIOR_SKILLS_CLIENT[0];
  // net ถูก assign ด้านล่าง (declare ก่อน combat เพื่อให้ castSkill/isOnline closure อ้างได้ — เรียกตอน runtime หลัง assign).
  let net: NetClientHandle | null = null;
  const combat: CombatStubHandle = createCombatStub(scene, player, mobView, config, {
    skill: firstWarriorSkill,
    castSkill: (msg) => net?.sendCast(msg),
    isOnline: () => net?.status.state === "online",
  });

  // --- stress harness (P1-06 §5, dev-only) — F4 toggles synthetic load (~40 mobs + ~300 dmg#/วิ) เพื่อ
  // พิสูจน์ budget TA §11 โดยไม่ต้องมี server; ใช้ mob view + combat pool จริง (ไม่ใช่ path แยก) ---
  const stressHarness: StressHarnessHandle = createStressHarness({
    mobView,
    combat,
    map,
    config: config.stressHarness,
    mobTypes: Object.keys(config.mob.styles),
  });

  // --- realtime net (P0-07): remote players + position sync ---
  // Graceful offline: connect ล้ม = เล่น solo ต่อ (net.status = "offline"); ไม่ block boot.
  // P1-08: partyId ของ local player (URL `?party=xyz` > config default) — ค่าเดียวใช้ทั้ง joinOptions
  // และ snapshot ที่ส่งขึ้น server (สมาชิก party รู้กันผ่าน filterBy + PlayerState.partyId).
  const localPartyId = partyIdFromLocation(config.net.partyId);
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
    const initial = localSnapshot();
    net = createNetClient(
      {
        serverUrl: config.net.serverUrl,
        roomName: config.net.roomName,
        // P1-07: auto-reconnect retry/backoff (§59.1) — mirror knob จาก config.reconnect
        retry: config.reconnect.clientRetry,
      },
      // P1-08: client ไม่ส่ง channelId (server auto-assign) — ส่ง partyId (URL `?party=xyz` > config default)
      // ให้ server จับ party sync ผ่าน filterBy(['mapId','partyId']). (...initial มี partyId = localPartyId ตรงกัน)
      { mapId: DEFAULT_MAP_ID, ...initial, partyId: localPartyId },
      {
        onPlayerAdd: (id, snap) => remotes?.onPlayerAdd(id, snap),
        onPlayerChange: (id, snap) => remotes?.onPlayerChange(id, snap),
        onPlayerRemove: (id) => remotes?.onPlayerRemove(id),
        // P1-02 reconcile: server ปฏิเสธ move → snap local player + เคลียร์ prediction state
        // (lastSent=null → รอบส่งถัดไปเทียบจากตำแหน่งที่ถูก correct; sendAccum=0 กันยิงทันที).
        onPositionCorrection: (correction) => {
          player.applyCorrection(correction.tx, correction.ty);
          lastSent = null;
          sendAccumMs = 0;
        },
        // P1-03: มอน server-authoritative → ป้อนเข้า view manager (server mode)
        onMobAdd: (snap) => mobView.onMobAdd(snap),
        onMobChange: (snap) => mobView.onMobChange(snap),
        onMobRemove: (mobId) => mobView.onMobRemove(mobId),
        // P1-05: ผลใช้สกิลจาก server (ทุก caster) → เล่น damage number จริง
        onSkillResult: (result) => combat.onSkillResult(result),
      },
    );
  }

  // --- mob source controller (P1-03): server-driven (online) หรือ local sim (offline fallback) ---
  // graceful offline: connect เป็น async — ระหว่าง "connecting" ยังไม่โชว์มอน; online → server feed;
  // offline/net ปิด → รัน sim ตัวเดียวกับ server ฝั่ง client (pure) แล้วป้อน view เอง (มอนเดิน/aggro ได้เหมือนกัน).
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
    return "pending"; // connecting/idle — รอผลก่อน
  };

  const updateMobs = (dtSeconds: number, deltaMs: number): void => {
    const desired = desiredMobMode();
    if (desired !== mobMode) {
      // ออกจาก local → หยุด sim + เคลียร์มอน local
      if (mobMode === "local") {
        localSim = null;
        mobView.removeAll();
      }
      // เข้า local → เคลียร์มอน server ค้าง (ถ้ามี) + สร้าง sim ใหม่
      if (desired === "local") {
        mobView.removeAll();
        localSim = createMobSimulation({ map, config: config.mob, hpFor });
        simAccumMs = 0;
      }
      // pending↔server ไม่แตะ view — server callbacks จัดการเอง
      mobMode = desired;
    }

    if (mobMode === "local" && localSim) {
      simAccumMs += deltaMs;
      let stepped = false;
      // fixed-step sim (accumulator) — offline client เป็น authority ของ view ตัวเอง
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

  // --- ui layer (screen-space, ไม่โดน camera pan) — P0-11 จะทำ overlay เต็ม ---
  const ui = new Container();
  app.stage.addChild(ui); // เพิ่มหลัง world → อยู่บนสุด
  const fpsText = new Text({
    text: "FPS —",
    style: { fill: 0xffffff, fontSize: 14, fontFamily: "monospace" },
  });
  fpsText.position.set(12, 12);
  ui.addChild(fpsText);

  const detachResize = attachResize(container, (width, height) => {
    app.renderer.resize(width, height);
    scene.resize(width, height);
  });

  // --- pointer tile tracking (P0-11 debug overlay) ---
  // canvas CSS-pixel (getBoundingClientRect) อยู่ใน space เดียวกับ scene.world.position/viewport
  // (autoDensity=true → CSS size = renderer logical size, ตรงกับที่ camera.ts ใช้อยู่แล้ว).
  let pointerTile: TilePoint | null = null;
  const onPointerMove = (e: PointerEvent): void => {
    const rect = app.canvas.getBoundingClientRect();
    const worldLocal = {
      sx: e.clientX - rect.left - scene.world.position.x,
      sy: e.clientY - rect.top - scene.world.position.y,
    };
    pointerTile = snapToTile(screenToTile(worldLocal, config.tileSize));
  };
  const onPointerLeave = (): void => {
    pointerTile = null;
  };
  app.canvas.addEventListener("pointermove", onPointerMove);
  app.canvas.addEventListener("pointerleave", onPointerLeave);

  // --- stress harness toggle (P1-06 §5, dev-only) — F4, เหมือน F3 debug overlay: preventDefault กัน
  // browser ทำอย่างอื่น, key เป็น config (toggleKeyCode) ไม่ hardcode ---
  const onStressToggleKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== config.stressHarness.toggleKeyCode) return;
    e.preventDefault();
    stressHarness.toggle();
  };
  window.addEventListener("keydown", onStressToggleKeyDown);

  // --- update loop: calc → render (แยกกันชัด) ---
  let fpsSampleMs = 0;
  const onTick = (ticker: Ticker): void => {
    const dtSeconds = ticker.deltaMS / 1000;
    // calc: player intent → movement (dt เป็นวินาที) → scene entity + camera target
    player.update(dtSeconds);
    // calc: mobs (P1-03) — server-driven view interpolation หรือ offline local sim → scene entity
    updateMobs(dtSeconds, ticker.deltaMS);
    // calc: combat stub (P0-10→P1-06) — attack input → hit test → damage number/hit stop/shake (juice)
    combat.update(dtSeconds);
    // calc: stress harness (P1-06 §5, dev-only) — no-op เมื่อปิดอยู่ (default)
    stressHarness.update(dtSeconds, ticker.deltaMS);

    // net (P0-07): throttle ส่ง local position + lerp remote players
    if (net && remotes) {
      const timer = advanceSendTimer(
        sendAccumMs,
        ticker.deltaMS,
        1000 / config.net.positionSyncHz,
      );
      sendAccumMs = timer.remainderMs;
      if (timer.fire) {
        const snap = localSnapshot();
        if (snapshotChanged(lastSent, snap, config.net.sendEpsilon)) {
          net.sendMove(toMoveMessage(snap.tx, snap.ty, snap.direction, snap.anim));
          lastSent = snap;
          // P1-02: reconcile = snap-only (onPositionCorrection handler ด้านบน). local ยัง
          // full client-predict + server validate หยาบ (TA §6); rewind-replay input = future work.
        }
      }
      // remote entities render ย้อนหลังผ่าน interpolation buffer (P1-01) — local ไม่ผ่าน buffer นี้
      remotes.update(dtSeconds);
    }

    // render: camera follow (lerp) + depth resort ถ้า dirty
    scene.update(ticker.deltaTime);
    fpsSampleMs += ticker.deltaMS;
    if (fpsSampleMs >= FPS_SAMPLE_INTERVAL_MS) {
      fpsText.text = `FPS ${Math.round(app.ticker.FPS)}`;
      fpsSampleMs = 0;
    }
  };
  app.ticker.add(onTick);

  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    app.ticker.remove(onTick);
    detachResize();
    app.canvas.removeEventListener("pointermove", onPointerMove);
    app.canvas.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("keydown", onStressToggleKeyDown);
    net?.disconnect();
    remotes?.destroy();
    stressHarness.destroy();
    combat.destroy();
    mobView.destroy();
    player.destroy();
    scene.destroy();
    // removeView: true → เอา canvas ออกจาก DOM ด้วย; ล้าง GPU/texture/context ให้หมด
    app.destroy(
      { removeView: true },
      { children: true, texture: true, textureSource: true, context: true },
    );
  };

  return {
    app,
    scene,
    player,
    net,
    getDebugInfo(): EngineDebugInfo {
      return buildDebugInfo({
        fps: app.ticker.FPS,
        playerTile: player.position,
        pointerTile,
        entityCount: scene.entityCount,
        net: net ? net.getNetDebugInfo() : IDLE_NET_DEBUG_INFO,
      });
    },
    setDepthDebug(enabled: boolean): void {
      scene.setDepthDebug(enabled);
    },
    destroy,
  };
}
