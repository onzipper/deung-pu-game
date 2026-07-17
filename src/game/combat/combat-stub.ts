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
import type { AssetRegistry } from "@/engine/assets/registry";
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
import { getMobNameEntry } from "@/game/mob/name-catalog";
import type { ClientSkillView } from "@/game/skill/views";
import type { CastSkillMessage, PlayerDamagedMessage, SkillResultMessage } from "@/shared/net-protocol";
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
import {
  createDamageNumberLayer,
  type DamageNumberLayerConfig,
  type DamageNumberLayerHandle,
} from "@/game/combat/damage-number";
import {
  advanceHitStop,
  computeHitStopTimeScale,
  createHitStopState,
  triggerHitStop,
  type HitStopState,
} from "@/game/combat/hit-stop";
import { resolveJuiceLevel } from "@/game/combat/juice-level";
import { createSkillVfxManager, type SkillVfxManagerHandle } from "@/game/combat/skill-vfx";
import { getSoundManager } from "@/engine/audio/sound-manager";
import { isBigDamage, resolveImpactTier } from "@/game/combat/damage-tier";
import {
  advanceCameraFlash,
  computeCameraFlashAlpha,
  createCameraFlashState,
  triggerCameraFlash,
  type CameraFlashState,
  type CameraFlashStyleConfig,
} from "@/game/combat/camera-flash";
import { createParticleBurstLayer, type ParticleBurstLayerHandle } from "@/game/combat/impact-particles";
import { scaleParticleBurstCount } from "@/game/combat/particle-burst";
import {
  combatJuiceQualityScale,
  DEFAULT_COMBAT_JUICE_CONFIG,
  isQualityAtLeast,
  type CombatJuiceConfig,
} from "@/game/combat/juice-config";

/** zLayer ของ hitbox debug wedge — เหนือ entity ปกติ (0); damage number ไม่ใช้ scene zLayer อีกต่อไป
 *  (P1-06: อยู่ layer แยกที่เป็น child หลังสุดของ scene.world เสมอ — ดู damage-number.ts). */
const HITBOX_DEBUG_ZLAYER = 40;
/** ความละเอียดของ wedge visual (จำนวนช่วงมุม) — ค่า rendering detail ล้วน ไม่ใช่ balance knob. */
const HITBOX_ARC_SEGMENTS = 16;
/** Wave 2 SFX (D-065): hit/crit/kill ของ caster อื่น (ไม่ใช่ own cast) เบาลงเหลือสัดส่วนนี้ — ยังให้ signal
 *  ว่ามีการต่อสู้เกิดขึ้นรอบตัว แต่ไม่ดังเท่าของตัวเอง. ค่า cosmetic audio mix ล้วน ไม่ใช่ balance knob (§48). */
const REMOTE_HIT_SFX_VOLUME_SCALE = 0.35;
/**
 * Combat Juice F5 camera flash overlay: ครึ่งขนาด (px) ของสี่เหลี่ยม screen-space ที่วาดรอบจุด (0,0) local —
 * ใหญ่พอครอบทุกความละเอียดจอจริง (ปกติ ≤ 4K ~3840px) โดยไม่ต้องรู้ viewport จริง (เทคนิค "world-position
 * cancel" — ดู comment ยาวที่จุดสร้าง cameraFlashOverlay ด้านล่าง).
 */
const CAMERA_FLASH_HALF_SIZE_PX = 6000;

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
  /**
   * F4 (ASSET_PRODUCTION_BIBLE §14 skill VFX): atlas registry เดียวกับที่ mob/player/prop peek —
   * ส่งเข้ามาให้ skill-vfx manager หาเอฟเฟกต์ของสกิลที่ cast. ไม่ส่ง (undefined) = VFX เงียบ ไม่ spawn
   * อะไรเลย (fail-soft, ไม่ throw — เกมเล่นได้ปกติแค่ไม่เห็นเอฟเฟกต์).
   */
  registry?: AssetRegistry;
  /**
   * Combat Juice F5: knob group สำหรับ impact flash/particle/death-vfx/camera-flash/damage-number extras —
   * ยังไม่มีที่อยู่ใน src/engine/config/** (game-specialist scope = src/game/** เท่านั้น, ดู
   * game/combat/juice-config.ts module header). ไม่ส่ง (undefined) = DEFAULT_COMBAT_JUICE_CONFIG (inject
   * ได้เพื่อเทสต์/tune ภายหลังโดยไม่แก้โค้ด).
   */
  juiceConfig?: CombatJuiceConfig;
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
   * Combat Juice F5 (A1 §2): รับ MSG_PLAYER_DAMAGED (broadcast, มอน contact ใส่ผู้เล่น) → เล่นเลข damage
   * โทน "incoming" เหนือหัว local player + shake/camera-flash เบา ๆ **เฉพาะ isSelf เท่านั้น** (ยังไม่รองรับ
   * remote player position — ดู module header/report: ต้อง remote-player-manager position lookup ซึ่งอยู่
   * นอกไฟล์นี้). caller (app.ts) เทียบ `msg.sessionId === net.status.selfSessionId` เหมือน onSkillResult.
   */
  onPlayerDamaged(msg: PlayerDamagedMessage, isSelf: boolean): void;
  /**
   * DEV-ONLY (P1-06 §5 stress harness) — spawn เลข damage สังเคราะห์ตรง ๆ ผ่าน pool/aggregate จริง
   * (พิสูจน์ budget ด้วยเส้นทางการผลิตจริง). ไม่ผ่าน validate/cooldown/server — caller (stress harness
   * glue, dev hotkey เท่านั้น) รับผิดชอบไม่เรียกใน production path.
   */
  spawnSyntheticDamageNumber(tile: TilePoint, amount: number, crit: boolean): void;
  /**
   * F4: เล่น VFX ของสกิล skillId ที่ตำแหน่ง/ทิศ player ปัจจุบัน — S1 เรียกเองข้างในที่ update() (ดู cast site),
   * ส่วน S2-4 (discrete cast, hotbar A3) อยู่นอกไฟล์นี้ที่ app.ts `castSlot` → caller (app.ts) เรียก method
   * นี้เองหลัง sendCast (ดู F4 brief report สำหรับ hook line ที่ต้องเติม).
   */
  playSkillVfx(skillId: string): void;
  /** ลบ hitbox debug + damage number + skill VFX ที่ค้างอยู่ทั้งหมดออกจาก scene */
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
  // Combat Juice F5: knob group แยกจาก combatFeel (engine) — ดู juice-config.ts module header + CombatStubDeps doc.
  const juiceConfig: CombatJuiceConfig = deps.juiceConfig ?? DEFAULT_COMBAT_JUICE_CONFIG;
  // F5: ประกอบ config ที่ damage-number.ts ต้องการจริง (engine normal/crit/aggregate + F5 incoming/pop) —
  // structural spread, ไม่แตะ engine config type/file (ดู DamageNumberLayerConfig doc).
  const damageNumberConfig: DamageNumberLayerConfig = {
    ...combatFeel.damageNumber,
    incoming: juiceConfig.damageNumber.incoming,
    popScaleByKind: juiceConfig.damageNumber.popScaleByKind,
    popDurationMs: juiceConfig.damageNumber.popDurationMs,
  };
  const damageNumbers: DamageNumberLayerHandle = createDamageNumberLayer(
    scene,
    damageNumberConfig,
    combatFeel.effectQuality,
    tileSize,
  );
  // F4 (ASSET_PRODUCTION_BIBLE §14): skill VFX manager — deps.registry อาจ undefined (fail-soft, spawn() no-op)
  const skillVfx: SkillVfxManagerHandle = createSkillVfxManager(scene, config, deps.registry);
  /** เล่น VFX ของ skillId ที่ตำแหน่ง/ทิศ player ปัจจุบัน — ใช้ทั้ง S1 cast site (ด้านล่าง) และ playSkillVfx()
   *  (handle method ที่ caller ภายนอกเรียกสำหรับ S2-4, ดู CombatStubHandle doc). */
  const triggerSkillVfx = (skillId: string): void => {
    skillVfx.spawn(skillId, player.position, player.facing);
  };
  // Combat Juice F5: spark/death-burst/loot-sparkle ใช้ pool เดียวกัน (budget เดียว, ดู impact-particles.ts).
  const particles: ParticleBurstLayerHandle = createParticleBurstLayer(
    scene,
    juiceConfig.impactParticles.poolSize,
    tileSize,
    rng,
  );

  // P1-06 juice state (per combat-stub instance = per local player) — ดู module header
  const hitStopState: HitStopState = createHitStopState();
  const shakeState: ShakeState = createShakeState();
  const currentShakeAmplitudeScale = (feel: CombatFeelConfig): number =>
    feel.effectQuality.tiers[feel.effectQuality.current].shakeAmplitudeScale;

  // Combat Juice F5 camera flash (ขอบจอวาบสี ตอน crit ใหญ่/โดนตี) — screen-space overlay ผ่านเทคนิค "world
  // position cancel": rect ใหญ่มาก (±CAMERA_FLASH_HALF_SIZE_PX) เป็นลูกของ scene.world (public field)
  // วางตำแหน่ง local = -world.position ทุกเฟรม → หักล้าง pan ของกล้อง (world.position + localPos ≈ (0,0)
  // เสมอ ไม่ว่ากล้องจะอยู่ไหน) โดยไม่ต้องรู้ viewport จริง เหมือน damage-number layer ที่ add เข้า scene.world
  // ตรง ๆ (pattern เดียวกัน) แต่ overlay นี้ต้อง**บนสุดจริง**จึง add หลัง particles/damageNumbers (ลำดับ
  // z ของ pixi = ลำดับ addChild). ระบายสีใหม่เฉพาะตอน state.color เปลี่ยนจริง (ไม่ redraw ทุกเฟรม — perf).
  const cameraFlashState: CameraFlashState = createCameraFlashState();
  const cameraFlashOverlay = new Graphics();
  cameraFlashOverlay.alpha = 0;
  scene.world.addChild(cameraFlashOverlay);
  let cameraFlashDrawnColor: number | null = null;
  const redrawCameraFlashOverlay = (color: number): void => {
    cameraFlashOverlay.clear();
    cameraFlashOverlay
      .rect(
        -CAMERA_FLASH_HALF_SIZE_PX,
        -CAMERA_FLASH_HALF_SIZE_PX,
        CAMERA_FLASH_HALF_SIZE_PX * 2,
        CAMERA_FLASH_HALF_SIZE_PX * 2,
      )
      .fill({ color });
    cameraFlashDrawnColor = color;
  };
  /** true = quality ปัจจุบันพอสำหรับ camera flash (ของแพงสุดในชุด F5 — ปิดที่ low ตาม invariant). */
  const cameraFlashAllowed = (): boolean =>
    juiceConfig.cameraFlash.enabled &&
    isQualityAtLeast(combatFeel.effectQuality.current, juiceConfig.cameraFlash.minQuality);
  const fireCameraFlash = (style: CameraFlashStyleConfig): void => {
    if (!cameraFlashAllowed()) return;
    triggerCameraFlash(cameraFlashState, style);
  };

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
  /** Combat Juice F5: cache mobType คู่กับ lastMobPos (id → mobType) — ใช้เลือกสี death burst ตาม rank
   *  แม้มอนเพิ่ง despawn ไปแล้วตอน killing blow (เหตุผลเดียวกับ lastMobPos). */
  const lastMobType = new Map<string, string>();

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
      lastMobType.clear();
      for (const t of mobs.getAliveTargets()) {
        lastMobPos.set(t.id, { tx: t.pos.tx, ty: t.pos.ty });
        lastMobType.set(t.id, t.mobType);
      }

      // consume เสมอ (เคลียร์ edge กันค้าง) แต่ยิงจริงเฉพาะเมื่อ combat เปิด (P1-11: safe zone → ไม่ยิง).
      const attackPressed = player.consumeAttackPressed();
      if (combatEnabled && attackPressed && canAttack(cooldownRemainingMs)) {
        cooldownRemainingMs = cooldownMs; // client-side predictive gate (server = authority จริง)
        player.triggerAttack(); // anticipation ทันที — ไม่รอ server (TA §6)
        getSoundManager().playSfx("swing"); // Wave 2 SFX (D-065): ทุก local swing ได้ยินเสมอ (own action)
        triggerSkillVfx(skill.skillId); // F4: VFX ของ S1 เล่นทันทีพร้อม anticipation (ไม่รอ online/offline branch)

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
      skillVfx.update(juiceDtSeconds * 1000); // F4: ผูก tick เดียวกับ damage number/hitbox fade (hit-stop scaled)
      particles.update(juiceDtSeconds * 1000); // F5: spark/death-burst/loot-sparkle ผูก tick เดียวกัน (hit-stop scaled)

      // P1-06 screen shake (GS §17.5): decay real-time (ไม่ผูกกับ hit-stop scale) → ดัน offset เข้า
      // scene ทุก frame ก่อน app.ts เรียก scene.update() (ลำดับ tick เดียวกัน, ดู runtime/app.ts).
      advanceShake(shakeState, dtSeconds * 1000);
      scene.setCameraShakeOffset(
        combatFeel.screenShake.enabled ? computeShakeOffset(shakeState, rng) : { sx: 0, sy: 0 },
      );

      // F5 camera flash: decay real-time เหมือน shake (ไม่ผูก hit-stop scale) — redraw สีเฉพาะตอนเปลี่ยนจริง.
      // gate ด้วย cameraFlashAllowed() ทุกเฟรม (ไม่ใช่แค่ตอน trigger) เหมือน screenShake.enabled ด้านบน —
      // เปลี่ยน quality กลาง flash ที่กำลังเล่นอยู่ก็ตัดทันที ไม่ทิ้งค้างจนจบ decay.
      advanceCameraFlash(cameraFlashState, dtSeconds * 1000);
      const flashAlpha = cameraFlashAllowed() ? computeCameraFlashAlpha(cameraFlashState) : 0;
      if (flashAlpha > 0 && cameraFlashDrawnColor !== cameraFlashState.color) {
        redrawCameraFlashOverlay(cameraFlashState.color);
      }
      cameraFlashOverlay.alpha = flashAlpha;
      // หักล้าง camera pan (scene.world.position เฟรมก่อนหน้า — ดู comment ตอนสร้าง overlay ด้านบน)
      cameraFlashOverlay.position.set(-scene.world.position.x, -scene.world.position.y);
    },

    onSkillResult(result: SkillResultMessage, isOwnCast: boolean): void {
      const hits = result.hits;
      hits.forEach((hit, index) => {
        const pos = lastMobPos.get(hit.mobId);
        if (!pos) return; // มอนไม่รู้จัก/หายไปเกิน 1 เฟรม — ข้าม

        // F5: จัดกลุ่มความหนักของ hit นี้ (สไตล์ล้วน ๆ ไม่กระทบ balance) — ใช้เลือกสี/จำนวน flash+particle
        const tier = resolveImpactTier({ dmg: hit.dmg, crit: hit.crit }, juiceConfig.damageTier);

        // F5 multi-hit stagger: มี >1 เป้าในผลเดียวกัน (AoE) → เรียงจังหวะกันเลขทับ/โผล่พร้อมกันทื่อๆ
        const spawnDelayMs = hits.length > 1 ? index * juiceConfig.damageNumber.multiHitStaggerMs : 0;
        damageNumbers.spawn(pos, hit.dmg, { crit: hit.crit, targetId: hit.mobId, spawnDelayMs });

        // F5 impact flash + spark particles: ทุก caster (ไม่ gate own-cast — feedback ผูกกับตัวมอนเอง/จุด
        // กระทบ ไม่ใช่จอผู้เล่นคนเดียว เหมือน damage number/SFX ด้านล่าง).
        if (juiceConfig.impactFlash.enabled) {
          mobs.flashHit(hit.mobId, juiceConfig.impactFlash.stylesByTier[tier]);
        }
        if (juiceConfig.impactParticles.enabled) {
          const scale = combatJuiceQualityScale(
            juiceConfig.impactParticles.countScaleByQuality,
            combatFeel.effectQuality.current,
          );
          particles.spawn(pos, scaleParticleBurstCount(juiceConfig.impactParticles.stylesByTier[tier], scale));
        }

        // Wave 2 SFX (D-065): hit/crit/kill ได้ยินทุก caster เหมือน damage number (ไม่ gate ทิ้งแบบ hit
        // stop/screen shake ด้านล่าง) — เบาลงถ้าไม่ใช่ own cast ให้ signal ว่ามีการต่อสู้รอบตัวโดยไม่หนวกหู.
        getSoundManager().playSfx(
          hit.killed ? "kill" : hit.crit ? "crit" : "hit",
          isOwnCast ? 1 : REMOTE_HIT_SFX_VOLUME_SCALE,
        );

        // owner report: hit stop/screen shake ต้อง trigger เฉพาะผลจาก cast ของตัวเอง — เพื่อนตีมอบตายอีกฝั่ง
        // ไม่ควรทำให้จอเราสั่น/หยุด (เลข damage number ข้างบนยังโชว์ทุก caster เหมือนเดิม, ไม่ gate).
        if (!isOwnCast) return;

        // F5: hit ที่ trigger hit-stop/shake อยู่แล้ว (crit/kill) แต่ dmg ก็ "big" ด้วย → ยกระดับอีกขั้น
        // (tune magnitude เท่านั้น — ไม่เปลี่ยนเงื่อนไข "trigger เมื่อไหร่" เดิมของ combatFeel เลย)
        const bigHitFloor = isBigDamage(hit.dmg, juiceConfig.damageTier)
          ? juiceConfig.hitStopBigHit.minLevelOnBigHit
          : 0;

        // P1-06 (GS §17.5): hit stop เมื่อ crit/kill เท่านั้น — ระดับตาม skill.hitStopLevel (client manifest),
        // ยกขึ้นด้วย minLevelOnKill/minLevelOnCrit (feel floor, ดู juice-level.ts) กัน skill level ต่ำ (S1=0)
        // ทำให้ kill/crit ไม่รู้สึกอะไรเลย.
        if (hit.crit || hit.killed) {
          const hitStopLevel = Math.max(
            resolveJuiceLevel({
              baseLevel: skill.hitStopLevel,
              killed: hit.killed,
              crit: hit.crit,
              minLevelOnKill: combatFeel.hitStop.minLevelOnKill,
              minLevelOnCrit: combatFeel.hitStop.minLevelOnCrit,
            }),
            bigHitFloor,
          );
          triggerHitStop(hitStopState, hitStopLevel, combatFeel.hitStop.durationMsByLevel);
        }
        // screen shake: crit/kill เสมอ **หรือ** skill.screenShakeLevel สูงพอ (เช่น ultimate-tier) แม้ hit
        // นั้นไม่ crit/ไม่ฆ่า (alwaysTriggerAtLevel = knob, ดู engine/config.ts)
        const shouldShake =
          hit.crit || hit.killed || skill.screenShakeLevel >= combatFeel.screenShake.alwaysTriggerAtLevel;
        if (shouldShake) {
          const shakeLevel = Math.max(
            resolveJuiceLevel({
              baseLevel: skill.screenShakeLevel,
              killed: hit.killed,
              crit: hit.crit,
              minLevelOnKill: combatFeel.screenShake.minLevelOnKill,
              minLevelOnCrit: combatFeel.screenShake.minLevelOnCrit,
            }),
            bigHitFloor,
          );
          triggerShake(
            shakeState,
            shakeLevel,
            combatFeel.screenShake.levelsByLevel,
            currentShakeAmplitudeScale(combatFeel),
          );
        }

        // F5 camera flash: crit ที่ dmg ก็สูงพอ (critMinDamage) → วาบขอบจอสั้น ๆ (own cast เท่านั้น)
        if (hit.crit && hit.dmg >= juiceConfig.cameraFlash.critMinDamage) {
          fireCameraFlash(juiceConfig.cameraFlash.critStyle);
        }

        // F5 death VFX: burst สีตาม mob rank + loot sparkle เสริมทอง (ผูกกับ "เราฆ่าเอง" ตรง ๆ — ไม่รอ sync
        // กับ MSG_PLAYER_PROGRESS จริงเพราะ SkillResultMessage ไม่มี field รางวัล; เกือบทุกกรณีตรงกันเพราะ
        // ฆ่าเองมีสิทธิ์รางวัลอยู่แล้ว §10.2/§10.3 — deviation ที่ยอมรับได้ใน scope juice ล้วน).
        if (hit.killed && juiceConfig.deathVfx.enabled) {
          const mobType = lastMobType.get(hit.mobId);
          const rank = mobType ? (getMobNameEntry(mobType)?.rank ?? "normal") : "normal";
          const scale = combatJuiceQualityScale(
            juiceConfig.deathVfx.countScaleByQuality,
            combatFeel.effectQuality.current,
          );
          particles.spawn(pos, scaleParticleBurstCount(juiceConfig.deathVfx.burstByRank[rank], scale));
          particles.spawn(pos, scaleParticleBurstCount(juiceConfig.deathVfx.lootSparkleStyle, scale));
        }
      });
    },

    onPlayerDamaged(msg: PlayerDamagedMessage, isSelf: boolean): void {
      // F5 (A1 §2): ยังไม่รองรับ remote player position (ต้อง remote-player-manager lookup นอกไฟล์นี้) —
      // self เท่านั้นตอนนี้ (ดู CombatStubHandle doc / report).
      if (!isSelf) return;
      damageNumbers.spawn(player.position, msg.dmg, { incoming: true, targetId: "self" });
      triggerShake(
        shakeState,
        juiceConfig.selfDamagedFeedback.shakeLevel,
        combatFeel.screenShake.levelsByLevel,
        currentShakeAmplitudeScale(combatFeel),
      );
      fireCameraFlash(juiceConfig.cameraFlash.selfDamagedStyle);
    },

    spawnSyntheticDamageNumber(tile: TilePoint, amount: number, crit: boolean): void {
      // DEV-ONLY (P1-06 §5 stress harness, F4) — ผ่าน pool/aggregate เดียวกับของจริงเพื่อพิสูจน์ budget
      // ด้วยเส้นทางการผลิตจริง (ไม่ใช่ pool แยกต่างหาก). ไม่ validate/cooldown/server — ห้ามเรียกนอก dev tool.
      damageNumbers.spawn(tile, amount, { crit, targetId: "stress" });
    },

    playSkillVfx(skillId: string): void {
      triggerSkillVfx(skillId);
    },

    destroy(): void {
      clearHitboxDebug();
      damageNumbers.destroy();
      skillVfx.destroy();
      particles.destroy();
      cameraFlashOverlay.parent?.removeChild(cameraFlashOverlay);
      cameraFlashOverlay.destroy();
      scene.setCameraShakeOffset({ sx: 0, sy: 0 });
    },
  };
}
