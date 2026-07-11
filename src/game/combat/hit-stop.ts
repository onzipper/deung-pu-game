// Hit stop — pure state/timescale math, no PixiJS/React (P1-06, GS §17.5 · TA §11).
//
// GS §17.5 "Hit Stop ใช้กับ Critical / Ultimate / Boss break / ...". ที่นี่คุมแค่ "นานแค่ไหน" +
// "time-scale เท่าไหร่ระหว่างที่ยัง remaining>0" — **visual เท่านั้น**: caller (combat-stub.ts) เอา
// timeScale ไปคูณ dt ของ juice update (damage number fade/rise, hitbox debug fade) เท่านั้น
// **ห้ามใช้ scale นี้กับ dt ของ network send timer / mob simulation / cooldown จริง** (P1-06 brief invariant).
//
// stacking: trigger ซ้อนกัน (เช่น multi-hit crit ใน cast เดียว) ใช้ duration **มากสุด** ไม่ใช่บวกสะสม
// (กัน hit stop ยืดยาวผิดธรรมชาติเมื่อโดนหลาย hit ติดกัน).

/** state ของ hit stop 1 ชุด (ต่อ local player 1 คน — เท่ากับ combat-stub instance เดียว). */
export interface HitStopState {
  remainingMs: number;
}

/** สร้าง state เริ่มต้น (ไม่มี hit stop ค้าง) */
export function createHitStopState(): HitStopState {
  return { remainingMs: 0 };
}

/**
 * clamp level เข้าช่วง [0, durationMsByLevel.length−1] แล้วคืน duration ของ level นั้น
 * (level ติดลบ/เกิน array → clamp ปลายทาง, ไม่ throw — กันข้อมูล skill ผิดพลาดพัง juice).
 */
function durationForLevel(level: number, durationMsByLevel: readonly number[]): number {
  if (durationMsByLevel.length === 0) return 0;
  const idx = Math.max(0, Math.min(Math.trunc(level), durationMsByLevel.length - 1));
  return durationMsByLevel[idx];
}

/**
 * trigger hit stop ที่ level ที่กำหนด (จาก ClientSkillView.hitStopLevel) — ใช้ duration **มากสุด**
 * ระหว่างของเดิมที่ยังค้างอยู่กับของใหม่ (ไม่บวกสะสม).
 */
export function triggerHitStop(
  state: HitStopState,
  level: number,
  durationMsByLevel: readonly number[],
): void {
  const duration = durationForLevel(level, durationMsByLevel);
  state.remainingMs = Math.max(state.remainingMs, duration);
}

/** เดินเวลาจริง (real dt, ไม่ scale) — hit stop นับเวลาแบบ wall-clock เสมอไม่งั้นจะไม่มีวันหมด. */
export function advanceHitStop(state: HitStopState, realDtMs: number): void {
  state.remainingMs = Math.max(0, state.remainingMs - realDtMs);
}

/**
 * time-scale ที่ควรใช้กับ juice update รอบนี้ — `activeTimeScale` (< 1, ปกติใกล้ 0 แต่ไม่ 0 เป๊ะ)
 * ระหว่าง remainingMs > 0, ปกติ (1) เมื่อหมดแล้ว.
 */
export function computeHitStopTimeScale(
  state: HitStopState,
  activeTimeScale: number,
): number {
  return state.remainingMs > 0 ? activeTimeScale : 1;
}
