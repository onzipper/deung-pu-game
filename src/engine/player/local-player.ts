// Local player controller — pixi glue ที่เชื่อม input → movement → scene entity.
// Plain TS + PixiJS เท่านั้น (ห้าม React/Next). แยกชั้น: input (keyboard.ts) + calc (mover.ts /
// direction.ts เป็น pure) + render (scene entity API). ตัว controller นี้แค่ orchestrate + วาด placeholder.
//
// P0-05: player เป็น placeholder graphic (body ellipse + nose marker บอกทิศ facing) —
// sprite/animation จริงมา P0-06 (จะแทน display นี้). เดินด้วย keyboard + collision slide,
// กล้องตาม player.

import { Container, Graphics } from "pixi.js";
import type { EngineConfig } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import { isWalkableTile, type MapConfig } from "@/engine/map/types";
import type { MapSceneHandle } from "@/engine/render/scene";
import { attachKeyboard } from "@/engine/input/keyboard";
import { stepMovement } from "@/engine/movement/mover";
import {
  directionToScreenUnit,
  resolveDirection,
  type Direction,
} from "@/engine/movement/direction";

/** id คงที่ของ local player ใน scene entity layer. */
export const LOCAL_PLAYER_ID = "__local_player__";

/** ทิศเริ่มต้นตอน idle — หันเข้ากล้อง (ลงจอ). */
const INITIAL_FACING: Direction = "S";

export interface LocalPlayerHandle {
  /** ตำแหน่ง foot ปัจจุบัน (read-only view) */
  readonly position: Readonly<TilePoint>;
  /** ทิศ facing ปัจจุบัน (logical) */
  readonly facing: Direction;
  /** เรียกทุก frame ด้วย dt เป็น "วินาที" (ticker.deltaMS/1000) */
  update(dtSeconds: number): void;
  /** ถอด keyboard listener + ลบ entity ออกจาก scene */
  destroy(): void;
}

/** วาด body placeholder: เงาที่เท้า + ตัว ellipse (foot อยู่ที่ local (0,0)). */
function drawBody(config: EngineConfig): Graphics {
  const { style } = config.player;
  const g = new Graphics();
  const hw = style.bodyWidth / 2;
  // เงาที่เท้า (แบน) ช่วยอ่านตำแหน่ง foot บนพื้น
  g.ellipse(0, 0, hw, style.bodyWidth / 4).fill({
    color: 0x000000,
    alpha: 0.25,
  });
  // body ตั้งขึ้นจากเท้า
  g.ellipse(0, -style.bodyHeight / 2, hw, style.bodyHeight / 2)
    .fill({ color: style.bodyColor })
    .stroke({ color: 0x000000, width: 1, alpha: 0.5 });
  return g;
}

/** วาง nose marker (จุดบอกทิศหน้า) ตามทิศ facing รอบกลาง body. */
function drawNose(g: Graphics, config: EngineConfig, dir: Direction): void {
  const { style } = config.player;
  const u = directionToScreenUnit(dir);
  const cx = u.sx * style.noseReach;
  // ยึดรอบกลาง body (−bodyHeight/2); ย่อแกน y ครึ่งหนึ่งให้ดู "เอียงตามพื้น iso"
  const cy = -style.bodyHeight / 2 + u.sy * style.noseReach * 0.5;
  g.clear();
  g.circle(cx, cy, style.noseRadius).fill({ color: style.noseColor });
}

/**
 * สร้าง local player: spawn ที่ map.spawnPoint, snap กล้องมาที่ player, attach keyboard.
 * caller (app.ts) เรียก update(dtSeconds) ทุก frame แล้ว destroy() ตอนปิด engine.
 *
 * @param target EventTarget ของ keyboard (default window) — inject ได้เพื่อเทสต์
 */
export function createLocalPlayer(
  scene: MapSceneHandle,
  map: MapConfig,
  config: EngineConfig,
  target?: EventTarget,
): LocalPlayerHandle {
  const { tileSize, player } = config;
  const pos: TilePoint = { tx: map.spawnPoint.x, ty: map.spawnPoint.y };
  let facing: Direction = INITIAL_FACING;

  const display = new Container();
  const body = drawBody(config);
  const nose = new Graphics();
  display.addChild(body, nose);
  drawNose(nose, config, facing);

  scene.addEntity(LOCAL_PLAYER_ID, display, pos);
  scene.setCameraTarget(pos, true); // กล้องเริ่มที่ player (ไม่กวาดจาก origin)

  const keyboard = attachKeyboard(target);
  const isWalkable = (tx: number, ty: number): boolean =>
    isWalkableTile(map, tx, ty);
  const moveParams = {
    speed: player.speed,
    maxStepSeconds: player.maxStepSeconds,
  };

  return {
    position: pos,
    get facing() {
      return facing;
    },

    update(dtSeconds: number): void {
      const intent = keyboard.getIntent();

      const next = stepMovement(pos, intent, dtSeconds, moveParams, isWalkable);
      if (next.tx !== pos.tx || next.ty !== pos.ty) {
        pos.tx = next.tx;
        pos.ty = next.ty;
        scene.moveEntity(LOCAL_PLAYER_ID, pos);
        scene.setCameraTarget(pos); // follow (lerp ใน scene.update)
      }

      // facing = ทิศที่ "ตั้งใจเดิน" (intent) — กดชนกำแพงก็ยังหันไปทางนั้น; idle คงเดิม
      const nextFacing = resolveDirection(intent, tileSize, facing);
      if (nextFacing !== facing) {
        facing = nextFacing;
        drawNose(nose, config, facing);
      }
    },

    destroy(): void {
      keyboard.detach();
      scene.removeEntity(LOCAL_PLAYER_ID);
    },
  };
}
