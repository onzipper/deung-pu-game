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
   * `nowMs` = clock (ms) — ใช้ตัดสิน respawn due + schedule (server Date.now; เทสต์ inject).
   */
  tick(dtSeconds: number, players: readonly AiPlayerRef[], nowMs: number): void;
  /** ฆ่ามอน (P1-03 ผ่าน debug/admin; P1-05 = server combat) → ลบทันที + จอง respawn. คืน true ถ้าลบจริง. */
  killMob(id: string): boolean;
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
  /** move params ของ chase/return (speed ไล่ + clamp เดียวกับ wander กัน tunneling) */
  const chaseParams: MoveParams = {
    speed: ai.chaseSpeed,
    maxStepSeconds: config.wander.maxStepSeconds,
  };
  const idleInterval = idleTickInterval(ai.tickHz, lod.idleTickHz);

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

  /** step มอน 1 ตัว ตาม state machine (aggro/leash/wander) — mutate mob in-place. */
  const stepMob = (
    mob: SimMob,
    dtSeconds: number,
    players: readonly AiPlayerRef[],
    playerById: ReadonlyMap<string, AiPlayerRef>,
    pullCounts: Map<string, number>,
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
      }
    }

    // 3) return → wander? (ถึงจุดเกิด → reset)
    if (mob.mode === "return" && hasReachedSpawn(mob.pos, mob.spawnOrigin, ai.returnResetRadius)) {
      mob.mode = "wander";
      mob.wander = createWanderState(config.wander, rng);
    }

    // 4) movement ตาม mode สุดท้าย
    if (mob.mode === "wander") {
      const res = stepWander(mob.pos, mob.wander, dtSeconds, mob.area, config.wander, isWalkable, rng);
      mob.wander = res.state;
      mob.pos = res.pos;
    } else if (mob.mode === "chase") {
      const target = playerById.get(mob.targetPlayerId!)!; // ยังมีอยู่ (ไม่งั้นจะ return ไปแล้ว)
      mob.pos = stepToward(mob.pos, { tx: target.tx, ty: target.ty }, dtSeconds, chaseParams, isWalkable);
    } else {
      mob.pos = stepToward(mob.pos, mob.spawnOrigin, dtSeconds, chaseParams, isWalkable);
    }

    mob.moved = distSq(prevX, prevY, mob.pos.tx, mob.pos.ty) > MOVE_EPS;
  };

  return {
    tick(dtSeconds: number, players: readonly AiPlayerRef[], nowMs: number): void {
      lastNowMs = nowMs;
      processRespawns(nowMs);
      tickCounter++;

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
        stepMob(m, effectiveDt, players, playerById, pullCounts);
      }
    },

    killMob(id: string): boolean {
      const mob = mobs.get(id);
      if (!mob) return false;
      mobs.delete(id);
      // ปล่อย pull count ทันทีไม่ต้อง — pull counts สร้างใหม่ทุก tick จาก mobs ที่เหลือ
      const pocket = pocketById.get(mob.pocketId);
      const delay = pocket ? respawnDelayFor(pocket) : config.respawnDelayMs;
      respawnQueue.push({ pocketId: mob.pocketId, dueAtMs: lastNowMs + delay });
      return true;
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
