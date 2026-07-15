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

import { Container, Graphics, type Renderer } from "pixi.js";
import type { EngineConfig } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import { isWalkableTile, type MapConfig } from "@/engine/map/types";
import type { MapSceneHandle } from "@/engine/render/scene";
import { attachKeyboard } from "@/engine/input/keyboard";
import { joystickIntent } from "@/engine/input/joystick";
import { stepMovement } from "@/engine/movement/mover";
import { resolveDirection, type Direction } from "@/engine/movement/direction";
import { findPath } from "@/engine/pathfinding/astar";
import { planCorrectionResume } from "@/engine/player/correction-resume";
import {
  advancePathFollower,
  type PathFollowParams,
  type PathFollowState,
} from "@/engine/movement/path-follower";
import {
  createPlayerAnimationManifest,
  type AnimationManifest,
} from "@/engine/animation/manifest";
import { generatePlayerTextures } from "@/engine/animation/player-placeholder";
import type { EntityTextureSet } from "@/engine/animation/texture-set";
import type { AssetRegistry } from "@/engine/assets/registry";
import {
  createSpriteAnimator,
  type SpriteAnimator,
} from "@/engine/animation/animator";
import { afkLabelOffsetY, createAfkLabel, updateAfkLabel } from "@/engine/render/afk-label";
import {
  createNameLabel,
  setNameLabelText,
  updateNameLabel,
} from "@/engine/render/name-label";
import type { NameplateLayerHandle } from "@/engine/render/nameplate-layer";

/** anim ที่ player ต้องมีครบใน atlas ก่อนใช้แทน placeholder (attack ล็อกทับ walk/idle ตอนโจมตี). */
const PLAYER_REQUIRED_ANIMS = ["idle", "walk", "attack"] as const;
function playerAtlasUsable(m: AnimationManifest): boolean {
  return PLAYER_REQUIRED_ANIMS.every((a) => a in m.animations);
}

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
   * PR1 character authority: lock local prediction while the server-side automation controller owns this
   * same actor. Unlocking does not synthesize input; a later player action may control the actor normally.
   */
  setAuthorityLocked(locked: boolean): void;
  /**
   * consume การกด ATTACK_KEY (Space) หรือ requestAttack() ตั้งแต่ครั้งก่อนหน้า — edge-triggered
   * (กันกดค้างสแปม). P1-09: รวม programmatic attack (tap mob) เข้าช่องเดียวกับ Space → cooldown gate เดียว.
   */
  consumeAttackPressed(): boolean;
  /**
   * A3 hotbar: consume การกดปุ่มสกิล (Digit1-4) ตั้งแต่ครั้งก่อน — edge-triggered, คืน slot (1-4) ที่กดล่าสุด
   * หรือ null. delegate ไป keyboard tracker (app.ts poll ต่อเฟรมแล้วเรียก castSlot).
   */
  consumeSlotPressed(): number | null;
  /** P1-09: ขอโจมตี 1 ครั้งแบบ programmatic (tap mob = เท่ากับ Space) — combat-stub gate cooldown ต่อ. */
  requestAttack(): void;
  /** P1-09: หันหน้าไปทาง tile (walk-to-attack — เล็งมอนก่อนตีแม้ยืนนิ่ง). ทิศ ~0 → คงเดิม. */
  faceToward(tile: TilePoint): void;
  /**
   * P2-15: ตั้ง/ล้าง intent เดินจาก virtual joystick (touch, มือถือ). vec = เวกเตอร์ screen-space
   * (dx=ขวา+, dy=ลง+, สัดส่วน ~[-1,1] ของรัศมี joystick); null = ปล่อยนิ้ว = หยุด. update() รวม intent นี้
   * กับ keyboard.getIntent() (ทิศเดียวกับ WASD) แล้ว stepMovement เดิม — เป็น manual override ชนะ click-to-move
   * เหมือน WASD. imperative command (UI → engine ผ่าน EngineHandle.player) ไม่ผ่าน React state.
   */
  setMoveVector(vec: { dx: number; dy: number } | null): void;
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
  /** Apply the complete server presentation of this actor while Character Autonomy owns it. */
  applyAuthorityState(
    tx: number,
    ty: number,
    direction: Direction,
    animation: "idle" | "walk",
  ): void;
  /**
   * P2-13 (D-056): เปิด/ปิดป้าย "AFK" ของตัวเอง (server ตั้ง isAfk เมื่อ idle ครบ idleIndicatorSec) —
   * caller (app.ts) เรียกจาก net onSelfAfkChange. display-only, ไม่กระทบ input/movement.
   */
  setAfk(isAfk: boolean): void;
  /**
   * NAMEPLATES: ตั้งชื่อตัวละครบนป้ายเหนือหัวตัวเอง — caller (app.ts) เรียกจาก net onSelfName (self
   * PlayerState.name sync). ชื่อว่าง = ซ่อนป้าย. อาจมาหลัง construction (รอ schema) → set ตอนมา, ไม่ก่อน.
   */
  setName(name: string): void;
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
  registry?: AssetRegistry,
  nameplates?: NameplateLayerHandle,
  target?: EventTarget,
): LocalPlayerHandle {
  const { tileSize, player, pathfinding, input } = config;
  const pos: TilePoint = { tx: map.spawnPoint.x, ty: map.spawnPoint.y };
  let facing: Direction = INITIAL_FACING;
  let animation = "idle";
  // P0-10 combat stub: ระยะเวลาล็อก animation="attack" (ms) = ความยาวคลิปจริงจาก config
  // (attack.loop=false ใน manifest อยู่แล้ว — ตัวจับเวลานี้แค่คืน control ให้ idle/walk ต่อ).
  const attackDurationMs = player.animation.attackFrameDuration * player.animation.attackFrames;
  let attackElapsedMs: number | null = null; // null = ไม่ได้กำลังโจมตี
  let clickAttackPending = false; // P1-09 programmatic attack (tap mob) — edge-triggered เหมือน Space
  let authorityLocked = false;

  // --- animated sprite (P0-06 placeholder / P3 atlas art ถ้ามี assetId + โหลดสำเร็จ) ---
  // มี assetId + peek เจอ + anim ครบ → ใช้ atlas (manifest/anchor/texture ของ atlas เอง); ไม่งั้น placeholder.
  // animator.destroy() เรียก textures.destroy() เสมอ — atlas set เป็น non-owning (no-op) จึงปลอดภัยทั้งสองทาง.
  const atlasId = player.animation.style.assetId;
  const atlas = atlasId ? (registry?.peek(atlasId) ?? null) : null;
  let manifest: AnimationManifest;
  let textures: EntityTextureSet;
  if (atlas && playerAtlasUsable(atlas.manifest)) {
    manifest = atlas.manifest;
    textures = atlas.textures;
  } else {
    if (atlas) {
      console.warn(
        `[player] atlas "${atlasId}" ขาด idle/walk/attack — ใช้ placeholder`,
      );
    }
    manifest = createPlayerAnimationManifest(player.animation);
    textures = generatePlayerTextures(renderer, manifest, player.animation.style);
  }
  const animator: SpriteAnimator = createSpriteAnimator(textures, manifest, {
    animation,
    direction: facing,
  });

  scene.addEntity(LOCAL_PLAYER_ID, animator.view, pos);
  scene.setCameraTarget(pos, true); // กล้องเริ่มที่ player (ไม่กวาดจาก origin)

  // P2-13 (D-056): ป้าย "AFK" ของตัวเอง — full-res nameplate layer เมื่อมี, sprite child เป็น fallback.
  const afkOffsetY = afkLabelOffsetY(player.animation.style.bodyHeight, player.animation.style.walkBob);
  const afkLabel = createAfkLabel(player.animation.style.bodyHeight, player.animation.style.walkBob);
  let afk = false;

  // NAMEPLATES: overlay แยกคง glyph ไทยไว้เต็ม resolution; fallback เดิมยังรองรับ caller ที่ไม่ส่ง layer.
  const nameLabel = createNameLabel(afkOffsetY, player.nameplate);
  if (nameplates) {
    const labelGroup = new Container();
    labelGroup.addChild(afkLabel);
    labelGroup.addChild(nameLabel);
    nameplates.addEntity(LOCAL_PLAYER_ID, labelGroup, pos);
  } else {
    animator.view.addChild(afkLabel);
    animator.view.addChild(nameLabel);
  }

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
  let manualInputActive = false; // set ทุก frame ใน update() — true = มี WASD/joystick intent เฟรมนี้
  let moveVector: { dx: number; dy: number } | null = null; // P2-15 joystick (touch) — null = ปล่อยนิ้ว

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
    nameplates?.moveEntity(LOCAL_PLAYER_ID, pos);
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

  const snapPosition = (tx: number, ty: number): void => {
    pos.tx = tx;
    pos.ty = ty;
    scene.moveEntity(LOCAL_PLAYER_ID, pos);
    nameplates?.moveEntity(LOCAL_PLAYER_ID, pos);
    scene.setCameraTarget(pos, true);
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

    setAuthorityLocked(locked: boolean): void {
      // Consume edge-triggered input on both sides of the handoff so a key pressed under automation can never
      // replay as a synthetic command after authority returns to the player.
      keyboard.consumeAttackPressed();
      keyboard.consumeSlotPressed();
      authorityLocked = locked;
      if (!locked) return;
      moveVector = null;
      manualInputActive = false;
      clickAttackPending = false;
      attackElapsedMs = null;
      animation = "idle";
      clearPath();
    },

    consumeAttackPressed() {
      const kb = keyboard.consumeAttackPressed();
      const click = clickAttackPending;
      clickAttackPending = false;
      return authorityLocked ? false : kb || click;
    },

    consumeSlotPressed() {
      const slot = keyboard.consumeSlotPressed(); // A3: Digit1-4 (edge-triggered)
      return authorityLocked ? null : slot;
    },

    requestAttack(): void {
      if (authorityLocked) return;
      clickAttackPending = true;
    },

    faceToward(tile: TilePoint): void {
      if (authorityLocked) return;
      facing = resolveDirection(
        { tx: tile.tx - pos.tx, ty: tile.ty - pos.ty },
        tileSize,
        facing,
      );
    },

    setMoveVector(vec: { dx: number; dy: number } | null): void {
      moveVector = authorityLocked ? null : vec; // อ่าน+แปลงเป็น intent ใน update() (พร้อม keyboard) — ทิศเดียวกับ WASD
    },

    moveTo(goal: TilePoint): boolean {
      if (authorityLocked) return false;
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
      if (authorityLocked) return;
      attackElapsedMs = 0; // update() รอบถัดไปจะ lock animation="attack" ทันที
    },

    setAfk(isAfk: boolean): void {
      afk = isAfk; // ป้ายถูก toggle จริงใน update() (พร้อม counter-flip)
    },

    setName(name: string): void {
      setNameLabelText(nameLabel, name); // โชว์/ซ่อนตามชื่อ; counter-flip ทำใน update()
    },

    applyCorrection(tx: number, ty: number): void {
      // P1-02: server สั่ง snap กลับ — เขียนทับ position ทันที (ไม่ interpolate: correction = truth)
      snapPosition(tx, ty); // snap กล้องตาม (ไม่ lerp ไปหาตำแหน่งใหม่)
      // Prod fix 2026-07-12: correction แล้ว **ไม่ทิ้ง goal** — ถ้ากำลังเดินตาม path (click-to-move /
      // walk-to-attack chase) → replan A* จากตำแหน่งใหม่ไป goal เดิม → เดินต่อ (แก้ "กระตุกแล้วหยุด ไม่
      // ถึงจุดที่คลิก"). ไม่มี goal (WASD/manual / fresh join) → no-op ล้าง path. reconnect กลาง walk →
      // resume goal เดิม (สอดคล้อง decision "ค้างออนไลน์"). replan ไม่ถึง → clearPath (เหมือนเดิม).
      if (authorityLocked) clearPath();
      else replanToGoal();
    },

    applyAuthorityState(
      tx: number,
      ty: number,
      direction: Direction,
      nextAnimation: "idle" | "walk",
    ): void {
      snapPosition(tx, ty);
      clearPath();
      attackElapsedMs = null;
      facing = direction;
      animation = nextAnimation;
      animator.setState(animation, facing);
    },

    update(dtSeconds: number): void {
      if (authorityLocked) {
        keyboard.consumeAttackPressed();
        keyboard.consumeSlotPressed();
        manualInputActive = false;
        animator.setState(animation, facing);
        animator.update(dtSeconds);
        return;
      }
      // P2-15: รวม intent WASD + joystick (touch) — ทั้งคู่เป็น tile-space basis เดียวกัน (ดู joystick.ts).
      const kb = keyboard.getIntent();
      const joy = moveVector
        ? joystickIntent(moveVector.dx, moveVector.dy, input.joystick.deadzone)
        : { tx: 0, ty: 0 };
      const intent: TilePoint = { tx: kb.tx + joy.tx, ty: kb.ty + joy.ty };
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
      // P2-13 (D-056): toggle ป้าย AFK + counter-flip กัน mirror (หลัง setState — view.scale.x อาจเพิ่ง flip)
      if (nameplates) {
        afkLabel.visible = afk;
      } else {
        updateAfkLabel(afkLabel, animator.view, afk);
        // NAMEPLATES: counter-flip ป้ายชื่อกัน mirror (visible คุมด้วย setName แล้ว)
        updateNameLabel(nameLabel, animator.view);
      }

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
      nameplates?.removeEntity(LOCAL_PLAYER_ID);
      scene.removeEntity(LOCAL_PLAYER_ID); // destroy sprite view
      animator.destroy(); // ปล่อย texture ที่ generate
    },
  };
}
