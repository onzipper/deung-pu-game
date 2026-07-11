// MapRoom (P0-07) — Colyseus Room = map instance (1:1, tech §6). Local dev เท่านั้นใน P0.
//
// ทำ: join → spawn PlayerState ที่ตำแหน่ง client ส่งมา · MSG_MOVE → อัปเดต state · leave → ลบ.
// state ถูก broadcast ให้ทุก client อัตโนมัติผ่าน schema patch (delta binary) ของ Colyseus.
//
// P0 **ยังไม่ทำ** (จด TODO ชี้ spec):
//   - server-authoritative movement validation (P0 trust ตำแหน่ง client) → tech §6 "Player movement sync"
//   - reconnect 30s grace (allowReconnection) → tech §6/§59.1, RUNTIME §2
//   - channel auto-assign จริง (P0 fixed CH.1) → tech §6, RUNTIME §4
//   - persistence player position ตอน leave → tech §6/§7

import { Room, type Client } from "colyseus";
import { MapRoomState, PlayerState } from "../schema/MapRoomState";
import {
  DEFAULT_CHANNEL_ID,
  DEFAULT_MAP_ID,
  MSG_MOVE,
  type JoinOptions,
  type MoveMessage,
} from "../../src/shared/net-protocol";

export class MapRoom extends Room<MapRoomState> {
  onCreate(options: { mapId?: string } = {}): void {
    const state = new MapRoomState();
    state.mapId = options.mapId ?? DEFAULT_MAP_ID;
    state.channelId = DEFAULT_CHANNEL_ID; // placeholder — P1 auto-assign
    state.roomId = this.roomId;
    this.setState(state);

    this.onMessage(MSG_MOVE, (client: Client, message: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      // P0: TRUST ตำแหน่งจาก client (ยังไม่ validate). P1 TODO: speed cap / wall clip / teleport check (tech §6).
      player.tx = message.tx;
      player.ty = message.ty;
      player.direction = message.direction;
      player.anim = message.anim;
    });
  }

  onJoin(client: Client, options: JoinOptions): void {
    const player = new PlayerState();
    player.tx = options?.tx ?? 0;
    player.ty = options?.ty ?? 0;
    player.direction = options?.direction ?? "S";
    player.anim = options?.anim ?? "idle";
    this.state.players.set(client.sessionId, player);
    console.log(
      `[MapRoom ${this.roomId}] join ${client.sessionId} @(${player.tx.toFixed(1)},${player.ty.toFixed(1)}) — ${this.clients.length} online`,
    );
  }

  onLeave(client: Client): void {
    // P0: ลบทันที (spec §4.6 done = "ออกจากห้องแล้ว entity หาย").
    // P1 TODO: allowReconnection(client, 30) grace ก่อนลบ (tech §59.1).
    this.state.players.delete(client.sessionId);
    console.log(`[MapRoom ${this.roomId}] leave ${client.sessionId}`);
  }
}
