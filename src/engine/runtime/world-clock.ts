// World clock — pure math for the Living World LW0 phase tint (Living World Bible §3). No pixi/React/DOM,
// fully unit-testable. Client-side clock for LW0 (computed from a caller-supplied `nowMs` = Date.now()).
// TODO LW1: replace client clock with server-authoritative world time (§3.2 MSG_WORLD_TIME broadcast).
//
// §3.1 schedule (fixed spec semantics, minute-of-day 0..1439):
//   dawn 05:00–07:00 (300–420) · day 07:00–17:00 (420–1020) · dusk 17:00–19:00 (1020–1140) · night 19:00–05:00.
// §3.3: phase tint cross-fades over `transitionBlendSeconds` (60–120s) on a phase change — never an instant flip.

import type { PhaseTintConfig, WorldConfig, WorldPhase } from "@/engine/config";

const MINUTES_PER_DAY = 1440;

/** phase boundary (minute-of-day) — §3.1. night wraps midnight (>= NIGHT_START หรือ < DAWN_START). */
const DAWN_START = 300;
const DAY_START = 420;
const DUSK_START = 1020;
const NIGHT_START = 1140;

/** ระยะเวลาจริง (ms) ต่อ 1 game-นาที = realMinutesPerGameDay·60000 / 1440. */
export function realMsPerGameMinute(config: WorldConfig): number {
  return (config.realMinutesPerGameDay * 60_000) / MINUTES_PER_DAY;
}

/** continuous minute-of-day (float 0..1440) — ฐานของทั้ง worldMinuteAt และ tint blend. */
function continuousMinute(nowMs: number, config: WorldConfig): number {
  const elapsedMs = nowMs - config.worldEpochMs;
  const minutes = elapsedMs / realMsPerGameMinute(config);
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY; // กัน nowMs < epoch
}

/** minute-of-day ปัจจุบัน (integer 0..1439) — §3.2 floor. */
export function worldMinuteAt(nowMs: number, config: WorldConfig): number {
  return Math.floor(continuousMinute(nowMs, config));
}

/** phase จาก minute-of-day (§3.1). */
export function phaseAt(worldMinute: number): WorldPhase {
  const m = ((worldMinute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (m >= DAWN_START && m < DAY_START) return "dawn";
  if (m >= DAY_START && m < DUSK_START) return "day";
  if (m >= DUSK_START && m < NIGHT_START) return "dusk";
  return "night";
}

/** minute-of-day ที่ phase เริ่ม (สำหรับคำนวณ blend progress). */
function phaseStartMinute(phase: WorldPhase): number {
  switch (phase) {
    case "dawn":
      return DAWN_START;
    case "day":
      return DAY_START;
    case "dusk":
      return DUSK_START;
    case "night":
      return NIGHT_START;
  }
}

/** phase ก่อนหน้า (วนรอบ) — ใช้เป็นสีต้นทางของ cross-fade. */
function prevPhaseOf(phase: WorldPhase): WorldPhase {
  switch (phase) {
    case "dawn":
      return "night";
    case "day":
      return "dawn";
    case "dusk":
      return "day";
    case "night":
      return "dusk";
  }
}

/** lerp เชิงเส้น 2 สี 0xRRGGBB ทีละ channel (t 0..1). */
export function lerpColor(from: number, to: number, t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * c);
  const g = Math.round(fg + (tg - fg) * c);
  const b = Math.round(fb + (tb - fb) * c);
  return (r << 16) | (g << 8) | b;
}

/**
 * tint {color, alpha} ปัจจุบัน (§3.3): ภายใน `transitionBlendSeconds` แรกของ phase → cross-fade จากสี phase
 * ก่อนหน้า, หลังจากนั้น = สี phase ปัจจุบันเต็ม. pure — caller (app.ts onTick) เอาไป setPhaseTint บน overlay.
 */
export function phaseTintAt(nowMs: number, config: WorldConfig): PhaseTintConfig {
  const minute = continuousMinute(nowMs, config);
  const phase = phaseAt(minute);
  const target = config.phaseTint[phase];
  const blendSec = config.phaseTint.transitionBlendSeconds;
  if (blendSec <= 0) return target;

  // game-นาทีนับจากต้น phase (จัดการ night ที่ข้ามเที่ยงคืน) → วินาทีจริง
  let minutesInto = minute - phaseStartMinute(phase);
  if (minutesInto < 0) minutesInto += MINUTES_PER_DAY;
  const secInto = (minutesInto * realMsPerGameMinute(config)) / 1000;
  if (secInto >= blendSec) return target;

  const from = config.phaseTint[prevPhaseOf(phase)];
  const t = secInto / blendSec;
  return {
    color: lerpColor(from.color, target.color, t),
    alpha: from.alpha + (target.alpha - from.alpha) * t,
  };
}
