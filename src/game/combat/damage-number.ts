// Dummy damage number layer — pixi glue (P0-10 combat stub, P0_SCOPE_LOCK §4.9).
// Plain TS + PixiJS เท่านั้น (ห้าม React/Next) — src/game/** ใช้ engine ผ่าน public API เท่านั้น
// (scene entity API: addEntity/removeEntity — ไม่แตะ pixi stage ตรง ๆ).
//
// P0 scope: dummy — ตัวเลขลอยขึ้น+fade เหนือ mob ที่โดน. สร้าง/ทำลาย Text ตรง ๆ ต่อครั้งโจมตี
// (ปริมาณต่ำพอสำหรับ stub — ไม่ hot loop หนัก).
// TODO(P1): เปลี่ยนเป็น BitmapText + object pool ตาม tech §11 ("ทุกอย่างที่เกิด-ตายถี่ ห้าม new
// ใน hot loop", budget 300 damage numbers/วิ) — P0 ไม่ต้องรับ throughput ระดับนั้น.

import { Container, Text } from "pixi.js";
import type { DamageNumberConfig } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import type { MapSceneHandle } from "@/engine/render/scene";

/** zLayer ของเลข damage — สูงกว่า entity ปกติทุกตัว (player/mob/prop = 0) ให้เห็นเสมอเหนือทุกอย่าง. */
const DAMAGE_NUMBER_ZLAYER = 50;

export interface DamageNumberLayerHandle {
  /** สร้างเลข damage ลอยเหนือ tile ที่กำหนด (foot position ของเป้าตอนโดน) */
  spawn(tile: TilePoint, amount: number): void;
  /** เรียกทุก frame ด้วย dt วินาที — เดินอายุ/เลื่อนตำแหน่ง/ลบเมื่อหมดอายุ */
  update(dtSeconds: number): void;
  /** ลบเลขที่เหลือทั้งหมดออกจาก scene */
  destroy(): void;
}

interface ActiveDamageNumber {
  readonly id: string;
  readonly text: Text;
  elapsedMs: number;
}

/**
 * สร้าง damage number layer 1 ชุด (ต่อ combat stub instance เดียว).
 * @param scene MapSceneHandle — ใช้ addEntity/removeEntity (public API เดียวกับ player/mob)
 * @param config style/timing (Design Knob — engine/config.ts DamageNumberConfig)
 */
export function createDamageNumberLayer(
  scene: MapSceneHandle,
  config: DamageNumberConfig,
): DamageNumberLayerHandle {
  const active = new Map<string, ActiveDamageNumber>();
  let seq = 0;

  return {
    spawn(tile: TilePoint, amount: number): void {
      const text = new Text({
        text: String(Math.round(amount)),
        style: {
          fill: config.color,
          fontSize: config.fontSize,
          fontFamily: "monospace",
          fontWeight: "bold",
        },
      });
      text.anchor.set(0.5, 1);
      text.position.set(0, config.spawnOffsetY);

      const wrapper = new Container();
      wrapper.addChild(text);

      const id = `dmg-number:${seq++}`;
      scene.addEntity(id, wrapper, tile, DAMAGE_NUMBER_ZLAYER);
      active.set(id, { id, text, elapsedMs: 0 });
    },

    update(dtSeconds: number): void {
      const dtMs = dtSeconds * 1000;
      const expired: string[] = [];
      for (const entry of active.values()) {
        entry.elapsedMs += dtMs;
        const progress = Math.min(1, entry.elapsedMs / config.lifetimeMs);
        entry.text.position.y = config.spawnOffsetY - progress * config.riseDistance;
        entry.text.alpha = 1 - progress;
        if (progress >= 1) expired.push(entry.id);
      }
      for (const id of expired) {
        scene.removeEntity(id);
        active.delete(id);
      }
    },

    destroy(): void {
      for (const id of active.keys()) scene.removeEntity(id);
      active.clear();
    },
  };
}
