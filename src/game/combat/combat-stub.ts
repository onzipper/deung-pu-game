// Combat client coordinator — pixi glue (P0-10 stub → P1-05 server-authoritative). Plain TS + PixiJS
// เท่านั้น (ห้าม React/Next) — src/game/** ใช้ engine ผ่าน public API เท่านั้น (LocalPlayerHandle/
// MapSceneHandle/MobViewHandle) ไม่แตะ pixi.Application ตรง ๆ.
//
// P1-05 (TA §15/§16.2/§6): combat = **server-authoritative**. บทบาทฝั่ง client ที่นี่:
//   กด Space → cooldown gate (predictive) → เล่น anticipation animation **ทันที** (ไม่รอ server, §6)
//   → **online**: ส่ง cast intent (skillId + aim + ทิศ) ให้ server ผ่าน `castSkill`; damage/ตาย จริง
//     มาทาง MSG_SKILL_RESULT (onSkillResult) + mob despawn ผ่าน state (mob view manager).
//   → **offline** (ไม่มี server): non-authoritative playground — เล่น dummy damage number เดิม
//     (findHits local + rollDummyDamage) ไม่ฆ่ามอน (authority = server). ระบุชัดว่า offline = ไม่จริง.
//
// **ไม่ import สูตร damage (formula.ts)** — สูตรเป็น server-only (TA §7/§16.1, กันหลุด client bundle).
// ที่นี่ใช้แค่ geometry (hit-test.ts, shared) สำหรับ offline dummy + hitbox debug + aim.
//
// P1-06 (TA §11 · GS §17.5): hit stop + screen shake จัดการ **ในไฟล์นี้เอง** (ไม่ต้องแก้ app.ts ticker) —
// hit-stop time-scale ใช้กับ juice update เท่านั้น (damage number/hitbox fade); cooldown/attack input
// ยังใช้ dt จริงเสมอ. shake decay เป็น real-time เสมอ (ไม่ผูกกับ hit-stop scale) แล้วดัน offset เข้า
// `scene.setCameraShakeOffset()` ทุก frame ก่อน app.ts เรียก scene.update(). ค่า cosmetic/timing ทั้งหมด
// เป็น Design Knob จาก config.combatFeel — ห้าม hardcode.
//
// owner report follow-up ("เราไม่เห็นคนอื่นกำลังโจมตีจากจอเรา"): onSkillResult รับ `isOwnCast` เพิ่ม (caller
// เทียบ result.casterId กับ net.status.selfSessionId) — **hit stop/screen shake gate เฉพาะ own cast**
// (เพื่อนตีมอบตายอีกฝั่งไม่ควรทำให้จอเราสั่น/หยุด); เลข damage number ยังโชว์ทุก caster เหมือนเดิม (ไม่ gate,
// §16.2/§6). remote attack **animation** playback (คนอื่นเห็นเราตี/เราเห็นคนอื่นตี) แยกอยู่ที่
// remote-player-manager.ts playAttack() — ไม่เกี่ยวกับไฟล์นี้ (ไฟล์นี้คุมแค่ local player + juice).
// P1 scope: skill เดียวที่ cast ได้คือ `deps.skill` (S1, ปุ่มโจมตีเดียว) → onSkillResult ใช้
// hitStopLevel/screenShakeLevel จากตัวนี้ตรง ๆ (ไม่ lookup หลายสกิล — hotbar หลายสกิล = P2).

import { Graphics } from "pixi.js";
import type {
  AttackShapeConfig,
  CombatFeelConfig,
  EngineConfig,
  HitboxDebugConfig,
  TileSize,
} from "@/engine/config";
import type { TilePoint } from "@/engine/iso/coords";
import { tileToScreen } from "@/engine/iso/coords";
import type { Direction } from "@/engine/movement/direction";
import type { LocalPlayerHandle } from "@/engine/player/local-player";
import type { MapSceneHandle } from "@/engine/render/scene";
import {
  advanceShake,
  computeShakeOffset,
  createShakeState,
  triggerShake,
  type ShakeState,
} from "@/engine/render/screen-shake";
import type { MobViewHandle } from "@/game/mob/manager";
import type { ClientSkillView } from "@/game/skill/views";
import type { CastSkillMessage, SkillResultMessage } from "@/shared/net-protocol";
import { defaultRng, type RngFn } from "@/game/mob/rng";
import {
  advanceCooldown,
  canAttack,
  findHits,
  rollDummyDamage,
  screenAngleForDirection,
  tileUnitVectorForScreenAngle,
  type AttackShape,
} from "@/game/combat/hit-test";
import { createDamageNumberLayer, type DamageNumberLayerHandle } from "@/game/combat/damage-number";
import {
  advanceHitStop,
  computeHitStopTimeScale,
  createHitStopState,
  triggerHitStop,
  type HitStopState,
} from "@/game/combat/hit-stop";
import { resolveJuiceLevel } from "@/game/combat/juice-level";

/** zLayer ของ hitbox debug wedge — เหนือ entity ปกติ (0); damage number ไม่ใช้ scene zLayer อีกต่อไป
 *  (P1-06: อยู่ layer แยกที่เป็น child หลังสุดของ scene.world เสมอ — ดู damage-number.ts). */
const HITBOX_DEBUG_ZLAYER = 40;
/** ความละเอียดของ wedge visual (จำนวนช่วงมุม) — ค่า rendering detail ล้วน ไม่ใช่ balance knob. */
const HITBOX_ARC_SEGMENTS = 16;

/** dependencies ที่ caller (app.ts) เชื่อมกับ net/skill layer (P1-05). */
export interface CombatStubDeps {
  /** สกิลที่ผูกกับปุ่มโจมตี (P1-05: skill แรกของนักดาบ, **client view** — ไม่มี server-only field). */
  skill: ClientSkillView;
  /** ส่ง cast intent ขึ้น server (online). caller เชื่อมกับ net.sendCast (no-op ถ้า offline). */
  castSkill: (msg: CastSkillMessage) => void;
  /** true = online (server authority) → ส่ง intent; false = offline → dummy playground. */
  isOnline: () => boolean;
  /**
   * P1-11 (GS §14 Safe Zone): false = **ไม่มี combat ในโซนนี้** (เมือง) → กด Space/แตะมอน = no-op
   * (client disable ปุ่มโจมตี; server ก็ปฏิเสธ cast ซ้ำอีกชั้น). default (ไม่ส่ง) = true (field ปกติ).
   */
  combatEnabled?: boolean;
  /** RNG inject (offline dummy damage เท่านั้น; default Math.random). */
  rng?: RngFn;
}

export interface CombatStubHandle {
  /** เรียกทุก frame ด้วย dt วินาที — cooldown/attack input/cast/feedback ทั้งหมดอยู่ที่นี่ */
  update(dtSeconds: number): void;
  /**
   * P1-05: รับ MSG_SKILL_RESULT (broadcast) → เล่น damage number ที่ตำแหน่งมอนที่โดน (ทุก caster —
   * เลข = cosmetic client-side, §16.2/§6). ตำแหน่งจาก cache ล่าสุด (killing blow ที่ despawn ไปแล้ว
   * ยังมีตำแหน่งใน cache 1 เฟรม).
   * @param isOwnCast true เฉพาะเมื่อ result.casterId เป็นตัวเราเอง — caller (app.ts) เทียบกับ
   *   net.status.selfSessionId. **hit stop + screen shake trigger เฉพาะ own cast** (owner report: เพื่อน
   *   ตีมอบตายอีกฝั่งไม่ควรทำให้จอเราสั่น/หยุด) — เลข damage number ยังโชว์ทุก caster เหมือนเดิม (ไม่ gate).
   */
  onSkillResult(result: SkillResultMessage, isOwnCast: boolean): void;
  /**
   * DEV-ONLY (P1-06 §5 stress harness) — spawn เลข damage สังเคราะห์ตรง ๆ ผ่าน pool/aggregate จริง
   * (พิสูจน์ budget ด้วยเส้นทางการผลิตจริง). ไม่ผ่าน validate/cooldown/server — caller (stress harness
   * glue, dev hotkey เท่านั้น) รับผิดชอบไม่เรียกใน production path.
   */
  spawnSyntheticDamageNumber(tile: TilePoint, amount: number, crit: boolean): void;
  /** ลบ hitbox debug + damage number ที่ค้างอยู่ทั้งหมดออกจาก scene */
  destroy(): void;
}

/**
 * วาด wedge (pie slice) แทนพื้นที่ hit test — sample จุดตามขอบ arc ด้วย tileUnitVectorForScreenAngle
 * แล้ว project เข้า screen (tileToScreen ของ delta) ให้รูปที่เห็นตรงกับเกณฑ์ที่ findHits ใช้จริงเป๊ะ
 * (diamond projection → ไม่ใช่วงกลม/พัดลมบนจอ). P1-05: shape = **สกิลจริง** (range/angle จาก definition).
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
 * สร้าง combat coordinator 1 ชุด (ต่อ local player 1 คน). caller (app.ts) เรียก update(dt) ทุก frame,
 * onSkillResult(result) เมื่อ net ส่งผลสกิลมา, destroy() ตอนปิด engine.
 */
export function createCombatStub(
  scene: MapSceneHandle,
  player: LocalPlayerHandle,
  mobs: MobViewHandle,
  config: EngineConfig,
  deps: CombatStubDeps,
): CombatStubHandle {
  const { combat, combatFeel, tileSize } = config;
  const { skill } = deps;
  // P1-11: combat ปิดในโซน safe (เมือง) → gate การกดโจมตี (Space/tap) — default = เปิด (field).
  const combatEnabled = deps.combatEnabled !== false;
  const rng: RngFn = deps.rng ?? defaultRng;
  const damageNumbers: DamageNumberLayerHandle = createDamageNumberLayer(
    scene,
    combatFeel.damageNumber,
    combatFeel.effectQuality,
    tileSize,
  );

  // P1-06 juice state (per combat-stub instance = per local player) — ดู module header
  const hitStopState: HitStopState = createHitStopState();
  const shakeState: ShakeState = createShakeState();
  const currentShakeAmplitudeScale = (feel: CombatFeelConfig): number =>
    feel.effectQuality.tiers[feel.effectQuality.current].shakeAmplitudeScale;

  // shape ของสกิลจริง (client view มี range/radius/angle — shared field): cone/arc/line ใช้ range+angle,
  // circle ใช้ radius; angle null → 360 (รอบตัว). ใช้ทั้ง offline dummy hit + hitbox debug wedge.
  const skillShape: AttackShape = {
    radius: skill.radius != null ? skill.radius : skill.range,
    arcDegrees: skill.angle != null ? skill.angle : 360,
  };
  const debugShape: AttackShapeConfig = {
    radius: skillShape.radius,
    arcDegrees: skillShape.arcDegrees,
    cooldownMs: 0, // ไม่ใช้ (cooldown จริงมาจาก skill.cooldown)
  };
  const cooldownMs = skill.cooldown * 1000;

  let cooldownRemainingMs = 0;
  let hitbox: { id: string; display: Graphics; elapsedMs: number } | null = null;
  /** cache ตำแหน่งมอนล่าสุด (id → foot tile) — ให้ damage number ของ killing blow render ตรงจุด
   *  แม้ mob เพิ่ง despawn (state removal อาจมาก่อน/หลัง skill_result). refresh ทุก frame. */
  const lastMobPos = new Map<string, TilePoint>();

  const clearHitboxDebug = (): void => {
    if (!hitbox) return;
    scene.removeEntity(hitbox.id);
    hitbox = null;
  };

  const spawnHitboxDebug = (origin: TilePoint, facing: Direction): void => {
    clearHitboxDebug(); // stub เดียวพอ (ไม่ pool หลายอันซ้อน)
    const display = buildHitboxWedge(facing, debugShape, tileSize, combat.hitboxDebug);
    const id = `hitbox-debug:${hitboxSeq++}`;
    scene.addEntity(id, display, origin, HITBOX_DEBUG_ZLAYER);
    hitbox = { id, display, elapsedMs: 0 };
  };

  return {
    update(dtSeconds: number): void {
      cooldownRemainingMs = advanceCooldown(cooldownRemainingMs, dtSeconds);

      // refresh cache ตำแหน่งมอน (clone tx/ty — getAliveTargets คืน live reference)
      lastMobPos.clear();
      for (const t of mobs.getAliveTargets()) {
        lastMobPos.set(t.id, { tx: t.pos.tx, ty: t.pos.ty });
      }

      // consume เสมอ (เคลียร์ edge กันค้าง) แต่ยิงจริงเฉพาะเมื่อ combat เปิด (P1-11: safe zone → ไม่ยิง).
      const attackPressed = player.consumeAttackPressed();
      if (combatEnabled && attackPressed && canAttack(cooldownRemainingMs)) {
        cooldownRemainingMs = cooldownMs; // client-side predictive gate (server = authority จริง)
        player.triggerAttack(); // anticipation ทันที — ไม่รอ server (TA §6)

        // aim = จุดหน้า player ตามทิศ facing ที่ระยะสกิล (server ใช้ตรวจ range + ศูนย์กลาง AoE)
        const facingAngle = screenAngleForDirection(player.facing);
        const unit = tileUnitVectorForScreenAngle(facingAngle, tileSize);
        const aim: TilePoint = {
          tx: player.position.tx + unit.tx * skill.range,
          ty: player.position.ty + unit.ty * skill.range,
        };

        if (deps.isOnline()) {
          // online: ส่ง intent → damage/ตาย มาทาง onSkillResult (server authority §7/§15)
          deps.castSkill({
            skillId: skill.skillId,
            aimTx: aim.tx,
            aimTy: aim.ty,
            direction: player.facing,
          });
        } else {
          // offline: non-authoritative playground — dummy damage number เดิม (ไม่ฆ่ามอน)
          const targets = mobs.getAliveTargets();
          const hitIds = findHits(player.position, player.facing, targets, tileSize, skillShape);
          for (const id of hitIds) {
            const target = targets.find((t) => t.id === id);
            if (!target) continue;
            damageNumbers.spawn(target.pos, rollDummyDamage(combat.dummyDamage, rng), {
              targetId: target.id,
            });
          }
        }

        if (combat.hitboxDebug.enabled) {
          spawnHitboxDebug(player.position, player.facing);
        }
      }

      // P1-06 hit stop (GS §17.5): time-scale เฉพาะ "juice update" ด้านล่าง (hitbox fade/damage number)
      // — cooldown/attack input ข้างบนใช้ dtSeconds จริงไปแล้ว, ห้ามแตะ network/mob simulation (แยกไฟล์อื่น).
      // hit stop เดินเวลาแบบ real-time เสมอ (ไม่งั้นจะไม่มีวันหมดเอง).
      const juiceTimeScale = computeHitStopTimeScale(hitStopState, combatFeel.hitStop.timeScale);
      advanceHitStop(hitStopState, dtSeconds * 1000);
      const juiceDtSeconds = dtSeconds * juiceTimeScale;

      if (hitbox) {
        hitbox.elapsedMs += juiceDtSeconds * 1000;
        const duration = combat.hitboxDebug.durationMs;
        const progress = duration > 0 ? Math.min(1, hitbox.elapsedMs / duration) : 1;
        if (progress >= 1) {
          clearHitboxDebug();
        } else {
          hitbox.display.alpha = 1 - progress;
        }
      }

      damageNumbers.update(juiceDtSeconds);

      // P1-06 screen shake (GS §17.5): decay real-time (ไม่ผูกกับ hit-stop scale) → ดัน offset เข้า
      // scene ทุก frame ก่อน app.ts เรียก scene.update() (ลำดับ tick เดียวกัน, ดู runtime/app.ts).
      advanceShake(shakeState, dtSeconds * 1000);
      scene.setCameraShakeOffset(
        combatFeel.screenShake.enabled ? computeShakeOffset(shakeState, rng) : { sx: 0, sy: 0 },
      );
    },

    onSkillResult(result: SkillResultMessage, isOwnCast: boolean): void {
      for (const hit of result.hits) {
        const pos = lastMobPos.get(hit.mobId);
        if (!pos) continue; // มอนไม่รู้จัก/หายไปเกิน 1 เฟรม — ข้าม
        damageNumbers.spawn(pos, hit.dmg, { crit: hit.crit, targetId: hit.mobId });

        // owner report: hit stop/screen shake ต้อง trigger เฉพาะผลจาก cast ของตัวเอง — เพื่อนตีมอบตายอีกฝั่ง
        // ไม่ควรทำให้จอเราสั่น/หยุด (เลข damage number ข้างบนยังโชว์ทุก caster เหมือนเดิม, ไม่ gate).
        if (!isOwnCast) continue;

        // P1-06 (GS §17.5): hit stop เมื่อ crit/kill เท่านั้น — ระดับตาม skill.hitStopLevel (client manifest),
        // ยกขึ้นด้วย minLevelOnKill/minLevelOnCrit (feel floor, ดู juice-level.ts) กัน skill level ต่ำ (S1=0)
        // ทำให้ kill/crit ไม่รู้สึกอะไรเลย.
        if (hit.crit || hit.killed) {
          const hitStopLevel = resolveJuiceLevel({
            baseLevel: skill.hitStopLevel,
            killed: hit.killed,
            crit: hit.crit,
            minLevelOnKill: combatFeel.hitStop.minLevelOnKill,
            minLevelOnCrit: combatFeel.hitStop.minLevelOnCrit,
          });
          triggerHitStop(hitStopState, hitStopLevel, combatFeel.hitStop.durationMsByLevel);
        }
        // screen shake: crit/kill เสมอ **หรือ** skill.screenShakeLevel สูงพอ (เช่น ultimate-tier) แม้ hit
        // นั้นไม่ crit/ไม่ฆ่า (alwaysTriggerAtLevel = knob, ดู engine/config.ts)
        const shouldShake =
          hit.crit || hit.killed || skill.screenShakeLevel >= combatFeel.screenShake.alwaysTriggerAtLevel;
        if (shouldShake) {
          const shakeLevel = resolveJuiceLevel({
            baseLevel: skill.screenShakeLevel,
            killed: hit.killed,
            crit: hit.crit,
            minLevelOnKill: combatFeel.screenShake.minLevelOnKill,
            minLevelOnCrit: combatFeel.screenShake.minLevelOnCrit,
          });
          triggerShake(
            shakeState,
            shakeLevel,
            combatFeel.screenShake.levelsByLevel,
            currentShakeAmplitudeScale(combatFeel),
          );
        }
      }
    },

    spawnSyntheticDamageNumber(tile: TilePoint, amount: number, crit: boolean): void {
      // DEV-ONLY (P1-06 §5 stress harness, F4) — ผ่าน pool/aggregate เดียวกับของจริงเพื่อพิสูจน์ budget
      // ด้วยเส้นทางการผลิตจริง (ไม่ใช่ pool แยกต่างหาก). ไม่ validate/cooldown/server — ห้ามเรียกนอก dev tool.
      damageNumbers.spawn(tile, amount, { crit, targetId: "stress" });
    },

    destroy(): void {
      clearHitboxDebug();
      damageNumbers.destroy();
      scene.setCameraShakeOffset({ sx: 0, sy: 0 });
    },
  };
}
