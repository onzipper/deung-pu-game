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
// P1 **ยังไม่ทำ** (จด TODO ชี้ spec):
//   - mob sync (P1-03) · reconnect 30s grace (P1-07, allowReconnection) · persistence ตอน leave
//   - server-side full simulation ของ player position ทุก tick (ยัง client-drive + validate, TA §6)

import { Room, type Client } from "colyseus";
import { MapRoomState, PlayerState } from "../schema/MapRoomState";
import {
  DEFAULT_CHANNEL_ID,
  DEFAULT_MAP_ID,
  MSG_MOVE,
  MSG_POSITION_CORRECTION,
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
