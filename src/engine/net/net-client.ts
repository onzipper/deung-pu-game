// Net client — colyseus.js glue (P0-07, channel debug API P0-08). Plain TS + colyseus.js เท่านั้น (ห้าม React/Next/pixi).
// หน้าที่: connect → joinOrCreate MapRoom (mapId+channelId ใน joinOptions) → wire schema callbacks →
//   emit domain event ให้ caller (remote-player-manager) + ส่ง local position ขึ้น server. calc/pure อยู่ใน sync.ts.
//
// **Graceful offline (สำคัญ):** connect เป็น best-effort/async — ถ้า server ไม่รัน/ล้ม
//   → status = "offline", log, **ไม่ throw** เพื่อให้ /game เล่น solo ต่อได้ (owner เปิดดูโดยไม่ start server).
//
// P0 ยังไม่ทำ: reconnect 30s grace (tech §6/§59.1), auth/JWT, party sync — จด TODO ชี้ spec.

import { Client, getStateCallbacks, type Room } from "colyseus.js";
import {
  MAP_ROOM_NAME,
  MSG_MOVE,
  MSG_POSITION_CORRECTION,
  type JoinOptions,
  type MoveMessage,
  type PlayerSnapshot,
  type PositionCorrectionMessage,
} from "@/shared/net-protocol";
import { coerceAnim, coerceDirection, computePlayerCount, type ConnectionState } from "@/engine/net/sync";

/**
 * สถานะการเชื่อมต่อ (P0-11 debug overlay อ่านผ่าน EngineHandle.net.getNetDebugInfo()).
 * alias ของ ConnectionState (sync.ts) — pure logic (computePlayerCount) ใช้ type เดียวกัน.
 */
export type NetConnectionState = ConnectionState;

/** live snapshot ของสถานะ net — mutate in place, caller ถือ reference อ่านได้ทุก frame. */
export interface NetStatus {
  state: NetConnectionState;
  serverUrl: string;
  /** room/channel/map จริงจาก server state (channelId = P0-08 first-class filter key) — null ก่อน join สำเร็จ */
  roomId: string | null;
  channelId: string | null;
  mapId: string | null;
  selfSessionId: string | null;
  /** จำนวนผู้เล่นอื่น (ไม่รวมตัวเอง) ที่กำลัง render */
  remoteCount: number;
  /** จำนวน position correction ที่ได้รับจาก server (P1-02) — สะสมตลอด session (debug) */
  correctionCount: number;
  lastError: string | null;
}

/**
 * shape เรียบสำหรับ P0-11 debug overlay (P0-08) — รวม ids + จำนวนผู้เล่นทั้งหมดในห้อง (รวมตัวเอง)
 * แทนที่ caller จะต้องคำนวณ remoteCount+1 เอง.
 */
export interface NetDebugInfo {
  status: NetConnectionState;
  mapId: string | null;
  roomId: string | null;
  channelId: string | null;
  /** จำนวนผู้เล่นทั้งหมดที่เห็นในห้องนี้ (รวมตัวเอง) — 0 ถ้ายังไม่ online */
  playerCount: number;
  /** จำนวน position correction สะสมจาก server (P1-02) — >0 = server ตี move กลับ */
  correctionCount: number;
}

/** event ที่ net-client แจ้ง caller (remote-player-manager สร้าง/ขยับ/ลบ entity). */
export interface NetClientHandlers {
  onPlayerAdd(sessionId: string, snap: PlayerSnapshot): void;
  onPlayerChange(sessionId: string, snap: PlayerSnapshot): void;
  onPlayerRemove(sessionId: string): void;
  /**
   * server ปฏิเสธ move ของ local player แล้วส่งตำแหน่ง authoritative กลับ (P1-02, TA §16.3).
   * caller (app.ts) reconcile: snap local player ไปตำแหน่งนี้ + เคลียร์ prediction. optional
   * (P0-era caller ไม่มี hook นี้ก็ยังทำงาน — net-client แค่ไม่มี correction ให้ก่อน P1-02).
   */
  onPositionCorrection?(correction: PositionCorrectionMessage): void;
}

export interface NetClientConfig {
  serverUrl: string;
  roomName: string;
}

export interface NetClientHandle {
  /** live status (อ่านอย่างเดียว) — raw fields, mutate in place ทุก frame */
  readonly status: Readonly<NetStatus>;
  /** shape เรียบสำหรับ debug overlay (P0-11) — คำนวณ playerCount ให้แล้ว */
  getNetDebugInfo(): NetDebugInfo;
  /** ส่งตำแหน่ง local player ขึ้น server (no-op ถ้ายังไม่ online) */
  sendMove(msg: MoveMessage): void;
  /** ออกจาก room + ปิด connection (idempotent) */
  disconnect(): void;
}

/** อ่าน field จาก PlayerState schema (client ได้ผ่าน reflection → เป็น any) → snapshot ที่ coerce แล้ว. */
function snapshotOf(player: {
  tx: number;
  ty: number;
  direction: string;
  anim: string;
}): PlayerSnapshot {
  return {
    tx: player.tx,
    ty: player.ty,
    direction: coerceDirection(player.direction),
    anim: coerceAnim(player.anim),
  };
}

/**
 * สร้าง net client + เริ่ม connect ทันที (async, ไม่ block caller).
 * คืน handle ที่ status.state = "connecting"; เปลี่ยนเป็น "online"/"offline" เมื่อผลลัพธ์มา.
 *
 * @param joinOptions ตำแหน่งเริ่มของ local player (server ใช้ spawn ให้ถูกตั้งแต่แรก)
 */
export function createNetClient(
  config: NetClientConfig,
  joinOptions: JoinOptions,
  handlers: NetClientHandlers,
): NetClientHandle {
  const status: NetStatus = {
    state: "connecting",
    serverUrl: config.serverUrl,
    roomId: null,
    channelId: null,
    mapId: null,
    selfSessionId: null,
    remoteCount: 0,
    correctionCount: 0,
    lastError: null,
  };

  let room: Room | null = null;
  let disposed = false;

  const client = new Client(config.serverUrl);

  const wire = (joinedRoom: Room): void => {
    room = joinedRoom;
    status.state = "online";
    status.roomId = joinedRoom.roomId;
    status.selfSessionId = joinedRoom.sessionId;

    const $ = getStateCallbacks(joinedRoom);
    const state = joinedRoom.state as {
      mapId: string;
      channelId: string;
    };
    status.mapId = state.mapId ?? null;
    status.channelId = state.channelId ?? null;

    // players map: onAdd/onChange/onRemove (ข้าม self — local player render เองแล้ว)
    $(joinedRoom.state).players.onAdd(
      (player: Record<string, unknown> & { tx: number; ty: number; direction: string; anim: string }, sessionId: string) => {
        if (sessionId === joinedRoom.sessionId) return;
        status.remoteCount += 1;
        handlers.onPlayerAdd(sessionId, snapshotOf(player));
        // per-player change → ขยับ remote entity (position/dir/anim)
        $(player).onChange(() => {
          handlers.onPlayerChange(sessionId, snapshotOf(player));
        });
      },
      true, // immediate: trigger สำหรับผู้เล่นที่อยู่ก่อนเรา join
    );

    $(joinedRoom.state).players.onRemove((_player: unknown, sessionId: string) => {
      if (sessionId === joinedRoom.sessionId) return;
      status.remoteCount = Math.max(0, status.remoteCount - 1);
      handlers.onPlayerRemove(sessionId);
    });

    // P1-02: server → client position correction (move ถูกปฏิเสธ) → นับ + ส่งต่อ caller reconcile
    joinedRoom.onMessage(
      MSG_POSITION_CORRECTION,
      (correction: PositionCorrectionMessage) => {
        status.correctionCount += 1;
        handlers.onPositionCorrection?.(correction);
      },
    );

    // channel/map อาจถูก set หลัง state แรก → sync ค่าล่าสุด
    $(joinedRoom.state).listen("channelId", (v: string) => {
      status.channelId = v;
    });
    $(joinedRoom.state).listen("mapId", (v: string) => {
      status.mapId = v;
    });

    joinedRoom.onLeave(() => {
      if (disposed) return;
      status.state = "offline";
    });
    joinedRoom.onError((code: number, message?: string) => {
      status.lastError = `room error ${code}: ${message ?? ""}`;
    });
  };

  // fire-and-forget connect — ล้มเหลว = offline, ไม่ throw (graceful solo)
  client
    .joinOrCreate<unknown>(config.roomName ?? MAP_ROOM_NAME, joinOptions)
    .then((joined) => {
      if (disposed) {
        void joined.leave();
        return;
      }
      wire(joined);
    })
    .catch((err: unknown) => {
      status.state = "offline";
      status.lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[net] connect ล้มเหลว (${config.serverUrl}) — เล่น solo ต่อ:`,
        status.lastError,
      );
    });

  return {
    status,
    getNetDebugInfo(): NetDebugInfo {
      return {
        status: status.state,
        mapId: status.mapId,
        roomId: status.roomId,
        channelId: status.channelId,
        playerCount: computePlayerCount(status.state, status.remoteCount),
        correctionCount: status.correctionCount,
      };
    },
    sendMove(msg: MoveMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_MOVE, msg);
    },
    disconnect(): void {
      if (disposed) return;
      disposed = true;
      status.state = "offline";
      if (room) void room.leave();
      room = null;
    },
  };
}
