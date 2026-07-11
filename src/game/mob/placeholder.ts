// Mob placeholder textures — generate ด้วยโค้ด runtime (pixi Graphics → RenderTexture), แบบเดียวกับ
// engine/animation/player-placeholder.ts แต่หน้าตาต่างชัดตาม mobType (slime ก้อนกลมเขียวเด้ง /
// mushroom หมวกแดง) — P0-09 dummy, ยังไม่มี art จริง. Plain TS + PixiJS เท่านั้น (ห้าม React/Next).
//
// วาดโดย **เท้าอยู่ที่ local (0,0)** (convention เดียวกับ placement.ts/player-placeholder.ts).
// เรียก generateMobTextures() **ครั้งเดียวต่อ mobType** (game/mob/manager.ts แชร์ set นี้ข้ามทุก
// instance ของ type เดียวกัน — ไม่ generate ต่อตัว กันเปลือง GPU/texture memory โดยไม่จำเป็น).

import { Graphics, Rectangle, type Renderer, type Texture } from "pixi.js";
import type { MobStyle } from "@/engine/config";
import type { AnimationManifest } from "@/engine/animation/manifest";
import type { PlayerTextureSet } from "@/engine/animation/player-placeholder";

/** ชุด texture ของ mob 1 ชนิด — โครงเดียวกับ PlayerTextureSet (reuse type ผ่าน engine public API). */
export type MobTextureSet = PlayerTextureSet;

const key = (animation: string, direction: string): string =>
  `${animation}:${direction}`;

/** เรขาคณิตของ frame (คงที่ทุกเฟรมเพื่อ anchor เสถียร — เหมือน player-placeholder.ts). */
function frameGeometry(style: MobStyle): {
  rect: Rectangle;
  anchor: { x: number; y: number };
} {
  const halfW = style.width * 0.7 + 6; // เผื่อ squish ขยายออกด้านข้าง
  const shadowRy = style.width * 0.26;
  const topY = -(style.height + style.bounceAmount + 4);
  const botY = shadowRy + 4;
  const height = botY - topY;
  return {
    rect: new Rectangle(-halfW, topY, halfW * 2, height),
    anchor: { x: 0.5, y: -topY / height },
  };
}

/** squish (บวก=แบนกว้าง, ลบ=ยืดสูง) + hop (px, ลบ=ยกขึ้น) ต่อ animation/เฟรม — ใช้ทั้ง slime/mushroom. */
function poseFor(
  style: MobStyle,
  animation: string,
  frame: number,
): { squish: number; hop: number } {
  if (animation === "walk") {
    const bounce = frame % 2 === 1;
    return { squish: bounce ? -0.1 : 0.08, hop: bounce ? -style.bounceAmount : 0 };
  }
  // idle: เด้งหายใจเบา ๆ (บีบเล็กน้อยสลับเฟรม)
  return { squish: frame % 2 === 1 ? 0.05 : 0, hop: 0 };
}

function drawSlimeFrame(
  g: Graphics,
  style: MobStyle,
  squish: number,
  hop: number,
): void {
  const w = style.width * (1 + squish);
  const h = style.height * (1 - squish);
  const cy = -h / 2 + hop;
  g.ellipse(0, cy, w / 2, h / 2)
    .fill({ color: style.bodyColor, alpha: 0.92 })
    .stroke({ color: 0x000000, width: 1, alpha: 0.35 });
  // highlight เล็ก ๆ บอกความ "เด้ง/เปียก"
  g.ellipse(-w * 0.18, cy - h * 0.22, w * 0.14, h * 0.1).fill({
    color: 0xffffff,
    alpha: 0.35,
  });
  // ตา 2 จุด (accent)
  g.circle(-w * 0.15, cy - h * 0.05, style.width * 0.06).fill({
    color: style.accentColor,
  });
  g.circle(w * 0.15, cy - h * 0.05, style.width * 0.06).fill({
    color: style.accentColor,
  });
}

function drawMushroomFrame(
  g: Graphics,
  style: MobStyle,
  squish: number,
  hop: number,
): void {
  const capW = style.width * (1 + squish * 0.5);
  const capH = style.height * 0.55;
  const stemW = style.width * 0.34;
  const stemH = style.height * 0.45 * (1 - squish * 0.3);
  const stemTop = -stemH + hop;

  // ก้าน
  g.rect(-stemW / 2, stemTop, stemW, stemH)
    .fill({ color: style.bodyColor })
    .stroke({ color: 0x000000, width: 1, alpha: 0.35 });
  // หมวก (โดม)
  g.ellipse(0, stemTop, capW / 2, capH / 2)
    .fill({ color: style.accentColor })
    .stroke({ color: 0x000000, width: 1, alpha: 0.4 });
  // จุดลายบนหมวก
  g.circle(-capW * 0.18, stemTop - capH * 0.12, style.width * 0.06).fill({
    color: 0xffffff,
    alpha: 0.85,
  });
  g.circle(capW * 0.15, stemTop - capH * 0.05, style.width * 0.05).fill({
    color: 0xffffff,
    alpha: 0.85,
  });
}

/** วาด 1 เฟรมของ mob ลง Graphics (เท้าที่ 0,0) — ทิศไม่กระทบภาพ (symmetric, ดู manifest.ts). */
function drawMobFrame(
  g: Graphics,
  style: MobStyle,
  animation: string,
  frame: number,
): void {
  const { squish, hop } = poseFor(style, animation, frame);
  // เงาที่เท้า (ไม่ bob — ติดพื้น)
  g.ellipse(0, 0, style.width * 0.38, style.width * 0.2).fill({
    color: 0x000000,
    alpha: 0.25,
  });
  if (style.shape === "mushroom") {
    drawMushroomFrame(g, style, squish, hop);
  } else {
    drawSlimeFrame(g, style, squish, hop);
  }
}

/**
 * Generate texture ทั้งชุดของ mob 1 ชนิดจาก manifest (drawnDirections = ["S","N"], ดู manifest.ts).
 * เรียกครั้งเดียวต่อ mobType (ไม่อยู่ใน hot loop — manager.ts แชร์ set ข้าม instance).
 *
 * @param renderer pixi renderer (app.renderer) — ใช้ generateTexture
 */
export function generateMobTextures(
  renderer: Renderer,
  manifest: AnimationManifest,
  style: MobStyle,
): MobTextureSet {
  const { rect, anchor } = frameGeometry(style);
  const map = new Map<string, Texture[]>();

  for (const direction of manifest.drawnDirections) {
    for (const animation of Object.keys(manifest.animations)) {
      const def = manifest.animations[animation];
      const texCount = Math.max(...def.frames) + 1;
      const list: Texture[] = [];
      for (let i = 0; i < texCount; i++) {
        const g = new Graphics();
        drawMobFrame(g, style, animation, i);
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
          `MobTextureSet: ไม่มี texture ของ ${animation}:${direction} (ทิศนี้ไม่ได้วาด?)`,
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
