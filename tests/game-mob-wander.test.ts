import { describe, expect, test } from "vitest";
import {
  createWanderState,
  stepWander,
  walkableFromMap,
  type MobWanderState,
} from "@/game/mob/wander";
import { createLcgRng } from "@/game/mob/rng";
import type { MobWanderConfig } from "@/engine/config";
import type { TileRect } from "@/engine/map/types";
import type { WalkableFn } from "@/engine/movement/mover";
import { loadMapConfig } from "@/engine/map/loader";
import type { MapConfigInput } from "@/engine/map/types";

const ALL_WALKABLE: WalkableFn = () => true;

/** rng คงที่ — ทุกครั้ง rng() คืนค่าเดียวกัน (ควบคุม randomRange/randomDirection ให้ deterministic เป๊ะ). */
const constRng = (value: number) => (): number => value;

const CONFIG: MobWanderConfig = {
  speed: 2,
  maxStepSeconds: 0.1,
  idleDurationMs: { min: 1000, max: 1000 }, // min=max → ตัดสุ่มออก, เทียบค่าตรง ๆ ได้
  walkDurationMs: { min: 500, max: 500 },
};

describe("createWanderState", () => {
  test("เริ่มที่ idle เสมอ + intent (0,0) + remainingMs ในช่วง idleDurationMs", () => {
    const state = createWanderState(CONFIG, createLcgRng(1));
    expect(state.mode).toBe("idle");
    expect(state.intent).toEqual({ tx: 0, ty: 0 });
    expect(state.remainingMs).toBeGreaterThanOrEqual(CONFIG.idleDurationMs.min);
    expect(state.remainingMs).toBeLessThanOrEqual(CONFIG.idleDurationMs.max);
  });
});

describe("stepWander — สลับ idle/walk ตาม config (ไม่ hardcode)", () => {
  const area: TileRect = { tx: 0, ty: 0, width: 20, height: 20 }; // กว้างพอไม่ชน leash ในเทสต์นี้

  test("idle ครบเวลา → เปลี่ยนเป็น walking ด้วย remainingMs/intent จาก config", () => {
    const rng = constRng(0); // randomRange → min เสมอ, randomDirection angle=0 → (1,0)
    const state0 = createWanderState(CONFIG, rng); // idle, remainingMs = 1000 (min=max)
    const dt = state0.remainingMs / 1000; // ครบเวลาเป๊ะ

    const result = stepWander(
      { tx: 5, ty: 5 },
      state0,
      dt,
      area,
      CONFIG,
      ALL_WALKABLE,
      rng,
    );

    expect(result.state.mode).toBe("walking");
    expect(result.state.remainingMs).toBe(CONFIG.walkDurationMs.min); // = 500
    expect(result.state.intent).toEqual({ tx: 1, ty: 0 }); // cos(0)=1, sin(0)=0
  });

  test("walking ครบเวลา → กลับเป็น idle, intent (0,0), remainingMs จาก idleDurationMs", () => {
    const rng = constRng(0);
    const walkingState: MobWanderState = {
      mode: "walking",
      remainingMs: 500,
      intent: { tx: 1, ty: 0 },
    };
    const result = stepWander(
      { tx: 5, ty: 5 },
      walkingState,
      0.5, // ครบ 500ms เป๊ะ
      area,
      CONFIG,
      ALL_WALKABLE,
      rng,
    );
    expect(result.state.mode).toBe("idle");
    expect(result.state.intent).toEqual({ tx: 0, ty: 0 });
    expect(result.state.remainingMs).toBe(CONFIG.idleDurationMs.min); // = 1000
  });

  test("idle ยังไม่ครบเวลา → นับถอยหลังเฉย ๆ ไม่ขยับตำแหน่ง", () => {
    const rng = (): number => {
      throw new Error("ไม่ควรสุ่มระหว่าง idle ที่ยังไม่ครบเวลา");
    };
    const state0: MobWanderState = { mode: "idle", remainingMs: 1000, intent: { tx: 0, ty: 0 } };
    const pos = { tx: 5, ty: 5 };
    const result = stepWander(pos, state0, 0.2, area, CONFIG, ALL_WALKABLE, rng);
    expect(result.state.mode).toBe("idle");
    expect(result.state.remainingMs).toBeCloseTo(800, 10);
    expect(result.pos).toEqual({ tx: 5, ty: 5 });
  });

  test("pure — ไม่ mutate pos/state เดิม", () => {
    const rng = constRng(0.3);
    const state0 = createWanderState(CONFIG, rng);
    const posBefore = { tx: 5, ty: 5 };
    const stateSnapshot = { ...state0 };
    stepWander(posBefore, state0, 0.05, area, CONFIG, ALL_WALKABLE, rng);
    expect(posBefore).toEqual({ tx: 5, ty: 5 });
    expect(state0).toEqual(stateSnapshot);
  });

  test("ตอน walking เดินด้วย speed จาก config (ระยะ = speed·dt เมื่อ dt < maxStep)", () => {
    const walkingState: MobWanderState = {
      mode: "walking",
      remainingMs: 5000, // ไม่ครบเวลาในสเต็ปนี้ (ไม่สุ่มทิศใหม่)
      intent: { tx: 1, ty: 0 },
    };
    const dt = 0.05;
    const noRngCall = (): number => {
      throw new Error("ไม่ควรสุ่มระหว่าง walking ที่ยังไม่ครบเวลา");
    };
    const result = stepWander(
      { tx: 5, ty: 5 },
      walkingState,
      dt,
      area,
      CONFIG,
      ALL_WALKABLE,
      noRngCall,
    );
    expect(result.pos.tx - 5).toBeCloseTo(CONFIG.speed * dt, 10);
    expect(result.pos.ty).toBeCloseTo(5, 10);
  });
});

describe("stepWander — leash: ห้ามหลุด pocket.area", () => {
  test("เดินตรงออกนอกขอบซ้ำ ๆ หลายร้อยสเต็ป → ไม่มีวันหลุด area (แม้ map เดินได้หมด)", () => {
    const area: TileRect = { tx: 5, ty: 5, width: 3, height: 3 }; // [5,8) × [5,8)
    let state: MobWanderState = {
      mode: "walking",
      remainingMs: 1e9, // ไม่มีวันครบเวลา → ไม่สุ่มทิศใหม่ระหว่างทดสอบ
      intent: { tx: 1, ty: 1 }, // มุ่งออกขวา-ล่างเสมอ
    };
    let pos = { tx: 6, ty: 6 };
    const noRngCall = (): number => {
      throw new Error("ไม่ควรสุ่มเลยในเทสต์นี้ (remainingMs ไม่มีวันครบ)");
    };

    for (let i = 0; i < 500; i++) {
      const result = stepWander(pos, state, 0.1, area, CONFIG, ALL_WALKABLE, noRngCall);
      pos = result.pos;
      state = result.state;
      expect(pos.tx).toBeGreaterThanOrEqual(area.tx);
      expect(pos.ty).toBeGreaterThanOrEqual(area.ty);
      expect(pos.tx).toBeLessThan(area.tx + area.width);
      expect(pos.ty).toBeLessThan(area.ty + area.height);
    }
  });

  test("random walk (seeded LCG) หลายร้อยสเต็ป → ไม่เคยหลุด area", () => {
    const area: TileRect = { tx: 2, ty: 2, width: 6, height: 4 };
    for (let seed = 0; seed < 10; seed++) {
      const rng = createLcgRng(seed);
      let state = createWanderState(CONFIG, rng);
      let pos = { tx: 4, ty: 3 };
      for (let i = 0; i < 400; i++) {
        const result = stepWander(pos, state, 0.05, area, CONFIG, ALL_WALKABLE, rng);
        pos = result.pos;
        state = result.state;
        expect(pos.tx).toBeGreaterThanOrEqual(area.tx);
        expect(pos.ty).toBeGreaterThanOrEqual(area.ty);
        expect(pos.tx).toBeLessThan(area.tx + area.width);
        expect(pos.ty).toBeLessThan(area.ty + area.height);
      }
    }
  });

  test("leash ยังเคารพ collision ของ map จริงด้วย (ไม่ใช่แค่ area)", () => {
    const area: TileRect = { tx: 0, ty: 0, width: 10, height: 10 };
    const blockedFromTx6: WalkableFn = (tx) => tx < 6;
    let state: MobWanderState = { mode: "walking", remainingMs: 1e9, intent: { tx: 1, ty: 0 } };
    let pos = { tx: 5.5, ty: 5 };
    const noRngCall = (): number => {
      throw new Error("ไม่ควรสุ่ม");
    };
    for (let i = 0; i < 50; i++) {
      const result = stepWander(pos, state, 0.1, area, CONFIG, blockedFromTx6, noRngCall);
      pos = result.pos;
      state = result.state;
    }
    expect(pos.tx).toBeLessThan(6);
  });
});

describe("walkableFromMap — ผูก isWalkableTile ของ map จริง", () => {
  const cfg: MapConfigInput = {
    mapId: "test",
    name: "Test",
    tileSize: { width: 64, height: 32 },
    bounds: { width: 10, height: 10 },
    spawnPoint: { x: 1, y: 1 },
    collision: { blockedRects: [{ tx: 3, ty: 3, width: 1, height: 1 }], blockedTiles: [] },
    props: [],
    mobPockets: [],
  };

  test("tile block → false, tile ปกติ → true", () => {
    const map = loadMapConfig(cfg);
    const isWalkable = walkableFromMap(map);
    expect(isWalkable(3, 3)).toBe(false);
    expect(isWalkable(1, 1)).toBe(true);
    expect(isWalkable(99, 99)).toBe(false); // นอกขอบ
  });
});
