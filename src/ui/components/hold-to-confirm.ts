// Hold-to-confirm timing — pure logic only (no React/DOM), tested directly with Vitest (pattern:
// src/ui/panels/panel-stack.ts / src/ui/debug-overlay-logic.ts, see docs/agent-rules.md). ConfirmDialog.tsx
// drives this every animation frame with a real elapsed-ms clock; this module only does the math.
//
// Spec source: P2 UI Visual Implementation Spec §4.6 High-Risk Confirm — "Checkbox หรือ hold-to-confirm
// เฉพาะ irreversible action".

export interface HoldProgress {
  /** 0..1, clamped */
  progress: number;
  /** true เมื่อ progress ครบ 1 (ถือว่ายืนยันแล้ว) */
  done: boolean;
}

/** ค่า default ระยะเวลาต้องกดค้าง — ยาวพอกันกดพลาด สั้นพอไม่น่ารำคาญ */
export const DEFAULT_HOLD_DURATION_MS = 900;

/**
 * คำนวณ progress ของการกดค้าง ณ เวลา elapsedMs หนึ่ง ๆ เทียบ durationMs. Pure: ไม่ผูก timer/DOM เอง —
 * caller (component) เป็นคนอ่านเวลาจริงแล้วเรียกทุก frame. durationMs <= 0 ถือว่ายืนยันทันที (edge guard,
 * ไม่ throw) — elapsedMs ติดลบ (clock skew ที่ไม่ควรเกิดแต่กันไว้) clamp เป็น 0.
 */
export function computeHoldProgress(elapsedMs: number, durationMs: number): HoldProgress {
  if (durationMs <= 0) return { progress: 1, done: true };
  const safeElapsed = Math.max(0, elapsedMs);
  const progress = Math.min(1, safeElapsed / durationMs);
  return { progress, done: progress >= 1 };
}
