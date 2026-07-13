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
import type { MobConfig } from "@/engine/config";
import { spawnAllPockets, findWalkableSpawnPoint } from "@/game/mob/spawn";
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
}

/**
 * event ที่มอน 1 ตัว "contact" ใส่ผู้เล่นในรอบ tick (A1, COMBAT_BIBLE §2) — sim คืนออกมาให้ caller
 * (server-authoritative) หัก hp เอง. sim ไม่รู้ stat combat (atk/tier/DEF) → caller lookup จาก combatBalance.
 */
export interface MobContactEvent {
  mobId: string;
  mobType: string;
  targetPlayerId: string;
}

/** combat stat ต่อ mobType ที่ sim ใช้เดิน attack machine + ความเร็ว chase (A1, Design Knob D-055 §9.3). */
export interface MobAttackStats extends MobAttackTimings {
  /** ความเร็ว chase/approach (tile/วินาที) */
  moveSpeed: number;
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
  /** RNG inject (default Math.random runtime; เทสต์ = seeded LCG) */
  rng?: RngFn;
}

/**
 * สร้าง mob simulation + spawn ชุดแรกทันที (spawnAllPockets, TA §18.1). caller ขับด้วย tick().
 */
export function createMobSimulation(params: MobSimulationParams): MobSimulation {
  const { map, config, hpFor } = params;
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
  const combatCache = new Map<string, { move: MoveParams; timings: MobAttackTimings }>();
  const combatFor = (mobType: string): { move: MoveParams; timings: MobAttackTimings } => {
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
        };
      } else {
        c = { move: chaseParams, timings: NO_ATTACK };
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
    return {
      id,
      pocketId,
      mobType,
      pos: { tx: tile.tx, ty: tile.ty },
      spawnOrigin: { tx: tile.tx, ty: tile.ty },
      area: pocket.area,
      hp: hpFor(mobType),
      mode: "wander",
      targetPlayerId: null,
      wander: createWanderState(config.wander, rng),
      moved: false,
      attack: createMobAttackState(),
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
      if (shouldReturnToSpawn(mob.pos, mob.spawnOrigin, target, ai.deaggroRadius, ai.leashRadius)) {
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
      // A1: เป้าอยู่ในระยะโจมตี "ตอนนี้"? → เดิน attack machine (§4/§7). contact ลงเฉพาะ active + ยังในระยะ.
      const inRange =
        distSq(mob.pos.tx, mob.pos.ty, target.tx, target.ty) <=
        combat.timings.attackRange * combat.timings.attackRange;
      const atk = stepMobAttack(mob.attack, inRange, nowMs, combat.timings);
      mob.attack = atk.state;
      if (atk.contact) contacts.push({ mobId: mob.id, mobType: mob.mobType, targetPlayerId: target.id });
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
  };
}
