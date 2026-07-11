// Engine runtime bootstrap — ครอบ pixi Application.
// Plain TS + pixi เท่านั้น — ห้าม import React / Next.js (layer contract, tech §2).
// แยก calc (update state) ออกจาก render ไว้ตั้งแต่ต้น เพื่อเตรียม server-authoritative ตอน P1.

import { Application, Container, Graphics, Text, type Ticker } from "pixi.js";
import {
  type EngineConfig,
  type TileSize,
  resolveResolution,
} from "../config";
import { attachResize } from "./resize";

/** handle สาธารณะที่ React (หรือ caller อื่น) ใช้คุมกับ engine — ห้ามให้ caller แตะ pixi ตรง ๆ นอกจากผ่าน app */
export interface EngineHandle {
  /** pixi Application instance (read-only ต่อ caller โดยมารยาท) */
  readonly app: Application;
  /** เก็บกวาดครบ: ticker, resize observer, canvas, GPU resources */
  destroy(): void;
}

/** state ของ placeholder scene — calc ล้วน แยกจาก object ที่ render (พิสูจน์ว่า loop เดิน) */
interface PlaceholderState {
  rotation: number;
  fpsSampleMs: number;
}

const ROTATION_PER_FRAME = 0.02;
const FPS_SAMPLE_INTERVAL_MS = 250;
const PLACEHOLDER_SCALE = 3;

function drawDiamond(g: Graphics, tile: TileSize): void {
  const hw = tile.width / 2;
  const hh = tile.height / 2;
  g.clear();
  g.poly([0, -hh, hw, 0, 0, hh, -hw, 0])
    .fill({ color: 0x6ee7ff, alpha: 0.9 })
    .stroke({ color: 0xffffff, width: 1 });
}

/**
 * สร้าง engine + placeholder scene ที่พิสูจน์ว่า render loop ทำงาน.
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

  // --- placeholder scene (P0-01 เท่านั้น; P0-02 จะแทนด้วย iso grid) ---
  const scene = new Container();
  app.stage.addChild(scene);

  const diamond = new Graphics();
  drawDiamond(diamond, config.tileSize);
  diamond.scale.set(PLACEHOLDER_SCALE);
  scene.addChild(diamond);

  const fpsText = new Text({
    text: "FPS —",
    style: {
      fill: 0xffffff,
      fontSize: 14,
      fontFamily: "monospace",
    },
  });
  fpsText.position.set(12, 12);
  scene.addChild(fpsText);

  const layout = (width: number, height: number): void => {
    diamond.position.set(width / 2, height / 2);
  };
  layout(app.renderer.width, app.renderer.height);

  const detachResize = attachResize(container, (width, height) => {
    app.renderer.resize(width, height);
    layout(width, height);
  });

  // --- update loop: calc → render (แยกกันชัด) ---
  const state: PlaceholderState = { rotation: 0, fpsSampleMs: 0 };

  const onTick = (ticker: Ticker): void => {
    // calc
    state.rotation += ROTATION_PER_FRAME * ticker.deltaTime;
    state.fpsSampleMs += ticker.deltaMS;
    // render (apply state → display objects)
    diamond.rotation = state.rotation;
    if (state.fpsSampleMs >= FPS_SAMPLE_INTERVAL_MS) {
      fpsText.text = `FPS ${Math.round(app.ticker.FPS)}`;
      state.fpsSampleMs = 0;
    }
  };
  app.ticker.add(onTick);

  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    app.ticker.remove(onTick);
    detachResize();
    // removeView: true → เอา canvas ออกจาก DOM ด้วย; ล้าง GPU/texture/context ให้หมด
    app.destroy(
      { removeView: true },
      { children: true, texture: true, textureSource: true, context: true },
    );
  };

  return { app, destroy };
}
