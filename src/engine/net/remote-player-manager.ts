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

import type { Renderer } from "pixi.js";
import type { EngineConfig } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import type { MapSceneHandle } from "@/engine/render/scene";
import type { PlayerSnapshot } from "@/shared/net-protocol";
import {
  createInterpolationBuffer,
  type InterpolationBuffer,
} from "@/engine/net/interpolation";
import { createPlayerAnimationManifest } from "@/engine/animation/manifest";
import { generatePlayerTextures } from "@/engine/animation/player-placeholder";
import {
  createSpriteAnimator,
  type SpriteAnimator,
} from "@/engine/animation/animator";
import type { Direction } from "@/engine/movement/direction";

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
}

export interface RemotePlayerManager {
  onPlayerAdd(sessionId: string, snap: PlayerSnapshot): void;
  onPlayerChange(sessionId: string, snap: PlayerSnapshot): void;
  onPlayerRemove(sessionId: string): void;
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
  now: () => number = () => performance.now(),
): RemotePlayerManager {
  const manifest = createPlayerAnimationManifest(config.player.animation);
  const interp = config.net.interpolation;
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
    const textures = generatePlayerTextures(renderer, manifest, remoteStyle);
    const animator = createSpriteAnimator(textures, manifest, {
      animation: snap.anim,
      direction: snap.direction,
    });
    const pos: TilePoint = { tx: snap.tx, ty: snap.ty };
    scene.addEntity(entityId(sessionId), animator.view, pos);
    const buffer = newBuffer();
    // seed snapshot แรก ณ ตำแหน่ง spawn → entity เพิ่งเกิดจะ clamp ที่นี่ (ไม่ลากจากที่ไกล)
    buffer.push(now(), snap.tx, snap.ty, snap.direction, snap.anim);
    remotes.set(sessionId, {
      animator,
      buffer,
      current: { tx: snap.tx, ty: snap.ty },
      facing: snap.direction,
      anim: snap.anim,
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
        entry.animator.setState(entry.anim, entry.facing);
        entry.animator.update(dtSeconds);
      }
    },

    destroy(): void {
      for (const sessionId of [...remotes.keys()]) remove(sessionId);
    },
  };
}
