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
 * prefix ของ channel display label (§59.3 "แสดง channel ปัจจุบัน เช่น CH.1"). channelId = `${prefix}${n}`
 * โดย n = เลข channel 1-based ที่ **server** จ่ายให้ตอน auto-assign (P1-08, ไม่ใช่ client เลือก).
 */
export const CHANNEL_LABEL_PREFIX = "CH.";

/** สร้าง channel display label จากเลข channel (1-based) → "CH.1", "CH.2", ... (single source ของ format). */
export function channelLabel(channelNumber: number): string {
  return `${CHANNEL_LABEL_PREFIX}${channelNumber}`;
}

/**
 * channel แรกของทุก map (= channelLabel(1)). **P1-08: channelId เป็น server-assigned display label**
 * (auto-assign ตาม load/population, §59.3) — client **ไม่ส่ง** channelId อีกต่อไป (ต่างจาก P0-08 stub).
 * client อ่านค่านี้จาก room state เพื่อโชว์ overlay เท่านั้น.
 */
export const DEFAULT_CHANNEL_ID = channelLabel(1);

/**
 * default partyId = "" (solo). P1-08: client ส่ง partyId ใน JoinOptions → server ใช้เป็นมิติ filter
 * (filterBy(['mapId','partyId'])) ให้สมาชิก party เดียวกันลง room/channel เดียวกันอัตโนมัติ (§59.3 party sync).
 * "" = solo pool (auto-assign ตาม capacity); ค่าไม่ว่าง = party affinity. dev ตั้งผ่าน URL `?party=xyz`.
 */
export const DEFAULT_PARTY_ID = "";

/**
 * WebSocket close code (P2-04, Storage §4.1/§4.2) — server เตะ session เดิมเมื่อ **account เดียวกัน**
 * เข้าเล่นจาก device/tab ใหม่ (takeover-wins). ตัวใหม่ยึด session lease → server เรียก client.leave(code)
 * ของตัวเก่าด้วยรหัสนี้. ต้องอยู่ช่วง custom 4000–4999 และเลี่ยงรหัสสงวนของ Colyseus
 * (4000=consented, 4002=with_error, 4010=devmode_restart). client แยกจาก reconnect-grace ได้ด้วยรหัสนี้.
 */
export const WS_CLOSE_SESSION_TAKEN_OVER = 4001;

/** message type: client → server ส่งตำแหน่ง/ทิศ/anim ปัจจุบัน (throttled ~10–15Hz, tech §6). */
export const MSG_MOVE = "move";

/**
 * message type: client → server (**intent เท่านั้น**, P1-05, TA §16.2) — ขอใช้สกิล.
 * server validate (รู้จัก skillId / cooldown / range §16.3) → คำนวณ AoE hit + damage (สูตร server §15.2)
 * → apply กับ mob → broadcast MSG_SKILL_RESULT. ปฏิเสธ → MSG_CAST_REJECTED (เงียบ ๆ ไม่ crash).
 * payload = CastSkillMessage. **client ไม่ส่ง damage/ผล — ส่งแค่ intent** (server-authoritative §7).
 */
export const MSG_CAST_SKILL = "cast_skill";

/**
 * payload ของ MSG_CAST_SKILL (client → server, P1-05).
 * aim (tx,ty) = จุดเล็ง (tile coord) ใช้ตรวจ range + เป็นศูนย์กลาง AoE บางชนิด; direction = ทิศ facing
 * ที่ client เล็ง (arc/cone ใช้ทิศนี้). server ไม่ trust ระยะ — validate เองจากตำแหน่ง caster ใน state.
 */
export interface CastSkillMessage {
  skillId: string;
  aimTx: number;
  aimTy: number;
  direction: WirePlayerDirection;
}

/** ผลการโดนสกิลต่อ mob 1 ตัว (P1-05, TA §16.2) — client แตกเป็น damage number เอง (§6/§16.2). */
export interface SkillHit {
  mobId: string;
  /** damage รวมต่อ mob (server aggregate multi-hit เป็นเลขเดียว) */
  dmg: number;
  /** crit หรือไม่ (มี sub-hit ใด crit) */
  crit: boolean;
  /** true = hit นี้ฆ่ามอน (mob จะ despawn ผ่าน state removal ด้วย) */
  killed: boolean;
}

/**
 * message type: server → **ทุก client ในห้อง** (broadcast, P1-05, TA §16.2) — ผลการใช้สกิล.
 * client เล่น damage number / impact / death จากผลนี้ (ความจริงจาก server). payload = SkillResultMessage.
 */
export const MSG_SKILL_RESULT = "skill_result";

/** payload ของ MSG_SKILL_RESULT (server → broadcast, P1-05). */
export interface SkillResultMessage {
  /** sessionId ผู้ใช้สกิล */
  casterId: string;
  skillId: string;
  /** เป้าที่โดน (ว่างได้ = สกิลพลาด/utility ไม่ทำ damage) */
  hits: SkillHit[];
}

/**
 * message type: server → **client ผู้ cast เท่านั้น** (P1-05) — cast ถูกปฏิเสธ (cooldown/skill มั่ว/range).
 * เงียบ ๆ (ไม่ apply, ไม่ crash room) — UX/debug เท่านั้น, ไม่ผูก punishment. payload = CastRejectedMessage.
 */
export const MSG_CAST_REJECTED = "cast_rejected";

/** payload ของ MSG_CAST_REJECTED (server → client เดียว, P1-05). reason = "unknown_skill"|"cooldown"|"out_of_range". */
export interface CastRejectedMessage {
  skillId: string;
  reason: string;
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
  /** hp ปัจจุบัน (P1-05: update จริงจาก server combat → client โชว์ HP bar เมื่อ hp < maxHp) */
  hp: number;
}

/**
 * message type: server → **client เดียว** เมื่อ move ถูกปฏิเสธ (P1-02, TA §6/§16.3).
 * server ไม่ apply ตำแหน่งที่ผิด → ส่งตำแหน่ง authoritative ล่าสุดกลับให้ client reconcile
 * (snap local player + เคลียร์ prediction). ไม่แบน/ไม่เตะ — แค่ snap กลับ.
 */
export const MSG_POSITION_CORRECTION = "position_correction";

/**
 * message type: server → **client เดียว** (P1-10, GS §57.3) — player เดินเข้า exit area (ตรวจ
 * server-authoritative จาก findExitAt ใน MSG_MOVE) → สั่ง client ข้าม map (separated rooms + fade).
 * client leave room เดิม (consented) → fade out → join room ปลายทาง (mapId=targetMapId, spawn=targetSpawn)
 * → fade in. ยิงครั้งเดียวต่อการเข้า exit (server track lastExitId กัน spam). payload = MapTransitionMessage.
 */
export const MSG_MAP_TRANSITION = "map_transition";

/**
 * payload ของ MSG_MAP_TRANSITION (server → client เดียว, P1-10).
 * targetSpawn = จุดเกิดใน target map (tile coord) — server เอามาจาก MapExit ที่ validate แล้ว (registry
 * cross-ref: targetMapId มีจริง + targetSpawn เดินได้). client ใช้ join room ใหม่ที่ตำแหน่งนี้.
 */
export interface MapTransitionMessage {
  exitId: string;
  targetMapId: string;
  targetSpawn: { x: number; y: number };
}

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
 * partyId (P1-08, §59.3 party sync): มิติ filter ที่ client ส่ง → server ใช้
 * `filterBy(['mapId','partyId'])` ให้สมาชิก party เดียวกัน (partyId เดียวกัน) ลง room/channel เดียวกัน
 * อัตโนมัติ; solo = "" (DEFAULT_PARTY_ID) → เข้า pool auto-assign ตาม capacity. **channelId ไม่อยู่ใน
 * JoinOptions แล้ว** — เป็น server-assigned display label (P0-08 stub → P1-08 auto-assign). client อ่าน
 * channelId ที่ได้จริงจาก room state (§59.3 "แสดง channel ปัจจุบัน").
 */
export interface JoinOptions {
  mapId: string;
  partyId: string;
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
  /** partyId ของผู้เล่นนี้ (P1-08) — "" = solo. client ใช้รู้ว่าใครอยู่ party เดียวกัน (สีต่างใน P2). */
  partyId: string;
}
