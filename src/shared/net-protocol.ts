// Shared realtime protocol (P0-07, channelId P0-08) — plain TS, **ไม่มี runtime dependency**.
// import ได้ทั้ง client (`@/shared/net-protocol`) และ server (relative `../src/shared/net-protocol`).
// วางที่ src/shared/ เพราะ client (Next) ใช้ alias `@/` อยู่แล้ว; server มี own tsconfig ที่ map `@/*` เช่นกัน.
//
// กติกา: ไฟล์นี้เก็บเฉพาะ "สัญญา" ที่ client/server ต้องตรงกัน — ชื่อ room, message type,
// รูปร่าง payload (wire shape). ห้ามใส่ pixi/colyseus/engine glue ที่นี่ (จะทำให้ทั้งสองฝั่งพัง import).
//
// P0 scope (P0_SCOPE_LOCK §4.6/§4.7): join/leave · position sync · other players visible ·
// minimal room state · channelId เป็น first-class filter key (map+channel = room instance เดียว,
// ยังไม่มี auto-assign). ยังไม่ทำ reconnect/party/auth/persistence.

import type { Direction } from "@/engine/movement/direction";

/**
 * Wire direction = Direction เดียวกับ engine (5-dir + mirror → 8 logical).
 * ใช้ `import type` → runtime ไม่โหลด engine module (server decouple จาก pixi/engine).
 */
export type WirePlayerDirection = Direction;

/** สถานะ animation ที่ sync ข้าม network (P0: idle/walk พอ; attack = P0-09 stub, ยังไม่ sync). */
export type WirePlayerAnim = "idle" | "walk";

/** ชื่อ room เดียวของ P0 (map instance). MapRoom = Colyseus Room 1:1 (tech §6). */
export const MAP_ROOM_NAME = "map_room";

/** map เดียวของ P0 (ตรงกับ engine map/p0-test-field). */
export const DEFAULT_MAP_ID = "p0-test-field";

/**
 * default channelId (P0_SCOPE_LOCK §4.7, P0-08). client ส่งค่านี้ใน JoinOptions.channelId
 * เว้นแต่ override (NetConfig) — server ใช้ค่าจาก options จริง (ไม่ hardcode ซ้ำฝั่ง server).
 * P0 ยังไม่มี UI เลือก channel/auto-assign (P1, tech §6, RUNTIME §4) — architecture ไม่ผูก map↔room ถาวร
 * (พิสูจน์ด้วย filterBy(['mapId','channelId']): map+channel เดียวกัน = room เดียวกัน, channel ต่างกัน = room ต่างกัน).
 */
export const DEFAULT_CHANNEL_ID = "CH.1";

/** message type: client → server ส่งตำแหน่ง/ทิศ/anim ปัจจุบัน (throttled ~10–15Hz, tech §6). */
export const MSG_MOVE = "move";

/**
 * message type: client → server (**DEBUG/ADMIN เท่านั้น**, P1-03) — ฆ่ามอน 1 ตัวเพื่อทดสอบ
 * death→respawn ฝั่ง server ก่อน P1-05 (server combat authority) มาแทน. payload = DebugKillMobMessage.
 * TODO(P1-05): ลบ handler นี้เมื่อ cast_skill → server damage → mob death จริงพร้อม (TA §15).
 */
export const MSG_DEBUG_KILL_MOB = "debug_kill_mob";

/** payload ของ MSG_DEBUG_KILL_MOB (client → server, debug). */
export interface DebugKillMobMessage {
  mobId: string;
}

/** anim state ของมอนที่ sync (P1-03) — idle/walk เท่านั้น (attack/death = client เล่นเองจาก event, tech §6). */
export type WireMobState = "idle" | "walk";

/**
 * snapshot ของมอน 1 ตัวที่ client อ่านจาก room state (P1-03, TA §18/§6 monster sync).
 * ตรงกับ MobState schema ฝั่ง server (server/schema/MapRoomState.ts) — field ต้องตรงกัน.
 * ทิศ (facing) **ไม่ sync** — client derive จาก delta ตำแหน่งเอง (มอน 2-dir+mirror, ประหยัด bandwidth §18.2).
 */
export interface MobSnapshot {
  mobId: string;
  mobType: string;
  tx: number;
  ty: number;
  /** anim state (idle/walk) — client เลือก clip */
  state: WireMobState;
  /** hp ปัจจุบัน (P1-03 เต็มไว้; death จริง = P1-05) */
  hp: number;
}

/**
 * message type: server → **client เดียว** เมื่อ move ถูกปฏิเสธ (P1-02, TA §6/§16.3).
 * server ไม่ apply ตำแหน่งที่ผิด → ส่งตำแหน่ง authoritative ล่าสุดกลับให้ client reconcile
 * (snap local player + เคลียร์ prediction). ไม่แบน/ไม่เตะ — แค่ snap กลับ.
 */
export const MSG_POSITION_CORRECTION = "position_correction";

/**
 * payload ของ MSG_POSITION_CORRECTION (server → client เดียว, P1-02).
 * tx/ty = ตำแหน่ง authoritative (valid ล่าสุดฝั่ง server, tile coord) ที่ client ต้อง snap กลับไป.
 * direction/anim = state ล่าสุดฝั่ง server (คงจาก valid ล่าสุด). reason = debug เท่านั้น (ไม่ผูก gameplay).
 */
export interface PositionCorrectionMessage {
  tx: number;
  ty: number;
  direction: WirePlayerDirection;
  anim: WirePlayerAnim;
  /** เหตุผลถูก correct ("teleport" | "speed" | "blocked" | "non_finite") — debug/log */
  reason: string;
}

/**
 * payload ของ MSG_MOVE (client → server).
 * position เป็น **tile/world coordinate** (float ได้) — server เก็บ, client อื่นแปลงเป็น iso screen เอง (tech §6).
 * P0: server **trust** ค่านี้ (ยังไม่ validate). P1 TODO: server-authoritative speed/wall/teleport check (tech §6 "Player movement sync").
 */
export interface MoveMessage {
  tx: number;
  ty: number;
  direction: WirePlayerDirection;
  anim: WirePlayerAnim;
}

/**
 * option ที่ client ส่งตอน joinOrCreate → server ใช้ spawn player ตำแหน่งถูกตั้งแต่เฟรมแรก
 * (กัน flash ที่ default tile). mapId เผื่อ P1 แยกหลาย map/room.
 *
 * channelId (P0-08, P0_SCOPE_LOCK §4.7): ส่งจาก client เพื่อให้ server ใช้
 * `filterBy(['mapId','channelId'])` แยก room instance — map เดียวกัน + channel ต่างกัน
 * = คนละ room instance, map+channel เดียวกัน = room เดียวกันเสมอ (ยังไม่มี auto-assign, P1).
 */
export interface JoinOptions {
  mapId: string;
  channelId: string;
  tx: number;
  ty: number;
  direction: WirePlayerDirection;
  anim: WirePlayerAnim;
}

/**
 * snapshot ของผู้เล่น 1 คนที่ client อ่านจาก room state (รวม field ทั้งหมดที่ sync).
 * ตรงกับ PlayerState schema ฝั่ง server (server/schema/MapRoomState.ts) — field ต้องตรงกัน.
 */
export interface PlayerSnapshot {
  tx: number;
  ty: number;
  direction: WirePlayerDirection;
  anim: WirePlayerAnim;
}
