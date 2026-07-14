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
  /**
   * NAMEPLATES: ชื่อตัวละครที่แสดงเหนือหัว (local + remote). onJoin ตั้งจาก character.name (display name §3.3);
   * guest/ไม่มีตัวละคร (characterId null) → default "ผู้เล่น" (ไม่ leak id/sessionId). Colyseus auto-sync ให้ทุก
   * client. **ไม่ใช่ skill schema (v15 §50.1) / DB schema** — เป็น room-state/serialization field ล้วน (net foundation);
   * client ไม่เคยส่งค่านี้ขึ้น server (server-authoritative). field ต้องตรง PlayerSnapshot.name (net-protocol.ts).
   */
  @type("string") name = "";
  /** partyId (P1-08) — "" = solo. สมาชิก party เดียวกันใน room นี้ share ค่าเดียวกัน (filterBy). */
  @type("string") partyId = "";
  /**
   * Batch 6 (ARCHER_CLASS_SPEC §6 note 4): classId (นักดาบ "swordsman" / นักธนู "archer") — server-authoritative
   * (onJoin ตั้งจาก Character.classId ผ่าน loadCharacterClass / joinOptions fallback). Colyseus auto-sync →
   * client เลือกชุดสกิล/art ตามอาชีพ. client ไม่เคยส่งค่านี้ขึ้น server (authority). default นักดาบ.
   */
  @type("string") classId = "swordsman";
  /**
   * P2-13 (D-056): true เมื่อผู้เล่น idle ครบ idleIndicatorSec (ไม่มี movement/cast) — client แสดงป้าย
   * "AFK" ให้ผู้เล่นอื่นเห็น. server-authoritative (input tracker); reset false ทันทีที่มี input. **ไม่ผูก
   * disconnect** — D-056 ยกเลิก forced disconnect ทั้งชุด (character ค้างในโลกต่อ).
   */
  @type("boolean") isAfk = false;
  /**
   * Batch 7b (Bot/Hunter Assistant): true = this entity is a server-side bot (virtual player), NOT a connected
   * client. Colyseus auto-sync → other real players SEE the bot in the room + client can render a bot marker.
   * server-authoritative (a real client can never set this). additive field — not a skill/DB schema field.
   */
  @type("boolean") isBot = false;
  /**
   * A1/A2 (COMBAT_BIBLE §2/§10) — server-authoritative hp/maxHp. Colyseus auto-sync ให้ทุก client (แถบ HP =
   * E3, death overlay = E4). onJoin ตั้ง hp = maxHp (เกิดเต็ม); มอนตี → server หัก hp (clamp 0) → ตาย → respawn
   * safe camp เต็ม hp. maxHp = effective max HP ต่อเลเวล+gear (recompute ตอน equip/level-up). ค่า 0 = ก่อน init.
   */
  @type("number") hp = 0;
  @type("number") maxHp = 0;
  /**
   * E3 (§8.2 level badge) — server-authoritative level (จาก sessionProgress). sync ทันทีตอน join + level-up →
   * HUD แสดงเลเวลจริงทันที (ไม่ต้องรอ MSG_PLAYER_PROGRESS หลัง kill แรก) + ปลดล็อกสกิล A3 (unlock-by-level) ถูกตั้งแต่เกิด.
   */
  @type("number") level = 1;
  /**
   * E3 (§8.2 EXP bar) — server-authoritative exp progress. sync ตอน join + kill → HUD แถบ EXP + ตัวเลข % แสดง
   * ตั้งแต่เกิด (ไม่รอ kill แรก). exp = cumulative รวม; expFloor/expCeil = ขอบเลเวลปัจจุบัน (§9.1/§9.2, expCeil 0 = ตัน cap).
   */
  @type("number") exp = 0;
  @type("number") expFloor = 0;
  @type("number") expCeil = 0;
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
  /**
   * workstream B (Field Boss): guard-gauge ปัจจุบัน + เต็ม (Colyseus auto-sync → client แถบ guard, E3 HUD).
   * maxGuard > 0 = mob นี้เป็นบอส (มี guard gauge); normal mob = 0/0. server-authoritative (client ไม่ส่งค่านี้).
   */
  @type("number") guard = 0;
  @type("number") maxGuard = 0;
  /** workstream B: index ของ boss phase (§2.3: 0 Learn / 1 Pressure / 2 Enrage). normal mob = 0. */
  @type("number") bossPhase = 0;
  /** workstream B: true ช่วง BREAK/stagger (golden window) — client แสดง stagger + guard bar แตก (§2.4). */
  @type("boolean") staggered = false;
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
