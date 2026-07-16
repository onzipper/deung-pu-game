// C2a — DEFAULT achievement shipping set (server-authoritative Design Knobs).
// Values transcribed verbatim from docs/design/deungpu_ACHIEVEMENT_SHIPPING_SET_OB_v1.md (LOCKED for
// implement C2 — never guessed, AI.md iron-rule #1). gold values = Design Knob (v15 §48), adjustable;
// ids/tiers/rule shapes are NOT (id locks once save data exists, per source doc header).
//
// ⛔ SERVER-ONLY (see types.ts header — mirrors economy.ts posture). Plain TS only. This module defines the
//    C2 achievement *definitions* only (id/rule/reward/visibility) — the tracking engine (event listeners,
//    progress persistence, auto-claim) is a separate, not-yet-built module this config feeds.
//
// Event taxonomy (18 types, source doc "Event taxonomy" section) — every CORE row's rule.event must be one
// of these 18 strings, except ach_rain_walk_30 (documented derived-event exception below):
//   character.created · map.enter · mob.killed · level.up · enhance.success · enhance.fail · shop.buy ·
//   shop.sell · storage.deposit · delivery.send · death · gold.earned · gold.balance · item.dropped ·
//   npc.talk · weather.changed · phase.changed · ui.logo.click

/** shape of a rule (source doc "rule" column, structured). */
export type AchievementRuleType =
  | "counter"
  | "max_value"
  | "distinct_set"
  | "streak"
  | "sequence"
  | "composite"
  | "time_accum";

/** wallet/progress scope — per source doc header: "wallet scope = character" (orchestrator ruling 2026-07-14). */
export type AchievementScope = "account" | "character";

/** visibility state — source doc `visible` / `hidden(cond)` / `hidden(full)`. */
export type AchievementVisibility = "visible" | "hidden_condition" | "hidden_full";

/** reward — Reward discipline (source doc §10 note): MEME/hidden rows = title/none ONLY, never gold/item. */
export interface AchievementReward {
  gold?: number;
  titleId?: string;
}

export interface AchievementRule {
  type: AchievementRuleType;
  /** event ชนิดหลักที่ rule ฟัง (จาก taxonomy 18 ชนิด เช่น "mob.killed") — composite/sequence ใส่ event แรก + ดู steps. */
  event: string;
  /** เป้า (counter/max_value/time_accum = จำนวน/ค่า/นาที; distinct_set = targetCount; streak = ความยาว; sequence/composite = 1 = ครบเงื่อนไขครั้งเดียว). */
  target: number;
  /** filter อ่านจาก payload: key → ค่าที่ต้องตรง. numeric compare pattern ("<0.05"/">300") ใส่เป็น string. */
  filters?: Record<string, string | number | boolean>;
  /** distinct_set: payload key ที่นับ distinct + allowed list. */
  distinctKey?: string;
  distinctAllowed?: string[];
  /** streak: event ที่ reset streak. */
  resetEvent?: string;
  /** sequence: ลำดับ steps [{event, filters?}] + windowSeconds. */
  steps?: { event: string; filters?: Record<string, string | number | boolean> }[];
  windowSeconds?: number;
  /** composite: notOccurredEvent = ต้องไม่เคยเกิด event นี้เลย (ใช้กับ ach_die_before_kill; ach_boss_solo ไม่ใช้ ใช้ filters รวมใน event เดียวแทน). */
  notOccurredEvent?: string;
  /** max_value/time_accum: payload field ที่ใช้เทียบค่าสูงสุด/สะสม (เช่น level.up.newLevel, enhance.success.plus, gold.balance.balance).
   *  ยังใช้กับบาง counter row ที่ "Counter" หมายถึงสะสมค่าตัวเลขจาก payload (ไม่ใช่นับจำนวนครั้ง) — ดู comment ที่แถวนั้น. */
  valueField?: string;
}

export interface AchievementDefinition {
  id: string;
  nameTh: string;
  category: string;
  tier: "COMMON" | "UNCOMMON" | "HARD" | "EXTREME" | "MYSTERY" | "MEME";
  visibility: AchievementVisibility;
  scope: AchievementScope;
  rule: AchievementRule;
  reward: AchievementReward;
  phase: "core" | "expanded";
}

// ── 65 rows: 60 core (9 categories) + 5 expanded (hidden until content ships) ────────────────────
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  // ── Progression (7) ──────────────────────────────────────────────────────────
  {
    id: "ach_first_step",
    nameTh: "ก้าวแรก",
    category: "progression",
    tier: "COMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "character.created", target: 1 },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_leave_town",
    nameTh: "โลกข้างนอก",
    category: "progression",
    tier: "COMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "map.enter", target: 1, filters: { mapId: "map1", firstVisit: true } },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_first_kill",
    nameTh: "มือใหม่หัดล่า",
    category: "progression",
    tier: "COMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "mob.killed", target: 1 },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_level_5",
    nameTh: "เริ่มจับทาง",
    category: "progression",
    tier: "COMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "max_value", event: "level.up", target: 5, valueField: "newLevel" },
    reward: { gold: 30 },
    phase: "core",
  },
  {
    id: "ach_level_10",
    nameTh: "เริ่มเข้าที่",
    category: "progression",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "max_value", event: "level.up", target: 10, valueField: "newLevel" },
    reward: { gold: 80 },
    phase: "core",
  },
  {
    id: "ach_level_15",
    nameTh: "สุดทางแดนหม้อเดือด",
    category: "progression",
    tier: "HARD",
    visibility: "visible",
    scope: "character",
    // NOTE: source doc target = 15; P2 level cap in economy.ts is currently 10 (Economy §9.1) — transcribed
    // faithfully as-is (out of scope to reconcile a cap/achievement mismatch; not this brief's call).
    rule: { type: "max_value", event: "level.up", target: 15, valueField: "newLevel" },
    reward: { gold: 150 },
    phase: "core",
  },
  {
    id: "ach_all_systems",
    nameTh: "รู้จักไปหมดแล้วนี่",
    category: "progression",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "account",
    // MODELING JUDGMENT: this DistinctSet spans 5 *different event types* (not payload values within one
    // event) — enhance.success / shop.buy / storage.deposit / delivery.send / npc.talk. `event` here is an
    // anchor (first of the 5, keeps rule.event ∈ 18-taxonomy for the test gate); distinctKey="eventType" is
    // synthetic (the tracking engine must subscribe to all 5 listed types and record which ones occurred,
    // not just the anchor).
    rule: {
      type: "distinct_set",
      event: "enhance.success",
      target: 5,
      distinctKey: "eventType",
      distinctAllowed: ["enhance.success", "shop.buy", "storage.deposit", "delivery.send", "npc.talk"],
    },
    reward: { titleId: "title_jack_of_trades" },
    phase: "core",
  },

  // ── Combat (10) ──────────────────────────────────────────────────────────────
  {
    id: "ach_slime_100",
    nameTh: "นักปราบเมือกดึ๋ง",
    category: "combat",
    tier: "COMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "mob.killed", target: 100, filters: { monsterId: "mon_map1_slime" } },
    reward: { gold: 40 },
    phase: "core",
  },
  {
    id: "ach_slime_1000",
    nameTh: "ราชาเมือกดึ๋ง",
    category: "combat",
    tier: "HARD",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "mob.killed", target: 1000, filters: { monsterId: "mon_map1_slime" } },
    reward: { titleId: "title_slime_king" },
    phase: "core",
  },
  {
    id: "ach_bird_100",
    nameTh: "ไล่จับนกจิกปุ๊",
    category: "combat",
    tier: "COMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "mob.killed", target: 100, filters: { monsterId: "mon_map1_bird" } },
    reward: { gold: 40 },
    phase: "core",
  },
  {
    id: "ach_boar_100",
    nameTh: "พรานหมูป่า",
    category: "combat",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "mob.killed", target: 100, filters: { monsterId: "mon_map1_boar" } },
    reward: { gold: 60 },
    phase: "core",
  },
  {
    id: "ach_kill_500",
    nameTh: "นักล่าขาประจำ",
    category: "combat",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "character",
    // "kill{any}" = no monsterId filter (any monster counts).
    rule: { type: "counter", event: "mob.killed", target: 500 },
    reward: { gold: 80 },
    phase: "core",
  },
  {
    id: "ach_kill_5000",
    nameTh: "สังหารไม่เลือกหน้า",
    category: "combat",
    tier: "HARD",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "mob.killed", target: 5000 },
    reward: { titleId: "title_relentless" },
    phase: "core",
  },
  {
    id: "ach_map1_bestiary",
    nameTh: "รู้จักสัตว์ร้ายแดนนี้",
    category: "combat",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "character",
    // distinctAllowed = the 5 confirmed Map1 monster ids (source doc header "id ยืนยันกับโค้ดจริงแล้ว").
    rule: {
      type: "distinct_set",
      event: "mob.killed",
      target: 5,
      distinctKey: "monsterId",
      distinctAllowed: ["mon_map1_slime", "mon_map1_bird", "mon_map1_boar", "elite_map1_boar_rampage", "boss_map1_boiling_boar"],
    },
    reward: { titleId: "title_bestiary_map1" },
    phase: "core",
  },
  {
    id: "ach_one_shot",
    nameTh: "ทีเดียวจอด",
    category: "combat",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "mob.killed", target: 1, filters: { hpFracBefore: 1.0 } },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_overkill",
    nameTh: "แรงไปไหมเนี่ย",
    category: "combat",
    tier: "MEME",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "mob.killed", target: 1, filters: { overkillPct: ">300" } },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_low_hp_win",
    nameTh: "เหลือเลือดเส้นเดียว",
    category: "combat",
    tier: "HARD",
    visibility: "hidden_condition",
    scope: "character",
    rule: { type: "counter", event: "mob.killed", target: 1, filters: { rank: "boss", playerHpFrac: "<0.05" } },
    reward: { titleId: "title_clutch" },
    phase: "core",
  },

  // ── Elite & Boss (6) ─────────────────────────────────────────────────────────
  {
    id: "ach_elite_first",
    nameTh: "เจอตัวคลั่ง",
    category: "elite_boss",
    tier: "COMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "mob.killed", target: 1, filters: { monsterId: "elite_map1_boar_rampage" } },
    reward: { gold: 50 },
    phase: "core",
  },
  {
    id: "ach_elite_10",
    nameTh: "ปราบความคลั่ง",
    category: "elite_boss",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "mob.killed", target: 10, filters: { monsterId: "elite_map1_boar_rampage" } },
    reward: { gold: 100 },
    phase: "core",
  },
  {
    id: "ach_boss_first",
    nameTh: "เปิดหม้อครั้งแรก",
    category: "elite_boss",
    tier: "COMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "mob.killed", target: 1, filters: { monsterId: "boss_map1_boiling_boar" } },
    reward: { gold: 100 },
    phase: "core",
  },
  {
    id: "ach_boss_10",
    nameTh: "นักล่าหม้อเดือด",
    category: "elite_boss",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "mob.killed", target: 10, filters: { monsterId: "boss_map1_boiling_boar" } },
    reward: { gold: 200 },
    phase: "core",
  },
  {
    id: "ach_boss_last_hit",
    nameTh: "ปิดหม้อ",
    category: "elite_boss",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "mob.killed", target: 1, filters: { rank: "boss", lastHitByPlayer: true } },
    reward: { titleId: "title_finisher" },
    phase: "core",
  },
  {
    id: "ach_boss_solo",
    nameTh: "คนเดียวก็ต้มได้",
    category: "elite_boss",
    tier: "EXTREME",
    visibility: "hidden_condition",
    scope: "character",
    // Composite all[kill{boss}, partySize=1, damageShare=100%] — all-of conditions on ONE mob.killed event
    // (per brief note "composite: all-of conditions ใช้ filters รวมใน event เดียว ตาม ach_boss_solo").
    rule: { type: "composite", event: "mob.killed", target: 1, filters: { rank: "boss", partySize: 1, damageSharePct: 100 } },
    reward: { titleId: "title_lone_chef" },
    phase: "core",
  },

  // ── Enhancement (7) ──────────────────────────────────────────────────────────
  {
    id: "ach_enh_first",
    nameTh: "บวกติดครั้งแรก",
    category: "enhancement",
    tier: "COMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "enhance.success", target: 1 },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_enh_plus5",
    nameTh: "เริ่มเป็นเงา",
    category: "enhancement",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "max_value", event: "enhance.success", target: 5, valueField: "plus" },
    reward: { gold: 50 },
    phase: "core",
  },
  {
    id: "ach_enh_plus10",
    nameTh: "ของจริงเสียที",
    category: "enhancement",
    tier: "HARD",
    visibility: "visible",
    scope: "character",
    rule: { type: "max_value", event: "enhance.success", target: 10, valueField: "plus" },
    reward: { gold: 150 },
    phase: "core",
  },
  {
    id: "ach_enh_plus15",
    nameTh: "ใจถึงพึ่งได้",
    category: "enhancement",
    tier: "EXTREME",
    visibility: "visible",
    scope: "character",
    rule: { type: "max_value", event: "enhance.success", target: 15, valueField: "plus" },
    reward: { titleId: "title_plus15" },
    phase: "core",
  },
  {
    id: "ach_enh_streak5",
    nameTh: "มือขึ้น",
    category: "enhancement",
    tier: "HARD",
    visibility: "visible",
    scope: "character",
    rule: { type: "streak", event: "enhance.success", target: 5, resetEvent: "enhance.fail" },
    reward: { gold: 120 },
    phase: "core",
  },
  {
    id: "ach_enh_fail10",
    nameTh: "วันนี้ดวงไม่เข้าข้าง",
    category: "enhancement",
    tier: "MEME",
    visibility: "visible",
    scope: "character",
    rule: { type: "streak", event: "enhance.fail", target: 10, resetEvent: "enhance.success" },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_enh_100",
    nameTh: "ช่างตีบวกมือฉมัง",
    category: "enhancement",
    tier: "HARD",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "enhance.success", target: 100 },
    reward: { gold: 100 },
    phase: "core",
  },

  // ── Economy (10) ─────────────────────────────────────────────────────────────
  {
    id: "ach_first_sale",
    nameTh: "เปิดร้านแล้ว",
    category: "economy",
    tier: "COMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "shop.sell", target: 1 },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_first_buy",
    nameTh: "ลูกค้าคนแรก",
    category: "economy",
    tier: "COMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "shop.buy", target: 1 },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_sell_100",
    nameTh: "พ่อค้าขาประจำ",
    category: "economy",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "shop.sell", target: 100 },
    reward: { gold: 60 },
    phase: "core",
  },
  {
    id: "ach_gold_1k",
    nameTh: "เริ่มมีตังค์",
    category: "economy",
    tier: "COMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "max_value", event: "gold.balance", target: 1000, valueField: "balance" },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_gold_10k",
    nameTh: "เริ่มมีเงินเก็บ",
    category: "economy",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "max_value", event: "gold.balance", target: 10000, valueField: "balance" },
    reward: { gold: 100 },
    phase: "core",
  },
  {
    id: "ach_gold_earn_50k",
    nameTh: "ขยันหาไม่หยุดมือ",
    category: "economy",
    tier: "HARD",
    visibility: "visible",
    scope: "character",
    // MODELING JUDGMENT: "Counter gold.earned ≥50000" reads as *cumulative Gold earned* (not a count of
    // gold.earned event occurrences, which would be nonsensical at 50000). valueField="amount" tells the
    // engine to sum the payload's amount field toward target, same mechanism max_value uses to read a field.
    rule: { type: "counter", event: "gold.earned", target: 50000, valueField: "amount" },
    reward: { gold: 200 },
    phase: "core",
  },
  {
    id: "ach_storage_first",
    nameTh: "เก็บเข้าคลัง",
    category: "economy",
    tier: "COMMON",
    visibility: "visible",
    scope: "account",
    rule: { type: "counter", event: "storage.deposit", target: 1 },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_storage_100",
    nameTh: "นักสะสมตัวยง",
    category: "economy",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "account",
    rule: { type: "counter", event: "storage.deposit", target: 100 },
    reward: { gold: 40 },
    phase: "core",
  },
  {
    id: "ach_delivery_first",
    nameTh: "ฝากส่งของหน่อย",
    category: "economy",
    tier: "COMMON",
    visibility: "visible",
    scope: "account",
    rule: { type: "counter", event: "delivery.send", target: 1 },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_sell_buyback",
    nameTh: "คิดถึงของเก่า",
    category: "economy",
    tier: "MEME",
    visibility: "hidden_condition",
    scope: "character",
    // Sequence [sell{X}, buy{X}] ≤30s — X = the SAME itemId across both steps (a runtime match, not a fixed
    // filter value). filters:{sameKey:"itemId"} = convention for "engine groups dynamically by this payload
    // key's value across the sequence steps" (same convention as ach_npc_100_same below).
    rule: {
      type: "sequence",
      event: "shop.sell",
      target: 1,
      steps: [
        { event: "shop.sell", filters: { sameKey: "itemId" } },
        { event: "shop.buy", filters: { sameKey: "itemId" } },
      ],
      windowSeconds: 30,
    },
    reward: {},
    phase: "core",
  },

  // ── Loot (4) ─────────────────────────────────────────────────────────────────
  {
    id: "ach_loot_first",
    nameTh: "ของชิ้นแรก",
    category: "loot",
    tier: "COMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "item.dropped", target: 1 },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_loot_100",
    nameTh: "เก็บไม่เลือกของ",
    category: "loot",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "item.dropped", target: 100 },
    reward: { gold: 40 },
    phase: "core",
  },
  {
    id: "ach_loot_rare",
    nameTh: "ของดีมีชัย",
    category: "loot",
    tier: "HARD",
    visibility: "hidden_condition",
    scope: "character",
    rule: { type: "counter", event: "item.dropped", target: 1, filters: { rarity: "rare" } },
    reward: { titleId: "title_lucky_find" },
    phase: "core",
  },
  {
    id: "ach_slime_gel_50",
    nameTh: "นักสะสมเมือก",
    category: "loot",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "item.dropped", target: 50, filters: { itemId: "mat_slime_gel" } },
    reward: { gold: 30 },
    phase: "core",
  },

  // ── Living world (7) ─────────────────────────────────────────────────────────
  {
    id: "ach_first_rain",
    nameTh: "ฝนแรกของแดน",
    category: "living_world",
    tier: "COMMON",
    visibility: "visible",
    scope: "account",
    rule: { type: "counter", event: "weather.changed", target: 1, filters: { weather: "rain" } },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_rain_10",
    nameTh: "คนไม่กลัวเปียก",
    category: "living_world",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "account",
    rule: { type: "counter", event: "weather.changed", target: 10, filters: { weather: "rain" } },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_night_10",
    nameTh: "ชาวราตรี",
    category: "living_world",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "account",
    rule: { type: "counter", event: "phase.changed", target: 10, filters: { phase: "night" } },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_dawn_watcher",
    nameTh: "คนตื่นก่อนฟ้าสาง",
    category: "living_world",
    tier: "MYSTERY",
    visibility: "hidden_condition",
    scope: "account",
    // MODELING JUDGMENT: taxonomy's phase.changed payload = {phase} only (no map). "onMap=map1" needs the
    // engine to additionally tag phase.changed with the player's current mapId — noted here, not invented
    // as a new taxonomy event.
    rule: { type: "counter", event: "phase.changed", target: 1, filters: { phase: "dawn", mapId: "map1" } },
    reward: { titleId: "title_early_bird" },
    phase: "core",
  },
  {
    id: "ach_all_phases",
    nameTh: "ครบวันครบคืน",
    category: "living_world",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "account",
    rule: { type: "distinct_set", event: "phase.changed", target: 4, distinctKey: "phase", distinctAllowed: ["dawn", "day", "dusk", "night"] },
    reward: { titleId: "title_all_hours" },
    phase: "core",
  },
  {
    id: "ach_rain_walk_30",
    nameTh: "เดินเล่นกลางสายฝน",
    category: "living_world",
    tier: "UNCOMMON",
    visibility: "hidden_condition",
    scope: "account",
    // DERIVED EVENT (source doc implementer note): "weather.rain.tick" is NOT one of the 18 taxonomy events —
    // it's a small rain-time accumulator off the world clock (per-minute tick while raining AND on map1) that
    // the C2 engine must synthesize; target=30 minutes. Explicit taxonomy-check exception (see test file).
    rule: { type: "time_accum", event: "weather.rain.tick", target: 30, filters: { mapId: "map1" } },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_npc_first",
    nameTh: "ทักทายชาวบ้าน",
    category: "living_world",
    tier: "COMMON",
    visibility: "visible",
    scope: "account",
    rule: { type: "counter", event: "npc.talk", target: 1 },
    reward: {},
    phase: "core",
  },

  // ── NPC & meme (5) ───────────────────────────────────────────────────────────
  {
    id: "ach_npc_both",
    nameTh: "คุยครบทั้งลุงทั้งป้า",
    category: "npc_meme",
    tier: "COMMON",
    visibility: "visible",
    scope: "account",
    rule: { type: "distinct_set", event: "npc.talk", target: 2, distinctKey: "npcId", distinctAllowed: ["npc_lungdeung", "npc_papu"] },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_npc_lungdeung_50",
    nameTh: "ขาประจำลุงดึ๋ง",
    category: "npc_meme",
    tier: "MEME",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "npc.talk", target: 50, filters: { npcId: "npc_lungdeung" } },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_npc_100_same",
    nameTh: "เขาไม่มีอะไรจะเล่าแล้ว",
    category: "npc_meme",
    tier: "MEME",
    visibility: "hidden_condition",
    scope: "character",
    // filters:{sameKey:"npcId"} = engine groups by npcId dynamically (100 talks to the SAME npc, not total
    // across different npcs) — per brief's explicit modeling convention.
    rule: { type: "counter", event: "npc.talk", target: 100, filters: { sameKey: "npcId" } },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_return_town_1min",
    nameTh: "ลืมอะไรไว้เหรอ",
    category: "npc_meme",
    tier: "MEME",
    visibility: "hidden_condition",
    scope: "character",
    rule: {
      type: "sequence",
      event: "map.enter",
      target: 1,
      steps: [
        { event: "map.enter", filters: { mapId: "map1" } },
        { event: "map.enter", filters: { mapId: "city-hub" } },
      ],
      windowSeconds: 60,
    },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_logo_click_100",
    nameTh: "ดึ๋งปุ๊!",
    category: "npc_meme",
    tier: "MEME",
    visibility: "hidden_full",
    scope: "account",
    rule: { type: "counter", event: "ui.logo.click", target: 100 },
    reward: { titleId: "title_dungpu" },
    phase: "core",
  },

  // ── Death (4) ────────────────────────────────────────────────────────────────
  {
    id: "ach_first_death",
    nameTh: "ล้มครั้งแรก",
    category: "death",
    tier: "COMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "death", target: 1 },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_die_before_kill",
    nameTh: "มือใหม่ของแท้",
    category: "death",
    tier: "MEME",
    visibility: "hidden_full",
    scope: "character",
    rule: { type: "composite", event: "death", target: 1, notOccurredEvent: "mob.killed" },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_death_same_spot_10",
    nameTh: "จุดตายประจำ",
    category: "death",
    tier: "MEME",
    visibility: "hidden_condition",
    scope: "character",
    // filters:{sameCell:true} = engine groups by mapId+gridCell dynamically (10 deaths at the SAME cell).
    rule: { type: "counter", event: "death", target: 10, filters: { sameCell: true } },
    reward: {},
    phase: "core",
  },
  {
    id: "ach_death_100",
    nameTh: "ล้มแล้วลุกเสมอ",
    category: "death",
    tier: "UNCOMMON",
    visibility: "visible",
    scope: "character",
    rule: { type: "counter", event: "death", target: 100 },
    reward: {},
    phase: "core",
  },

  // ── Expanded (5 — hidden until the corresponding content ships; not part of the 60 core) ────────
  // Source table only gives id/nameTh/trigger/phase(content-gate) columns, no tier/vis/scope/reward —
  // MODELING JUDGMENT (all 5): tier=COMMON (simplest 1-shot "first" pattern, matches ach_first_step /
  // ach_elite_first shape), scope=character (matches other "first"/map.enter achievements), reward={} (no
  // reward specified in source), visibility=hidden_condition by default per the category note ("hidden
  // จนกว่า content ship") except ach_dungdung_speaks which the doc explicitly marks "(hidden full)".
  // category = the source doc's own "phase" (content-gate) column, transcribed verbatim (snake_case).
  {
    id: "ach_map_2",
    nameTh: "ทางยังอีกยาว",
    category: "maps_2_4",
    tier: "COMMON",
    visibility: "hidden_condition",
    scope: "character",
    rule: { type: "counter", event: "map.enter", target: 1, filters: { mapId: "map2" } },
    reward: {},
    phase: "expanded",
  },
  {
    id: "ach_dungdung_rescue",
    nameTh: "เพื่อนตัวเล็ก",
    category: "companion",
    tier: "COMMON",
    visibility: "hidden_condition",
    scope: "character",
    // companion.rescued — expanded event, not yet in the 18-taxonomy (source doc: "expanded events
    // (companion.*, bot.deployed) ยังไม่ต้องสร้าง"); excluded from the core taxonomy test on purpose.
    rule: { type: "counter", event: "companion.rescued", target: 1 },
    reward: {},
    phase: "expanded",
  },
  {
    id: "ach_dungdung_speaks",
    nameTh: "มันพูดได้เหรอ?!",
    category: "companion",
    tier: "COMMON",
    visibility: "hidden_full", // source doc explicit "(hidden full)"
    scope: "character",
    rule: { type: "counter", event: "companion.spoke", target: 1 },
    reward: {},
    phase: "expanded",
  },
  {
    id: "ach_archer_first_kill",
    nameTh: "ธนูก็เอาอยู่",
    category: "archer",
    tier: "COMMON",
    visibility: "hidden_condition",
    scope: "character",
    // "class=archer" — archer class content not shipped; mob.killed payload will need a playerClass field
    // extension when archer ships (not part of the current 18-taxonomy payload list; not invented here as
    // core-scope work, just noted for future archer-class C2 wiring).
    rule: { type: "counter", event: "mob.killed", target: 1, filters: { playerClass: "archer" } },
    reward: {},
    phase: "expanded",
  },
  {
    id: "ach_bot_first",
    nameTh: "มีลูกน้องแล้ว",
    category: "bot",
    tier: "COMMON",
    visibility: "hidden_condition",
    scope: "character",
    rule: { type: "counter", event: "bot.deployed", target: 1 },
    reward: {},
    phase: "expanded",
  },
];
