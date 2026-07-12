// Combat stub glue — pixi glue (P0-10, P0_SCOPE_LOCK §4.9). Plain TS + PixiJS เท่านั้น
// (ห้าม React/Next) — src/game/** ใช้ engine ผ่าน public API เท่านั้น (LocalPlayerHandle/
// MapSceneHandle/MobManagerHandle) ไม่แตะ pixi.Application ตรง ๆ.
//
// Chain ที่พิสูจน์: กด Space → cooldown check → attack animation (LocalPlayerHandle.triggerAttack)
// → findHits (hit-test.ts, pure) → mob.applyDamage (dummy) → damage number + hitbox debug flash.
//
// ไม่ทำ (P1, ดู P0 §4.9 + AI.md never-change list): skill balance จริง, full damage formula
// (tech §15.2), item drop/EXP/gold, boss mechanic. ตัวเลข damage/hp/cooldown ทั้งหมดเป็น
// Design Knob จาก config.combat (engine/config.ts) — ห้าม hardcode ในไฟล์นี้.

import { Graphics } from "pixi.js";
import type { AttackShapeConfig, EngineConfig, HitboxDebugConfig, TileSize } from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import { tileToScreen } from "@/engine/iso/coords";
import type { Direction } from "@/engine/movement/direction";
import type { LocalPlayerHandle } from "@/engine/player/local-player";
import type { MapSceneHandle } from "@/engine/render/scene";
import type { MobManagerHandle } from "@/game/mob/manager";
import { defaultRng, type RngFn } from "@/game/mob/rng";
import {
  advanceCooldown,
  canAttack,
  findHits,
  rollDummyDamage,
  screenAngleForDirection,
  tileUnitVectorForScreenAngle,
} from "@/game/combat/hit-test";
import { createDamageNumberLayer, type DamageNumberLayerHandle } from "@/game/combat/damage-number";

/** zLayer ของ hitbox debug wedge — เหนือ entity ปกติ (0) แต่ใต้ damage number (50, ดู damage-number.ts). */
const HITBOX_DEBUG_ZLAYER = 40;
/** ความละเอียดของ wedge visual (จำนวนช่วงมุม) — ค่า rendering detail ล้วน ไม่ใช่ balance knob. */
const HITBOX_ARC_SEGMENTS = 16;

export interface CombatStubHandle {
  /** เรียกทุก frame ด้วย dt วินาที — cooldown/attack input/hit test/feedback ทั้งหมดอยู่ที่นี่ */
  update(dtSeconds: number): void;
  /** ลบ hitbox debug + damage number ที่ค้างอยู่ทั้งหมดออกจาก scene */
  destroy(): void;
}

/**
 * วาด wedge (pie slice) แทนพื้นที่ hit test จริง — sample จุดตามขอบ arc ด้วย
 * tileUnitVectorForScreenAngle แล้ว project เข้า screen (tileToScreen ของ delta) เพื่อให้รูปที่เห็น
 * ตรงกับเกณฑ์ที่ findHits ใช้จริงเป๊ะ (ไม่ใช่วงกลม/พัดลมเดา — diamond projection ทำให้ไม่ใช่วงกลมบนจอ).
 */
function buildHitboxWedge(
  facing: Direction,
  attack: AttackShapeConfig,
  tileSize: TileSize,
  style: Pick<HitboxDebugConfig, "color" | "alpha">,
): Graphics {
  const facingAngle = screenAngleForDirection(facing);
  const halfArc = (attack.arcDegrees / 2) * (Math.PI / 180);

  const points: number[] = [0, 0]; // origin = foot ของ attacker (local 0,0)
  for (let i = 0; i <= HITBOX_ARC_SEGMENTS; i++) {
    const theta = facingAngle - halfArc + (2 * halfArc * i) / HITBOX_ARC_SEGMENTS;
    const dir = tileUnitVectorForScreenAngle(theta, tileSize);
    const tilePoint: TilePoint = { tx: dir.tx * attack.radius, ty: dir.ty * attack.radius };
    const s = tileToScreen(tilePoint, tileSize);
    points.push(s.sx, s.sy);
  }

  const g = new Graphics();
  g.poly(points).fill({ color: style.color, alpha: style.alpha });
  g.poly(points).stroke({ color: style.color, alpha: Math.min(1, style.alpha + 0.3), width: 1 });
  return g;
}

let hitboxSeq = 0;

/**
 * สร้าง combat stub 1 ชุด (ต่อ local player 1 คน — P0 มีแค่ local เดียว).
 * caller (app.ts) เรียก update(dtSeconds) ทุก frame แล้ว destroy() ตอนปิด engine.
 *
 * @param rng RNG inject ได้ (default Math.random runtime) — ใช้เฉพาะ dummy damage roll
 */
export function createCombatStub(
  scene: MapSceneHandle,
  player: LocalPlayerHandle,
  mobs: MobManagerHandle,
  config: EngineConfig,
  rng: RngFn = defaultRng,
): CombatStubHandle {
  const { combat, tileSize } = config;
  const damageNumbers: DamageNumberLayerHandle = createDamageNumberLayer(
    scene,
    combat.damageNumber,
  );

  let cooldownRemainingMs = 0;
  let hitbox: { id: string; display: Graphics; elapsedMs: number } | null = null;

  const clearHitboxDebug = (): void => {
    if (!hitbox) return;
    scene.removeEntity(hitbox.id);
    hitbox = null;
  };

  const spawnHitboxDebug = (origin: TilePoint, facing: Direction): void => {
    clearHitboxDebug(); // stub เดียวพอ (ไม่ pool หลายอันซ้อน)
    const display = buildHitboxWedge(facing, combat.attack, tileSize, combat.hitboxDebug);
    const id = `hitbox-debug:${hitboxSeq++}`;
    scene.addEntity(id, display, origin, HITBOX_DEBUG_ZLAYER);
    hitbox = { id, display, elapsedMs: 0 };
  };

  return {
    update(dtSeconds: number): void {
      cooldownRemainingMs = advanceCooldown(cooldownRemainingMs, dtSeconds);

      if (player.consumeAttackPressed() && canAttack(cooldownRemainingMs)) {
        cooldownRemainingMs = combat.attack.cooldownMs;
        player.triggerAttack();

        const targets = mobs.getAliveTargets();
        const hitIds = findHits(player.position, player.facing, targets, tileSize, combat.attack);
        for (const id of hitIds) {
          const target = targets.find((t) => t.id === id);
          if (!target) continue; // ปกติไม่เกิด — hitIds มาจาก targets ชุดเดียวกัน
          const damage = rollDummyDamage(combat.dummyDamage, rng);
          mobs.applyDamage(id, damage);
          damageNumbers.spawn(target.pos, damage);
        }

        if (combat.hitboxDebug.enabled) {
          spawnHitboxDebug(player.position, player.facing);
        }
      }

      if (hitbox) {
        hitbox.elapsedMs += dtSeconds * 1000;
        const duration = combat.hitboxDebug.durationMs;
        const progress = duration > 0 ? Math.min(1, hitbox.elapsedMs / duration) : 1;
        if (progress >= 1) {
          clearHitboxDebug();
        } else {
          hitbox.display.alpha = 1 - progress;
        }
      }

      damageNumbers.update(dtSeconds);
    },

    destroy(): void {
      clearHitboxDebug();
      damageNumbers.destroy();
    },
  };
}
