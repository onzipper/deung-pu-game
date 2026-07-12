// Local player controller — pixi glue ที่เชื่อม input → movement → scene entity.
// Plain TS + PixiJS เท่านั้น (ห้าม React/Next). แยกชั้น: input (keyboard.ts) + calc (mover.ts /
// direction.ts / astar.ts / path-follower.ts เป็น pure) + render (scene entity + animator). controller นี้ orchestrate.
//
// P0-06: player = **animated sprite** (placeholder generate ด้วยโค้ด) แทน body+nose ของ P0-05.
//   เดิน → walk + ทิศจาก resolveDirection · หยุด → idle คงทิศล่าสุด · 5 ทิศวาด + mirror 3 ทิศ.
//   sprite บอกทิศได้เอง (face marker + accent asymmetry) → ถอด nose marker ออก.
//
// P1-09: click-to-move + touch (L11). คลิก/แตะพื้น → moveTo(footTile) → A* หา path (integer cell) →
//   เดินตาม waypoints ด้วย stepMovement เดิม (ความเร็ว/collision เดียวกับ WASD → server validate ผ่านเหมือนกัน).
//   WASD กดแทรก = **manual override ชนะเสมอ** (ยกเลิก path ทันที). marker จุดหมายลอย + fade (cosmetic).
//   dynamic obstacle ขวางกลางทาง → replan A* ไป goal เดิม (config.replanOnBlock) หรือหยุด.
//   walk-to-attack: faceToward(tile) + requestAttack() ให้ caller (app.ts) ใช้ตอนแตะมอน (เท่ากับกด Space).

import { Graphics, type Renderer } from "pixi.js";
import type { EngineConfig } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import { isWalkableTile, type MapConfig } from "@/engine/map/types";
import type { MapSceneHandle } from "@/engine/render/scene";
import { attachKeyboard } from "@/engine/input/keyboard";
import { stepMovement } from "@/engine/movement/mover";
import { resolveDirection, type Direction } from "@/engine/movement/direction";
import { findPath } from "@/engine/pathfinding/astar";
import { planCorrectionResume } from "@/engine/player/correction-resume";
import {
  advancePathFollower,
  type PathFollowParams,
  type PathFollowState,
} from "@/engine/movement/path-follower";
import { createPlayerAnimationManifest } from "@/engine/animation/manifest";
import { generatePlayerTextures } from "@/engine/animation/player-placeholder";
import {
  createSpriteAnimator,
  type SpriteAnimator,
} from "@/engine/animation/animator";

/** id คงที่ของ local player ใน scene entity layer. */
export const LOCAL_PLAYER_ID = "__local_player__";
/** id ของ marker จุดหมาย click-to-move (P1-09). */
const MARKER_ID = "__local_player_marker__";
/** zLayer ของ marker — ใต้ entity ปกติ (ground destination marker), depthKey band แยก (depth.ts). */
const MARKER_ZLAYER = -1;

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
  /** true ระหว่างมี path click-to-move ที่ยังเดินไม่จบ (P1-09) — caller เช็คเพื่อ walk-to-attack. */
  readonly isFollowingPath: boolean;
  /**
   * true เฉพาะเฟรมล่าสุดที่มี WASD/arrow intent (manual override) — caller (app.ts P1-09.1 continuous
   * walk-to-attack) ใช้ยกเลิก target engagement ทันทีเมื่อผู้เล่นเข้าคุมเอง (manual override ชนะเสมอ,
   * pattern เดียวกับที่ update() ใช้ยกเลิก click-to-move path).
   */
  readonly manualInputActive: boolean;
  /**
   * consume การกด ATTACK_KEY (Space) หรือ requestAttack() ตั้งแต่ครั้งก่อนหน้า — edge-triggered
   * (กันกดค้างสแปม). P1-09: รวม programmatic attack (tap mob) เข้าช่องเดียวกับ Space → cooldown gate เดียว.
   */
  consumeAttackPressed(): boolean;
  /** P1-09: ขอโจมตี 1 ครั้งแบบ programmatic (tap mob = เท่ากับ Space) — combat-stub gate cooldown ต่อ. */
  requestAttack(): void;
  /** P1-09: หันหน้าไปทาง tile (walk-to-attack — เล็งมอนก่อนตีแม้ยืนนิ่ง). ทิศ ~0 → คงเดิม. */
  faceToward(tile: TilePoint): void;
  /**
   * P1-09: click-to-move — หา path A* จากตำแหน่งปัจจุบันไป goal (foot ต่อเนื่อง) แล้วเดินตาม.
   * คืน true ถ้ามี path (รวม "อยู่ที่ goal แล้ว"); false ถ้าเดินไม่ถึง (คลิกกำแพง/นอกขอบ) → ไม่ทำอะไร.
   * เรียกซ้ำ = replan (คลิกใหม่ทับ). แสดง marker จุดหมายเมื่อมี path.
   */
  moveTo(goal: TilePoint): boolean;
  /** P1-09: ยกเลิก path ที่กำลังเดิน (manual override / interrupt). marker ปล่อย fade ต่อเอง. */
  cancelPath(): void;
  /**
   * เริ่มเล่น attack animation ครั้งเดียว — ล็อก animation="attack" จนจบคลิป
   * (attackFrameDuration × attackFrames จาก PlayerAnimationConfig) แล้วกลับ idle/walk เอง (P0-10).
   */
  triggerAttack(): void;
  /**
   * snap local player ไปตำแหน่ง authoritative จาก server (P1-02 reconcile, TA §16.3).
   * ใช้เมื่อได้ MSG_POSITION_CORRECTION — เขียนทับ position + ย้าย entity + snap กล้อง.
   * reconcile แบบง่าย (snap เฉย ๆ, ไม่ rewind-replay input) — พอสำหรับ P1-02.
   */
  applyCorrection(tx: number, ty: number): void;
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
  const { tileSize, player, pathfinding } = config;
  const pos: TilePoint = { tx: map.spawnPoint.x, ty: map.spawnPoint.y };
  let facing: Direction = INITIAL_FACING;
  let animation = "idle";
  // P0-10 combat stub: ระยะเวลาล็อก animation="attack" (ms) = ความยาวคลิปจริงจาก config
  // (attack.loop=false ใน manifest อยู่แล้ว — ตัวจับเวลานี้แค่คืน control ให้ idle/walk ต่อ).
  const attackDurationMs = player.animation.attackFrameDuration * player.animation.attackFrames;
  let attackElapsedMs: number | null = null; // null = ไม่ได้กำลังโจมตี
  let clickAttackPending = false; // P1-09 programmatic attack (tap mob) — edge-triggered เหมือน Space

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
  const pathParams: PathFollowParams = {
    speed: player.speed,
    maxStepSeconds: player.maxStepSeconds,
    arrivalRadius: pathfinding.arrivalRadius,
  };

  // --- P1-09 click-to-move state ---
  let follow: PathFollowState | null = null; // path ที่กำลังเดิน (null = ไม่มี)
  let pathGoal: TilePoint | null = null; // goal foot ล่าสุด (สำหรับ replan)
  let marker: Graphics | null = null;
  let markerElapsedMs = 0;
  let manualInputActive = false; // set ทุก frame ใน update() — true = มี WASD intent เฟรมนี้

  const removeMarker = (): void => {
    if (!marker) return;
    scene.removeEntity(MARKER_ID); // destroy graphics
    marker = null;
  };

  const showMarker = (foot: TilePoint): void => {
    removeMarker();
    const style = pathfinding.marker;
    const g = new Graphics();
    g.circle(0, 0, style.radius).fill({ color: style.color, alpha: style.alpha });
    g.circle(0, 0, style.radius).stroke({
      color: style.color,
      alpha: Math.min(1, style.alpha + 0.25),
      width: 1,
    });
    scene.addEntity(MARKER_ID, g, foot, MARKER_ZLAYER);
    marker = g;
    markerElapsedMs = 0;
  };

  const clearPath = (): void => {
    follow = null;
    pathGoal = null;
  };

  /** ย้าย entity + follow กล้อง เมื่อ pos เปลี่ยน. คืน true ถ้าขยับจริง. */
  const applyMove = (next: TilePoint): boolean => {
    if (next.tx === pos.tx && next.ty === pos.ty) return false;
    pos.tx = next.tx;
    pos.ty = next.ty;
    scene.moveEntity(LOCAL_PLAYER_ID, pos);
    scene.setCameraTarget(pos); // follow (lerp ใน scene.update)
    return true;
  };

  /**
   * replan A* ไป goal เดิมจากตำแหน่งปัจจุบัน (ตอน blocked mid-path หรือหลัง server correction).
   * "walk" → เดินต่อ (คง pathGoal เดิม) · "idle"/"stop" → เลิกเดิน. reuse planCorrectionResume (pure).
   */
  const replanToGoal = (): void => {
    const plan = planCorrectionResume(pos, pathGoal, isWalkable, {
      maxSearchNodes: pathfinding.maxSearchNodes,
    });
    if (plan.action === "walk") {
      follow = { waypoints: plan.waypoints, index: 0 };
    } else {
      clearPath(); // idle (ไม่มี goal) / stop (goal เดินไม่ถึง) → หยุด
    }
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
    get isFollowingPath() {
      return follow !== null;
    },
    get manualInputActive() {
      return manualInputActive;
    },

    consumeAttackPressed() {
      const kb = keyboard.consumeAttackPressed();
      const click = clickAttackPending;
      clickAttackPending = false;
      return kb || click;
    },

    requestAttack(): void {
      clickAttackPending = true;
    },

    faceToward(tile: TilePoint): void {
      facing = resolveDirection(
        { tx: tile.tx - pos.tx, ty: tile.ty - pos.ty },
        tileSize,
        facing,
      );
    },

    moveTo(goal: TilePoint): boolean {
      const path = findPath(pos, goal, isWalkable, {
        maxSearchNodes: pathfinding.maxSearchNodes,
      });
      if (!path) return false; // เดินไม่ถึง (คลิกกำแพง/นอกขอบ) — ไม่ทำอะไร
      showMarker(goal);
      if (path.length === 0) {
        clearPath(); // อยู่ cell เดียวกับ goal แล้ว — ไม่ต้องเดิน (marker โชว์เฉย ๆ)
        return true;
      }
      follow = { waypoints: path, index: 0 };
      pathGoal = { tx: goal.tx, ty: goal.ty };
      return true;
    },

    cancelPath(): void {
      clearPath();
    },

    triggerAttack(): void {
      attackElapsedMs = 0; // update() รอบถัดไปจะ lock animation="attack" ทันที
    },

    applyCorrection(tx: number, ty: number): void {
      // P1-02: server สั่ง snap กลับ — เขียนทับ position ทันที (ไม่ interpolate: correction = truth)
      pos.tx = tx;
      pos.ty = ty;
      scene.moveEntity(LOCAL_PLAYER_ID, pos);
      scene.setCameraTarget(pos, true); // snap กล้องตาม (ไม่ lerp ไปหาตำแหน่งใหม่)
      // Prod fix 2026-07-12: correction แล้ว **ไม่ทิ้ง goal** — ถ้ากำลังเดินตาม path (click-to-move /
      // walk-to-attack chase) → replan A* จากตำแหน่งใหม่ไป goal เดิม → เดินต่อ (แก้ "กระตุกแล้วหยุด ไม่
      // ถึงจุดที่คลิก"). ไม่มี goal (WASD/manual / fresh join) → no-op ล้าง path. reconnect กลาง walk →
      // resume goal เดิม (สอดคล้อง decision "ค้างออนไลน์"). replan ไม่ถึง → clearPath (เหมือนเดิม).
      replanToGoal();
    },

    update(dtSeconds: number): void {
      const intent = keyboard.getIntent();
      const manual = intent.tx * intent.tx + intent.ty * intent.ty >= MOVE_EPS;
      manualInputActive = manual;

      // facingIntent = เวกเตอร์ที่ใช้ตัดสิน facing; moving = จะเล่น walk anim ไหม
      let facingIntent: TilePoint = { tx: 0, ty: 0 };
      let moving = false;

      if (manual) {
        // WASD กดแทรก = manual override ชนะเสมอ → ยกเลิก path
        clearPath();
        applyMove(stepMovement(pos, intent, dtSeconds, moveParams, isWalkable));
        facingIntent = intent; // กดชนกำแพงก็ยังหันไปทางนั้น (พฤติกรรมเดิม)
        moving = true;
      } else if (follow) {
        const r = advancePathFollower(pos, follow, dtSeconds, pathParams, isWalkable);
        follow.index = r.index;
        applyMove(r.pos);
        facingIntent = r.heading;
        moving = true; // ยังมี path = เดินอยู่ (walk anim)
        if (r.arrived) {
          clearPath();
        } else if (r.blocked) {
          if (pathfinding.replanOnBlock) replanToGoal();
          else clearPath();
        }
      }

      // facing = ทิศที่ตั้งใจเดิน (idle คงหน้าเดิม เพราะ resolveDirection คืน last เมื่อ vec ~0)
      facing = resolveDirection(facingIntent, tileSize, facing);

      if (attackElapsedMs !== null) {
        // P0-10: attack ชนะ walk/idle จนจบคลิป — เดินระหว่างโจมตีได้ (position ขยับตามปกติ)
        attackElapsedMs += dtSeconds * 1000;
        animation = "attack";
        if (attackElapsedMs >= attackDurationMs) attackElapsedMs = null;
      } else {
        animation = moving ? "walk" : "idle";
      }

      animator.setState(animation, facing);
      animator.update(dtSeconds);

      // marker fade (cosmetic) — fade อิสระจาก path (โชว์จุดที่คลิกล่าสุดชั่วครู่)
      if (marker) {
        markerElapsedMs += dtSeconds * 1000;
        const dur = pathfinding.marker.fadeDurationMs;
        if (dur <= 0 || markerElapsedMs >= dur) {
          removeMarker();
        } else {
          // fade 1→0 คูณกับ baked fill alpha (style.alpha) — ไม่ double-apply
          marker.alpha = 1 - markerElapsedMs / dur;
        }
      }
    },

    destroy(): void {
      keyboard.detach();
      removeMarker();
      scene.removeEntity(LOCAL_PLAYER_ID); // destroy sprite view
      animator.destroy(); // ปล่อย texture ที่ generate
    },
  };
}
