// Local player controller — pixi glue ที่เชื่อม input → movement → scene entity.
// Plain TS + PixiJS เท่านั้น (ห้าม React/Next). แยกชั้น: input (keyboard.ts) + calc (mover.ts /
// direction.ts / animation manifest เป็น pure) + render (scene entity + animator). controller นี้ orchestrate.
//
// P0-06: player = **animated sprite** (placeholder generate ด้วยโค้ด) แทน body+nose ของ P0-05.
//   เดิน → walk + ทิศจาก resolveDirection · หยุด → idle คงทิศล่าสุด · 5 ทิศวาด + mirror 3 ทิศ.
//   sprite บอกทิศได้เอง (face marker + accent asymmetry) → ถอด nose marker ออก.

import type { Renderer } from "pixi.js";
import type { EngineConfig } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import { isWalkableTile, type MapConfig } from "@/engine/map/types";
import type { MapSceneHandle } from "@/engine/render/scene";
import { attachKeyboard } from "@/engine/input/keyboard";
import { stepMovement } from "@/engine/movement/mover";
import { resolveDirection, type Direction } from "@/engine/movement/direction";
import { createPlayerAnimationManifest } from "@/engine/animation/manifest";
import { generatePlayerTextures } from "@/engine/animation/player-placeholder";
import {
  createSpriteAnimator,
  type SpriteAnimator,
} from "@/engine/animation/animator";

/** id คงที่ของ local player ใน scene entity layer. */
export const LOCAL_PLAYER_ID = "__local_player__";

/** ทิศเริ่มต้นตอน idle — หันเข้ากล้อง (ลงจอ). */
const INITIAL_FACING: Direction = "S";

/** intent ที่สั้นกว่านี้ (²) ถือว่า "ไม่เดิน" → idle. */
const MOVE_EPS = 1e-9;

export interface LocalPlayerHandle {
  /** ตำแหน่ง foot ปัจจุบัน (read-only view) */
  readonly position: Readonly<TilePoint>;
  /** ทิศ facing ปัจจุบัน (logical) */
  readonly facing: Direction;
  /** animation ปัจจุบัน ("idle"/"walk"/"attack") — P0-07 ใช้ sync ขึ้น server */
  readonly animation: string;
  /** true ระหว่างเล่น attack animation (ยังไม่จบคลิป) — P0-10 combat stub */
  readonly isAttacking: boolean;
  /**
   * consume การกด ATTACK_KEY (Space) ตั้งแต่ครั้งก่อนหน้า — edge-triggered (กันกดค้างสแปม),
   * ส่งต่อจาก keyboard tracker ภายใน (P0-10 combat-stub เรียกทุก frame เพื่อตัดสิน cooldown เอง)
   */
  consumeAttackPressed(): boolean;
  /**
   * เริ่มเล่น attack animation ครั้งเดียว — ล็อก animation="attack" จนจบคลิป
   * (attackFrameDuration × attackFrames จาก PlayerAnimationConfig) แล้วกลับ idle/walk เอง (P0-10).
   */
  triggerAttack(): void;
  /** เรียกทุก frame ด้วย dt เป็น "วินาที" (ticker.deltaMS/1000) */
  update(dtSeconds: number): void;
  /** ถอด keyboard listener + ลบ entity ออกจาก scene + ปล่อย texture */
  destroy(): void;
}

/**
 * สร้าง local player: spawn ที่ map.spawnPoint, snap กล้องมาที่ player, attach keyboard,
 * generate placeholder sprite + animator (5-dir + mirror).
 * caller (app.ts) เรียก update(dtSeconds) ทุก frame แล้ว destroy() ตอนปิด engine.
 *
 * @param renderer pixi renderer (app.renderer) — ใช้ generate placeholder texture
 * @param target EventTarget ของ keyboard (default window) — inject ได้เพื่อเทสต์
 */
export function createLocalPlayer(
  scene: MapSceneHandle,
  map: MapConfig,
  config: EngineConfig,
  renderer: Renderer,
  target?: EventTarget,
): LocalPlayerHandle {
  const { tileSize, player } = config;
  const pos: TilePoint = { tx: map.spawnPoint.x, ty: map.spawnPoint.y };
  let facing: Direction = INITIAL_FACING;
  let animation = "idle";
  // P0-10 combat stub: ระยะเวลาล็อก animation="attack" (ms) = ความยาวคลิปจริงจาก config
  // (attack.loop=false ใน manifest อยู่แล้ว — ตัวจับเวลานี้แค่คืน control ให้ idle/walk ต่อ).
  const attackDurationMs = player.animation.attackFrameDuration * player.animation.attackFrames;
  let attackElapsedMs: number | null = null; // null = ไม่ได้กำลังโจมตี

  // --- animated sprite (P0-06) ---
  const manifest = createPlayerAnimationManifest(player.animation);
  const textures = generatePlayerTextures(
    renderer,
    manifest,
    player.animation.style,
  );
  const animator: SpriteAnimator = createSpriteAnimator(textures, manifest, {
    animation,
    direction: facing,
  });

  scene.addEntity(LOCAL_PLAYER_ID, animator.view, pos);
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
    get animation() {
      return animation;
    },
    get isAttacking() {
      return attackElapsedMs !== null;
    },

    consumeAttackPressed: () => keyboard.consumeAttackPressed(),

    triggerAttack(): void {
      attackElapsedMs = 0; // update() รอบถัดไปจะ lock animation="attack" ทันที
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
      facing = resolveDirection(intent, tileSize, facing);
      // moving = มี intent จริง → walk; ไม่งั้น idle (คงทิศล่าสุด)
      const moving = intent.tx * intent.tx + intent.ty * intent.ty >= MOVE_EPS;

      if (attackElapsedMs !== null) {
        // P0-10: attack ชนะ walk/idle จนจบคลิป — เดินระหว่างโจมตีได้ (position ขยับตามปกติ)
        // แต่ animation ค้าง "attack" ไม่ให้ walk มาแทรก
        attackElapsedMs += dtSeconds * 1000;
        animation = "attack";
        if (attackElapsedMs >= attackDurationMs) attackElapsedMs = null;
      } else {
        animation = moving ? "walk" : "idle";
      }

      animator.setState(animation, facing);
      animator.update(dtSeconds);
    },

    destroy(): void {
      keyboard.detach();
      scene.removeEntity(LOCAL_PLAYER_ID); // destroy sprite view
      animator.destroy(); // ปล่อย texture ที่ generate
    },
  };
}
