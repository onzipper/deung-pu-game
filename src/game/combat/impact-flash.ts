// Impact flash — pure state/color math, no PixiJS/React (Combat Juice F5). ต่างจาก hit-stop/screen-shake
// (P1-06, engine/render/screen-shake.ts) ตรงที่นี่คุม "tint pulse" บนสไปรต์มอนเอง (ไม่ใช่กล้อง/เวลา) —
// pattern เดียวกัน (trigger/advance/compute) เพื่อความคุ้นเคยข้ามไฟล์ juice.
//
// caller (src/game/mob/manager.ts) เก็บ 1 state ต่อมอน 1 ตัว, trigger ทุกครั้งที่โดนตี (ไม่ว่า caster ไหน —
// tint บนตัวมอนเป็น feedback ที่ควรเห็นได้ทุกคนในห้อง ต่างจาก hit-stop/screen-shake ที่ gate เฉพาะ own cast),
// แล้ว advance+apply tint ทุก frame ผ่าน lerpColor (ขาว→สี flash ตามสัดส่วนที่เหลือ).

/** สไตล์ flash ของ 1 tier (สี + ระยะเวลา) — Design Knob, ดู game/combat/juice-config.ts. */
export interface ImpactFlashStyleConfig {
  /** สี tint เป้าหมายตอน flash เต็มที่ (0xRRGGBB) */
  readonly color: number;
  /** ระยะเวลา (ms) ที่ tint ค่อย ๆ จางจาก color กลับขาว (0xffffff) */
  readonly durationMs: number;
}

/** state ของ flash 1 ชุด (ต่อมอน 1 ตัว). */
export interface ImpactFlashState {
  remainingMs: number;
  durationMs: number;
  color: number;
}

export function createImpactFlashState(): ImpactFlashState {
  return { remainingMs: 0, durationMs: 0, color: 0xffffff };
}

/**
 * trigger flash ใหม่ — **แทนที่ของเดิมเสมอ** (ต่างจาก screen-shake ที่กันของเบากว่ากลบของแรง): impact ล่าสุด
 * ควรเด่นกว่าของเก่าที่กำลังจางอยู่แล้วเสมอ (hit ถี่ ๆ ควร "รีเฟรช" ความสว่างทุกครั้ง ไม่ใช่รอของเก่าจาง).
 * durationMs ≤ 0 → no-op (ปิด effect นี้ผ่าน config).
 */
export function triggerImpactFlash(
  state: ImpactFlashState,
  style: ImpactFlashStyleConfig,
): void {
  if (style.durationMs <= 0) return;
  state.remainingMs = style.durationMs;
  state.durationMs = style.durationMs;
  state.color = style.color;
}

/** เดินเวลาแบบ real-time เสมอ (เหมือน screen-shake — ไม่ผูกกับ hit-stop time-scale, ดู screen-shake.ts). */
export function advanceImpactFlash(state: ImpactFlashState, dtMs: number): void {
  state.remainingMs = Math.max(0, state.remainingMs - dtMs);
}

/** สัดส่วนความสว่างของ flash ตอนนี้ (1 = เต็มสี, 0 = จางหมดกลับขาว) — decay เชิงเส้น. */
export function computeImpactFlashFactor(state: ImpactFlashState): number {
  if (state.remainingMs <= 0 || state.durationMs <= 0) return 0;
  return state.remainingMs / state.durationMs;
}

const clampByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/**
 * เกลี่ยสี RGB (0xRRGGBB) เชิงเส้นระหว่าง base → target ตามสัดส่วน t (clamp [0,1]) — ใช้ผสม
 * ขาว(สไปรต์ปกติ)กับสี flash ตาม computeImpactFlashFactor ที่นี่/ที่อื่นได้ทั่วไป (ไม่ผูกกับ flash โดยเฉพาะ).
 */
export function lerpColor(base: number, target: number, t: number): number {
  const clampT = Math.max(0, Math.min(1, t));
  const br = (base >> 16) & 0xff;
  const bg = (base >> 8) & 0xff;
  const bb = base & 0xff;
  const tr = (target >> 16) & 0xff;
  const tg = (target >> 8) & 0xff;
  const tb = target & 0xff;
  const r = clampByte(br + (tr - br) * clampT);
  const g = clampByte(bg + (tg - bg) * clampT);
  const b = clampByte(bb + (tb - bb) * clampT);
  return (r << 16) | (g << 8) | b;
}
