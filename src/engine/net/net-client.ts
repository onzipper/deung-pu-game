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
// P1-07-fix **cross-reload reconnect** (refresh/reopen tab): เดิม token อยู่ใน memory เท่านั้น →
//   refresh = token หาย → join เป็นผู้เล่นใหม่ + server hold ghost seat 30s → refresh สะสมผีจนห้องเต็ม
//   → 2 แท็บโดนแยก channel = มองไม่เห็นกัน. แก้: persist token ลง **per-tab store** (sessionStorage,
//   inject ผ่าน config.store) ทุกครั้งที่ wire สำเร็จ + re-persist timestamp ตอน pagehide (ไม่ leave).
//   boot: มี token สด (planRejoin: ตรง server/map/party + อายุ < grace) → `client.reconnect(token)` ก่อน
//   = reclaim ghost seat เดิม (ตำแหน่ง/channel เดิมกลับมา) แทนเพิ่มผู้เล่นใหม่; ล้มเหลว → ล้าง token +
//   fresh join. consented leave (disconnect: SPA nav / map transition) = ล้าง token (ไม่ดึงกลับ map เก่า).
//
// P0 ยังไม่ทำ: auth/JWT, party sync — จด TODO ชี้ spec.

import { Client, getStateCallbacks, type Room } from "colyseus.js";
import {
  planRejoin,
  reconnectBackoffMs,
  shouldRetryReconnect,
  type StoredReconnectRecord,
} from "@/shared/reconnect";
import type { ReconnectStore } from "@/engine/net/reconnect-store";
import type { ReconnectClientRetryConfig } from "@/engine/config";
import {
  MAP_ROOM_NAME,
  MSG_CAST_SKILL,
  MSG_CAST_REJECTED,
  MSG_ENHANCE_ITEM,
  MSG_ENHANCE_RESULT,
  MSG_FRAGMENT_EXCHANGE,
  MSG_FRAGMENT_EXCHANGE_RESULT,
  MSG_EQUIP_ITEM,
  MSG_INVENTORY_OP_REJECTED,
  MSG_INVENTORY_STATE,
  MSG_MAP_TRANSITION,
  MSG_MOVE,
  MSG_MOVE_ITEM,
  MSG_PLAYER_PROGRESS,
  MSG_MILESTONE_GRANTED,
  MSG_PLAYER_DAMAGED,
  MSG_PLAYER_DEATH,
  MSG_PLAYER_RESPAWN,
  MSG_POSITION_CORRECTION,
  MSG_DELIVERY_CLAIM,
  MSG_DELIVERY_RESULT,
  MSG_DELIVERY_STATE,
  MSG_SHOP_BUY,
  MSG_SHOP_LIST,
  MSG_SHOP_LIST_REQUEST,
  MSG_SHOP_RESULT,
  MSG_SHOP_SELL,
  MSG_SKILL_RESULT,
  MSG_STORAGE_DEPOSIT,
  MSG_STORAGE_OPEN,
  MSG_STORAGE_RESULT,
  MSG_STORAGE_STATE,
  MSG_STORAGE_WITHDRAW,
  MSG_UNEQUIP_ITEM,
  MSG_USE_ITEM,
  MSG_USE_ITEM_RESULT,
  MSG_ACHIEVEMENT_UNLOCKED,
  MSG_CLIENT_EVENT,
  MSG_ACHIEVEMENTS_REQUEST,
  MSG_ACHIEVEMENTS_SNAPSHOT,
  MSG_BOT_PROFILE_LIST,
  MSG_BOT_PROFILE_CREATE,
  MSG_BOT_PROFILE_UPDATE,
  MSG_BOT_PROFILE_DELETE,
  MSG_BOT_START,
  MSG_BOT_STOP,
  MSG_BOT_TAKEOVER,
  MSG_BOT_RESUME,
  MSG_BOT_MOCK_PURCHASE,
  MSG_BOT_REPORT_LIST,
  MSG_BOT_REPORT_FETCH,
  MSG_BOT_PROFILES,
  MSG_BOT_TIER_STATE,
  MSG_BOT_STATUS,
  MSG_BOT_STOPPED,
  MSG_BOT_ALERT,
  MSG_BOT_REPORTS,
  MSG_BOT_REPORT,
  MSG_BOT_OP_RESULT,
  MSG_BOT_CHECKPOINT,
  WS_CLOSE_SESSION_TAKEN_OVER,
  type AchievementUnlockedMessage,
  type AchievementsSnapshotMessage,
  type ClientEventMessage,
  type CastRejectedMessage,
  type CastSkillMessage,
  type DeliveryClaimMessage,
  type DeliveryResultMessage,
  type DeliveryStateMessage,
  type EnhanceItemMessage,
  type EnhanceResultMessage,
  type FragmentExchangeMessage,
  type FragmentExchangeResultMessage,
  type EquipItemMessage,
  type InventoryOpRejectedMessage,
  type InventorySnapshot,
  type JoinOptions,
  type MapTransitionMessage,
  type MobSnapshot,
  type MoveItemMessage,
  type MoveMessage,
  type PlayerProgressMessage,
  type MilestoneGrantedMessage,
  type PlayerDamagedMessage,
  type PlayerDeathMessage,
  type PlayerRespawnMessage,
  type PlayerSnapshot,
  type PositionCorrectionMessage,
  type ShopBuyMessage,
  type ShopListMessage,
  type ShopListRequestMessage,
  type ShopResultMessage,
  type ShopSellMessage,
  type SkillResultMessage,
  type StorageMoveMessage,
  type StorageResultMessage,
  type StorageStateMessage,
  type UseItemMessage,
  type UseItemResultMessage,
  type BotProfileCreateMessage,
  type BotProfileUpdateMessage,
  type BotProfileDeleteMessage,
  type BotStartMessage,
  type BotStopMessage,
  type BotTakeoverMessage,
  type BotResumeMessage,
  type BotMockPurchaseMessage,
  type BotReportFetchMessage,
  type BotProfilesMessage,
  type BotTierStateMessage,
  type BotStatusMessage,
  type BotStoppedMessage,
  type BotAlertMessage,
  type BotReportsMessage,
  type BotReportMessage,
  type BotOpResultMessage,
  type BotCheckpointMessage,
} from "@/shared/net-protocol";
import {
  canSendLocalMove,
  coerceAnim,
  coerceDirection,
  computePlayerCount,
  parseCharacterActorRoomRedirect,
  isCharacterWorldCapacityError,
  resolveSelfActorId,
  type ConnectionState,
} from "@/engine/net/sync";

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
  /** จำนวน cast ที่ server ปฏิเสธ (P1-05, MSG_CAST_REJECTED) — สะสมตลอด session (debug: ตีแล้วโดนปฏิเสธ) */
  castRejectCount: number;
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
  /** จำนวน cast ที่ถูกปฏิเสธสะสม (P1-05) — >0 = ตีแล้ว server ปฏิเสธ (cooldown/range/safe zone) */
  castRejectCount: number;
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
  /**
   * P1-10 (§57.3): server สั่งข้าม map (player เดินเข้า exit area, server-authoritative) → caller
   * teardown world เดิม + join room map ปลายทางที่ targetSpawn (fade). optional.
   */
  onMapTransition?(msg: MapTransitionMessage): void;
  /**
   * Fix issue #1/#2: หลัง join/reconnect สำเร็จ + self เข้า room state ครั้งแรก (immediate หรือ patch แรก)
   * → server = source of truth ของตำแหน่ง spawn/held → caller **snap local player + camera** ไปตำแหน่งนี้
   * ทันที (ก่อนส่ง move ก้าวแรก). fresh join = spawn จริง (idempotent) · reconnect within grace = ตำแหน่ง
   * เดิมก่อน refresh (กัน "วาร์ปกลับ" + กัน exit detection พลาดเพราะ desync). ยิงครั้งเดียวต่อ 1 connection. optional.
   */
  onSelfSpawn?(snap: PlayerSnapshot): void;
  /** True while server-side Character Autonomy owns this same actor; local prediction must stay locked. */
  onSelfAutonomyChange?(active: boolean): void;
  /** While Character Autonomy owns self, follow the server actor instead of local prediction. */
  onSelfServerState?(snap: PlayerSnapshot): void;
  /**
   * P2-13 (D-056): self AFK flag เปลี่ยน (server ตั้งเมื่อ idle ครบ idleIndicatorSec) → caller (app.ts) ให้
   * local player แสดง/ซ่อนป้าย "AFK" ของตัวเอง. self ไม่ผูก onChange ตำแหน่ง (client-predicted) — listen
   * เฉพาะ field นี้ (display-only, ไม่กระทบ prediction). ยิง immediate ครั้งแรก (false) ตอน wire. optional.
   */
  onSelfAfkChange?(isAfk: boolean): void;
  /**
   * NAMEPLATES: ชื่อตัวละครของ **self** (server ตั้งจาก character.name ตอน join) → caller (app.ts) ให้ local
   * player แสดงป้ายชื่อเหนือหัวตัวเอง. listen เฉพาะ field name ของ self (display-only, ไม่กระทบ prediction).
   * ยิง immediate ครั้งแรกตอน wire (อาจเป็น "" ถ้า schema ยังไม่ตั้ง → client ซ่อนป้ายจนค่ามาจริง). optional.
   */
  onSelfName?(name: string): void;
  /**
   * A1/A2 (COMBAT_BIBLE §2/§10): hp/maxHp ของ **self** เปลี่ยน (server-authoritative, ride PlayerState schema) →
   * caller (app.ts) push เข้า Zustand bridge (แถบ HP = E3). ยิงเมื่อโดนตี/respawn/level-up/equip. listen เฉพาะ
   * field นี้ของ self (ไม่ผูก onChange ตำแหน่ง — client-predicted). ยิง immediate ครั้งแรกตอน wire. optional.
   */
  onSelfVitals?(hp: number, maxHp: number): void;
  /**
   * E3 (§8.2 level badge): level ของ **self** เปลี่ยน (server-authoritative, ride PlayerState schema) → caller
   * (app.ts) push เข้า store (badge) + refresh A3 hotbar unlock. ยิงทันทีตอน join + level-up. optional.
   */
  onSelfLevel?(level: number): void;
  /**
   * E3 (§8.2 EXP bar): exp progress ของ self (schema exp/expFloor/expCeil) → caller push เข้า store (แถบ EXP + %
   * xx.xx%). ยิงตอน join + ทุก kill (server-authoritative). optional.
   */
  onSelfExp?(exp: number, floor: number, ceil: number): void;
  /**
   * A1: มอน contact ใส่ผู้เล่น (broadcast) — client juice (hit flash/damage number). hp จริงมาทาง schema/onSelfVitals.
   * caller ใช้ทำ juice (E3/E4). optional — ไม่ผูก HP truth (server-authoritative).
   */
  onPlayerDamaged?(msg: PlayerDamagedMessage): void;
  /**
   * A2 (§10): ผู้เล่นตาย (broadcast) — caller เล่น death anim; self → death overlay (E4) + setPlayerDead(true).
   * respawn ตามมาทันที (MSG_PLAYER_RESPAWN). optional.
   */
  onPlayerDeath?(msg: PlayerDeathMessage): void;
  /**
   * A2 (§10): ผู้เล่น respawn ที่ safe camp เต็ม hp (broadcast) — self: caller snap local player + camera ไป
   * (tx,ty) (client-predicted, ตำแหน่งไม่มาทาง schema onChange) + setPlayerDead(false). remote: schema จัดการ. optional.
   */
  onPlayerRespawn?(msg: PlayerRespawnMessage): void;
  /**
   * P2-07: snapshot inventory/equipment ล่าสุด (server → client เดียว) — ยิงตอน join + หลังทุก mutation
   * สำเร็จ (equip/unequip/move). caller (app.ts) push เข้า Zustand bridge ตรง ๆ (event-driven, ไม่ throttle
   * ผ่าน hudPublisher — ต่างจาก debugInfo ที่เป็น per-frame poll). optional.
   */
  onInventoryState?(snapshot: InventorySnapshot): void;
  /**
   * P2-07: mutation ถูก server ปฏิเสธ (unknown_item/not_equippable/.../version_conflict) — เงียบ ๆ ไม่ throw,
   * caller โชว์ toast สั้น ๆ แล้ว resync จาก MSG_INVENTORY_STATE ล่าสุดที่มีอยู่แล้ว (ไม่ต้อง request ใหม่). optional.
   */
  onInventoryOpRejected?(rejected: InventoryOpRejectedMessage): void;
  /**
   * P2-10: ผลการเสริมแกร่ง (server → client เดียว, MSG_ENHANCE_RESULT) — ok=true มากับ MSG_INVENTORY_STATE
   * snapshot ใหม่แยกต่างหาก (server ส่งสองข้อความ), ok=false มี reason (NO_ITEM/NO_REINFORCEMENT/MAX_LEVEL/
   * ITEM_LOCKED, §2.4). caller push เข้า Zustand bridge ตรง ๆ (event-driven เหมือน onInventoryOpRejected). optional.
   */
  onEnhanceResult?(result: EnhanceResultMessage): void;
  /**
   * PR5: ผลใช้ consumable (server → client เดียว, MSG_USE_ITEM_RESULT) — ok=true มากับ itemId/hp/
   * cooldownUntilMs (HP จริง sync ทาง PlayerState schema แยก, message นี้ = ack feedback ทันที), ok=false
   * มี reason (UseConsumableReject: unknown_item/no_effect/on_cooldown/hp_already_full/no_stock/
   * version_conflict). caller push เข้า Zustand bridge ตรง ๆ (event-driven เหมือน onEnhanceResult). optional.
   */
  onUseItemResult?(result: UseItemResultMessage): void;
  /**
   * B4: ผลการแลกเศษเสริมแกร่ง 5→1 (server → client เดียว, MSG_FRAGMENT_EXCHANGE_RESULT) — ok=true มากับ
   * MSG_INVENTORY_STATE snapshot ใหม่แยกต่างหาก (server ส่งสองข้อความ), ok=false มี reason (NO_DB/
   * NOT_ENOUGH_FRAGMENTS/INVENTORY_FULL/TRANSACTION_CONFLICT). caller push เข้า Zustand bridge ตรง ๆ. optional.
   */
  onFragmentExchangeResult?(result: FragmentExchangeResultMessage): void;
  /**
   * P2-11: catalog ของร้านบน map ปัจจุบัน (ตอบ MSG_SHOP_LIST_REQUEST) — `available: false` = map นี้ไม่มี
   * ร้าน (HUD ปุ่ม "ร้านค้า" อ่านค่านี้ตัดสินว่าโชว์ปุ่มไหม). caller push เข้า Zustand bridge ตรง ๆ
   * (event-driven เหมือน onInventoryState). optional.
   */
  onShopList?(list: ShopListMessage): void;
  /**
   * P2-11: ผลซื้อ/ขาย (ok/reject, Economy §23) — สำเร็จมากับ MSG_INVENTORY_STATE snapshot ใหม่แยกต่างหาก
   * (server ส่งสองข้อความ เหมือน enhance) + ยอด gold authoritative หลังทำ. caller push เข้า Zustand bridge
   * ตรง ๆ (event-driven). optional.
   */
  onShopResult?(result: ShopResultMessage): void;
  /**
   * P2-09: progression + loot สรุปหลังฆ่ามอน (level/exp/gold/loot) — P2-11 shop ใช้เฉพาะ `gold` เพื่อโชว์
   * ยอดปัจจุบันในร้าน (ยังไม่มี HUD gold bar แยกต่างหากรอบนี้). caller push เข้า Zustand bridge ตรง ๆ
   * (event-driven). optional.
   */
  onPlayerProgress?(msg: PlayerProgressMessage): void;
  /**
   * C1 (Economy §18): milestone ปลดล็อก (server → client เดียว, MSG_MILESTONE_GRANTED) — ยิงครั้งเดียวตอน
   * milestone แจกสำเร็จ (one-time per account). caller push เข้า Zustand bridge → MilestoneToast แสดง toast. optional.
   */
  onMilestoneGranted?(msg: MilestoneGrantedMessage): void;
  /**
   * C2b: achievement ปลดล็อก (server → client เดียว, MSG_ACHIEVEMENT_UNLOCKED) — auto-claim ครั้งเดียวต่อ scope.
   * caller push เข้า Zustand bridge → AchievementToast แสดง toast สั้น ๆ (สีตาม tier). optional.
   */
  onAchievementUnlocked?(msg: AchievementUnlockedMessage): void;
  /**
   * C2b (Part 5): snapshot achievement rows (ตอบ MSG_ACHIEVEMENTS_REQUEST) — journal C3 consume ต่อ. caller
   * push เข้า Zustand bridge (game-store field). optional.
   */
  onAchievementsSnapshot?(msg: AchievementsSnapshotMessage): void;
  /**
   * P2-17: snapshot คลังบัญชีล่าสุด (server → client เดียว, MSG_STORAGE_STATE) — ยิงตอบ MSG_STORAGE_OPEN
   * + หลังทุก deposit/withdraw สำเร็จ. `available: false` = map นี้ไม่มี storage NPC (HUD ปุ่ม "คลัง" อ่าน
   * ค่านี้ตัดสินว่าโชว์ปุ่มไหม, pattern เดียวกับ onShopList). caller push เข้า Zustand bridge ตรง ๆ
   * (event-driven). optional.
   */
  onStorageState?(state: StorageStateMessage): void;
  /**
   * P2-17: ผลฝาก/ถอนล่าสุด (server → client เดียว, MSG_STORAGE_RESULT) — สำเร็จมากับ MSG_STORAGE_STATE +
   * MSG_INVENTORY_STATE snapshot ใหม่แยกต่างหาก (server ส่งหลายข้อความ เหมือน shop/enhance). caller push
   * เข้า Zustand bridge ตรง ๆ (event-driven). optional.
   */
  onStorageResult?(result: StorageResultMessage): void;
  /**
   * P2-17: snapshot กล่องส่งของล่าสุด (server → client เดียว, MSG_DELIVERY_STATE) — ยิงตอบ MSG_STORAGE_OPEN
   * (เปิดพร้อม storage) + หลัง claim สำเร็จ. caller push เข้า Zustand bridge ตรง ๆ (event-driven). optional.
   */
  onDeliveryState?(state: DeliveryStateMessage): void;
  /**
   * P2-17: ผล claim ล่าสุด (server → client เดียว, MSG_DELIVERY_RESULT) — สำเร็จมากับ MSG_DELIVERY_STATE +
   * MSG_INVENTORY_STATE snapshot ใหม่แยกต่างหาก. caller push เข้า Zustand bridge ตรง ๆ (event-driven). optional.
   */
  onDeliveryResult?(result: DeliveryResultMessage): void;
  /**
   * Batch 7b-UI (P3 §13): full profile list (reply to profileList/create/update/delete/mockPurchase) — caller
   * push เข้า Zustand bridge ตรง ๆ (event-driven, เหมือน onShopList/onStorageState). optional.
   */
  onBotProfiles?(msg: BotProfilesMessage): void;
  /**
   * Batch 7b-UI: tier ปัจจุบัน + วันหมดอายุ + caps + paused profile ids (reply to profileList/mockPurchase) —
   * server เป็น truth ของเพดาน tier ทั้งหมด (defense-in-depth เท่านั้นฝั่ง client). optional.
   */
  onBotTierState?(msg: BotTierStateMessage): void;
  /**
   * Batch 7b-UI: live status stream ของบอทที่กำลังรัน — ส่งเฉพาะตอน owner online ในห้อง host ของ map นั้น
   * (server/bot/runtime.ts botOwnerSend — ห้อง/แผนที่อื่นจะไม่เห็น push นี้จนกว่าจะย้ายมา). optional.
   */
  onBotStatus?(msg: BotStatusMessage): void;
  /** D-067: server-authored continuity settlement + reason + run summary. optional. */
  onBotStopped?(msg: BotStoppedMessage): void;
  /** PR2: manual-takeover checkpoint lifecycle (saving → ready/failed; null when consumed). */
  onBotCheckpoint?(msg: BotCheckpointMessage): void;
  /** Batch 7b-UI: แจ้งเตือน (rare/high-value found, captcha required, gold cap) — ของที่ฟาร์มมาไม่หาย. optional. */
  onBotAlert?(msg: BotAlertMessage): void;
  /** Batch 7b-UI: สรุปรายงาน (reply to bot:reportList) — clip ตาม retention tier ฝั่ง server แล้ว. optional. */
  onBotReports?(msg: BotReportsMessage): void;
  /** Batch 7b-UI: รายละเอียด 1 รายงาน (reply to bot:reportFetch) — null = ถูก retention clip. optional. */
  onBotReport?(msg: BotReportMessage): void;
  /**
   * Batch 7b-UI: ผล op ทั่วไป (create/update/delete/start/stop/mockPurchase, ok/reject+reason) — caller
   * correlate กับ local phase ด้วย `op` (bot-view.ts BotOpPhase, pattern เดียวกับ ShopTxPhase). optional.
   */
  onBotOpResult?(msg: BotOpResultMessage): void;
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
  /** P1-07-fix: grace window (วินาที) — ประเมินว่า token ที่เก็บไว้ยังสดพอ reconnect (§59.1). */
  graceSeconds: number;
  /** P1-07-fix: adapter เก็บ token ข้าม page reload (sessionStorage per-tab) — inject ได้ (เทสต์/SSR). */
  store: ReconnectStore;
}

/** colyseus WebSocket close code สำหรับ "consented leave" (client เรียก leave() ตั้งใจ) — default 4000. */
const WS_CLOSE_CONSENTED = 4000;

/** await ได้ (cancel เองด้วย disposed check ฝั่ง caller) — ใช้เว้นช่วง backoff ระหว่าง reconnect. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * P2-04: ขอ short-lived realtime token (~60s) จาก Next API ก่อน join (แนบใน joinOptions.token → server
 * verify ใน onAuth). ยังไม่มี session (401) → สร้าง guest ก่อนแล้วขอใหม่ (§5.1). fetch ล้ม/ไม่มี Next
 * (dev เปิดเฉพาะ client, offline) → คืน null → join แบบไม่มี token (server dev bypass รับได้). ไม่ throw.
 * **fresh join เท่านั้น** — reconnect ภายใน grace ไม่ผ่าน onAuth จึงไม่ต้องมี token.
 */
async function fetchRealtimeToken(): Promise<string | null> {
  if (typeof fetch === "undefined") return null;
  const ask = async (): Promise<Response | null> => {
    try {
      return await fetch("/api/auth/rt-token", { method: "POST" });
    } catch {
      return null; // Next ไม่ได้รัน (offline/dev client-only)
    }
  };
  try {
    let res = await ask();
    if (res && res.status === 401) {
      // ยังไม่มี session → สร้าง guest แล้วขอ token ใหม่ (§5.1 first-time guest)
      try {
        await fetch("/api/auth/guest", { method: "POST" });
      } catch {
        return null;
      }
      res = await ask();
    }
    if (!res || !res.ok) return null;
    const data = (await res.json()) as { token?: unknown };
    return typeof data.token === "string" ? data.token : null;
  } catch {
    return null;
  }
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
  /** P2-07: ขอสวม item จากกระเป๋า (no-op ถ้ายังไม่ online) — server หา equip slot จาก item def เอง. */
  sendEquipItem(msg: EquipItemMessage): void;
  /** P2-07: ขอถอด item ที่สวมอยู่กลับกระเป๋า (no-op ถ้ายังไม่ online). */
  sendUnequipItem(msg: EquipItemMessage): void;
  /** P2-07: ขอย้าย item ในกระเป๋าไปช่องอื่น (bag↔bag เท่านั้น, no-op ถ้ายังไม่ online). */
  sendMoveItem(msg: MoveItemMessage): void;
  /** PR5: ขอใช้ consumable 1 ชิ้นจากกระเป๋า (no-op ถ้ายังไม่ online) — server ตัดสินทั้งหมด (cooldown/heal). */
  sendUseItem(msg: UseItemMessage): void;
  /** P2-10: ขอเสริมแกร่ง equipment ที่ถืออยู่ +1 (no-op ถ้ายังไม่ online) — server ตัดสินทั้งหมด (§2.3). */
  sendEnhanceItem(msg: EnhanceItemMessage): void;
  /** B4: ขอแลกเศษเสริมแกร่ง 5 → เสริมแกร่ง 1 (no-op ถ้ายังไม่ online) — server ตัดสินทั้งหมด (§3.5). */
  sendFragmentExchange(msg: FragmentExchangeMessage): void;
  /** P2-11: ขอ catalog ร้านของ map ปัจจุบัน (no-op ถ้ายังไม่ online) — เรียกตอน join/เปลี่ยน map. */
  sendShopListRequest(msg: ShopListRequestMessage): void;
  /** P2-11: ขอซื้อ item จากร้าน (no-op ถ้ายังไม่ online) — ราคา/เงื่อนไขทั้งหมด server ตัดสิน. */
  sendShopBuy(msg: ShopBuyMessage): void;
  /** P2-11: ขอขาย item ที่ถืออยู่ให้ร้าน (no-op ถ้ายังไม่ online). */
  sendShopSell(msg: ShopSellMessage): void;
  /** P2-17: ขอเปิดคลัง+กล่องส่งของบน map ปัจจุบัน (no-op ถ้ายังไม่ online) — server ตอบ 2 snapshot. */
  sendStorageOpen(): void;
  /** P2-17: ขอฝากของจากกระเป๋าเข้าคลัง (no-op ถ้ายังไม่ online). */
  sendStorageDeposit(msg: StorageMoveMessage): void;
  /** P2-17: ขอถอนของจากคลังกลับกระเป๋า (no-op ถ้ายังไม่ online). */
  sendStorageWithdraw(msg: StorageMoveMessage): void;
  /** P2-17: ขอรับของจาก delivery entry เข้ากระเป๋า (no-op ถ้ายังไม่ online). */
  sendDeliveryClaim(msg: DeliveryClaimMessage): void;
  /** C2b (§13): ส่ง client-reported event (npc.talk/logo/weather/phase/rain — no-op ถ้ายังไม่ online). */
  sendClientEvent(msg: ClientEventMessage): void;
  /** C2b (Part 5): ขอ snapshot achievement ทั้งหมด (no-op ถ้ายังไม่ online). */
  sendAchievementsRequest(): void;
  /** Batch 7b-UI: ขอ profile ทั้งหมด + tier state (no-op ถ้ายังไม่ online) — เรียกตอน join + ทุกครั้งที่เปิด panel. */
  sendBotProfileList(): void;
  /** Batch 7b-UI: สร้าง profile ใหม่ (server enforce เพดาน tier + bot-safe pocket, no-op ถ้ายังไม่ online). */
  sendBotProfileCreate(msg: BotProfileCreateMessage): void;
  /** Batch 7b-UI: แก้ profile เดิม (reject ถ้า read-only excess, no-op ถ้ายังไม่ online). */
  sendBotProfileUpdate(msg: BotProfileUpdateMessage): void;
  /** Batch 7b-UI: ลบ profile (no-op ถ้ายังไม่ online). */
  sendBotProfileDelete(msg: BotProfileDeleteMessage): void;
  /** Batch 7b-UI: เริ่มบอทบน profile นี้ (server validate pocket/tier/capacity, no-op ถ้ายังไม่ online). */
  sendBotStart(msg: BotStartMessage): void;
  /** Batch 7b-UI: หยุดบอทที่กำลังรัน (manual — §12.3, no-op ถ้ายังไม่ online). */
  sendBotStop(msg: BotStopMessage): void;
  /** PR2: return authority to the player; server acks only after the automation command fence is active. */
  sendBotTakeover(msg: BotTakeoverMessage): void;
  /** PR2: resume a ready in-process checkpoint on the same real character. */
  sendBotResume(msg: BotResumeMessage): void;
  /** Batch 7b-UI: ซื้อแพ็กเกจ MOCK (D-061, ไม่ตัดเงินจริง — no-op ถ้ายังไม่ online). */
  sendBotMockPurchase(msg: BotMockPurchaseMessage): void;
  /** Batch 7b-UI: ขอสรุปรายงานภายใน retention ของ tier (no-op ถ้ายังไม่ online). */
  sendBotReportList(): void;
  /** Batch 7b-UI: ขอรายละเอียด 1 รายงาน (no-op ถ้ายังไม่ online). */
  sendBotReportFetch(msg: BotReportFetchMessage): void;
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
  isAfk?: boolean;
  name?: string;
}): PlayerSnapshot {
  return {
    tx: player.tx,
    ty: player.ty,
    direction: coerceDirection(player.direction),
    anim: coerceAnim(player.anim),
    partyId: typeof player.partyId === "string" ? player.partyId : "",
    // P2-13 (D-056): AFK flag (server-set) → remote manager แสดงป้าย. coerce เป็น boolean แท้ (default false).
    isAfk: player.isAfk === true,
    // NAMEPLATES: ชื่อตัวละคร (server-set) → remote manager แสดงป้ายชื่อ. coerce เป็น string (default "" = ซ่อน).
    name: typeof player.name === "string" ? player.name : "",
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
    castRejectCount: 0,
    lastError: null,
  };

  let room: Room | null = null;
  let disposed = false;
  // P1-07: token กลับเข้า seat เดิม (อัปเดตทุกครั้งที่ join/reconnect สำเร็จ) + flag กัน reconnect ซ้อน.
  let reconnectionToken: string | null = null;
  let reconnecting = false;
  // Fix issue #1/#2: adopt ตำแหน่ง authoritative ของ self แล้วหรือยัง (per-connection). reset=false ทุกครั้ง
  // ที่ wire room ใหม่ → true เมื่อ self เข้า state ครั้งแรก. gate sendMove ระหว่างนี้ (กันยิง move จาก spawn
  // ก่อนรู้ตำแหน่ง server hold → correction/warp + exit detection พลาด).
  let selfAdopted = false;
  // P1-07: entity ที่ track ไว้ (สำหรับ reset ก่อน re-wire — กัน onAdd(immediate) รอบใหม่ทำ remote/mob ซ้ำ).
  const knownRemotes = new Set<string>();
  const knownMobs = new Set<string>();

  const client = new Client(config.serverUrl);

  /**
   * P1-07-fix: persist token ล่าสุดลง store (per-tab) พร้อม timestamp + context (server/map/party) →
   * หน้าใหม่หลัง refresh/reopen อ่านได้ แล้ว reconnect เข้า seat เดิม. เรียกทุกครั้งที่ wire สำเร็จ.
   */
  const persistToken = (token: string): void => {
    reconnectionToken = token;
    const record: StoredReconnectRecord = {
      token,
      savedAtMs: Date.now(),
      serverUrl: config.serverUrl,
      mapId: joinOptions.mapId,
      partyId: joinOptions.partyId,
    };
    config.store.save(record);
  };

  /**
   * P1-07-fix: ตอน page unload (refresh/close tab) — re-persist token พร้อม timestamp สด เพื่อให้หน้าใหม่
   * (ถ้า refresh) reconnect ทันใน grace แม้ session ยาวเกิน graceSeconds. **ไม่ leave** (ปล่อยหลุดแบบ
   * unconsented → server hold seat 30s → หน้าใหม่ reclaim ได้แทนเพิ่มผู้เล่นใหม่). browser เท่านั้น.
   */
  const onPageHide = (): void => {
    if (disposed || reconnectionToken === null) return;
    persistToken(reconnectionToken);
  };
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
  }
  const removePageHide = (): void => {
    if (typeof window === "undefined") return;
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("beforeunload", onPageHide);
  };

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
    // Fix issue #1/#2: connection ใหม่ → ยังไม่รู้ตำแหน่ง authoritative ของ self จนกว่า self เข้า state
    // (gate sendMove จนกว่าจะ adopt). ต้อง reset ก่อน register onAdd (immediate อาจยิง self ทันทีในบรรทัดถัดไป).
    selfAdopted = false;
    room = joinedRoom;
    persistToken(joinedRoom.reconnectionToken); // P1-07(-fix): เก็บ token ล่าสุด (memory + per-tab store)
    status.state = "online";
    status.roomId = joinedRoom.roomId;
    const $ = getStateCallbacks(joinedRoom);
    const state = joinedRoom.state as {
      mapId: string;
      channelId: string;
      partyId: string;
      controllers?: { get(key: string): string | undefined };
    };
    let selfActorId = resolveSelfActorId(joinedRoom.sessionId, state.controllers);
    status.selfSessionId = selfActorId;
    status.mapId = state.mapId ?? null;
    status.channelId = state.channelId ?? null;
    status.partyId = state.partyId ?? null;

    // The controller binding can arrive with the initial schema callbacks. Register it before the players map
    // and keep the captured id mutable so self identity never freezes on the legacy socket-id fallback.
    $(joinedRoom.state).controllers.onAdd((actorId: string, controllerSessionId: string) => {
      if (controllerSessionId !== joinedRoom.sessionId || !actorId) return;
      selfActorId = actorId;
      status.selfSessionId = actorId;
    }, true);
    $(joinedRoom.state).controllers.onChange((actorId: string, controllerSessionId: string) => {
      if (controllerSessionId !== joinedRoom.sessionId || !actorId) return;
      selfActorId = actorId;
      status.selfSessionId = actorId;
    });

    // players map: onAdd/onChange/onRemove (ข้าม self — local player render เองแล้ว)
    $(joinedRoom.state).players.onAdd(
      (player: Record<string, unknown> & { tx: number; ty: number; direction: string; anim: string }, sessionId: string) => {
        if (sessionId === selfActorId) {
          // Fix issue #1/#2: self เข้า state ครั้งแรกต่อ connection → adopt ตำแหน่ง authoritative (server
          // hold ตำแหน่งจริง). caller snap local player + camera; หลังจากนี้ sendMove ปลดล็อก. local player
          // = client-predicted → ไม่ผูก onChange (reconcile ต่อเนื่องผ่าน MSG_POSITION_CORRECTION เท่านั้น).
          selfAdopted = true;
          handlers.onSelfSpawn?.(snapshotOf(player));
          // PR1 character authority: automation controls this exact actor. The client observes the state and
          // must not continue local prediction until server authority returns to manual mode.
          $(player).listen("isBot", (v: unknown) => {
            const active = v === true;
            handlers.onSelfAutonomyChange?.(active);
            if (active) handlers.onSelfServerState?.(snapshotOf(player));
          });
          // P2-13 (D-056): listen เฉพาะ field isAfk ของ self (display-only) → local player แสดงป้ายตัวเอง.
          // ไม่ผูก onChange ตำแหน่ง (client-predicted). listen ยิง immediate ครั้งแรก (false) — harmless.
          $(player).listen("isAfk", (v: unknown) => handlers.onSelfAfkChange?.(v === true));
          // NAMEPLATES: listen field name ของ self → local player แสดงป้ายชื่อตัวเอง. ยิง immediate ("" ก่อน init
          // → ซ่อน) แล้วยิงจริงเมื่อ server ตั้งชื่อ. display-only, ไม่ผูก onChange ตำแหน่ง (client-predicted).
          $(player).listen("name", (v: unknown) => handlers.onSelfName?.(typeof v === "string" ? v : ""));
          // A1/A2 (§2/§10): listen hp/maxHp ของ self (server-authoritative HP) → HUD แถบ HP. field เดียว 2 ตัว
          // → emit ทั้งคู่จาก player record ทุกครั้ง (ตัวใดเปลี่ยนก็ส่งค่าล่าสุดทั้งคู่). ไม่ใช่ตำแหน่ง (ไม่กระทบ prediction).
          const emitVitals = (): void =>
            handlers.onSelfVitals?.(Number(player.hp) || 0, Number(player.maxHp) || 0);
          $(player).listen("hp", emitVitals);
          $(player).listen("maxHp", emitVitals);
          // E3 (§8.2): level ของ self (server-authoritative) → HUD badge + A3 unlock. ยิง immediate ตอน wire.
          $(player).listen("level", (v: unknown) => handlers.onSelfLevel?.(Number(v) || 1));
          // E3 (§8.2): exp progress ของ self → HUD แถบ EXP + ตัวเลข %. emit ทั้ง 3 ค่าเมื่อตัวใดเปลี่ยน.
          const emitExp = (): void =>
            handlers.onSelfExp?.(
              Number(player.exp) || 0,
              Number(player.expFloor) || 0,
              Number(player.expCeil) || 0,
            );
          $(player).listen("exp", emitExp);
          $(player).listen("expFloor", emitExp);
          $(player).listen("expCeil", emitExp);
          $(player).onChange(() => {
            if (player.isBot === true) handlers.onSelfServerState?.(snapshotOf(player));
          });
          return;
        }
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
      if (sessionId === selfActorId) return;
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
    // P1-05: server → caster เดียว cast ถูกปฏิเสธ (cooldown/skill มั่ว/range) — นับ + ส่งต่อ (debug/UX)
    joinedRoom.onMessage(MSG_CAST_REJECTED, (rejected: CastRejectedMessage) => {
      status.castRejectCount += 1;
      handlers.onCastRejected?.(rejected);
    });

    // A1/A2 (§2/§10): มอนตี player / player ตาย / respawn (broadcast) → caller juice + snap respawn (self).
    // hp truth มาทาง schema (onSelfVitals); message พวกนี้ = event/juice + ตำแหน่ง respawn (self client-predicted).
    joinedRoom.onMessage(MSG_PLAYER_DAMAGED, (msg: PlayerDamagedMessage) => {
      handlers.onPlayerDamaged?.(msg);
    });
    joinedRoom.onMessage(MSG_PLAYER_DEATH, (msg: PlayerDeathMessage) => {
      handlers.onPlayerDeath?.(msg);
    });
    joinedRoom.onMessage(MSG_PLAYER_RESPAWN, (msg: PlayerRespawnMessage) => {
      handlers.onPlayerRespawn?.(msg);
    });

    // P1-10: server สั่งข้าม map (player เข้า exit area) → caller ทำ transition (leave + join room ใหม่)
    joinedRoom.onMessage(MSG_MAP_TRANSITION, (msg: MapTransitionMessage) => {
      handlers.onMapTransition?.(msg);
    });

    // P2-07: inventory/equipment snapshot (ตอน join + หลัง mutation สำเร็จ) + mutation ถูกปฏิเสธ (เงียบ ๆ)
    joinedRoom.onMessage(MSG_INVENTORY_STATE, (snap: InventorySnapshot) => {
      handlers.onInventoryState?.(snap);
    });
    joinedRoom.onMessage(MSG_INVENTORY_OP_REJECTED, (rejected: InventoryOpRejectedMessage) => {
      handlers.onInventoryOpRejected?.(rejected);
    });
    // P2-10: ผลเสริมแกร่ง (ok/reject) — สำเร็จมากับ MSG_INVENTORY_STATE snapshot ใหม่แยกอีกข้อความ (ด้านบน)
    joinedRoom.onMessage(MSG_ENHANCE_RESULT, (result: EnhanceResultMessage) => {
      handlers.onEnhanceResult?.(result);
    });
    // PR5: ผลใช้ consumable (ok/reject) — HP จริง sync ทาง PlayerState schema แยก (message นี้ = ack feedback)
    joinedRoom.onMessage(MSG_USE_ITEM_RESULT, (result: UseItemResultMessage) => {
      handlers.onUseItemResult?.(result);
    });
    // B4: ผลแลกเศษ 5→1 (ok/reject) — สำเร็จมากับ MSG_INVENTORY_STATE snapshot ใหม่แยกอีกข้อความ (ด้านบน)
    joinedRoom.onMessage(MSG_FRAGMENT_EXCHANGE_RESULT, (result: FragmentExchangeResultMessage) => {
      handlers.onFragmentExchangeResult?.(result);
    });
    // P2-11: catalog ร้าน (ตอบ MSG_SHOP_LIST_REQUEST) + ผลซื้อ/ขาย
    joinedRoom.onMessage(MSG_SHOP_LIST, (list: ShopListMessage) => {
      handlers.onShopList?.(list);
    });
    joinedRoom.onMessage(MSG_SHOP_RESULT, (result: ShopResultMessage) => {
      handlers.onShopResult?.(result);
    });
    // P2-09: progression หลังฆ่ามอน — P2-11 shop ใช้เฉพาะ gold (ดู comment ที่ onPlayerProgress ด้านบน)
    joinedRoom.onMessage(MSG_PLAYER_PROGRESS, (msg: PlayerProgressMessage) => {
      handlers.onPlayerProgress?.(msg);
    });
    // C1 (§18): milestone ปลดล็อก → MilestoneToast (caller push เข้า Zustand bridge)
    joinedRoom.onMessage(MSG_MILESTONE_GRANTED, (msg: MilestoneGrantedMessage) => {
      handlers.onMilestoneGranted?.(msg);
    });
    // C2b: achievement ปลดล็อก → AchievementToast + journal snapshot → game-store (caller push เข้า Zustand bridge)
    joinedRoom.onMessage(MSG_ACHIEVEMENT_UNLOCKED, (msg: AchievementUnlockedMessage) => {
      handlers.onAchievementUnlocked?.(msg);
    });
    joinedRoom.onMessage(MSG_ACHIEVEMENTS_SNAPSHOT, (msg: AchievementsSnapshotMessage) => {
      handlers.onAchievementsSnapshot?.(msg);
    });
    // P2-17: snapshot คลัง (ตอบ MSG_STORAGE_OPEN + หลัง deposit/withdraw สำเร็จ) + ผลฝาก/ถอน
    joinedRoom.onMessage(MSG_STORAGE_STATE, (state: StorageStateMessage) => {
      handlers.onStorageState?.(state);
    });
    joinedRoom.onMessage(MSG_STORAGE_RESULT, (result: StorageResultMessage) => {
      handlers.onStorageResult?.(result);
    });
    // P2-17: snapshot กล่องส่งของ (ตอบ MSG_STORAGE_OPEN + หลัง claim สำเร็จ) + ผล claim
    joinedRoom.onMessage(MSG_DELIVERY_STATE, (state: DeliveryStateMessage) => {
      handlers.onDeliveryState?.(state);
    });
    joinedRoom.onMessage(MSG_DELIVERY_RESULT, (result: DeliveryResultMessage) => {
      handlers.onDeliveryResult?.(result);
    });

    // Batch 7b-UI (P3 §13): bot (Hunter Assistant) push — profiles/tierState (reply to CRUD/mockPurchase),
    // status stream (owner-online-in-host-room only) + stopped + alert (rare/captcha/gold_cap), reports.
    joinedRoom.onMessage(MSG_BOT_PROFILES, (msg: BotProfilesMessage) => {
      handlers.onBotProfiles?.(msg);
    });
    joinedRoom.onMessage(MSG_BOT_TIER_STATE, (msg: BotTierStateMessage) => {
      handlers.onBotTierState?.(msg);
    });
    joinedRoom.onMessage(MSG_BOT_STATUS, (msg: BotStatusMessage) => {
      handlers.onBotStatus?.(msg);
    });
    joinedRoom.onMessage(MSG_BOT_STOPPED, (msg: BotStoppedMessage) => {
      handlers.onBotStopped?.(msg);
    });
    joinedRoom.onMessage(MSG_BOT_CHECKPOINT, (msg: BotCheckpointMessage) => {
      handlers.onBotCheckpoint?.(msg);
    });
    joinedRoom.onMessage(MSG_BOT_ALERT, (msg: BotAlertMessage) => {
      handlers.onBotAlert?.(msg);
    });
    joinedRoom.onMessage(MSG_BOT_REPORTS, (msg: BotReportsMessage) => {
      handlers.onBotReports?.(msg);
    });
    joinedRoom.onMessage(MSG_BOT_REPORT, (msg: BotReportMessage) => {
      handlers.onBotReport?.(msg);
    });
    joinedRoom.onMessage(MSG_BOT_OP_RESULT, (msg: BotOpResultMessage) => {
      handlers.onBotOpResult?.(msg);
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
      // P2-04 (§4.2): ถูกเตะเพราะ account เดียวกันเข้าเล่นที่อื่น (takeover) → **terminal**: ห้าม reconnect
      // (ไม่งั้น 2 แท็บจะแย่ง seat วนไม่จบ). ล้าง token/store + offline. UI แจ้งผ่าน lastError.
      if (code === WS_CLOSE_SESSION_TAKEN_OVER) {
        reconnectionToken = null;
        config.store.clear();
        status.state = "offline";
        status.lastError = "session_taken_over";
        return;
      }
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

  /** P1-07: fresh join (boot ครั้งแรก / หลัง reconnect ล้มเหลว) — server spawn ที่ safe camp, ไม่ throw. */
  const freshJoin = async (): Promise<void> => {
    status.state = "connecting";
    try {
      // P2-04: แนบ realtime token (ถ้าขอได้) ใน joinOptions → server onAuth verify. null (offline/dev
      // client-only) = join ไม่มี token (server dev bypass รับ). token คนละเรื่องกับ reconnectionToken.
      const authToken = await fetchRealtimeToken();
      if (disposed) return;
      const opts = authToken ? { ...joinOptions, token: authToken } : joinOptions;
      let joined: Room;
      try {
        joined = await client.joinOrCreate<unknown>(config.roomName ?? MAP_ROOM_NAME, opts);
      } catch (error) {
        const retainedRoomId = parseCharacterActorRoomRedirect(error);
        if (retainedRoomId) {
          joined = await client.joinById<unknown>(retainedRoomId, opts);
        } else if (isCharacterWorldCapacityError(error)) {
          joined = await client.create<unknown>(config.roomName ?? MAP_ROOM_NAME, opts);
        } else {
          throw error;
        }
      }
      if (disposed) {
        void joined.leave();
        return;
      }
      wire(joined);
    } catch (err) {
      status.state = "offline";
      status.lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[net] connect ล้มเหลว (${config.serverUrl}) — เล่น solo ต่อ:`,
        status.lastError,
      );
    }
  };

  /**
   * P1-07-fix: boot connect. ถ้ามี token สด (per-tab store, ตรง server/map/party + อายุ < grace) → ลอง
   * reconnect เข้า seat เดิมก่อน (คืนตำแหน่ง/channel เดิมหลัง refresh/reopen = reclaim ghost ไม่เพิ่ม
   * ผู้เล่นใหม่). ล้มเหลว/ไม่มี/ไม่ตรง → ล้าง token แล้ว fresh join. ไม่ throw (graceful solo ถ้า server ล่ม).
   */
  const boot = async (): Promise<void> => {
    const plan = planRejoin(config.store.load(), {
      nowMs: Date.now(),
      serverUrl: config.serverUrl,
      mapId: joinOptions.mapId,
      partyId: joinOptions.partyId,
      graceSeconds: config.graceSeconds,
    });
    if (plan.action === "reconnect") {
      try {
        const rejoined = await client.reconnect<unknown>(plan.token);
        if (disposed) {
          void rejoined.leave();
          return;
        }
        wire(rejoined); // reclaim seat เดิม → ตำแหน่ง/channel เดิม restore เงียบ ๆ (§59.1 resume)
        return;
      } catch (err) {
        // token หมดอายุจริง / seat หาย (เกิน grace / server restart) → ล้างแล้ว fresh join
        config.store.clear();
        reconnectionToken = null;
        status.lastError = err instanceof Error ? err.message : String(err);
      }
    }
    await freshJoin();
  };

  void boot();

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
        castRejectCount: status.castRejectCount,
      };
    },
    sendMove(msg: MoveMessage): void {
      // Fix issue #1/#2: ห้ามส่ง move ก่อน adopt ตำแหน่ง authoritative ของ self (spawn/held) — ไม่งั้น
      // ก้าวแรกยิงจาก spawn ของ client ก่อนรู้ตำแหน่ง server hold = correction/warp + exit detection พลาด.
      if (!room || !canSendLocalMove(status.state, selfAdopted)) return;
      room.send(MSG_MOVE, msg);
    },
    sendCast(msg: CastSkillMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_CAST_SKILL, msg);
    },
    sendEquipItem(msg: EquipItemMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_EQUIP_ITEM, msg);
    },
    sendUnequipItem(msg: EquipItemMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_UNEQUIP_ITEM, msg);
    },
    sendMoveItem(msg: MoveItemMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_MOVE_ITEM, msg);
    },
    sendUseItem(msg: UseItemMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_USE_ITEM, msg);
    },
    sendEnhanceItem(msg: EnhanceItemMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_ENHANCE_ITEM, msg);
    },
    sendFragmentExchange(msg: FragmentExchangeMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_FRAGMENT_EXCHANGE, msg);
    },
    sendShopListRequest(msg: ShopListRequestMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_SHOP_LIST_REQUEST, msg);
    },
    sendShopBuy(msg: ShopBuyMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_SHOP_BUY, msg);
    },
    sendShopSell(msg: ShopSellMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_SHOP_SELL, msg);
    },
    sendStorageOpen(): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_STORAGE_OPEN);
    },
    sendStorageDeposit(msg: StorageMoveMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_STORAGE_DEPOSIT, msg);
    },
    sendStorageWithdraw(msg: StorageMoveMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_STORAGE_WITHDRAW, msg);
    },
    sendDeliveryClaim(msg: DeliveryClaimMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_DELIVERY_CLAIM, msg);
    },
    sendClientEvent(msg: ClientEventMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_CLIENT_EVENT, msg);
    },
    sendAchievementsRequest(): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_ACHIEVEMENTS_REQUEST);
    },
    sendBotProfileList(): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_BOT_PROFILE_LIST);
    },
    sendBotProfileCreate(msg: BotProfileCreateMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_BOT_PROFILE_CREATE, msg);
    },
    sendBotProfileUpdate(msg: BotProfileUpdateMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_BOT_PROFILE_UPDATE, msg);
    },
    sendBotProfileDelete(msg: BotProfileDeleteMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_BOT_PROFILE_DELETE, msg);
    },
    sendBotStart(msg: BotStartMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_BOT_START, msg);
    },
    sendBotStop(msg: BotStopMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_BOT_STOP, msg);
    },
    sendBotTakeover(msg: BotTakeoverMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_BOT_TAKEOVER, msg);
    },
    sendBotResume(msg: BotResumeMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_BOT_RESUME, msg);
    },
    sendBotMockPurchase(msg: BotMockPurchaseMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_BOT_MOCK_PURCHASE, msg);
    },
    sendBotReportList(): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_BOT_REPORT_LIST);
    },
    sendBotReportFetch(msg: BotReportFetchMessage): void {
      if (!room || status.state !== "online") return;
      room.send(MSG_BOT_REPORT_FETCH, msg);
    },
    disconnect(): void {
      if (disposed) return;
      disposed = true;
      status.state = "offline";
      reconnectionToken = null; // P1-07: กัน onLeave trigger auto-reconnect หลังตั้งใจปิด
      // P1-07-fix: consented leave (SPA nav away / map transition) → ล้าง token ไม่ให้ boot ครั้งหน้า
      //   reconnect กลับ room/map เก่า. (refresh/close tab ไม่เรียก disconnect — ws หลุด unconsented แทน.)
      config.store.clear();
      removePageHide();
      if (room) void room.leave();
      room = null;
    },
  };
}
