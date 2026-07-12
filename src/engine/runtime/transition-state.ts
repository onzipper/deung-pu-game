// Map transition state machine (P1-10, GS §57.3 "separated rooms + loading/fade") — **pure, no pixi**.
// แยกจาก transition.ts (pixi overlay glue) เพื่อทดสอบ logic fade/lock ได้โดยไม่ต้องมี renderer.
//
// ลำดับ: idle → (start) → fadeOut → [SWAP world ตอนจอมืดสุด] → fadeIn → idle
//   • fadeOut: overlay alpha 0→1 (จอค่อย ๆ มืด)
//   • swap: ตอน alpha=1 (จอมืดสุด) → fireSwap ครั้งเดียว (caller teardown scene เดิม + โหลด map ใหม่ + join room ใหม่)
//   • fadeIn: overlay alpha 1→0 (เผยฉากใหม่)
// input lock = ทุก phase ที่ไม่ใช่ idle (caller เช็ค isTransitionLocked ก่อนรับ input / ส่ง move).

/** knob ของ fade (ms). ทุกค่าเป็น Design Knob (config.transition). */
export interface TransitionTimingConfig {
  /** ระยะเวลาจอค่อย ๆ มืด (ms) */
  fadeOutMs: number;
  /** ระยะเวลาเผยฉากใหม่ (ms) */
  fadeInMs: number;
}

export type TransitionPhase = "idle" | "fadeOut" | "fadeIn";

export interface TransitionState {
  phase: TransitionPhase;
  /** เวลาสะสมใน phase ปัจจุบัน (ms) */
  elapsedMs: number;
}

export interface TransitionAdvance {
  state: TransitionState;
  /** overlay alpha 0..1 (0 = โปร่ง, 1 = จอมืดสนิท) */
  alpha: number;
  /** true = จังหวะจอมืดสุด → caller ต้อง swap world ทันที (ยิงครั้งเดียวต่อ transition) */
  fireSwap: boolean;
}

export function idleTransition(): TransitionState {
  return { phase: "idle", elapsedMs: 0 };
}

/** เริ่ม transition (จาก idle) → เข้า fadeOut. เรียกซ้ำระหว่างไม่ idle = caller ควร guard เอง. */
export function startTransition(): TransitionState {
  return { phase: "fadeOut", elapsedMs: 0 };
}

/** input lock ระหว่าง transition (ทุก phase ที่ไม่ใช่ idle). */
export function isTransitionLocked(state: TransitionState): boolean {
  return state.phase !== "idle";
}

/** clamp 0..1 (duration ≤ 0 → ถือว่าเสร็จทันที = 1). */
function progress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  const p = elapsedMs / durationMs;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * เดิน state machine 1 step. pure — คืน state ใหม่ + alpha + fireSwap. caller:
 *   • ตั้ง overlay.alpha = result.alpha ทุก frame
 *   • ถ้า result.fireSwap → teardown + rebuild world (จอมืดสุด) — เกิดครั้งเดียวต่อ transition
 */
export function advanceTransition(
  state: TransitionState,
  deltaMs: number,
  config: TransitionTimingConfig,
): TransitionAdvance {
  if (state.phase === "idle") {
    return { state, alpha: 0, fireSwap: false };
  }

  const elapsedMs = state.elapsedMs + Math.max(0, deltaMs);

  if (state.phase === "fadeOut") {
    if (elapsedMs >= config.fadeOutMs) {
      // ถึงจอมืดสุด → swap + เข้า fadeIn (elapsed เริ่มใหม่). alpha คง 1 เฟรมนี้.
      return {
        state: { phase: "fadeIn", elapsedMs: 0 },
        alpha: 1,
        fireSwap: true,
      };
    }
    return {
      state: { phase: "fadeOut", elapsedMs },
      alpha: progress(elapsedMs, config.fadeOutMs),
      fireSwap: false,
    };
  }

  // fadeIn
  if (elapsedMs >= config.fadeInMs) {
    return { state: idleTransition(), alpha: 0, fireSwap: false };
  }
  return {
    state: { phase: "fadeIn", elapsedMs },
    alpha: 1 - progress(elapsedMs, config.fadeInMs),
    fireSwap: false,
  };
}
