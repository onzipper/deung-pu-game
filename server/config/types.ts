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

// ── economy config (bundle) ──────────────────────────────────────────────────
export interface EconomyConfig {
  /** §2.2 — log ทุก transaction ด้วย version นี้ */
  economyVersion: string;
  effectiveFrom: string;
  expCurve: ExpCurveConfig;
  monsterRewards: MonsterReward[];
  dropTables: DropTable[];
  equipmentPools: EquipmentPool[];
  milestones: MilestoneReward[];
  enhancementCurve: EnhancementCurveConfig;
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
