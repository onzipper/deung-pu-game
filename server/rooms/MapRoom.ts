// MapRoom (P0-07, channel P0-08, server-authoritative movement P1-02) — Colyseus Room = map+channel
// instance (tech §6). Local dev เท่านั้นใน P0/P1 world-sync branch.
//
// ทำ: join → spawn PlayerState ที่ตำแหน่ง client ส่งมา · MSG_MOVE → **validate แล้วค่อย apply** · leave → ลบ.
// state ถูก broadcast ให้ทุก client อัตโนมัติผ่าน schema patch (delta binary) ของ Colyseus.
//
// P1-02 server-authoritative movement (TA §6/§7/§16.3):
//   onCreate โหลด map config (loader เดิม, pure) → รู้ collision/bounds เอง.
//   ทุก MSG_MOVE → validateMove(prev, next, elapsed, ...) — speed cap / walkable / teleport.
//   ผิด → **ไม่ apply** + ส่ง MSG_POSITION_CORRECTION กลับ client นั้น (snap กลับ valid ล่าสุด, ไม่แบน).
//   **Single source of truth**: reuse engine pure fn (loadMapConfig/snapToTile/isWalkableTile) +
//   อ่าน knob เดียวกับ client จาก DEFAULT_ENGINE_CONFIG (compile ร่วม — ไม่ copy สูตร/ค่า).
//
// channel (P1-08 auto-assign + party sync, §59.3): server.define ผูก `.filterBy(['mapId','partyId'])`
//   (server/index.ts) — solo (partyId="") auto-assign ตาม load ผ่าน maxClients auto-lock (เต็ม→CH ใหม่);
//   party (partyId≠"") ลง channel เดียวกันอัตโนมัติ. channelId = server-assigned display label (CH.n)
//   จาก channel-registry ตอน onCreate (release ตอน onDispose) — client ไม่ส่ง channelId แล้ว.
//
// P1-03 server-side mob simulation (TA §18 + §6 monster sync + §11 LOD):
//   onCreate สร้าง MobSimulation (pure, src/game/mob/simulation.ts — spawn/respawn/AI/LOD) แล้ว
//   ขับด้วย setSimulationInterval ที่ ai.tickHz (10Hz) → เขียนผล mob เข้า schema (state.mobs MapSchema).
//   **Single source of truth**: reuse pure spawn/wander/ai เดิม (ไม่ copy) + knob จาก DEFAULT_ENGINE_CONFIG.
//   **AOI filter (§18.2) ยังไม่บังคับ** ที่ 30 CCU/map เล็ก — จุด filter = syncMobsToState() (ดู TODO ในนั้น).
//
// P1-05 server combat authority (TA §15/§16.2/§16.3): MSG_CAST_SKILL intent → handleCast():
//   validate (skillId รู้จัก / cooldown per-player per-skill / range) → คำนวณ AoE hit (pure findHits +
//   maxTargets cap §18.4) → damage formula server §15.2 (formula.ts, ค่า k/stat จาก combatBalance knob) →
//   apply กับ mob hp (sim.damageMob) → death: despawn+respawn → broadcast MSG_SKILL_RESULT. ปฏิเสธ → เงียบ
//   (MSG_CAST_REJECTED). **สูตร damage = server-only** (formula.ts ไม่หลุด client bundle). ลบ MSG_DEBUG_KILL_MOB แล้ว.
//
// P1-07 reconnect 30s grace (GS §59.1 · TA §6): onLeave แยก consented (ออกเอง → ลบทันที) ออกจาก
//   unexpected disconnect (ws หลุด → allowReconnection hold state 30 วิ). reconnect ทันใน grace = กลับ
//   sessionId เดิม → PlayerState/MoveTracker/cooldown ที่ไม่เคยลบ = ตำแหน่ง/channel/cooldown เดิม restore
//   อัตโนมัติ (ไม่ผ่าน onJoin). grace หมด → ลบจริง; client รอบถัดไป = fresh join → safe camp (onJoin resolve).
//   onJoin ใช้ resolveSpawnPosition (§59.1 "ตำแหน่ง invalid → safe camp") snap พิกัดที่ client ส่งไป safe
//   camp ถ้าเดินไม่ได้. grace = knob (DEFAULT_ENGINE_CONFIG.reconnect.graceSeconds; env override dev/test).
//
// P1 **ยังไม่ทำ** (จด TODO ชี้ spec):
//   - persistence ตอน leave (player position → MySQL, TA §6 checkpoint)
//   - server-side full simulation ของ player position ทุก tick (ยัง client-drive + validate, TA §6)
//   - AOI filter บังคับ (P1+/map ใหญ่, §18.2) · resource/mana pool (proposal §5 [8] PENDING OWNER)
//   - progression/EXP/loot (P2) — P1 ผู้เล่นทุกคน lv1 นักดาบ (stat จาก combatBalance)

import { randomUUID } from "node:crypto";
import { Room, ServerError, type AuthContext, type Client } from "colyseus";
import { MapRoomState, MobState, PlayerState } from "../schema/MapRoomState";
import { authorizeHandshake } from "../security/handshake";
import { parseAllowedOrigins } from "../security/origin-allowlist";
import { createRateLimiter } from "../security/rate-limiter";
import { claimSession, releaseSession } from "../security/session-registry";
import { acquireLease, releaseLease } from "../security/session-lease";
import {
  fetchCharacterOwner,
  loadCharacterState,
  loadCharacterProgress,
  saveCharacterState,
  saveCharacterProgress,
  updateLastPlayed,
} from "../characters/character-state";
import {
  decideOwnership,
  pickLoadPosition,
  pickSavePosition,
  shouldSaveNow,
} from "../characters/persistence-decision";
import { verifyRealtimeToken } from "../../src/server/auth/realtime-token";
import {
  createChannelRegistry,
  type ChannelRegistry,
} from "../matchmaking/channel-registry";
import {
  DEFAULT_PARTY_ID,
  DEFAULT_MAP_ID,
  MSG_CAST_SKILL,
  MSG_CAST_REJECTED,
  MSG_MAP_TRANSITION,
  MSG_MOVE,
  MSG_POSITION_CORRECTION,
  MSG_SKILL_RESULT,
  MSG_INVENTORY_STATE,
  MSG_INVENTORY_OP_REJECTED,
  MSG_PLAYER_PROGRESS,
  GOLD_UNKNOWN,
  MSG_EQUIP_ITEM,
  MSG_UNEQUIP_ITEM,
  MSG_MOVE_ITEM,
  MSG_ENHANCE_ITEM,
  MSG_ENHANCE_RESULT,
  MSG_SHOP_LIST_REQUEST,
  MSG_SHOP_LIST,
  MSG_SHOP_BUY,
  MSG_SHOP_SELL,
  MSG_SHOP_RESULT,
  MSG_STORAGE_OPEN,
  MSG_STORAGE_STATE,
  MSG_STORAGE_DEPOSIT,
  MSG_STORAGE_WITHDRAW,
  MSG_STORAGE_RESULT,
  MSG_DELIVERY_STATE,
  MSG_DELIVERY_CLAIM,
  MSG_DELIVERY_RESULT,
  MSG_PLAYER_DAMAGED,
  MSG_PLAYER_DEATH,
  MSG_PLAYER_RESPAWN,
  WS_CLOSE_SESSION_TAKEN_OVER,
  type CastRejectedMessage,
  type PlayerDamagedMessage,
  type PlayerDeathMessage,
  type PlayerRespawnMessage,
  type CastSkillMessage,
  type JoinOptions,
  type MapTransitionMessage,
  type MoveMessage,
  type PositionCorrectionMessage,
  type SkillHit,
  type SkillResultMessage,
  type EquipItemMessage,
  type MoveItemMessage,
  type EnhanceItemMessage,
  type EnhanceResultMessage,
  type InventoryOp,
  type InventoryOpRejectedMessage,
  type PlayerProgressMessage,
  type ShopListRequestMessage,
  type ShopListMessage,
  type ShopBuyMessage,
  type ShopSellMessage,
  type ShopResultMessage,
  type StorageMoveMessage,
  type StorageStateMessage,
  type StorageResultMessage,
  type StorageOp,
  type DeliveryClaimMessage,
  type DeliveryStateMessage,
  type DeliveryResultMessage,
} from "../../src/shared/net-protocol";
import {
  validateMove,
  type MoveValidationParams,
  type WalkableAtFn,
} from "../../src/shared/movement-validation";
import { requireMap } from "../../src/engine/map/registry";
import {
  findExitAt,
  isWalkableTile,
  safeCampOf,
  type MapConfig,
} from "../../src/engine/map/types";
import { resolveSpawnPosition, type ReconnectVec2 } from "../../src/shared/reconnect";
import { isIdleAfk, exceedsAfkHardCap } from "../../src/shared/afk";
import { snapToTile } from "../../src/engine/iso/coords";
import {
  DEFAULT_ENGINE_CONFIG,
  soloChannelCapacityForZone,
  type CombatBalanceConfig,
  type PlayerCombatStats,
} from "../../src/engine/config";
import {
  equipItem,
  unequipItem,
  moveItem,
  buildSnapshot,
  type InventoryOpResult,
} from "../../src/server/inventory/service";
import {
  enhanceEquipment,
  type EnhanceResult,
} from "../../src/server/inventory/enhancement-service";
import {
  depositToStorage,
  withdrawFromStorage,
  claimDeliveryEntry,
  buildStorageSnapshot,
  buildDeliverySnapshot,
  type StorageServiceDeps,
  type DeliveryServiceDeps,
  type StorageOpResult,
  type DeliveryClaimResult,
} from "../../src/server/inventory/storage-service";
import { aggregateEquipmentBonus } from "../../src/server/inventory/equipment-stats";
import { applyEquipmentBonus } from "../../src/server/inventory/item-catalog";
import {
  INVENTORY_CAPACITY,
  ITEM_CATALOG,
  ENHANCEMENT_CURVE,
  REINFORCEMENT_RULES,
  ENHANCEMENT_CONFIG_VERSION,
  STORAGE_CONFIG,
  STORAGE_CAPACITY,
  storageAvailableForMap,
  getStorageRepository,
  getInventoryRepository,
  inventoryPersistenceAvailable,
  loadCharacterItemsBestEffort,
} from "../inventory/inventory-state";
import {
  grantKillRewardsForMob,
  PLAYER_BASELINE_TABLE,
  EXP_CURVE,
} from "../economy/kill-rewards";
import { SHOP_CONFIG, shopForMap, shopItemMeta } from "../economy/shop-state";
import {
  buyShopItem,
  sellItem,
  type ShopBuyResult,
  type ShopSellResult,
} from "../../src/server/economy/shop";
import { appendEntry } from "../db/ledger";
import { playerBaselineForLevel } from "../../src/server/economy/exp";
import {
  createMobSimulation,
  type MobContactEvent,
  type MobSimulation,
} from "../../src/game/mob/simulation";
import type { AiPlayerRef } from "../../src/game/mob/ai";
import type { SkillDefinition } from "../../src/game/skill/types";
import { loadSkillDefinitions } from "../../src/game/skill/loader";
import { WARRIOR_SKILLS_SERVER } from "../../src/game/skill/data/warrior-skills-server";
import {
  resolveSkillHits,
  skillReadyAt,
  validateCast,
} from "../../src/game/combat/cast-validation";
import {
  applyDamageToPlayer,
  computeMobDamageToPlayer,
  computeSkillDamage,
  respawnPlayer,
} from "../../src/game/combat/formula";
import type { HitTestTarget } from "../../src/game/combat/hit-test";
import { coerceDirection } from "../../src/engine/net/sync";
import { defaultRng } from "../../src/game/mob/rng";

/** onCreate options = merge ของ options ที่ define() ตั้ง (ว่างใน P1) + clientOptions ของคนแรกที่ join. */
interface MapRoomCreateOptions {
  mapId?: string;
  /** P1-08: partyId ของคนแรกที่ทำให้ room นี้เกิด (filter dimension) — "" = solo channel. */
  partyId?: string;
}

/**
 * P1-08: channel number registry (display label CH.n ต่อ mapId) — **module-level singleton** ใช้ร่วมทุก
 * MapRoom ใน process นี้ (single Colyseus instance, TA §6). assign ตอน onCreate / release ตอน onDispose.
 * ไม่ใช่ matchmaking filter — filterBy(['mapId','partyId']) ต่างหากที่ทำ auto-assign/party sync จริง.
 */
const channelRegistry: ChannelRegistry = createChannelRegistry();

/**
 * P2-04 (Bible 5.2): rate limit join/auth failure ต่อ IP — sliding window in-memory (single-process, TA §6.2).
 * เพดาน = 10 fail / 60s → ปฏิเสธ handshake ชั่วคราว. เป็น module-level singleton (ทุก MapRoom ใน process นี้
 * แชร์ตัวเดียว) เพราะ onAuth เป็น static (เรียกตอน matchmaking ก่อน room instance). knob ตรงนี้ (ยังไม่ config).
 */
const AUTH_RATE_LIMIT_MAX_FAILURES = 10;
const AUTH_RATE_LIMIT_WINDOW_MS = 60_000;
const handshakeRateLimiter = createRateLimiter({
  maxFailures: AUTH_RATE_LIMIT_MAX_FAILURES,
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
});

/** P2-04: เตือนครั้งเดียวเมื่อ ALLOWED_ORIGINS ว่าง (dev mode = เปิดทุก origin) — production ต้องตั้ง. */
let openOriginWarned = false;

/**
 * P2-13 (D-056): cadence ตรวจ AFK (ms) — เดินทุก 1s แล้วเทียบ idle กับ idleIndicatorSec (60s). granularity
 * 1s พอสำหรับป้าย AFK (ไม่ใช่ค่า balance → operational const เหมือน session-lease HEARTBEAT_INTERVAL_MS).
 */
const AFK_CHECK_INTERVAL_MS = 1_000;

/** P2-04: อ่าน accountId ที่ static onAuth ผูกไว้ใน client.auth (null = dev bypass / ไม่ผูกบัญชี). */
function accountIdOf(client: Client): string | null {
  const auth = client.auth as { accountId?: string | null } | undefined;
  return typeof auth?.accountId === "string" && auth.accountId.length > 0 ? auth.accountId : null;
}

/** P2-05: อ่าน characterId ที่ onAuth verify ownership แล้วผูกไว้ใน client.auth (null = anonymous/ไม่ผูกตัวละคร). */
function characterIdOf(client: Client): string | null {
  const auth = client.auth as { characterId?: string | null } | undefined;
  return typeof auth?.characterId === "string" && auth.characterId.length > 0
    ? auth.characterId
    : null;
}

/** P2-04: normalize IP จาก AuthContext (x-real-ip/x-forwarded-for อาจเป็น list/array) → key เดียวสำหรับ rate limit. */
function ipOf(context: AuthContext): string {
  const raw = context.ip;
  const first = Array.isArray(raw) ? raw[0] : raw;
  return (typeof first === "string" ? first.split(",")[0]?.trim() : "") || "unknown";
}

/** P2-04: normalize Origin header (อาจเป็น string[] ในบางกรณี). */
function originOf(context: AuthContext): string | undefined {
  const origin = context.headers?.origin;
  return Array.isArray(origin) ? origin[0] : origin;
}

/**
 * P1-08: capacity ต่อ solo channel (§59.3 auto-assign) — เต็ม → matchmaking เปิด channel ใหม่.
 * ค่าหลัก = knob (DEFAULT_ENGINE_CONFIG.net.channelCapacity); env `CHANNEL_CAPACITY` override เฉพาะ dev/test
 * (proof ตั้ง 2 พิสูจน์ overflow → CH.2). > 0 เท่านั้น ไม่งั้นใช้ค่า knob.
 */
function resolveChannelCapacity(): number {
  const env = Number(process.env.CHANNEL_CAPACITY);
  if (Number.isFinite(env) && env > 0) return env;
  return DEFAULT_ENGINE_CONFIG.net.channelCapacity;
}

/**
 * P1-11: capacity ต่อ solo channel ของ **safe zone (เมือง)** — สูงกว่า field (TA §6, ไม่มี combat).
 * knob = DEFAULT_ENGINE_CONFIG.net.cityHubCapacity; env `CITY_HUB_CAPACITY` override เฉพาะ dev/test.
 */
function resolveCityHubCapacity(): number {
  const env = Number(process.env.CITY_HUB_CAPACITY);
  if (Number.isFinite(env) && env > 0) return env;
  return DEFAULT_ENGINE_CONFIG.net.cityHubCapacity;
}

/**
 * P1-08: capacity ต่อ party channel (partyId≠"") — party สำคัญกว่า solo auto-assign (§59.3) → cap =
 * ขนาด party สูงสุด เพื่อไม่ให้สมาชิกถูกแยก. knob = DEFAULT_ENGINE_CONFIG.net.partyChannelCapacity;
 * env `PARTY_CHANNEL_CAPACITY` override เฉพาะ dev/test.
 */
function resolvePartyChannelCapacity(): number {
  const env = Number(process.env.PARTY_CHANNEL_CAPACITY);
  if (Number.isFinite(env) && env > 0) return env;
  return DEFAULT_ENGINE_CONFIG.net.partyChannelCapacity;
}

/**
 * P1-07: grace window (วินาที) ที่ server hold state หลัง disconnect ไม่ตั้งใจ (§59.1 = 30).
 * ค่าหลัก = knob (DEFAULT_ENGINE_CONFIG.reconnect.graceSeconds); env `RECONNECT_GRACE_SECONDS`
 * override ได้ **เฉพาะ dev/test** (proof ตั้ง 2 วิ พิสูจน์ grace expiry). > 0 เท่านั้น ไม่งั้นใช้ค่า knob.
 */
function resolveGraceSeconds(): number {
  const env = Number(process.env.RECONNECT_GRACE_SECONDS);
  if (Number.isFinite(env) && env > 0) return env;
  return DEFAULT_ENGINE_CONFIG.reconnect.graceSeconds;
}

/**
 * per-player movement tracker (server-authoritative, P1-02) — ไม่อยู่ใน schema (ไม่ broadcast).
 * เก็บ "ตำแหน่ง valid ล่าสุด" + เวลา เพื่อคำนวณ elapsed/allowance และเป็นจุด snap กลับตอน correct.
 */
interface MoveTracker {
  /** ตำแหน่ง valid ล่าสุด (tile coord) = จุด snap กลับเมื่อ move ถูกปฏิเสธ */
  tx: number;
  ty: number;
  /** เวลา (ms, Date.now) ที่ประมวลผล MSG_MOVE ครั้งล่าสุด — ใช้คิด elapsed ครั้งถัดไป */
  lastMoveTime: number;
  /** เวลา (ms) ที่ส่ง correction ครั้งล่าสุด — บังคับ correctionCooldownMs กัน flood */
  lastCorrectionTime: number;
  /**
   * P1-10: exitId ที่ player อยู่ในพื้นที่ล่าสุด (null = ไม่อยู่ใน exit ใด). ยิง MSG_MAP_TRANSITION
   * เฉพาะตอน "เพิ่งเข้า" exit (เปลี่ยนจาก null/other → exitId นี้) — กัน spam ทุก MSG_MOVE ระหว่างยืนใน area.
   */
  lastExitId: string | null;
  /**
   * P2-13 (D-056): เวลา (ms, Date.now) ที่มี input ล่าสุด (movement/cast) — idle เกิน idleIndicatorSec →
   * ป้าย AFK. แยกจาก lastMoveTime (ใช้คำนวณ move elapsed) เพราะ cast ก็นับเป็น input แต่ต้องไม่ไปกวน
   * elapsed ของ move validation.
   */
  lastInputMs: number;
  /**
   * P2-13 (D-056): เวลา (ms) ที่ seat นี้เริ่มมี connection (join / reconnect ครั้งแรก) — จุดอ้างของ
   * afkHardCapHours (inert P2). tracker คงข้าม reconnect-within-grace → นับ connection duration จริง.
   */
  connectedAtMs: number;
}

export class MapRoom extends Room<MapRoomState> {
  /** map config ที่ validate แล้ว (server รู้ collision/bounds เอง) — set ตอน onCreate */
  private map!: MapConfig;
  /** walkable check ที่ reuse engine pure fn (snapToTile + isWalkableTile) — ไม่ copy สูตร */
  private isWalkableAt!: WalkableAtFn;
  /** knob เดียวกับ client (speed + validation) — single source of truth (DEFAULT_ENGINE_CONFIG) */
  private moveParams!: MoveValidationParams;
  private readonly trackers = new Map<string, MoveTracker>();
  /** mob simulation ฝั่ง server (P1-03) — authoritative spawn/respawn/AI/LOD (pure core) */
  private sim!: MobSimulation;
  /** skill definitions (P1-05) — full server view (37 field §50.1); key = skillId. โหลดใน onCreate. */
  private skills!: Map<string, SkillDefinition>;
  /** combat balance knob (P1-05) — k/player/mob stat (single source of truth, DEFAULT_ENGINE_CONFIG) */
  private balance!: CombatBalanceConfig;
  /** cooldown state ต่อ (sessionId → skillId → readyAtMs) — server clock authority (§16.3). ไม่ broadcast. */
  private readonly cooldowns = new Map<string, Map<string, number>>();
  /**
   * P2-07: effective combat stats ต่อ session = base (นักดาบ lv1) + equipment bonus (aggregate จากของที่สวม).
   * recompute ตอน join + หลังทุก equip/unequip สำเร็จ. ไม่อยู่ใน schema (server-only, ใช้ในสูตร damage §15.2).
   * default = this.balance.player (anonymous / ไม่มีของ). never-downgrade zone (combat calc) — ต่อผ่าน pure fn.
   */
  private readonly effectiveStats = new Map<string, PlayerCombatStats>();
  /**
   * P2-09: per-session progression (level + total cumulative EXP). Loaded best-effort on join (Character
   * level/exp), mutated on each eligible kill, persisted best-effort. Drives the per-level combat baseline
   * (D-055 §2). anonymous/no-DB = in-memory only (levels within a session, not persisted).
   */
  private readonly sessionProgress = new Map<string, { level: number; exp: number }>();
  /**
   * P2-09: last-known worn gear per session (itemId + enhancementLevel) — cached so a level-up can recompute
   * combat stats without re-reading the DB (equipment didn't change, only the per-level base did).
   */
  private readonly sessionEquipment = new Map<
    string,
    readonly { itemId: string; enhancementLevel: number }[]
  >();
  /** P1-08: partyId ของ channel นี้ ("" = solo channel, ≠"" = party channel) — จาก options คนแรก */
  private partyId = DEFAULT_PARTY_ID;
  /** P1-08: display channelId (CH.n) ที่ registry จ่ายให้ตอน onCreate — release ตอน onDispose */
  private assignedChannelId = "";
  /** P1-07: grace window (วินาที) สำหรับ allowReconnection (§59.1) — set ตอน onCreate */
  private graceSeconds = 30;
  /** P1-07: safe camp ของ map (§59.1 reconnect fallback) = map.safeCamp ?? spawnPoint (tile coord) */
  private safeCamp: ReconnectVec2 = { tx: 0, ty: 0 };
  /**
   * P2-04 (Storage §4.2): sessionId ที่ถูกเตะด้วย SESSION_TAKEN_OVER (account เดียวกันเข้าจาก tab/device ใหม่).
   * onLeave เช็ค set นี้เพื่อ **ลบทันที ไม่เข้า grace** (takeover = ตั้งใจเตะ ไม่ใช่หลุดเน็ต ไม่ควร hold seat).
   */
  private readonly takenOverSessions = new Set<string>();
  /**
   * P2-05 (Storage §24): session ที่ผูกกับตัวละครจริง (มี accountId + characterId ที่ verify ownership แล้ว).
   * เฉพาะ session เหล่านี้ที่ save CharacterState (anonymous/dev bypass ไม่มี entry → ไม่ persist). lastSaveMs
   * = throttle hot write. save cycle: interval (throttle) + transition (force) + leave (force).
   */
  private readonly sessionCharacters = new Map<
    string,
    { accountId: string; characterId: string; lastSaveMs: number }
  >();
  /**
   * P2-05: session ที่กำลังข้าม map (checkExit save ปลายทางไปแล้ว) — onLeave (consented จาก transition)
   * จะ **ไม่** save ทับด้วยตำแหน่ง map เก่า. เคลียร์ตอน onLeave/removePlayer.
   */
  private readonly transitioningSessions = new Set<string>();
  /** P2-05: ระยะ throttle save (ms) = knob persistence.saveIntervalMs — set ตอน onCreate. */
  private saveIntervalMs = 30_000;
  /**
   * P2-13 (D-056): ป้าย AFK หลัง no-input N วินาที (knob afk.idleIndicatorSec = 60) — set ตอน onCreate.
   * ≤ 0 = ปิดป้าย. ป้ายเป็น display-only ให้ผู้เล่นอื่นเห็น (isAfk บน schema) — **ไม่ผูก disconnect**.
   */
  private afkIdleIndicatorSec = 60;
  /**
   * P2-13 (D-056): เพดานชั่วโมง connection ค้าง (knob afk.afkHardCapHours) — **null = inert (P2)**: ไม่ตัด
   * connection. เดินสาย + จุดเช็คใน evaluateAfk ไว้พร้อม แต่ null → ไม่มีวันทำงาน (ทบทวนก่อน open alpha).
   */
  private afkHardCapHours: number | null = null;

  /**
   * P2-04 (Bible 5.2, TA §6.2): **static** onAuth — Colyseus เรียกตอน matchmaking (fresh join/create) ก่อน
   * สร้าง seat. reconnect ภายใน grace **ไม่ผ่าน** onAuth (reuse seat เดิม) → token ต้องแนบเฉพาะ fresh join.
   *   ด่าน: rate limit (ต่อ IP) → origin allowlist → verify JWT (signature/exp/aud, §6.2 ข้อ 3).
   *   production = บังคับ token เสมอ · dev/e2e (NODE_ENV≠production) = ไม่มี token ผ่านได้ (guest bypass)
   *   เพื่อไม่พัง harness/flow local เดิม. คืน { accountId } (truthy=อนุญาต) → เก็บใน client.auth ให้ onJoin ใช้
   *   ทำ session lease/takeover. ปฏิเสธ = throw ServerError (matchmaker ส่ง error กลับ client).
   */
  static async onAuth(_token: string, options: unknown, context: AuthContext): Promise<unknown> {
    const ip = ipOf(context);
    const nowMs = Date.now();
    // rate limit ก่อน (ถูกที่สุด) — เกินเพดานแล้วปฏิเสธเลย ไม่ต้องทำ crypto
    if (handshakeRateLimiter.isLimited(ip, nowMs)) {
      throw new ServerError(4215 /* AUTH_FAILED */, "rate_limited");
    }
    // token: brief กำหนดให้ client แนบใน joinOptions (options.token); fallback context.token (_authToken/Bearer)
    const opt = (options ?? {}) as { token?: unknown; characterId?: unknown };
    const token =
      typeof opt.token === "string" ? opt.token : typeof _token === "string" ? _token : undefined;

    const allowlist = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
    if (allowlist.length === 0 && !openOriginWarned) {
      console.warn(
        "[MapRoom] ALLOWED_ORIGINS ว่าง — เปิด WS handshake ทุก origin (dev mode). " +
          "⛔ production ต้องตั้ง ALLOWED_ORIGINS (เช่น https://deung-pu.softrock.space).",
      );
      openOriginWarned = true;
    }

    const decision = authorizeHandshake({
      token,
      origin: originOf(context),
      isProduction: process.env.NODE_ENV === "production",
      allowlist,
      jwtSecret: process.env.JWT_SECRET,
      nowSec: Math.floor(nowMs / 1000),
      verify: verifyRealtimeToken,
    });
    if (!decision.ok) {
      handshakeRateLimiter.recordFailure(ip, nowMs);
      throw new ServerError(4215 /* AUTH_FAILED */, decision.reason);
    }

    // P2-05 (Storage §22): ตรวจ ownership ของ characterId ที่ client ขอเข้าเล่น — ต้องเป็นของ accountId
    //   ที่ verify จาก token. dev bypass (accountId=null) ไม่มีบัญชี → characterId ไร้ผล (anonymous เดิม).
    //   DB ใช้ไม่ได้ (owner=undefined) → best-effort skip (characterId inert; onJoin โหลด state ไม่ได้อยู่แล้ว).
    //   ต่างบัญชี/ไม่พบ (reject) → ปฏิเสธ join (นับเป็น failure — กันสแกน characterId). ผ่าน = แนบไป client.auth.
    let characterId: string | null = null;
    const requestedCharacterId =
      typeof opt.characterId === "string" && opt.characterId.length > 0 ? opt.characterId : null;
    if (decision.accountId && requestedCharacterId) {
      const owner = await fetchCharacterOwner(requestedCharacterId);
      if (owner !== undefined) {
        if (decideOwnership(decision.accountId, owner) === "allow") {
          characterId = requestedCharacterId;
        } else {
          handshakeRateLimiter.recordFailure(ip, nowMs);
          throw new ServerError(4215 /* AUTH_FAILED */, "bad_character");
        }
      }
    }

    handshakeRateLimiter.reset(ip); // handshake ผ่าน → ล้าง failure ที่สะสมของ IP นี้
    return { accountId: decision.accountId, characterId };
  }

  onCreate(options: MapRoomCreateOptions = {}): void {
    const state = new MapRoomState();
    state.mapId = options.mapId ?? DEFAULT_MAP_ID;
    // P1-08: partyId = filter dimension (มาจาก client คนแรกที่ทำให้ room เกิด). "" = solo channel.
    // filterBy(['mapId','partyId']) การันตีว่าทุกคนใน room นี้ partyId ตรงกัน → เก็บระดับ room ได้เลย.
    this.partyId = typeof options.partyId === "string" ? options.partyId : DEFAULT_PARTY_ID;
    state.partyId = this.partyId;

    // P1-02/P1-10/P1-11: server โหลด map จาก registry ตาม mapId (ไม่ hardcode) → รู้ collision/bounds/zoneType.
    // ต้องโหลดก่อนคำนวณ maxClients (P1-11: cap ต่างตาม zone). registry validate แล้ว (cross-ref/exits).
    this.map = requireMap(state.mapId);

    // P1-08/P1-11: channelId = **server-assigned display label** (auto-assign, §59.3) — ไม่ใช่ค่าจาก client.
    // solo channel cap = ตาม zone (P1-11: safe zone เมือง = cityHubCapacity สูงกว่า field = channelCapacity,
    // เต็ม → matchmaking เปิด CH ใหม่); party channel cap = partyChannelCapacity.
    this.maxClients =
      this.partyId === DEFAULT_PARTY_ID
        ? soloChannelCapacityForZone(
            this.map.zoneType,
            resolveChannelCapacity(),
            resolveCityHubCapacity(),
          )
        : resolvePartyChannelCapacity();
    const assignment = channelRegistry.assign(state.mapId);
    this.assignedChannelId = assignment.channelId;
    state.channelId = assignment.channelId;
    state.roomId = this.roomId;
    this.setState(state);
    console.log(
      `[MapRoom ${this.roomId}] create ${state.mapId} ${assignment.channelId}` +
        `${this.partyId ? ` party=${this.partyId}` : " (solo)"} cap=${this.maxClients}`,
    );

    // reuse engine collision: snapToTile → integer tile → isWalkableTile (bounds + block). ไม่ copy สูตร.
    // (this.map โหลดไว้ด้านบนแล้ว — ต้องมีก่อนคำนวณ maxClients ตาม zone, P1-11.)
    this.isWalkableAt = (tx: number, ty: number): boolean => {
      const cell = snapToTile({ tx, ty });
      return isWalkableTile(this.map, cell.tx, cell.ty);
    };
    this.moveParams = {
      speed: DEFAULT_ENGINE_CONFIG.player.speed,
      validation: DEFAULT_ENGINE_CONFIG.movementValidation,
    };

    // P1-07 (§59.1): grace window + safe camp (reconnect fallback). safeCamp = map.safeCamp ?? spawnPoint.
    this.graceSeconds = resolveGraceSeconds();
    const sc = safeCampOf(this.map);
    this.safeCamp = { tx: sc.x, ty: sc.y };

    // P1-05: combat balance + skill definitions (single source of truth = DEFAULT_ENGINE_CONFIG + proposal).
    // loadSkillDefinitions validate 37 field §50.1 (fail-loud ตอน boot ถ้า config เพี้ยน) → full server view.
    this.balance = DEFAULT_ENGINE_CONFIG.combatBalance;
    this.skills = loadSkillDefinitions(WARRIOR_SKILLS_SERVER as unknown[]);

    // P1-03/P1-05: สร้าง mob simulation (spawn ชุดแรกทันที) + ขับด้วย fixed tick ที่ ai.tickHz (TA §11 10Hz).
    // hp ต่อ mobType อ่านจาก combatBalance (single source of truth เดียวกับ damage formula).
    this.sim = createMobSimulation({
      map: this.map,
      config: DEFAULT_ENGINE_CONFIG.mob,
      hpFor: (mobType) => (this.balance.mobs[mobType] ?? this.balance.defaultMob).hp,
      // A1 (D-055 §9.3): moveSpeed + attack timing ต่อ mobType จาก combatBalance (single source of truth เดียว
      // กับ damage formula). attackCooldown ในตาราง = **วินาที** → แปลงเป็น ms ที่ boundary นี้.
      attackStatsFor: (mobType) => {
        const m = this.balance.mobs[mobType] ?? this.balance.defaultMob;
        return {
          moveSpeed: m.moveSpeed,
          attackRange: m.attackRange,
          attackCooldownMs: m.attackCooldown * 1000,
          anticipationMs: m.anticipationMs,
          activeMs: m.activeMs,
          recoveryMs: m.recoveryMs,
        };
      },
    });
    this.syncMobsToState();
    this.setSimulationInterval(
      (deltaMs) => this.stepMobSim(deltaMs),
      1000 / DEFAULT_ENGINE_CONFIG.mob.ai.tickHz,
    );

    // P2-05 (Storage §24 · TA §8): save CharacterState เป็นระยะ (throttled hot write) — เฉพาะ session ที่
    // ผูกตัวละครจริง (sessionCharacters). transition/leave = force save แยกต่างหาก. clock.setInterval ถูก
    // เก็บกวาดอัตโนมัติตอน dispose. knob = persistence.saveIntervalMs (env-free — server อ่านตรง ๆ).
    this.saveIntervalMs = DEFAULT_ENGINE_CONFIG.persistence.saveIntervalMs;
    this.clock.setInterval(() => this.saveAllCharacters(), this.saveIntervalMs);

    // P2-13 (D-056): AFK indicator + inert hard cap. knob = afk.idleIndicatorSec/afkHardCapHours (single
    //   source of truth = DEFAULT_ENGINE_CONFIG). ตรวจทุก 1s: idle เกิน 60s → ตั้งป้าย isAfk (ให้ผู้เล่นอื่น
    //   เห็น) — **ไม่มี disconnect** (D-056 supersede §59.1.2). hardCap null = inert (จุดเช็คพร้อม ไม่ทำงาน).
    this.afkIdleIndicatorSec = DEFAULT_ENGINE_CONFIG.afk.idleIndicatorSec;
    this.afkHardCapHours = DEFAULT_ENGINE_CONFIG.afk.afkHardCapHours;
    this.clock.setInterval(() => this.evaluateAfk(), AFK_CHECK_INTERVAL_MS);

    // P1-05: server combat authority (TA §15/§16.2) — client ส่ง cast intent → validate → damage → broadcast.
    this.onMessage(MSG_CAST_SKILL, (client: Client, message: CastSkillMessage) => {
      this.handleCast(client, message);
    });

    // P2-07: inventory/equipment mutation (server-authoritative, TA §7/§8). client ส่ง intent (+expectedVersion)
    //   → service ตัดสินด้วย optimistic lock → สำเร็จ: ส่ง snapshot + recompute combat stats; ปฏิเสธ: เงียบ ๆ.
    this.onMessage(MSG_EQUIP_ITEM, (client: Client, message: EquipItemMessage) => {
      void this.runInventoryOp(client, "equip", (characterId) =>
        equipItem(getInventoryRepository(), ITEM_CATALOG, {
          characterId,
          instanceId: String(message?.instanceId ?? ""),
          expectedVersion: Number(message?.expectedVersion),
          capacity: INVENTORY_CAPACITY,
        }),
      );
    });
    this.onMessage(MSG_UNEQUIP_ITEM, (client: Client, message: EquipItemMessage) => {
      void this.runInventoryOp(client, "unequip", (characterId) =>
        unequipItem(getInventoryRepository(), ITEM_CATALOG, {
          characterId,
          instanceId: String(message?.instanceId ?? ""),
          expectedVersion: Number(message?.expectedVersion),
          capacity: INVENTORY_CAPACITY,
        }),
      );
    });
    this.onMessage(MSG_MOVE_ITEM, (client: Client, message: MoveItemMessage) => {
      void this.runInventoryOp(client, "move", (characterId) =>
        moveItem(getInventoryRepository(), {
          characterId,
          instanceId: String(message?.instanceId ?? ""),
          expectedVersion: Number(message?.expectedVersion),
          toSlot: Number(message?.toSlot),
          capacity: INVENTORY_CAPACITY,
        }),
      );
    });

    // P2-10: guaranteed reinforcement (+1, cap +15) — server-authoritative, atomic, 100% success no RNG.
    //   client ส่ง intent (+expectedVersion + idempotencyKey) → สำเร็จ: result + snapshot + recompute stats;
    //   ปฏิเสธ (flag inert P2 / no material / max / lock): MSG_ENHANCE_RESULT ok:false + reason. (§2.3/R8)
    this.onMessage(MSG_ENHANCE_ITEM, (client: Client, message: EnhanceItemMessage) => {
      void this.runEnhanceOp(client, message);
    });

    // P2-11: starter NPC shop (Economy §8) — buy/sell ผ่าน ledger + inventory transaction, ราคา = server config.
    //   list = catalog ของร้านบน map ปัจจุบัน (ไม่มีร้าน → available:false); buy/sell = server-authoritative +
    //   idempotent → MSG_SHOP_RESULT (+ MSG_INVENTORY_STATE เมื่อสำเร็จ). available ตรวจจาก map (starter district).
    this.onMessage(MSG_SHOP_LIST_REQUEST, (client: Client, _message: ShopListRequestMessage) => {
      this.handleShopList(client);
    });
    this.onMessage(MSG_SHOP_BUY, (client: Client, message: ShopBuyMessage) => {
      void this.runShopBuy(client, message);
    });
    this.onMessage(MSG_SHOP_SELL, (client: Client, message: ShopSellMessage) => {
      void this.runShopSell(client, message);
    });

    // P2-17: personal storage (200 shared slots) + delivery box (Storage §10–§16/§22) — server-authoritative +
    //   idempotent. open = storage+delivery snapshot บน map ที่มี NPC (§10.4); deposit/withdraw/claim = intent
    //   → service ตัดสิน (policy จาก config + optimistic lock + capacity) → MSG_*_RESULT (+ snapshot ใหม่).
    this.onMessage(MSG_STORAGE_OPEN, (client: Client) => {
      void this.handleStorageOpen(client);
    });
    this.onMessage(MSG_STORAGE_DEPOSIT, (client: Client, message: StorageMoveMessage) => {
      void this.runStorageMove(client, "deposit", message);
    });
    this.onMessage(MSG_STORAGE_WITHDRAW, (client: Client, message: StorageMoveMessage) => {
      void this.runStorageMove(client, "withdraw", message);
    });
    this.onMessage(MSG_DELIVERY_CLAIM, (client: Client, message: DeliveryClaimMessage) => {
      void this.runDeliveryClaim(client, message);
    });

    this.onMessage(MSG_MOVE, (client: Client, message: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      const tracker = this.trackers.get(client.sessionId);
      if (!player || !tracker) return;

      const now = Date.now();
      const elapsedMs = now - tracker.lastMoveTime;
      // reference เวลา = ตอนนี้เสมอ (ทั้ง accept/reject) → allowance รอบถัดไปคิดจากตำแหน่ง valid ปัจจุบัน
      tracker.lastMoveTime = now;
      // P2-13 (D-056): MSG_MOVE = input activity → reset idle timer + เคลียร์ป้าย AFK ทันที (กันรอ interval
      //   ถัดไปถึง 1s ค่อยหาย — ผู้เล่นขยับแล้วป้ายควรหายทันตา). ใช้กับทั้ง move ที่ผ่าน/ถูกปฏิเสธ (ยังถือ active).
      this.markInput(client.sessionId, tracker, now);

      const result = validateMove(
        { tx: tracker.tx, ty: tracker.ty },
        { tx: message.tx, ty: message.ty },
        elapsedMs,
        this.moveParams,
        this.isWalkableAt,
      );

      if (result.ok) {
        // valid → apply เข้า schema (broadcast) + เลื่อน valid position
        player.tx = message.tx;
        player.ty = message.ty;
        player.direction = message.direction;
        player.anim = message.anim;
        tracker.tx = message.tx;
        tracker.ty = message.ty;
        // P1-10: ตำแหน่ง valid ปัจจุบันเข้า exit area → สั่ง client ข้าม map (server-authoritative detection).
        this.checkExit(client, tracker);
        return;
      }

      // invalid → ไม่ apply. ส่ง authoritative pos กลับ client นี้ (respect cooldown กัน flood).
      if (now - tracker.lastCorrectionTime >= this.moveParams.validation.correctionCooldownMs) {
        tracker.lastCorrectionTime = now;
        const correction: PositionCorrectionMessage = {
          tx: player.tx,
          ty: player.ty,
          direction: player.direction as PositionCorrectionMessage["direction"],
          anim: player.anim as PositionCorrectionMessage["anim"],
          reason: result.reason,
        };
        client.send(MSG_POSITION_CORRECTION, correction);
        console.log(
          `[MapRoom ${this.roomId}] correct ${client.sessionId} (${result.reason}) → ` +
            `snap (${player.tx.toFixed(2)},${player.ty.toFixed(2)})`,
        );
      }
    });
  }

  /**
   * P1-10 (GS §57.3): ตรวจว่า valid position ของ player อยู่ใน exit area ไหม (server-authoritative).
   * ยิง MSG_MAP_TRANSITION เฉพาะตอน "เพิ่งเข้า" exit (lastExitId เปลี่ยน) — กัน spam ระหว่างยืนใน area.
   * client รับแล้ว leave room เดิม (consented → onLeave ลบทันที, client อื่นเห็นหาย) → join room ปลายทาง.
   * server **ไม่** ย้าย/ลบ player เอง (separated rooms = client re-join) — แค่บอกทาง.
   */
  private checkExit(client: Client, tracker: MoveTracker): void {
    const cell = snapToTile({ tx: tracker.tx, ty: tracker.ty });
    const exit = findExitAt(this.map, cell.tx, cell.ty);
    const exitId = exit?.exitId ?? null;
    if (exit && exitId !== tracker.lastExitId) {
      const msg: MapTransitionMessage = {
        exitId: exit.exitId,
        targetMapId: exit.targetMapId,
        targetSpawn: { x: exit.targetSpawn.x, y: exit.targetSpawn.y },
      };
      client.send(MSG_MAP_TRANSITION, msg);
      console.log(
        `[MapRoom ${this.roomId}] ${client.sessionId} เข้า exit "${exit.exitId}" → ` +
          `transition ไป ${exit.targetMapId} @(${exit.targetSpawn.x},${exit.targetSpawn.y})`,
      );
      // P2-05 (Storage §24): save จุดหมาย (map+targetSpawn ปลายทาง) ตอนสั่ง transition — client กำลังจะ
      //   consented-leave room นี้แล้ว join room ปลายทาง. mark transitioning เพื่อให้ onLeave ไม่ save ทับ
      //   ด้วยตำแหน่ง exit ของ map เก่า. targetSpawn = registry-validated (เดินได้ในปลายทาง).
      const rec = this.sessionCharacters.get(client.sessionId);
      if (rec) {
        this.transitioningSessions.add(client.sessionId);
        rec.lastSaveMs = Date.now();
        void saveCharacterState(
          rec.characterId,
          exit.targetMapId,
          exit.targetSpawn.x,
          exit.targetSpawn.y,
        );
      }
    }
    tracker.lastExitId = exitId;
  }

  /**
   * 1 base cycle ของ mob AI (setSimulationInterval @ ai.tickHz). ป้อนตำแหน่งผู้เล่นทุกคน (จาก schema)
   * ให้ sim → เขียนผลกลับ schema. dt จริงจาก Colyseus (deltaMs) → รองรับ drift.
   */
  private stepMobSim(deltaMs: number): void {
    const players: AiPlayerRef[] = [];
    this.state.players.forEach((p, sessionId) => {
      players.push({ id: sessionId, tx: p.tx, ty: p.ty });
    });
    const contacts = this.sim.tick(deltaMs / 1000, players, Date.now());
    // A1: apply contact damage ก่อน sync (hp ที่ลด + respawn สะท้อนใน state broadcast รอบนี้ทันที)
    if (contacts.length > 0) this.applyMobContacts(contacts);
    this.syncMobsToState();
  }

  /**
   * A1/A2 (COMBAT_BIBLE §2/§10): apply มอน→player contact damage (server-authoritative). ต่อ contact:
   * lookup มอน atk (balance) + player DEF (effective stat) → computeMobDamageToPlayer → หัก hp
   * (clamp 0) → broadcast MSG_PLAYER_DAMAGED (juice). **ไม่มี i-frame** (ฝูงหลายตัวรุมได้ในรอบเดียว = แรงกดดัน
   * ที่ตั้งใจ, P1_BALANCE §2.2). player ที่ hp ถึง 0 = ตาย → เก็บไว้ respawn **หลังจบ loop** (กัน instant respawn
   * กลาง loop แล้วโดน contact ตัวถัด ๆ ตีซ้ำที่ safe camp) — death/respawn ครั้งเดียวต่อรอบ.
   */
  private applyMobContacts(contacts: readonly MobContactEvent[]): void {
    const died = new Map<string, string>(); // sessionId → killer mobId (ครั้งแรกที่ตาย)
    for (const c of contacts) {
      const player = this.state.players.get(c.targetPlayerId);
      if (!player || player.hp <= 0) continue; // player หลุด/ตายไปแล้วในรอบนี้ (hp ยัง 0 จน respawn) → ไม่ตีซ้ำ
      const ms = this.balance.mobs[c.mobType] ?? this.balance.defaultMob;
      const stats = this.effectiveStats.get(c.targetPlayerId) ?? this.balance.player;
      const dmg = computeMobDamageToPlayer({
        mobAtk: ms.atk,
        playerDef: stats.def,
        k: this.balance.k,
      });
      const result = applyDamageToPlayer(player.hp, dmg);
      player.hp = result.hp;
      const damaged: PlayerDamagedMessage = {
        sessionId: c.targetPlayerId,
        mobId: c.mobId,
        dmg,
        hp: player.hp,
      };
      this.broadcast(MSG_PLAYER_DAMAGED, damaged);
      if (result.dead) died.set(c.targetPlayerId, c.mobId);
    }
    // respawn หลังจบ loop (hp ยัง 0 ระหว่าง loop → contact ตัวถัดถูก guard ข้าม; respawn แล้วไม่โดนซ้ำรอบนี้)
    for (const [sessionId, killerMobId] of died) this.handlePlayerDeath(sessionId, killerMobId);
  }

  /**
   * A2 (COMBAT_BIBLE §10 Death & Recovery, locked baseline): player ตาย → broadcast death (client เล่น death
   * anim) → respawn ทันทีที่ safe camp เต็ม hp (server-authoritative). **ไม่มี item loss / gold / durability
   * penalty** (initial PvE baseline; penalty ที่หนักกว่าเป็น later decision, นอก scope). respawn เขียน
   * hp + ตำแหน่ง (schema + tracker) เท่านั้น — reconnect กลับมา = เห็น state ที่ respawn แล้ว (bypass ไม่ได้,
   * idempotent). ไม่แตะ inventory/ledger เลย.
   */
  private handlePlayerDeath(sessionId: string, killerMobId: string): void {
    const death: PlayerDeathMessage = { sessionId, mobId: killerMobId };
    this.broadcast(MSG_PLAYER_DEATH, death);
    this.respawnPlayerToSafeCamp(sessionId);
  }

  /**
   * A2: respawn 1 player ที่ safe camp เต็ม hp (§10) — pure resolver (respawnPlayer) → เขียน schema (hp/pos) +
   * tracker (valid pos = safe camp เพื่อ move ถัดไป reconcile ถูก). broadcast MSG_PLAYER_RESPAWN ให้ self snap
   * local player (client-predicted, ตำแหน่งไม่มาทาง schema onChange). idempotent — เรียกซ้ำได้ผลเดิม.
   */
  private respawnPlayerToSafeCamp(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    const outcome = respawnPlayer(this.safeCamp, this.maxHpFor(sessionId));
    player.hp = outcome.hp;
    player.tx = outcome.pos.tx;
    player.ty = outcome.pos.ty;
    const tracker = this.trackers.get(sessionId);
    if (tracker) {
      tracker.tx = outcome.pos.tx;
      tracker.ty = outcome.pos.ty;
    }
    const respawn: PlayerRespawnMessage = {
      sessionId,
      tx: outcome.pos.tx,
      ty: outcome.pos.ty,
      hp: outcome.hp,
    };
    this.broadcast(MSG_PLAYER_RESPAWN, respawn);
  }

  /** A1/A2: effective max HP ของ session = effective stat hp (baseline ต่อเลเวล + gear maxHp). default = base. */
  private maxHpFor(sessionId: string): number {
    return (this.effectiveStats.get(sessionId) ?? this.balance.player).hp;
  }

  /**
   * A1/A2: refresh PlayerState.maxHp จาก effective stat + clamp hp เข้า [0,maxHp] (ไม่ heal — hp ปัจจุบันคงเดิม
   * เว้นเกิน max ใหม่). เรียกหลัง recompute effective stats (equip/unequip/level-up). init เต็ม hp = onJoin แยก.
   */
  private refreshPlayerMaxHp(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    player.maxHp = this.maxHpFor(sessionId);
    if (player.hp > player.maxHp) player.hp = player.maxHp;
  }

  /**
   * เขียน mob จาก simulation → schema (state.mobs). upsert ตัวที่มี + ลบตัวที่หายไป (ตาย/ยังไม่ respawn).
   *
   * **AOI filter point (§18.2 — ยังไม่บังคับ P1):** ตอนนี้เขียน mob **ทุกตัว** ลง shared state → ทุก client
   * เห็นหมด (พอที่ 30 CCU/map เล็ก, density §11 target). เมื่อ scale (map ใหญ่/หลาย pocket active,
   * entity 150–200) ต้อง filter ต่อ client ที่นี่: ใช้ Colyseus StateView/@filter + spatial hash (§11)
   * ส่งเฉพาะ mob ในรัศมี AOI ของแต่ละ player. TODO(§18.2/P1+): เพิ่ม per-client view ที่จุดนี้.
   */
  private syncMobsToState(): void {
    const seen = new Set<string>();
    this.sim.forEach((m) => {
      seen.add(m.id);
      let ms = this.state.mobs.get(m.id);
      if (!ms) {
        ms = new MobState();
        ms.mobId = m.id;
        ms.mobType = m.mobType;
        this.state.mobs.set(m.id, ms);
      }
      ms.tx = m.pos.tx;
      ms.ty = m.pos.ty;
      ms.state = m.moved ? "walk" : "idle";
      ms.hp = m.hp;
    });
    // ลบ mob ที่ไม่อยู่ใน sim แล้ว (ตายรอ respawn) → client เห็น despawn.
    // เก็บ key ก่อนค่อยลบ (เลี่ยง mutate ระหว่าง iterate MapSchema).
    const stale: string[] = [];
    this.state.mobs.forEach((_ms, id) => {
      if (!seen.has(id)) stale.push(id);
    });
    for (const id of stale) this.state.mobs.delete(id);
  }

  /**
   * P1-05 server combat authority (TA §15/§16.2/§16.3). client ส่ง intent → server ตัดสินทั้งหมด:
   *   1. validate (รู้จัก skillId / cooldown per-player per-skill / range) — ผิด → MSG_CAST_REJECTED (เงียบ)
   *   2. set cooldown (server clock)
   *   3. resolve hit จาก sim (pure findHits + maxTargets cap §18.4) — targets = มอนมีชีวิตในห้อง
   *   4. คำนวณ damage ต่อ target (สูตร server §15.2, formula.ts) เคารพ hitCount → apply กับ mob hp
   *   5. mob ตาย → despawn + respawn (sim.damageMob) · sync state ทันที → broadcast MSG_SKILL_RESULT
   * ไม่ throw/crash room ไม่ว่า payload อะไร (best-effort validate).
   */
  private handleCast(client: Client, message: CastSkillMessage): void {
    const sessionId = client.sessionId;
    const player = this.state.players.get(sessionId);
    if (!player || !message) return;

    // P2-13 (D-056): cast intent = input activity → reset idle timer + เคลียร์ป้าย AFK (แม้ cast จะถูก
    //   ปฏิเสธ cooldown/range ก็ยังถือว่าผู้เล่น active). tracker อาจไม่มี (race) → markInput ข้ามเงียบ ๆ.
    this.markInput(sessionId, this.trackers.get(sessionId), Date.now());

    const skillId = typeof message.skillId === "string" ? message.skillId : "";
    const skill = this.skills.get(skillId);
    const cds = this.cooldowns.get(sessionId);
    const now = Date.now();
    const casterPos = { tx: player.tx, ty: player.ty };
    const aimPos = {
      tx: Number.isFinite(message.aimTx) ? message.aimTx : player.tx,
      ty: Number.isFinite(message.aimTy) ? message.aimTy : player.ty,
    };

    // TODO(P2): validate skill ownership/class/unlockLevel เมื่อมี progression (ตอนนี้ทุกคน lv1 นักดาบ
    //   → ยังไม่เป็นบั๊ก; ทุกคนใช้ WARRIOR_SKILLS ได้หมด). เพิ่มเช็ค player.class === skill.class +
    //   player.level ≥ skill.unlockLevel + สกิลอยู่ใน loadout ที่ผู้เล่นปลด (§8 branch).
    const verdict = validateCast({
      skill,
      // P1-11 (GS §14): safe zone (เมือง) ปฏิเสธ cast ทุกกรณี — server-authoritative (client disable ปุ่มด้วย).
      zoneType: this.map.zoneType,
      readyAtMs: cds?.get(skillId),
      nowMs: now,
      casterPos,
      aimPos,
      rangeToleranceFactor: this.balance.rangeToleranceFactor,
    });
    if (!verdict.ok) {
      const rejected: CastRejectedMessage = { skillId, reason: verdict.reason };
      client.send(MSG_CAST_REJECTED, rejected);
      return;
    }
    // verdict.ok = true → skill มีจริง (validateCast การันตี)
    const def = skill as SkillDefinition;

    // set cooldown (server clock) ก่อนคำนวณ hit — กัน race cast รัวในเฟรมเดียว
    cds?.set(skillId, skillReadyAt(now, def.cooldown));

    // targets = มอนมีชีวิตทั้งหมดในห้อง (pos ปัจจุบันจาก sim) + lookup mobType เพื่อ resolve stat
    const targets: HitTestTarget[] = [];
    const mobTypeById = new Map<string, string>();
    this.sim.forEach((m) => {
      targets.push({ id: m.id, pos: { tx: m.pos.tx, ty: m.pos.ty } });
      mobTypeById.set(m.id, m.mobType);
    });

    // TODO(ground-target skills): geometry ปัจจุบัน anchor ที่ caster+facing (arc/cone/line/self-circle
    //   ของนักดาบ P1). ถ้ามี skill ground-target (AoE ตกที่จุดเล็ง เช่น mage_crystal_storm) ต้องใช้
    //   aimPos เป็นศูนย์กลาง AoE (ไม่ใช่ caster) + validate range ของ aimPos จาก server position — ปรับ
    //   resolveSkillHits ให้รับ origin แยกจาก caster ตาม targetShape.
    const facing = coerceDirection(message.direction);
    // P1-05.1: hitTolerance (knob) ชดเชย interp lag ที่ทำให้ตีไม่โดนมอนติดตัว (ดู CombatBalanceConfig.hitTolerance)
    const hitIds = resolveSkillHits(
      def,
      casterPos,
      facing,
      targets,
      DEFAULT_ENGINE_CONFIG.tileSize,
      this.balance.hitTolerance,
    );

    // สกิลที่ทำ damage: targetType enemy + baseMultiplier>0 + hitCount>0 (utility เช่น taunt = valid cast แต่ไม่ damage)
    const dealsDamage = def.targetType === "enemy" && def.baseMultiplier > 0 && def.hitCount > 0;
    const hits: SkillHit[] = [];
    const killedMobTypes: string[] = []; // P2-09: mobType ต่อ mob ที่ตายรอบนี้ → reward ให้ caster
    if (dealsDamage) {
      for (const mobId of hitIds) {
        const mobType = mobTypeById.get(mobId);
        if (mobType === undefined) continue;
        const ms = this.balance.mobs[mobType] ?? this.balance.defaultMob;
        // P2-07: ใช้ effective stats (base + equipment bonus) ของผู้ cast — default = base ถ้าไม่มี entry.
        const stats = this.effectiveStats.get(sessionId) ?? this.balance.player;
        const dmg = computeSkillDamage(
          {
            atk: stats.atk,
            baseMultiplier: def.baseMultiplier,
            targetDef: ms.def,
            penetration: stats.penetration,
            k: this.balance.k,
            critRate: stats.critRate,
            critDmg: stats.critDmg,
            // bossModifier ใช้เฉพาะเมื่อ target เป็น boss — P1 มีแต่ normal mob → 1.0 (proposal §1)
            bossModifier: 1.0,
            pvpModifier: this.balance.pvpModifier,
            tierReduction: ms.tierReduction,
          },
          def.hitCount,
          defaultRng,
        );
        const applied = this.sim.damageMob(mobId, dmg.damage);
        if (!applied) continue;
        hits.push({ mobId, dmg: dmg.damage, crit: dmg.crit, killed: applied.killed });
        if (applied.killed) killedMobTypes.push(mobType);
      }
      // sync ทันที → hp ที่ลด + มอนที่ตาย (despawn) สะท้อนใน state broadcast รอบนี้ (ไม่รอ sim tick ถัดไป)
      this.syncMobsToState();
    }

    const result: SkillResultMessage = { casterId: sessionId, skillId, hits };
    this.broadcast(MSG_SKILL_RESULT, result);

    // P2-09: มอนตาย → reward (EXP/gold/drop/audit) ให้ caster ผู้ฆ่า. best-effort (async, ไม่ block broadcast).
    //   damageMob คืน killed=true ครั้งเดียวต่อมอน (ถูกลบจาก sim) → grant ครั้งเดียว (idempotent ที่ระดับ sim).
    for (const mobType of killedMobTypes) {
      void this.grantKillReward(client, mobType);
    }
  }

  /**
   * P2-07/P2-09: cache worn gear + recompute effective combat stats. Called on join + after every equip/unequip
   * success. `equipped` = snapshot.equipment (itemId + enhancementLevel is enough to aggregate).
   */
  private applyEquipmentStats(
    sessionId: string,
    equipped: readonly { itemId: string; enhancementLevel: number }[],
  ): void {
    this.sessionEquipment.set(
      sessionId,
      equipped.map((e) => ({ itemId: e.itemId, enhancementLevel: e.enhancementLevel })),
    );
    this.recomputeEffectiveStats(sessionId);
    // A1/A2: gear maxHp เปลี่ยน → sync PlayerState.maxHp (clamp hp, ไม่ heal). init เต็ม hp = onJoin แยก.
    this.refreshPlayerMaxHp(sessionId);
  }

  /**
   * P2-09: effective combat stats = per-level player baseline (D-055 §2) + gear bonus (pure). The level base
   * changes on level-up; secondaries (crit/critDmg/penetration) stay from the engine lv1 baseline (D-055 §2).
   * P2-10: worn enhancementLevel folds through the D-054 curve (§16.3.1). never-downgrade zone (combat calc).
   */
  private recomputeEffectiveStats(sessionId: string): void {
    const level = this.sessionProgress.get(sessionId)?.level ?? 1;
    const base = playerBaselineForLevel(level, PLAYER_BASELINE_TABLE, {
      critRate: this.balance.player.critRate,
      critDmg: this.balance.player.critDmg,
      penetration: this.balance.player.penetration,
    });
    const equipped = this.sessionEquipment.get(sessionId) ?? [];
    const bonus = aggregateEquipmentBonus(equipped, ITEM_CATALOG, ENHANCEMENT_CURVE);
    this.effectiveStats.set(sessionId, applyEquipmentBonus(base, bonus));
  }

  /**
   * P2-09: grant one eligible kill's rewards to the caster (§12 personal reward). EXP is always computed
   * (in-memory levelling works with no DB); Gold + Drops + DropAudit run only for a character-bound session
   * with a DB. Best-effort at this boundary: a DB error is logged (money-loud) but never crashes the room —
   * the ledger stays strict inside (no faked success). Sends MSG_PLAYER_PROGRESS + a fresh MSG_INVENTORY_STATE
   * when the bag changed. mobType unmapped / boss (P2B) → no-op.
   */
  private async grantKillReward(client: Client, mobType: string): Promise<void> {
    const sessionId = client.sessionId;
    const progress = this.sessionProgress.get(sessionId);
    if (!progress) return;
    const rec = this.sessionCharacters.get(sessionId);

    let outcome: Awaited<ReturnType<typeof grantKillRewardsForMob>>;
    try {
      outcome = await grantKillRewardsForMob({
        mobType,
        characterId: rec?.characterId ?? "",
        accountId: rec?.accountId ?? "",
        playerLevel: progress.level,
        playerExp: progress.exp,
        eligibleMembers: 1, // §9.4 party split not wired yet (single killer — see P2-09 report)
        killEventId: randomUUID(),
        persist: !!rec,
      });
    } catch (err) {
      console.error(
        `[MapRoom ${this.roomId}] kill-reward DB error ${sessionId} (${mobType}): ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return;
    }
    if (!outcome) return; // unmapped mobType / non-P2 monster (boss = P2B)

    // apply EXP/level (source of truth = returned total); recompute per-level combat stats.
    progress.level = outcome.exp.level;
    progress.exp = outcome.exp.exp;
    this.recomputeEffectiveStats(sessionId);
    // A1/A2: level-up ยก maxHp ต่อเลเวล → sync PlayerState.maxHp (ไม่ heal hp ปัจจุบัน; §10 respawn เท่านั้นที่เต็ม).
    this.refreshPlayerMaxHp(sessionId);
    // level-up is meaningful → persist promptly; routine EXP gain rides the throttled save cycle (persistSession).
    if (rec && outcome.exp.leveledUp) void saveCharacterProgress(rec.characterId, progress.level, progress.exp);

    // fresh inventory snapshot when loot actually landed in the bag.
    if (rec && outcome.granted.length > 0) {
      const items = await loadCharacterItemsBestEffort(rec.characterId);
      client.send(MSG_INVENTORY_STATE, buildSnapshot(items, INVENTORY_CAPACITY));
    }

    const capRow = EXP_CURVE.levels.find((l) => l.level === progress.level);
    const prevRow = EXP_CURVE.levels.find((l) => l.level === progress.level - 1);
    const msg: PlayerProgressMessage = {
      level: progress.level,
      exp: progress.exp,
      expFloor: prevRow ? prevRow.cumulative : 0,
      expCeil: capRow && capRow.expToNext > 0 ? capRow.cumulative : 0,
      gold: outcome.goldBalance !== null ? Number(outcome.goldBalance) : GOLD_UNKNOWN,
      leveledUp: outcome.exp.leveledUp,
      loot: outcome.granted,
      lootOverflow: outcome.overflow,
    };
    client.send(MSG_PLAYER_PROGRESS, msg);
  }

  /**
   * P2-10: run one guaranteed reinforcement (+1) then answer the client. Only character-bound sessions with a
   * DB (anonymous/dev has nothing to persist → reject). Success → MSG_ENHANCE_RESULT(ok,level) +
   * MSG_INVENTORY_STATE (new snapshot: bumped level + spent material) + recompute combat stats. Business
   * reject (flag inert / no material / max / lock) → MSG_ENHANCE_RESULT(ok:false,reason). DB error → resync
   * signal (ITEM_LOCKED) — the upgrade did not persist, never faked as success (never-downgrade zone).
   */
  private async runEnhanceOp(client: Client, message: EnhanceItemMessage): Promise<void> {
    const instanceId = String(message?.instanceId ?? "");
    const rec = this.sessionCharacters.get(client.sessionId);
    if (!rec || !inventoryPersistenceAvailable()) {
      const rejected: EnhanceResultMessage = { ok: false, instanceId, level: -1, reason: "NO_ITEM" };
      client.send(MSG_ENHANCE_RESULT, rejected);
      return;
    }
    let result: EnhanceResult;
    try {
      result = await enhanceEquipment(
        {
          repo: getInventoryRepository(),
          catalog: ITEM_CATALOG,
          reinforcement: REINFORCEMENT_RULES,
          limits: { maxLevel: ENHANCEMENT_CURVE.maxLevel },
          configVersion: ENHANCEMENT_CONFIG_VERSION,
        },
        {
          characterId: rec.characterId,
          instanceId,
          expectedVersion: Number(message?.expectedVersion),
          idempotencyKey: String(message?.idempotencyKey ?? ""),
          capacity: INVENTORY_CAPACITY,
        },
      );
    } catch (err) {
      console.warn(
        `[MapRoom ${this.roomId}] enhance DB error ${client.sessionId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      const rejected: EnhanceResultMessage = { ok: false, instanceId, level: -1, reason: "ITEM_LOCKED" };
      client.send(MSG_ENHANCE_RESULT, rejected);
      return;
    }
    if (!result.ok) {
      const rejected: EnhanceResultMessage = { ok: false, instanceId, level: -1, reason: result.reason };
      client.send(MSG_ENHANCE_RESULT, rejected);
      return;
    }
    const ok: EnhanceResultMessage = { ok: true, instanceId, level: result.newLevel };
    client.send(MSG_ENHANCE_RESULT, ok);
    client.send(MSG_INVENTORY_STATE, result.snapshot);
    this.applyEquipmentStats(client.sessionId, result.snapshot.equipment);
  }

  /**
   * P2-07: รัน 1 inventory op (equip/unequip/move) แล้วตอบ client. เฉพาะ session ที่ผูกตัวละคร + DB พร้อม
   *   (anonymous/dev ไม่มีของ persist → reject). สำเร็จ → ส่ง snapshot ใหม่ + recompute combat stats.
   *   ปฏิเสธ business (version ชน/ช่องเต็ม ฯลฯ) → MSG_INVENTORY_OP_REJECTED. DB error → log + สั่ง client resync
   *   (mutation ไม่ผ่านจริง — ไม่แกล้งสำเร็จ; reason version_conflict = สัญญาณให้ client โหลด snapshot ใหม่).
   */
  private async runInventoryOp(
    client: Client,
    op: InventoryOp,
    run: (characterId: string) => Promise<InventoryOpResult>,
  ): Promise<void> {
    const rec = this.sessionCharacters.get(client.sessionId);
    if (!rec || !inventoryPersistenceAvailable()) {
      const rejected: InventoryOpRejectedMessage = { op, reason: "unknown_item" };
      client.send(MSG_INVENTORY_OP_REJECTED, rejected);
      return;
    }
    let result: InventoryOpResult;
    try {
      result = await run(rec.characterId);
    } catch (err) {
      console.warn(
        `[MapRoom ${this.roomId}] inventory ${op} DB error ${client.sessionId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      const rejected: InventoryOpRejectedMessage = { op, reason: "version_conflict" };
      client.send(MSG_INVENTORY_OP_REJECTED, rejected);
      return;
    }
    if (!result.ok) {
      const rejected: InventoryOpRejectedMessage = { op, reason: result.reason };
      client.send(MSG_INVENTORY_OP_REJECTED, rejected);
      return;
    }
    client.send(MSG_INVENTORY_STATE, result.snapshot);
    this.applyEquipmentStats(client.sessionId, result.snapshot.equipment);
  }

  /**
   * P2-11: ตอบ catalog ของร้านบน map ปัจจุบัน (Economy §8). ราคาซื้อมาจาก config (ไม่ bundle ในclient) — map
   * ที่ไม่มีร้าน → available:false (client ซ่อนปุ่มร้าน). ไม่ต้องมี DB (ราคา = config).
   */
  private handleShopList(client: Client): void {
    const shop = shopForMap(this.state.mapId);
    const msg: ShopListMessage = shop
      ? {
          shopId: shop.shopId,
          available: true,
          entries: shop.entries.map((e) => ({
            itemId: e.itemId,
            buyPrice: e.buyPrice,
            unlockCondition: e.unlockCondition,
          })),
        }
      : { shopId: SHOP_CONFIG.shopId, available: false, entries: [] };
    client.send(MSG_SHOP_LIST, msg);
  }

  /**
   * P2-11: ซื้อ item จากร้าน (§8). เฉพาะ session ที่ผูกตัวละคร + DB พร้อม + อยู่ map ที่มีร้าน. สำเร็จ →
   * MSG_SHOP_RESULT(ok, gold) + MSG_INVENTORY_STATE (snapshot ใหม่). ปฏิเสธ business → reason §23; DB error →
   * surface (never-downgrade: เงินอาจถูก refund ด้วย compensating entry ในตัว service — ดู shop.ts header).
   */
  private async runShopBuy(client: Client, message: ShopBuyMessage): Promise<void> {
    const itemId = String(message?.itemId ?? "");
    const shop = shopForMap(this.state.mapId);
    const rec = this.sessionCharacters.get(client.sessionId);
    if (!shop || !rec || !inventoryPersistenceAvailable()) {
      this.sendShopReject(client, "buy", itemId, "SHOP_ITEM_NOT_FOUND");
      return;
    }
    let result: ShopBuyResult;
    try {
      result = await buyShopItem(
        {
          shop,
          itemMeta: shopItemMeta,
          ledger: { appendEntry: (e) => appendEntry(e) },
          inventory: getInventoryRepository(),
        },
        {
          characterId: rec.characterId,
          accountId: rec.accountId,
          capacity: INVENTORY_CAPACITY,
          itemId,
          quantity: Number(message?.quantity),
          idempotencyKey: String(message?.idempotencyKey ?? ""),
        },
      );
    } catch (err) {
      console.error(
        `[MapRoom ${this.roomId}] shop buy DB error ${client.sessionId} (${itemId}): ` +
          (err instanceof Error ? err.message : String(err)),
      );
      this.sendShopReject(client, "buy", itemId, "TRANSACTION_CONFLICT");
      return;
    }
    if (!result.ok) {
      this.sendShopReject(client, "buy", itemId, result.reason);
      return;
    }
    const ok: ShopResultMessage = {
      op: "buy",
      ok: true,
      itemId: result.itemId,
      quantity: result.quantity,
      gold: Number(result.gold),
    };
    client.send(MSG_SHOP_RESULT, ok);
    await this.sendInventorySnapshot(client, rec.characterId);
  }

  /**
   * P2-11: ขาย item ที่ถืออยู่ให้ร้าน (§8). สำเร็จ → MSG_SHOP_RESULT(ok, gold) + MSG_INVENTORY_STATE. ปฏิเสธ
   * business (ไม่ถือ/สวมอยู่/ขายไม่ได้/version ชน) → reason §23. DB error หลังหักของ → surface (money-loud).
   */
  private async runShopSell(client: Client, message: ShopSellMessage): Promise<void> {
    const instanceId = String(message?.instanceId ?? "");
    const shop = shopForMap(this.state.mapId);
    const rec = this.sessionCharacters.get(client.sessionId);
    if (!shop || !rec || !inventoryPersistenceAvailable()) {
      this.sendShopReject(client, "sell", instanceId, "SHOP_ITEM_NOT_FOUND");
      return;
    }
    let result: ShopSellResult;
    try {
      result = await sellItem(
        {
          shop,
          ledger: { appendEntry: (e) => appendEntry(e) },
          inventory: getInventoryRepository(),
        },
        {
          characterId: rec.characterId,
          capacity: INVENTORY_CAPACITY,
          instanceId,
          expectedVersion: Number(message?.expectedVersion),
          quantity: Number(message?.quantity),
          idempotencyKey: String(message?.idempotencyKey ?? ""),
        },
      );
    } catch (err) {
      console.error(
        `[MapRoom ${this.roomId}] shop sell DB error ${client.sessionId} (${instanceId}): ` +
          (err instanceof Error ? err.message : String(err)),
      );
      this.sendShopReject(client, "sell", instanceId, "TRANSACTION_CONFLICT");
      return;
    }
    if (!result.ok) {
      this.sendShopReject(client, "sell", instanceId, result.reason);
      return;
    }
    const ok: ShopResultMessage = {
      op: "sell",
      ok: true,
      itemId: result.itemId,
      quantity: result.quantity,
      gold: Number(result.gold),
    };
    client.send(MSG_SHOP_RESULT, ok);
    await this.sendInventorySnapshot(client, rec.characterId);
  }

  /** P2-11: send a fresh bag/equipment snapshot after a shop mutation (equipment unchanged → no stat recompute). */
  private async sendInventorySnapshot(client: Client, characterId: string): Promise<void> {
    const items = await loadCharacterItemsBestEffort(characterId);
    client.send(MSG_INVENTORY_STATE, buildSnapshot(items, INVENTORY_CAPACITY));
  }

  /** P2-11: uniform shop reject (op + echoed item + §23 error code; quantity 0, gold unknown). */
  private sendShopReject(client: Client, op: "buy" | "sell", itemId: string, reason: string): void {
    const rejected: ShopResultMessage = { op, ok: false, itemId, quantity: 0, gold: GOLD_UNKNOWN, reason };
    client.send(MSG_SHOP_RESULT, rejected);
  }

  // ── P2-17 personal storage + delivery box ──────────────────────────────────
  /** storage service Design Knobs (config) + the account-level repo — rebuilt per call (env-free, cheap). */
  private storageServiceDeps(): StorageServiceDeps {
    return {
      repo: getStorageRepository(),
      catalog: ITEM_CATALOG,
      capacity: STORAGE_CAPACITY,
      fill: STORAGE_CONFIG.fill,
    };
  }
  private deliveryServiceDeps(): DeliveryServiceDeps {
    return {
      repo: getStorageRepository(),
      maxEntries: STORAGE_CONFIG.deliveryMaxEntries,
      warnDaysBeforeExpiry: STORAGE_CONFIG.deliveryExpiry.warnDaysBeforeExpiry,
      urgentDaysBeforeExpiry: STORAGE_CONFIG.deliveryExpiry.urgentDaysBeforeExpiry,
    };
  }

  /** unavailable snapshots (map has no storage NPC / anonymous / no DB) — client hides the storage UI. */
  private sendStorageUnavailable(client: Client): void {
    const storage: StorageStateMessage = {
      available: false,
      capacity: STORAGE_CAPACITY,
      used: 0,
      fillState: "normal",
      items: [],
    };
    const delivery: DeliveryStateMessage = {
      available: false,
      maxEntries: STORAGE_CONFIG.deliveryMaxEntries,
      used: 0,
      entries: [],
    };
    client.send(MSG_STORAGE_STATE, storage);
    client.send(MSG_DELIVERY_STATE, delivery);
  }

  /**
   * P2-17: open the storage NPC → send both the account-storage snapshot (§11.1) and the delivery snapshot
   * (§16.6, with server-computed expiry status). Gated by map (§10.4) + a character-bound session + DB.
   */
  private async handleStorageOpen(client: Client): Promise<void> {
    const rec = this.sessionCharacters.get(client.sessionId);
    if (!storageAvailableForMap(this.state.mapId) || !rec || !inventoryPersistenceAvailable()) {
      this.sendStorageUnavailable(client);
      return;
    }
    try {
      const stored = await getStorageRepository().listAccountStorage(rec.accountId);
      const storage = buildStorageSnapshot(stored, STORAGE_CAPACITY, STORAGE_CONFIG.fill, true);
      const delivery = await buildDeliverySnapshot(this.deliveryServiceDeps(), rec.accountId, Date.now(), true);
      client.send(MSG_STORAGE_STATE, storage);
      client.send(MSG_DELIVERY_STATE, delivery);
    } catch (err) {
      console.warn(
        `[MapRoom ${this.roomId}] storage open DB error ${client.sessionId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      this.sendStorageUnavailable(client);
    }
  }

  /**
   * P2-17: deposit/withdraw one item between the bag and account storage (§13/§14) — server-authoritative +
   * idempotent (replay = no-op). Success → MSG_STORAGE_RESULT(ok) + MSG_STORAGE_STATE + MSG_INVENTORY_STATE.
   * Business reject → reason (§13.2/§14). DB error → surface (never-downgrade: an un-persisted move must not
   * look done) as TRANSACTION_CONFLICT so the client re-syncs.
   */
  private async runStorageMove(
    client: Client,
    op: StorageOp,
    message: StorageMoveMessage,
  ): Promise<void> {
    const instanceId = String(message?.instanceId ?? "");
    const rec = this.sessionCharacters.get(client.sessionId);
    if (!storageAvailableForMap(this.state.mapId) || !rec || !inventoryPersistenceAvailable()) {
      this.sendStorageReject(client, op, instanceId, "STORAGE_UNAVAILABLE");
      return;
    }
    const intent = {
      accountId: rec.accountId,
      characterId: rec.characterId,
      instanceId,
      expectedVersion: Number(message?.expectedVersion),
      idempotencyKey: String(message?.idempotencyKey ?? ""),
    };
    let result: StorageOpResult;
    try {
      result =
        op === "deposit"
          ? await depositToStorage(this.storageServiceDeps(), intent)
          : await withdrawFromStorage(this.storageServiceDeps(), { ...intent, bagCapacity: INVENTORY_CAPACITY });
    } catch (err) {
      console.error(
        `[MapRoom ${this.roomId}] storage ${op} DB error ${client.sessionId} (${instanceId}): ` +
          (err instanceof Error ? err.message : String(err)),
      );
      this.sendStorageReject(client, op, instanceId, "TRANSACTION_CONFLICT");
      return;
    }
    if (!result.ok) {
      this.sendStorageReject(client, op, instanceId, result.reason);
      return;
    }
    const ok: StorageResultMessage = { op, ok: true, instanceId };
    client.send(MSG_STORAGE_RESULT, ok);
    client.send(MSG_STORAGE_STATE, result.storage);
    await this.sendInventorySnapshot(client, rec.characterId);
  }

  /**
   * P2-17: claim one delivery entry's items into the bag (§16.5) — all-or-nothing per entry, idempotent.
   * Success → MSG_DELIVERY_RESULT(ok, granted) + MSG_DELIVERY_STATE + MSG_INVENTORY_STATE. Reject → reason.
   */
  private async runDeliveryClaim(client: Client, message: DeliveryClaimMessage): Promise<void> {
    const entryId = String(message?.entryId ?? "");
    const rec = this.sessionCharacters.get(client.sessionId);
    if (!storageAvailableForMap(this.state.mapId) || !rec || !inventoryPersistenceAvailable()) {
      this.sendDeliveryReject(client, entryId, "STORAGE_UNAVAILABLE");
      return;
    }
    let result: DeliveryClaimResult;
    try {
      result = await claimDeliveryEntry(this.deliveryServiceDeps(), {
        accountId: rec.accountId,
        characterId: rec.characterId,
        entryId,
        bagCapacity: INVENTORY_CAPACITY,
        nowMs: Date.now(),
        idempotencyKey: String(message?.idempotencyKey ?? ""),
      });
    } catch (err) {
      console.error(
        `[MapRoom ${this.roomId}] delivery claim DB error ${client.sessionId} (${entryId}): ` +
          (err instanceof Error ? err.message : String(err)),
      );
      this.sendDeliveryReject(client, entryId, "TRANSACTION_CONFLICT");
      return;
    }
    if (!result.ok) {
      this.sendDeliveryReject(client, entryId, result.reason);
      return;
    }
    const ok: DeliveryResultMessage = { ok: true, entryId, granted: result.granted };
    client.send(MSG_DELIVERY_RESULT, ok);
    client.send(MSG_DELIVERY_STATE, result.delivery);
    await this.sendInventorySnapshot(client, rec.characterId);
  }

  /** P2-17: uniform storage reject (op + echoed instance + §13.2 error code). */
  private sendStorageReject(client: Client, op: StorageOp, instanceId: string, reason: string): void {
    const rejected: StorageResultMessage = { op, ok: false, instanceId, reason };
    client.send(MSG_STORAGE_RESULT, rejected);
  }

  /** P2-17: uniform delivery reject (echoed entry + §16 error code; empty grant). */
  private sendDeliveryReject(client: Client, entryId: string, reason: string): void {
    const rejected: DeliveryResultMessage = { ok: false, entryId, granted: [], reason };
    client.send(MSG_DELIVERY_RESULT, rejected);
  }

  async onJoin(client: Client, options: JoinOptions): Promise<void> {
    // P2-05 (Storage §5/§22): accountId + characterId ที่ onAuth verify ownership แล้ว (null = anonymous/dev).
    const accountId = accountIdOf(client);
    const characterId = characterIdOf(client);

    // P1-07 (§59.1): server = source of truth ว่า spawn ลงได้จริง. พิกัดที่ client ส่ง (fresh join /
    // reconnect เกิน grace) ถ้าเดินไม่ได้/ไม่ finite → snap ไป safe camp. (within-grace reconnect ไม่ผ่าน
    // onJoin เลย → ตำแหน่งเดิมคงอยู่ ไม่ถูก resolve ซ้ำ.)
    const optionPos: ReconnectVec2 = {
      tx: options?.tx ?? this.safeCamp.tx,
      ty: options?.ty ?? this.safeCamp.ty,
    };

    // P2-05 (Storage §5/§7): มีตัวละคร + DB → โหลด CharacterState. ใช้ตำแหน่ง save เฉพาะเมื่ออยู่ map
    // เดียวกับ room นี้ (pickLoadPosition) — ไม่งั้นใช้ตำแหน่งที่ client ขอ (spawn/targetSpawn). best-effort:
    // ไม่มี DB/ไม่มี row (ตัวใหม่) → null → spawn default. (client boot ด้วย mapId ที่ save ไว้ล่าสุดแล้ว
    // — owner-report#6 fix, src/engine/net/character-session.ts pickBootMapId — ปกติ this.state.mapId
    // ตรงกับ saved.mapId; ไม่ตรง = fallback ตามปกติ ไม่ crash.)
    const saved = accountId && characterId ? await loadCharacterState(characterId) : null;
    const requested = pickLoadPosition(saved, this.state.mapId, optionPos);
    const spawn = resolveSpawnPosition(requested, this.safeCamp, this.isWalkableAt);

    const player = new PlayerState();
    player.tx = spawn.pos.tx;
    player.ty = spawn.pos.ty;
    player.direction = options?.direction ?? "S";
    player.anim = options?.anim ?? "idle";
    // P1-08: partyId ระดับ room (filterBy การันตีตรงกันทุก client ในห้อง) — ให้ client อื่นรู้ party membership.
    player.partyId = this.partyId;
    this.state.players.set(client.sessionId, player);
    // valid position เริ่มต้น = จุด spawn (หลัง resolve safe camp); เวลาเริ่ม = now
    this.trackers.set(client.sessionId, {
      tx: player.tx,
      ty: player.ty,
      lastMoveTime: Date.now(),
      lastCorrectionTime: 0,
      // P1-10: spawn อยู่นอก exit area (targetSpawn ออกแบบมานอก exit ปลายทาง) → เริ่ม null.
      lastExitId: null,
      // P2-13 (D-056): เพิ่ง join = active (นับ idle จากตอนนี้) + จุดอ้าง connection duration (hard cap inert).
      lastInputMs: Date.now(),
      connectedAtMs: Date.now(),
    });
    if (spawn.usedSafeCamp) {
      console.log(
        `[MapRoom ${this.roomId}] ${client.sessionId} spawn ที่ safe camp ` +
          `(${this.safeCamp.tx},${this.safeCamp.ty}) — พิกัดที่ขอ (${requested.tx},${requested.ty}) invalid (§59.1)`,
      );
    }
    // P1-05: cooldown state ต่อ player (ว่างตอน join → ทุกสกิลพร้อมใช้)
    this.cooldowns.set(client.sessionId, new Map());
    // P2-09: โหลด progression (level/exp) best-effort → ตั้ง base combat stat ตามเลเวล (D-055 §2). ไม่มี
    //   DB/ตัวละคร → lv1 (in-memory). ต้องตั้งก่อน applyEquipmentStats เพื่อให้ base ถูกต้องตั้งแต่เฟรมแรก.
    const progress = (characterId ? await loadCharacterProgress(characterId) : null) ?? { level: 1, exp: 0 };
    this.sessionProgress.set(client.sessionId, { level: progress.level, exp: progress.exp });
    // P2-07: combat stats เริ่มต้น = base ตามเลเวล — override ด้วย equipment bonus หลังโหลด inventory ด้านล่าง.
    this.recomputeEffectiveStats(client.sessionId);

    // P2-04 (Storage §4.1/§4.2): มี accountId (verified token) → ยึด 1-active-session ต่อบัญชี.
    //   in-process registry เตะ session เดิมของ account เดียวกัน (SESSION_TAKEN_OVER, takeover-wins);
    //   DB lease = authority ข้าม process (best-effort — dev/e2e ไม่มี accountId/DB → ข้าม ไม่พัง join).
    if (accountId) {
      const tookOver = claimSession(accountId, client.sessionId, () => this.forceTakeover(client));
      if (tookOver) {
        console.log(
          `[MapRoom ${this.roomId}] account ${accountId} takeover — เตะ session เดิม (§4.2)`,
        );
      }
      void acquireLease(accountId, client.sessionId);
    }

    // P2-05 (Storage §7.2/§24): ผูก session กับตัวละคร → เปิด save cycle + ตั้ง lastPlayedCharacterId (Continue
    //   default). เฉพาะเมื่อมีทั้ง accountId + characterId (verified). anonymous/dev = ไม่ persist (flow เดิม).
    if (accountId && characterId) {
      this.sessionCharacters.set(client.sessionId, {
        accountId,
        characterId,
        lastSaveMs: Date.now(),
      });
      void updateLastPlayed(accountId, characterId);
    }

    // P2-07 (Storage §22 · TA §7/§8): ส่ง inventory/equipment snapshot ตอน join + ตั้ง combat stats จากของที่สวม.
    //   best-effort load (ไม่มี DB/ตัวละคร → []); anonymous ก็ได้ snapshot ว่างเพื่อ init HUD (flow เดิมไม่พัง).
    const items = characterId ? await loadCharacterItemsBestEffort(characterId) : [];
    const snapshot = buildSnapshot(items, INVENTORY_CAPACITY);
    client.send(MSG_INVENTORY_STATE, snapshot);
    this.applyEquipmentStats(client.sessionId, snapshot.equipment);
    // A1/A2 (§10): เกิดเต็ม hp (maxHp = effective hp ที่ applyEquipmentStats set แล้ว). within-grace reconnect
    // ไม่ผ่าน onJoin → hp เดิมคงอยู่ (reconnect ไม่ heal); grace หมด = fresh join → เต็ม hp ที่ตำแหน่ง resolve.
    player.maxHp = this.maxHpFor(client.sessionId);
    player.hp = player.maxHp;

    console.log(
      `[MapRoom ${this.roomId}] join ${client.sessionId} @(${player.tx.toFixed(1)},${player.ty.toFixed(1)}) — ${this.clients.length} online`,
    );
  }

  /**
   * P2-04 (§4.2): เตะ session เก่าเมื่อ account เดียวกันเข้าเล่นจาก tab/device ใหม่. mark sessionId ไว้ก่อน
   * (onLeave จะเห็น → ลบทันทีไม่เข้า grace) แล้วสั่ง client.leave(SESSION_TAKEN_OVER). best-effort (client
   * อาจหลุดไปแล้วถ้ากำลังอยู่ใน grace ตัวเอง).
   */
  private forceTakeover(client: Client): void {
    this.takenOverSessions.add(client.sessionId);
    try {
      client.leave(WS_CLOSE_SESSION_TAKEN_OVER);
    } catch {
      // client ปิดไปแล้ว — grace/dispose จะเก็บกวาดเอง
    }
  }

  /**
   * P2-04: ปล่อย session ระดับบัญชี (registry + DB lease) เมื่อ player ถูกลบจริง — เฉพาะถ้ายังเป็นของ session
   * ตัวเอง (takeover-wins: ตัวเก่าที่เพิ่งถูกเตะจะไม่ปล่อย lease/registry ของตัวใหม่). no-op ถ้าไม่มี accountId.
   */
  private releaseAccountSession(client: Client): void {
    const accountId = accountIdOf(client);
    if (!accountId) return;
    releaseSession(accountId, client.sessionId);
    void releaseLease(accountId, client.sessionId);
  }

  /**
   * P1-07: ลบ player ออกจาก state + tracker + cooldown จริง (หลัง consented leave หรือ grace หมด).
   * client อื่นเห็น entity หายผ่าน schema removal. P2-05: เก็บกวาด session↔character binding ด้วย.
   */
  private removePlayer(sessionId: string, reason: string): void {
    this.state.players.delete(sessionId);
    this.trackers.delete(sessionId);
    this.cooldowns.delete(sessionId);
    this.effectiveStats.delete(sessionId);
    this.sessionProgress.delete(sessionId);
    this.sessionEquipment.delete(sessionId);
    this.sessionCharacters.delete(sessionId);
    this.transitioningSessions.delete(sessionId);
    console.log(`[MapRoom ${this.roomId}] remove ${sessionId} (${reason})`);
  }

  /**
   * P2-05 (Storage §24): save CharacterState ของ 1 session (best-effort). throttle ด้วย shouldSaveNow เว้น
   * `force` (transition/leave). ตำแหน่ง = tracker.tx/ty (valid ล่าสุด, ผ่าน validateMove = walkable เสมอ) —
   * pickSavePosition guard อีกชั้น (non-finite/non-walkable → safe camp). ต้องมี tracker+player อยู่.
   */
  private persistSession(sessionId: string, force: boolean): void {
    const rec = this.sessionCharacters.get(sessionId);
    if (!rec) return;
    const now = Date.now();
    if (!force && !shouldSaveNow(rec.lastSaveMs, now, this.saveIntervalMs)) return;
    const tracker = this.trackers.get(sessionId);
    if (!tracker) return;
    const pos = pickSavePosition(
      { tx: tracker.tx, ty: tracker.ty },
      { tx: this.safeCamp.tx, ty: this.safeCamp.ty },
      this.isWalkableAt,
    );
    rec.lastSaveMs = now;
    void saveCharacterState(rec.characterId, this.state.mapId, pos.tx, pos.ty);
    // P2-09: persist progression on the same throttled cycle (level-up already saved promptly on gain).
    const prog = this.sessionProgress.get(sessionId);
    if (prog) void saveCharacterProgress(rec.characterId, prog.level, prog.exp);
  }

  /** P2-05: interval save ทุก session ที่ผูกตัวละคร (throttled) — เรียกจาก clock.setInterval (onCreate). */
  private saveAllCharacters(): void {
    this.sessionCharacters.forEach((_rec, sessionId) => this.persistSession(sessionId, false));
  }

  /**
   * P2-13 (D-056): บันทึกว่ามี input (movement/cast) → reset idle timer + เคลียร์ป้าย AFK ทันที. tracker
   * undefined (race: cast มาก่อน tracker set / หลัง remove) → no-op เงียบ ๆ. ไม่เขียน schema ถ้า isAfk เดิม
   * false อยู่แล้ว (กัน schema patch ฟรี ๆ ทุก MSG_MOVE).
   */
  private markInput(sessionId: string, tracker: MoveTracker | undefined, nowMs: number): void {
    if (!tracker) return;
    tracker.lastInputMs = nowMs;
    const player = this.state.players.get(sessionId);
    if (player && player.isAfk) player.isAfk = false;
  }

  /**
   * P2-13 (D-056 · GS §59.1.3): ทุก 1s — ตั้ง/ถอดป้าย AFK ตาม idle (no movement/cast ครบ idleIndicatorSec).
   * เขียน schema เฉพาะเมื่อค่าเปลี่ยน (กัน patch ฟรี). **ไม่มี disconnect** — character ค้างในโลกต่อ (D-056
   * supersede §59.1.2 forced disconnect ทั้งชุด). afkHardCapHours = จุดเช็ค inert (null → exceedsAfkHardCap
   * คืน false เสมอ → ไม่มีวันตัด). > 0 (เปิดตอน open alpha) → เอา client ออกด้วย consented leave.
   */
  private evaluateAfk(): void {
    const now = Date.now();
    this.trackers.forEach((tracker, sessionId) => {
      const player = this.state.players.get(sessionId);
      if (!player) return;
      const afk = isIdleAfk(tracker.lastInputMs, now, this.afkIdleIndicatorSec);
      if (player.isAfk !== afk) player.isAfk = afk;
      // hard cap: inert ใน P2 (afkHardCapHours=null → false เสมอ). เดินสายไว้ให้ open alpha เปิดได้โดยไม่
      //   แก้ flow — เกินเพดาน → consented leave (ลบทันที ไม่เข้า grace เหมือนออกเอง).
      if (exceedsAfkHardCap(tracker.connectedAtMs, now, this.afkHardCapHours)) {
        const client = this.clients.find((c) => c.sessionId === sessionId);
        if (client) {
          console.log(
            `[MapRoom ${this.roomId}] ${sessionId} เกิน afkHardCapHours (${this.afkHardCapHours}h) — เอาออก`,
          );
          client.leave();
        }
      }
    });
  }

  /**
   * P2-05: save ตอน player ออกจริง (consented leave / grace หมด). force เขียนตำแหน่งปัจจุบัน **เว้น** ถ้า
   * กำลัง transition (checkExit save จุดหมายไปแล้ว → ไม่ทับด้วย map เก่า). เรียกก่อน removePlayer เสมอ
   * (ต้องมี tracker/rec อยู่). takeover ไม่เรียก (session ใหม่ authoritative แล้ว).
   */
  private persistOnLeave(sessionId: string): void {
    if (this.transitioningSessions.has(sessionId)) return; // transition save จุดหมายไปแล้ว
    this.persistSession(sessionId, true);
  }

  /**
   * P1-07 reconnect 30s grace (GS §59.1 · TA §6). แยก 2 เส้นทาง:
   *   consented (client เรียก room.leave() ตั้งใจออก) → ลบทันที (ไม่ต้อง grace).
   *   unexpected disconnect (ws หลุด, consented=false) → allowReconnection hold state `graceSeconds` วิ:
   *     - reconnect ทันใน grace → Deferred resolve → **ไม่ลบอะไร** → PlayerState/MoveTracker/cooldown
   *       ที่ผูกกับ sessionId เดิมยังอยู่ครบ = ตำแหน่ง/channel/cooldown เดิม restore อัตโนมัติ (ไม่ผ่าน onJoin).
   *     - grace หมด / reject → Deferred throw → removePlayer จริง; client รอบถัดไป = fresh join → safe camp.
   * ระหว่าง grace: client อื่นยังเห็น player นี้ค้างใน state (Colyseus hold state จน expire — documented).
   */
  async onLeave(client: Client, consented?: boolean): Promise<void> {
    const sessionId = client.sessionId;

    // P2-04 (§4.2): ถูกเตะด้วย SESSION_TAKEN_OVER → ลบทันที ไม่เข้า grace (ตั้งใจเตะ ไม่ใช่หลุดเน็ต).
    //   ไม่ releaseAccountSession — registry/lease เป็นของ session ใหม่ที่ยึดไปแล้ว (releaseSession scope ด้วย
    //   sessionId ก็ no-op อยู่ดี แต่ข้ามไปเลยชัดกว่า).
    const wasTakenOver = this.takenOverSessions.delete(sessionId);
    if (wasTakenOver) {
      this.removePlayer(sessionId, "taken_over");
      return;
    }

    if (consented) {
      // P2-05: save ตำแหน่งล่าสุดก่อนลบ (เว้นถ้ากำลัง transition — checkExit save จุดหมายไปแล้ว).
      this.persistOnLeave(sessionId);
      this.releaseAccountSession(client);
      this.removePlayer(sessionId, "consented");
      return;
    }

    // A2 (§10/§59.1): death → respawn เป็น **instant server-side** (hp เต็ม + ย้าย safe camp ทันทีตอน hp≤0)
    //   → ไม่มี "critical state" ค้างให้ disconnect หนีได้ (bypass ไม่ได้ตั้งแต่ต้นทาง). within-grace reconnect
    //   resume state ที่ respawn แล้ว; grace หมด = fresh join → safe camp. TODO(PvP/boss critical, post-OB):
    //   ถ้าอนาคตมี death ที่มี window (revive/PvP down state) ต้องบังคับ safe camp ตอนกลับตรงนี้ (§59.1 guardrail).
    console.log(
      `[MapRoom ${this.roomId}] ${sessionId} หลุด — เริ่ม grace ${this.graceSeconds}s (§59.1)`,
    );
    try {
      await this.allowReconnection(client, this.graceSeconds);
      console.log(
        `[MapRoom ${this.roomId}] ${sessionId} reconnect สำเร็จใน grace — resume ตำแหน่ง/channel เดิม`,
      );
    } catch {
      // grace หมด → ลบจริง + ปล่อย session ระดับบัญชี (registry/DB lease). ถ้าระหว่าง grace ถูก account
      // เดียวกัน takeover (forceTakeover mark sessionId ตอน await กำลังรอ) → เก็บกวาด set ที่นี่ด้วย.
      // P2-05: save ตำแหน่งล่าสุดก่อนลบ (ผู้เล่นหลุดจริง ไม่กลับใน grace) — เว้นถ้าถูก takeover (ตัวใหม่คุมแล้ว).
      const wasTakenOverDuringGrace = this.takenOverSessions.delete(sessionId);
      if (!wasTakenOverDuringGrace) this.persistOnLeave(sessionId);
      this.releaseAccountSession(client);
      this.removePlayer(sessionId, "grace_expired");
    }
  }

  /**
   * P1-08: คืนเลข channel เข้า pool ตอน room ถูกทำลาย (ไม่มี client แล้ว) → เลข CH ถูก reuse
   * (ไม่พุ่งไม่รู้จบเมื่อ channel เกิด-ดับ). single-process (channelRegistry = module-level singleton).
   */
  onDispose(): void {
    channelRegistry.release(this.state.mapId, this.assignedChannelId);
    console.log(
      `[MapRoom ${this.roomId}] dispose ${this.state.mapId} ${this.assignedChannelId} — release channel`,
    );
  }
}
