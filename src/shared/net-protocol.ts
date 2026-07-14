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

/**
 * key ของ sessionStorage ที่ Game Hub เขียน characterId ที่ผู้เล่นเลือก "เข้าเกม" (P2-05, Storage §5/§7)
 * แล้ว /game (net-client) อ่านมาแนบใน joinOptions.characterId → server load state + ตรวจ ownership.
 * **sessionStorage per-tab** (เหมือน reconnect token) — refresh คงตัวละครเดิม; ไปเลือกใหม่ที่ hub = overwrite.
 * ไม่มีค่า = เล่นแบบ anonymous (dev/e2e / เข้า /game ตรง ๆ) — flow เดิมไม่พัง.
 */
export const SELECTED_CHARACTER_STORAGE_KEY = "deungpu.selectedCharacterId";

/**
 * key ของ sessionStorage คู่กับ {@link SELECTED_CHARACTER_STORAGE_KEY} — mapId ล่าสุดที่ตัวละครที่เลือก
 * persist ไว้ (P2-05 owner-report#6 fix, Storage §5/§7). Game Hub เขียนคู่กันตอน "เข้าเกม"
 * (`CharacterView.lastMapId`); /game boot อ่านค่านี้เพื่อ mount map เดียวกับที่ save ไว้แทน DEFAULT_MAP_ID
 * เสมอ (ก่อนหน้านี้ mismatch กับ `pickLoadPosition` ฝั่ง server ทำให้ตำแหน่ง save ถูกทิ้ง). ไม่มีค่า/null =
 * ตัวละครใหม่ยังไม่เคย save → boot DEFAULT_MAP_ID ตามเดิม. engine เขียนทับค่านี้เองตอน transition ข้าม map
 * ระหว่างเล่น (กัน refresh กลาง /game แล้วได้ map เก่าตอนออกจาก hub).
 */
export const SELECTED_CHARACTER_MAP_STORAGE_KEY = "deungpu.selectedCharacterMapId";

/**
 * Batch 6 (ARCHER_CLASS_SPEC §6 note 4): key ของ sessionStorage คู่กับ {@link SELECTED_CHARACTER_STORAGE_KEY} —
 * classId ("swordsman"/"archer") ของตัวละครที่เลือก. Game Hub เขียนตอน "เข้าเกม" (`CharacterView.classId`);
 * /game boot อ่านเพื่อเลือกชุดสกิล client (hotbar/aim) ตั้งแต่ mount + แนบ joinOptions.classId (fallback ตอน
 * ไม่มี DB). server เป็น authority สุดท้าย (Character.classId). ไม่มีค่า = fallback "swordsman".
 */
export const SELECTED_CHARACTER_CLASS_STORAGE_KEY = "deungpu.selectedCharacterClassId";

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

/**
 * payload ของ MSG_CAST_REJECTED (server → client เดียว, P1-05).
 * reason = "safe_zone" | "unknown_skill" | "locked" (A3: playerLevel < unlockLevel) | "cooldown" | "out_of_range".
 */
export interface CastRejectedMessage {
  skillId: string;
  reason: string;
}

// ── A1/A2 mob→player combat intake + death/respawn (COMBAT_BIBLE §2/§10) ────────────────────────────────
// hp/maxHp เอง ride PlayerState schema (auto-sync). message พวกนี้ = **สัญญาณ juice/event** ล้วน (client เล่น
// hit flash / death anim / snap respawn) — ความจริงทั้งหมด server-authoritative (client ไม่ predict การโดนตี).

/**
 * message type: server → **ทุก client ในห้อง** (broadcast) — มอน contact ใส่ผู้เล่น 1 ครั้ง (A1). client เล่น
 * hit flash / damage number เหนือหัวผู้เล่นที่โดน (juice); hp จริงมาทาง PlayerState schema. payload = PlayerDamagedMessage.
 */
export const MSG_PLAYER_DAMAGED = "player_damaged";

/** payload ของ MSG_PLAYER_DAMAGED (server → broadcast, A1). */
export interface PlayerDamagedMessage {
  /** sessionId ผู้เล่นที่โดน */
  sessionId: string;
  /** มอนที่ตี (client เล่นทิศ hit จากตำแหน่งมอน) */
  mobId: string;
  /** damage authoritative รอบนี้ (integer) — เลขบนจอ = hp ที่ลดจริง */
  dmg: number;
  /** hp หลังหัก (authoritative) — client sync แถบ HP ได้ทันทีโดยไม่รอ schema patch */
  hp: number;
}

/**
 * message type: server → **ทุก client ในห้อง** (broadcast) — ผู้เล่นตาย (hp ถึง 0, §10). client เล่น death anim;
 * self → death feedback (overlay เต็ม = E4). respawn ตามมาทันที (server-authoritative). payload = PlayerDeathMessage.
 */
export const MSG_PLAYER_DEATH = "player_death";

/** payload ของ MSG_PLAYER_DEATH (server → broadcast, A2). */
export interface PlayerDeathMessage {
  sessionId: string;
  /** มอนที่ตีจนตาย (killer) — debug/feedback; "" ถ้าไม่ทราบ */
  mobId: string;
}

/**
 * message type: server → **ทุก client ในห้อง** (broadcast) — ผู้เล่น respawn ที่ safe camp เต็ม hp (§10).
 * self: client snap local player + camera ไปจุดนี้ (เหมือน onSelfSpawn/position_correction — local player
 * client-predicted, ตำแหน่งไม่มาทาง schema onChange). remote: ตำแหน่งมาทาง schema อยู่แล้ว. payload = PlayerRespawnMessage.
 */
export const MSG_PLAYER_RESPAWN = "player_respawn";

/** payload ของ MSG_PLAYER_RESPAWN (server → broadcast, A2). */
export interface PlayerRespawnMessage {
  sessionId: string;
  /** จุด respawn (tile coord) = safe camp ที่อนุมัติ (§10) */
  tx: number;
  ty: number;
  /** hp หลัง respawn (= maxHp เต็ม) */
  hp: number;
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
  /**
   * workstream B (Field Boss): guard-gauge ปัจจุบัน. `maxGuard` > 0 = mob นี้เป็นบอส → client แสดงแถบ guard
   * (E3 HUD). normal mob = 0/0 (ไม่มี guard gauge). optional (default 0) — server-authoritative.
   */
  guard?: number;
  maxGuard?: number;
  /** workstream B: index ของ boss phase ปัจจุบัน (§2.3: 0 Learn / 1 Pressure / 2 Enrage). normal mob = 0. */
  bossPhase?: number;
  /** workstream B: true ช่วง BREAK/stagger (golden window) — client แสดง stagger + guard bar แตก. default false. */
  staggered?: boolean;
}

// ── workstream B: Field Boss depth (guard/break gauge + phase + telegraph, COMBAT_BIBLE §7/§8 · §2.3/§2.4) ──
// guard/maxGuard/bossPhase/staggered ride MobState schema (auto-sync → HUD bar). message พวกนี้ = **event/juice
// signal** ล้วน (client เล่น telegraph circle / break VFX-SFX / phase banner) — ความจริง server-authoritative.

/**
 * message type: server → **ทุก client ในห้อง** — บอสเริ่มท่าโจมตี (anticipation) → client แสดง telegraph
 * (danger zone) เหนือ effect เสมอ ไม่ขึ้นกับ quality setting (§18.5). payload = BossTelegraphMessage.
 */
export const MSG_BOSS_TELEGRAPH = "boss_telegraph";

/** payload ของ MSG_BOSS_TELEGRAPH (server → broadcast, workstream B). */
export interface BossTelegraphMessage {
  mobId: string;
  /** vfx cue ของ telegraph (client วาด danger zone) — เช่น "vfx_telegraph_circle_danger". */
  vfxCue: string;
  /** ระยะ anticipation (ms) = dodge window ก่อน active frame (client จับเวลา telegraph). */
  durationMs: number;
}

/**
 * message type: server → **ทุก client ในห้อง** — guard บอสแตก → BREAK (§8). client เล่น break VFX/SFX +
 * เปิด golden window (รับ damage ×multiplier). payload = BossBreakMessage.
 */
export const MSG_BOSS_BREAK = "boss_break";

/** payload ของ MSG_BOSS_BREAK (server → broadcast, workstream B). */
export interface BossBreakMessage {
  mobId: string;
  /** ระยะ stagger (ms) ที่บอสชะงัก (solo 6000 / party 8000, §2.4) — client จับเวลา golden window. */
  staggerMs: number;
}

/**
 * message type: server → **ทุก client ในห้อง** — บอสเปลี่ยน phase (§2.3 Learn→Pressure→Enrage). client แสดง
 * phase banner / เปลี่ยน music layer. payload = BossPhaseMessage.
 */
export const MSG_BOSS_PHASE = "boss_phase";

/** payload ของ MSG_BOSS_PHASE (server → broadcast, workstream B). */
export interface BossPhaseMessage {
  mobId: string;
  /** index ของ phase ใหม่ (0-based). */
  phaseIndex: number;
  /** phase id ("learn"|"pressure"|"enrage") — client map เป็น label/effect. */
  phaseId: string;
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
  /**
   * P2-05 (Storage §5/§7 · §22): ตัวละครที่ผู้เล่นเลือกเข้าเกม (จาก Game Hub Continue). server (onAuth)
   * ตรวจ ownership กับ accountId ที่ verify จาก token — ไม่ใช่ของบัญชี = reject (กัน load state คนอื่น).
   * omit = anonymous (dev bypass ไม่มี account / เข้า /game ตรง ๆ) → spawn default, ไม่ persist. optional.
   */
  characterId?: string;
  /**
   * Batch 6 (ARCHER_CLASS_SPEC §6 note 4): classId ที่ client เลือก (จาก Game Hub sessionStorage). server ใช้เป็น
   * **fallback เท่านั้น** เมื่อไม่มี DB-bound character class (dev/e2e/anonymous) — DB Character.classId เป็น
   * authority เสมอเมื่อมี. validate กับ CLASS_IDS ก่อนใช้ (ค่ามั่ว → swordsman). omit = swordsman. optional.
   */
  classId?: string;
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
  /**
   * NAMEPLATES: ชื่อตัวละคร (display name §3.3) ที่ server ตั้งจาก character.name ตอน onJoin — client แสดง
   * ป้ายชื่อเหนือหัว (local + remote). guest/ไม่มีตัวละคร → default "ผู้เล่น" (server ไม่ leak id/sessionId).
   * client ไม่เคยส่งค่านี้ขึ้น server (server-authoritative). ค่าว่าง "" = ก่อน server init → client ซ่อนป้าย.
   */
  name: string;
  /**
   * P2-13 (D-056): server ตั้ง true เมื่อผู้เล่นนี้ idle ครบ `idleIndicatorSec` (ไม่มี movement/cast) →
   * client แสดงป้าย "AFK" เหนือหัวให้ผู้เล่นอื่นเห็น (โปร่งใส, ไม่มี disconnect). optional (default false) —
   * display-only, client ไม่เคยส่งค่านี้ขึ้น server (server-authoritative จาก input tracker).
   */
  isAfk?: boolean;
  /**
   * A1/A2 (COMBAT_BIBLE §2/§10): hp/maxHp ปัจจุบัน (server-authoritative). ride PlayerState schema — client
   * แสดงแถบ HP (E3) / death (E4). optional (default 0 = ก่อน server init) — client ไม่เคยส่งค่านี้ขึ้น server.
   */
  hp?: number;
  maxHp?: number;
}

// ── P2-07 inventory / equipment (server-authoritative mutation, TA §7/§8, Storage §22) ────────────────
//
// Client ส่ง **intent เท่านั้น** (instanceId + `expectedVersion` ที่เห็นล่าสุดจาก snapshot) — server ตัดสิน
// ทั้งหมด (optimistic lock + FOR UPDATE). server ส่ง MSG_INVENTORY_STATE ตอน join และหลังทุก mutation สำเร็จ;
// ปฏิเสธ → MSG_INVENTORY_OP_REJECTED (เงียบ ๆ ไม่ crash) แล้ว client re-sync จาก snapshot ล่าสุด.

/** section ของ item ใน snapshot — bag (กระเป๋า) หรือ equipment (สวมอยู่). ตรง ItemLocation §50.1. */
export type InventoryItemLocation = "CHARACTER_INVENTORY" | "CHARACTER_EQUIPMENT";

/**
 * มุมมองของ item instance 1 ชิ้นที่ client เห็น (P2-07). `version` = optimistic-lock ที่ client ต้องแนบกลับ
 * ใน intent ถัดไป (equip/unequip/move) เพื่อให้ server จับ stale/concurrent mutation. **ไม่มี stat/ค่า balance**
 * ในสายนี้ — stat ของ item เป็น server-authoritative Design Knob (item-catalog, server-only); client แสดงผล
 * จาก itemId ผ่าน view catalog แยก (งาน UI). slot = bag slot index หรือ equipment slot id (แยกด้วย location).
 */
export interface InventoryItemView {
  instanceId: string;
  itemId: string;
  location: InventoryItemLocation;
  slot: number;
  quantity: number;
  enhancementLevel: number;
  version: number;
}

/** snapshot ของ inventory + equipment ทั้งหมดของตัวละคร (server → client เดียว, P2-07). */
export interface InventorySnapshot {
  /** ความจุกระเป๋า (Storage §1.2 = 40) — bag slot อยู่ในช่วง [0, capacity). */
  capacity: number;
  /** item ในกระเป๋า (location CHARACTER_INVENTORY) เรียงตาม slot. */
  bag: InventoryItemView[];
  /** item ที่สวมอยู่ (location CHARACTER_EQUIPMENT) เรียงตาม equipment slot id. */
  equipment: InventoryItemView[];
}

/** message type: server → **client เดียว** — snapshot inventory/equipment (ตอน join + หลัง mutation สำเร็จ). */
export const MSG_INVENTORY_STATE = "inventory_state";

/** message type: client → server (intent) — สวม item จากกระเป๋า (server หา equip slot จาก item def เอง). */
export const MSG_EQUIP_ITEM = "equip_item";
/** message type: client → server (intent) — ถอด item ที่สวมอยู่กลับเข้ากระเป๋า (ช่องว่างแรก). */
export const MSG_UNEQUIP_ITEM = "unequip_item";
/** message type: client → server (intent) — ย้าย item ในกระเป๋าไปช่องอื่น (สลับกับของเดิมถ้าช่องไม่ว่าง). */
export const MSG_MOVE_ITEM = "move_item";

/** payload ของ MSG_EQUIP_ITEM / MSG_UNEQUIP_ITEM (client → server, P2-07). */
export interface EquipItemMessage {
  instanceId: string;
  /** version ที่ client เห็นล่าสุดของ instance นี้ (optimistic lock — server reject ถ้าไม่ตรง). */
  expectedVersion: number;
}

/** payload ของ MSG_MOVE_ITEM (client → server, P2-07). toSlot = bag slot ปลายทาง [0, capacity). */
export interface MoveItemMessage {
  instanceId: string;
  expectedVersion: number;
  toSlot: number;
}

/** ชนิดของ operation ที่ถูกปฏิเสธ (debug/UX) — client แยกเพื่อ log/แจ้งเตือน. */
export type InventoryOp = "equip" | "unequip" | "move";

/**
 * message type: server → **client เดียว** — item mutation ถูกปฏิเสธ (P2-07). เงียบ ๆ (ไม่ apply, ไม่ crash);
 * client ควร re-sync จาก MSG_INVENTORY_STATE ล่าสุด. reason ตรงกับ InventoryOpReason ฝั่ง server.
 */
export const MSG_INVENTORY_OP_REJECTED = "inventory_op_rejected";

/** payload ของ MSG_INVENTORY_OP_REJECTED (server → client เดียว, P2-07). */
export interface InventoryOpRejectedMessage {
  op: InventoryOp;
  /** "unknown_item"|"not_equippable"|"not_equipped"|"inventory_full"|"invalid_slot"|"unique_conflict"|"version_conflict" */
  reason: string;
}

// ── P2-10 guaranteed reinforcement (เสริมแกร่งการันตี +1, cap +15 · Reinforcement §2) ─────────────────
//
// Client ส่ง **intent เท่านั้น** (instanceId + expectedVersion ที่เห็นล่าสุด + idempotencyKey) — server ตัดสิน
// ทั้งหมด (validate → consume upg_reinforcement ×1 → +1 level, atomic, 100% สำเร็จ ไม่มี RNG). สำเร็จ → server
// ส่ง MSG_ENHANCE_RESULT (ok, level ใหม่) + MSG_INVENTORY_STATE (snapshot ใหม่ → item view + stat propagate);
// ปฏิเสธ → MSG_ENHANCE_RESULT (ok:false + reason). double-apply กันด้วย optimistic `version` (retry ที่ถือ
// expectedVersion เดิม = ITEM_LOCKED ไม่ +2). P2 ทั้งเฟส flag `noReinforcement` = true → reject NO_REINFORCEMENT.

/** message type: client → server (intent) — ขอเสริมแกร่ง equipment ที่ถืออยู่ +1 (P2-10). */
export const MSG_ENHANCE_ITEM = "enhance_item";

/** payload ของ MSG_ENHANCE_ITEM (client → server, P2-10). */
export interface EnhanceItemMessage {
  instanceId: string;
  /** version ที่ client เห็นล่าสุดของ instance นี้ (optimistic lock + retry guard). */
  expectedVersion: number;
  /** client transaction id — carried for telemetry; server ใช้ version lock เป็นตัวกัน double-apply. */
  idempotencyKey: string;
}

// ── P2-09 kill rewards (progression + loot notify · Economy §9/§11/§12) ───────────────────────────────
//
// server → **owning client เท่านั้น** หลังฆ่ามอนที่มีสิทธิ์ (§12 personal reward: gold/exp/loot ไม่ broadcast —
// เป็นข้อมูลส่วนตัว). แจ้ง level/exp/gold ที่เปลี่ยน + สรุป loot (toast §13.2) + overflow (inventory_full §12.5).
// การเปลี่ยนกระเป๋าจริงมาทาง MSG_INVENTORY_STATE (snapshot ใหม่) เหมือนเดิม — message นี้ = HUD/feedback เท่านั้น.

/** ยอด gold ที่ยังไม่ทราบ (session ไม่มี DB/ตัวละคร → ledger อ่านไม่ได้) — client แสดง gold เดิม ไม่ทับด้วย -1. */
export const GOLD_UNKNOWN = -1;

/** message type: server → **client เดียว** (P2-09) — progression + loot สรุปหลังฆ่ามอน. */
export const MSG_PLAYER_PROGRESS = "player_progress";

/** 1 รายการ loot ที่ได้/ตกหล่น (itemId + จำนวน) — client map เป็นชื่อ/ไอคอนผ่าน view catalog (งาน UI). */
export interface LootLine {
  itemId: string;
  quantity: number;
}

/**
 * B4 (Reinforcement §4.2): Field Boss reinforcement pity progress — ride MSG_PLAYER_PROGRESS หลังฆ่า Field Boss
 * (มีเฉพาะ boss kill; omit = ไม่ใช่ boss kill). client แสดง "ประกันบอส: pityCount/guaranteedAtClear" ใน panel เสริมแกร่ง.
 */
export interface ReinforcementProgress {
  /** clears-since-drop หลัง kill นี้ (§4.2) — 0 ทันทีหลังดรอป (reset). */
  pityCount: number;
  /** §4.2 guaranteedAtClear (15) — ตัวหารของแถบประกัน. */
  guaranteedAtClear: number;
}

/** payload ของ MSG_PLAYER_PROGRESS (server → client เดียว, P2-09). */
export interface PlayerProgressMessage {
  level: number;
  /** total cumulative EXP (§9.2). */
  exp: number;
  /** cumulative EXP ที่ level ปัจจุบันเริ่ม (floor ของแถบ) — 0 ที่ lv1. */
  expFloor: number;
  /** cumulative EXP ที่ต้องถึงเพื่อขึ้นเลเวลถัดไป (ceil ของแถบ) — 0 = ตันที่ cap (§9.1). */
  expCeil: number;
  /** ยอด gold ปัจจุบัน (จาก ledger) — GOLD_UNKNOWN เมื่ออ่านไม่ได้ (ไม่มี DB/ตัวละคร). */
  gold: number;
  /** true = เพิ่งข้ามเลเวล (client เล่น level-up feedback). */
  leveledUp: boolean;
  /** ของที่เข้ากระเป๋าจริงรอบนี้ (toast §13.2) — ว่างถ้าไม่มี. */
  loot: LootLine[];
  /**
   * ของที่กระเป๋าเต็มใส่ไม่ได้ **และ persist ไม่ได้** (ไม่มี DB) — §12.5 inventory_full (client เตือน). ว่างถ้าไม่มี.
   * เมื่อมี DB ของล้นจะไปเข้า Delivery Box แทน (`lootDelivered`) → field นี้ว่าง (ไม่มี silent loss).
   */
  lootOverflow: LootLine[];
  /** ของที่กระเป๋าเต็ม → เข้า Delivery Box แล้ว (§12.5 no-silent-loss, ITEM 2) — client แจ้ง "ส่งเข้ากล่องพัสดุ". ว่างถ้าไม่มี. */
  lootDelivered: LootLine[];
  /**
   * B4 (§4.2): Field Boss reinforcement pity progress — present ONLY after a Field Boss kill (server attaches it
   * for `boss_map1_boiling_boar`). omit = ไม่ใช่ boss kill (client เก็บค่าล่าสุดไว้แสดงใน panel เสริมแกร่ง). optional.
   */
  reinforcementProgress?: ReinforcementProgress;
}

/** message type: server → **client เดียว** — แจ้งรางวัล milestone ที่เพิ่งปลดล็อก (C1, Economy §18). */
export const MSG_MILESTONE_GRANTED = "milestone_granted";

/**
 * payload ของ MSG_MILESTONE_GRANTED (server → client เดียว, C1). ยิงครั้งเดียวตอน milestone ปลดล็อกสำเร็จ
 * (one-time per account, §18.2). `gold`/`exp` = จำนวนที่แจกรอบนี้ (delta ไม่ใช่ยอดรวม) — client โชว์ toast สั้น ๆ.
 */
export interface MilestoneGrantedMessage {
  milestoneId: string;
  /** Gold ที่แจก (§18.3 D-053) — 0 = ไม่มี. */
  gold: number;
  /** EXP ที่แจก (§18.1). */
  exp: number;
}

// ── C2b achievements (server-authoritative tracking + auto-claim · Achievement spec §4.2/§6/§7/§13) ────────
//
// Progress/rewards are server-authoritative (mob.killed derived fields computed server-side, never trusted from
// the client). Three additive message paths: unlock notify (server → client), a whitelisted client-reported
// event channel (title/none rewards only — §13 trust tradeoff), and a journal snapshot request/response.

/** message type: server → **client เดียว** — an achievement just auto-claimed → toast (C2b, spec §7.1). */
export const MSG_ACHIEVEMENT_UNLOCKED = "achievement_unlocked";

/**
 * payload ของ MSG_ACHIEVEMENT_UNLOCKED (server → client เดียว, C2b). ยิงครั้งเดียวตอนปลดล็อก (auto-claim,
 * one-time per scope). gold/titleId = reward ที่แจกรอบนี้ (0/omit = ไม่มี) — client โชว์ toast สั้น ๆ ตาม tier.
 */
export interface AchievementUnlockedMessage {
  achievementId: string;
  nameTh: string;
  /** "COMMON"|"UNCOMMON"|"HARD"|"EXTREME"|"MYSTERY"|"MEME" — client เลือกสี toast ตาม tier. */
  tier: string;
  /** Gold ที่แจก (§10 reward discipline: MEME/hidden = ไม่มี gold) — omit = ไม่มี. */
  gold?: number;
  /** title ที่บันทึกไว้ (ยังไม่มีระบบ title — journal อ่านต่อ) — omit = ไม่มี. */
  titleId?: string;
}

/**
 * message type: client → server — client-reported event (C2b Part 4). server whitelist + sanitize + rate-limit
 * (§13: cosmetic/meme achievements เท่านั้น — ห้ามมี gold/item). ชนิดที่รับ: npc.talk · ui.logo.click ·
 * weather.changed · phase.changed · weather.rain.tick. ชนิดนอก whitelist = server ทิ้งเงียบ ๆ.
 */
export const MSG_CLIENT_EVENT = "client_event";

/** payload ของ MSG_CLIENT_EVENT (client → server, C2b). server sanitize payload ตาม type (ไม่ trust ค่า). */
export interface ClientEventMessage {
  type: string;
  payload: Record<string, unknown>;
}

/** message type: client → server — ขอ snapshot achievement ทั้งหมด (journal C3 consume ต่อ, C2b Part 5). */
export const MSG_ACHIEVEMENTS_REQUEST = "achievements_request";

/** message type: server → **client เดียว** — snapshot achievement rows (ตอบ MSG_ACHIEVEMENTS_REQUEST, C2b). */
export const MSG_ACHIEVEMENTS_SNAPSHOT = "achievements_snapshot";

/** 1 แถว achievement ใน snapshot (C2b Part 5). nameTh = "???" เมื่อ hidden + ยังไม่ claim (§8.4 ไม่ spoil). */
export interface AchievementRow {
  id: string;
  nameTh: string;
  tier: string;
  category: string;
  /** "locked"|"in_progress"|"completed"|"claimed" (§4.2). */
  state: string;
  currentValue: number;
  target: number;
  gold?: number;
  titleId?: string;
}

/** payload ของ MSG_ACHIEVEMENTS_SNAPSHOT (server → client เดียว, C2b). rows = core shipping set (60 แถว). */
export interface AchievementsSnapshotMessage {
  rows: AchievementRow[];
}

/** message type: server → **client เดียว** — ผลการเสริมแกร่ง (สำเร็จ/ปฏิเสธ) (P2-10). */
export const MSG_ENHANCE_RESULT = "enhance_result";

/** payload ของ MSG_ENHANCE_RESULT (server → client เดียว, P2-10). */
export interface EnhanceResultMessage {
  ok: boolean;
  instanceId: string;
  /** enhancement level ใหม่เมื่อ ok=true (ปฏิเสธ = -1). */
  level: number;
  /** reason เมื่อ ok=false — "NO_ITEM"|"NO_REINFORCEMENT"|"MAX_LEVEL"|"ITEM_LOCKED" (§2.4 UI states). */
  reason?: string;
}

// ── B4 fragment exchange (เศษเสริมแกร่ง 5 → เสริมแกร่ง 1 · Reinforcement §3.5) ─────────────────────────────
//
// Client ส่ง **intent เท่านั้น** (instanceId ของ stack เศษ + expectedVersion ที่เห็นล่าสุด + idempotencyKey) —
// server ตัดสินทั้งหมด (validate ≥5 เศษ → consume 5 → grant 1 เสริมแกร่ง, atomic ผ่าน commitFragmentExchange).
// สำเร็จ → MSG_FRAGMENT_EXCHANGE_RESULT (ok, granted) + MSG_INVENTORY_STATE (snapshot ใหม่); ปฏิเสธ → ok:false +
// reason. double-apply กันด้วย optimistic `version` (retry ที่ถือ version เดิม = TRANSACTION_CONFLICT ไม่แลกซ้ำ).

/** message type: client → server (intent) — ขอแลกเศษเสริมแกร่ง 5 → เสริมแกร่ง 1 (B4). */
export const MSG_FRAGMENT_EXCHANGE = "fragment_exchange";

/** payload ของ MSG_FRAGMENT_EXCHANGE (client → server, B4). instanceId = stack เศษที่จะใช้จ่าย. */
export interface FragmentExchangeMessage {
  instanceId: string;
  /** version ที่ client เห็นล่าสุดของ stack เศษ (optimistic lock + retry guard). */
  expectedVersion: number;
  /** client transaction id — carried for telemetry; server ใช้ version lock เป็นตัวกัน double-apply. */
  idempotencyKey: string;
}

/** message type: server → **client เดียว** — ผลการแลกเศษ (สำเร็จ/ปฏิเสธ) (B4). */
export const MSG_FRAGMENT_EXCHANGE_RESULT = "fragment_exchange_result";

/** payload ของ MSG_FRAGMENT_EXCHANGE_RESULT (server → client เดียว, B4). */
export interface FragmentExchangeResultMessage {
  ok: boolean;
  /** จำนวนเสริมแกร่งที่ได้เมื่อ ok=true (ปฏิเสธ = 0). */
  granted: number;
  /** reason เมื่อ ok=false — "NO_DB"|"NOT_ENOUGH_FRAGMENTS"|"INVENTORY_FULL"|"TRANSACTION_CONFLICT". */
  reason?: string;
}

// ── P2-11 starter NPC shop (buy/sell ผ่าน ledger + inventory transaction · Economy §8 · Bible 3.5) ─────────
//
// Server-authoritative + idempotent (§8.3): client ส่ง **intent เท่านั้น** — ราคาทั้งหมด (buy/sell) เป็น
// server-side Design Knob (server/config/economy.ts) และ **ไม่ bundle เข้า client**; client รู้ราคาซื้อจาก
// MSG_SHOP_LIST เท่านั้น (server ตอบตาม map ที่ client อยู่ = starter district/city hub). ทุก mutation ตอบ
// MSG_SHOP_RESULT (ยอด gold authoritative หลังทำ) + ตามด้วย MSG_INVENTORY_STATE (snapshot ใหม่) เมื่อสำเร็จ.
// error code = Economy §23 (Shop). idempotency: buy = ledger idempotencyKey; sell = optimistic `version`.

/** message type: client → server — ขอ catalog ของร้านบน map ปัจจุบัน (P2-11). */
export const MSG_SHOP_LIST_REQUEST = "shop_list_request";

/** payload ของ MSG_SHOP_LIST_REQUEST (client → server). shopId optional (server ยึด map ปัจจุบันเป็นหลัก). */
export interface ShopListRequestMessage {
  shopId?: string;
}

/** 1 รายการซื้อในร้าน (server → client) — ราคา+เงื่อนไขปลดล็อกจาก config (client ไม่มีราคา). */
export interface ShopCatalogEntry {
  itemId: string;
  buyPrice: number;
  /** "immediate" | "shop_tutorial_complete" (§8.2) — client ใช้แสดงสถานะปลดล็อก. */
  unlockCondition: string;
}

/** message type: server → **client เดียว** — catalog ของร้าน (ตอบ MSG_SHOP_LIST_REQUEST, P2-11). */
export const MSG_SHOP_LIST = "shop_list";

/** payload ของ MSG_SHOP_LIST (server → client เดียว). `available` = false เมื่อ map นี้ไม่มีร้าน. */
export interface ShopListMessage {
  shopId: string;
  available: boolean;
  entries: ShopCatalogEntry[];
}

/** message type: client → server (intent) — ซื้อ item จากร้าน (P2-11). ราคา = server config (ไม่แนบมา). */
export const MSG_SHOP_BUY = "shop_buy";

/** payload ของ MSG_SHOP_BUY (client → server, P2-11). idempotencyKey = 1 transaction (กัน replay หักเงินซ้ำ). */
export interface ShopBuyMessage {
  shopId: string;
  itemId: string;
  quantity: number;
  idempotencyKey: string;
}

/** message type: client → server (intent) — ขาย item ที่ถืออยู่ให้ร้าน (P2-11). ราคาขาย = server config. */
export const MSG_SHOP_SELL = "shop_sell";

/** payload ของ MSG_SHOP_SELL (client → server, P2-11). expectedVersion = optimistic lock (กัน stale/concurrent). */
export interface ShopSellMessage {
  shopId: string;
  instanceId: string;
  expectedVersion: number;
  quantity: number;
  idempotencyKey: string;
}

// ── P2-17 personal storage + delivery box (server-authoritative, idempotent · Storage §10–§16/§22) ────────
//
// Storage = account-shared 200 slots (§10.1); a deposited item is visible to every character on the account.
// Client ส่ง **intent เท่านั้น** (instanceId + expectedVersion + idempotencyKey) — server ตัดสิน (policy จาก
// config + optimistic lock + capacity, ทุก move idempotent ผ่าน storage_transaction_log; replay = no-op ผลเดิม).
// server เปิดคลังตอบ MSG_STORAGE_STATE + MSG_DELIVERY_STATE; หลัง deposit/withdraw สำเร็จ ส่ง MSG_STORAGE_STATE
// + MSG_INVENTORY_STATE ใหม่; ปฏิเสธ → MSG_STORAGE_RESULT ok:false + reason. เข้าถึงได้เฉพาะ map ที่มี storage
// NPC (§10.4 safe town) — off-map = available:false (client ซ่อนปุ่ม เหมือน shop).

/** fill state ของคลัง (§15.1): normal <80% · warn ≥80% · alert ≥90% · full = 100% (ไม่มีช่องว่าง). */
export type StorageFillState = "normal" | "warn" | "alert" | "full";

/** มุมมองของ item 1 ชิ้นในคลัง (§11.1). location = ACCOUNT_STORAGE เสมอ. version = optimistic lock ที่ client แนบกลับตอน withdraw. */
export interface StorageItemView {
  instanceId: string;
  itemId: string;
  /** storage index (จัดเรียงช่อง). */
  slot: number;
  quantity: number;
  enhancementLevel: number;
  version: number;
}

/** message type: client → server — เปิดคลัง (+ delivery) บน map ปัจจุบัน (P2-17). server ตอบ 2 snapshot. */
export const MSG_STORAGE_OPEN = "storage_open";

/** message type: server → **client เดียว** — snapshot คลังบัญชี (ตอน open + หลัง deposit/withdraw สำเร็จ). */
export const MSG_STORAGE_STATE = "storage_state";

/**
 * payload ของ MSG_STORAGE_STATE (server → client เดียว, P2-17). `available` = false เมื่อ map นี้ไม่มี storage
 * NPC (§10.4) → client ซ่อน UI. `used`/`capacity` = §10.1 (200); `fillState` = §15.1 (server คำนวณให้).
 */
export interface StorageStateMessage {
  available: boolean;
  capacity: number;
  used: number;
  fillState: StorageFillState;
  items: StorageItemView[];
}

/** message type: client → server (intent) — ฝากของจากกระเป๋าเข้าคลัง (§13). */
export const MSG_STORAGE_DEPOSIT = "storage_deposit";
/** message type: client → server (intent) — ถอนของจากคลังกลับกระเป๋า (§14). */
export const MSG_STORAGE_WITHDRAW = "storage_withdraw";

/** payload ของ MSG_STORAGE_DEPOSIT / MSG_STORAGE_WITHDRAW (client → server, P2-17). */
export interface StorageMoveMessage {
  instanceId: string;
  /** version ที่ client เห็นล่าสุด (optimistic lock). */
  expectedVersion: number;
  /** client transaction id → idempotency (replay = no-op ผลเดิม, §22). */
  idempotencyKey: string;
}

/** ชนิด operation ของคลังที่ตอบกลับ. */
export type StorageOp = "deposit" | "withdraw";

/** message type: server → **client เดียว** — ผล deposit/withdraw (สำเร็จ/ปฏิเสธ) (P2-17). */
export const MSG_STORAGE_RESULT = "storage_result";

/**
 * payload ของ MSG_STORAGE_RESULT (server → client เดียว, P2-17). ปฏิเสธ reason (§13.2/§14):
 * "STORAGE_UNAVAILABLE"|"NO_ITEM"|"ITEM_BOUND"|"ITEM_EQUIPPED"|"STORAGE_FULL"|"INVENTORY_FULL"|"ITEM_CHANGED"|
 * "TRANSACTION_CONFLICT". สำเร็จ → snapshot ใหม่มาทาง MSG_STORAGE_STATE + MSG_INVENTORY_STATE.
 */
export interface StorageResultMessage {
  op: StorageOp;
  ok: boolean;
  instanceId: string;
  reason?: string;
}

/** สถานะแจ้งเตือนหมดอายุของ delivery entry (§16.4) — server คำนวณจาก expiresAt vs now. */
export type DeliveryEntryStatus = "none" | "expiring_soon" | "expiring_urgent" | "expired";

/** มุมมองของ delivery entry 1 รายการ (§16.6) — item preview + สถานะหมดอายุที่ server คำนวณ. */
export interface DeliveryEntryView {
  entryId: string;
  /** DeliverySource (schema enum) — client map เป็น label. */
  source: string;
  items: LootLine[];
  /** "unclaimed" | "claimed". */
  claimStatus: string;
  /** ISO timestamp หมดอายุ (§16.4) — null = ไม่หมดอายุ. */
  expiresAt: string | null;
  /** สถานะแจ้งเตือน (§16.4 7วัน/1วัน) — server คำนวณ (ห้ามหมดเงียบ). */
  status: DeliveryEntryStatus;
}

/** message type: server → **client เดียว** — snapshot Delivery Box (ตอน open + หลัง claim สำเร็จ). */
export const MSG_DELIVERY_STATE = "delivery_state";

/** payload ของ MSG_DELIVERY_STATE (server → client เดียว, P2-17). `available` = ตาม map เดียวกับ storage. */
export interface DeliveryStateMessage {
  available: boolean;
  /** §16.3 = 50. */
  maxEntries: number;
  used: number;
  entries: DeliveryEntryView[];
}

/** message type: client → server (intent) — รับของจาก delivery entry เข้ากระเป๋า (§16.5). */
export const MSG_DELIVERY_CLAIM = "delivery_claim";

/** payload ของ MSG_DELIVERY_CLAIM (client → server, P2-17). idempotencyKey = กัน claim ซ้ำ. */
export interface DeliveryClaimMessage {
  entryId: string;
  idempotencyKey: string;
}

/** message type: server → **client เดียว** — ผล claim (สำเร็จ/ปฏิเสธ) (P2-17). */
export const MSG_DELIVERY_RESULT = "delivery_result";

/**
 * payload ของ MSG_DELIVERY_RESULT (server → client เดียว, P2-17). ปฏิเสธ reason (§16.4/§16.5):
 * "STORAGE_UNAVAILABLE"|"NOT_FOUND"|"EXPIRED"|"INVENTORY_FULL"|"TRANSACTION_CONFLICT". สำเร็จ → `granted` +
 * snapshot ใหม่มาทาง MSG_DELIVERY_STATE + MSG_INVENTORY_STATE.
 */
export interface DeliveryResultMessage {
  ok: boolean;
  entryId: string;
  /** ของที่เข้ากระเป๋าจริงเมื่อ ok=true (client toast). ว่างเมื่อปฏิเสธ. */
  granted: LootLine[];
  reason?: string;
}

/** ชนิด operation ของร้านที่ตอบกลับ (client แยก UI). */
export type ShopOp = "buy" | "sell";

/** message type: server → **client เดียว** — ผลซื้อ/ขาย (สำเร็จ/ปฏิเสธ) (P2-11). */
export const MSG_SHOP_RESULT = "shop_result";

/**
 * payload ของ MSG_SHOP_RESULT (server → client เดียว, P2-11). สำเร็จ → บอก quantity ที่ทำจริง + ยอด gold
 * authoritative หลังทำ (client อัปเดตแถบเงิน; snapshot กระเป๋ามาทาง MSG_INVENTORY_STATE). ปฏิเสธ → reason =
 * Economy §23 shop error code ("SHOP_ITEM_NOT_FOUND"|"SHOP_LOCKED"|"INSUFFICIENT_GOLD"|"INVENTORY_FULL"|
 * "ITEM_UNSELLABLE"|"ITEM_EQUIPPED"|"TRANSACTION_CONFLICT"). gold = GOLD_UNKNOWN เมื่ออ่านยอดไม่ได้.
 */
export interface ShopResultMessage {
  op: ShopOp;
  ok: boolean;
  itemId: string;
  /** จำนวนที่ทำรายการจริง (ซื้อ = ที่เข้ากระเป๋า, ขาย = ที่หักออก); 0 เมื่อปฏิเสธ. */
  quantity: number;
  /** ยอด gold ปัจจุบันหลังรายการ (จาก ledger) — GOLD_UNKNOWN เมื่ออ่านไม่ได้. */
  gold: number;
  /** Economy §23 shop error code เมื่อ ok=false. */
  reason?: string;
}
