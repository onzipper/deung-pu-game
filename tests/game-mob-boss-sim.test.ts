import { describe, expect, test } from "vitest";
import { createMobSimulation, type MobSimulation, type SimMob } from "@/game/mob/simulation";
import { createLcgRng } from "@/game/mob/rng";
import { loadMapConfig } from "@/engine/map/loader";
import { DEFAULT_COMBAT_BALANCE_CONFIG, DEFAULT_ENGINE_CONFIG } from "@/engine/config";
import type { MapConfig, MapConfigInput } from "@/engine/map/types";
import type { AiPlayerRef } from "@/game/mob/ai";
import type { MobConfig } from "@/engine/config";

// Boss depth — sim integration (workstream B): guard/break gauge + stagger + phase, driven by config.
// COMBAT_BIBLE §8, OWNER_PRODUCTION_DECISIONS §2.3/§2.4. บอส = mob ที่ breakPower>0 + มี bossConfig.

const BOSS_CFG = DEFAULT_COMBAT_BALANCE_CONFIG.boss;
const BOSS_MAX_HP = 100; // hp เล็กเพื่อทดสอบ phase fraction (65 hp = 65%, 20 hp = 20%)

/** map 20×20 เดินได้หมด + 1 boss pocket ที่ center (spawn 1 ตัว). */
function bossMap(): MapConfig {
  const input: MapConfigInput = {
    mapId: "boss-test",
    name: "Boss Test",
    tileSize: { width: 64, height: 32 },
    bounds: { width: 20, height: 20 },
    spawnPoint: { x: 1, y: 1 },
    collision: { blockedRects: [], blockedTiles: [] },
    props: [],
    mobPockets: [
      {
        pocketId: "boss-pk",
        area: { tx: 9, ty: 9, width: 2, height: 2 }, // ~center (10,10)
        mobType: "boss_boiling_boar",
        packSize: { min: 1, max: 1 },
        activeCap: 1,
      },
    ],
  };
  return loadMapConfig(input);
}

function makeConfig(): MobConfig {
  const base = DEFAULT_ENGINE_CONFIG.mob;
  return {
    ...base,
    ai: { ...base.ai, aggroRadius: { boss_boiling_boar: 30 }, chaseSpeed: 4 },
    lod: { ...base.lod, aoiRadius: 40 },
  };
}

/** boss attack stat — breakPower 100 = guard gauge (§9.3). range กว้างให้ในระยะเร็ว. */
const BOSS_ATTACK = () => ({
  moveSpeed: 4,
  attackRange: 3,
  attackCooldownMs: 800,
  anticipationMs: 200,
  activeMs: 100,
  recoveryMs: 200,
  breakPower: 100,
});

function makeBossSim(): MobSimulation {
  return createMobSimulation({
    map: bossMap(),
    config: makeConfig(),
    hpFor: () => BOSS_MAX_HP,
    attackStatsFor: BOSS_ATTACK,
    bossConfig: BOSS_CFG,
    rng: createLcgRng(1),
  });
}

function grabOnly(sim: MobSimulation): SimMob {
  let found: SimMob | null = null;
  sim.forEach((m) => (found = m));
  if (!found) throw new Error("no mob");
  return found;
}

const PLAYER: AiPlayerRef[] = [{ id: "p1", tx: 10, ty: 10 }];

describe("boss guard gauge — init from breakPower (§9.3)", () => {
  test("บอสมี guard = maxGuard = breakPower; normal mob ไม่มี bossView", () => {
    const sim = makeBossSim();
    const bv = sim.bossView(grabOnly(sim).id)!;
    expect(bv.guard).toBe(100);
    expect(bv.maxGuard).toBe(100);
    expect(bv.staggered).toBe(false);
    expect(bv.phaseIndex).toBe(0);
    expect(bv.phaseId).toBe("learn");
  });
});

describe("guard depletion → BREAK at 0 (§8)", () => {
  test("ทุบไม่ถึง 0 = ไม่ break; ทุบถึง 0 = BREAK + staggered; hit ระหว่าง stagger ไม่ทุบซ้ำ", () => {
    const sim = makeBossSim();
    const id = grabOnly(sim).id;
    const r1 = sim.depleteBossGuard(id, 60, 1000, 6000)!;
    expect(r1.broke).toBe(false);
    expect(r1.guard).toBe(40);
    expect(r1.staggered).toBe(false);

    const r2 = sim.depleteBossGuard(id, 40, 1000, 6000)!;
    expect(r2.broke).toBe(true);
    expect(r2.guard).toBe(0);
    expect(r2.staggered).toBe(true);

    const r3 = sim.depleteBossGuard(id, 50, 1000, 6000)!;
    expect(r3.broke).toBe(false); // แตกไปแล้ว → ไม่ break ซ้ำ
    expect(r3.staggered).toBe(true);
  });

  test("non-boss mob → depleteBossGuard/bossView คืน null", () => {
    // sim ที่ไม่มี bossConfig → mob ไม่มี boss runtime แม้ breakPower>0 (offline playground)
    const sim = createMobSimulation({
      map: bossMap(),
      config: makeConfig(),
      hpFor: () => BOSS_MAX_HP,
      attackStatsFor: BOSS_ATTACK,
      rng: createLcgRng(1),
    });
    const id = grabOnly(sim).id;
    expect(sim.bossView(id)).toBeNull();
    expect(sim.depleteBossGuard(id, 200, 0, 6000)).toBeNull();
  });
});

describe("stagger window — boss cannot act; guard refills after (§2.4/§8)", () => {
  test("ระหว่าง stagger ไม่มี contact; หมด window → guard เติมเต็ม + กลับมาตีได้", () => {
    const sim = makeBossSim();
    const id = grabOnly(sim).id;

    // warmup: บอส aggro + ตีปกติ (พิสูจน์ว่ามันตีได้จริง ก่อน break)
    let warmup = 0;
    for (let i = 0; i < 25; i++) warmup += sim.tick(0.1, PLAYER, 1000 + i * 100).length;
    expect(warmup).toBeGreaterThan(0);

    // BREAK ที่ t=4000 → stagger window 6s (จบ 10000)
    const broke = sim.depleteBossGuard(id, 500, 4000, 6000)!;
    expect(broke.broke).toBe(true);
    expect(sim.bossView(id)!.staggered).toBe(true);

    // tick ในช่วง window (4000..9800) → ทำอะไรไม่ได้ = 0 contact
    let during = 0;
    for (let i = 0; i < 58; i++) during += sim.tick(0.1, PLAYER, 4100 + i * 100).length;
    expect(during).toBe(0);
    expect(sim.bossView(id)!.staggered).toBe(true);
    expect(sim.bossView(id)!.guard).toBe(0);

    // tick หลัง window → stagger จบ + guard เติมเต็ม (guardRefillAfterStagger 1.0)
    sim.tick(0.1, PLAYER, 10100);
    const bv = sim.bossView(id)!;
    expect(bv.staggered).toBe(false);
    expect(bv.guard).toBe(BOSS_CFG.break.guardRefillAfterStagger * 100);

    // กลับมาตีได้อีก
    let after = 0;
    for (let i = 0; i < 20; i++) after += sim.tick(0.1, PLAYER, 10200 + i * 100).length;
    expect(after).toBeGreaterThan(0);
  });
});

describe("phase transition at 65% / 20% hp thresholds (§2.3)", () => {
  test("hp 100→64 → Pressure; 64→19 → Enrage (via damageMob + tick)", () => {
    const sim = makeBossSim();
    const id = grabOnly(sim).id;
    expect(sim.bossView(id)!.phaseIndex).toBe(0);

    sim.damageMob(id, 36); // hp 64 (64%)
    sim.tick(0.1, PLAYER, 1000);
    expect(sim.bossView(id)!.phaseId).toBe("pressure");

    sim.damageMob(id, 45); // hp 19 (19%)
    sim.tick(0.1, PLAYER, 1100);
    expect(sim.bossView(id)!.phaseId).toBe("enrage");
  });
});

describe("Enrage boss→player damage factor rides contact (§2.3 +10%)", () => {
  test("contact ในเฟส Enrage มี damageMultiplier = damageFactor ของเฟส", () => {
    const sim = makeBossSim();
    const id = grabOnly(sim).id;
    sim.damageMob(id, 85); // hp 15 → Enrage

    let mult: number | undefined;
    for (let i = 0; i < 40 && mult === undefined; i++) {
      for (const c of sim.tick(0.1, PLAYER, 1000 + i * 100)) {
        if (c.mobId === id) mult = c.damageMultiplier;
      }
    }
    expect(mult).toBeCloseTo(BOSS_CFG.phases[2].damageFactor); // 1.10
  });
});

describe("boss telegraph — swing ใหม่ bump telegraphSeq (broadcast signal)", () => {
  test("บอสเริ่มท่าโจมตี → telegraphSeq เพิ่มจาก 0", () => {
    const sim = makeBossSim();
    const id = grabOnly(sim).id;
    expect(sim.bossView(id)!.telegraphSeq).toBe(0);
    for (let i = 0; i < 20; i++) sim.tick(0.1, PLAYER, 1000 + i * 100);
    expect(sim.bossView(id)!.telegraphSeq).toBeGreaterThan(0);
  });
});
