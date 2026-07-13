// Placeholder player textures — generate ด้วยโค้ด runtime (pixi Graphics → RenderTexture).
// Plain TS + PixiJS เท่านั้น (ห้าม React/Next). ยังไม่มี art จริง — ตัวนี้พิสูจน์ทั้งระบบ:
//   • ทิศที่วาด (5 ทิศ) ดูออกว่า **ไม่สมมาตร** (accent สีแดงข้างเดียว) → เห็นด้วยตาว่า mirror ทำงาน
//   • walk = หลายเฟรม (เด้งตัว + สลับขา), idle = เด้งหายใจ, attack = ยื่นแขน
//
// วาดโดย **เท้าอยู่ที่ local (0,0)** (convention placement.ts). generateTexture ใช้ frame rect
// คงที่ทุกเฟรม → ทุก texture ขนาดเท่ากัน + anchor เดียวกัน (anchor.x=0.5 → flip แล้วเท้าไม่ย้าย).

import { Graphics, Rectangle, type Renderer, type Texture } from "pixi.js";
import type { PlayerSpriteStyle } from "@/engine/config";
import {
  directionToScreenUnit,
  type Direction,
} from "@/engine/movement/direction";
import type { AnimationManifest } from "@/engine/animation/manifest";
import type { EntityTextureSet } from "@/engine/animation/texture-set";

/**
 * ชุด texture ที่ generate แล้ว + anchor เท้า. animator ดึงผ่าน get().
 * = EntityTextureSet (contract กลางใน texture-set.ts) — alias ไว้ให้ call sites เดิมไม่ต้องแก้.
 */
export type PlayerTextureSet = EntityTextureSet;

const key = (animation: string, direction: Direction): string =>
  `${animation}:${direction}`;

/** เรขาคณิตของ frame (คำนวณจาก style) — คงที่ทุกเฟรมเพื่อ anchor เสถียร. */
function frameGeometry(style: PlayerSpriteStyle): {
  rect: Rectangle;
  anchor: { x: number; y: number };
} {
  const halfW = style.bodyWidth * 0.85 + 8; // เผื่อ accent + face marker ยื่นข้าง
  const shadowRy = style.bodyWidth * 0.28;
  const topY = -(style.bodyHeight + style.walkBob + 6);
  const botY = shadowRy + 4;
  const height = botY - topY;
  return {
    rect: new Rectangle(-halfW, topY, halfW * 2, height),
    // foot ที่ y=0 → สัดส่วนจาก top ของ frame
    anchor: { x: 0.5, y: -topY / height },
  };
}

/** bob (ยกตัว, px) + legPhase (0/1 = ขาไหนก้าวหน้า) ต่อ animation/เฟรม. */
function poseFor(
  style: PlayerSpriteStyle,
  animation: string,
  frame: number,
): { bob: number; legPhase: number; armThrust: number } {
  if (animation === "walk") {
    // 4 เฟรม: contact / passing(ยกตัว) / contact / passing — สลับขาทุก contact
    const up = frame % 2 === 1 ? -style.walkBob : 0;
    return { bob: up, legPhase: frame < 2 ? 0 : 1, armThrust: 0 };
  }
  if (animation === "attack") {
    // ยื่นแขน accent เพิ่มขึ้นตามเฟรม
    return { bob: 0, legPhase: 0, armThrust: (frame + 1) * 4 };
  }
  // idle: เด้งหายใจเบา ๆ
  return { bob: frame % 2 === 1 ? -1 : 0, legPhase: 0, armThrust: 0 };
}

/**
 * วาด 1 เฟรมของ player ลง Graphics (เท้าที่ 0,0).
 * accent (แดง) อยู่ฝั่ง +x เสมอในภาพที่วาด → พอ mirror (scale.x=−1) จะไปอยู่ฝั่ง −x = ถูกต้องตามทิศ mirror.
 */
function drawPlayerFrame(
  g: Graphics,
  style: PlayerSpriteStyle,
  direction: Direction,
  animation: string,
  frame: number,
): void {
  const { bob, legPhase, armThrust } = poseFor(style, animation, frame);
  const w = style.bodyWidth;
  const hw = w / 2;
  const H = style.bodyHeight;

  const legH = H * 0.28;
  const torsoH = H * 0.42;
  const headR = H * 0.15;
  const torsoBottom = -legH; // ปลายล่าง torso
  const torsoTop = torsoBottom - torsoH;
  const headCy = torsoTop - headR + bob;

  // เงาที่เท้า (ไม่ bob — ติดพื้น)
  g.ellipse(0, 0, style.bodyWidth * 0.4, style.bodyWidth * 0.22).fill({
    color: 0x000000,
    alpha: 0.25,
  });

  // ขา 2 ข้าง — walk สลับก้าว (ข้างที่ก้าวหน้าเลื่อนขึ้นเล็กน้อย)
  const legW = w * 0.24;
  const legLift = animation === "walk" ? 3 : 0;
  const lLift = legPhase === 0 ? legLift : 0;
  const rLift = legPhase === 1 ? legLift : 0;
  g.rect(-w * 0.28, -legH - lLift + bob, legW, legH + lLift).fill({
    color: style.legColor,
  });
  g.rect(w * 0.28 - legW, -legH - rLift + bob, legW, legH + rLift).fill({
    color: style.legColor,
  });

  // torso
  g.rect(-hw, torsoTop + bob, w, torsoH)
    .fill({ color: style.bodyColor })
    .stroke({ color: 0x000000, width: 1, alpha: 0.4 });

  // accent ข้างเดียว (ไหล่/กระเป๋าแดง) — ฝั่ง +x, ยื่นเพิ่มตอน attack
  const accentW = w * 0.34 + armThrust;
  g.rect(hw * 0.5, torsoTop + bob + torsoH * 0.1, accentW, torsoH * 0.5).fill({
    color: style.accentColor,
  });

  // head
  g.circle(0, headCy, headR)
    .fill({ color: style.headColor })
    .stroke({ color: 0x000000, width: 1, alpha: 0.4 });

  // face marker บอกทิศ — ยื่นตามทิศบนจอ (ย่อแกน y ครึ่งให้ดูเอียงตามพื้น iso)
  const u = directionToScreenUnit(direction);
  const fx = u.sx * headR * 0.75;
  const fy = headCy + u.sy * headR * 0.5;
  g.circle(fx, fy, Math.max(1.5, headR * 0.3)).fill({ color: style.faceColor });
}

/**
 * Generate texture ทั้งชุดของ player จาก manifest (เฉพาะ drawnDirections — mirror reuse ตอน render).
 * เรียกครั้งเดียวตอนสร้าง player (ไม่อยู่ใน hot loop).
 *
 * @param renderer pixi renderer (app.renderer) — ใช้ generateTexture
 */
export function generatePlayerTextures(
  renderer: Renderer,
  manifest: AnimationManifest,
  style: PlayerSpriteStyle,
): PlayerTextureSet {
  const { rect, anchor } = frameGeometry(style);
  const map = new Map<string, Texture[]>();

  for (const direction of manifest.drawnDirections) {
    for (const animation of Object.keys(manifest.animations)) {
      const def = manifest.animations[animation];
      const texCount = Math.max(...def.frames) + 1;
      const list: Texture[] = [];
      for (let i = 0; i < texCount; i++) {
        const g = new Graphics();
        drawPlayerFrame(g, style, direction, animation, i);
        list.push(renderer.generateTexture({ target: g, frame: rect }));
        g.destroy();
      }
      map.set(key(animation, direction), list);
    }
  }

  return {
    anchor,
    get(animation, direction) {
      const list = map.get(key(animation, direction));
      if (!list) {
        throw new Error(
          `PlayerTextureSet: ไม่มี texture ของ ${animation}:${direction} (ทิศนี้ไม่ได้วาด?)`,
        );
      }
      return list;
    },
    destroy() {
      for (const list of map.values()) {
        for (const tex of list) tex.destroy(true);
      }
      map.clear();
    },
  };
}
