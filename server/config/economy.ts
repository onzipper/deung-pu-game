// P2-09 — DEFAULT economy config (server-authoritative Design Knobs).
// Values copied verbatim from the cited § (never typed from memory — AI.md iron-rule #1).
// This is the in-code fallback; the loader prefers an active `config_versions` row (loader.ts).
//
// ⛔ SERVER-ONLY (see types.ts header). Plain TS only.

import type {
  EconomyConfig,
  EquipmentPool,
  ExpLevelRow,
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
  // ── Maps 2–4 equipment pools (MAPS_2_4 spec §4) — ⚠️ ENTRIES ว่างไว้ก่อน (owner-gated §7 Q2) ──────────────
  // เอกสาร §4 อ้าง pool_mapN_*_gear ในตารางดรอป (§5) แต่ **ยังไม่ mint Equipment Item Master ของ Map 2–4** (item
  // id/stat จริง = extension แยก, mirror Map 1 §7.2–§7.6 — รอ owner เคาะ §7 Q2). ประกาศ pool ครบเพื่อให้ตารางดรอป
  // well-formed (drop table อ้าง poolId ได้จริง); entries ว่าง → rollDropTable/pickFromPool คืน null = ไม่ดรอป gear
  // จน Q2 mint item + ใส่ weight. ไม่ hardcode weight เดา (ห้ามตัดสิน balance เอง). ทุกค่า = Design Knob §48.
  { poolId: "pool_map2_common_gear", entries: [] },
  { poolId: "pool_map2_uncommon_gear", entries: [] },
  { poolId: "pool_map2_rare_gear", entries: [] },
  { poolId: "pool_map3_common_gear", entries: [] },
  { poolId: "pool_map3_uncommon_gear", entries: [] },
  { poolId: "pool_map3_rare_gear", entries: [] },
  { poolId: "pool_map4_common_gear", entries: [] },
  { poolId: "pool_map4_uncommon_gear", entries: [] },
  { poolId: "pool_map4_rare_gear", entries: [] },
  { poolId: "pool_map4_epic_gear", entries: [] }, // Epic ตัวแรกในเนื้อหา (Map 4 boss 6%, §5.3)
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

  // ── Maps 2–4 monster rewards (MAPS_2_4 spec §2 · EXP/Gold/Respawn verbatim) ────────────────────────────
  // phase = **P2B** (config พร้อม, ยังไม่ grant live) — mirror pattern boss_map1_resonant_guardian: OB scope =
  //   "Map 1 only" (current-state) + EXP curve lv11–22 (§7 Q1) / equipment master (§7 Q2) / boss reinforcement
  //   (§7 Q3) = owner-gated. grantKillRewardsForMob() คืน null เมื่อ phase ≠ "P2" → มอนสู้ได้ (combat = engine)
  //   แต่ยังไม่แจก reward จนกว่า owner promote → P2 + เคาะ Q1/Q2/Q3. boss respawn "Encounter" → 240s placeholder.
  // Map 2 — ถนนชายไร่
  { monsterId: "mon_map2_mushroom_startle", level: 8, exp: 50, goldMin: 14, goldMax: 20, respawnSeconds: 25, dropTableId: "drop_map2_mushroom_startle_v1", phase: "P2B" },
  { monsterId: "mon_map2_scarecrow_walker", level: 10, exp: 60, goldMin: 18, goldMax: 26, respawnSeconds: 30, dropTableId: "drop_map2_scarecrow_walker_v1", phase: "P2B" },
  { monsterId: "mon_map2_greenlight_rat", level: 11, exp: 66, goldMin: 20, goldMax: 28, respawnSeconds: 25, dropTableId: "drop_map2_greenlight_rat_v1", phase: "P2B" },
  { monsterId: "elite_map2_talisman_scarecrow", level: 13, exp: 680, goldMin: 120, goldMax: 180, respawnSeconds: 300, dropTableId: "drop_map2_elite_v1", phase: "P2B" },
  { monsterId: "boss_map2_field_warden", level: 14, exp: 1000, goldMin: 320, goldMax: 460, respawnSeconds: 240, dropTableId: "drop_map2_boss_v1", phase: "P2B" },
  // Map 3 — ทางป่าเก่า
  { monsterId: "mon_map3_gnawing_root", level: 12, exp: 72, goldMin: 22, goldMax: 32, respawnSeconds: 30, dropTableId: "drop_map3_gnawing_root_v1", phase: "P2B" },
  { monsterId: "mon_map3_shadow_monkey", level: 14, exp: 82, goldMin: 26, goldMax: 36, respawnSeconds: 30, dropTableId: "drop_map3_shadow_monkey_v1", phase: "P2B" },
  { monsterId: "mon_map3_walking_stone", level: 15, exp: 92, goldMin: 30, goldMax: 42, respawnSeconds: 35, dropTableId: "drop_map3_walking_stone_v1", phase: "P2B" },
  { monsterId: "elite_map3_mossless_stone", level: 17, exp: 900, goldMin: 160, goldMax: 240, respawnSeconds: 390, dropTableId: "drop_map3_elite_v1", phase: "P2B" },
  { monsterId: "boss_map3_nameless_warden", level: 18, exp: 1300, goldMin: 420, goldMax: 600, respawnSeconds: 240, dropTableId: "drop_map3_boss_v1", phase: "P2B" },
  // Map 4 — ป่าจันทร์เงา
  { monsterId: "mon_map4_moonlight_wisp", level: 16, exp: 92, goldMin: 30, goldMax: 42, respawnSeconds: 30, dropTableId: "drop_map4_moonlight_wisp_v1", phase: "P2B" },
  { monsterId: "mon_map4_dream_mushroom", level: 17, exp: 96, goldMin: 32, goldMax: 44, respawnSeconds: 30, dropTableId: "drop_map4_dream_mushroom_v1", phase: "P2B" },
  { monsterId: "mon_map4_shadow_deer", level: 19, exp: 108, goldMin: 38, goldMax: 52, respawnSeconds: 40, dropTableId: "drop_map4_shadow_deer_v1", phase: "P2B" },
  { monsterId: "elite_map4_shattered_moon_deer", level: 21, exp: 1100, goldMin: 200, goldMax: 300, respawnSeconds: 420, dropTableId: "drop_map4_elite_v1", phase: "P2B" },
  { monsterId: "boss_map4_moondark_dryad", level: 22, exp: 1600, goldMin: 520, goldMax: 740, respawnSeconds: 240, dropTableId: "drop_map4_boss_v1", phase: "P2B" },
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
    // ⚠️ B4 (Reinforcement §4.2/§3.5): `upg_reinforcement` (ตัวเต็ม) + `upg_reinforcement_fragment` (เศษ) **ไม่ได้
    //    ดรอปจากตารางนี้แล้ว** — มาจาก pity ladder (8% + pity การันตีรอบ 15) + fragment roll (10.7%) ใน
    //    server/economy/reinforcement-pity.ts (per-account-per-boss) แทน OB shortcut เดิม (guaranteed ตัวเต็ม 1–2).
    //    ทั้งสอง id ถูก R8 guard กันออกจาก generic roll สำหรับทุกมอน (รวม Field Boss) — kill-rewards.ts.
    dropTableId: "drop_map1_field_boss_v1",
    monsterId: "boss_map1_boiling_boar",
    phase: "P2",
    guaranteed: [{ itemId: "mat_boss_resonance_core", poolId: null, quantity: { min: 1, max: 3 } }],
    rolls: [
      { rollId: "uncommon_equipment", chancePercent: 70, itemId: null, poolId: "uncommon_boar_gear", quantity: { min: 1, max: 1 } },
      { rollId: "rare_equipment", chancePercent: 15, itemId: null, poolId: "rare_map1_gear", quantity: { min: 1, max: 1 } },
      { rollId: "potion", chancePercent: 100, itemId: "con_small_potion", poolId: null, quantity: { min: 3, max: 5 } },
    ],
  },

  // ── Maps 2–4 drop tables (MAPS_2_4 spec §5 — mirror Map 1 §11 format) ───────────────────────────────────
  // phase = **P2B** (config พร้อม, ไม่ roll live จนกว่า reward.phase → P2, §7 owner-gate). per-mob table (มอนปกติ
  //   ต่างวัสดุ → 1:1 monsterId↔dropTable เหมือน Map 1; spec ตั้งชื่อ family "drop_mapN_normal" แต่ engine ผูก 1
  //   table ต่อ 1 monsterId → split ต่อมอน). equipment pool = pool_mapN_*_gear (entries ว่างจน §7 Q2). potion =
  //   con_small_potion (mid-tier potion = §7 Q6, owner-gated). **ไม่มี reinforcement/เศษ ในตารางไหน** — boss-only
  //   ผ่าน pity path (§4.2/§3.5) + rate ของ boss Map 2–4 = owner-gated §7 Q3 (ยังไม่ wire, ดูรายงาน). R8 guard
  //   กัน upg_reinforcement ออกจาก generic roll อยู่แล้ว (kill-rewards.ts).
  // Map 2 — ถนนชายไร่ (§5.1)
  {
    dropTableId: "drop_map2_mushroom_startle_v1", monsterId: "mon_map2_mushroom_startle", phase: "P2B",
    guaranteed: [],
    rolls: [
      { rollId: "material", chancePercent: 70, itemId: "mat_startle_spore", poolId: null, quantity: { min: 1, max: 2 } },
      { rollId: "potion", chancePercent: 4, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "common_equipment", chancePercent: 18, itemId: null, poolId: "pool_map2_common_gear", quantity: { min: 1, max: 1 } },
    ],
  },
  {
    dropTableId: "drop_map2_scarecrow_walker_v1", monsterId: "mon_map2_scarecrow_walker", phase: "P2B",
    guaranteed: [],
    rolls: [
      { rollId: "material", chancePercent: 70, itemId: "mat_resonant_straw", poolId: null, quantity: { min: 1, max: 2 } },
      { rollId: "potion", chancePercent: 5, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "common_equipment", chancePercent: 20, itemId: null, poolId: "pool_map2_common_gear", quantity: { min: 1, max: 1 } },
      { rollId: "uncommon_equipment", chancePercent: 6, itemId: null, poolId: "pool_map2_uncommon_gear", quantity: { min: 1, max: 1 } },
    ],
  },
  {
    dropTableId: "drop_map2_greenlight_rat_v1", monsterId: "mon_map2_greenlight_rat", phase: "P2B",
    guaranteed: [],
    rolls: [
      { rollId: "main_material", chancePercent: 55, itemId: "mat_greenlight_whisker", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "secondary_material", chancePercent: 20, itemId: "mat_resonant_straw", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "potion", chancePercent: 5, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "common_equipment", chancePercent: 16, itemId: null, poolId: "pool_map2_common_gear", quantity: { min: 1, max: 1 } },
    ],
  },
  {
    // Elite หุ่นฟางพันยันต์ (§5.1 elite) — guaranteed material + rolls. respawn 5m, ไม่มี pity.
    dropTableId: "drop_map2_elite_v1", monsterId: "elite_map2_talisman_scarecrow", phase: "P2B",
    guaranteed: [
      { itemId: "mat_resonant_straw", poolId: null, quantity: { min: 2, max: 4 } },
      { itemId: "mat_greenlight_whisker", poolId: null, quantity: { min: 1, max: 2 } },
    ],
    rolls: [
      { rollId: "uncommon_equipment", chancePercent: 60, itemId: null, poolId: "pool_map2_uncommon_gear", quantity: { min: 1, max: 1 } },
      { rollId: "rare_equipment", chancePercent: 8, itemId: null, poolId: "pool_map2_rare_gear", quantity: { min: 1, max: 1 } },
      { rollId: "potion", chancePercent: 25, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 2 } },
    ],
  },
  {
    // Boss หุ่นฟางผู้เฝ้าไร่ (§5.1 boss) — guaranteed boss material (ACCOUNT_BOUND) + uncommon pool; potion 100% roll.
    dropTableId: "drop_map2_boss_v1", monsterId: "boss_map2_field_warden", phase: "P2B",
    guaranteed: [
      { itemId: "mat_warden_talisman_ash", poolId: null, quantity: { min: 2, max: 4 } },
      { itemId: null, poolId: "pool_map2_uncommon_gear", quantity: { min: 1, max: 1 } },
    ],
    rolls: [
      { rollId: "rare_equipment", chancePercent: 20, itemId: null, poolId: "pool_map2_rare_gear", quantity: { min: 1, max: 1 } },
      { rollId: "potion", chancePercent: 100, itemId: "con_small_potion", poolId: null, quantity: { min: 3, max: 5 } },
    ],
  },
  // Map 3 — ทางป่าเก่า (§5.2)
  {
    dropTableId: "drop_map3_gnawing_root_v1", monsterId: "mon_map3_gnawing_root", phase: "P2B",
    guaranteed: [],
    rolls: [
      { rollId: "material", chancePercent: 70, itemId: "mat_old_root_scrap", poolId: null, quantity: { min: 1, max: 2 } },
      { rollId: "potion", chancePercent: 5, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "common_equipment", chancePercent: 18, itemId: null, poolId: "pool_map3_common_gear", quantity: { min: 1, max: 1 } },
    ],
  },
  {
    dropTableId: "drop_map3_shadow_monkey_v1", monsterId: "mon_map3_shadow_monkey", phase: "P2B",
    guaranteed: [],
    rolls: [
      { rollId: "material", chancePercent: 65, itemId: "mat_shadow_pelt", poolId: null, quantity: { min: 1, max: 2 } },
      { rollId: "potion", chancePercent: 6, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "common_equipment", chancePercent: 20, itemId: null, poolId: "pool_map3_common_gear", quantity: { min: 1, max: 1 } },
    ],
  },
  {
    dropTableId: "drop_map3_walking_stone_v1", monsterId: "mon_map3_walking_stone", phase: "P2B",
    guaranteed: [],
    rolls: [
      { rollId: "main_material", chancePercent: 55, itemId: "mat_mossless_shard", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "secondary_material", chancePercent: 22, itemId: "mat_old_root_scrap", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "potion", chancePercent: 5, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "common_equipment", chancePercent: 16, itemId: null, poolId: "pool_map3_common_gear", quantity: { min: 1, max: 1 } },
      { rollId: "uncommon_equipment", chancePercent: 7, itemId: null, poolId: "pool_map3_uncommon_gear", quantity: { min: 1, max: 1 } },
    ],
  },
  {
    // Elite หินไร้ตะไคร่ (§5.2 elite, hidden) — respawn 6.5m.
    dropTableId: "drop_map3_elite_v1", monsterId: "elite_map3_mossless_stone", phase: "P2B",
    guaranteed: [
      { itemId: "mat_mossless_shard", poolId: null, quantity: { min: 2, max: 4 } },
      { itemId: "mat_shadow_pelt", poolId: null, quantity: { min: 1, max: 2 } },
    ],
    rolls: [
      { rollId: "uncommon_equipment", chancePercent: 60, itemId: null, poolId: "pool_map3_uncommon_gear", quantity: { min: 1, max: 1 } },
      { rollId: "rare_equipment", chancePercent: 10, itemId: null, poolId: "pool_map3_rare_gear", quantity: { min: 1, max: 1 } },
      { rollId: "potion", chancePercent: 25, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 2 } },
    ],
  },
  {
    // Boss ผู้เฝ้าทางที่ไม่มีชื่อ (§5.2 boss).
    dropTableId: "drop_map3_boss_v1", monsterId: "boss_map3_nameless_warden", phase: "P2B",
    guaranteed: [
      { itemId: "mat_nameless_marker_stone", poolId: null, quantity: { min: 2, max: 4 } },
      { itemId: null, poolId: "pool_map3_uncommon_gear", quantity: { min: 1, max: 1 } },
    ],
    rolls: [
      { rollId: "rare_equipment", chancePercent: 22, itemId: null, poolId: "pool_map3_rare_gear", quantity: { min: 1, max: 1 } },
      { rollId: "potion", chancePercent: 100, itemId: "con_small_potion", poolId: null, quantity: { min: 3, max: 5 } },
    ],
  },
  // Map 4 — ป่าจันทร์เงา (§5.3)
  {
    dropTableId: "drop_map4_moonlight_wisp_v1", monsterId: "mon_map4_moonlight_wisp", phase: "P2B",
    guaranteed: [],
    rolls: [
      { rollId: "material", chancePercent: 68, itemId: "mat_moonlight_residue", poolId: null, quantity: { min: 1, max: 2 } },
      { rollId: "potion", chancePercent: 6, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "common_equipment", chancePercent: 18, itemId: null, poolId: "pool_map4_common_gear", quantity: { min: 1, max: 1 } },
    ],
  },
  {
    dropTableId: "drop_map4_dream_mushroom_v1", monsterId: "mon_map4_dream_mushroom", phase: "P2B",
    guaranteed: [],
    rolls: [
      { rollId: "material", chancePercent: 70, itemId: "mat_dream_cap", poolId: null, quantity: { min: 1, max: 2 } },
      { rollId: "potion", chancePercent: 6, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "common_equipment", chancePercent: 20, itemId: null, poolId: "pool_map4_common_gear", quantity: { min: 1, max: 1 } },
    ],
  },
  {
    dropTableId: "drop_map4_shadow_deer_v1", monsterId: "mon_map4_shadow_deer", phase: "P2B",
    guaranteed: [],
    rolls: [
      { rollId: "main_material", chancePercent: 55, itemId: "mat_shadow_dew", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "secondary_material", chancePercent: 22, itemId: "mat_moonlight_residue", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "potion", chancePercent: 5, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 1 } },
      { rollId: "common_equipment", chancePercent: 16, itemId: null, poolId: "pool_map4_common_gear", quantity: { min: 1, max: 1 } },
      { rollId: "uncommon_equipment", chancePercent: 8, itemId: null, poolId: "pool_map4_uncommon_gear", quantity: { min: 1, max: 1 } },
    ],
  },
  {
    // Elite กวางจันทร์แตก (§5.3 elite) — respawn 7m.
    dropTableId: "drop_map4_elite_v1", monsterId: "elite_map4_shattered_moon_deer", phase: "P2B",
    guaranteed: [
      { itemId: "mat_shadow_dew", poolId: null, quantity: { min: 2, max: 4 } },
      { itemId: "mat_dream_cap", poolId: null, quantity: { min: 1, max: 2 } },
    ],
    rolls: [
      { rollId: "uncommon_equipment", chancePercent: 60, itemId: null, poolId: "pool_map4_uncommon_gear", quantity: { min: 1, max: 1 } },
      { rollId: "rare_equipment", chancePercent: 12, itemId: null, poolId: "pool_map4_rare_gear", quantity: { min: 1, max: 1 } },
      { rollId: "potion", chancePercent: 30, itemId: "con_small_potion", poolId: null, quantity: { min: 1, max: 2 } },
    ],
  },
  {
    // Boss นางไม้จันทร์ดับ (§5.3 boss, ปิดแบนด์ lv22) — guaranteed Rare boss material + rare pool; Epic ตัวแรก 6%.
    dropTableId: "drop_map4_boss_v1", monsterId: "boss_map4_moondark_dryad", phase: "P2B",
    guaranteed: [
      { itemId: "mat_moondark_sap", poolId: null, quantity: { min: 2, max: 4 } },
      { itemId: null, poolId: "pool_map4_rare_gear", quantity: { min: 1, max: 1 } },
    ],
    rolls: [
      { rollId: "rare_equipment", chancePercent: 25, itemId: null, poolId: "pool_map4_rare_gear", quantity: { min: 1, max: 1 } },
      { rollId: "epic_equipment", chancePercent: 6, itemId: null, poolId: "pool_map4_epic_gear", quantity: { min: 1, max: 1 } },
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
    // Maps 2–4 materials (MAPS_2_4 spec §4 "Sell" — Design Knob §48). ขายที่ร้าน city-hub เดียว (mirror Map 1);
    //   Map 2 starter shop (§7 Q6) = owner-gated ยังไม่ทำ. boss-material (ash/marker/sap) ขายได้ปกติ (ACCOUNT_BOUND
    //   ไม่ห้ามขาย; ต่างจากเสริมแกร่งที่ขายไม่ได้). ราคา additive → ไม่กระทบ Map 1 (ขายได้ต่อเมื่อ material ดรอปจริง = P2).
    mat_startle_spore: 6, // M2 mushroom_startle (Common)
    mat_resonant_straw: 8, // M2 scarecrow_walker (Common)
    mat_greenlight_whisker: 14, // M2 greenlight_rat (Uncommon)
    mat_warden_talisman_ash: 26, // M2 boss (Uncommon, ACCOUNT_BOUND)
    mat_old_root_scrap: 9, // M3 gnawing_root (Common)
    mat_shadow_pelt: 11, // M3 shadow_monkey (Common)
    mat_mossless_shard: 18, // M3 walking_stone (Uncommon)
    mat_nameless_marker_stone: 34, // M3 boss (Uncommon, ACCOUNT_BOUND)
    mat_moonlight_residue: 12, // M4 moonlight_wisp (Common)
    mat_dream_cap: 13, // M4 dream_mushroom (Common)
    mat_shadow_dew: 22, // M4 shadow_deer (Uncommon)
    mat_moondark_sap: 40, // M4 boss (Rare, ACCOUNT_BOUND)
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
  // §10.2/§10.3 — reward-eligibility thresholds (verbatim: normal 15% · elite/boss 5%). rewardRadiusTiles is
  // NOT spec-named (§10.2 "Reward Radius" / §10.3 mustBeInEncounterRadius states the gate, not the value) →
  // provisional Design-Knob default pending an owner lock.
  partyReward: {
    normalMinSharePct: 15, // §10.2 normalEligibility.minimumDamageContributionPercent
    eliteBossMinSharePct: 5, // §10.3 eliteBossEligibility.minimumDamageContributionPercent
    rewardRadiusTiles: 12,
  },
};

// ── EXP curve extension lv10–22 (Maps 2–4 · MAPS_2_4 §1 band · §7 Q1 OWNER-GATED) ──────────────────────────
// ⚠️ DORMANT + owner-gated (§7 Q1): DEFAULT_ECONOMY_CONFIG.expCurve คง levelCap 10 + 10 แถว (P2 cap §9.1, ยังไม่ยก).
//   Maps 2–4 band lv8–22 ต้องมี curve ต่อ; ตารางนี้ = "ราง" (Design Knob §48) พร้อมให้ owner promote — **ยังไม่ wire**
//   เข้า live curve (จึงไม่กระทบ progression OB / lv cap เดิม; server-config-values.test lock lv10 = ยังเขียว).
//
// EXTRAPOLATION RULE (ระบุตาม brief + §7 Q1 rec): expToNext[N+1] = round(expToNext[N] × 1.23, ปัด 10 ใกล้สุด),
//   ต่อ ratio lv8→9 เดิม (1850/1500 = 1.233 ≈ §7 Q1 "~1.24"); lv22 = cap (expToNext 0). lv10 un-cap (0 → 2280).
//   cumulative = running sum ต่อจาก lv9 (7440). ทุกค่าปรับได้ (owner เคาะ Q1 ตอน promote Map 2–4 → P2).
export const POST_P2_EXP_CURVE_EXTENSION_LV10_22: readonly ExpLevelRow[] = [
  { level: 10, expToNext: 2280, cumulative: 9720 }, // un-cap (live คง 0 จน promote)
  { level: 11, expToNext: 2800, cumulative: 12520 },
  { level: 12, expToNext: 3440, cumulative: 15960 },
  { level: 13, expToNext: 4230, cumulative: 20190 },
  { level: 14, expToNext: 5200, cumulative: 25390 },
  { level: 15, expToNext: 6400, cumulative: 31790 },
  { level: 16, expToNext: 7870, cumulative: 39660 },
  { level: 17, expToNext: 9680, cumulative: 49340 },
  { level: 18, expToNext: 11910, cumulative: 61250 },
  { level: 19, expToNext: 14650, cumulative: 75900 },
  { level: 20, expToNext: 18020, cumulative: 93920 },
  { level: 21, expToNext: 22160, cumulative: 116080 },
  { level: 22, expToNext: 0, cumulative: 116080 }, // Map 4 exit / band cap (lv22)
];
