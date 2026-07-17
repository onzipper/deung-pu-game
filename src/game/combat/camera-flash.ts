// Camera flash — pure state/decay math, no PixiJS/React (Combat Juice F5, sibling ของ
// engine/render/screen-shake.ts แต่คุม "ขอบจอวาบสี" แทน "กล้องสั่น"). ที่นี่แค่ timeline (trigger/advance/
// compute alpha) — pixi glue (วาด full-screen overlay) อยู่ที่ combat-stub.ts (ใช้ scene.world เป็น public API,
// ดู module header ที่นั่นสำหรับเทคนิค "screen-space rect ผ่าน world container").

/** สไตล์ flash 1 แบบ (สี/alpha สูงสุด/ระยะเวลา) — Design Knob, ดู game/combat/juice-config.ts. */
export interface CameraFlashStyleConfig {
  readonly color: number;
  /** alpha สูงสุดตอน flash เต็มที่ (0..1) */
  readonly peakAlpha: number;
  readonly durationMs: number;
}

/** state ของ flash 1 ชุด (ต่อ local player 1 คน — เท่ากับ combat-stub instance เดียว). */
export interface CameraFlashState {
  remainingMs: number;
  durationMs: number;
  peakAlpha: number;
  color: number;
}

export function createCameraFlashState(): CameraFlashState {
  return { remainingMs: 0, durationMs: 0, peakAlpha: 0, color: 0xffffff };
}

/**
 * trigger flash — เหมือน screen-shake (triggerShake): ของใหม่ **แรงกว่าหรือของเดิมหมดแล้ว** ถึงแทนที่
 * (กันของเบากว่ากลบของแรงที่กำลังเด่นอยู่). peakAlpha/durationMs ≤ 0 → no-op (ปิด effect นี้ผ่าน config).
 */
export function triggerCameraFlash(
  state: CameraFlashState,
  style: CameraFlashStyleConfig,
): void {
  if (style.durationMs <= 0 || style.peakAlpha <= 0) return;
  if (state.remainingMs <= 0 || style.peakAlpha >= state.peakAlpha) {
    state.remainingMs = style.durationMs;
    state.durationMs = style.durationMs;
    state.peakAlpha = style.peakAlpha;
    state.color = style.color;
  }
}

/** เดินเวลาแบบ real-time เสมอ (เหมือน screen-shake — ไม่ผูกกับ hit-stop time-scale). */
export function advanceCameraFlash(state: CameraFlashState, dtMs: number): void {
  state.remainingMs = Math.max(0, state.remainingMs - dtMs);
}

/** alpha ของ overlay เฟรมนี้ (decay เชิงเส้นจาก peakAlpha → 0) — 0 = ไม่ต้องวาด. */
export function computeCameraFlashAlpha(state: CameraFlashState): number {
  if (state.remainingMs <= 0 || state.durationMs <= 0) return 0;
  return state.peakAlpha * (state.remainingMs / state.durationMs);
}
