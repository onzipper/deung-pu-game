// Mob manager — pixi glue: spawn dummy mobs ต่อ pocket (P0-09) + wander tick + scene entity wiring.
// Plain TS + PixiJS เท่านั้น (ห้าม React/Next) — src/game/** ใช้ engine ผ่าน public API เท่านั้น.
//
// P0 scope (P0_SCOPE_LOCK §4.8 · GS §57.8 · TA §18.1): client/local เท่านั้น — ไม่มี mob AI server,
// ไม่มี loot/EXP/aggro/combat (P0-10 จะยิงใส่ dummy พวกนี้). spawn ครั้งเดียวตอน scene สร้าง (ตอน
// createMobManager ถูกเรียก), ไม่มี respawn ใน P0.
//
// TODO(P1): server-authoritative spawn/AI (TA §18.1, §7 monster authority) ย้าย spawn/wander
// logic (pure, game/mob/spawn.ts + wander.ts) ขึ้น server ได้ตรง ๆ (ไม่มี pixi dependency).
// TODO(P1): object pooling (tech §11 "ทุกอย่างที่เกิด-ตายถี่ ห้าม new ใน hot loop") — P0-09 มอน
// ไม่ตาย (ยังไม่มี combat) จึงยังไม่ต้อง pool, แต่โครง `mobs: Map<id, MobInstance>` +
// spawn/destroy แยกจุดเดียวไม่ขวางเพิ่ม pool ทีหลัง (เปลี่ยนแค่จุด create/release ของ instance).

import type { Renderer } from "pixi.js";
import type { EngineConfig, MobStyle } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import type { MapConfig, TileRect } from "@/engine/map/types";
import type { MapSceneHandle } from "@/engine/render/scene";
import { resolveDirection, type Direction } from "@/engine/movement/direction";
import {
  createSpriteAnimator,
  type SpriteAnimator,
} from "@/engine/animation/animator";
import {
  createWanderState,
  stepWander,
  walkableFromMap,
  type MobWanderState,
} from "@/game/mob/wander";
import { spawnAllPockets } from "@/game/mob/spawn";
import { defaultRng, type RngFn } from "@/game/mob/rng";
import { createMobAnimationManifest } from "@/game/mob/manifest";
import {
  generateMobTextures,
  type MobTextureSet,
} from "@/game/mob/placeholder";

const INITIAL_FACING: Direction = "S";
/** intent ที่สั้นกว่านี้ (²) ถือว่า "ไม่เดิน" → idle (เหมือน local-player.ts) */
const MOVE_EPS = 1e-9;

interface MobInstance {
  readonly id: string;
  readonly area: TileRect;
  pos: TilePoint;
  wander: MobWanderState;
  facing: Direction;
  animation: string;
  readonly animator: SpriteAnimator;
}

export interface MobManagerHandle {
  /** จำนวนมอนที่ spawn อยู่ตอนนี้ (debug/manual check) */
  readonly count: number;
  /** เรียกทุก frame ด้วย dt เป็น "วินาที" — wander step ทุกตัว + apply เข้า scene */
  update(dtSeconds: number): void;
  /** ลบมอนทุกตัวออกจาก scene + ปล่อย texture ที่ generate (per mobType) */
  destroy(): void;
}

/**
 * สร้าง mob manager: spawn ทุก pocket ของ map (fixed pocket + random point inside, TA §18.1),
 * generate placeholder texture 1 ชุดต่อ mobType (แชร์ข้าม instance), ใส่ entity เข้า scene.
 * caller (app.ts) เรียก update(dtSeconds) ทุก frame แล้ว destroy() ตอนปิด engine.
 *
 * @param renderer pixi renderer (app.renderer) — ใช้ generate placeholder texture
 * @param rng      RNG inject ได้ (default Math.random) — เทสต์ pure logic ใช้ seeded LCG แยกต่างหาก
 *                 (spawn.ts/wander.ts); ที่นี่ default runtime พอ เพราะเป็น glue ไม่ใช่ pure logic ที่เทสต์
 */
export function createMobManager(
  scene: MapSceneHandle,
  map: MapConfig,
  config: EngineConfig,
  renderer: Renderer,
  rng: RngFn = defaultRng,
): MobManagerHandle {
  const { mob, tileSize } = config;
  const manifest = createMobAnimationManifest(mob.animation);
  const isWalkable = walkableFromMap(map);

  // texture ต่อ mobType — generate ครั้งเดียว, ใช้ร่วมกันทุก instance ของ type เดียวกัน
  // (ห้าม generate ต่อตัว — เปลือง GPU โดยไม่จำเป็น, ดู placeholder.ts).
  const texturesByType = new Map<string, MobTextureSet>();
  const styleFor = (mobType: string): MobStyle =>
    mob.styles[mobType] ?? mob.defaultStyle;
  const texturesFor = (mobType: string): MobTextureSet => {
    let set = texturesByType.get(mobType);
    if (!set) {
      set = generateMobTextures(renderer, manifest, styleFor(mobType));
      texturesByType.set(mobType, set);
    }
    return set;
  };

  const areaByPocket = new Map(
    map.mobPockets.map((p) => [p.pocketId, p.area] as const),
  );

  const spawned = spawnAllPockets(map, mob.spawn, rng);

  const mobs = new Map<string, MobInstance>();
  for (const s of spawned) {
    const area = areaByPocket.get(s.pocketId);
    if (!area) continue; // ปกติไม่เกิด — spawnAllPockets วนจาก map.mobPockets เอง (ดู spawn.ts)

    const textures = texturesFor(s.mobType);
    const animator = createSpriteAnimator(textures, manifest, {
      animation: "idle",
      direction: INITIAL_FACING,
    });

    scene.addEntity(s.id, animator.view, s.tile);
    mobs.set(s.id, {
      id: s.id,
      area,
      pos: { tx: s.tile.tx, ty: s.tile.ty },
      wander: createWanderState(mob.wander, rng),
      facing: INITIAL_FACING,
      animation: "idle",
      animator,
    });
  }

  return {
    get count() {
      return mobs.size;
    },

    update(dtSeconds: number): void {
      for (const m of mobs.values()) {
        const result = stepWander(
          m.pos,
          m.wander,
          dtSeconds,
          m.area,
          mob.wander,
          isWalkable,
          rng,
        );
        m.wander = result.state;
        if (result.pos.tx !== m.pos.tx || result.pos.ty !== m.pos.ty) {
          m.pos = result.pos;
          scene.moveEntity(m.id, m.pos);
        }

        m.facing = resolveDirection(m.wander.intent, tileSize, m.facing);
        const movingIntent =
          m.wander.intent.tx * m.wander.intent.tx +
            m.wander.intent.ty * m.wander.intent.ty >=
          MOVE_EPS;
        m.animation = m.wander.mode === "walking" && movingIntent ? "walk" : "idle";

        m.animator.setState(m.animation, m.facing);
        m.animator.update(dtSeconds);
      }
    },

    destroy(): void {
      // หมายเหตุ: **ไม่** เรียก m.animator.destroy() ต่อตัว — มันจะ destroy `textures` ที่แชร์กัน
      // ข้าม instance ของ mobType เดียวกัน (ทำลาย texture ของตัวอื่นที่ยังไม่ destroy ไปด้วย).
      // ปล่อย texture รวมทีเดียวหลัง remove entity ครบทุกตัวแทน (ดู texturesByType ด้านล่าง).
      for (const m of mobs.values()) {
        scene.removeEntity(m.id); // destroy sprite view เท่านั้น
      }
      mobs.clear();
      for (const set of texturesByType.values()) set.destroy();
      texturesByType.clear();
    },
  };
}
