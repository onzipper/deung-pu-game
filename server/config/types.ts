// P2-09 — Server-side economy/reinforcement config types (Design Knob §48, TA §7/§8).
//
// ⛔ SERVER-ONLY: drop tables / rates are server-authoritative and MUST NOT enter the client bundle
//    (TA §6.2 — server judges drops/RNG). Do NOT import server/config/** from src/engine|game|ui.
//    Plain TS only — no @prisma/client, no React, no pixi. Loader mocks a minimal Prisma seam.
//
// Source of truth for every value here (never guess — AI.md iron-rule #1):
//   • EXP curve / level-diff / party ............ Economy §9
//   • monster rewards / drop tables / pools ...... Economy §10–§11 (Kraeng rows SUPERSEDED → 0%)
//   • milestone Gold ............................. D-053 / Economy §18.3
//   • enhancement multiplier +0..+15 ............. D-054 / Economy §16.3 + §16.3.1
//   • reinforcement drop / pity / fragment ....... Reinforcement doc §3.5/§4 (+ NO_REINFORCEMENT flag, R8)

// ── phase tag ────────────────────────────────────────────────────────────────
/** เฟสที่ entity นี้ "มีผลจริง" — P2 = ใช้งาน P2 · P2B = config ไว้ก่อน (boss/fragment ยังไม่ ship). */
export type EconomyPhase = "P2" | "P2B";

// ── EXP curve (Economy §9) ───────────────────────────────────────────────────
/** 1 แถวของ EXP curve (§9.2). ที่ level cap: expToNext = 0. */
export interface ExpLevelRow {
  /** เลเวลปัจจุบัน */
  level: number;
  /** EXP ที่ต้องเก็บเพื่อขึ้นเลเวลถัดไป (0 = ตันที่ cap) */
  expToNext: number;
  /** EXP สะสมรวม = ผลรวม expToNext ตั้งแต่ lv1 ถึงแถวนี้ (§9.2 "Cumulative EXP") */
  cumulative: number;
}

/** ตัวคูณ EXP ตามผลต่างเลเวล (monsterLevel − playerLevel) — §9.3 (ใช้กับ Monster EXP เท่านั้น). */
export interface ExpLevelDiffModifier {
  monsterMinusPlayerAtLeast2: number; // +2 ขึ้นไป
  monsterMinusPlayer1: number;
  monsterMinusPlayer0: number;
  monsterMinusPlayerMinus1: number;
  monsterMinusPlayerMinus2: number;
  monsterMinusPlayerMinus3: number;
  monsterMinusPlayerMinus4: number;
  monsterMinusPlayerAtMostMinus5: number; // −5 ลงไป
}

/** Party EXP pool (§9.4). */
export interface PartyExpConfig {
  enabled: boolean;
  /** +poolMultiplier ต่อสมาชิกเกิน 1 คน */
  poolMultiplierPerExtraMember: number;
  /** เพดานตัวคูณ pool */
  poolMultiplierCap: number;
  /** หาร pool เท่า ๆ กันในสมาชิกที่มีสิทธิ์ */
  splitAmongEligibleMembers: boolean;
}

export interface ExpCurveConfig {
  /** เพดานเลเวล P2 (§9.1) */
  levelCap: number;
  /** curve ต่อเลเวล (§9.2) — index ไม่สำคัญ, ใช้ field `level` */
  levels: ExpLevelRow[];
  /** ตัวคูณตามผลต่างเลเวล (§9.3) */
  levelDiffModifier: ExpLevelDiffModifier;
  /** เพดาน high-level bonus (§9.3 "cap 120%") */
  highLevelBonusCap: number;
  party: PartyExpConfig;
}

// ── player progression baseline (D-055 §2, Locked) ───────────────────────────
/**
 * 1 แถวของ player combat baseline ต่อเลเวล (นักดาบ lv1–10, D-055 §2 production lock).
 * engine config ถือแค่ lv1 (src/engine/config/combat.ts) — lv2–10 progression = server-side (ตามหมายเหตุ
 * combat.ts:182: "lv2–10 progression = server-side level-up · server/config economy §9"). secondary stats
 * (crit/critDmg/penetration/speed) คงที่ทุกเลเวล → อ่านจาก engine lv1 baseline (D-055 §2 "Secondary" คงที่).
 */
export interface PlayerBaselineRow {
  level: number;
  hp: number;
  atk: number;
  def: number;
}

// ── drop tables (Economy §10–§11, schema §21.2/§21.3) ────────────────────────
export interface DropQuantity {
  min: number;
  max: number;
}

/** entry การันตี (guaranteed[]) — อ้าง itemId ตรง หรือ poolId (สุ่มจาก weighted pool). */
export interface DropGuaranteedEntry {
  itemId: string | null;
  poolId: string | null;
  quantity: DropQuantity;
}

/** 1 roll (§21.3 rolls[]) — chancePercent 0–100, ออก itemId ตรง หรือสุ่มจาก poolId. */
export interface DropRoll {
  rollId: string;
  chancePercent: number;
  itemId: string | null;
  poolId: string | null;
  quantity: DropQuantity;
}

export interface DropTable {
  dropTableId: string;
  monsterId: string;
  phase: EconomyPhase;
  guaranteed: DropGuaranteedEntry[];
  rolls: DropRoll[];
}

/** weighted equipment pool — เลือก 1 ชิ้นตาม weight เมื่อ roll/guaranteed ชี้มาที่ poolId นี้. */
export interface EquipmentPoolEntry {
  itemId: string;
  weight: number;
}
export interface EquipmentPool {
  poolId: string;
  entries: EquipmentPoolEntry[];
}

/** reward baseline ต่อ monster (§10.1 / §21.2) — combat stat อยู่ engine config (D-055), ไม่ซ้ำที่นี่. */
export interface MonsterReward {
  monsterId: string;
  level: number;
  exp: number;
  goldMin: number;
  goldMax: number;
  /** วินาที respawn (0 = encounter-based, ไม่ตั้งเวลา — boss §10.1) */
  respawnSeconds: number;
  dropTableId: string;
  phase: EconomyPhase;
}

// ── milestone rewards (D-053 / Economy §18) ──────────────────────────────────
/** item bundle ในรางวัล milestone (เช่น potion) — Kraeng/เสริมแกร่ง = 0 (D-053, ไม่แจกแล้ว). */
export interface MilestoneItemGrant {
  itemId: string;
  quantity: number;
}
export interface MilestoneReward {
  milestoneId: string;
  phase: EconomyPhase;
  exp: number;
  /** Gold รวมที่ใช้จริง (§18.3 — คอลัมน์ Gold เดิม + Gold แทน Kraeng ของ 5 แถว D-053) */
  gold: number;
  items: MilestoneItemGrant[];
}

// ── enhancement multiplier curve (D-054 / Economy §16.3 + §16.3.1) ───────────
export interface EnhancementCurveConfig {
  /** เพดาน +N (D-048 = 15) */
  maxLevel: number;
  /** multiplier ต่อ enhancement level — index = ระดับ +N (0..maxLevel); +15 = 2.80 (D-054) */
  multipliers: number[];
  /** rule "minimum increase +1 เมื่อข้ามระดับที่ multiplier เพิ่ม" (§16.3) */
  minIncreasePerLevel: number;
  /** stat ที่ถูก scale ต่อระดับ (§16.3 — Attack/Defense/Max HP/Break Power; Crit/Move ไม่ scale) */
  scaledStats: string[];
}

// ── starter shop (Economy §8 · §21.4) ────────────────────────────────────────
/**
 * 1 buy-catalog entry (§8.2 / §21.4 shopEntry). `buyPrice` = Gold to purchase 1 unit; `unlockCondition` =
 * gate key (§8.2 "Unlock" column — P2: "immediate" | "shop_tutorial_complete"). Stock = unlimited in P2
 * (§8.3 "ไม่มี Restock System") so no stock field is modeled.
 */
export interface ShopEntry {
  itemId: string;
  buyPrice: number;
  unlockCondition: string;
}

/**
 * starter NPC shop (Economy §8, LOCKED). `mapId` = the map the shop NPC lives in (§8.1 starter district /
 * city hub) — the server accepts shop MSGs only when the client is on this map (server-authoritative
 * availability). `entries` = the buy catalog (§8.2, 6 items). `sellPrices` = per-item Gold the player
 * receives on sell (§7 "Sell" column / §8.3 "Sell price อ่านจาก Item Definition"): an itemId absent from the
 * map (or mapped to null) is **unsellable** (§8.3/§14.4 — Kraeng/quest items ขายไม่ได้).
 */
export interface ShopConfig {
  shopId: string;
  mapId: string;
  entries: ShopEntry[];
  sellPrices: Record<string, number | null>;
}

// ── economy config (bundle) ──────────────────────────────────────────────────
export interface EconomyConfig {
  /** §2.2 — log ทุก transaction ด้วย version นี้ */
  economyVersion: string;
  effectiveFrom: string;
  expCurve: ExpCurveConfig;
  /** player combat baseline ต่อเลเวล (D-055 §2) — level-up ฝั่ง server อ่านค่านี้เป็น base stat. */
  playerBaseline: PlayerBaselineRow[];
  monsterRewards: MonsterReward[];
  dropTables: DropTable[];
  equipmentPools: EquipmentPool[];
  milestones: MilestoneReward[];
  enhancementCurve: EnhancementCurveConfig;
  /** starter NPC shop (Economy §8) — buy catalog + per-item sell prices. */
  shop: ShopConfig;
}

// ── reinforcement / fragment / pity (Reinforcement doc §3.5/§4) ──────────────
/** แหล่งดรอปเสริมแกร่งตามชนิด content (§4.1/§4.4) — Map 1 baseline. */
export interface ReinforcementSources {
  normalMonsterDropChancePercent: number; // 0 (§4.1)
  normalEliteDropChancePercent: number; // 0 (§4.1)
  specialEliteDropChancePercent: number; // Map 1 = 0 (baseline 0.5 แต่ Map 1 ยังไม่มี special elite — §4.4)
  mapBossDropChancePercent: number; // 8 (§4.1 แหล่งหลัก)
}

/** Bad-luck protection สำหรับ Map Boss (§4.2) — per-account-per-boss, reset เมื่อได้ของ. */
export interface ReinforcementBossPity {
  baseDropChancePercent: number; // 8
  startIncreasingAfterClears: number; // 8 (รอบ 1–8 = base)
  increasePerClearPercent: number; // +4%/clear หลังจากนั้น
  guaranteedAtClear: number; // 15 = การันตี
  resetOnDrop: boolean; // true
  scope: "account-per-boss";
}

/** เศษเสริมแกร่ง (§3.5) — roll แยกจากตัวเต็ม, แลก 5→1. ทั้งชุด phase P2B. */
export interface ReinforcementFragment {
  materialId: string; // upg_reinforcement_fragment
  source: "map_boss_only";
  fragmentDropChancePercent: number; // 10.7 (baseline เคาะแล้ว, จูน telemetry P2B)
  quantity: number; // 1
  personalLoot: boolean; // true
  /** สูตรแลก: exchangeInputCount เศษ → exchangeOutputCount ตัวเต็ม (5→1) */
  exchangeInputCount: number;
  exchangeOutputCount: number;
  phase: EconomyPhase; // P2B
}

// ── item sharing policy (Storage §12.1, S3 static per-type config) ───────────
/**
 * bind class of an item type (Storage §12.1) — static per-type Design Knob (S3: NOT a DB column; the
 * per-instance DB row only carries expiresAt/uniqueEquipGroup). CHARACTER_BOUND ห้ามฝากคลัง (§12.4).
 */
export type ItemBindType = "UNBOUND" | "ACCOUNT_BOUND" | "CHARACTER_BOUND";
/** whether a type may be deposited into account storage (§12.2–§12.4). CONDITIONAL = ต้องปลดเงื่อนไขก่อน. */
export type ItemStoragePolicy = "ALLOWED" | "CONDITIONAL" | "BLOCKED";
/** trade class (§12.1). P2 ทั้งหมด = NONE (ยังไม่มี market §18.1). */
export type ItemTradePolicy = "NONE" | "MARKET" | "DIRECT_FUTURE";

/** sharing policy triple ต่อ item type (§12.1) — อ่านจาก item catalog (Design Knob), ไม่เก็บใน DB (S3). */
export interface ItemSharingPolicy {
  bindType: ItemBindType;
  storagePolicy: ItemStoragePolicy;
  tradePolicy: ItemTradePolicy;
}

// ── personal storage + delivery box (Storage §10–§16) ────────────────────────
/** fill-state thresholds ของคลัง (§15.1: 80% neutral warn, 90% warning; 100% = full โดยปริยาย). */
export interface StorageFillThresholds {
  /** เริ่มสถานะ warn (§15.1 = 80). */
  warnPercent: number;
  /** เริ่มสถานะ alert (§15.1 = 90). */
  alertPercent: number;
}

/**
 * expiry policy ของ Delivery Box ต่อ source (§16.4) — days ตั้งแต่ createdAt (null = ไม่หมดอายุ).
 * warn/urgent = เกณฑ์แจ้งเตือน (§16.4 "แจ้งเตือน 7 วัน / 1 วัน") — server คำนวณสถานะจาก expiresAt.
 */
export interface DeliveryExpiryConfig {
  /** วันหมดอายุต่อ DeliverySource (schema enum) — null = never. keyed by source string. */
  daysBySource: Record<string, number | null>;
  /** แจ้งเตือนเมื่อเหลือ ≤ N วัน (§16.4 = 7). */
  warnDaysBeforeExpiry: number;
  /** แจ้งเตือนเร่งด่วนเมื่อเหลือ ≤ N วัน (§16.4 = 1). */
  urgentDaysBeforeExpiry: number;
}

/**
 * personal storage + delivery config (Storage §10/§15/§16). `capacity` = account-shared slots (§10.1 = 200);
 * `accessMapIds` = map(s) ที่ storage NPC เข้าถึงได้ (§10.4 safe town) — server-authoritative availability
 * (เหมือน shop.mapId). `deliveryMaxEntries` = §16.3 = 50.
 */
export interface StorageConfig {
  capacity: number;
  accessMapIds: string[];
  fill: StorageFillThresholds;
  deliveryMaxEntries: number;
  deliveryExpiry: DeliveryExpiryConfig;
}

export interface ReinforcementConfig {
  /** ไอเทมเสริมแกร่ง (§3.1) — canonical id `upg_reinforcement` (rename จาก upg_kraeng, R10). */
  materialId: string;
  /** boss ที่ pity ผูกด้วย (scope account-per-boss) — Map 1 = boss_map1_resonant_guardian. */
  bossId: string;
  /** First Kill ไม่การันตีเสริมแกร่ง (§4.3) */
  firstKillGuaranteed: boolean;
  sources: ReinforcementSources;
  bossPity: ReinforcementBossPity;
  fragment: ReinforcementFragment;
  /**
   * P2 flag (R8): Map 1 ไม่มีแหล่งเสริมแกร่งจริงจน P2B (boss=P2B, special elite=0%).
   * true = enhancement UI ship แบบ inert (state `NO_REINFORCEMENT`); ห้ามยิง drop event จริงใน P2.
   */
  noReinforcement: boolean;
}
