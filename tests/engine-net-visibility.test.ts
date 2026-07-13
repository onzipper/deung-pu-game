// P2-13 (D-056): dt-clamp (refocus guard) + visibility controller glue. No pixi — pure + a fake document.

import { describe, expect, test, vi } from "vitest";
import { clampDtMs, createVisibilityController } from "@/engine/net/visibility";

describe("clampDtMs — refocus dt guard (D-056)", () => {
  test("passes small dt through untouched", () => {
    expect(clampDtMs(16.7, 100)).toBeCloseTo(16.7);
  });

  test("clamps a huge dt (post-hidden rAF throttle) to maxMs", () => {
    expect(clampDtMs(5_000, 100)).toBe(100);
  });

  test("dt exactly at max is unchanged", () => {
    expect(clampDtMs(100, 100)).toBe(100);
  });

  test("negative / non-finite dt → 0 (defensive)", () => {
    expect(clampDtMs(-5, 100)).toBe(0);
    expect(clampDtMs(Number.NaN, 100)).toBe(0);
  });

  test("maxMs ≤ 0 / non-finite disables the clamp (returns raw)", () => {
    expect(clampDtMs(5_000, 0)).toBe(5_000);
    expect(clampDtMs(5_000, Number.NaN)).toBe(5_000);
  });
});

/** minimal document double — only the surface createVisibilityController touches. */
function fakeDoc(initial: "hidden" | "visible") {
  let state = initial;
  let handler: (() => void) | null = null;
  return {
    get visibilityState() {
      return state;
    },
    set(next: "hidden" | "visible") {
      state = next;
      handler?.();
    },
    addEventListener: (_type: string, cb: () => void) => {
      handler = cb;
    },
    removeEventListener: vi.fn(() => {
      handler = null;
    }),
    hasHandler: () => handler !== null,
  };
}

describe("createVisibilityController — hidden/visible dispatch (D-056)", () => {
  test("routes hidden → onHidden, visible → onVisible", () => {
    const doc = fakeDoc("visible");
    const onHidden = vi.fn();
    const onVisible = vi.fn();
    createVisibilityController({ onHidden, onVisible }, doc);

    doc.set("hidden");
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(onVisible).not.toHaveBeenCalled();

    doc.set("visible");
    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  test("detach removes the listener", () => {
    const doc = fakeDoc("visible");
    const ctrl = createVisibilityController({ onHidden: vi.fn(), onVisible: vi.fn() }, doc);
    expect(doc.hasHandler()).toBe(true);
    ctrl.detach();
    expect(doc.removeEventListener).toHaveBeenCalledTimes(1);
    expect(doc.hasHandler()).toBe(false);
  });
});
