import { describe, expect, test, vi } from "vitest";
import {
  createAutoPilot,
  canReachDestination,
  reachedDestination,
  type AutoPilotPlayer,
  type AutoPilotStateChange,
} from "@/engine/player/auto-pilot";
import type { WalkableFn } from "@/engine/movement/mover";
import type { TilePoint } from "@/engine/iso/coords";
import { loadMapConfig } from "@/engine/map/loader";
import { P0_TEST_FIELD } from "@/engine/map/p0-test-field";
import { DEFAULT_AUTO_PILOT_CONFIG, type AutoPilotConfig } from "@/engine/config";

// P0 test field: กลาง (12,12) เดินได้ · (6,4) = กำแพง (block) · (16,16) = ขอบบ่อน้ำ (block).
const MAP = loadMapConfig(P0_TEST_FIELD);
const MAX_NODES = 4096;

// --- fake player (Pixi-free) — คุม position/isFollowingPath/manualInputActive + สอด moveTo/cancelPath ---
interface FakeState {
  position: TilePoint;
  isFollowingPath: boolean;
  manualInputActive: boolean;
  moveToResult: boolean;
  moveToCalls: TilePoint[];
  cancelCalls: number;
}
function fakePlayer(init: Partial<FakeState> = {}): { player: AutoPilotPlayer; state: FakeState } {
  const state: FakeState = {
    position: { tx: 12.5, ty: 12.5 },
    isFollowingPath: true,
    manualInputActive: false,
    moveToResult: true,
    moveToCalls: [],
    cancelCalls: 0,
    ...init,
  };
  const player: AutoPilotPlayer = {
    get position() {
      return state.position;
    },
    get isFollowingPath() {
      return state.isFollowingPath;
    },
    get manualInputActive() {
      return state.manualInputActive;
    },
    moveTo(goal) {
      state.moveToCalls.push({ tx: goal.tx, ty: goal.ty });
      return state.moveToResult;
    },
    cancelPath() {
      state.cancelCalls++;
    },
  };
  return { player, state };
}

function make(cfg?: Partial<AutoPilotConfig>, init?: Partial<FakeState>) {
  const { player, state } = fakePlayer(init);
  const onChange = vi.fn<(c: AutoPilotStateChange) => void>();
  const config: AutoPilotConfig = { ...DEFAULT_AUTO_PILOT_CONFIG, ...cfg };
  const ap = createAutoPilot(player, MAP, config, { maxSearchNodes: MAX_NODES, onChange });
  return { ap, state, onChange };
}

describe("auto-pilot — reachedDestination (pure)", () => {
  test("อยู่กลาง cell ปลายทางพอดี → ถึง (tol 0.5)", () => {
    expect(reachedDestination({ tx: 13.5, ty: 13.5 }, { tx: 13, ty: 13 }, 0.5)).toBe(true);
  });
  test("ห่างเกิน tolerance → ยังไม่ถึง", () => {
    expect(reachedDestination({ tx: 13.5, ty: 14.5 }, { tx: 13, ty: 13 }, 0.5)).toBe(false);
  });
});

describe("auto-pilot — canReachDestination (pure, A* reuse)", () => {
  const ALL: WalkableFn = () => true;
  test("เดินได้ทั้งหมด → มี path", () => {
    expect(canReachDestination({ tx: 0, ty: 0 }, { tx: 5, ty: 5 }, ALL, MAX_NODES)).toBe(true);
  });
  test("ปลายทางเดินไม่ได้ → reject", () => {
    const wallDest: WalkableFn = (tx, ty) => !(tx === 5 && ty === 5);
    expect(canReachDestination({ tx: 0, ty: 0 }, { tx: 5, ty: 5 }, wallDest, MAX_NODES)).toBe(false);
  });
  test("ปลายทางเดินได้แต่ไม่มีเส้นทางเชื่อม → reject", () => {
    const island: WalkableFn = (tx, ty) => (tx === 0 && ty === 0) || (tx === 5 && ty === 5);
    expect(canReachDestination({ tx: 0, ty: 0 }, { tx: 5, ty: 5 }, island, MAX_NODES)).toBe(false);
  });
});

describe("auto-pilot — start validate/reject", () => {
  test("knob ปิด (enabled=false) → reject 'disabled', ไม่ active, ไม่ publish", () => {
    const { ap, onChange } = make({ enabled: false });
    expect(ap.start({ tx: 13, ty: 13 })).toEqual({ ok: false, reason: "disabled" });
    expect(ap.isActive).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("ปลายทางเป็นกำแพง (เดินไม่ถึง) → reject 'unreachable' + publish stopReason 'noPath'", () => {
    const { ap, onChange } = make();
    expect(ap.start({ tx: 6, ty: 4 })).toEqual({ ok: false, reason: "unreachable" });
    expect(ap.isActive).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith({ active: false, destination: null, stopReason: "noPath" });
  });

  test("ปลายทางเดินถึง → ok, active, destination = cell, moveTo กลาง cell, publish active", () => {
    const { ap, state, onChange } = make();
    expect(ap.start({ tx: 13, ty: 13 })).toEqual({ ok: true });
    expect(ap.isActive).toBe(true);
    expect(ap.destination).toEqual({ tx: 13, ty: 13 });
    expect(state.moveToCalls[0]).toEqual({ tx: 13.5, ty: 13.5 });
    expect(onChange).toHaveBeenLastCalledWith({
      active: true,
      destination: { tx: 13, ty: 13 },
      stopReason: null,
    });
  });
});

describe("auto-pilot — update stop conditions", () => {
  test("ถึงจุดหมาย → stop('arrived') + cancelPath + publish", () => {
    const { ap, state, onChange } = make();
    ap.start({ tx: 13, ty: 13 });
    state.position = { tx: 13.5, ty: 13.5 }; // = กลาง cell ปลายทาง
    ap.update(0.1);
    expect(ap.isActive).toBe(false);
    expect(state.cancelCalls).toBeGreaterThan(0);
    expect(onChange).toHaveBeenLastCalledWith({ active: false, destination: null, stopReason: "arrived" });
  });

  test("ผู้เล่นกด WASD (manualInputActive) → stop('manual')", () => {
    const { ap, state, onChange } = make();
    ap.start({ tx: 13, ty: 13 });
    state.manualInputActive = true;
    ap.update(0.1);
    expect(ap.isActive).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith({ active: false, destination: null, stopReason: "manual" });
  });

  test("path จบก่อนถึง + replan ล้มเหลว → stop('noPath')", () => {
    const { ap, state, onChange } = make();
    ap.start({ tx: 13, ty: 13 });
    state.isFollowingPath = false;
    state.moveToResult = false; // replan เดินไม่ถึง
    ap.update(0.1);
    expect(ap.isActive).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith({ active: false, destination: null, stopReason: "noPath" });
  });

  test("replan ตามคาบ: dt ครบ replanIntervalMs → moveTo ซ้ำ; dt น้อย → ไม่ replan", () => {
    const { ap, state } = make({ replanIntervalMs: 500 });
    ap.start({ tx: 13, ty: 13 }); // moveTo #1 (initial)
    state.position = { tx: 12.5, ty: 12.5 }; // ยังไม่ถึง (ห่าง > tol)
    ap.update(0.6); // 600ms ≥ 500 → replan (moveTo #2)
    expect(state.moveToCalls.length).toBe(2);
    ap.update(0.1); // 100ms < 500 → ไม่ replan
    expect(state.moveToCalls.length).toBe(2);
  });
});

describe("auto-pilot — stop reasons + idempotency", () => {
  test.each(["combat", "tabHidden", "transition", "disconnect"] as const)(
    "stop('%s') → publish reason นั้น + active false",
    (reason) => {
      const { ap, onChange } = make();
      ap.start({ tx: 13, ty: 13 });
      ap.stop(reason);
      expect(ap.isActive).toBe(false);
      expect(onChange).toHaveBeenLastCalledWith({ active: false, destination: null, stopReason: reason });
    },
  );

  test("stop ซ้ำ = idempotent (reason แรกชนะ, ไม่ publish รอบสอง)", () => {
    const { ap, onChange } = make();
    ap.start({ tx: 13, ty: 13 });
    ap.stop("manual");
    const callsAfterFirst = onChange.mock.calls.length;
    ap.stop("combat"); // no-op
    expect(onChange.mock.calls.length).toBe(callsAfterFirst);
    expect(onChange).toHaveBeenLastCalledWith({ active: false, destination: null, stopReason: "manual" });
  });

  test("destroy ระหว่าง active → หยุด (isActive false)", () => {
    const { ap } = make();
    ap.start({ tx: 13, ty: 13 });
    ap.destroy();
    expect(ap.isActive).toBe(false);
  });
});
