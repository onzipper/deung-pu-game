// Full-resolution world-nameplate overlay.
//
// D-065 keeps the world canvas at low resolution + nearest-neighbor upscale. Text rendered into that
// backing canvas permanently loses Thai glyph detail, regardless of the Text texture resolution. This
// second transparent Pixi application renders only sparse world labels at native CSS/DPR resolution.
// The layer stays engine-owned (plain TS + Pixi, no React/world state bridge) and mirrors the scene camera.

import { Application, Container } from "pixi.js";
import type { EngineConfig } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import { entityFootToScreen } from "@/engine/render/placement";

export interface NameplateLayerHandle {
  addEntity(id: string, display: Container, tile: Readonly<TilePoint>): void;
  moveEntity(id: string, tile: Readonly<TilePoint>): void;
  removeEntity(id: string): void;
  syncCamera(world: Container): void;
  setTransitionAlpha(alpha: number): void;
  resize(width: number, height: number): void;
  render(): void;
  destroy(): void;
}

export function resolveNameplateResolution(
  configuredResolution: number | null,
  devicePixelRatio: number | undefined,
): number {
  const candidate = configuredResolution ?? devicePixelRatio ?? 1;
  return Math.max(1, candidate > 0 ? candidate : 1);
}

export async function createNameplateLayer(
  container: HTMLElement,
  config: EngineConfig,
): Promise<NameplateLayerHandle> {
  const app = new Application();
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  const resolution = resolveNameplateResolution(
    config.resolution,
    typeof globalThis !== "undefined" ? globalThis.devicePixelRatio : undefined,
  );

  await app.init({
    backgroundAlpha: 0,
    antialias: true,
    resolution,
    autoDensity: true,
    preference: config.preference,
    powerPreference: config.powerPreference,
    width,
    height,
  });
  app.stop();

  const previousContainerPosition = container.style.position;
  if (!previousContainerPosition) container.style.position = "relative";

  const canvas = app.canvas;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.zIndex = "1";
  canvas.style.pointerEvents = "none";
  canvas.style.imageRendering = "auto";
  container.appendChild(canvas);

  const world = new Container();
  world.eventMode = "none";
  app.stage.eventMode = "none";
  app.stage.addChild(world);

  const entities = new Map<string, Container>();
  const place = (wrapper: Container, tile: Readonly<TilePoint>): void => {
    const screen = entityFootToScreen(tile, config.tileSize);
    wrapper.position.set(screen.sx, screen.sy);
  };

  const removeEntity = (id: string): void => {
    const wrapper = entities.get(id);
    if (!wrapper) return;
    entities.delete(id);
    world.removeChild(wrapper);
    wrapper.destroy({ children: true });
  };

  let destroyed = false;
  return {
    addEntity(id, display, tile): void {
      if (entities.has(id)) throw new Error(`duplicate nameplate entity id: ${id}`);
      const wrapper = new Container();
      wrapper.eventMode = "none";
      wrapper.addChild(display);
      place(wrapper, tile);
      entities.set(id, wrapper);
      world.addChild(wrapper);
    },

    moveEntity(id, tile): void {
      const wrapper = entities.get(id);
      if (wrapper) place(wrapper, tile);
    },

    removeEntity,

    syncCamera(sceneWorld): void {
      world.position.copyFrom(sceneWorld.position);
    },

    setTransitionAlpha(alpha): void {
      app.stage.alpha = 1 - Math.max(0, Math.min(1, alpha));
    },

    resize(nextWidth, nextHeight): void {
      app.renderer.resize(Math.max(1, nextWidth), Math.max(1, nextHeight));
    },

    render(): void {
      if (!destroyed) app.render();
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      for (const id of [...entities.keys()]) removeEntity(id);
      app.destroy(
        { removeView: true },
        { children: true, texture: true, textureSource: true, context: true },
      );
      if (!previousContainerPosition) container.style.position = "";
    },
  };
}
