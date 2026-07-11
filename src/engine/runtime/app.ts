// Engine runtime bootstrap — ครอบ pixi Application.
// Plain TS + pixi เท่านั้น — ห้าม import React / Next.js (layer contract, tech §2).
// แยก calc (update state) ออกจาก render ไว้ตั้งแต่ต้น เพื่อเตรียม server-authoritative ตอน P1.

import { Application, Container, Text, type Ticker } from "pixi.js";
import { type EngineConfig, resolveResolution } from "../config";
import { loadMapConfig } from "../map/loader";
import { P0_TEST_FIELD } from "../map/p0-test-field";
import { createMapScene, type MapSceneHandle } from "../render/scene";
import { createLocalPlayer, type LocalPlayerHandle } from "../player/local-player";
import { createNetClient, type NetClientHandle } from "../net/net-client";
import { createRemotePlayerManager } from "../net/remote-player-manager";
import {
  advanceSendTimer,
  coerceAnim,
  snapshotChanged,
  toMoveMessage,
} from "../net/sync";
import { DEFAULT_MAP_ID, type PlayerSnapshot } from "@/shared/net-protocol";
import { attachResize } from "./resize";

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

  // --- realtime net (P0-07): remote players + position sync ---
  // Graceful offline: connect ล้ม = เล่น solo ต่อ (net.status = "offline"); ไม่ block boot.
  const localSnapshot = (): PlayerSnapshot => ({
    tx: player.position.tx,
    ty: player.position.ty,
    direction: player.facing,
    anim: coerceAnim(player.animation),
  });
  let net: NetClientHandle | null = null;
  let remotes: ReturnType<typeof createRemotePlayerManager> | null = null;
  let sendAccumMs = 0;
  let lastSent: PlayerSnapshot | null = null;
  if (config.net.enabled) {
    remotes = createRemotePlayerManager(scene, config, app.renderer);
    const initial = localSnapshot();
    net = createNetClient(
      { serverUrl: config.net.serverUrl, roomName: config.net.roomName },
      { mapId: DEFAULT_MAP_ID, channelId: config.net.channelId, ...initial },
      {
        onPlayerAdd: (id, snap) => remotes?.onPlayerAdd(id, snap),
        onPlayerChange: (id, snap) => remotes?.onPlayerChange(id, snap),
        onPlayerRemove: (id) => remotes?.onPlayerRemove(id),
      },
    );
  }

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

  // --- update loop: calc → render (แยกกันชัด) ---
  let fpsSampleMs = 0;
  const onTick = (ticker: Ticker): void => {
    const dtSeconds = ticker.deltaMS / 1000;
    // calc: player intent → movement (dt เป็นวินาที) → scene entity + camera target
    player.update(dtSeconds);

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
        }
      }
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
    net?.disconnect();
    remotes?.destroy();
    player.destroy();
    scene.destroy();
    // removeView: true → เอา canvas ออกจาก DOM ด้วย; ล้าง GPU/texture/context ให้หมด
    app.destroy(
      { removeView: true },
      { children: true, texture: true, textureSource: true, context: true },
    );
  };

  return { app, scene, player, net, destroy };
}
