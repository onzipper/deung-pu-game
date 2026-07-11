// Engine runtime bootstrap — ครอบ pixi Application.
// Plain TS + pixi เท่านั้น — ห้าม import React / Next.js (layer contract, tech §2).
// แยก calc (update state) ออกจาก render ไว้ตั้งแต่ต้น เพื่อเตรียม server-authoritative ตอน P1.

import { Application, Container, Text, type Ticker } from "pixi.js";
import { type EngineConfig, resolveResolution } from "../config";
import { loadMapConfig } from "../map/loader";
import { P0_TEST_FIELD } from "../map/p0-test-field";
import { createMapScene, type MapSceneHandle } from "../render/scene";
import { attachResize } from "./resize";

/** handle สาธารณะที่ React (หรือ caller อื่น) ใช้คุมกับ engine — ห้ามให้ caller แตะ pixi ตรง ๆ นอกจากผ่าน app */
export interface EngineHandle {
  /** pixi Application instance (read-only ต่อ caller โดยมารยาท) */
  readonly app: Application;
  /** map scene ปัจจุบัน — layer ถัดไป (P0-05/06/09) ใช้ entity API ผ่านนี้ */
  readonly scene: MapSceneHandle;
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
  // กล้องเริ่มที่จุดเกิด (snap ทันที ไม่ให้กวาดจาก origin) — player จริงมา P0-05
  scene.setCameraTarget({ tx: map.spawnPoint.x, ty: map.spawnPoint.y }, true);

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
    scene.destroy();
    // removeView: true → เอา canvas ออกจาก DOM ด้วย; ล้าง GPU/texture/context ให้หมด
    app.destroy(
      { removeView: true },
      { children: true, texture: true, textureSource: true, context: true },
    );
  };

  return { app, scene, destroy };
}
