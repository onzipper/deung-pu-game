// Mob simulation — authoritative stateful orchestrator (P1-03, TA §18 + §6 + §11). No PixiJS/React.
// Plain TS ล้วน — **server (MapRoom) รันเป็น source of truth** ผ่านนี้; client offline-fallback รันตัวเดียวกัน
// (app.ts) เมื่อ server ไม่ติด. ไม่มี pixi dependency → import ผ่าน @/ ได้ทั้งสองฝั่ง (พิสูจน์แล้ว P1-02).
//
// รวม 3 ระบบเข้าด้วยกันโดย compose pure logic:
//   1. spawn/respawn — spawnAllPockets เดิม (P0-09 pure) ตอนสร้าง + respawn ทีละตัวเมื่อ killMob
//      (respawnDelayMs ต่อ pocket/global, clock inject) ตราบใดที่ยังต่ำกว่า activeCap (§18.1)
//   2. AI tick — wander (stepWander เดิม) + aggro/leash/pull cap (ai.ts, §18.3)
//   3. AI LOD — pocket ที่ไม่มี player ใน AOI → tick ช้าลง/หลับ (ai.ts, §6/§11)
//
// tick() = 1 base cycle (server เรียกผ่าน setSimulationInterval ที่ ai.tickHz; offline client accumulate เอง).
// state mutate in-place (server owns state, ไม่ใช่ pure render) แต่ deterministic เมื่อ inject rng + now.

import type { TilePoint } from "@/engine/iso/coords";
import { walkableFromMap } from "@/game/mob/wander";
import type { MapConfig, MobPocket, TileRect } from "@/engine/map/types";
import type { MoveParams } from "@/engine/movement/mover";
import type { BossBalanceConfig, MobConfig } from "@/engine/config";
import { spawnAllPockets, findWalkableSpawnPoint } from "@/game/mob/spawn";
import {
  applyPhaseToTimings,
  depleteGuard,
  phaseIndexForHp,
} from "@/game/mob/boss";
import {
  createWanderState,
  stepWander,
  type MobWanderState,
} from "@/game/mob/wander";
import { defaultRng, type RngFn } from "@/game/mob/rng";
import {
  createMobAttackState,
  distSq,
  hasReachedSpawn,
  idleTickInterval,
  isPocketActive,
  isRespawnDue,
  selectAggroTarget,
  shouldReturnToSpawn,
  shouldStepPocket,
  stepMobAttack,
  stepToward,
  type AiPlayerRef,
  type MobAttackState,
  type MobAttackTimings,
  type MobMode,
} from "@/game/mob/ai";

/** ระยะ² ที่ต่ำกว่านี้ถือว่ามอน "ไม่ขยับ" ในรอบนี้ (anim idle vs walk). */
const MOVE_EPS = 1e-8;

/**
 * Boss depth runtime (workstream B) — attach เฉพาะ mob ที่ breakPower>0 + มี bossConfig (Field Boss).
 * mutate in-place ต่อ tick (guard/phase/stagger) + ตอนโดนตี (depleteBossGuard). COMBAT_BIBLE §8 / §2.3/§2.4.
 */
export interface BossRuntime {
  /** guard gauge ปัจจุบัน (เริ่ม = breakPower). ทุบ 0 → BREAK. */
  guard: number;
  /** guard เต็ม (= breakPower §9.3). */
  readonly maxGuard: number;
  /** hp เต็มตอนเกิด (= hpFor) — ใช้คิด phase fraction. */
  readonly maxHp: number;
  /** index ของ phase ปัจจุบัน (§2.3: 0=Learn, 1=Pressure, 2=Enrage). */
  phaseIndex: number;
  /** true ช่วง stagger (BREAK window) — boss ทำอะไรไม่ได้ (§2.4 bossActionDuringBreak: disabled). */
  staggered: boolean;
  /** ms ที่ stagger จะจบ (guard เติมกลับ). */
  staggerEndsAtMs: number;
  /** เพิ่มทีละ 1 ทุกครั้งที่เริ่ม anticipation (telegraph) ใหม่ → MapRoom broadcast telegraph signal. */
  telegraphSeq: number;
}

/** มอน 1 ตัวใน simulation (authoritative). pos/mode/wander mutate in-place ต่อ tick. */
export interface SimMob {
  readonly id: string;
  readonly pocketId: string;
  readonly mobType: string;
  /** ตำแหน่ง foot ต่อเนื่อง (tile, float) — authoritative */
  pos: TilePoint;
  /** จุดเกิด (leash target ตอน return) */
  readonly spawnOrigin: TilePoint;
  /** pocket.area (leash boundary ตอน wander) */
  readonly area: TileRect;
  /** hp — P1-03 เต็มไว้ (death จริง = P1-05 server combat); เก็บไว้ให้ schema/loot ต่อยอด */
  hp: number;
  mode: MobMode;
  /** player id ที่กำลังไล่ (chase เท่านั้น; null ตอน wander/return) */
  targetPlayerId: string | null;
  wander: MobWanderState;
  /** true = ขยับในรอบ tick ล่าสุด → client เล่น anim "walk" ไม่งั้น "idle" */
  moved: boolean;
  /** A1: attack state machine (§4/§7) — เดินเฉพาะตอน chase; reset ตอนออกจาก chase. */
  attack: MobAttackState;
  /** workstream B: boss depth runtime — undefined สำหรับ normal mob (breakPower 0 → ไม่มี guard gauge). */
  boss?: BossRuntime;
}

/**
 * event ที่มอน 1 ตัว "contact" ใส่ผู้เล่นในรอบ tick (A1, COMBAT_BIBLE §2) — sim คืนออกมาให้ caller
 * (server-authoritative) หัก hp เอง. sim ไม่รู้ stat combat (atk/tier/DEF) → caller lookup จาก combatBalance.
 */
export interface MobContactEvent {
  mobId: string;
  mobType: string;
  targetPlayerId: string;
  /**
   * workstream B: ตัวคูณ damage บอส→ผู้เล่นตาม phase ปัจจุบัน (§2.3 Enrage +10% → 1.10). normal mob / boss
   * เฟสอื่น = 1 (omit ได้). caller (server) คูณเข้ากับ mobAtk ก่อนสูตร (never-downgrade: scale input, ไม่แตะ formula).
   */
  damageMultiplier?: number;
}

/** combat stat ต่อ mobType ที่ sim ใช้เดิน attack machine + ความเร็ว chase (A1, Design Knob D-055 §9.3). */
export interface MobAttackStats extends MobAttackTimings {
  /** ความเร็ว chase/approach (tile/วินาที) */
  moveSpeed: number;
  /** workstream B: guard-gauge capacity (§9.3/§15.4) — >0 = boss (มี guard gauge); 0 = normal mob. */
  breakPower: number;
}

/** boss runtime view ที่ MapRoom อ่านไปเขียน schema (HUD) + broadcast delta (telegraph/phase). */
export interface BossView {
  guard: number;
  maxGuard: number;
  phaseIndex: number;
  /** phase id (§2.3 "learn"|"pressure"|"enrage") — MapRoom ส่งใน phase-change message. */
  phaseId: string;
  staggered: boolean;
  telegraphSeq: number;
}

/** ผลของการทุบ guard บอส 1 cast (server อ่านไป broadcast BREAK + ตั้ง golden window). */
export interface BossBreakResult {
  /** true = guard เพิ่งแตก (BREAK) รอบนี้ → client เล่น break VFX/SFX. */
  broke: boolean;
  guard: number;
  staggered: boolean;
  phaseIndex: number;
}

/** snapshot ที่ MapRoom/offline driver อ่านไปเขียน schema/view (โครงตรงกับ MobSnapshot wire). */
export interface MobSimSnapshot {
  mobId: string;
  mobType: string;
  tx: number;
  ty: number;
  /** anim state จาก moved flag */
  state: "idle" | "walk";
  hp: number;
}

/** respawn queue entry — pocket ที่มีมอนตาย รอเกิดใหม่เมื่อถึง dueAtMs. */
interface RespawnEntry {
  pocketId: string;
  dueAtMs: number;
}

export interface MobSimulation {
  /**
   * step 1 base cycle. `players` = ตำแหน่งผู้เล่นทุกคนในห้อง (server: จาก schema; offline: local player).
   * `nowMs` = clock (ms) — ใช้ตัดสิน respawn due + schedule + attack timing (server Date.now; เทสต์ inject).
   * คืน contact ที่มอนตีโดนผู้เล่นในรอบนี้ (A1) — caller (server) หัก hp เอง; offline ไม่สน (truth on server).
   */
  tick(dtSeconds: number, players: readonly AiPlayerRef[], nowMs: number): MobContactEvent[];
  /** ฆ่ามอนทันที (leash/admin) → ลบ + จอง respawn. คืน true ถ้าลบจริง. */
  killMob(id: string): boolean;
  /**
   * หัก hp มอน (P1-05 server combat, TA §15) → ถ้า hp ≤ 0 despawn + จอง respawn (เหมือน killMob).
   * คืน { hp, killed } หลังหัก หรือ null ถ้าไม่พบมอน (ตายไปแล้ว/ id มั่ว). amount ควร ≥ 0.
   */
  damageMob(id: string, amount: number): { hp: number; killed: boolean } | null;
  /** วน mob ทุกตัวที่ยังมีชีวิต (caller เขียนลง schema/view). */
  forEach(cb: (mob: SimMob) => void): void;
  /** snapshot array (alloc ใหม่ — ใช้ debug/proof/offline sync ที่ไม่ hot). */
  snapshots(): MobSimSnapshot[];
  /** จำนวนมอนมีชีวิตตอนนี้. */
  readonly mobCount: number;
  /** จำนวนมอนที่กำลัง aggro ผู้เล่นคนนี้ (debug/proof pull cap). */
  aggroCountFor(playerId: string): number;
  /** workstream B: boss runtime view (null ถ้าไม่ใช่บอส/ไม่พบ). MapRoom → schema HUD + broadcast delta. */
  bossView(id: string): BossView | null;
  /**
   * workstream B: ทุบ guard บอสด้วย break contribution; guard ถึง 0 → เริ่ม stagger `staggerWindowMs`
   * (COMBAT_BIBLE §8). คืนผล (broke รอบนี้ไหม) หรือ null ถ้าไม่ใช่บอส/ไม่พบ. no-op ถ้ากำลัง staggered อยู่.
   */
  depleteBossGuard(
    id: string,
    contribution: number,
    nowMs: number,
    staggerWindowMs: number,
  ): BossBreakResult | null;
  /**
   * A3 (§50.1 crowdControl "taunt" · P1_BALANCE §3.1 S4 sword_guard_domain): บังคับมอนในรัศมี `radius` (tile)
   * รอบ `center` ให้ aggro `playerId` (mode→chase) สูงสุด `maxTargets` ตัว (ใกล้→ไกล). คืนจำนวนที่ taunt จริง.
   * มอนที่ target หายรอบถัดไป = leash/return ตามปกติ (guard §"chase→return") — ไม่ crash.
   */
  tauntMobsNear(
    center: TilePoint,
    radius: number,
    maxTargets: number,
    playerId: string,
  ): number;
}

export interface MobSimulationParams {
  map: MapConfig;
  /** MobConfig (spawn/wander/ai/lod/respawn knob) — Design Knob จาก engine config */
  config: MobConfig;
  /** hp เริ่มต้นต่อ mobType (จาก combat config) — P1-03 เต็มไว้ */
  hpFor: (mobType: string) => number;
  /**
   * A1: combat stat (moveSpeed + attack timing/range) ต่อ mobType จาก combatBalance (D-055 §9.3).
   * มี → มอนเดินด้วย moveSpeed ของมัน + ตี player ได้ (attack machine). **omit → มอนไม่ตี** (offline
   * playground / เทสต์ AI เดิม) และ chase ใช้ ai.chaseSpeed เดิม — backward compatible.
   */
  attackStatsFor?: (mobType: string) => MobAttackStats;
  /**
   * workstream B: boss depth config (guard/break window + phase ladder, §2.3/§2.4 · §15.4). มี → mob ที่
   * attackStats.breakPower>0 ได้ boss runtime (guard gauge + phase). omit (offline playground) → ไม่มี boss
   * depth (non-authoritative; truth อยู่ server). ต้องมาคู่กับ attackStatsFor (breakPower มาจากที่นั่น).
   */
  bossConfig?: BossBalanceConfig;
  /** RNG inject (default Math.random runtime; เทสต์ = seeded LCG) */
  rng?: RngFn;
}

/**
 * สร้าง mob simulation + spawn ชุดแรกทันที (spawnAllPockets, TA §18.1). caller ขับด้วย tick().
 */
export function createMobSimulation(params: MobSimulationParams): MobSimulation {
  const { map, config, hpFor } = params;
  const bossConfig = params.bossConfig;
  const rng: RngFn = params.rng ?? defaultRng;
  const ai = config.ai;
  const lod = config.lod;

  const isWalkable = walkableFromMap(map);
  /** move params ของ chase/return (speed ไล่ + clamp เดียวกับ wander กัน tunneling) — fallback เมื่อไม่มี combat stat */
  const chaseParams: MoveParams = {
    speed: ai.chaseSpeed,
    maxStepSeconds: config.wander.maxStepSeconds,
  };
  const idleInterval = idleTickInterval(ai.tickHz, lod.idleTickHz);

  // A1: cache combat stat ต่อ mobType (moveSpeed → MoveParams + attack timing). attackStatsFor omit → มอนไม่ตี
  // (timings ทั้งชุด = 0, attackRange 0 → inRange เท็จเสมอ → idle) และ chase ใช้ chaseParams เดิม (backward compat).
  const attackStatsFor = params.attackStatsFor;
  const NO_ATTACK: MobAttackTimings = {
    attackRange: 0,
    attackCooldownMs: 0,
    anticipationMs: 0,
    activeMs: 0,
    recoveryMs: 0,
  };
  const combatCache = new Map<
    string,
    { move: MoveParams; timings: MobAttackTimings; breakPower: number }
  >();
  const combatFor = (
    mobType: string,
  ): { move: MoveParams; timings: MobAttackTimings; breakPower: number } => {
    let c = combatCache.get(mobType);
    if (!c) {
      if (attackStatsFor) {
        const s = attackStatsFor(mobType);
        c = {
          move: { speed: s.moveSpeed, maxStepSeconds: config.wander.maxStepSeconds },
          timings: {
            attackRange: s.attackRange,
            attackCooldownMs: s.attackCooldownMs,
            anticipationMs: s.anticipationMs,
            activeMs: s.activeMs,
            recoveryMs: s.recoveryMs,
          },
          breakPower: s.breakPower, // workstream B: >0 = boss (guard gauge)
        };
      } else {
        c = { move: chaseParams, timings: NO_ATTACK, breakPower: 0 };
      }
      combatCache.set(mobType, c);
    }
    return c;
  };

  const pocketById = new Map<string, MobPocket>(
    map.mobPockets.map((p) => [p.pocketId, p] as const),
  );
  const aggroRadiusFor = (mobType: string): number =>
    ai.aggroRadius[mobType] ?? ai.defaultAggroRadius;
  // A/B (D-055 §9.3): leash ต่อ mobType — boss ลากได้ไกลกว่า (18) ก่อน leash-return กัน kite/soft-reset cheese
  //   (OWNER §2.2 "boss ไม่ใช่ HP sponge"). ไม่พบ key → defaultLeashRadius. คู่กับ aggroRadiusFor.
  const leashRadiusFor = (mobType: string): number =>
    ai.leashRadius[mobType] ?? ai.defaultLeashRadius;
  const respawnDelayFor = (pocket: MobPocket): number =>
    pocket.respawnDelayMs ?? config.respawnDelayMs;

  const mobs = new Map<string, SimMob>();
  const respawnQueue: RespawnEntry[] = [];
  let seq = 0;
  let tickCounter = 0;
  /** clock ของ tick ล่าสุด — killMob ใช้ schedule respawn (dueAt = lastNowMs + delay). */
  let lastNowMs = 0;

  /** สร้าง SimMob 1 ตัวจากจุดเกิด. spawnOrigin = จุดเกิดจริง (leash target). */
  const makeMob = (pocketId: string, mobType: string, tile: TilePoint): SimMob => {
    const pocket = pocketById.get(pocketId)!;
    const id = `${pocketId}#${seq++}`;
    const hp = hpFor(mobType);
    // workstream B: mob ที่ breakPower>0 + มี bossConfig = Field Boss → ผูก boss runtime (guard gauge เต็ม + phase 0).
    const breakPower = combatFor(mobType).breakPower;
    const boss: BossRuntime | undefined =
      bossConfig && breakPower > 0
        ? {
            guard: breakPower,
            maxGuard: breakPower,
            maxHp: hp,
            phaseIndex: 0,
            staggered: false,
            staggerEndsAtMs: 0,
            telegraphSeq: 0,
          }
        : undefined;
    return {
      id,
      pocketId,
      mobType,
      pos: { tx: tile.tx, ty: tile.ty },
      spawnOrigin: { tx: tile.tx, ty: tile.ty },
      area: pocket.area,
      hp,
      mode: "wander",
      targetPlayerId: null,
      wander: createWanderState(config.wander, rng),
      moved: false,
      attack: createMobAttackState(),
      boss,
    };
  };

  // ── spawn ชุดแรก (pure spawnAllPockets เดิม; re-id ด้วย seq ภายในกัน collision กับ respawn) ──
  for (const s of spawnAllPockets(map, config.spawn, rng)) {
    const mob = makeMob(s.pocketId, s.mobType, s.tile);
    mobs.set(mob.id, mob);
  }

  const aliveInPocket = (pocketId: string): number => {
    let n = 0;
    for (const m of mobs.values()) if (m.pocketId === pocketId) n++;
    return n;
  };

  /** เกิดใหม่ทีละตัวใน pocket ถ้ายังต่ำกว่า activeCap + หาจุดเดินได้เจอ (best-effort, ไม่ throw). */
  const respawnOne = (pocketId: string): void => {
    const pocket = pocketById.get(pocketId);
    if (!pocket) return;
    if (aliveInPocket(pocketId) >= pocket.activeCap) return; // เต็ม cap → ทิ้ง respawn นี้
    const point = findWalkableSpawnPoint(pocket.area, map, rng, config.spawn.maxPlacementAttempts);
    if (!point) return; // หาที่เกิดไม่เจอ → ข้าม (best-effort)
    const mob = makeMob(pocketId, pocket.mobType, point);
    mobs.set(mob.id, mob);
  };

  /** ลบมอน + จอง respawn (dueAt = clock ล่าสุด + delay ต่อ pocket). shared โดย killMob/damageMob. */
  const despawnAndScheduleRespawn = (mob: SimMob): void => {
    mobs.delete(mob.id);
    const pocket = pocketById.get(mob.pocketId);
    const delay = pocket ? respawnDelayFor(pocket) : config.respawnDelayMs;
    respawnQueue.push({ pocketId: mob.pocketId, dueAtMs: lastNowMs + delay });
  };

  const processRespawns = (nowMs: number): void => {
    if (respawnQueue.length === 0) return;
    // เดินย้อน (splice ปลอดภัย); entry ที่ due → respawn + เอาออกจากคิว
    for (let i = respawnQueue.length - 1; i >= 0; i--) {
      if (isRespawnDue(respawnQueue[i].dueAtMs, nowMs)) {
        const entry = respawnQueue[i];
        respawnQueue.splice(i, 1);
        respawnOne(entry.pocketId);
      }
    }
  };

  /** step มอน 1 ตัว ตาม state machine (aggro/leash/wander + attack) — mutate mob in-place; push contact ที่เกิด. */
  const stepMob = (
    mob: SimMob,
    dtSeconds: number,
    nowMs: number,
    players: readonly AiPlayerRef[],
    playerById: ReadonlyMap<string, AiPlayerRef>,
    pullCounts: Map<string, number>,
    contacts: MobContactEvent[],
  ): void => {
    const prevX = mob.pos.tx;
    const prevY = mob.pos.ty;

    // 0) workstream B: boss phase (hp%) + stagger upkeep ก่อน mode logic (COMBAT_BIBLE §8 / §2.3/§2.4).
    //    staggered = ทำอะไรไม่ได้ → ยืนนิ่ง ข้าม aggro/chase/attack (bossActionDuringBreak: disabled).
    if (mob.boss && bossConfig) {
      const boss = mob.boss;
      const newPhase = phaseIndexForHp(mob.hp / boss.maxHp, bossConfig.phases);
      if (newPhase !== boss.phaseIndex) {
        boss.phaseIndex = newPhase;
        if (bossConfig.break.resetGuardOnPhaseChange) boss.guard = boss.maxGuard; // §8 reset per phase
      }
      if (boss.staggered) {
        if (nowMs >= boss.staggerEndsAtMs) {
          boss.staggered = false;
          boss.guard = boss.maxGuard * bossConfig.break.guardRefillAfterStagger; // §8 guard refills
          mob.attack = createMobAttackState();
        } else {
          mob.moved = false; // stunned — client เล่น stagger (§2.4)
          return;
        }
      }
    }

    // 1) wander → chase? (aggro acquire, เคารพ pull cap ต่อผู้เล่น)
    if (mob.mode === "wander") {
      const target = selectAggroTarget(
        mob.pos,
        players,
        aggroRadiusFor(mob.mobType),
        pullCounts,
        ai.pullCap,
      );
      if (target !== null) {
        mob.mode = "chase";
        mob.targetPlayerId = target;
        pullCounts.set(target, (pullCounts.get(target) ?? 0) + 1); // จองสิทธิ์ทันที กัน over-pull ในเฟรมเดียว
      }
    }

    // 2) chase → return? (leash: เป้าหาย/ลากไกล/ไล่ไม่ทัน)
    if (mob.mode === "chase") {
      const target = mob.targetPlayerId ? playerById.get(mob.targetPlayerId) : null;
      if (shouldReturnToSpawn(mob.pos, mob.spawnOrigin, target, ai.deaggroRadius, leashRadiusFor(mob.mobType))) {
        if (mob.targetPlayerId) {
          const c = pullCounts.get(mob.targetPlayerId) ?? 0;
          if (c > 0) pullCounts.set(mob.targetPlayerId, c - 1); // ปล่อยสิทธิ์
        }
        mob.mode = "return";
        mob.targetPlayerId = null;
        mob.attack = createMobAttackState(); // ทิ้ง swing ค้าง — เริ่มใหม่ตอน aggro รอบหน้า
      }
    }

    // 3) return → wander? (ถึงจุดเกิด → reset)
    if (mob.mode === "return" && hasReachedSpawn(mob.pos, mob.spawnOrigin, ai.returnResetRadius)) {
      mob.mode = "wander";
      mob.wander = createWanderState(config.wander, rng);
    }

    // 4) movement ตาม mode สุดท้าย (chase = approach + attack machine)
    if (mob.mode === "wander") {
      const res = stepWander(mob.pos, mob.wander, dtSeconds, mob.area, config.wander, isWalkable, rng);
      mob.wander = res.state;
      mob.pos = res.pos;
    } else if (mob.mode === "chase") {
      const target = playerById.get(mob.targetPlayerId!)!; // ยังมีอยู่ (ไม่งั้นจะ return ไปแล้ว)
      const combat = combatFor(mob.mobType);
      // workstream B: boss ใช้ timing ปรับตาม phase (§2.3 Enrage cadence/recovery) + carry damage factor.
      //   telegraph ไม่ถูกย่อ (anticipation คงเดิม, applyPhaseToTimings) — ต้องอ่านออกเสมอ (§18.5).
      const phase = mob.boss && bossConfig ? bossConfig.phases[mob.boss.phaseIndex] : null;
      const timings = phase ? applyPhaseToTimings(combat.timings, phase) : combat.timings;
      // A1: เป้าอยู่ในระยะโจมตี "ตอนนี้"? → เดิน attack machine (§4/§7). contact ลงเฉพาะ active + ยังในระยะ.
      const inRange =
        distSq(mob.pos.tx, mob.pos.ty, target.tx, target.ty) <=
        timings.attackRange * timings.attackRange;
      const prevAtkPhase = mob.attack.phase;
      const atk = stepMobAttack(mob.attack, inRange, nowMs, timings);
      mob.attack = atk.state;
      // workstream B: swing ใหม่เริ่ม (idle → not-idle) → bump telegraphSeq (MapRoom broadcast telegraph signal).
      if (mob.boss && prevAtkPhase === "idle" && atk.state.phase !== "idle") mob.boss.telegraphSeq++;
      if (atk.contact) {
        const contact: MobContactEvent = { mobId: mob.id, mobType: mob.mobType, targetPlayerId: target.id };
        if (phase && phase.damageFactor !== 1) contact.damageMultiplier = phase.damageFactor; // §2.3 Enrage
        contacts.push(contact);
      }
      // rooted (กลาง swing) → ยืนตี ไม่ขยับ (ให้ dodge window มีความหมาย); ไม่งั้น approach ด้วย moveSpeed ของมัน
      if (!atk.rooted) {
        mob.pos = stepToward(mob.pos, { tx: target.tx, ty: target.ty }, dtSeconds, combat.move, isWalkable);
      }
    } else {
      mob.pos = stepToward(mob.pos, mob.spawnOrigin, dtSeconds, chaseParams, isWalkable);
    }

    mob.moved = distSq(prevX, prevY, mob.pos.tx, mob.pos.ty) > MOVE_EPS;
  };

  return {
    tick(dtSeconds: number, players: readonly AiPlayerRef[], nowMs: number): MobContactEvent[] {
      lastNowMs = nowMs;
      processRespawns(nowMs);
      tickCounter++;
      const contacts: MobContactEvent[] = [];

      // AI LOD: active ต่อ pocket (มีผู้เล่นใน AOI) — คุมว่า pocket ไหน step รอบนี้
      const activeByPocket = new Map<string, boolean>();
      for (const pocket of map.mobPockets) {
        activeByPocket.set(pocket.pocketId, isPocketActive(pocket.area, players, lod.aoiRadius));
      }

      const playerById = new Map<string, AiPlayerRef>(players.map((p) => [p.id, p] as const));

      // pull counts เริ่มต้นจากมอนที่ chase อยู่ก่อนรอบนี้ (§18.3 cap ต่อผู้เล่น)
      const pullCounts = new Map<string, number>();
      for (const m of mobs.values()) {
        if (m.mode === "chase" && m.targetPlayerId) {
          pullCounts.set(m.targetPlayerId, (pullCounts.get(m.targetPlayerId) ?? 0) + 1);
        }
      }

      for (const m of mobs.values()) {
        const active = activeByPocket.get(m.pocketId) ?? false;
        // มอนที่ chase/return ต้อง tick ต่อแม้ pocket หลับ (มันตามผู้เล่นออกนอก pocket แล้ว)
        const busy = m.mode !== "wander";
        if (!busy && !shouldStepPocket(active, tickCounter, idleInterval)) {
          m.moved = false;
          continue; // หลับ/รอ idle cycle — spawn state คงอยู่ (§11)
        }
        // idle pocket ที่ได้ step: ชดเชย dt ให้ได้ speed จริง (step ห่างขึ้น → dt ยาวขึ้น)
        const effectiveDt = !active && !busy && idleInterval > 1 ? dtSeconds * idleInterval : dtSeconds;
        stepMob(m, effectiveDt, nowMs, players, playerById, pullCounts, contacts);
      }
      return contacts;
    },

    killMob(id: string): boolean {
      const mob = mobs.get(id);
      if (!mob) return false;
      // ปล่อย pull count ทันทีไม่ต้อง — pull counts สร้างใหม่ทุก tick จาก mobs ที่เหลือ
      despawnAndScheduleRespawn(mob);
      return true;
    },

    damageMob(id: string, amount: number): { hp: number; killed: boolean } | null {
      const mob = mobs.get(id);
      if (!mob) return null;
      mob.hp -= amount;
      if (mob.hp <= 0) {
        mob.hp = 0;
        despawnAndScheduleRespawn(mob);
        return { hp: 0, killed: true };
      }
      return { hp: mob.hp, killed: false };
    },

    forEach(cb: (mob: SimMob) => void): void {
      for (const m of mobs.values()) cb(m);
    },

    snapshots(): MobSimSnapshot[] {
      const out: MobSimSnapshot[] = [];
      for (const m of mobs.values()) {
        out.push({
          mobId: m.id,
          mobType: m.mobType,
          tx: m.pos.tx,
          ty: m.pos.ty,
          state: m.moved ? "walk" : "idle",
          hp: m.hp,
        });
      }
      return out;
    },

    get mobCount(): number {
      return mobs.size;
    },

    aggroCountFor(playerId: string): number {
      let n = 0;
      for (const m of mobs.values()) {
        if (m.mode === "chase" && m.targetPlayerId === playerId) n++;
      }
      return n;
    },

    tauntMobsNear(
      center: TilePoint,
      radius: number,
      maxTargets: number,
      playerId: string,
    ): number {
      if (maxTargets <= 0 || radius <= 0) return 0;
      const r2 = radius * radius;
      const inRange: { mob: SimMob; d: number }[] = [];
      for (const m of mobs.values()) {
        const d = distSq(m.pos.tx, m.pos.ty, center.tx, center.ty);
        if (d <= r2) inRange.push({ mob: m, d });
      }
      inRange.sort((a, b) => a.d - b.d); // ใกล้→ไกล (tie-break = ลำดับ map iteration = stable)
      const n = Math.min(inRange.length, maxTargets);
      for (let i = 0; i < n; i++) {
        const m = inRange[i].mob;
        m.mode = "chase";
        m.targetPlayerId = playerId; // guard "chase→return" จัดการถ้า target หายรอบถัดไป (ไม่ crash)
      }
      return n;
    },

    bossView(id: string): BossView | null {
      const mob = mobs.get(id);
      if (!mob || !mob.boss || !bossConfig) return null;
      const boss = mob.boss;
      return {
        guard: boss.guard,
        maxGuard: boss.maxGuard,
        phaseIndex: boss.phaseIndex,
        phaseId: bossConfig.phases[boss.phaseIndex]?.id ?? "",
        staggered: boss.staggered,
        telegraphSeq: boss.telegraphSeq,
      };
    },

    depleteBossGuard(
      id: string,
      contribution: number,
      nowMs: number,
      staggerWindowMs: number,
    ): BossBreakResult | null {
      const mob = mobs.get(id);
      if (!mob || !mob.boss) return null;
      const boss = mob.boss;
      // แตกไปแล้ว (staggered) → hit ระหว่าง window ไม่ทุบ guard ซ้ำ (guard ยัง 0 จนกว่าจะเติมกลับ).
      if (boss.staggered) {
        return { broke: false, guard: boss.guard, staggered: true, phaseIndex: boss.phaseIndex };
      }
      const res = depleteGuard(boss.guard, contribution);
      boss.guard = res.guard;
      if (res.broke) {
        boss.staggered = true;
        boss.staggerEndsAtMs = nowMs + staggerWindowMs;
        mob.attack = createMobAttackState(); // ยกเลิก swing ค้าง → ชะงักทันที (§2.4)
      }
      return { broke: res.broke, guard: boss.guard, staggered: boss.staggered, phaseIndex: boss.phaseIndex };
    },
  };
}
