// P2-09 — DEFAULT economy config (server-authoritative Design Knobs).
// Values copied verbatim from the cited § (never typed from memory — AI.md iron-rule #1).
// This is the in-code fallback; the loader prefers an active `config_versions` row (loader.ts).
//
// ⛔ SERVER-ONLY (see types.ts header). Plain TS only.

import type {
  EconomyConfig,
  EquipmentPool,
  MilestoneReward,
  MonsterReward,
  DropTable,
  PlayerBaselineRow,
  ShopConfig,
} from "./types";

/** §2.2 — economy version tag; log ทุก transaction ด้วยค่านี้. */
export const ECONOMY_VERSION = "p2-map1-v1";

// ── equipment pools (Economy §11.2–§11.6 weights) ────────────────────────────
const EQUIPMENT_POOLS: EquipmentPool[] = [
  {
    poolId: "common_slime_gear", // §11.2
    entries: [
      { itemId: "eq_weapon_training_blade", weight: 22 },
      { itemId: "eq_head_cloth_band", weight: 22 },
      { itemId: "eq_body_traveler_tunic", weight: 17 },
      { itemId: "eq_accessory_plain_cord", weight: 19.5 },
      { itemId: "eq_talisman_blank", weight: 19.5 },
    ],
  },
  {
    poolId: "common_bird_gear", // §11.3
    entries: [
      { itemId: "eq_weapon_reed_edge", weight: 20 },
      { itemId: "eq_head_leaf_wrap", weight: 20 },
      { itemId: "eq_body_padded_field_coat", weight: 20 },
      { itemId: "eq_accessory_feather_knot", weight: 25 },
      { itemId: "eq_talisman_sprout", weight: 15 },
    ],
  },
  {
    poolId: "common_field_gear", // §11.4 (boar common)
    entries: [
      { itemId: "eq_weapon_reed_edge", weight: 19 },
      { itemId: "eq_head_leaf_wrap", weight: 19 },
      { itemId: "eq_body_padded_field_coat", weight: 25 },
      { itemId: "eq_accessory_feather_knot", weight: 18 },
      { itemId: "eq_talisman_sprout", weight: 19 },
    ],
  },
  {
    poolId: "uncommon_boar_gear", // §11.4 (boar uncommon) — สอง Uncommon pool เดียวของ Map 1 (ใช้ต่อที่ elite/boss ด้วย, ดูรายงาน)
    entries: [
      { itemId: "eq_weapon_boar_tusk_saber", weight: 20 },
      { itemId: "eq_head_boarhide_cap", weight: 20 },
      { itemId: "eq_body_boarhide_vest", weight: 20 },
      { itemId: "eq_accessory_tough_tusk_ring", weight: 20 },
      { itemId: "eq_talisman_firmness", weight: 20 },
    ],
  },
  {
    poolId: "rare_map1_gear", // §11.5 (elite Rare Equipment weights)
    entries: [
      { itemId: "eq_weapon_resonant_edge", weight: 20 },
      { itemId: "eq_head_moon_sand_circlet", weight: 20 },
      { itemId: "eq_body_resonant_coat", weight: 20 },
      { itemId: "eq_accessory_resonance_bead", weight: 20 },
      { itemId: "eq_talisman_moon_echo", weight: 20 },
    ],
  },
];

// ── monster rewards (Economy §10.1 / D-055 §9.1 identity) ─────────────────────
const MONSTER_REWARDS: MonsterReward[] = [
  { monsterId: "mon_map1_slime", level: 1, exp: 14, goldMin: 3, goldMax: 5, respawnSeconds: 8, dropTableId: "drop_map1_slime_v1", phase: "P2" },
  { monsterId: "mon_map1_bird", level: 2, exp: 20, goldMin: 5, goldMax: 8, respawnSeconds: 10, dropTableId: "drop_map1_bird_v1", phase: "P2" },
  { monsterId: "mon_map1_boar", level: 4, exp: 30, goldMin: 8, goldMax: 12, respawnSeconds: 14, dropTableId: "drop_map1_boar_v1", phase: "P2" },
  { monsterId: "elite_map1_boar_rampage", level: 5, exp: 140, goldMin: 40, goldMax: 60, respawnSeconds: 720, dropTableId: "drop_map1_elite_boar_v1", phase: "P2" },
  // Story Boss ผู้พิทักษ์เสียงสะท้อน (instanced, encounter-based) — เลื่อน post-OB (phase P2B, ไม่ ship)
  { monsterId: "boss_map1_resonant_guardian", level: 8, exp: 550, goldMin: 180, goldMax: 260, respawnSeconds: 0, dropTableId: "drop_map1_boss_v1", phase: "P2B" },
  // Field Boss หมูป่าหม้อเดือด (D-064) — capstone Map 1, ship OB live (phase P2). open-world respawn ~4 นาที.
  { monsterId: "boss_map1_boiling_boar", level: 6, exp: 300, goldMin: 120, goldMax: 200, respawnSeconds: 240, dropTableId: "drop_map1_field_boss_v1", phase: "P2" },
];

// ── drop tables (Economy §11) — Kraeng/upg_kraeng rows SUPERSEDED to 0% (Reinforcement §4) ────
// เสริมแกร่ง (8%+pity) + เศษ (10.7%) = อยู่ใน reinforcement.ts (per-boss pity), ไม่ใช่ roll ใน table นี้.
const DROP_TABLES: DropTable[] = [
  {
    dropTableId: "drop_map1_slime_v1",
    monsterId: "mon_map1_slime",
    phase: "P2",
    guaranteed: [],
    rolls: [
      { rollId: "material", chancePercent: 70, itemId: "mat_slime_gel", poolId: null, quantity: { min: 1, max: 2 } },
      { rollId: "potion", chancePercent: 4, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "equipment", chancePercent: 18, itemId: null, poolId: "common_slime_gear", quantity: { min: 1, max: 1 } },
    ],
  },
  {
    dropTableId: "drop_map1_bird_v1",
    monsterId: "mon_map1_bird",
    phase: "P2",
    guaranteed: [],
    rolls: [
      { rollId: "material", chancePercent: 65, itemId: "mat_soft_feather", poolId: null, quantity: { min: 1, max: 2 } },
      { rollId: "potion", chancePercent: 5, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "equipment", chancePercent: 20, itemId: null, poolId: "common_bird_gear", quantity: { min: 1, max: 1 } },
    ],
  },
  {
    dropTableId: "drop_map1_boar_v1",
    monsterId: "mon_map1_boar",
    phase: "P2",
    guaranteed: [],
    rolls: [
      { rollId: "main_material", chancePercent: 70, itemId: "mat_coarse_hide", poolId: null, quantity: { min: 1, max: 2 } },
      { rollId: "secondary_material", chancePercent: 25, itemId: "mat_sharp_tusk", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "potion", chancePercent: 6, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "common_equipment", chancePercent: 16, itemId: null, poolId: "common_field_gear", quantity: { min: 1, max: 1 } },
      { rollId: "uncommon_equipment", chancePercent: 6, itemId: null, poolId: "uncommon_boar_gear", quantity: { min: 1, max: 1 } },
    ],
  },
  {
    dropTableId: "drop_map1_elite_boar_v1",
    monsterId: "elite_map1_boar_rampage",
    phase: "P2",
    // §11.5 guaranteed upg_kraeng ×1 = SUPERSEDED (Reinforcement §4 → normal/elite 0%): ตัดออก
    guaranteed: [
      { itemId: "mat_coarse_hide", poolId: null, quantity: { min: 2, max: 4 } },
      { itemId: "mat_sharp_tusk", poolId: null, quantity: { min: 1, max: 2 } },
    ],
    rolls: [
      { rollId: "resonance_dust", chancePercent: 75, itemId: "mat_resonance_dust", poolId: null, quantity: { min: 1, max: 2 } },
      { rollId: "potion", chancePercent: 25, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 2 } },
      { rollId: "uncommon_equipment", chancePercent: 60, itemId: null, poolId: "uncommon_boar_gear", quantity: { min: 1, max: 1 } },
      { rollId: "rare_equipment", chancePercent: 8, itemId: null, poolId: "rare_map1_gear", quantity: { min: 1, max: 1 } },
    ],
  },
  {
    dropTableId: "drop_map1_boss_v1",
    monsterId: "boss_map1_resonant_guardian",
    // D-064: guardian = Story Boss (instanced) · Field Boss ตัวฟาร์ม = boss_map1_boiling_boar —
    // การย้าย loot/rewards ไป Field Boss + stats ของมัน = P2B prep (รอ owner balance, ห้ามเดา)
    phase: "P2B", // reserved baseline (§11.6) — ปรับได้หลัง Boss Playtest
    // §11.6 guaranteed upg_kraeng ×2 = SUPERSEDED (Reinforcement §4 → boss 8%+pity ใน reinforcement.ts): ตัดออก
    guaranteed: [
      { itemId: "mat_boss_resonance_core", poolId: null, quantity: { min: 2, max: 4 } },
      { itemId: null, poolId: "uncommon_boar_gear", quantity: { min: 1, max: 1 } },
    ],
    rolls: [
      { rollId: "rare_equipment", chancePercent: 20, itemId: null, poolId: "rare_map1_gear", quantity: { min: 1, max: 1 } },
      { rollId: "potion", chancePercent: 100, itemId: "con_small_potion", poolId: null, quantity: { min: 3, max: 5 } },
    ],
  },
  {
    // Field Boss หมูป่าหม้อเดือด (D-064) — capstone Map 1, ship OB (phase P2).
    // ⚠️ นี่คือ **ตารางเดียว** ที่ได้รับอนุญาตให้ดรอป `upg_reinforcement` (วัสดุเสริมแกร่งตัวเต็ม) — R8 guard
    //    ใน kill-rewards.ts ยกเว้นเฉพาะ monsterId นี้. OB ให้ตัวเต็มตรง ๆ; pity ladder + fragment/exchange = post-OB.
    dropTableId: "drop_map1_field_boss_v1",
    monsterId: "boss_map1_boiling_boar",
    phase: "P2",
    guaranteed: [
      { itemId: "upg_reinforcement", poolId: null, quantity: { min: 1, max: 2 } },
      { itemId: "mat_boss_resonance_core", poolId: null, quantity: { min: 1, max: 3 } },
    ],
    rolls: [
      { rollId: "uncommon_equipment", chancePercent: 70, itemId: null, poolId: "uncommon_boar_gear", quantity: { min: 1, max: 1 } },
      { rollId: "rare_equipment", chancePercent: 15, itemId: null, poolId: "rare_map1_gear", quantity: { min: 1, max: 1 } },
      { rollId: "potion", chancePercent: 100, itemId: "con_small_potion", poolId: null, quantity: { min: 3, max: 5 } },
    ],
  },
];

// ── milestone rewards (D-053 / Economy §18.1 baseline + §18.3 Gold override) ──
// 5 แถวที่เคยแจก Kraeng ×1 → กลายเป็น Gold รวมใหม่ (D-053), items = [] (ไม่แจกเสริมแกร่งอีก).
const MILESTONES: MilestoneReward[] = [
  { milestoneId: "ms_intro_complete", phase: "P2", exp: 120, gold: 50, items: [] },
  { milestoneId: "ms_first_hunt", phase: "P2", exp: 160, gold: 100, items: [{ itemId: "con_small_potion", quantity: 3 }] },
  { milestoneId: "ms_storage_intro", phase: "P2", exp: 100, gold: 50, items: [] },
  { milestoneId: "ms_shop_intro", phase: "P2", exp: 100, gold: 100, items: [] },
  { milestoneId: "ms_enhancement_ready", phase: "P2", exp: 150, gold: 200, items: [] }, // D-053: 100 + 100
  { milestoneId: "ach_first_upgrade", phase: "P2", exp: 100, gold: 100, items: [] }, // D-053: 0 + 100
  { milestoneId: "ms_first_elite", phase: "P2", exp: 250, gold: 350, items: [] }, // D-053: 200 + 150
  { milestoneId: "ms_map1_complete", phase: "P2", exp: 400, gold: 550, items: [] }, // D-053: 300 + 250
  { milestoneId: "ms_boss_first_kill", phase: "P2B", exp: 300, gold: 400, items: [] }, // D-053: 200 + 200
];

// ── enhancement multiplier +0..+15 (Economy §16.3 + §16.3.1 · D-054) ─────────
// index = ระดับ +N; +15 = 2.80 (curve เดิม delta เร่ง +0.01/ระดับ).
const ENHANCEMENT_MULTIPLIERS = [
  1.0, // +0
  1.05, // +1
  1.11, // +2
  1.18, // +3
  1.26, // +4
  1.35, // +5
  1.45, // +6
  1.56, // +7
  1.68, // +8
  1.81, // +9
  1.95, // +10
  2.1, // +11
  2.26, // +12
  2.43, // +13
  2.61, // +14
  2.8, // +15
];

// ── player combat baseline lv1–10 (D-055 §2, Locked · production) ─────────────
// verbatim จาก D-055 §2 "Player baseline นักดาบ lv1–10" (HP/ATK/DEF; Speed=100 คงที่ = ไม่ใช่ combat stat).
// lv1 = 100/12/8 ตรงกับ engine lv1 baseline (src/engine/config/combat.ts player) — คู่กันตาม D-055.
const PLAYER_BASELINE: PlayerBaselineRow[] = [
  { level: 1, hp: 100, atk: 12, def: 8 },
  { level: 2, hp: 120, atk: 15, def: 9 },
  { level: 3, hp: 140, atk: 18, def: 11 },
  { level: 4, hp: 160, atk: 21, def: 12 },
  { level: 5, hp: 180, atk: 24, def: 14 },
  { level: 6, hp: 200, atk: 27, def: 15 },
  { level: 7, hp: 220, atk: 30, def: 17 },
  { level: 8, hp: 240, atk: 33, def: 18 },
  { level: 9, hp: 260, atk: 36, def: 20 },
  { level: 10, hp: 280, atk: 40, def: 22 },
];

// ── starter NPC shop (Economy §8, LOCKED) ────────────────────────────────────
// buyPrice/unlock = §8.2 catalog (6 items) verbatim; mapId = city hub (starter district, §8.1) — mirrors
// engine CITY_HUB_ID ("city-hub") as a Design-Knob string (same posture as MONSTER_ID_BY_MOB_TYPE keys).
// sellPrices = §7 "Sell" column verbatim (§8.3 "Sell price อ่านจาก Item Definition"). Items NOT listed =
// unsellable: `upg_reinforcement`/fragment (§8.3/§14.4 "Kraeng ขายไม่ได้"; sell-ability = R1/R2 undecided,
// not set here — never decide balance) and any quest item.
const STARTER_SHOP: ShopConfig = {
  shopId: "starter_general_store", // §8 single P2 shop (shopId reserved for future multi-shop)
  mapId: "city-hub", // = CITY_HUB_ID (src/engine/map/city-hub.ts) — starter district / city hub (§8.1)
  entries: [
    { itemId: "con_small_potion", buyPrice: 18, unlockCondition: "shop_tutorial_complete" },
    { itemId: "eq_weapon_training_blade", buyPrice: 120, unlockCondition: "immediate" },
    { itemId: "eq_head_cloth_band", buyPrice: 80, unlockCondition: "immediate" },
    { itemId: "eq_body_traveler_tunic", buyPrice: 140, unlockCondition: "immediate" },
    { itemId: "eq_accessory_plain_cord", buyPrice: 90, unlockCondition: "immediate" },
    { itemId: "eq_talisman_blank", buyPrice: 90, unlockCondition: "immediate" },
  ],
  sellPrices: {
    // §7.1 consumable / materials (mat_slime_gel..mat_boss_resonance_core)
    con_small_potion: 4,
    mat_slime_gel: 2,
    mat_soft_feather: 3,
    mat_coarse_hide: 5,
    mat_sharp_tusk: 8,
    mat_resonance_dust: 12,
    mat_boss_resonance_core: 20,
    // §7.2 weapons
    eq_weapon_training_blade: 24,
    eq_weapon_reed_edge: 36,
    eq_weapon_boar_tusk_saber: 72,
    eq_weapon_resonant_edge: 180,
    // §7.3 head
    eq_head_cloth_band: 16,
    eq_head_leaf_wrap: 28,
    eq_head_boarhide_cap: 60,
    eq_head_moon_sand_circlet: 150,
    // §7.4 body
    eq_body_traveler_tunic: 28,
    eq_body_padded_field_coat: 42,
    eq_body_boarhide_vest: 84,
    eq_body_resonant_coat: 210,
    // §7.5 accessory
    eq_accessory_plain_cord: 18,
    eq_accessory_feather_knot: 30,
    eq_accessory_tough_tusk_ring: 72,
    eq_accessory_resonance_bead: 180,
    // §7.6 talisman
    eq_talisman_blank: 18,
    eq_talisman_sprout: 30,
    eq_talisman_firmness: 72,
    eq_talisman_moon_echo: 180,
  },
};

/** DEFAULT economy config (fallback ในโค้ด) — ดู loader.ts สำหรับการ override ผ่าน DB. */
export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  economyVersion: ECONOMY_VERSION,
  effectiveFrom: "2026-07-12", // §2.2
  expCurve: {
    levelCap: 10, // §9.1
    // §9.2 — expToNext / cumulative ต่อเลเวล; ที่ cap (lv10) expToNext = 0.
    levels: [
      { level: 1, expToNext: 120, cumulative: 120 },
      { level: 2, expToNext: 220, cumulative: 340 },
      { level: 3, expToNext: 360, cumulative: 700 },
      { level: 4, expToNext: 520, cumulative: 1220 },
      { level: 5, expToNext: 720, cumulative: 1940 },
      { level: 6, expToNext: 950, cumulative: 2890 },
      { level: 7, expToNext: 1200, cumulative: 4090 },
      { level: 8, expToNext: 1500, cumulative: 5590 },
      { level: 9, expToNext: 1850, cumulative: 7440 },
      { level: 10, expToNext: 0, cumulative: 7440 },
    ],
    // §9.3
    levelDiffModifier: {
      monsterMinusPlayerAtLeast2: 1.2,
      monsterMinusPlayer1: 1.1,
      monsterMinusPlayer0: 1.0,
      monsterMinusPlayerMinus1: 1.0,
      monsterMinusPlayerMinus2: 0.85,
      monsterMinusPlayerMinus3: 0.7,
      monsterMinusPlayerMinus4: 0.5,
      monsterMinusPlayerAtMostMinus5: 0.2,
    },
    highLevelBonusCap: 1.2, // §9.3 "High-level bonus cap 120%"
    party: {
      enabled: true, // §9.4
      poolMultiplierPerExtraMember: 0.2,
      poolMultiplierCap: 1.6,
      splitAmongEligibleMembers: true,
    },
  },
  playerBaseline: PLAYER_BASELINE,
  monsterRewards: MONSTER_REWARDS,
  dropTables: DROP_TABLES,
  equipmentPools: EQUIPMENT_POOLS,
  milestones: MILESTONES,
  enhancementCurve: {
    maxLevel: 15, // D-048
    multipliers: ENHANCEMENT_MULTIPLIERS,
    minIncreasePerLevel: 1, // §16.3 rule
    scaledStats: ["attack", "defense", "maxHp", "breakPower"], // §16.3 (Crit/Move ไม่ scale)
  },
  shop: STARTER_SHOP,
};
