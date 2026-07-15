// Bot (Hunter Assistant) panel — pure logic only (no React/DOM), เทสต์ตรงด้วย Vitest (pattern เดียวกับ
// shop-view.ts/storage-view.ts/journal-view.ts, docs/agent-rules.md). Component จริงอยู่ BotPanel.tsx/
// BotHudButton.tsx/BotAlertToast.tsx — เรียกฟังก์ชันที่นี่เท่านั้น ไม่มี logic ซ้ำใน component.
//
// สเปก: deungpu_P3_BOT_AND_REPORT_UI_IMPLEMENTATION_SPEC_v1.md (LOCKED) — MVP scope ตาม orchestrator brief:
// Schedule panel (P4) + Pro analytics = locked placeholder "เร็วๆ นี้" (ยังไม่ทำ), notification prefs = defer.
// 4 แท็บ: สถานะ (Hub/Live, §2/§7) · โปรไฟล์ (Setup+Rule Builder v1 แบบง่าย, §3/§4) · รายงาน (§8) · แพ็กเกจ (§11).
//
// ⚠ ห้ามปนกับ Auto Pilot (D-037 auto-walk) หรือดึ๋งๆ companion (D-035) — คนละปุ่ม/คนละ panel/คนละสิทธิ์ (§0.1).

import type {
  BotOpResultMessage,
  BotRulesWire,
  BotTierCapsWire,
  BotTierStateMessage,
  BotTierWire,
} from "@/shared/net-protocol";
import type { PanelId } from "@/ui/panels";

/** panel id คงที่ของ bot hub (7b-UI) — ใช้ทั้ง openPanel/closePanel และ <Panel id> */
export const BOT_PANEL_ID: PanelId = "bot";

export type BotTab = "status" | "profiles" | "reports" | "packages";

export const BOT_TAB_LABELS: Readonly<Record<BotTab, string>> = {
  status: "สถานะ",
  profiles: "โปรไฟล์",
  reports: "รายงาน",
  packages: "แพ็กเกจ",
};

export const BOT_TAB_ORDER: readonly BotTab[] = ["status", "profiles", "reports", "packages"];

// ── Tier / pass display (D-063, §2/§11) ──────────────────────────────────────────────────────────────────

export const BOT_TIER_LABELS: Readonly<Record<BotTierWire, string>> = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
};

export function botTierLabel(tier: BotTierWire): string {
  return BOT_TIER_LABELS[tier];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ป้ายวันหมดอายุ (§2 "วันที่เต็มเสมอ · เพิ่ม countdown เมื่อเหลือ < 24 ชม. — ห้าม countdown เร่งเร้าตอนเหลือเยอะ").
 * null = Free ตลอดไป. ใช้ UTC methods (deterministic ข้าม timezone ของเครื่องรัน — ไม่ผูก locale เครื่อง caller).
 */
export function formatPassExpiry(passExpiresAt: number | null, nowMs: number): string {
  if (passExpiresAt === null) return "ฟรีตลอดไป";
  const d = new Date(passExpiresAt);
  const dateLabel = `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const remainMs = passExpiresAt - nowMs;
  if (remainMs <= 0) return `หมดอายุแล้ว (${dateLabel})`;
  if (remainMs < DAY_MS) {
    const remainHours = Math.max(1, Math.ceil(remainMs / (60 * 60 * 1000)));
    return `หมดอายุ ${dateLabel} (เหลืออีก ${remainHours} ชม.)`;
  }
  return `หมดอายุ ${dateLabel}`;
}

/**
 * ตาราง tier mirror ของ server DEFAULT_BOT_CONFIG (server/config/bot.ts, D-063 §15 canonical) — display-only.
 * server เป็น source of truth จริงเสมอ (ส่งมาทาง bot:tierState.caps) — ตารางนี้ใช้แค่ "แพ็กเกจ" tab
 * (เทียบ 3 tier + ราคา pass ที่ยังไม่ได้ผูก tierState เพราะ tier อื่นที่ไม่ใช่ tier ปัจจุบันไม่มี caps ส่งมา).
 */
export interface BotTierPassPrice {
  days: number;
  priceThb: number;
}

export interface BotTierPlan {
  tier: BotTierWire;
  caps: BotTierCapsWire;
  /** แพ็กเกจซื้อได้ (Free ไม่มี — ฟรีตลอดไป) */
  passes: readonly BotTierPassPrice[];
}

export const BOT_TIER_PLANS: readonly BotTierPlan[] = [
  {
    tier: "free",
    caps: { profiles: 1, rules: 3, reportRetentionDays: 1, notifications: false, schedules: 0, analytics: false },
    passes: [],
  },
  {
    tier: "plus",
    caps: { profiles: 3, rules: 10, reportRetentionDays: 14, notifications: true, schedules: 2, analytics: false },
    passes: [
      { days: 1, priceThb: 9 },
      { days: 10, priceThb: 39 },
      { days: 30, priceThb: 79 },
    ],
  },
  {
    tier: "pro",
    caps: { profiles: 10, rules: 25, reportRetentionDays: 90, notifications: true, schedules: 10, analytics: true },
    passes: [
      { days: 1, priceThb: 15 },
      { days: 10, priceThb: 69 },
      { days: 30, priceThb: 149 },
    ],
  },
];

/** แถวตารางเทียบ tier (§11/§15) — label ไทย + วิธีอ่านค่าจาก BotTierPlan.caps ของแต่ละ tier */
export interface BotTierCompareRow {
  label: string;
  values: Readonly<Record<BotTierWire, string>>;
}

export function botTierComparisonRows(): readonly BotTierCompareRow[] {
  const by = <K extends keyof BotTierCapsWire>(key: K, fmt: (v: BotTierCapsWire[K]) => string): Readonly<Record<BotTierWire, string>> => {
    const out: Record<string, string> = {};
    for (const plan of BOT_TIER_PLANS) out[plan.tier] = fmt(plan.caps[key]);
    return out as Readonly<Record<BotTierWire, string>>;
  };
  return [
    { label: "Runtime", values: { free: "24/7 ไม่จำกัด", plus: "24/7 ไม่จำกัด", pro: "24/7 ไม่จำกัด" } },
    { label: "โปรไฟล์", values: by("profiles", (v) => String(v)) },
    { label: "กฎ (skill+potion+loot+custom stop)", values: by("rules", (v) => String(v)) },
    { label: "เก็บรายงานย้อนหลัง", values: by("reportRetentionDays", (v) => `${v} วัน`) },
    { label: "แจ้งเตือนนอกเกม", values: by("notifications", (v) => (v ? "เปิด" : "ปิด")) },
    { label: "ตั้งเวลา (Schedule)", values: by("schedules", (v) => (v > 0 ? String(v) : "—")) },
    { label: "Analytics ขั้นสูง", values: by("analytics", (v) => (v ? "✓" : "—")) },
    { label: "9 เงื่อนไขความปลอดภัยบังคับ", values: { free: "✓ ปิดไม่ได้", plus: "✓ ปิดไม่ได้", pro: "✓ ปิดไม่ได้" } },
  ];
}

/**
 * cross-tier overwrite ต้อง confirm (§12.5, วันที่เหลือของ pass เดิมจะหาย) · same-tier renew ไม่ต้อง (§12.6,
 * เป็นบวก) · ซื้อจาก Free/pass หมดอายุแล้ว = ไม่ต้อง confirm (ไม่มีอะไรจะหาย). PURE — inject nowMs (เทสต์).
 */
export interface BotPurchaseConfirmation {
  needsConfirm: boolean;
  /** จำนวนวันที่เหลือของ pass เดิมที่จะหาย (ปัดขึ้น) — มีค่าเฉพาะ needsConfirm=true */
  lostDays?: number;
}

export function resolveBotPurchaseConfirmation(
  current: BotTierStateMessage | null,
  selectedTier: BotTierWire,
  nowMs: number,
): BotPurchaseConfirmation {
  if (!current || current.tier === "free" || current.passExpiresAt === null) return { needsConfirm: false };
  const active = current.passExpiresAt > nowMs;
  if (!active) return { needsConfirm: false };
  if (current.tier === selectedTier) return { needsConfirm: false }; // renew ต่อท้าย (§12.6) — ไม่ต้องเตือน
  const lostDays = Math.max(0, Math.ceil((current.passExpiresAt - nowMs) / DAY_MS));
  return { needsConfirm: true, lostDays };
}

// ── Stop reasons (P3 §5/§9/§10 — 9 mandatory + manual/server_restart/expired_readonly) ───────────────────
//
// ค่า reason ตัวจริงส่งมาเป็น string ธรรมดา (net-protocol.ts BotStoppedMessage.reason ไม่ narrow เป็น union
// ฝั่ง wire) — mirror ของ server/config/bot.ts BotStopReason (ไม่ import server/** ข้าม layer). disconnect
// ไม่มีในลิสต์ (N/A: บอทฝั่ง server ไม่หยุดเพราะปิดแท็บ, comment ต้นทางใน config.ts).

export function botStopReasonLabel(reason: string): string {
  switch (reason) {
    case "inventory_full":
      return "กระเป๋าเต็ม บอทหยุดปลอดภัยแล้ว";
    case "low_hp":
      return "HP ต่ำ บอทหยุด (แทนเงื่อนไข “โพชั่นหมด” — ยังไม่มีระบบโพชั่น)";
    case "death":
      return "ตัวละครตาย บอทหยุดปลอดภัยแล้ว";
    case "map_unsafe":
      return "พื้นที่ไม่ปลอดภัย บอทกลับจุดเซฟแล้ว";
    case "stuck":
      return "หาเป้าหมายไม่เจอต่อเนื่อง บอทหยุดปลอดภัยแล้ว";
    case "rare_found":
      return "เจอของแรร์! บอทหยุดรอคุณ";
    case "boss_or_event":
      return "พบบอส/อีเวนต์ในระยะ บอทหยุดปลอดภัยแล้ว";
    case "secret_trigger":
      return "พบจุดลับ บอทหยุดปลอดภัยแล้ว";
    case "captcha":
      return "ต้องยืนยันตัวตนก่อนทำต่อ";
    case "manual":
      return "หยุดโดยคุณเอง";
    case "server_restart":
      return "เซิร์ฟเวอร์รีสตาร์ท บอทหยุดปลอดภัยแล้ว (ของที่ได้ถูกบันทึกแล้ว)";
    case "expired_readonly":
      return "แพ็กเกจหมดอายุ โปรไฟล์นี้ถูกพัก (อ่านอย่างเดียว)";
    default:
      return "บอทหยุดทำงาน";
  }
}

/** รายงานที่ยังไม่หยุด (stopReason=null, session กำลังทำงาน/ข้อมูล ณ ตอนดึง) → ข้อความต่างจากหยุดแล้ว */
export function reportStopReasonLabel(stopReason: string | null): string {
  return stopReason === null ? "กำลังทำงาน (ข้อมูล ณ ตอนดึงรายงาน)" : botStopReasonLabel(stopReason);
}

// ── Op result rejection reasons (bot:opResult.reason — server/bot/manager.ts + profiles.ts + tier.ts) ─────

export function botOpRejectionLabel(reason: string | undefined): string {
  switch (reason) {
    case "requires_db":
      return "ระบบบอทยังไม่พร้อมใช้งานตอนนี้";
    case "bad_name":
      return "ชื่อไม่ถูกต้อง (1-40 ตัวอักษร)";
    case "pocket_not_allowed":
      return "พื้นที่นี้ไม่อนุญาตให้บอทเข้า";
    case "profiles_at_cap":
      return "โปรไฟล์เต็มเพดานของแพ็กเกจนี้แล้ว";
    case "rules_over_cap":
      return "กฎเกินเพดานของแพ็กเกจนี้";
    case "not_found":
      return "ไม่พบโปรไฟล์นี้";
    case "profile_readonly":
      return "โปรไฟล์นี้ถูกพัก (อ่านอย่างเดียว) จากการลดระดับแพ็กเกจ";
    case "no_character":
      return "ไม่พบตัวละคร";
    case "already_running":
      return "มีบอทกำลังทำงานอยู่แล้ว (1 บัญชีรันได้ครั้งละ 1 บอท)";
    case "at_capacity":
      return "เซิร์ฟเวอร์เต็ม ลองใหม่อีกครั้ง";
    case "no_room":
      return "ไม่พบห้องสำหรับแผนที่นี้";
    case "db_error":
    case "spawn_failed":
      return "เริ่มบอทไม่สำเร็จ ลองใหม่อีกครั้ง";
    case "not_running":
      return "ไม่มีบอทกำลังทำงานอยู่";
    case "free_not_purchasable":
      return "แพ็กเกจ Free ใช้ได้ฟรีอยู่แล้ว ไม่ต้องซื้อ";
    case "unknown_tier":
    case "unknown_pass_duration":
      return "แพ็กเกจ/ระยะเวลานี้ไม่ถูกต้อง";
    default:
      return "ตั้งค่ากฎไม่ถูกต้อง";
  }
}

// ── Op phase machine (create/update/delete/start/stop/mockPurchase ผ่าน MSG_BOT_OP_RESULT เดียว) ──────────
// pattern เดียวกับ ShopTxPhase (shop-view.ts) — ต่างที่ key ด้วย `op` (string) อย่างเดียวเพราะ panel นี้ให้ทำ
// ทีละ action เดียว (ปุ่ม disable ระหว่าง processing กันชนกัน) ไม่ต้องมี itemId แยก transaction พร้อมกัน.

export type BotOpPhase =
  | { kind: "idle" }
  | { kind: "processing"; op: string }
  | { kind: "settled"; result: BotOpResultMessage }
  | { kind: "timed_out"; op: string };

export type BotOpState = "IDLE" | "PROCESSING" | "SUCCESS" | "REJECTED" | "UNKNOWN_RECONCILING";

export function resolveBotOpState(phase: BotOpPhase): BotOpState {
  switch (phase.kind) {
    case "processing":
      return "PROCESSING";
    case "timed_out":
      return "UNKNOWN_RECONCILING";
    case "settled":
      return phase.result.ok ? "SUCCESS" : "REJECTED";
    default:
      return "IDLE";
  }
}

export function canConfirmBotOp(state: BotOpState): boolean {
  return state !== "PROCESSING" && state !== "UNKNOWN_RECONCILING";
}

export function botOpMessage(state: BotOpState, result: BotOpResultMessage | null): string {
  switch (state) {
    case "PROCESSING":
      return "กำลังทำรายการ…";
    case "SUCCESS":
      return "สำเร็จ";
    case "REJECTED":
      return botOpRejectionLabel(result?.reason);
    case "UNKNOWN_RECONCILING":
      return "ไม่ได้รับผลลัพธ์ กำลังซิงก์ข้อมูลล่าสุด กรุณารอสักครู่";
    default:
      return "";
  }
}

// ── Rule count (mirror server/bot/profiles.ts countRules — §16 Q3/Q4 นับรวม 1 toggle/condition = 1 rule) ──

/**
 * นับกฎที่ profile นี้ใช้ไปกี่ rule ต่อเพดาน tier — สูตรตรงกับ server (server/bot/profiles.ts countRules,
 * documented ที่นั่นว่า "client counter สามารถ mirror ได้" — defense-in-depth, server เป็น truth สุดท้าย).
 */
export function countBotRules(rules: BotRulesWire): number {
  const skill = rules.skillSlots.length;
  const potion = rules.potionThresholdPct != null ? 1 : 0;
  const loot = 1; // loot filter นับเป็น 1 rule เสมอ (v1)
  return skill + potion + loot;
}

export function ruleCountLabel(used: number, cap: number): string {
  return `ใช้กฎไป ${used}/${cap}`;
}

export function profileCountLabel(used: number, cap: number): string {
  return `${used}/${cap}`;
}

export function canCreateMoreProfiles(usedCount: number, cap: number): boolean {
  return usedCount < cap;
}

/** ชื่อ profile ถูกต้องไหม (mirror server/bot/profiles.ts createProfile: trim แล้ว 1-40 ตัวอักษร) */
export function isValidBotProfileName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 40;
}

// ── Map/pocket allow-list (client mirror — server/config/bot.ts เป็น SERVER-ONLY, ui ห้าม import ข้าม layer)
//
// ⚠ ต้องตรงกับ server/config/bot.ts DEFAULT_BOT_CONFIG.botAllowedPockets เสมอ (D-063 + MAPS_2_4 §6 + Map 1
// §8/§11) — แก้ที่นี่ทุกครั้งที่แก้ฝั่ง server. server เป็น authority จริง (validate ซ้ำทุก create/update/start);
// รายการนี้ใช้แค่ประกอบ dropdown ฝั่ง client (defense-in-depth เท่านั้น ไม่ใช่ security boundary).

export const BOT_ALLOWED_POCKETS: Readonly<Record<string, readonly string[]>> = {
  map1: ["map1-slime-center", "map1-bird-east", "map1-boar-southwest"],
  map2: ["map2-mushroom-west", "map2-scarecrow-center", "map2-rat-east"],
  map3: ["map3-root-center", "map3-monkey-center-east", "map3-stone-center-ne"],
  map4: ["map4-wisp-west", "map4-wisp-center", "map4-dream-center", "map4-deer-east"],
};

export const BOT_MAP_LABELS: Readonly<Record<string, string>> = {
  map1: "แผนที่ 1",
  map2: "แผนที่ 2",
  map3: "แผนที่ 3",
  map4: "แผนที่ 4",
};

export function botMapLabel(mapId: string): string {
  return BOT_MAP_LABELS[mapId] ?? mapId;
}

const BOT_POCKET_LABELS: Readonly<Record<string, string>> = {
  "map1-slime-center": "กลางทุ่ง (สไลม์)",
  "map1-bird-east": "ฝั่งตะวันออก (นก)",
  "map1-boar-southwest": "ตะวันตกเฉียงใต้ (หมูป่า)",
  "map2-mushroom-west": "ฝั่งตะวันตก (แปลงเห็ด)",
  "map2-scarecrow-center": "กลาง (ทุ่งฟาง)",
  "map2-rat-east": "ฝั่งตะวันออก (คันนา/หนูนา)",
  "map3-root-center": "กลาง (ทางป่าเก่า)",
  "map3-monkey-center-east": "ตะวันออกเฉียงกลาง (ลิง)",
  "map3-stone-center-ne": "ตะวันออกเฉียงเหนือ (สะพานไม้)",
  "map4-wisp-west": "ฝั่งตะวันตก (บ่อน้ำจันทร์)",
  "map4-wisp-center": "กลาง (ป่าหมอก)",
  "map4-dream-center": "กลาง (เห็ดฝัน)",
  "map4-deer-east": "ฝั่งตะวันออก (ทุ่งกวางเงา)",
};

export function botPocketLabel(pocketId: string): string {
  return BOT_POCKET_LABELS[pocketId] ?? pocketId;
}

/** map ที่มี bot-allowed pocket อย่างน้อย 1 อัน (ตัวเลือก dropdown "เลือก map") */
export function botMapOptions(): readonly string[] {
  return Object.keys(BOT_ALLOWED_POCKETS);
}

/** pocket ที่ bot-safe ของ map นั้น (ตัวเลือก dropdown "เลือก pocket") — [] ถ้า map ไม่มีใน allow-list */
export function botPocketOptions(mapId: string): readonly string[] {
  return BOT_ALLOWED_POCKETS[mapId] ?? [];
}

export function isBotAllowedPocketClient(mapId: string, pocketId: string): boolean {
  return botPocketOptions(mapId).includes(pocketId);
}

// ── Rule Builder v1 (§4: skill slot toggles + lootAll toggle + potionThreshold disabled placeholder) ──────

/**
 * ช่องสกิลที่ UI ให้ toggle (S1-S4) — คลาสที่มีตอนนี้ (นักดาบ/นักธนู, src/game/skill/data/*-skills-client.ts)
 * มี 4 สกิลต่ออาชีพเท่านั้น. server อนุญาต index 0..7 (MAX_SKILL_SLOTS, server/bot/profiles.ts) กว้างกว่านี้
 * เผื่ออนาคต — ui ห้าม import src/game/** ข้าม layer (ui.md contract) จึงใช้เลข slot ตาย ๆ ไม่ใช่ชื่อสกิลจริง.
 */
export const BOT_RULE_SKILL_SLOTS: readonly number[] = [0, 1, 2, 3];

export function defaultBotRules(): BotRulesWire {
  return { skillSlots: [0], potionThresholdPct: null, lootAll: true };
}

export function toggleBotSkillSlot(rules: BotRulesWire, slot: number): BotRulesWire {
  const has = rules.skillSlots.includes(slot);
  const skillSlots = has
    ? rules.skillSlots.filter((s) => s !== slot)
    : [...rules.skillSlots, slot].sort((a, b) => a - b);
  return { ...rules, skillSlots };
}

export function setBotLootAll(rules: BotRulesWire, lootAll: boolean): BotRulesWire {
  return { ...rules, lootAll };
}

export function hasAtLeastOneSkillSlot(rules: BotRulesWire): boolean {
  return rules.skillSlots.length > 0;
}

// ── Live status formatting (§7 Live Status) ────────────────────────────────────────────────────────────

const BOT_ACTION_LABELS: Readonly<Record<string, string>> = {
  moving: "กำลังเดินไปเป้าหมาย",
  attacking: "กำลังโจมตี",
  searching: "กำลังค้นหาเป้าหมาย",
};

export function botActionLabel(action: string): string {
  return BOT_ACTION_LABELS[action] ?? action;
}

export function formatHpPercent(hpFraction: number): string {
  return `${Math.round(Math.max(0, Math.min(1, hpFraction)) * 100)}%`;
}

/** uptime/session duration แบบสั้น — ชม./นาที/วิ ตัดหน่วยที่เป็น 0 ทิ้ง (ยกเว้นทั้งหมด 0 = "0 วิ") */
export function formatDurationShort(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h} ชม. ${m} นาที`;
  if (m > 0) return `${m} นาที ${s} วิ`;
  return `${s} วิ`;
}

/** วันที่/เวลาแบบสั้น (รายงาน §8) — UTC methods (deterministic ข้าม timezone เครื่อง, เหมือน formatPassExpiry) */
export function formatEpochMs(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}
