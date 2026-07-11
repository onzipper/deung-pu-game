// Sprite animator — glue ระหว่าง manifest (pure) + texture set (pixi) → เล่นเฟรมบน Sprite.
// Plain TS + PixiJS เท่านั้น (ห้าม React/Next). แยก calc/render: การ resolve ทิศ→clip และ
// การเดินเฟรมเป็น pure (manifest.ts); ตัวนี้แค่ apply ผลลง Sprite (.texture / .scale.x).
//
// mirror: scale.x = −1 รอบ anchor.x = 0.5 (จาก texture set) → flip แล้ว "เท้า" ไม่ย้ายที่.
// zero-alloc ใน hot loop: playhead mutate in place, ไม่สร้าง object ต่อ frame.

import { Sprite } from "pixi.js";
import {
  advancePlayhead,
  resolveClip,
  type AnimationManifest,
  type Playhead,
  type ResolvedClip,
} from "@/engine/animation/manifest";
import type { PlayerTextureSet } from "@/engine/animation/player-placeholder";
import type { Direction } from "@/engine/movement/direction";

export interface SpriteAnimator {
  /** display object ที่เอาไปใส่ scene (Sprite เป็น Container subclass) */
  readonly view: Sprite;
  /**
   * ตั้ง state ปัจจุบัน (เรียกได้ทุก frame — no-op ถ้าไม่เปลี่ยน).
   * เปลี่ยน animation → รีเซ็ตเฟรมเริ่ม 0; เปลี่ยนแค่ทิศ → คงเฟรมเดิม (เดินต่อเนื่องลื่น).
   */
  setState(animation: string, direction: Direction): void;
  /** เดินเฟรมตาม dt (วินาที) แล้ว apply texture ปัจจุบัน */
  update(dtSeconds: number): void;
  /**
   * destroy **texture set เท่านั้น** — `view` เป็นของ scene entity layer (scene.removeEntity
   * เป็นคน destroy display). caller ต้อง removeEntity ก่อนแล้วค่อยเรียก destroy() นี้ กัน GPU leak.
   */
  destroy(): void;
}

/**
 * สร้าง animator สำหรับ 1 entity.
 * @param textures ชุด texture ที่ generate แล้ว (drawnDirections)
 * @param manifest manifest ตัวเดียวกับที่ generate texture
 * @param initial state เริ่มต้น
 */
export function createSpriteAnimator(
  textures: PlayerTextureSet,
  manifest: AnimationManifest,
  initial: { animation: string; direction: Direction },
): SpriteAnimator {
  const view = new Sprite();
  view.anchor.set(textures.anchor.x, textures.anchor.y);

  let animation = initial.animation;
  let direction = initial.direction;
  let clip: ResolvedClip = resolveClip(manifest, animation, direction);
  const head: Playhead = { index: 0, elapsedMs: 0 };

  /** apply texture ของ playhead ปัจจุบัน + flip ตาม mirror. */
  const applyFrame = (): void => {
    const list = textures.get(animation, clip.sourceDirection);
    const texIndex = clip.frames[head.index] ?? 0;
    view.texture = list[texIndex] ?? list[0];
    // scale.x คงขนาด (|1|) เปลี่ยนแค่ทิศ flip — anchor.x=0.5 → เท้าอยู่กับที่
    view.scale.x = clip.mirror ? -1 : 1;
  };
  applyFrame();

  return {
    view,

    setState(nextAnimation: string, nextDirection: Direction): void {
      if (nextAnimation === animation && nextDirection === direction) return;
      const animChanged = nextAnimation !== animation;
      animation = nextAnimation;
      direction = nextDirection;
      clip = resolveClip(manifest, animation, direction);
      if (animChanged) {
        // เปลี่ยน animation → เริ่มเฟรมแรก; เปลี่ยนแค่ทิศ → คง head (mirror/source เปลี่ยนใน clip แล้ว)
        head.index = 0;
        head.elapsedMs = 0;
      } else if (head.index >= clip.frames.length) {
        head.index = clip.frames.length - 1;
      }
      applyFrame();
    },

    update(dtSeconds: number): void {
      advancePlayhead(head, dtSeconds * 1000, clip);
      applyFrame();
    },

    destroy(): void {
      // view ถูก scene.removeEntity destroy แล้ว — ที่นี่ปล่อยเฉพาะ GPU texture ที่ generate
      textures.destroy();
    },
  };
}
