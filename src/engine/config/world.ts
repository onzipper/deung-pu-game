// Config: Living World LW0 visual knobs — world-clock phase tint + Map-1 rain overlay
// (Living World Bible §3 world time · §4 weather · §20 perf · §23 LW0 tier). Client visual only —
// NO gameplay/stat effect (§4.4), must never obscure boss telegraph. Plain TS only (types + data).
//
// LW0 phasing (owner-approved regime): the world clock is computed CLIENT-SIDE from Date.now() against
// `worldEpochMs` (a shared constant). The bible wants server authority (§3.2) — this is an accepted LW0 step.
// TODO LW1: move world clock to server-authoritative broadcast (MSG_WORLD_TIME); replace the manual weather
// toggle with the §4.2/§4.3 weather state machine (Stable→Warning→Active→Easing→Cooldown).

import type { EffectQuality } from "./combat-feel";

/** phase ของวัน (Living World Bible §3.1) — dawn 05-07 · day 07-17 · dusk 17-19 · night 19-05. */
export type WorldPhase = "dawn" | "day" | "dusk" | "night";

/** สภาพอากาศ LW0 (§23 "one weather/map") — clear (ไม่มี overlay) หรือ rain (Map 1, §4.1). */
export type WeatherKind = "clear" | "rain";

/** สี + ความทึบของ tint 1 phase (screen-space color wash). alpha 0 = ไม่ทับสีเลย. */
export interface PhaseTintConfig {
  /** สี wash (0xRRGGBB) */
  color: number;
  /** ความทึบ 0..1 (§4.4/§18: subtle — telegraph ต้องยังอ่านออก) */
  alpha: number;
}

/** ตาราง tint ต่อ phase + ระยะ cross-fade ตอนเปลี่ยน phase (§3.3 blend 60–120s). */
export interface PhaseTintTableConfig {
  /** ระยะเวลา blend tint ตอนข้าม phase (วินาทีจริง, §3.3 60–120s) */
  transitionBlendSeconds: number;
  dawn: PhaseTintConfig;
  day: PhaseTintConfig;
  dusk: PhaseTintConfig;
  night: PhaseTintConfig;
}

/** จำนวนอนุภาคฝนต่อ EffectQuality tier (§4.4/§22: degrade weather ก่อน, telegraph ไม่ลด · §20 ≤180). */
export interface RainDegradeConfig {
  /** high + cinematic */
  high: number;
  medium: number;
  low: number;
  /** weather = clear (ไม่มีฝน) */
  off: number;
}

/** knob ของ rain overlay (screen-space streak pool, ไม่มีผล gameplay §4.4). */
export interface RainConfig {
  /** จำนวน streak สูงสุด (pool size) — ต้อง ≤ §20 maxWeatherParticles (180) */
  particleCountHigh: number;
  /** สี streak (0xRRGGBB) */
  streakColor: number;
  /** ความทึบ streak 0..1 (subtle, §4.4) */
  streakOpacity: number;
  /** ความยาว streak (px) */
  streakLengthPx: number;
  /** ความหนาเส้น streak (px) */
  streakWidthPx: number;
  /** ความเร็วตก (px/วินาที) */
  fallSpeedPxPerSec: number;
  /** มุมเอียงจากแนวดิ่ง (องศา) — ลมพัดเฉียง */
  fallAngleDegFromVertical: number;
  /** map EffectQuality → จำนวน streak (degrade weather ก่อน telegraph) */
  degrade: RainDegradeConfig;
}

/** Living World LW0 visual config — world clock + phase tint + rain. */
export interface WorldConfig {
  /** epoch อ้างอิงของ world clock (ms) — versioned constant (§3.2). TODO LW1: server-provided. */
  worldEpochMs: number;
  /** 1 วันในเกม = กี่นาทีจริง (§3.1 = 240) */
  realMinutesPerGameDay: number;
  /** phase tint table + blend */
  phaseTint: PhaseTintTableConfig;
  /** rain overlay knob */
  rain: RainConfig;
  /** map id ที่ rain overlay แสดงได้ (§4.1 Rain valid Map 1) — = MAP1_ID ("map1", src/engine/map/map1.ts) */
  rainMapIds: string[];
  /** debug key (KeyboardEvent.code) toggle rain clear↔rain (LW0 manual, §23) — LW1 ใช้ scheduler แทน */
  toggleRainKeyCode: string;
  /** debug key fast-forward day phase (demo dawn/dusk/night โดยไม่ต้องรอ) — เพิ่ม cyclePhaseStepMinutes game-นาที */
  cyclePhaseKeyCode: string;
  /** จำนวน game-นาทีที่กระโดดไปข้างหน้าต่อการกด cyclePhaseKeyCode 1 ครั้ง */
  cyclePhaseStepMinutes: number;
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  worldEpochMs: 0, // TODO LW1: server-provided epoch (§3.2 versioned config)
  realMinutesPerGameDay: 240, // §3.1
  phaseTint: {
    transitionBlendSeconds: 90, // §3.3 (60–120s)
    dawn: { color: 0xffc9a3, alpha: 0.1 },
    day: { color: 0xffffff, alpha: 0.0 },
    dusk: { color: 0xff8c42, alpha: 0.18 },
    night: { color: 0x1b2a5b, alpha: 0.28 },
  },
  rain: {
    particleCountHigh: 140, // ≤ §20 maxWeatherParticles (180)
    streakColor: 0xaeb9c7,
    streakOpacity: 0.35,
    streakLengthPx: 14,
    streakWidthPx: 1.5,
    fallSpeedPxPerSec: 620,
    fallAngleDegFromVertical: 12,
    degrade: { high: 140, medium: 90, low: 40, off: 0 },
  },
  rainMapIds: ["map1"], // §4.1 Rain valid Map 1 (= MAP1_ID)
  toggleRainKeyCode: "KeyR",
  cyclePhaseKeyCode: "KeyT",
  cyclePhaseStepMinutes: 180, // 3 game-ชั่วโมง/กด — เห็น phase เปลี่ยนไว
};

/**
 * จำนวน streak ฝนที่ควรแสดง ตาม weather + EffectQuality (pure — §4.4/§22 degrade weather ก่อน telegraph).
 * weather=clear → 0; rain → ตาม tier (cinematic ใช้ค่าเดียวกับ high). ผลถูก cap ที่ particleCountHigh (§20).
 */
export function rainParticleCount(
  rain: RainConfig,
  weather: WeatherKind,
  quality: EffectQuality,
): number {
  if (weather !== "rain") return rain.degrade.off;
  let n: number;
  switch (quality) {
    case "low":
      n = rain.degrade.low;
      break;
    case "medium":
      n = rain.degrade.medium;
      break;
    case "high":
    case "cinematic":
      n = rain.degrade.high;
      break;
  }
  return Math.min(n, rain.particleCountHigh);
}
