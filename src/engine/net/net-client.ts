// Net client — colyseus.js glue (P0-07, channel debug API P0-08). Plain TS + colyseus.js เท่านั้น (ห้าม React/Next/pixi).
// หน้าที่: connect → joinOrCreate MapRoom (mapId+channelId ใน joinOptions) → wire schema callbacks →
//   emit domain event ให้ caller (remote-player-manager) + ส่ง local position ขึ้น server. calc/pure อยู่ใน sync.ts.
//
// **Graceful offline (สำคัญ):** connect เป็น best-effort/async — ถ้า server ไม่รัน/ล้ม
//   → status = "offline", log, **ไม่ throw** เพื่อให้ /game เล่น solo ต่อได้ (owner เปิดดูโดยไม่ start server).
//
// P1-07 reconnect 30s grace (GS §59.1 · TA §6): เก็บ reconnectionToken หลัง join → ตอน ws หลุดแบบ
//   ไม่ตั้งใจ (onLeave code ≠ consented) เข้า status "reconnecting" แล้ว auto-reconnect เข้า seat เดิม
//   ด้วย exponential backoff (reconnectBackoffMs/shouldRetryReconnect, pure). สำเร็จ = re-wire เงียบ ๆ
//   (resume ตำแหน่งเดิมจาก server hold); หมดสิทธิ์/เกิน grace = fresh join ที่ safe camp (joinOptions เดิม).
//   re-wire = reset entity ที่ track ไว้ก่อน (กัน remote/mob ซ้ำจาก onAdd immediate รอบใหม่).
//
// P0 ยังไม่ทำ: auth/JWT, party sync — จด TODO ชี้ spec.

import { Client, getStateCallbacks, type Room } from "colyseus.js";
import {
  reconnectBackoffMs,
  shouldRetryReconnect,
} from "@/shared/reconnect";
import type { ReconnectClientRetryConfig } from "@/engine/config";
import {
  MAP_ROOM_NAME,
  MSG_CAST_SKILL,
  MSG_CAST_REJECTED,
  MSG_MOVE,
  MSG_POSITION_CORRECTION,
  MSG_SKILL_RESULT,
  type CastRejectedMessage,
  type CastSkillMessage,
  type JoinOptions,
  type MobSnapshot,
  type MoveMessage,
  type PlayerSnapshot,
  type PositionCorrectionMessage,
  type SkillResultMessage,
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
  /** room/channel/map จริงจาก server state (channelId = P1-08 server-assigned display label) — null ก่อน join สำเร็จ */
  roomId: string | null;
  channelId: string | null;
  mapId: string | null;
  /** partyId ของ channel ที่อยู่ (P1-08) — "" = solo channel, ≠"" = party channel. null ก่อน join. */
  partyId: string | null;
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
  /** partyId ของ channel ที่อยู่ (P1-08) — "" = solo, ≠"" = party channel. null ก่อน online. */
  partyId: string | null;
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
  /** มอน server-authoritative เพิ่ม/เปลี่ยน/ลบ (P1-03) → caller ป้อนเข้า mob view manager. optional. */
  onMobAdd?(snap: MobSnapshot): void;
  onMobChange?(snap: MobSnapshot): void;
  onMobRemove?(mobId: string): void;
  /** ผลการใช้สกิล (P1-05, broadcast) → caller เล่น damage number/impact จากผล server จริง. optional. */
  onSkillResult?(result: SkillResultMessage): void;
  /** cast ถูกปฏิเสธ (P1-05, ถึง caster เท่านั้น) — debug/UX เท่านั้น. optional. */
  onCastRejected?(rejected: CastRejectedMessage): void;
}

/** อ่าน MobState schema (reflection → any) → MobSnapshot (coerce state). */
function mobSnapshotOf(
  mob: { mobId: string; mobType: string; tx: number; ty: number; state: string; hp: number },
): MobSnapshot {
  return {
    mobId: mob.mobId,
    mobType: mob.mobType,
    tx: mob.tx,
    ty: mob.ty,
    state: coerceAnim(mob.state), // "idle"|"walk" (เดียวกับ player anim)
    hp: mob.hp,
  };
}

export interface NetClientConfig {
  serverUrl: string;
  roomName: string;
  /** P1-07: client auto-reconnect retry/backoff knob (จาก config.reconnect.clientRetry) */
  retry: ReconnectClientRetryConfig;
}

/** colyseus WebSocket close code สำหรับ "consented leave" (client เรียก leave() ตั้งใจ) — default 4000. */
const WS_CLOSE_CONSENTED = 4000;

/** await ได้ (cancel เองด้วย disposed check ฝั่ง caller) — ใช้เว้นช่วง backoff ระหว่าง reconnect. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface NetClientHandle {
  /** live status (อ่านอย่างเดียว) — raw fields, mutate in place ทุก frame */
  readonly status: Readonly<NetStatus>;
  /** shape เรียบสำหรับ debug overlay (P0-11) — คำนวณ playerCount ให้แล้ว */
  getNetDebugInfo(): NetDebugInfo;
  /** ส่งตำแหน่ง local player ขึ้น server (no-op ถ้ายังไม่ online) */
  sendMove(msg: MoveMessage): void;
  /** P1-05: ส่ง cast intent (skillId + aim + ทิศ) ขึ้น server (no-op ถ้ายังไม่ online). */
  sendCast(msg: CastSkillMessage): void;
  /** ออกจาก room + ปิด connection (idempotent) */
  disconnect(): void;
}

/** อ่าน field จาก PlayerState schema (client ได้ผ่าน reflection → เป็น any) → snapshot ที่ coerce แล้ว. */
function snapshotOf(player: {
  tx: number;
  ty: number;
  direction: string;
  anim: string;
  partyId?: string;
}): PlayerSnapshot {
  return {
    tx: player.tx,
    ty: player.ty,
    direction: coerceDirection(player.direction),
    anim: coerceAnim(player.anim),
    partyId: typeof player.partyId === "string" ? player.partyId : "",
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
    partyId: null,
    selfSessionId: null,
    remoteCount: 0,
    correctionCount: 0,
    lastError: null,
  };

  let room: Room | null = null;
  let disposed = false;
  // P1-07: token กลับเข้า seat เดิม (อัปเดตทุกครั้งที่ join/reconnect สำเร็จ) + flag กัน reconnect ซ้อน.
  let reconnectionToken: string | null = null;
  let reconnecting = false;
  // P1-07: entity ที่ track ไว้ (สำหรับ reset ก่อน re-wire — กัน onAdd(immediate) รอบใหม่ทำ remote/mob ซ้ำ).
  const knownRemotes = new Set<string>();
  const knownMobs = new Set<string>();

  const client = new Client(config.serverUrl);

  /**
   * P1-07: เคลียร์ entity ที่ track ไว้ (เรียก caller ให้ลบ) ก่อน re-wire room ใหม่ตอน reconnect —
   * กัน remote player / mob ค้างซ้ำเมื่อ onAdd(immediate) ยิงใหม่ทั้งชุดจาก full state sync.
   */
  const resetTrackedEntities = (): void => {
    for (const id of knownRemotes) handlers.onPlayerRemove(id);
    knownRemotes.clear();
    status.remoteCount = 0;
    for (const id of knownMobs) handlers.onMobRemove?.(id);
    knownMobs.clear();
  };

  const wire = (joinedRoom: Room): void => {
    // re-wire (reconnect/fresh join): ล้าง entity เดิมก่อน กันซ้ำ (first wire = no-op, set ว่าง).
    resetTrackedEntities();
    room = joinedRoom;
    reconnectionToken = joinedRoom.reconnectionToken; // P1-07: เก็บ token ล่าสุดไว้ reconnect
    status.state = "online";
    status.roomId = joinedRoom.roomId;
    status.selfSessionId = joinedRoom.sessionId;

    const $ = getStateCallbacks(joinedRoom);
    const state = joinedRoom.state as {
      mapId: string;
      channelId: string;
      partyId: string;
    };
    status.mapId = state.mapId ?? null;
    status.channelId = state.channelId ?? null;
    status.partyId = state.partyId ?? null;

    // players map: onAdd/onChange/onRemove (ข้าม self — local player render เองแล้ว)
    $(joinedRoom.state).players.onAdd(
      (player: Record<string, unknown> & { tx: number; ty: number; direction: string; anim: string }, sessionId: string) => {
        if (sessionId === joinedRoom.sessionId) return;
        status.remoteCount += 1;
        knownRemotes.add(sessionId); // P1-07: track เพื่อ reset ตอน reconnect
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
      knownRemotes.delete(sessionId);
      handlers.onPlayerRemove(sessionId);
    });

    // P1-03: mobs map (server-authoritative) → onAdd/onChange/onRemove → mob view manager
    $(joinedRoom.state).mobs.onAdd(
      (mob: Record<string, unknown> & { mobId: string; mobType: string; tx: number; ty: number; state: string; hp: number }) => {
        knownMobs.add(mob.mobId); // P1-07: track เพื่อ reset ตอน reconnect
        handlers.onMobAdd?.(mobSnapshotOf(mob));
        $(mob).onChange(() => {
          handlers.onMobChange?.(mobSnapshotOf(mob));
        });
      },
      true, // immediate: มอนที่มีอยู่ก่อนเรา join
    );
    $(joinedRoom.state).mobs.onRemove((_mob: unknown, mobId: string) => {
      knownMobs.delete(mobId);
      handlers.onMobRemove?.(mobId);
    });

    // P1-02: server → client position correction (move ถูกปฏิเสธ) → นับ + ส่งต่อ caller reconcile
    joinedRoom.onMessage(
      MSG_POSITION_CORRECTION,
      (correction: PositionCorrectionMessage) => {
        status.correctionCount += 1;
        handlers.onPositionCorrection?.(correction);
      },
    );

    // P1-05: server → client (broadcast) ผลใช้สกิล → caller เล่น damage number/impact จริง
    joinedRoom.onMessage(MSG_SKILL_RESULT, (result: SkillResultMessage) => {
      handlers.onSkillResult?.(result);
    });
    // P1-05: server → caster เดียว cast ถูกปฏิเสธ (cooldown/skill มั่ว/range) — debug/UX
    joinedRoom.onMessage(MSG_CAST_REJECTED, (rejected: CastRejectedMessage) => {
      handlers.onCastRejected?.(rejected);
    });

    // channel/map อาจถูก set หลัง state แรก → sync ค่าล่าสุด
    $(joinedRoom.state).listen("channelId", (v: string) => {
      status.channelId = v;
    });
    $(joinedRoom.state).listen("mapId", (v: string) => {
      status.mapId = v;
    });
    $(joinedRoom.state).listen("partyId", (v: string) => {
      status.partyId = v;
    });

    joinedRoom.onLeave((code: number) => {
      if (disposed) return;
      // P1-07: consented leave (เราเรียก leave() เอง) → offline จริง. หลุดไม่ตั้งใจ (code ≠ 4000) →
      // พยายาม auto-reconnect เข้า seat เดิม (server hold state ใน grace, §59.1).
      if (code === WS_CLOSE_CONSENTED || reconnectionToken === null) {
        status.state = "offline";
        return;
      }
      void beginReconnect();
    });
    joinedRoom.onError((code: number, message?: string) => {
      status.lastError = `room error ${code}: ${message ?? ""}`;
    });
  };

  /**
   * P1-07: ws หลุดไม่ตั้งใจ → auto-reconnect เข้า seat เดิมด้วย exponential backoff (§59.1 grace window).
   * สำเร็จ → wire room ใหม่ (resume ตำแหน่งเดิมที่ server hold, resetTrackedEntities กันซ้ำ).
   * หมดสิทธิ์/เกิน grace (reconnect throw ทุกครั้ง) → fresh join ที่ safe camp (joinOptions เดิม, §59.1).
   */
  const beginReconnect = async (): Promise<void> => {
    if (reconnecting || disposed) return;
    reconnecting = true;
    status.state = "reconnecting";
    const token = reconnectionToken;
    room = null;

    let attempt = 0;
    while (!disposed && token !== null && shouldRetryReconnect(attempt, config.retry)) {
      await delay(reconnectBackoffMs(attempt, config.retry));
      if (disposed) {
        reconnecting = false;
        return;
      }
      attempt += 1;
      try {
        const rejoined = await client.reconnect<unknown>(token);
        if (disposed) {
          void rejoined.leave();
          reconnecting = false;
          return;
        }
        wire(rejoined); // สำเร็จ → resume เงียบ ๆ (status กลับเป็น online ใน wire)
        reconnecting = false;
        return;
      } catch (err) {
        status.lastError = err instanceof Error ? err.message : String(err);
        // ลองใหม่รอบถัดไป (backoff เพิ่มขึ้น) จนกว่าจะหมด maxAttempts → fresh join ด้านล่าง
      }
    }

    reconnecting = false;
    if (disposed) return;
    // เกิน grace / seat หาย → join ใหม่ที่ safe camp (server resolveSpawnPosition การันตีจุดลงได้, §59.1)
    void freshJoin();
  };

  /** P1-07: fresh join หลัง reconnect ล้มเหลว — spawn ที่ safe camp (joinOptions เดิม), ไม่ throw. */
  const freshJoin = async (): Promise<void> => {
    status.state = "connecting";
    try {
      const joined = await client.joinOrCreate<unknown>(
        config.roomName ?? MAP_ROOM_NAME,
        joinOptions,
      );
      if (disposed) {
        void joined.leave();
        return;
      }
      wire(joined);
    } catch (err) {
      status.state = "offline";
      status.lastError = err instanceof Error ? err.message : String(err);
    }
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
        partyId: status.partyId,
        playerCount: computePlayerCount(status.state, status.remoteCount),
        correctionCount: status.correctionCount,
      };
    },
    sendMove(msg: MoveMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_MOVE, msg);
    },
    sendCast(msg: CastSkillMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_CAST_SKILL, msg);
    },
    disconnect(): void {
      if (disposed) return;
      disposed = true;
      status.state = "offline";
      reconnectionToken = null; // P1-07: กัน onLeave trigger auto-reconnect หลังตั้งใจปิด
      if (room) void room.leave();
      room = null;
    },
  };
}
