// Map scene — pixi render layer for P0-04. Plain TS + PixiJS เท่านั้น (ห้าม React/Next).
//
// หน้าที่: เอา MapConfig → render จริงบน stage —
//   • ground layer (diamond grid + checker fill + blocked tiles) วาด "ครั้งเดียว" ไม่ sort
//   • entity/prop layer = depth-sorted (props + debug/player) — sort เฉพาะเมื่อ dirty
//   • fixed camera + follow (pan worldContainer, clamp ขอบ map)
//   • entity layer API (addEntity/moveEntity/removeEntity) ให้ P0-05/06/09 ใช้ต่อ
//
// แยก calc ออกจาก render: ลำดับ depth = DepthRegistry (pure), camera = camera.ts (pure).
// scene.ts เป็นแค่ "glue" ที่ apply ผล pure → pixi display objects.

import { Application, Container, Graphics, Text } from "pixi.js";
import type { EngineConfig, PropStyle } from "@/engine/config";
import type { ScreenPoint, TilePoint } from "@/engine/iso/coords";
import { tileToScreen } from "@/engine/iso/coords";
import { entityFootToScreen } from "@/engine/render/placement";
import {
  isBlockedTile,
  type MapConfig,
} from "@/engine/map/types";
import {
  clampCameraScreen,
  computeMapScreenBounds,
  lerpTile,
  type ScreenBounds,
} from "@/engine/render/camera";
import { DepthRegistry, type DepthEntry } from "@/engine/render/depth-registry";

/** public handle ของ scene — app.ts / layer ถัดไปคุยผ่านนี้เท่านั้น. */
export interface MapSceneHandle {
  /** container ที่ถูก pan โดยกล้อง (ground + entity อยู่ข้างใน) */
  readonly world: Container;
  /** เรียกทุก frame: follow camera + resort ถ้า dirty. deltaTime = pixi ticker.deltaTime */
  update(deltaTime: number): void;
  /** viewport เปลี่ยน (resize) → เก็บขนาดใหม่ให้ camera clamp ถูก */
  resize(width: number, height: number): void;
  /** ตั้งเป้ากล้อง (tile space); snap=true = กระโดดทันทีไม่ lerp */
  setCameraTarget(tile: TilePoint, snap?: boolean): void;

  // --- entity layer API (P0-05/06/09) ---
  /**
   * เพิ่ม display เข้า entity layer. `tile` = **ตำแหน่ง foot ต่อเนื่อง** (float ได้,
   * basis เดียวกับ depthKey/camera — ไม่ +0.5; อยากกลาง cell ใส่ n+0.5 เอง).
   * display วาดโดยเท้าอยู่ที่ local (0,0). id ซ้ำ → throw.
   */
  addEntity(id: string, display: Container, tile: TilePoint, zLayer?: number): void;
  /** ย้าย entity → foot tile ใหม่ (ต่อเนื่อง, ไม่ +0.5; mark dirty ให้ resort) */
  moveEntity(id: string, tile: TilePoint): void;
  /** ลบ entity + destroy display */
  removeEntity(id: string): void;
  /** จำนวน entity ปัจจุบันใน entity layer (props + player + mob) — P0-11 debug overlay */
  readonly entityCount: number;

  /**
   * เปิด/ปิด depth-debug: เปิด = สร้าง text เล็ก ๆ แสดง depth rank (ลำดับวาด, 0=วาดก่อน)
   * เหนือ entity ทุกตัว, sync ทุกครั้งที่ depth resort (P0-11, P0 §4.10). ปิด = ลบ label ทิ้งหมด
   * ทันที — ไม่มี label ค้าง ไม่กระทบ perf ตอนปิด (ค่าเริ่มต้น = ปิด).
   */
  setDepthDebug(enabled: boolean): void;

  /** เก็บกวาด listener + display + GPU */
  destroy(): void;
}

/**
 * วาด placeholder graphic ของ prop/entity 1 ชิ้น ด้วย foot อยู่ที่ local (0,0)
 * (anchor ที่ "เท้า" → depth ตรงกับตำแหน่ง tile จริง, ของสูงยื่นขึ้น −y ไม่กระทบ sort).
 */
function drawPropGraphic(style: PropStyle): Graphics {
  const g = new Graphics();
  const hw = style.width / 2;
  if (style.shape === "ellipse") {
    g.ellipse(0, -style.height / 2, hw, style.height / 2);
  } else {
    g.rect(-hw, -style.height, style.width, style.height);
  }
  g.fill({ color: style.color });
  g.stroke({ color: 0x000000, width: 1, alpha: 0.4 });
  // จุด foot marker เล็ก ๆ ช่วยเห็นตำแหน่งเท้าเวลา debug depth
  g.circle(0, 0, 1.5).fill({ color: 0x000000, alpha: 0.5 });
  return g;
}

/** เลือก style ตาม propId (ไม่พบ → defaultProp). */
function styleFor(config: EngineConfig, propId: string): PropStyle {
  return config.theme.props[propId] ?? config.theme.defaultProp;
}

/**
 * วาด ground layer ทั้งใบ "ครั้งเดียว" ลง Graphics เดียว:
 * แต่ละ cell = diamond (มุม = tile-integer 4 จุด), checker fill หรือ blocked color,
 * แล้ว stroke เส้น grid. ไม่ต้อง depth sort (พื้นราบ coplanar ไม่ทับกัน).
 */
function buildGround(map: MapConfig, config: EngineConfig): Graphics {
  const g = new Graphics();
  const { tileSize } = config;
  const { width, height } = map.bounds;
  const theme = config.theme;

  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const a = tileToScreen({ tx, ty }, tileSize);
      const b = tileToScreen({ tx: tx + 1, ty }, tileSize);
      const c = tileToScreen({ tx: tx + 1, ty: ty + 1 }, tileSize);
      const d = tileToScreen({ tx, ty: ty + 1 }, tileSize);
      const poly = [a.sx, a.sy, b.sx, b.sy, c.sx, c.sy, d.sx, d.sy];

      const blocked = isBlockedTile(map, tx, ty);
      const fillColor = blocked
        ? theme.blockedColor
        : (tx + ty) % 2 === 0
          ? theme.tileColorA
          : theme.tileColorB;

      g.poly(poly).fill({ color: fillColor });
      g.poly(poly).stroke({
        color: theme.gridLineColor,
        width: 1,
        alpha: theme.gridLineAlpha,
      });
    }
  }
  return g;
}

/**
 * สร้าง map scene พร้อม render. เพิ่ม world container เข้า app.stage ให้เลย.
 * caller (app.ts) รับผิดชอบ ui layer (fps ฯลฯ) แยกต่างหาก + เรียก update/resize/destroy.
 */
export function createMapScene(
  app: Application,
  map: MapConfig,
  config: EngineConfig,
): MapSceneHandle {
  const { tileSize } = config;

  // ── layer tree ─────────────────────────────────────────────────────────
  const world = new Container();
  const ground = buildGround(map, config);
  const entityLayer = new Container();
  // unique zIndex rank ต่อ entity → pixi sort ตรงลำดับ DepthRegistry เป๊ะ (sort เมื่อ zIndex เปลี่ยนเท่านั้น)
  entityLayer.sortableChildren = true;
  // depth-debug label layer (P0-11): sibling ของ entityLayer ใน world เดียวกัน (transform เหมือนกัน
  // → ใช้ local position ของ entity display ตรง ๆ ได้เลย) วาดทับบนสุดเสมอ (เพิ่มทีหลัง entityLayer)
  // — ไม่ใช้ zIndex ร่วมกับระบบ depth sort จริง กัน conflict กับ rank ที่ assign ให้ entity.
  const depthDebugLayer = new Container();
  world.addChild(ground);
  world.addChild(entityLayer);
  world.addChild(depthDebugLayer);
  app.stage.addChild(world);

  const registry = new DepthRegistry<Container>();
  const screenBounds: ScreenBounds = computeMapScreenBounds(map.bounds, tileSize);

  // ── camera state ───────────────────────────────────────────────────────
  const camCurrent: TilePoint = { tx: map.spawnPoint.x, ty: map.spawnPoint.y };
  const camTarget: TilePoint = { tx: map.spawnPoint.x, ty: map.spawnPoint.y };
  let viewport = { width: app.renderer.width, height: app.renderer.height };

  const applyCamera = (): void => {
    // world-screen ของจุดที่กล้องเล็ง → clamp ไม่ให้หลุดขอบ → วาง worldContainer
    const raw: ScreenPoint = tileToScreen(camCurrent, tileSize);
    const clamped = clampCameraScreen(
      raw,
      screenBounds,
      viewport,
      config.camera.edgeMargin,
    );
    world.position.set(
      viewport.width / 2 - clamped.sx,
      viewport.height / 2 - clamped.sy,
    );
  };

  // ── entity placement helper ────────────────────────────────────────────
  // convention: tile = foot ต่อเนื่อง → entityFootToScreen (tileToScreen, ไม่ +0.5).
  // basis เดียวกับ depthKey (tx+ty) และ applyCamera (tileToScreen) → ไม่เหลื่อมครึ่ง tile.
  const placeDisplay = (display: Container, tile: TilePoint): void => {
    const s = entityFootToScreen(tile, tileSize);
    display.position.set(s.sx, s.sy);
  };

  const addEntity = (
    id: string,
    display: Container,
    tile: TilePoint,
    zLayer = 0,
  ): void => {
    registry.add(id, display, tile, zLayer);
    placeDisplay(display, tile);
    entityLayer.addChild(display);
    // dirty → update() รอบถัดไปจะ assign rank
  };

  const moveEntity = (id: string, tile: TilePoint): void => {
    registry.moveEntity(id, tile);
    const entry = registry.get(id);
    if (entry) placeDisplay(entry.display, tile);
  };

  const removeEntity = (id: string): void => {
    const entry = registry.remove(id);
    if (!entry) return;
    entityLayer.removeChild(entry.display);
    entry.display.destroy({ children: true });
    removeDepthLabel(id);
  };

  // ── depth-debug labels (P0-11) ──────────────────────────────────────────
  let depthDebugEnabled = false;
  const depthLabels = new Map<string, Text>();

  const removeDepthLabel = (id: string): void => {
    const label = depthLabels.get(id);
    if (!label) return;
    depthDebugLayer.removeChild(label);
    label.destroy();
    depthLabels.delete(id);
  };

  const clearDepthLabels = (): void => {
    for (const id of [...depthLabels.keys()]) removeDepthLabel(id);
  };

  /** sync label ต่อ entity ตามลำดับ rank ปัจจุบัน — เรียกเฉพาะตอน depthDebugEnabled=true. */
  const updateDepthLabels = (order: readonly DepthEntry<Container>[]): void => {
    const seen = new Set<string>();
    order.forEach((entry, rank) => {
      seen.add(entry.id);
      let label = depthLabels.get(entry.id);
      if (!label) {
        label = new Text({
          text: "",
          style: {
            fill: config.debugOverlay.depthLabelColor,
            fontSize: config.debugOverlay.depthLabelFontSize,
            fontFamily: "monospace",
          },
        });
        depthLabels.set(entry.id, label);
        depthDebugLayer.addChild(label);
      }
      label.text = String(rank);
      // local space เดียวกับ entry.display (sibling ใน world) — ลอยเหนือ foot ตาม offset config
      label.position.set(
        entry.display.position.x - label.width / 2,
        entry.display.position.y + config.debugOverlay.depthLabelOffsetY,
      );
    });
    // ลบ label ของ entity ที่หลุด order (ไม่ควรเกิด เพราะ removeEntity ลบเองแล้ว — กันเหนียว)
    for (const id of [...depthLabels.keys()]) {
      if (!seen.has(id)) removeDepthLabel(id);
    }
  };

  // ── seed props จาก config (เป็น entity depth-sorted) ────────────────────
  map.props.forEach((prop, i) => {
    const g = drawPropGraphic(styleFor(config, prop.propId));
    addEntity(`prop:${prop.propId}:${i}`, g, prop.tile, prop.zLayer ?? 0);
  });

  // entity แบบ dynamic (local player, mob) มาจาก layer ถัดไปผ่าน addEntity/moveEntity
  // (P0-05 local player: src/engine/player/local-player.ts).

  applyCamera();
  // apply rank เริ่มต้นทันที (ก่อน frame แรก) เพื่อ initial paint ถูกลำดับ
  syncDepth();

  function syncDepth(): void {
    if (!registry.isDirty()) return;
    const order = registry.sorted();
    for (let i = 0; i < order.length; i++) {
      order[i].display.zIndex = i;
    }
    if (depthDebugEnabled) updateDepthLabels(order);
  }

  // ── public handle ──────────────────────────────────────────────────────
  return {
    world,

    update(deltaTime: number): void {
      // calc: follow camera (lerp เข้าเป้า)
      const next = lerpTile(camCurrent, camTarget, config.camera.followLerp);
      camCurrent.tx = next.tx;
      camCurrent.ty = next.ty;
      void deltaTime; // P0: lerp ไม่ scale ตาม dt (deltaTime นิ่งพอ) — เก็บ param ไว้เผื่อ P1
      // render: apply
      applyCamera();
      syncDepth();
    },

    resize(width: number, height: number): void {
      viewport = { width, height };
      app.stage.hitArea = app.screen;
      applyCamera();
    },

    setCameraTarget(tile: TilePoint, snap = false): void {
      camTarget.tx = tile.tx;
      camTarget.ty = tile.ty;
      if (snap) {
        camCurrent.tx = tile.tx;
        camCurrent.ty = tile.ty;
        applyCamera();
      }
    },

    addEntity,
    moveEntity,
    removeEntity,
    get entityCount(): number {
      return registry.size;
    },

    setDepthDebug(enabled: boolean): void {
      depthDebugEnabled = enabled;
      if (!enabled) {
        clearDepthLabels();
        return;
      }
      // เปิด: วาด label ทันทีจากลำดับปัจจุบัน ไม่ต้องรอ dirty รอบหน้า
      updateDepthLabels(registry.sorted());
    },

    destroy(): void {
      clearDepthLabels();
      registry.clear();
      world.destroy({ children: true });
    },
  };
}
