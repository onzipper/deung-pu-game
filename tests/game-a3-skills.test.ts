import { describe, expect, test } from "vitest";
import { damageReductionFromStatus } from "@/game/combat/formula";
import { createMobSimulation, type SimMob } from "@/game/mob/simulation";
import { createLcgRng } from "@/game/mob/rng";
import { loadMapConfig } from "@/engine/map/loader";
import { DEFAULT_COMBAT_BALANCE_CONFIG, DEFAULT_ENGINE_CONFIG } from "@/engine/config";
import type { MapConfig, MapConfigInput } from "@/engine/map/types";

// A3 skill hotbar — server logic (§50.1 · P1_BALANCE §3.1 S4 sword_guard_domain):
//   • damageReductionFromStatus — resolve ค่าลด damage รับจาก statusEffects (self_damage_reduction_30 → knob)
//   • tauntMobsNear — S4 taunt (crowdControl) ดึง aggro มอนรอบตัวสูงสุด maxTargets

describe("damageReductionFromStatus (A3 S4 · §50.1 statusEffects)", () => {
  const table = DEFAULT_COMBAT_BALANCE_CONFIG.statusEffectDamageReduction;

  test("config S4 self_damage_reduction_30 = 0.30 (จากชื่อ effect §3.1)", () => {
    expect(table.self_damage_reduction_30).toBeCloseTo(0.3);
  });
  test("id ตรง table → คืน reduction", () => {
    expect(damageReductionFromStatus(["self_damage_reduction_30"], table)).toBeCloseTo(0.3);
  });
  test("null / ว่าง → 0", () => {
    expect(damageReductionFromStatus(null, table)).toBe(0);
    expect(damageReductionFromStatus([], table)).toBe(0);
  });
  test("id ไม่รู้จัก → 0", () => {
    expect(damageReductionFromStatus(["mystery_buff"], table)).toBe(0);
  });
  test("หลาย effect → เอาค่ามากสุด (ไม่สแต็กบวก)", () => {
    expect(damageReductionFromStatus(["a", "b"], { a: 0.2, b: 0.9 })).toBeCloseTo(0.9);
  });
  test("clamp เข้า [0,1] (กัน knob เพี้ยน)", () => {
    expect(damageReductionFromStatus(["x"], { x: 1.5 })).toBe(1);
    expect(damageReductionFromStatus(["x"], { x: -0.5 })).toBe(0);
  });
});

/** map 20×20 เดินได้หมด + 1 pocket สไลม์ 4 ตัวกลางแผนที่ (tx/ty 8-12). */
function tauntMap(): MapConfig {
  const input: MapConfigInput = {
    mapId: "taunt-test",
    name: "Taunt Test",
    tileSize: { width: 64, height: 32 },
    bounds: { width: 20, height: 20 },
    spawnPoint: { x: 1, y: 1 },
    collision: { blockedRects: [], blockedTiles: [] },
    props: [],
    mobPockets: [
      {
        pocketId: "pk",
        area: { tx: 8, ty: 8, width: 4, height: 4 },
        mobType: "slime",
        packSize: { min: 4, max: 4 },
        activeCap: 4,
      },
    ],
  };
  return loadMapConfig(input);
}

function makeTauntSim() {
  // ไม่มี player ใน tick → มอนไม่ aggro เอง (targetPlayerId เปลี่ยนเฉพาะจาก taunt). มอน spawn ตอนสร้าง sim.
  return createMobSimulation({
    map: tauntMap(),
    config: DEFAULT_ENGINE_CONFIG.mob,
    hpFor: () => 45,
    rng: createLcgRng(7),
  });
}

function countTargeting(sim: ReturnType<typeof makeTauntSim>, playerId: string): number {
  let n = 0;
  sim.forEach((m: SimMob) => {
    if (m.mode === "chase" && m.targetPlayerId === playerId) n++;
  });
  return n;
}

describe("tauntMobsNear (A3 S4 taunt · §50.1 crowdControl)", () => {
  test("มอนในรัศมี → mode chase + targetPlayerId = caster (คืนจำนวนตรงกับที่ตั้ง)", () => {
    const sim = makeTauntSim();
    const n = sim.tauntMobsNear({ tx: 10, ty: 10 }, 20, 8, "hero"); // รัศมีกว้างครอบทั้ง pocket
    expect(n).toBeGreaterThan(0);
    expect(countTargeting(sim, "hero")).toBe(n);
  });

  test("cap ที่ maxTargets", () => {
    const sim = makeTauntSim();
    const n = sim.tauntMobsNear({ tx: 10, ty: 10 }, 20, 2, "hero");
    expect(n).toBeLessThanOrEqual(2);
    expect(countTargeting(sim, "hero")).toBe(n);
  });

  test("รัศมี 0 หรือ maxTargets 0 → ไม่ taunt", () => {
    const sim = makeTauntSim();
    expect(sim.tauntMobsNear({ tx: 10, ty: 10 }, 0, 8, "hero")).toBe(0);
    expect(sim.tauntMobsNear({ tx: 10, ty: 10 }, 20, 0, "hero")).toBe(0);
  });

  test("นอกรัศมี → ไม่โดน taunt", () => {
    const sim = makeTauntSim();
    // ศูนย์กลางมุม (0,0) รัศมี 1 → ไกลจาก pocket (8-12) → ไม่มีตัวไหนเข้าเงื่อนไข
    expect(sim.tauntMobsNear({ tx: 0, ty: 0 }, 1, 8, "hero")).toBe(0);
  });
});
