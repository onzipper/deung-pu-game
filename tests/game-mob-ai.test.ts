import { describe, expect, test } from "vitest";
import {
  distSq,
  hasReachedSpawn,
  idleTickInterval,
  isPocketActive,
  isRespawnDue,
  selectAggroTarget,
  shouldReturnToSpawn,
  shouldStepPocket,
  stepToward,
  type AiPlayerRef,
} from "@/game/mob/ai";
import type { MoveParams, WalkableFn } from "@/engine/movement/mover";
import type { TileRect } from "@/engine/map/types";

const ALL_WALKABLE: WalkableFn = () => true;
const EMPTY_PULL = new Map<string, number>();

describe("distSq", () => {
  test("ระยะกำลังสองถูกต้อง", () => {
    expect(distSq(0, 0, 3, 4)).toBe(25);
    expect(distSq(1, 1, 1, 1)).toBe(0);
  });
});

describe("selectAggroTarget — เลือกเป้าใกล้สุดในรัศมี + เคารพ pull cap (§18.3)", () => {
  const pos = { tx: 0, ty: 0 };

  test("ไม่มีผู้เล่นในรัศมี → null", () => {
    const players: AiPlayerRef[] = [{ id: "a", tx: 10, ty: 0 }];
    expect(selectAggroTarget(pos, players, 4, EMPTY_PULL, 10)).toBeNull();
  });

  test("เลือกผู้เล่นใกล้สุดในรัศมี", () => {
    const players: AiPlayerRef[] = [
      { id: "far", tx: 3, ty: 0 },
      { id: "near", tx: 1, ty: 0 },
    ];
    expect(selectAggroTarget(pos, players, 4, EMPTY_PULL, 10)).toBe("near");
  });

  test("ขอบรัศมีพอดี → ยังติด", () => {
    const players: AiPlayerRef[] = [{ id: "edge", tx: 4, ty: 0 }];
    expect(selectAggroTarget(pos, players, 4, EMPTY_PULL, 10)).toBe("edge");
  });

  test("ผู้เล่นที่ pull count ถึง cap → ถูกข้าม (ไป aggro คนอื่น)", () => {
    const players: AiPlayerRef[] = [
      { id: "full", tx: 1, ty: 0 }, // ใกล้สุดแต่เต็ม cap
      { id: "open", tx: 2, ty: 0 },
    ];
    const pull = new Map<string, number>([["full", 10]]);
    expect(selectAggroTarget(pos, players, 5, pull, 10)).toBe("open");
  });

  test("ทุกคนเต็ม cap → null (ไม่ aggro เพิ่ม)", () => {
    const players: AiPlayerRef[] = [{ id: "a", tx: 1, ty: 0 }];
    const pull = new Map<string, number>([["a", 10]]);
    expect(selectAggroTarget(pos, players, 5, pull, 10)).toBeNull();
  });
});

describe("shouldReturnToSpawn — leash (§18.3)", () => {
  const origin = { tx: 0, ty: 0 };
  const target: AiPlayerRef = { id: "p", tx: 2, ty: 0 };

  test("เป้าหาย (null) → return", () => {
    expect(shouldReturnToSpawn({ tx: 2, ty: 0 }, origin, null, 9, 8)).toBe(true);
  });

  test("ถูกลากไกลจากจุดเกิดเกิน leashRadius → return", () => {
    // มอนอยู่ห่างจุดเกิด 10 > leash 8, แม้เป้าอยู่ติดมอน
    const mob = { tx: 10, ty: 0 };
    const near: AiPlayerRef = { id: "p", tx: 10.5, ty: 0 };
    expect(shouldReturnToSpawn(mob, origin, near, 9, 8)).toBe(true);
  });

  test("เป้าหนีห่างมอนเกิน deaggroRadius → return", () => {
    const mob = { tx: 1, ty: 0 }; // ใกล้จุดเกิด (ไม่ติด leash)
    const runaway: AiPlayerRef = { id: "p", tx: 11, ty: 0 }; // ห่างมอน 10 > deaggro 9
    expect(shouldReturnToSpawn(mob, origin, runaway, 9, 8)).toBe(true);
  });

  test("ทุกเงื่อนไขปลอดภัย → ไม่ return (ไล่ต่อ)", () => {
    expect(shouldReturnToSpawn({ tx: 2, ty: 0 }, origin, target, 9, 8)).toBe(false);
  });
});

describe("hasReachedSpawn", () => {
  test("อยู่ในระยะ reset → ถึงแล้ว", () => {
    expect(hasReachedSpawn({ tx: 0.5, ty: 0 }, { tx: 0, ty: 0 }, 0.75)).toBe(true);
  });
  test("ยังไกลจากจุดเกิด → ยังไม่ถึง", () => {
    expect(hasReachedSpawn({ tx: 2, ty: 0 }, { tx: 0, ty: 0 }, 0.75)).toBe(false);
  });
});

describe("stepToward — เดินตรงเข้าหาเป้า (chase/return)", () => {
  const params: MoveParams = { speed: 3, maxStepSeconds: 0.1 };

  test("ขยับเข้าหาเป้าเป็นระยะ speed·dt", () => {
    const next = stepToward({ tx: 0, ty: 0 }, { tx: 10, ty: 0 }, 0.1, params, ALL_WALKABLE);
    expect(next.tx).toBeCloseTo(0.3, 10); // 3 * 0.1
    expect(next.ty).toBeCloseTo(0, 10);
  });

  test("ทิศทแยง normalize (ไม่เร็วกว่าเดินตรง)", () => {
    const next = stepToward({ tx: 0, ty: 0 }, { tx: 10, ty: 10 }, 0.1, params, ALL_WALKABLE);
    const dist = Math.hypot(next.tx, next.ty);
    expect(dist).toBeCloseTo(0.3, 10);
  });

  test("เป้าปลายทาง block → ไถลติด (ไม่ทะลุ)", () => {
    const blocked: WalkableFn = (tx) => tx < 1; // ตั้งแต่ tx≥1 เดินไม่ได้
    let pos = { tx: 0, ty: 0 };
    for (let i = 0; i < 50; i++) pos = stepToward(pos, { tx: 10, ty: 0 }, 0.1, params, blocked);
    expect(pos.tx).toBeLessThan(1);
  });
});

describe("isPocketActive — AOI (§11)", () => {
  const area: TileRect = { tx: 5, ty: 5, width: 4, height: 4 }; // [5,9)×[5,9)

  test("ผู้เล่นในระยะ AOI จากขอบ pocket → active", () => {
    const players: AiPlayerRef[] = [{ id: "p", tx: 11, ty: 6 }]; // ห่างขอบ (tx=9) 2 tile
    expect(isPocketActive(area, players, 3)).toBe(true);
  });

  test("ผู้เล่นไกลเกิน AOI → ไม่ active", () => {
    const players: AiPlayerRef[] = [{ id: "p", tx: 20, ty: 20 }];
    expect(isPocketActive(area, players, 3)).toBe(false);
  });

  test("ผู้เล่นอยู่ใน pocket → active (dist 0)", () => {
    const players: AiPlayerRef[] = [{ id: "p", tx: 6, ty: 6 }];
    expect(isPocketActive(area, players, 1)).toBe(true);
  });

  test("ไม่มีผู้เล่น → ไม่ active", () => {
    expect(isPocketActive(area, [], 100)).toBe(false);
  });
});

describe("idleTickInterval + shouldStepPocket — AI LOD tick decision (§6/§11)", () => {
  test("idleTickInterval: 10Hz base / 2Hz idle → step ทุก 5 cycle", () => {
    expect(idleTickInterval(10, 2)).toBe(5);
  });
  test("idleTickInterval: idleHz 0 → 0 (หลับสนิท sentinel)", () => {
    expect(idleTickInterval(10, 0)).toBe(0);
  });

  test("active → step ทุก cycle", () => {
    for (let c = 0; c < 10; c++) expect(shouldStepPocket(true, c, 5)).toBe(true);
  });

  test("idle interval 5 → step เฉพาะ cycle ที่หาร 5 ลงตัว", () => {
    expect(shouldStepPocket(false, 0, 5)).toBe(true);
    expect(shouldStepPocket(false, 5, 5)).toBe(true);
    expect(shouldStepPocket(false, 1, 5)).toBe(false);
    expect(shouldStepPocket(false, 4, 5)).toBe(false);
  });

  test("idle interval 0 (asleep) → ไม่ step เลย", () => {
    for (let c = 0; c < 10; c++) expect(shouldStepPocket(false, c, 0)).toBe(false);
  });
});

describe("isRespawnDue — respawn timer (clock inject)", () => {
  test("nowMs ≥ dueAtMs → due", () => {
    expect(isRespawnDue(1000, 1000)).toBe(true);
    expect(isRespawnDue(1000, 1500)).toBe(true);
  });
  test("nowMs < dueAtMs → ยังไม่ due", () => {
    expect(isRespawnDue(1000, 999)).toBe(false);
  });
});
