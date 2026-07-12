// Screen shake — pure state/decay math, no PixiJS/React (P1-06, GS §17.5 · TA §11 quality tiers).
//
// engine layer (ห้าม import จาก src/game/**, ดู docs/context/engine.md) — random ที่นี่ inject ผ่าน
// `RandomFn` ของตัวเอง (ไม่ import src/game/mob/rng.ts เพื่อไม่ผูก dependency ข้าม layer; caller ที่
// game/** เอา RngFn ของตัวเอง (`() => number`) ป้อนเข้าได้ตรง ๆ เพราะ signature เดียวกัน).
//
// offset ที่คำนวณได้ที่นี่เอาไปบวกกับ camera center **หลัง** clamp ขอบ map แล้ว (ดู render/scene.ts
// applyCamera + camera.ts applyShakeOffset) — shake เป็น juice ชั้นบนสุด ไม่ผ่าน clamp ซ้ำ (จงใจ ยอมให้
// เกิน edgeMargin เล็กน้อยชั่วครู่ ไม่งั้น shake จะโดนตัดทิ้งเวลากล้องอยู่ติดขอบ map).

/** RNG แบบ [0,1) เหมือน Math.random() — inject ได้ (เทสต์ deterministic). */
export type RandomFn = () => number;

/** ระดับ shake 1 level (GS §17.5, index = screenShakeLevel ของ skill). */
export interface ScreenShakeLevelConfig {
  amplitudePx: number;
  durationMs: number;
}

/** state ของ shake 1 ชุด (ต่อ local player 1 คน). */
export interface ShakeState {
  remainingMs: number;
  durationMs: number;
  amplitudePx: number;
}

/** สร้าง state เริ่มต้น (ไม่มี shake ค้าง) */
export function createShakeState(): ShakeState {
  return { remainingMs: 0, durationMs: 0, amplitudePx: 0 };
}

function levelConfig(
  level: number,
  levelsByLevel: readonly ScreenShakeLevelConfig[],
): ScreenShakeLevelConfig | null {
  if (levelsByLevel.length === 0) return null;
  const idx = Math.max(0, Math.min(Math.trunc(level), levelsByLevel.length - 1));
  return levelsByLevel[idx];
}

/**
 * trigger shake ที่ level ที่กำหนด (amplitude คูณ `amplitudeScale` = quality tier knob).
 * ถ้า shake ใหม่แรงกว่า/นานกว่าของเดิมที่ยังค้างอยู่ → แทนที่ (ไม่บวกสะสม กันสั่นเวียนหัว);
 * ถ้าอ่อนกว่าและของเดิมยังไม่หมด → ปล่อยของเดิมค้างต่อ (ไม่ทำให้ shake ที่กำลังเด่นถูกกลบด้วยของเบากว่า).
 */
export function triggerShake(
  state: ShakeState,
  level: number,
  levelsByLevel: readonly ScreenShakeLevelConfig[],
  amplitudeScale: number,
): void {
  const cfg = levelConfig(level, levelsByLevel);
  if (!cfg) return;
  const amplitude = cfg.amplitudePx * amplitudeScale;
  if (state.remainingMs <= 0 || amplitude >= state.amplitudePx) {
    state.amplitudePx = amplitude;
    state.durationMs = cfg.durationMs;
    state.remainingMs = cfg.durationMs;
  }
}

/** เดินเวลา shake (real dt — decay แบบ wall-clock, ไม่ผูกกับ hit-stop time-scale). */
export function advanceShake(state: ShakeState, dtMs: number): void {
  state.remainingMs = Math.max(0, state.remainingMs - dtMs);
}

/**
 * offset สุ่ม (px) ของเฟรมนี้ — amplitude decay เชิงเส้นจาก remaining/duration (1→0), ทิศสุ่มรอบตัวทุกครั้ง.
 * remaining หมดแล้ว/durationMs=0 → {0,0} เสมอ (deterministic เมื่อ shake ไม่ทำงาน).
 */
export function computeShakeOffset(
  state: ShakeState,
  rng: RandomFn,
): { sx: number; sy: number } {
  if (state.remainingMs <= 0 || state.durationMs <= 0) return { sx: 0, sy: 0 };
  const decay = state.remainingMs / state.durationMs;
  const amp = state.amplitudePx * decay;
  const angle = rng() * Math.PI * 2;
  return { sx: Math.cos(angle) * amp, sy: Math.sin(angle) * amp };
}
