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
  /** partyId (P1-08) — "" = solo. สมาชิก party เดียวกันใน room นี้ share ค่าเดียวกัน (filterBy). */
  @type("string") partyId = "";
}

/**
 * สถานะมอน 1 ตัวที่ sync (P1-03, server-authoritative) — position + anim state + hp.
 * field ต้องตรง MobSnapshot ใน src/shared/net-protocol.ts. ทิศ (facing) ไม่ sync — client derive จาก delta.
 * hp เต็มไว้ก่อน (P1-03); death/damage จริง = P1-05 (TA §15). anim state = "idle"|"walk".
 */
export class MobState extends Schema {
  @type("string") mobId = "";
  @type("string") mobType = "";
  @type("number") tx = 0;
  @type("number") ty = 0;
  @type("string") state = "idle";
  @type("number") hp = 0;
}

/**
 * สถานะ room = map+channel instance. channelId = **server-assigned display label** (P1-08 auto-assign,
 * §59.3) — CH.1/CH.2/... จาก channel registry. partyId = "" สำหรับ solo channel, ≠"" ถ้าเป็น party channel
 * (filterBy(['mapId','partyId'])). client อ่าน channelId/partyId โชว์ overlay.
 */
export class MapRoomState extends Schema {
  @type("string") mapId = "";
  @type("string") channelId = "";
  /** partyId ของ channel นี้ (P1-08) — "" = solo channel; ≠"" = channel เฉพาะ party นั้น. */
  @type("string") partyId = "";
  @type("string") roomId = "";
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  /** มอนทุกตัวในห้อง (P1-03) — key = mobId. **AOI filter ยังไม่บังคับ P1** (§18.2, ดู MapRoom TODO). */
  @type({ map: MobState }) mobs = new MapSchema<MobState>();
}
