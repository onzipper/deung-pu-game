// Remote player manager — pixi glue (P0-07, interpolation buffer P1-01). Plain TS + PixiJS เท่านั้น (ห้าม React/Next).
// รับ net event (add/change/remove) → สร้าง/ขยับ/ลบ "ผู้เล่นคนอื่น" ใน scene entity layer
//   ด้วย animator ตัวเดียวกับ local player (5-dir + mirror) แต่ **สีต่าง** (config.net.remotePlayerColor)
//   เพื่อแยกตัวเรา/คนอื่นด้วยตา (P0_SCOPE_LOCK §4.6 "other players visible").
//
// การขยับ remote (P1-01, TA §6): เปลี่ยนจาก "lerp ง่าย ๆ" (P0-07) → **snapshot interpolation buffer**.
//   - onChange/onAdd → push snapshot เข้า buffer พร้อม stamp เวลารับ (monotonic clock).
//   - ticker → sampleAt(now − bufferMs) → ตำแหน่ง render ย้อนหลัง ~100–150ms → smooth แม้ broadcast ~12Hz.
//   pure logic ทั้งหมดอยู่ใน interpolation.ts; ที่นี่คือ glue (buffer ↔ scene entity ↔ animator).
//
// lifecycle texture: generate ต่อ remote (N เล็กมากใน P0 = 30 CCU cap) → destroy สะอาดตอน remove.
//   P1 TODO: share texture atlas / pool (tech §11 pooling) แทน generate ต่อคน.
//
// owner report "เราไม่เห็นคนอื่นกำลังโจมตีจากจอเรา": wire anim (coerceAnim ใน sync.ts) whitelist แค่
// "idle"|"walk" — attack ไม่เคยข้าม position sync (ตั้งใจ, ดู remote-attack.ts header). แก้ด้วย
// **event-driven** แทน: caller (app.ts) เรียก playAttack(sessionId) ทุกครั้งที่ได้ MSG_SKILL_RESULT จาก
// caster ที่ไม่ใช่ตัวเอง → ล็อกคลิป attack ชั่วคราว (timing pure ใน remote-attack.ts, pattern เดียวกับ
// local-player.ts triggerAttack) แล้วคืน control ให้ anim จาก interpolation sample ต่อ (idle/walk).

import type { Renderer, Text } from "pixi.js";
import type { EngineConfig } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import type { MapSceneHandle } from "@/engine/render/scene";
import type { PlayerSnapshot } from "@/shared/net-protocol";
import { createAfkLabel, updateAfkLabel } from "@/engine/render/afk-label";
import {
  createInterpolationBuffer,
  type InterpolationBuffer,
} from "@/engine/net/interpolation";
import {
  advanceRemoteAttack,
  createRemoteAttackState,
  triggerRemoteAttack,
  type RemoteAttackState,
} from "@/engine/net/remote-attack";
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
import type { Direction } from "@/engine/movement/direction";

/** anim ที่ต้องมีครบใน atlas ก่อนใช้แทน placeholder (attack ล็อกทับตอน playAttack). */
const PLAYER_REQUIRED_ANIMS = ["idle", "walk", "attack"] as const;
function playerAtlasUsable(m: AnimationManifest): boolean {
  return PLAYER_REQUIRED_ANIMS.every((a) => a in m.animations);
}

/** prefix ของ entity id ฝั่ง remote — กันชนกับ local player / prop id ใน scene registry. */
const REMOTE_ID_PREFIX = "remote:";

/** ตำแหน่งเปลี่ยนน้อยกว่านี้ (tile) ถือว่านิ่ง → ไม่เรียก moveEntity ซ้ำ (กัน depth resort ฟรี ๆ). */
const MOVE_EPSILON = 1e-4;

interface RemoteEntry {
  animator: SpriteAnimator;
  /** snapshot buffer ต่อ entity — หัวใจ interpolation (pure logic ใน interpolation.ts) */
  buffer: InterpolationBuffer;
  /** ตำแหน่งที่ render อยู่จริง (จาก sampleAt) — คงไว้ตอน buffer ว่างชั่วคราว */
  current: TilePoint;
  facing: Direction;
  anim: string;
  /** attack animation timer (event-driven, ดู remote-attack.ts) — ไม่เกี่ยวกับ wire anim/interpolation */
  attack: RemoteAttackState;
  /** P2-13 (D-056): ป้าย "AFK" (child ของ animator.view) — destroy พร้อม view ตอน removeEntity. */
  label: Text;
  /** P2-13: AFK flag ล่าสุดจาก snapshot (discrete, ไม่ interpolate ผ่าน buffer) */
  afk: boolean;
}

export interface RemotePlayerManager {
  onPlayerAdd(sessionId: string, snap: PlayerSnapshot): void;
  onPlayerChange(sessionId: string, snap: PlayerSnapshot): void;
  onPlayerRemove(sessionId: string): void;
  /**
   * เล่น attack animation ของ remote 1 ครั้ง — caller (app.ts) เรียกเมื่อได้ MSG_SKILL_RESULT จาก
   * casterId ที่ไม่ใช่ตัวเอง (event-driven, wire anim ไม่มี "attack" — ดู header comment). no-op ถ้ายังไม่
   * รู้จัก sessionId นี้ (race เช่น attack event มาก่อน onPlayerAdd — ข้ามเงียบ ๆ ไม่ throw).
   */
  playAttack(sessionId: string): void;
  /**
   * P2-13 (D-056): fast-resync ตอนแท็บกลับมาเห็น — snap remote ทุกตัวไปตำแหน่ง snapshot ล่าสุดทันที (ข้าม
   * interpolation lag) กัน rubber band หลัง rAF ถูก throttle ตอน hidden. no-op ถ้า buffer ยังว่าง.
   */
  resyncNow(): void;
  /** เรียกทุก frame (dt วินาที): sample buffer ที่ now−bufferMs → ขยับ entity + เดินเฟรม animator */
  update(dtSeconds: number): void;
  /** ลบ remote ทั้งหมด + ปล่อย texture */
  destroy(): void;
}

/**
 * สร้าง manager สำหรับผู้เล่นคนอื่นทั้งหมดใน scene.
 * @param renderer ใช้ generate placeholder texture ของ remote (สีตาม config.net.remotePlayerColor)
 * @param now monotonic clock (ms) — inject ได้เพื่อเทสต์ deterministic (default = performance.now)
 */
export function createRemotePlayerManager(
  scene: MapSceneHandle,
  config: EngineConfig,
  renderer: Renderer,
  registry?: AssetRegistry,
  now: () => number = () => performance.now(),
): RemotePlayerManager {
  // atlas art ถ้ามี assetId (ตัวเดียวกับ local player) + peek เจอ + anim ครบ → ใช้ atlas manifest/texture
  // (สีตัว remote คงที่ตาม art ไม่ปรับ); ไม่งั้น placeholder สีต่าง (remotePlayerColor) เหมือนเดิม.
  const atlasId = config.player.animation.style.assetId;
  const atlas = atlasId ? (registry?.peek(atlasId) ?? null) : null;
  const useAtlas = atlas !== null && playerAtlasUsable(atlas.manifest);
  const manifest: AnimationManifest = useAtlas
    ? atlas.manifest
    : createPlayerAnimationManifest(config.player.animation);
  // texture ที่ทุก remote แชร์เมื่อใช้ atlas (non-owning — animator.destroy() no-op ต่อ atlas set).
  const atlasTextures: EntityTextureSet | null =
    useAtlas && atlas ? atlas.textures : null;
  const interp = config.net.interpolation;
  // ความยาวคลิป attack (ms) — สูตรเดียวกับ local-player.ts (attackFrameDuration × attackFrames จาก
  // config เดียวกัน) ให้ remote เล่นคลิปยาวเท่าตัวเองเป๊ะ (ไม่ hardcode ซ้ำ, ไม่ผูก wire anim).
  const attackDurationMs =
    config.player.animation.attackFrameDuration * config.player.animation.attackFrames;
  // remote = style เดียวกับ local แต่เปลี่ยนสีตัว/ไหล่ ให้แยกจากตัวเราด้วยตา
  const remoteStyle = {
    ...config.player.animation.style,
    bodyColor: config.net.remotePlayerColor,
    accentColor: config.net.remotePlayerAccentColor,
  };
  const remotes = new Map<string, RemoteEntry>();

  const entityId = (sessionId: string): string => REMOTE_ID_PREFIX + sessionId;

  const newBuffer = (): InterpolationBuffer =>
    createInterpolationBuffer({
      capacity: interp.bufferCapacity,
      maxExtrapolationMs: interp.maxExtrapolationMs,
    });

  const add = (sessionId: string, snap: PlayerSnapshot): void => {
    if (remotes.has(sessionId)) {
      // idempotent: onAdd immediate อาจมาก่อน remove เก่า clear — อัปเดตแทน
      update(sessionId, snap);
      return;
    }
    const textures =
      atlasTextures ?? generatePlayerTextures(renderer, manifest, remoteStyle);
    const animator = createSpriteAnimator(textures, manifest, {
      animation: snap.anim,
      direction: snap.direction,
    });
    const pos: TilePoint = { tx: snap.tx, ty: snap.ty };
    scene.addEntity(entityId(sessionId), animator.view, pos);
    // P2-13 (D-056): ป้าย AFK เป็น child ของ sprite view (Sprite = Container) → ลอยตามหัว + destroy พร้อม view.
    const label = createAfkLabel(remoteStyle.bodyHeight, remoteStyle.walkBob);
    animator.view.addChild(label);
    const buffer = newBuffer();
    // seed snapshot แรก ณ ตำแหน่ง spawn → entity เพิ่งเกิดจะ clamp ที่นี่ (ไม่ลากจากที่ไกล)
    buffer.push(now(), snap.tx, snap.ty, snap.direction, snap.anim);
    remotes.set(sessionId, {
      animator,
      buffer,
      current: { tx: snap.tx, ty: snap.ty },
      facing: snap.direction,
      anim: snap.anim,
      attack: createRemoteAttackState(),
      label,
      afk: snap.isAfk === true,
    });
  };

  const update = (sessionId: string, snap: PlayerSnapshot): void => {
    const entry = remotes.get(sessionId);
    if (!entry) {
      add(sessionId, snap);
      return;
    }
    // stamp เวลารับ → push เข้า buffer (interpolation.ts จัดการ ordering/edge เอง)
    entry.buffer.push(now(), snap.tx, snap.ty, snap.direction, snap.anim);
    // P2-13: AFK = discrete flag (ไม่ interpolate) → เก็บค่าล่าสุดตรง ๆ; render loop toggle ป้ายจากค่านี้.
    entry.afk = snap.isAfk === true;
  };

  const remove = (sessionId: string): void => {
    const entry = remotes.get(sessionId);
    if (!entry) return;
    remotes.delete(sessionId);
    scene.removeEntity(entityId(sessionId)); // destroy view
    entry.animator.destroy(); // ปล่อย texture ที่ generate
  };

  return {
    onPlayerAdd: add,
    onPlayerChange: update,
    onPlayerRemove: remove,

    playAttack(sessionId: string): void {
      const entry = remotes.get(sessionId);
      if (!entry) return; // race: event มาก่อน onPlayerAdd ของ session นี้ — ข้ามเงียบ ๆ
      triggerRemoteAttack(entry.attack);
    },

    resyncNow(): void {
      // D-056 fast-resync: snap แต่ละ remote ไป snapshot ล่าสุด (renderTime = newest → ไม่มี lag/rubber band).
      for (const [sessionId, entry] of remotes) {
        const t = entry.buffer.newestTime;
        if (t === null) continue;
        const sample = entry.buffer.sampleAt(t);
        if (!sample) continue;
        entry.current.tx = sample.tx;
        entry.current.ty = sample.ty;
        scene.moveEntity(entityId(sessionId), entry.current);
        entry.facing = sample.direction;
        entry.anim = sample.anim;
        entry.animator.setState(entry.anim, entry.facing);
      }
    },

    update(dtSeconds: number): void {
      const renderTime = now() - interp.bufferMs;
      for (const [sessionId, entry] of remotes) {
        const sample = entry.buffer.sampleAt(renderTime);
        if (sample) {
          // buffer ว่าง (sample=null) → คงตำแหน่ง/ทิศเดิม; มีค่า → อัปเดต
          if (
            Math.abs(sample.tx - entry.current.tx) > MOVE_EPSILON ||
            Math.abs(sample.ty - entry.current.ty) > MOVE_EPSILON
          ) {
            entry.current.tx = sample.tx;
            entry.current.ty = sample.ty;
            scene.moveEntity(entityId(sessionId), entry.current);
          }
          entry.facing = sample.direction;
          entry.anim = sample.anim;
        }
        // attack ล็อกทับ anim จาก sample ชั่วคราว (event-driven, wire anim ไม่มี "attack" — header comment)
        const isAttacking = advanceRemoteAttack(entry.attack, dtSeconds * 1000, attackDurationMs);
        entry.animator.setState(isAttacking ? "attack" : entry.anim, entry.facing);
        // P2-13 (D-056): toggle ป้าย AFK + counter-flip กัน mirror (หลัง setState — view.scale.x อาจเพิ่ง flip)
        updateAfkLabel(entry.label, entry.animator.view, entry.afk);
        entry.animator.update(dtSeconds);
      }
    },

    destroy(): void {
      for (const sessionId of [...remotes.keys()]) remove(sessionId);
    },
  };
}
