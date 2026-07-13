// Config: combat feel — damage number pool, hit stop, screen shake, effect quality, dev stress harness.
// Juice/perf knobs (not §15 balance) + their types. Plain TS only.

/**
 * style ของเลข damage 1 แบบ (P1-06, GS §17.3 "Normal Hit / Critical Hit ต่างกันชัด") — ต่อ style
 * ต้อง install BitmapFont ชื่อไม่ซ้ำกัน (`fontFamily`) เพราะ pixi BitmapText resolve font จากชื่อนี้.
 */
export interface DamageNumberStyleConfig {
  /** ชื่อ BitmapFont ที่ install ผ่าน `BitmapFont.install({ name: fontFamily, ... })` */
  fontFamily: string;
  /** สีตัวเลข (baked เข้า font texture ตอน install) */
  color: number;
  /** ขนาดฟอนต์ (px) */
  fontSize: number;
}

/**
 * damage number pool + aggregate (P1-06, TA §11 "BitmapText + pool 300–500 ตัว" · GS §17.10
 * "เกิน budget → รวมก้อนต่อ 0.5 วิ"). แทนที่ DamageNumberConfig เดิม (P0-10 Text สร้าง-ทิ้ง).
 */
export interface DamageNumberPoolConfig {
  /** ขนาด object pool ของ BitmapText (TA §11: 300–500 ตัว) */
  poolSize: number;
  /** สไตล์ normal hit */
  normal: DamageNumberStyleConfig;
  /** สไตล์ critical hit (ใหญ่กว่า + สีต่าง, GS §17.3) */
  crit: DamageNumberStyleConfig;
  /** สไตล์ตัวเลขรวม (เกิน budget → aggregate, GS §17.10) */
  aggregate: DamageNumberStyleConfig;
  /** ระยะ (px) ที่เลขลอยขึ้นตลอดอายุ */
  riseDistance: number;
  /** ตำแหน่งเริ่มต้น (px เทียบกับ foot ของเป้า, ลบ = เหนือหัว) */
  spawnOffsetY: number;
  /** อายุของเลข (ms) ก่อน fade หมด+หาย */
  lifetimeMs: number;
  /** ช่วงเวลา (ms) รวม hit ที่เกิน budget เป็นเลขก้อนเดียว (GS §17.10 "ต่อ 0.5 วิ") */
  aggregateWindowMs: number;
}

/** duration ของ hit stop ต่อ level (P1-06, GS §17.5 — index = ClientSkillView.hitStopLevel). */
export interface HitStopConfig {
  /** durationMs[level] — level เกินขอบเขต array → clamp ที่ตัวสุดท้าย (ดู game/combat/hit-stop.ts) */
  durationMsByLevel: number[];
  /** time-scale ระหว่าง hit stop ยัง active (0 < ค่า ≤ 1) — ใช้กับ **juice update เท่านั้น**
   *  (damage number/hitbox debug fade) ห้ามใช้กับ network send timer/mob simulation/cooldown จริง */
  timeScale: number;
  /**
   * feel knob (ไม่ใช่ balance — ปรับได้อิสระ, `src/game/combat/juice-level.ts` `resolveJuiceLevel`):
   * ระดับ hit stop ต่ำสุดที่บังคับใช้เมื่อ**ฆ่ามอนสำเร็จ** แม้ skill.hitStopLevel ของสกิลนั้นต่ำกว่านี้
   * (เช่น S1 ฟันดาบสามัญ hitStopLevel=0 → kill ยังควรรู้สึกได้บ้าง). ใช้ `Math.max(skill level, ค่านี้)`.
   */
  minLevelOnKill: number;
  /** เหมือน minLevelOnKill แต่ trigger ตอน critical hit (ไม่ว่าจะฆ่าได้หรือไม่) */
  minLevelOnCrit: number;
}

/** amplitude/duration ของ screen shake ต่อ level (P1-06, GS §17.5 — index = screenShakeLevel). */
export interface ScreenShakeLevelConfig {
  amplitudePx: number;
  durationMs: number;
}

/** screen shake knob รวม (P1-06, GS §17.5 "ต้องมี setting ปิดได้"). */
export interface ScreenShakeConfig {
  /** ปิด/เปิด shake ทั้งหมด (ผู้เล่นปิดได้, GS §17.5) */
  enabled: boolean;
  /** ระดับ shake ต่อ screenShakeLevel (index = level) */
  levelsByLevel: ScreenShakeLevelConfig[];
  /** screenShakeLevel ที่สูงพอจะ shake เสมอ (ultimate-tier) แม้ hit นั้นไม่ crit/ไม่ฆ่า */
  alwaysTriggerAtLevel: number;
  /**
   * feel knob เดียวกับ HitStopConfig.minLevelOnKill — ป้องกัน skill juice level ต่ำ (เช่น S1=0) ทำให้
   * ตอนตีมอนตายไม่เห็นจอสั่นเลย. `resolveJuiceLevel` เอาไปคูณกับ shakeAmplitudeScale ตามปกติ (quality tier
   * ยังลดทอนได้เหมือนเดิม — ค่านี้แค่ยก "ระดับ" ไม่ bypass quality scale).
   */
  minLevelOnKill: number;
  /** เหมือน minLevelOnKill แต่ trigger ตอน critical hit */
  minLevelOnCrit: number;
}

/** Effect Quality tier (P1-06, GS §17.10 · TA §11 "map เป็นตัวเลขจริง") — P1 ใช้ default เดียว, UI เลือก = P2. */
export type EffectQuality = "low" | "medium" | "high" | "cinematic";

/** ค่าที่ quality tier แต่ละระดับ map ไปเป็นจริง (GS §17.10 "Performance Guardrails"). */
export interface EffectQualityTierConfig {
  /** จำนวน damage number พร้อมกันสูงสุดของ tier นี้ (≤ DamageNumberPoolConfig.poolSize) */
  maxConcurrentDamageNumbers: number;
  /** ตัวคูณ amplitude ของ screen shake (0..1 ปกติ, สูงกว่า 1 ได้สำหรับ cinematic) */
  shakeAmplitudeScale: number;
  /** ตัวคูณ aggregate window (1 = ค่า DamageNumberPoolConfig.aggregateWindowMs ปกติ) */
  aggregateWindowScale: number;
}

/** Effect Quality knob รวม — quality ปัจจุบัน + ตาราง tier ทั้ง 4 (Low/Med/High/Cinematic). */
export interface EffectQualityConfig {
  /** quality ที่ใช้งานตอนนี้ (P1: default "medium" เสมอ — UI เลือกเอง = P2 settings) */
  current: EffectQuality;
  /** ตาราง knob ต่อ tier */
  tiers: Record<EffectQuality, EffectQualityTierConfig>;
}

/** รวม combat feel knob ทั้งหมด (P1-06, GS §17 · TA §11) — damage number pool/aggregate, hit stop, shake, quality. */
export interface CombatFeelConfig {
  damageNumber: DamageNumberPoolConfig;
  hitStop: HitStopConfig;
  screenShake: ScreenShakeConfig;
  effectQuality: EffectQualityConfig;
}

/**
 * dev-only stress harness (P1-06 §5) — hotkey สร้าง synthetic load (มอน + damage number จำนวนมาก)
 * เพื่อพิสูจน์ budget 60fps @ 40 mobs + 300 damage numbers/วิ (TA §11) โดยไม่ต้องมี server จริง.
 */
export interface StressHarnessConfig {
  /** KeyboardEvent.code ที่ toggle harness (default "F4", dev-only เหมือน F3 debug overlay) */
  toggleKeyCode: string;
  /** จำนวนมอนสังเคราะห์เป้าหมาย (TA §11 budget ~40) */
  syntheticMobCount: number;
  /** อัตรา damage number สังเคราะห์ต่อวินาที (TA §11 budget ~300) */
  damageNumberRatePerSec: number;
  /** จำนวน spawn สูงสุดต่อ 1 frame (กัน spike รัวเกินตอน dt กระโดด/สลับ tab) */
  maxSpawnPerTick: number;
}

/**
 * Combat feel defaults (P1-06, GS §17 · TA §11) — pool size/duration/amplitude เป็น juice/perf knob
 * (ไม่ใช่ combat balance §15 — ปรับได้อิสระ ไม่ต้องผ่าน owner balance process §59.4 แต่ยังต้องอยู่ใน
 * config นี้เสมอ ห้าม hardcode กระจาย).
 */
export const DEFAULT_COMBAT_FEEL_CONFIG: CombatFeelConfig = {
  damageNumber: {
    poolSize: 400, // TA §11: BitmapText pool 300–500 ตัว
    normal: { fontFamily: "dmg-normal", color: 0xffe066, fontSize: 16 },
    crit: { fontFamily: "dmg-crit", color: 0xff4d4d, fontSize: 24 }, // ใหญ่กว่า + สีต่าง (GS §17.3)
    aggregate: { fontFamily: "dmg-aggregate", color: 0xffffff, fontSize: 18 },
    riseDistance: 28,
    spawnOffsetY: -34,
    lifetimeMs: 650,
    aggregateWindowMs: 500, // GS §17.10 "รวมต่อ 0.5 วิ"
  },
  hitStop: {
    // level 0 = ไม่มี (S1 ฟันดาบสามัญ) · 1 = สั้น (S2 คลื่นดาบราชันย์) · 2 = หนักกว่า (S3 ดาบสุริยะผ่าเมือง)
    durationMsByLevel: [0, 60, 140],
    timeScale: 0.05, // แทบหยุด แต่ไม่ 0 เป๊ะ (กัน edge case หาร/สังเกตความต่างจาก "หยุดจริง")
    // floor: S1 (hitStopLevel=0) ฆ่ามอน/ครีตแล้วยังรู้สึกได้ — บังคับอย่างน้อย level 1 (60ms)
    minLevelOnKill: 1,
    minLevelOnCrit: 1,
  },
  screenShake: {
    enabled: true, // ผู้เล่นปิดได้ (GS §17.5) — toggle จริงผ่าน UI settings = P2, ที่นี่คือ default
    levelsByLevel: [
      { amplitudePx: 0, durationMs: 0 },
      { amplitudePx: 4, durationMs: 160 },
      { amplitudePx: 9, durationMs: 260 },
    ],
    alwaysTriggerAtLevel: 2, // ระดับ 2+ (เช่น ultimate-tier) shake เสมอแม้ hit นั้นไม่ crit/ไม่ฆ่า
    // floor: S1 (screenShakeLevel=0 → amplitude 0) ฆ่ามอน/ครีตแล้วยังเห็นจอสั่นบ้าง — บังคับอย่างน้อย level 1
    minLevelOnKill: 1,
    minLevelOnCrit: 1,
  },
  effectQuality: {
    current: "medium", // P1 default เสมอ — UI เลือกจริง = P2 settings (ดู feature-map)
    tiers: {
      low: { maxConcurrentDamageNumbers: 80, shakeAmplitudeScale: 0.4, aggregateWindowScale: 1.5 },
      medium: { maxConcurrentDamageNumbers: 200, shakeAmplitudeScale: 0.75, aggregateWindowScale: 1 },
      high: { maxConcurrentDamageNumbers: 350, shakeAmplitudeScale: 1, aggregateWindowScale: 0.75 },
      cinematic: { maxConcurrentDamageNumbers: 400, shakeAmplitudeScale: 1.2, aggregateWindowScale: 0.5 },
    },
  },
};

export const DEFAULT_STRESS_HARNESS_CONFIG: StressHarnessConfig = {
  toggleKeyCode: "F4",
  syntheticMobCount: 40, // TA §11 budget
  damageNumberRatePerSec: 300, // TA §11 budget
  maxSpawnPerTick: 40, // กัน spike รัวเกินตอน dt กระโดด (สูงสุด/frame ไม่กวาด pool หมดในเฟรมเดียว)
};
