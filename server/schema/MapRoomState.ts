// MapRoom state schema (P0-07) — @colyseus/schema (server-authoritative state ที่ sync ให้ client).
// field names ต้องตรงกับ wire shape ใน src/shared/net-protocol.ts (PlayerSnapshot/MoveMessage).
//
// ownership: นี่คือ "runtime/serialization" (Tech owns) ของ position sync — ไม่ใช่ skill schema
//   (v15 §50.1). field ชุดนี้เป็น net foundation ล้วน, ไม่แตะ Design Knob/skill fields.

import { Schema, MapSchema, type } from "@colyseus/schema";

/** สถานะผู้เล่น 1 คนที่ sync — position (tile/world coord) + ทิศ + anim. */
export class PlayerState extends Schema {
  @type("number") tx = 0;
  @type("number") ty = 0;
  @type("string") direction = "S";
  @type("string") anim = "idle";
}

/** สถานะ room = map instance. channelId = placeholder (P0_SCOPE_LOCK §4.7). */
export class MapRoomState extends Schema {
  @type("string") mapId = "";
  @type("string") channelId = "";
  @type("string") roomId = "";
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
