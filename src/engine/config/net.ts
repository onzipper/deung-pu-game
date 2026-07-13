// Config: net — snapshot interpolation, realtime/network, reconnect, movement validation, persistence.
// Design Knob values + their types. Plain TS only.

import { DEFAULT_PARTY_ID, MAP_ROOM_NAME } from "@/shared/net-protocol";

/**
 * Snapshot interpolation knob (P1-01, TA §6). กำหนดพฤติกรรม "render ย้อนหลัง" ของ remote entity
 * ผ่าน interpolation buffer (src/engine/net/interpolation.ts). ทุกค่าเป็น Design Knob.
 */
export interface NetInterpolationConfig {
  /**
   * ระยะเวลา (ms) ที่ remote entity render ย้อนหลังจากเวลาปัจจุบัน — TA §6 แนะนำ ~100–150ms.
   * ยิ่งมาก = ทน jitter/packet loss ได้ดี แต่ latency ที่ตาเห็นมากขึ้น. ควร ≥ 1 broadcast interval + margin.
   */
  bufferMs: number;
  /**
   * ระยะเวลาสูงสุด (ms) ที่ยอมให้ extrapolate เลย snapshot ล่าสุดตอน buffer starved ก่อน freeze.
   * ตั้งเล็ก (~1 interval) เพื่อกันตัวละครลอยไกลเกินจริงเมื่อ packet หาย.
   */
  maxExtrapolationMs: number;
  /** ขนาด ring buffer ต่อ entity (จำนวน snapshot สูงสุด) — ต้อง ≥ 2; เผื่อ jitter หลาย interval */
  bufferCapacity: number;
  /** อัตรา broadcast ที่คาดจาก server (Hz) — ใช้ documentation/tuning (ควรตรง positionSyncHz ฝั่งส่ง) */
  expectedSnapshotRateHz: number;
}

/**
 * Realtime/network knob (P0-07, interpolation P1-01). ทุกค่าปรับได้ที่นี่ (Design Knob discipline).
 * P0 = local dev เท่านั้น; serverUrl override ได้ผ่าน env ตอน bootstrap (GameCanvas).
 */
export interface NetConfig {
  /** เปิด/ปิด realtime ทั้งหมด — false = solo ล้วน (ไม่ connect) */
  enabled: boolean;
  /** ws endpoint ของ Colyseus (default local dev) */
  serverUrl: string;
  /** ชื่อ room (ต้องตรง server) — default = MAP_ROOM_NAME */
  roomName: string;
  /**
   * partyId ที่ client ส่งใน joinOptions (P1-08, §59.3) — "" = solo. server ใช้ filterBy(['mapId','partyId'])
   * ให้สมาชิก party เดียวกันลง channel เดียวกันอัตโนมัติ. dev override ผ่าน URL `?party=xyz` (app.ts).
   */
  partyId: string;
  /**
   * **server knob** (P1-08) — จำนวนผู้เล่นสูงสุดต่อ solo channel ก่อน auto-assign เปิด channel ใหม่
   * (Colyseus maxClients → room auto-lock ที่ cap → matchmaking สร้าง room ใหม่ = CH.2). อ่านฝั่ง server
   * (MapRoom.onCreate) เป็น single source of truth; env `CHANNEL_CAPACITY` override เฉพาะ dev/test.
   */
  channelCapacity: number;
  /**
   * **server knob** (P1-11, TA §6) — cap ของ solo channel สำหรับ **safe zone (เมือง)** — สูงกว่า field
   * เพราะไม่มี combat load (TA §6 "cap สูงกว่า ~80–100"). MapRoom เลือก cap นี้เมื่อ map.zoneType==="safe"
   * (แทน channelCapacity). env `CITY_HUB_CAPACITY` override เฉพาะ dev/test.
   */
  cityHubCapacity: number;
  /**
   * **server knob** (P1-08) — cap ของ party channel (room ที่ partyId ≠ "") — party สำคัญกว่า solo
   * auto-assign (§59.3) → cap = ขนาด party สูงสุด (GS §16 = 6) เพื่อไม่ให้สมาชิกถูกแยก channel.
   * env `PARTY_CHANNEL_CAPACITY` override เฉพาะ dev/test.
   */
  partyChannelCapacity: number;
  /** อัตราส่ง position ขึ้น server (Hz) — tech §6 แนะนำ 10–15Hz */
  positionSyncHz: number;
  /** ระยะ (tile) ที่ต้องขยับเกินถึงจะส่ง — กัน spam idle frame */
  sendEpsilon: number;
  /** snapshot interpolation ของ remote entity (P1-01) — render ย้อนหลัง ~100–150ms จาก buffer */
  interpolation: NetInterpolationConfig;
  /** สีตัว remote player (แยกจาก local ด้วยตา) */
  remotePlayerColor: number;
  /** สี accent (ไหล่) ของ remote player */
  remotePlayerAccentColor: number;
}

/**
 * Client auto-reconnect retry/backoff (P1-07, GS §59.1 · TA §6) — ตอน ws หลุด client พยายาม
 * reconnect เข้า seat เดิม (reconnection token) ด้วย exponential backoff จนกว่าจะสำเร็จ/หมดสิทธิ์.
 * ทุกค่าเป็น Design Knob. ควรตั้งให้ cumulative backoff ครอบ grace window (จะได้ retry ทันใน grace).
 */
export interface ReconnectClientRetryConfig {
  /** จำนวนครั้งพยายาม reconnect อัตโนมัติก่อนยอมแพ้ (→ fresh join ที่ safe camp / offline) */
  maxAttempts: number;
  /** ดีเลย์ก่อน retry ครั้งแรก (ms) */
  baseDelayMs: number;
  /** ตัวคูณ backoff แบบ exponential ต่อครั้ง (≥ 1) */
  backoffFactor: number;
  /** เพดานดีเลย์ต่อครั้ง (ms) — กัน backoff บวมเกิน grace window */
  maxDelayMs: number;
}

/**
 * Reconnect knob (P1-07, GS §59.1 · TA §6) — **mirror client/server** เหมือน movementValidation:
 *   server อ่าน `graceSeconds` (allowReconnection hold state), client อ่าน `clientRetry` (auto-reconnect).
 * single source of truth = DEFAULT_ENGINE_CONFIG. graceSeconds ฝั่ง server override ได้ผ่าน env
 * `RECONNECT_GRACE_SECONDS` **สำหรับ dev/test เท่านั้น** (เช่นตั้ง 2 วิ พิสูจน์ grace expiry ใน proof).
 * ทุกค่าเป็น Design Knob.
 */
export interface ReconnectConfig {
  /**
   * server hold state หลัง disconnect ไม่ตั้งใจ (วินาที, §59.1 = 30). reconnect ทันในนี้ + ตำแหน่งเดิม
   * valid → กลับ room/channel/ตำแหน่งเดิม; เกิน/room ปิด/ตำแหน่ง invalid → spawn ใหม่ที่ safe camp.
   */
  graceSeconds: number;
  /** client auto-reconnect retry/backoff */
  clientRetry: ReconnectClientRetryConfig;
  /**
   * **client knob** (P1-07-fix) — key ของ per-tab sessionStorage ที่เก็บ reconnection token ข้าม page
   * reload (refresh/reopen → reconnect เข้า seat เดิม, §59.1). **ต้องเป็น sessionStorage ไม่ใช่ localStorage**
   * (2 แท็บจะแย่ง token กัน). เปลี่ยน key = แยก namespace ได้ (dev/staging บน origin เดียวกัน).
   */
  sessionStorageKey: string;
}

/**
 * Movement validation knob (P1-02, TA §6/§7/§16.3) — server-authoritative movement.
 * **Mirror ทั้ง client/server**: server อ่านค่าเดียวกันจาก DEFAULT_ENGINE_CONFIG (ไฟล์นี้ compile
 * ร่วมกัน — single source of truth; client bootstrap ไม่ override movement knob เหล่านี้). ทุกค่าเป็น Design Knob.
 *
 * ใช้กับ validateMove() (src/shared/movement-validation.ts) — กติกา: server รับ position update
 * จาก client แล้ว validate (1) speed cap (2) walkable (3) teleport; ผิด → snap กลับ (ไม่แบน, TA §16.3).
 */
export interface MovementValidationConfig {
  /**
   * ตัวคูณ headroom บน speed cap กัน network jitter/burst (≥ 1). ระยะสูงสุดที่ยอมต่อ update =
   * playerSpeed × elapsedSec × factor. สูงไป = จับ speed hack ยากขึ้น; ต่ำไป = false positive ตอน jitter.
   */
  speedToleranceFactor: number;
  /**
   * ระยะ (tile, euclidean) ที่ single update เกินแล้วถือเป็น teleport ชัดเจน → correction ทันที
   * (hard cap อิสระจาก elapsed — กัน exploit สะสม allowance ตอน gap ยาว). ปกติ 1 update ≤ ~0.5 tile.
   */
  teleportThresholdTiles: number;
  /** ระยะเวลาขั้นต่ำ (ms) ระหว่างส่ง correction ต่อ player — กัน flood correction message (0 = ไม่จำกัด) */
  correctionCooldownMs: number;
  /**
   * elapsed (ms) ขั้นต่ำที่ใช้คำนวณ speed cap — clamp floor กัน divide-by-tiny/allowance≈0 ตอน
   * สอง message มาชิดกัน/clock skew (elapsed 0 หรือติดลบ).
   *
   * **ต้อง ≥ 1 send interval (83ms @12Hz)**: บนเน็ตจริง/free-tier CPU สะดุด message ก้าวเต็ม 1 ก้าว
   * (delta = speed/sendHz = 4/12 ≈ 0.333 tile) มาถึงชิดกันเป็นก้อน (arrival compression) → elapsed ที่
   * server วัดได้ ≈ 0 → clamp ขึ้น floor. ถ้า floor < interval, allowance ที่ floor < 1 ก้าวเต็ม →
   * reject reason=speed → correction → client กระตุกแล้วหยุด (พิสูจน์บน prod 2026-07-12). ที่ floor 90ms
   * allowance = 4×0.09×1.5 = 0.54 ≥ 0.333 → 1 ก้าวเต็มผ่านเสมอ. anti-teleport ยังคุมด้วย
   * teleportThresholdTiles (absolute cap อิสระจาก elapsed) → เพิ่ม floor ไม่เปิดช่อง speed hack.
   */
  minElapsedMs: number;
  /**
   * elapsed (ms) สูงสุดที่ใช้คำนวณ speed cap — clamp ceiling กัน allowance บวมตอน gap ยาว
   * (tab หลับ/packet หายหลาย interval) ซึ่งเปิดช่องให้ teleport ผ่าน speed cap.
   */
  maxElapsedMs: number;
}

/**
 * AFK / background-tab knob (P2-13, GS §59.1.3 · D-056) — **server knob** (อ่านฝั่ง realtime process
 * MapRoom, เหมือน persistence/graceSeconds). D-056 = "AFK ค้างเต็มที่ ไม่มี forced disconnect": server
 * ถือ character เป็น entity ต่อ, แค่ตั้งป้าย AFK ให้ผู้เล่นอื่นเห็นเมื่อ idle นาน. ทุกค่าเป็น Design Knob.
 * อยู่ใน EngineConfig (single source of truth) แม้ client ไม่ได้อ่าน — number/null เฉย ๆ ไม่รั่ว balance.
 */
export interface AfkConfig {
  /**
   * ไม่มี input (movement/cast) ครบ N วินาที → server ตั้ง `PlayerState.isAfk = true` (ป้าย "AFK" ให้ผู้เล่น
   * อื่นเห็น, D-056 = 60). reset เป็น false ทันทีที่มี input. ≤ 0 = ปิด (ไม่ตั้งป้าย). **ไม่มี disconnect**.
   */
  idleIndicatorSec: number;
  /**
   * เพดานชั่วโมงที่ยอมให้ connection ค้าง (idle) ก่อนถูกเอาออก — **null = ปิด (inert ใน P2, D-056)**: ไม่ cap
   * connection ค้าง. เดินสาย knob + จุดเช็คใน MapRoom ไว้ **พร้อมแต่ไม่ทำงาน** → ทบทวนก่อน open alpha เมื่อ
   * รู้ concurrency จริง (Render free tier). > 0 เท่านั้นถึงจะ active; null/0 = ไม่มีวันตัด.
   */
  afkHardCapHours: number | null;
}

/**
 * Persistence knob (P2-05, Storage §24 · TA §8) — **server knob** (อ่านฝั่ง realtime process MapRoom).
 * character position/map ถูก save เป็นระยะระหว่างเล่น (นอกเหนือ save ตอน transition/leave) — ตาราง
 * `character_state` แยกมาเพื่อ hot write (TA §8 "DB เฉพาะผลลัพธ์ batched"). ทุกค่าเป็น Design Knob.
 * อยู่ใน EngineConfig (single source of truth เดียวกับ knob อื่น) แม้ client ไม่ได้ใช้ — number เฉย ๆ ไม่รั่ว balance.
 */
export interface PersistenceConfig {
  /**
   * ระยะห่างขั้นต่ำ (ms) ระหว่าง save CharacterState ต่อผู้เล่น — throttle hot write. save ตอน
   * transition/leave บังคับเขียน (force) แต่ยัง respect ตัวนี้เพื่อกันเขียนถี่ซ้อนกับ interval รอบก่อน.
   * ~30s (ตรงกับ session-lease heartbeat) — ปรับได้ที่นี่.
   */
  saveIntervalMs: number;
}

export const DEFAULT_MOVEMENT_VALIDATION_CONFIG: MovementValidationConfig = {
  // 1.5 = เผื่อ 50% กัน jitter/burst; ที่ speed 4 tile/s, 1 interval (~83ms @12Hz) allowance ≈ 0.5 tile
  speedToleranceFactor: 1.5,
  // 3 tile — 1 update ปกติ ≤ ~0.5 tile → 3 = teleport ชัดเจน (hard cap อิสระจาก elapsed)
  teleportThresholdTiles: 3,
  // 250ms — ไม่ยิง correction ถี่กว่านี้ต่อ player (กัน flood ตอน client โกงรัว)
  correctionCooldownMs: 250,
  // 90ms — floor ต้อง ≥ 1 send interval (83ms @12Hz) เพื่อให้ 1 ก้าวเต็ม (delta≈0.333) ที่มาถึงชิดกัน
  // (arrival compression บนเน็ต/CPU สะดุด) ยังผ่าน: allowance@floor = 4×0.09×1.5 = 0.54 ≥ 0.333.
  // แก้ prod bug "เดินกระตุกแล้วหยุด" (2026-07-12) — anti-teleport ยังคุมด้วย teleportThresholdTiles.
  minElapsedMs: 90,
  // 1000ms — ceiling กัน allowance บวมตอน gap ยาว (tab หลับ) เปิดช่องให้ teleport ผ่าน speed cap
  maxElapsedMs: 1000,
};

/** Persistence defaults (P2-05, Storage §24) — save CharacterState ทุก ~30s (ตรง session-lease heartbeat). */
export const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  saveIntervalMs: 30_000,
};

/**
 * AFK defaults (P2-13, D-056) — ป้าย AFK หลัง idle 60s; ไม่มี hard cap connection ค้าง (null = inert P2).
 */
export const DEFAULT_AFK_CONFIG: AfkConfig = {
  idleIndicatorSec: 60, // D-056: no input 60s → ป้าย AFK ให้ผู้เล่นอื่นเห็น
  afkHardCapHours: null, // D-056: inert ใน P2 — ไม่ cap connection ค้าง (ทบทวนก่อน open alpha)
};

export const DEFAULT_NET_CONFIG: NetConfig = {
  enabled: true,
  serverUrl: "ws://localhost:2567",
  roomName: MAP_ROOM_NAME,
  partyId: DEFAULT_PARTY_ID, // "" = solo (dev override ผ่าน ?party=xyz)
  channelCapacity: 8, // dev default (§59.3 auto-assign) — production tune ทีหลัง; proof ตั้ง 2 ผ่าน env
  cityHubCapacity: 80, // P1-11 (TA §6): safe zone (เมือง) รับได้มากกว่า field เพราะไม่มี combat (~80–100)
  partyChannelCapacity: 6, // = ขนาด party สูงสุด (GS §16) → party ไม่ถูกแยก channel
  positionSyncHz: 12, // 10–15Hz (tech §6) — 12 = กลางช่วง
  sendEpsilon: 0.02, // tile — ต่ำกว่านี้ = ผู้เล่นแทบไม่ขยับ, ไม่ต้องส่ง
  interpolation: {
    bufferMs: 120, // ~100–150ms (TA §6) — 120 = 1 interval(83ms @12Hz) + jitter margin
    maxExtrapolationMs: 100, // ~1 broadcast interval — extrapolate สั้น ๆ แล้ว freeze
    bufferCapacity: 16, // เผื่อ jitter หลาย interval (12Hz → 16 snapshot ≈ 1.3s ประวัติ)
    expectedSnapshotRateHz: 12, // = positionSyncHz ฝั่งส่ง
  },
  remotePlayerColor: 0x4aa3ff, // ฟ้า = คนอื่น (local = เหลือง)
  remotePlayerAccentColor: 0x1b5fa8,
};

/**
 * Reconnect defaults (P1-07, GS §59.1 = 30s grace). clientRetry backoff (0.5→1→2→4→8→8s) สะสม ≈ 23.5s
 * ครอบ 30s grace → มีสิทธิ์ retry สำเร็จก่อนหมด grace. graceSeconds override ได้ผ่าน env (dev/test).
 */
export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  graceSeconds: 30, // §59.1 30s grace
  clientRetry: {
    maxAttempts: 6,
    baseDelayMs: 500,
    backoffFactor: 2,
    maxDelayMs: 8000,
  },
  sessionStorageKey: "deungpu:rt-reconnect", // per-tab (sessionStorage) — ห้าม localStorage (แท็บแย่ง token)
};
