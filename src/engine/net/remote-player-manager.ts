// Remote player manager — pixi glue (P0-07). Plain TS + PixiJS เท่านั้น (ห้าม React/Next).
// รับ net event (add/change/remove) → สร้าง/ขยับ/ลบ "ผู้เล่นคนอื่น" ใน scene entity layer
//   ด้วย animator ตัวเดียวกับ local player (5-dir + mirror) แต่ **สีต่าง** (config.net.remotePlayerColor)
//   เพื่อแยกตัวเรา/คนอื่นด้วยตา (P0_SCOPE_LOCK §4.6 "other players visible").
//
// การขยับ remote: server broadcast tile เป้าหมาย → ที่นี่ **lerp** current→target ต่อ frame
//   (P0 = interpolation ง่าย ๆ ตาม tech §6 "render ย้อนหลัง/interpolate"; ยังไม่ทำ buffer 100–150ms จริง — P1).
//
// lifecycle texture: generate ต่อ remote (N เล็กมากใน P0 = 30 CCU cap) → destroy สะอาดตอน remove.
//   P1 TODO: share texture atlas / pool (tech §11 pooling) แทน generate ต่อคน.

import type { Renderer } from "pixi.js";
import type { EngineConfig } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import type { MapSceneHandle } from "@/engine/render/scene";
import type { PlayerSnapshot } from "@/shared/net-protocol";
import { lerpTile } from "@/engine/render/camera";
import { createPlayerAnimationManifest } from "@/engine/animation/manifest";
import { generatePlayerTextures } from "@/engine/animation/player-placeholder";
import {
  createSpriteAnimator,
  type SpriteAnimator,
} from "@/engine/animation/animator";
import type { Direction } from "@/engine/movement/direction";

/** prefix ของ entity id ฝั่ง remote — กันชนกับ local player / prop id ใน scene registry. */
const REMOTE_ID_PREFIX = "remote:";

interface RemoteEntry {
  animator: SpriteAnimator;
  /** ตำแหน่งที่ render อยู่ (lerp เข้าหา target) */
  current: TilePoint;
  /** ตำแหน่งเป้าหมายจาก server ล่าสุด */
  target: TilePoint;
  facing: Direction;
  anim: string;
}

export interface RemotePlayerManager {
  onPlayerAdd(sessionId: string, snap: PlayerSnapshot): void;
  onPlayerChange(sessionId: string, snap: PlayerSnapshot): void;
  onPlayerRemove(sessionId: string): void;
  /** เรียกทุก frame (dt วินาที): lerp remote → target + เดินเฟรม animator */
  update(dtSeconds: number): void;
  /** ลบ remote ทั้งหมด + ปล่อย texture */
  destroy(): void;
}

/**
 * สร้าง manager สำหรับผู้เล่นคนอื่นทั้งหมดใน scene.
 * @param renderer ใช้ generate placeholder texture ของ remote (สีตาม config.net.remotePlayerColor)
 */
export function createRemotePlayerManager(
  scene: MapSceneHandle,
  config: EngineConfig,
  renderer: Renderer,
): RemotePlayerManager {
  const manifest = createPlayerAnimationManifest(config.player.animation);
  // remote = style เดียวกับ local แต่เปลี่ยนสีตัว/ไหล่ ให้แยกจากตัวเราด้วยตา
  const remoteStyle = {
    ...config.player.animation.style,
    bodyColor: config.net.remotePlayerColor,
    accentColor: config.net.remotePlayerAccentColor,
  };
  const remotes = new Map<string, RemoteEntry>();

  const entityId = (sessionId: string): string => REMOTE_ID_PREFIX + sessionId;

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
    remotes.set(sessionId, {
      animator,
      current: { tx: snap.tx, ty: snap.ty },
      target: { tx: snap.tx, ty: snap.ty },
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
    entry.target.tx = snap.tx;
    entry.target.ty = snap.ty;
    entry.facing = snap.direction;
    entry.anim = snap.anim;
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
      const lerpFactor = config.net.remoteLerp;
      for (const [sessionId, entry] of remotes) {
        const next = lerpTile(entry.current, entry.target, lerpFactor);
        if (next.tx !== entry.current.tx || next.ty !== entry.current.ty) {
          entry.current.tx = next.tx;
          entry.current.ty = next.ty;
          scene.moveEntity(entityId(sessionId), entry.current);
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
