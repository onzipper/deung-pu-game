// Map transition — pixi fade overlay + controller (P1-10, GS §57.3 "loading/fade"). pixi glue เท่านั้น
// (logic fade/lock ทั้งหมด = transition-state.ts pure, tested). ห้าม import React/Next.
//
// fade overlay = Graphics เต็มจอ (screen-space, ไม่โดน camera) สีทึบ alpha 0..1 บนสุดของ stage.
// controller ครอบ state machine: start(swap) → fadeOut → swap ตอนจอมืดสุด → fadeIn → idle.
//   swap callback = teardown world เดิม + โหลด map ใหม่จาก registry + join room ใหม่ (จัดใน app.ts).

import { Container, Graphics } from "pixi.js";
import type { TransitionConfig } from "@/engine/config";
import {
  advanceTransition,
  idleTransition,
  isTransitionLocked,
  startTransition,
  type TransitionState,
} from "./transition-state";

/** overlay เต็มจอสำหรับ fade (redraw เมื่อ resize เพื่อครอบ viewport ใหม่). */
interface FadeOverlay {
  readonly view: Container;
  resize(width: number, height: number): void;
  setAlpha(alpha: number): void;
  destroy(): void;
}

function createFadeOverlay(
  color: number,
  width: number,
  height: number,
): FadeOverlay {
  const g = new Graphics();
  let w = Math.max(1, width);
  let h = Math.max(1, height);
  const redraw = (): void => {
    g.clear();
    g.rect(0, 0, w, h).fill({ color });
  };
  redraw();
  g.alpha = 0;
  g.eventMode = "none"; // overlay ไม่กิน pointer (input lock ทำที่ controller ไม่ใช่ hit test)
  return {
    view: g,
    resize(nw: number, nh: number): void {
      w = Math.max(1, nw);
      h = Math.max(1, nh);
      redraw();
    },
    setAlpha(alpha: number): void {
      g.alpha = alpha;
    },
    destroy(): void {
      g.destroy();
    },
  };
}

export interface TransitionController {
  /** input lock — true = กำลัง transition (caller ต้องไม่รับ input / ส่ง move). */
  isLocked(): boolean;
  /**
   * เริ่ม transition. `swap` ถูกเรียก **ครั้งเดียว** ตอนจอมืดสุด (teardown + rebuild world).
   * no-op ถ้ากำลัง transition อยู่ (กัน re-trigger ซ้อน).
   */
  start(swap: () => void): void;
  /** เดิน state machine 1 frame — set overlay alpha + ยิง swap เมื่อถึงจุดมืดสุด. */
  update(deltaMs: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

/**
 * สร้าง transition controller + overlay (เพิ่มลง parent = บนสุดของ stage เพื่อครอบทั้ง world + UI).
 */
export function createTransitionController(
  parent: Container,
  config: TransitionConfig,
  width: number,
  height: number,
): TransitionController {
  const overlay = createFadeOverlay(config.fadeColor, width, height);
  parent.addChild(overlay.view);

  let state: TransitionState = idleTransition();
  let pendingSwap: (() => void) | null = null;

  return {
    isLocked(): boolean {
      return isTransitionLocked(state);
    },
    start(swap: () => void): void {
      if (isTransitionLocked(state)) return;
      pendingSwap = swap;
      state = startTransition();
    },
    update(deltaMs: number): void {
      if (state.phase === "idle") return;
      const result = advanceTransition(state, deltaMs, config);
      state = result.state;
      overlay.setAlpha(result.alpha);
      if (result.fireSwap && pendingSwap) {
        const swap = pendingSwap;
        pendingSwap = null;
        swap(); // จอมืดสุด → teardown + rebuild world
      }
    },
    resize(w: number, h: number): void {
      overlay.resize(w, h);
    },
    destroy(): void {
      overlay.destroy();
      pendingSwap = null;
    },
  };
}
