// MapRoom (P0-07, channel P0-08, server-authoritative movement P1-02) — Colyseus Room = map+channel
// instance (tech §6). Local dev เท่านั้นใน P0/P1 world-sync branch.
//
// ทำ: join → spawn PlayerState ที่ตำแหน่ง client ส่งมา · MSG_MOVE → **validate แล้วค่อย apply** · leave → ลบ.
// state ถูก broadcast ให้ทุก client อัตโนมัติผ่าน schema patch (delta binary) ของ Colyseus.
//
// P1-02 server-authoritative movement (TA §6/§7/§16.3):
//   onCreate โหลด map config (loader เดิม, pure) → รู้ collision/bounds เอง.
//   ทุก MSG_MOVE → validateMove(prev, next, elapsed, ...) — speed cap / walkable / teleport.
//   ผิด → **ไม่ apply** + ส่ง MSG_POSITION_CORRECTION กลับ client นั้น (snap กลับ valid ล่าสุด, ไม่แบน).
//   **Single source of truth**: reuse engine pure fn (loadMapConfig/snapToTile/isWalkableTile) +
//   อ่าน knob เดียวกับ client จาก DEFAULT_ENGINE_CONFIG (compile ร่วม — ไม่ copy สูตร/ค่า).
//
// channelId (P0-08): มาจาก client joinOptions ตรง ๆ (default = DEFAULT_CHANNEL_ID). server.define ผูก
// `.filterBy(['mapId','channelId'])` (server/index.ts) แยก room instance ตาม (mapId, channelId).
//
// P1-03 server-side mob simulation (TA §18 + §6 monster sync + §11 LOD):
//   onCreate สร้าง MobSimulation (pure, src/game/mob/simulation.ts — spawn/respawn/AI/LOD) แล้ว
//   ขับด้วย setSimulationInterval ที่ ai.tickHz (10Hz) → เขียนผล mob เข้า schema (state.mobs MapSchema).
//   **Single source of truth**: reuse pure spawn/wander/ai เดิม (ไม่ copy) + knob จาก DEFAULT_ENGINE_CONFIG.
//   death จริง (damage) = P1-05; P1-03 ทดสอบ death→respawn ผ่าน MSG_DEBUG_KILL_MOB (debug เท่านั้น).
//   **AOI filter (§18.2) ยังไม่บังคับ** ที่ 30 CCU/map เล็ก — จุด filter = syncMobsToState() (ดู TODO ในนั้น).
//
// P1 **ยังไม่ทำ** (จด TODO ชี้ spec):
//   - reconnect 30s grace (P1-07, allowReconnection) · persistence ตอน leave
//   - server-side full simulation ของ player position ทุก tick (ยัง client-drive + validate, TA §6)
//   - AOI filter บังคับ (P1+/map ใหญ่, §18.2) · mob death จาก combat จริง (P1-05, TA §15)

import { Room, type Client } from "colyseus";
import { MapRoomState, MobState, PlayerState } from "../schema/MapRoomState";
import {
  DEFAULT_CHANNEL_ID,
  DEFAULT_MAP_ID,
  MSG_DEBUG_KILL_MOB,
  MSG_MOVE,
  MSG_POSITION_CORRECTION,
  type DebugKillMobMessage,
  type JoinOptions,
  type MoveMessage,
  type PositionCorrectionMessage,
} from "../../src/shared/net-protocol";
import {
  validateMove,
  type MoveValidationParams,
  type WalkableAtFn,
} from "../../src/shared/movement-validation";
import { loadMapConfig } from "../../src/engine/map/loader";
import { P0_TEST_FIELD } from "../../src/engine/map/p0-test-field";
import { isWalkableTile, type MapConfig } from "../../src/engine/map/types";
import { snapToTile } from "../../src/engine/iso/coords";
import { DEFAULT_ENGINE_CONFIG } from "../../src/engine/config";
import {
  createMobSimulation,
  type MobSimulation,
} from "../../src/game/mob/simulation";
import type { AiPlayerRef } from "../../src/game/mob/ai";

/** onCreate options = merge ของ options ที่ define() ตั้ง (ว่างใน P0) + clientOptions ของคนแรกที่ join. */
interface MapRoomCreateOptions {
  mapId?: string;
  channelId?: string;
}

/**
 * per-player movement tracker (server-authoritative, P1-02) — ไม่อยู่ใน schema (ไม่ broadcast).
 * เก็บ "ตำแหน่ง valid ล่าสุด" + เวลา เพื่อคำนวณ elapsed/allowance และเป็นจุด snap กลับตอน correct.
 */
interface MoveTracker {
  /** ตำแหน่ง valid ล่าสุด (tile coord) = จุด snap กลับเมื่อ move ถูกปฏิเสธ */
  tx: number;
  ty: number;
  /** เวลา (ms, Date.now) ที่ประมวลผล MSG_MOVE ครั้งล่าสุด — ใช้คิด elapsed ครั้งถัดไป */
  lastMoveTime: number;
  /** เวลา (ms) ที่ส่ง correction ครั้งล่าสุด — บังคับ correctionCooldownMs กัน flood */
  lastCorrectionTime: number;
}

export class MapRoom extends Room<MapRoomState> {
  /** map config ที่ validate แล้ว (server รู้ collision/bounds เอง) — set ตอน onCreate */
  private map!: MapConfig;
  /** walkable check ที่ reuse engine pure fn (snapToTile + isWalkableTile) — ไม่ copy สูตร */
  private isWalkableAt!: WalkableAtFn;
  /** knob เดียวกับ client (speed + validation) — single source of truth (DEFAULT_ENGINE_CONFIG) */
  private moveParams!: MoveValidationParams;
  private readonly trackers = new Map<string, MoveTracker>();
  /** mob simulation ฝั่ง server (P1-03) — authoritative spawn/respawn/AI/LOD (pure core) */
  private sim!: MobSimulation;

  onCreate(options: MapRoomCreateOptions = {}): void {
    const state = new MapRoomState();
    state.mapId = options.mapId ?? DEFAULT_MAP_ID;
    state.channelId = options.channelId ?? DEFAULT_CHANNEL_ID;
    state.roomId = this.roomId;
    this.setState(state);

    // P1-02: server โหลด map เอง (loader pure เดิม) → รู้ collision/bounds. reuse engine collision:
    // snapToTile ตำแหน่งต่อเนื่อง → integer tile → isWalkableTile (bounds + block). ไม่ copy สูตร.
    this.map = loadMapConfig(P0_TEST_FIELD);
    this.isWalkableAt = (tx: number, ty: number): boolean => {
      const cell = snapToTile({ tx, ty });
      return isWalkableTile(this.map, cell.tx, cell.ty);
    };
    this.moveParams = {
      speed: DEFAULT_ENGINE_CONFIG.player.speed,
      validation: DEFAULT_ENGINE_CONFIG.movementValidation,
    };

    // P1-03: สร้าง mob simulation (spawn ชุดแรกทันที) + ขับด้วย fixed tick ที่ ai.tickHz (TA §11 10Hz).
    // hp ต่อ mobType อ่านจาก combat config เดียวกับ client (single source of truth).
    const combat = DEFAULT_ENGINE_CONFIG.combat;
    this.sim = createMobSimulation({
      map: this.map,
      config: DEFAULT_ENGINE_CONFIG.mob,
      hpFor: (mobType) => combat.mobHp[mobType] ?? combat.defaultMobHp,
    });
    this.syncMobsToState();
    this.setSimulationInterval(
      (deltaMs) => this.stepMobSim(deltaMs),
      1000 / DEFAULT_ENGINE_CONFIG.mob.ai.tickHz,
    );

    // P1-03 DEBUG/ADMIN: ฆ่ามอนเพื่อทดสอบ death→respawn (ก่อน P1-05 server combat). ไม่ใช่ gameplay จริง.
    this.onMessage(MSG_DEBUG_KILL_MOB, (_client: Client, message: DebugKillMobMessage) => {
      if (message?.mobId && this.sim.killMob(message.mobId)) {
        console.log(`[MapRoom ${this.roomId}] DEBUG kill mob ${message.mobId} → respawn scheduled`);
      }
    });

    this.onMessage(MSG_MOVE, (client: Client, message: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      const tracker = this.trackers.get(client.sessionId);
      if (!player || !tracker) return;

      const now = Date.now();
      const elapsedMs = now - tracker.lastMoveTime;
      // reference เวลา = ตอนนี้เสมอ (ทั้ง accept/reject) → allowance รอบถัดไปคิดจากตำแหน่ง valid ปัจจุบัน
      tracker.lastMoveTime = now;

      const result = validateMove(
        { tx: tracker.tx, ty: tracker.ty },
        { tx: message.tx, ty: message.ty },
        elapsedMs,
        this.moveParams,
        this.isWalkableAt,
      );

      if (result.ok) {
        // valid → apply เข้า schema (broadcast) + เลื่อน valid position
        player.tx = message.tx;
        player.ty = message.ty;
        player.direction = message.direction;
        player.anim = message.anim;
        tracker.tx = message.tx;
        tracker.ty = message.ty;
        return;
      }

      // invalid → ไม่ apply. ส่ง authoritative pos กลับ client นี้ (respect cooldown กัน flood).
      if (now - tracker.lastCorrectionTime >= this.moveParams.validation.correctionCooldownMs) {
        tracker.lastCorrectionTime = now;
        const correction: PositionCorrectionMessage = {
          tx: player.tx,
          ty: player.ty,
          direction: player.direction as PositionCorrectionMessage["direction"],
          anim: player.anim as PositionCorrectionMessage["anim"],
          reason: result.reason,
        };
        client.send(MSG_POSITION_CORRECTION, correction);
        console.log(
          `[MapRoom ${this.roomId}] correct ${client.sessionId} (${result.reason}) → ` +
            `snap (${player.tx.toFixed(2)},${player.ty.toFixed(2)})`,
        );
      }
    });
  }

  /**
   * 1 base cycle ของ mob AI (setSimulationInterval @ ai.tickHz). ป้อนตำแหน่งผู้เล่นทุกคน (จาก schema)
   * ให้ sim → เขียนผลกลับ schema. dt จริงจาก Colyseus (deltaMs) → รองรับ drift.
   */
  private stepMobSim(deltaMs: number): void {
    const players: AiPlayerRef[] = [];
    this.state.players.forEach((p, sessionId) => {
      players.push({ id: sessionId, tx: p.tx, ty: p.ty });
    });
    this.sim.tick(deltaMs / 1000, players, Date.now());
    this.syncMobsToState();
  }

  /**
   * เขียน mob จาก simulation → schema (state.mobs). upsert ตัวที่มี + ลบตัวที่หายไป (ตาย/ยังไม่ respawn).
   *
   * **AOI filter point (§18.2 — ยังไม่บังคับ P1):** ตอนนี้เขียน mob **ทุกตัว** ลง shared state → ทุก client
   * เห็นหมด (พอที่ 30 CCU/map เล็ก, density §11 target). เมื่อ scale (map ใหญ่/หลาย pocket active,
   * entity 150–200) ต้อง filter ต่อ client ที่นี่: ใช้ Colyseus StateView/@filter + spatial hash (§11)
   * ส่งเฉพาะ mob ในรัศมี AOI ของแต่ละ player. TODO(§18.2/P1+): เพิ่ม per-client view ที่จุดนี้.
   */
  private syncMobsToState(): void {
    const seen = new Set<string>();
    this.sim.forEach((m) => {
      seen.add(m.id);
      let ms = this.state.mobs.get(m.id);
      if (!ms) {
        ms = new MobState();
        ms.mobId = m.id;
        ms.mobType = m.mobType;
        this.state.mobs.set(m.id, ms);
      }
      ms.tx = m.pos.tx;
      ms.ty = m.pos.ty;
      ms.state = m.moved ? "walk" : "idle";
      ms.hp = m.hp;
    });
    // ลบ mob ที่ไม่อยู่ใน sim แล้ว (ตายรอ respawn) → client เห็น despawn.
    // เก็บ key ก่อนค่อยลบ (เลี่ยง mutate ระหว่าง iterate MapSchema).
    const stale: string[] = [];
    this.state.mobs.forEach((_ms, id) => {
      if (!seen.has(id)) stale.push(id);
    });
    for (const id of stale) this.state.mobs.delete(id);
  }

  onJoin(client: Client, options: JoinOptions): void {
    const player = new PlayerState();
    player.tx = options?.tx ?? 0;
    player.ty = options?.ty ?? 0;
    player.direction = options?.direction ?? "S";
    player.anim = options?.anim ?? "idle";
    this.state.players.set(client.sessionId, player);
    // valid position เริ่มต้น = จุด spawn (client ส่งมา); เวลาเริ่ม = now
    this.trackers.set(client.sessionId, {
      tx: player.tx,
      ty: player.ty,
      lastMoveTime: Date.now(),
      lastCorrectionTime: 0,
    });
    console.log(
      `[MapRoom ${this.roomId}] join ${client.sessionId} @(${player.tx.toFixed(1)},${player.ty.toFixed(1)}) — ${this.clients.length} online`,
    );
  }

  onLeave(client: Client): void {
    // P0: ลบทันที (spec §4.6 done = "ออกจากห้องแล้ว entity หาย").
    // P1 TODO: allowReconnection(client, 30) grace ก่อนลบ (P1-07, tech §59.1).
    this.state.players.delete(client.sessionId);
    this.trackers.delete(client.sessionId);
    console.log(`[MapRoom ${this.roomId}] leave ${client.sessionId}`);
  }
}
