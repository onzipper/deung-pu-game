import { describe, expect, test } from "vitest";
import {
  advanceTransition,
  idleTransition,
  isTransitionLocked,
  startTransition,
  type TransitionState,
  type TransitionTimingConfig,
} from "@/engine/runtime/transition-state";

const CFG: TransitionTimingConfig = { fadeOutMs: 100, fadeInMs: 100 };

/** เดิน state machine ทีละ step เก็บ log (alpha/fireSwap) จนกลับ idle หรือครบ maxSteps. */
function run(stepMs: number, maxSteps = 100) {
  let state = startTransition();
  const alphas: number[] = [];
  let swaps = 0;
  for (let i = 0; i < maxSteps; i++) {
    const r = advanceTransition(state, stepMs, CFG);
    state = r.state;
    alphas.push(r.alpha);
    if (r.fireSwap) swaps++;
    if (state.phase === "idle") break;
  }
  return { state, alphas, swaps };
}

describe("transition-state (P1-10) — fade/lock state machine", () => {
  test("idle → alpha 0, ไม่ locked, ไม่ swap", () => {
    const s = idleTransition();
    expect(isTransitionLocked(s)).toBe(false);
    const r = advanceTransition(s, 16, CFG);
    expect(r.alpha).toBe(0);
    expect(r.fireSwap).toBe(false);
    expect(r.state.phase).toBe("idle");
  });

  test("start → locked ทันที (phase fadeOut)", () => {
    const s = startTransition();
    expect(s.phase).toBe("fadeOut");
    expect(isTransitionLocked(s)).toBe(true);
  });

  test("fadeOut → alpha ไต่ 0→1", () => {
    let state: TransitionState = startTransition();
    const r1 = advanceTransition(state, 25, CFG); // 25/100
    expect(r1.alpha).toBeCloseTo(0.25, 5);
    expect(r1.fireSwap).toBe(false);
    state = r1.state;
    const r2 = advanceTransition(state, 25, CFG); // 50/100
    expect(r2.alpha).toBeCloseTo(0.5, 5);
  });

  test("ถึงจอมืดสุด → fireSwap ครั้งเดียว + เข้า fadeIn (alpha=1)", () => {
    const { swaps } = run(20);
    expect(swaps).toBe(1);
  });

  test("จบ transition → กลับ idle + alpha 0", () => {
    const { state, alphas } = run(20);
    expect(state.phase).toBe("idle");
    expect(alphas[alphas.length - 1]).toBe(0);
    // alpha ต้องเคยแตะ ~1 (จอมืดสุด) ระหว่างทาง
    expect(Math.max(...alphas)).toBeGreaterThanOrEqual(1);
  });

  test("fireSwap เกิดครั้งเดียวเสมอ แม้ step ใหญ่ (ข้ามหลาย phase)", () => {
    const { swaps, state } = run(1000); // step ยักษ์ — fadeOut เสร็จทันที
    expect(swaps).toBe(1);
    expect(state.phase).toBe("idle");
  });

  test("duration 0 → fade ทันที แต่ยัง fireSwap ครั้งเดียว", () => {
    let state = startTransition();
    const r = advanceTransition(state, 16, { fadeOutMs: 0, fadeInMs: 0 });
    expect(r.fireSwap).toBe(true);
    state = r.state;
    const r2 = advanceTransition(state, 16, { fadeOutMs: 0, fadeInMs: 0 });
    expect(r2.state.phase).toBe("idle");
  });
});
