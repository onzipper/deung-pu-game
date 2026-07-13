import { describe, expect, test } from "vitest";
import { createMobSimulation, type SimMob } from "@/game/mob/simulation";
import { createLcgRng } from "@/game/mob/rng";
import { loadMapConfig } from "@/engine/map/loader";
import { DEFAULT_ENGINE_CONFIG } from "@/engine/config";
import type { MobConfig } from "@/engine/config";
import type { MapConfig, MapConfigInput } from "@/engine/map/types";
import type { AiPlayerRef } from "@/game/mob/ai";

const HP_FOR = (): number => 30;

/** map ทดสอบ: 20×20 เดินได้หมด (ไม่มี collision) + 1 pocket ควบคุม packSize/activeCap เป๊ะ. */
function makeMap(packSize: number, activeCap: number): MapConfig {
  const input: MapConfigInput = {
    mapId: "sim-test",
    name: "Sim Test",
    tileSize: { width: 64, height: 32 },
    bounds: { width: 20, height: 20 },
    spawnPoint: { x: 1, y: 1 },
    collision: { blockedRects: [], blockedTiles: [] },
    props: [],
    mobPockets: [
      {
        pocketId: "pk",
        area: { tx: 5, ty: 5, width: 4, height: 4 }, // [5,9)×[5,9), center ~7,7
        mobType: "slime",
        packSize: { min: packSize, max: packSize },
        activeCap,
      },
    ],
  };
  return loadMapConfig(input);
}

/** config override เฉพาะ knob ที่เทสต์สนใจ (คงที่เหลือจาก default). */
function makeConfig(over: {
  ai?: Partial<MobConfig["ai"]>;
  lod?: Partial<MobConfig["lod"]>;
  respawnDelayMs?: number;
}): MobConfig {
  const base = DEFAULT_ENGINE_CONFIG.mob;
  return {
    ...base,
    ai: { ...base.ai, ...over.ai },
    lod: { ...base.lod, ...over.lod },
    respawnDelayMs: over.respawnDelayMs ?? base.respawnDelayMs,
  };
}

const CENTER_PLAYER: AiPlayerRef[] = [{ id: "p1", tx: 7, ty: 7 }];

function grabOnly(sim: ReturnType<typeof createMobSimulation>): SimMob {
  let found: SimMob | null = null;
  sim.forEach((m) => {
    found = m;
  });
  if (!found) throw new Error("no mob");
  return found;
}

describe("createMobSimulation — spawn ชุดแรก", () => {
  test("spawn ตาม packSize/pocket (clamp activeCap) + mode wander เริ่มต้น", () => {
    const sim = createMobSimulation({
      map: makeMap(3, 6),
      config: makeConfig({}),
      hpFor: HP_FOR,
      rng: createLcgRng(1),
    });
    expect(sim.mobCount).toBe(3);
    sim.forEach((m) => {
      expect(m.mobType).toBe("slime");
      expect(m.mode).toBe("wander");
      // อยู่ใน pocket area
      expect(m.pos.tx).toBeGreaterThanOrEqual(5);
      expect(m.pos.tx).toBeLessThan(9);
    });
  });
});

describe("aggro state machine — enter/chase (§18.3)", () => {
  test("ผู้เล่นเข้าใกล้ pocket → มอน chase + เดินเข้าหา (ระยะลดลง)", () => {
    const sim = createMobSimulation({
      map: makeMap(1, 1),
      config: makeConfig({ ai: { aggroRadius: { slime: 6 }, chaseSpeed: 3 }, lod: { aoiRadius: 20 } }),
      hpFor: HP_FOR,
      rng: createLcgRng(2),
    });
    const mob = grabOnly(sim);
    const distBefore = Math.hypot(mob.pos.tx - 7, mob.pos.ty - 7);

    sim.tick(0.1, CENTER_PLAYER, 100); // tick แรก → aggro ทันที (wander เช็ค aggro ก่อนเดิน)
    expect(sim.aggroCountFor("p1")).toBe(1);
    expect(grabOnly(sim).mode).toBe("chase");

    for (let i = 0; i < 8; i++) sim.tick(0.1, CENTER_PLAYER, 200 + i * 100);
    const distAfter = Math.hypot(grabOnly(sim).pos.tx - 7, grabOnly(sim).pos.ty - 7);
    expect(distAfter).toBeLessThan(distBefore); // เดินเข้าหาผู้เล่นจริง
  });
});

describe("pull cap — จำกัดจำนวนมอน aggro ต่อผู้เล่น (§18.3)", () => {
  test("มอนมากกว่า cap → aggro ได้ไม่เกิน cap", () => {
    const sim = createMobSimulation({
      map: makeMap(6, 6),
      config: makeConfig({ ai: { pullCap: 2, aggroRadius: { slime: 20 } }, lod: { aoiRadius: 20 } }),
      hpFor: HP_FOR,
      rng: createLcgRng(3),
    });
    expect(sim.mobCount).toBe(6);
    sim.tick(0.1, CENTER_PLAYER, 100);
    expect(sim.aggroCountFor("p1")).toBe(2); // เต็ม cap พอดี ไม่เกิน
  });
});

describe("leash/return — เลิกไล่แล้วกลับจุดเกิด (§18.3)", () => {
  test("ผู้เล่นล่อออกนอก pocket แล้วหนีไกล → มอนเลิก aggro → return → กลับเข้า pocket", () => {
    const sim = createMobSimulation({
      map: makeMap(1, 1),
      config: makeConfig({
        // leashRadius กว้าง (ให้ตามออกนอก pocket ได้) · deaggroRadius แคบ (หนีแล้วปล่อยไว)
        ai: { aggroRadius: { slime: 8 }, chaseSpeed: 3, leashRadius: 12, deaggroRadius: 6 },
        lod: { aoiRadius: 30 },
      }),
      hpFor: HP_FOR,
      rng: createLcgRng(4),
    });
    // ล่อด้วยผู้เล่นนอก pocket ทางตะวันออก → มอนไล่ออกไกลจากจุดเกิด
    const lurePlayer: AiPlayerRef[] = [{ id: "p1", tx: 12, ty: 7 }];
    sim.tick(0.1, lurePlayer, 100);
    expect(sim.aggroCountFor("p1")).toBe(1);
    const origin = grabOnly(sim).spawnOrigin;
    for (let i = 0; i < 20; i++) sim.tick(0.1, lurePlayer, 200 + i * 100); // ไล่จนออกไกลจากจุดเกิด
    const chasing = grabOnly(sim);
    expect(chasing.mode).toBe("chase");
    expect(Math.hypot(chasing.pos.tx - origin.tx, chasing.pos.ty - origin.ty)).toBeGreaterThan(2);

    // ผู้เล่นหนีไปมุมไกล → เกิน deaggro → เลิกไล่ + กลับ (มอนยังห่างจุดเกิด → mode return จริง)
    const farPlayer: AiPlayerRef[] = [{ id: "p1", tx: 19, ty: 19 }];
    sim.tick(0.1, farPlayer, 2300);
    expect(sim.aggroCountFor("p1")).toBe(0); // เลิกไล่
    expect(grabOnly(sim).mode).toBe("return");

    // เดินกลับหลายรอบ → ถึงจุดเกิด → wander, อยู่ใน pocket area
    for (let i = 0; i < 60; i++) sim.tick(0.1, farPlayer, 2400 + i * 100);
    const mob = grabOnly(sim);
    expect(mob.mode).toBe("wander");
    expect(mob.pos.tx).toBeGreaterThanOrEqual(5);
    expect(mob.pos.tx).toBeLessThan(9);
    expect(mob.pos.ty).toBeGreaterThanOrEqual(5);
    expect(mob.pos.ty).toBeLessThan(9);
  });
});

describe("respawn timer — death → respawn (clock inject)", () => {
  test("killMob → หาย → ถึง dueAt → เกิดใหม่", () => {
    const sim = createMobSimulation({
      map: makeMap(1, 1),
      config: makeConfig({ respawnDelayMs: 1000 }),
      hpFor: HP_FOR,
      rng: createLcgRng(5),
    });
    sim.tick(0.1, [], 0); // set lastNow = 0
    const id = grabOnly(sim).id;

    expect(sim.killMob(id)).toBe(true);
    expect(sim.mobCount).toBe(0);
    expect(sim.killMob(id)).toBe(false); // ฆ่าซ้ำ = no-op

    sim.tick(0.1, [], 999); // ยังไม่ถึง due (1000)
    expect(sim.mobCount).toBe(0);

    sim.tick(0.1, [], 1000); // ถึง due → respawn
    expect(sim.mobCount).toBe(1);
  });

  test("respawn ไม่เกิน activeCap", () => {
    const sim = createMobSimulation({
      map: makeMap(2, 2), // activeCap 2, spawn 2
      config: makeConfig({ respawnDelayMs: 500 }),
      hpFor: HP_FOR,
      rng: createLcgRng(6),
    });
    sim.tick(0.1, [], 0);
    expect(sim.mobCount).toBe(2);
    const id = grabOnly(sim).id;
    sim.killMob(id); // เหลือ 1, จอง respawn
    sim.tick(0.1, [], 500); // respawn → กลับเป็น 2 (ไม่เกิน cap)
    expect(sim.mobCount).toBe(2);
  });
});

describe("attack — มอน chase เข้าระยะ → contact ผู้เล่น (A1, COMBAT_BIBLE §4/§7)", () => {
  const ATTACK_STATS = () => ({
    moveSpeed: 4,
    attackRange: 2,
    attackCooldownMs: 2000,
    anticipationMs: 100,
    activeMs: 100,
    recoveryMs: 100,
    breakPower: 0, // normal mob (workstream B: >0 = boss)
  });

  test("player ยืนใน pocket → มอนไล่เข้าระยะแล้ว contact (targetPlayerId ถูกต้อง)", () => {
    const sim = createMobSimulation({
      map: makeMap(1, 1),
      config: makeConfig({ ai: { aggroRadius: { slime: 8 }, chaseSpeed: 4 }, lod: { aoiRadius: 30 } }),
      hpFor: HP_FOR,
      attackStatsFor: ATTACK_STATS,
      rng: createLcgRng(11),
    });
    const contacts: string[] = [];
    for (let i = 0; i < 30; i++) {
      for (const c of sim.tick(0.1, CENTER_PLAYER, 100 + i * 100)) contacts.push(c.targetPlayerId);
    }
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts.every((id) => id === "p1")).toBe(true);
  });

  test("attackStatsFor omit → มอนไม่ตี (offline playground; truth on server)", () => {
    const sim = createMobSimulation({
      map: makeMap(1, 1),
      config: makeConfig({ ai: { aggroRadius: { slime: 8 }, chaseSpeed: 4 }, lod: { aoiRadius: 30 } }),
      hpFor: HP_FOR,
      rng: createLcgRng(11),
    });
    let total = 0;
    for (let i = 0; i < 30; i++) total += sim.tick(0.1, CENTER_PLAYER, 100 + i * 100).length;
    expect(total).toBe(0);
  });

  test("player หนีออกนอกระยะ (leash) → เลิก aggro, ไม่มี contact", () => {
    const sim = createMobSimulation({
      map: makeMap(1, 1),
      config: makeConfig({
        ai: { aggroRadius: { slime: 3 }, chaseSpeed: 1, deaggroRadius: 4, leashRadius: 6 },
        lod: { aoiRadius: 30 },
      }),
      hpFor: HP_FOR,
      attackStatsFor: ATTACK_STATS,
      rng: createLcgRng(12),
    });
    // ผู้เล่นอยู่ไกลตลอด (มุมตรงข้าม pocket) → ไม่เข้าระยะโจมตี
    const farPlayer: AiPlayerRef[] = [{ id: "p1", tx: 18, ty: 18 }];
    let total = 0;
    for (let i = 0; i < 30; i++) total += sim.tick(0.1, farPlayer, 100 + i * 100).length;
    expect(total).toBe(0);
  });
});

describe("AI LOD — pocket ไม่มีผู้เล่นใน AOI + idleTickHz=0 → หลับ (spawn state คงอยู่)", () => {
  test("ไม่มีผู้เล่น + asleep → มอนไม่ขยับเลย (frozen)", () => {
    const sim = createMobSimulation({
      map: makeMap(2, 2),
      config: makeConfig({ lod: { idleTickHz: 0, aoiRadius: 5 } }),
      hpFor: HP_FOR,
      rng: createLcgRng(7),
    });
    const before = sim.snapshots().map((s) => ({ id: s.mobId, tx: s.tx, ty: s.ty }));
    for (let i = 0; i < 100; i++) sim.tick(0.1, [], 1000 + i * 100); // ไม่มีผู้เล่น
    const after = sim.snapshots();
    for (const b of before) {
      const a = after.find((s) => s.mobId === b.id)!;
      expect(a.tx).toBe(b.tx); // frozen — ไม่ step เลย
      expect(a.ty).toBe(b.ty);
      expect(a.state).toBe("idle");
    }
  });
});
