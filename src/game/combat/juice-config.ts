// Combat Juice config — Design Knob home สำหรับ combat feel รอบใหม่ (F5 "ดุๆ มันส์ๆ เดือดๆ") ที่ยังไม่มีที่อยู่
// ใน src/engine/config/** (ตาม pattern เดียวกับ game/combat/skill-vfx.ts F4 — src/game/** ยังไม่มี config module
// รวมของตัวเอง จนกว่าจะย้ายเข้า engine config module จริงถ้า owner ต้องการ, deviation รายงานกลับ orchestrator).
// Plain TS เท่านั้น — ไม่แตะ src/engine/** (game-specialist scope = src/game/** only, engine ใช้ผ่าน public
// API/type เท่านั้น — DamageNumberStyleConfig/EffectQuality import type จาก @/engine/config).
//
// **ไม่ใช่ balance §48/§15** (ไม่กระทบ damage/hit/RNG จริงเลย — server เป็น truth เสมอ) — ค่าที่นี่คุมแค่
// "ตาเห็นอะไร" ปรับได้อิสระเหมือน combatFeel เดิม (P1-06 comment เดียวกัน).

import type { DamageNumberStyleConfig, EffectQuality } from "@/engine/config";
import type { ImpactTier } from "@/game/combat/damage-tier";
import type { ImpactFlashStyleConfig } from "@/game/combat/impact-flash";
import type { CameraFlashStyleConfig } from "@/game/combat/camera-flash";
import type { ParticleBurstStyle } from "@/game/combat/particle-burst";
import type { MobRank } from "@/game/mob/name-catalog";

/** ตัวคูณจำนวน/ความเข้มต่อ quality tier (เคารพ effect-quality preference เดิมใน settings) — low มักตัดเหลือ 0
 *  ("ปิดของแพง" ตาม invariant), cinematic ได้เกิน 1 ได้ (เหมือน pattern effectQuality.tiers เดิม). */
export interface CombatJuiceQualityScale {
  low: number;
  medium: number;
  high: number;
  cinematic: number;
}

export function combatJuiceQualityScale(scale: CombatJuiceQualityScale, quality: EffectQuality): number {
  return scale[quality];
}

/** F5 impact flash (tint pulse บนมอน) — trigger ทุก caster (เหมือน damage number, ไม่ gate own-cast เพราะ
 *  tint ผูกกับตัวมอนเอง ไม่ใช่จอผู้เล่นคนเดียว). */
export interface ImpactFlashConfig {
  enabled: boolean;
  stylesByTier: Record<ImpactTier, ImpactFlashStyleConfig>;
}

/** F5 impact spark particles (จุดกระทบ) — pooled, gate ด้วย quality scale (low = ปิด). */
export interface ImpactParticlesConfig {
  enabled: boolean;
  /** ขนาด pool รวม (ใช้ร่วมกันทั้ง impact spark + death burst + loot sparkle — 1 layer เดียว) */
  poolSize: number;
  stylesByTier: Record<ImpactTier, ParticleBurstStyle>;
  countScaleByQuality: CombatJuiceQualityScale;
}

/** F5 death VFX — burst สีตาม mob rank + loot sparkle เสริมทองเมื่อ kill นั้นได้ reward (own cast เท่านั้น,
 *  gate เดียวกับ hit-stop/screen-shake — "จอเรา" ไม่ใช่ข้อมูลที่ต้องเห็นทุกคน). */
export interface DeathVfxConfig {
  enabled: boolean;
  burstByRank: Record<MobRank, ParticleBurstStyle>;
  lootSparkleStyle: ParticleBurstStyle;
  countScaleByQuality: CombatJuiceQualityScale;
}

/** F5 camera edge flash (ขอบจอวาบสี ตอน crit ใหญ่ / โดนตี) — own cast/self เท่านั้น, ปิดที่ quality ต่ำกว่า minQuality. */
export interface CameraFlashConfig {
  enabled: boolean;
  critStyle: CameraFlashStyleConfig;
  /** dmg ขั้นต่ำ (บน crit hit) ที่จะ flash — กันเห็นถี่เกินตอน crit เบา ๆ (Design Knob) */
  critMinDamage: number;
  selfDamagedStyle: CameraFlashStyleConfig;
  /** quality ต่ำกว่านี้ (ตาม QUALITY_ORDER) → ปิด camera flash ทั้งหมด (ของแพงสุดในชุด F5) */
  minQuality: EffectQuality;
}

const QUALITY_ORDER: readonly EffectQuality[] = ["low", "medium", "high", "cinematic"];

/** true = quality ปัจจุบันสูงพอสำหรับ effect ที่ตั้ง minQuality ไว้ (ใช้กับ camera flash เป็นหลัก). */
export function isQualityAtLeast(current: EffectQuality, minQuality: EffectQuality): boolean {
  return QUALITY_ORDER.indexOf(current) >= QUALITY_ORDER.indexOf(minQuality);
}

/** F5 damage number extras (ต่อยอด engine combatFeel.damageNumber เดิม — normal/crit) — incoming style
 *  (โทน "โดนตี" แยกจาก "ตี") + pop-bounce + multi-hit stagger. */
export interface DamageNumberJuiceConfig {
  /** สไตล์เลข "โดนตี" (มอนตีเรา) — แยกโทนจาก normal/crit (เลขที่เราตี) ชัดเจน */
  incoming: DamageNumberStyleConfig;
  /** สเกลเริ่มต้นตอนสแปม (pop-in) ก่อนหด ease-out กลับ 1.0 — ดู damage-number-motion.ts */
  popScaleByKind: { normal: number; crit: number; incoming: number };
  popDurationMs: number;
  /** ดีเลย์ (ms) ต่อลำดับ hit เมื่อผลเดียวกันมีหลายเป้า (AoE) — กันเลขโผล่พร้อมกันทื่อๆ/ทับกันที่เป้าติดกัน */
  multiHitStaggerMs: number;
}

/** F5: floor เพิ่มเติมของ hit-stop/screen-shake level เมื่อ hit ที่ **trigger อยู่แล้ว** (crit/killed) เป็น
 *  "big damage" ด้วย (dmg ≥ damageTier.bigHitDamage) — tune "ความหนัก" ไม่ใช่เงื่อนไข "trigger เมื่อไหร่"
 *  (เงื่อนไข trigger เดิมจาก combatFeel คงเดิมทุกจุด กันสแปม hit-stop จาก hit ปกติที่บังเอิญแรง). */
export interface HitStopBigHitConfig {
  minLevelOnBigHit: number;
}

/** F5: feedback ตอน local player โดนมอนตี (MSG_PLAYER_DAMAGED, self เท่านั้น — ดู combat-stub.ts
 *  onPlayerDamaged). ระดับ shake reuse ตาราง combatFeel.screenShake.levelsByLevel เดิม (ไม่สร้างตารางซ้ำ). */
export interface SelfDamagedFeedbackConfig {
  shakeLevel: number;
}

export interface CombatJuiceConfig {
  damageTier: { bigHitDamage: number };
  impactFlash: ImpactFlashConfig;
  impactParticles: ImpactParticlesConfig;
  deathVfx: DeathVfxConfig;
  cameraFlash: CameraFlashConfig;
  damageNumber: DamageNumberJuiceConfig;
  hitStopBigHit: HitStopBigHitConfig;
  selfDamagedFeedback: SelfDamagedFeedbackConfig;
}

const OMNI_QUALITY_SCALE: CombatJuiceQualityScale = {
  low: 0, // ปิดของแพง (invariant: quality ต่ำ = ลด particle/flash)
  medium: 0.6,
  high: 1,
  cinematic: 1.3,
};

export const DEFAULT_COMBAT_JUICE_CONFIG: CombatJuiceConfig = {
  damageTier: {
    bigHitDamage: 40, // อิงช่วง dummy/offline damage (8-14) + player ATK baseline (12) ให้ "big" หมายถึง hit ที่แรงกว่าปกติชัดเจน ~3 เท่า
  },
  impactFlash: {
    enabled: true,
    stylesByTier: {
      normal: { color: 0xffffff, durationMs: 70 },
      big: { color: 0xffcf5c, durationMs: 100 },
      crit: { color: 0xfff066, durationMs: 130 }, // ใหญ่กว่า/สว่างกว่า (GS §17.3 "ต่างกันชัด") — สั้นแต่จัด
    },
  },
  impactParticles: {
    enabled: true,
    poolSize: 220,
    stylesByTier: {
      normal: {
        count: 4,
        color: 0xffe0a3,
        speedMinPx: 60,
        speedMaxPx: 120,
        sizeMinPx: 1.5,
        sizeMaxPx: 2.5,
        lifetimeMs: 260,
        gravityPxPerSec2: 200,
        spreadDegrees: 360,
      },
      big: {
        count: 7,
        color: 0xffb15c,
        speedMinPx: 90,
        speedMaxPx: 170,
        sizeMinPx: 2,
        sizeMaxPx: 3.5,
        lifetimeMs: 320,
        gravityPxPerSec2: 240,
        spreadDegrees: 360,
      },
      crit: {
        count: 11,
        color: 0xfff066,
        speedMinPx: 110,
        speedMaxPx: 220,
        sizeMinPx: 2,
        sizeMaxPx: 4.5,
        lifetimeMs: 380,
        gravityPxPerSec2: 260,
        spreadDegrees: 360,
      },
    },
    countScaleByQuality: OMNI_QUALITY_SCALE,
  },
  deathVfx: {
    enabled: true,
    burstByRank: {
      normal: {
        count: 10,
        color: 0xff6b4a,
        speedMinPx: 80,
        speedMaxPx: 180,
        sizeMinPx: 2,
        sizeMaxPx: 4,
        lifetimeMs: 420,
        gravityPxPerSec2: 320,
        spreadDegrees: 360,
      },
      elite: {
        count: 16,
        color: 0xff8a3d,
        speedMinPx: 100,
        speedMaxPx: 220,
        sizeMinPx: 2.5,
        sizeMaxPx: 5,
        lifetimeMs: 480,
        gravityPxPerSec2: 300,
        spreadDegrees: 360,
      },
      boss: {
        count: 26,
        color: 0xffb020,
        speedMinPx: 130,
        speedMaxPx: 280,
        sizeMinPx: 3,
        sizeMaxPx: 6,
        lifetimeMs: 600,
        gravityPxPerSec2: 260,
        spreadDegrees: 360,
      },
    },
    lootSparkleStyle: {
      count: 8,
      color: 0xffe066, // ทอง — สื่อ "ได้รางวัล" แยกจากสี burst ตาย
      speedMinPx: 40,
      speedMaxPx: 100,
      sizeMinPx: 1.5,
      sizeMaxPx: 3,
      lifetimeMs: 520,
      gravityPxPerSec2: -80, // ลอยขึ้นเบา ๆ (แรงโน้มถ่วงติดลบ = sparkle เด้งขึ้น ต่างจาก death burst ที่ตกลง)
      spreadDegrees: 140,
      directionDeg: 270, // screen-space y-down: -90°/270° = ขึ้น
    },
    countScaleByQuality: OMNI_QUALITY_SCALE,
  },
  cameraFlash: {
    enabled: true,
    critStyle: { color: 0xfff066, peakAlpha: 0.22, durationMs: 180 },
    critMinDamage: 40, // ผูกกับ damageTier.bigHitDamage เป็น baseline เดียวกัน (crit ที่ "ใหญ่" ด้วยถึง flash)
    selfDamagedStyle: { color: 0xff2b2b, peakAlpha: 0.16, durationMs: 220 },
    minQuality: "medium", // ปิดที่ low (ของแพงสุดในชุด F5 ตาม invariant "ปิดของแพง")
  },
  damageNumber: {
    // โทนแดงส้ม ชัดเจนว่าคนละความหมายกับ normal(ขาว)/crit(ทอง) ที่เราตี
    incoming: { fontFamily: "dmg-incoming", color: 0xff5c5c, fontSize: 18 },
    popScaleByKind: { normal: 1.15, crit: 1.55, incoming: 1.25 }, // crit เด้งหนักสุด (GS §17.3)
    popDurationMs: 110,
    multiHitStaggerMs: 45,
  },
  hitStopBigHit: {
    minLevelOnBigHit: 2, // ยกขึ้นเท่า S3 tier (durationMsByLevel[2]) เมื่อ crit/kill ที่ dmg ก็สูงด้วย
  },
  selfDamagedFeedback: {
    shakeLevel: 1, // reuse combatFeel.screenShake.levelsByLevel[1] (amplitude เบา — ไม่ต้องแรงเท่า crit ของเราเอง)
  },
};
