// Particle burst layer — pixi glue (Combat Juice F5). Plain TS + PixiJS เท่านั้น (ห้าม React/Next) —
// src/game/** ใช้ engine ผ่าน public API เท่านั้น (scene.world/entityFootToScreen/object-pool, pattern
// เดียวกับ game/combat/damage-number.ts P1-06).
//
// generic ใช้ร่วมกัน 3 จุด (combat-stub.ts): impact spark (จุดโดนตี ทุก tier), death burst (มอนตาย, สีตาม
// rank), loot sparkle (เสริมทองตอน kill ที่ได้ reward) — ต่างกันแค่ ParticleBurstStyle ที่ส่งเข้า spawn().
//
// pool ของ pixi.Graphics เดียวกันทั้ง 3 ใช้ (budget รวม = 1 knob เดียว, ImpactParticlesConfig.poolSize) —
// ไม่มี `new Graphics()`/`.destroy()` ในเส้นทาง spawn()/update() ปกติหลัง pool วอร์มอัพจนถึง cap (tech §11).
// pool เต็ม → particle ที่เหลือของ burst นั้นถูกข้ามเงียบ ๆ (fail-soft, decorative only — ไม่มี aggregate
// เหมือน damage number เพราะ particle ไม่ใช่ข้อมูลที่ต้องเห็นครบ).

import { Container, Graphics } from "pixi.js";
import type { TileSize } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import { entityFootToScreen } from "@/engine/render/placement";
import type { MapSceneHandle } from "@/engine/render/scene";
import { createObjectPool, type ObjectPool } from "@/engine/render/object-pool";
import {
  createParticleBurst,
  particleAlpha,
  stepParticle,
  type Particle,
  type ParticleBurstStyle,
} from "@/game/combat/particle-burst";
import { defaultRng, type RngFn } from "@/game/mob/rng";

export interface ParticleBurstLayerHandle {
  /** สร้าง burst 1 ชุดที่ tile ที่กำหนด (foot position, convention เดียวกับ damage-number.ts) ตาม style —
   *  style.count ควรผ่าน scaleParticleBurstCount (quality gate) มาแล้วจาก caller. count=0 → no-op เงียบ ๆ. */
  spawn(tile: TilePoint, style: ParticleBurstStyle): void;
  /** เรียกทุก frame ด้วย dt "ms" — เดินอายุ/เลื่อนตำแหน่ง/คืน pool เมื่อหมดอายุ */
  update(dtMs: number): void;
  /** จำนวน particle ที่กำลังแสดงอยู่ตอนนี้ (debug) */
  readonly activeCount: number;
  /** ลบ particle ที่เหลือทั้งหมด + คืน pool + ลบ layer container ออกจาก scene */
  destroy(): void;
}

interface ActiveParticleEntry {
  readonly display: Graphics;
  readonly particle: Particle;
  readonly originSx: number;
  readonly originSy: number;
}

/**
 * สร้าง particle burst layer 1 ชุด (ต่อ combat stub instance เดียว, เหมือน damage-number layer).
 * @param scene MapSceneHandle — ใช้ scene.world (public field) เพิ่ม layer container ครั้งเดียว
 * @param poolSize cap ของ Graphics pool (Design Knob — juice-config.ts ImpactParticlesConfig.poolSize)
 * @param tileSize ใช้แปลง tile → screen ตำแหน่งจุดสแปม (entityFootToScreen convention เดียวกับ entity อื่น)
 * @param rng inject ได้เพื่อเทสต์ deterministic (default Math.random เหมือน combat-stub dummy damage)
 */
export function createParticleBurstLayer(
  scene: MapSceneHandle,
  poolSize: number,
  tileSize: TileSize,
  rng: RngFn = defaultRng,
): ParticleBurstLayerHandle {
  // layer เดียว เพิ่มเข้า scene.world ครั้งเดียว — เป็น child หลังสุดของ world เสมอ (วาดบนสุด, เหมือน
  // damage-number.ts) ยกเว้น camera-flash overlay ที่ combat-stub.ts เพิ่มทีหลังสุด (บนสุดจริง ๆ).
  const layer = new Container();
  scene.world.addChild(layer);

  const pool: ObjectPool<Graphics> = createObjectPool(
    () => {
      const g = new Graphics();
      g.visible = false;
      layer.addChild(g);
      return g;
    },
    (g) => {
      g.visible = false;
      g.clear();
    },
    poolSize,
  );

  const active = new Map<string, ActiveParticleEntry>();
  let seq = 0;

  return {
    spawn(tile: TilePoint, style: ParticleBurstStyle): void {
      const particles = createParticleBurst(style, rng);
      if (particles.length === 0) return;
      const origin = entityFootToScreen(tile, tileSize);
      for (const particle of particles) {
        const display = pool.acquire();
        if (!display) break; // pool เต็ม — ข้อความที่เหลือของ burst นี้ข้ามเงียบ ๆ (decorative only)
        display.clear();
        display.circle(0, 0, particle.size).fill({ color: particle.color });
        display.visible = true;
        display.alpha = 1;
        display.position.set(origin.sx, origin.sy);
        const id = `pb:${seq++}`;
        active.set(id, { display, particle, originSx: origin.sx, originSy: origin.sy });
      }
    },

    update(dtMs: number): void {
      if (active.size === 0) return;
      const expired: string[] = [];
      for (const [id, entry] of active) {
        const alive = stepParticle(entry.particle, dtMs);
        entry.display.position.set(
          entry.originSx + entry.particle.x,
          entry.originSy + entry.particle.y,
        );
        entry.display.alpha = particleAlpha(entry.particle);
        if (!alive) expired.push(id);
      }
      for (const id of expired) {
        const entry = active.get(id);
        if (entry) pool.release(entry.display);
        active.delete(id);
      }
    },

    get activeCount(): number {
      return active.size;
    },

    destroy(): void {
      for (const entry of active.values()) pool.release(entry.display);
      active.clear();
      layer.parent?.removeChild(layer);
      layer.destroy({ children: true });
    },
  };
}
