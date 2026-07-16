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
  BotCheckpointKindWire,
  BotOpResultMessage,
  BotRulesWire,
  BotTierCapsWire,
  BotTierStateMessage,
  BotTierWire,
} from "@/shared/net-protocol";
import type { BotContinuityStateWire } from "@/shared/bot-continuity";
import {
  validateWorkflow,
  type BotWorkflowBranchStep,
  type BotWorkflowCondition,
  type BotWorkflowFarmStep,
  type BotWorkflowMetric,
  type BotWorkflowStatusCursor,
  type BotWorkflowStep,
  type BotWorkflowStepKind,
  type BotWorkflowTownStep,
  type BotWorkflowV1,
  BOT_WORKFLOW_VERSION,
} from "@/shared/bot-workflow";
import type { KeyValueStorage } from "@/engine/net/reconnect-store";
import type { PanelId } from "@/ui/panels";

/** panel id คงที่ของ bot hub (7b-UI) — ใช้ทั้ง openPanel/closePanel และ <Panel id> */
export const BOT_PANEL_ID: PanelId = "bot";

export type BotTab = "status" | "profiles" | "reports" | "packages";

// PR7 terminology (P3 Bot UI spec §2 locked): "แผนงาน" แทน "โปรไฟล์/บอท" ทั้ง panel — Hub สื่อ "แผนที่บันทึกไว้
// + ตัวละครจริงกำลังทำแผนไหน" ไม่ใช่ "บอทหลายตัว". `BotTab`/type อื่นคงชื่อ id เดิม (ไม่ใช่ user-facing copy).
export const BOT_TAB_LABELS: Readonly<Record<BotTab, string>> = {
  status: "สถานะ",
  profiles: "แผนงาน",
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
  // D-072: ถอดแถว Schedule/ตารางเวลา ออกทั้งหมด (deferred feature — ไม่โชว์ใน tier table อีกต่อไป).
  return [
    { label: "Runtime", values: { free: "24/7 ไม่จำกัด", plus: "24/7 ไม่จำกัด", pro: "24/7 ไม่จำกัด" } },
    { label: "แผน", values: by("profiles", (v) => String(v)) },
    { label: "กฎ (skill+potion+loot+custom stop)", values: by("rules", (v) => String(v)) },
    { label: "เก็บรายงานย้อนหลัง", values: by("reportRetentionDays", (v) => `${v} วัน`) },
    { label: "แจ้งเตือนนอกเกม", values: by("notifications", (v) => (v ? "เปิด" : "ปิด")) },
    { label: "Analytics ขั้นสูง", values: by("analytics", (v) => (v ? "✓" : "—")) },
    { label: "เพดานพลัง/รางวัล", values: { free: "เท่ากัน", plus: "เท่ากัน", pro: "เท่ากัน" } },
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

// ── D-067 settlement/event compatibility labels ─────────────────────────────────────────────────────
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
      return "พื้นที่แผนไม่ปลอดภัย ระบบหยุดการควบคุมแล้ว";
    case "stuck":
      return "หาเป้าหมายไม่เจอต่อเนื่อง บอทหยุดปลอดภัยแล้ว";
    case "rare_found":
      return "เจอของแรร์! บอทหยุดรอคุณ";
    case "boss_or_event":
      return "พบเป้าหมายต้องห้าม (บอส/อีลิต/อีเวนต์) ระบบหยุดการควบคุมแล้ว";
    case "secret_trigger":
      return "พบจุดลับ บอทหยุดปลอดภัยแล้ว";
    case "captcha":
      return "ต้องยืนยันตัวตนก่อนทำต่อ";
    case "manual":
      return "หยุดโดยคุณเอง";
    case "profile_deleted":
      return "แผนนี้ถูกลบ ระบบหยุดการควบคุมแล้ว";
    case "server_restart":
      return "เซิร์ฟเวอร์รีสตาร์ท บอทหยุดปลอดภัยแล้ว (ของที่ได้ถูกบันทึกแล้ว)";
    case "expired_readonly":
      return "แพ็กเกจหมดอายุ แผนนี้ถูกพัก (อ่านอย่างเดียว)";
    case "town_trip_failed":
      return "วาร์ปเข้าเมืองล้มเหลว ตัวละครพักปลอดภัยอยู่ในเมือง บอทรอคุณ";
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
      return "แผนเต็มเพดานของแพ็กเกจนี้แล้ว";
    case "rules_over_cap":
      return "กฎเกินเพดานของแพ็กเกจนี้";
    case "not_found":
      return "ไม่พบแผนนี้";
    case "profile_readonly":
      return "แผนนี้ถูกพัก (อ่านอย่างเดียว) จากการลดระดับแพ็กเกจ";
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
    case "checkpoint_saving":
      return "กำลังบันทึกจุดทำงาน กรุณารอสักครู่";
    case "checkpoint_not_found":
      return "ไม่พบจุดทำงานนี้ หรือถูกใช้ไปแล้ว";
    case "checkpoint_failed":
      return "บันทึกจุดทำงานไม่สำเร็จ กรุณาเริ่มแผนใหม่";
    case "checkpoint_character_mismatch":
    case "actor_mismatch":
      return "จุดทำงานนี้ไม่ใช่ของตัวละครที่กำลังเล่น";
    case "checkpoint_requires_pro":
      return "ต้องเป็นแพ็กเกจ Pro เพื่อกู้แผนต่อหลังเซิร์ฟเวอร์รีสตาร์ท";
    case "free_not_purchasable":
      return "แพ็กเกจ Free ใช้ได้ฟรีอยู่แล้ว ไม่ต้องซื้อ";
    case "unknown_tier":
    case "unknown_pass_duration":
      return "แพ็กเกจ/ระยะเวลานี้ไม่ถูกต้อง";
    // PR6b Pro goal chain
    case "workflow_requires_pro":
      return "งานหลายขั้นใช้ได้เฉพาะแพ็กเกจ Pro";
    case "workflow_map_not_allowed":
      return "งานหลายขั้นมีขั้นที่ใช้พื้นที่ที่ไม่อนุญาตให้บอท";
    case "workflow_invalid_step":
      return "ลำดับงานหลายขั้นไม่ถูกต้อง";
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
  const workflow = rules.workflow ? rules.workflow.steps.length : 0; // PR6b: แต่ละ step นับเป็น 1 rule
  return skill + potion + loot + workflow;
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

// ── PR7: continuity.state = authority for status display (server-owned, client never advances it) ───────
// ครบ 14 states ตาม src/shared/bot-continuity.ts BOT_CONTINUITY_STATES — Record นี้บังคับด้วย TS ให้ครบทุกตัว.
export const BOT_CONTINUITY_LABELS: Readonly<Record<BotContinuityStateWire, string>> = {
  WORKING: "ทำงาน",
  TRAVELING: "เดินทาง",
  COMBAT: "ต่อสู้",
  LOOTING: "เก็บของ",
  RECOVERING: "ฟื้นตัว",
  RETURNING_TO_TOWN: "เข้าเมือง",
  SELLING: "ขายของ",
  DEPOSITING: "ฝากของ",
  RESTOCKING: "ซื้อของ",
  RETURNING_TO_WORK: "กลับไปทำงาน",
  PAUSED: "พัก",
  WAITING_FOR_OWNER: "รอเจ้าของ",
  COMPLETED: "จบแผน",
  FAILED: "ล้มเหลว",
};

export function botContinuityLabel(state: BotContinuityStateWire): string {
  return BOT_CONTINUITY_LABELS[state];
}

/** ป้ายสถานะที่ UI แสดงจริง — authority คือ continuity.state เสมอ, action เป็น fallback เฉพาะไม่มี continuity. */
export function botStatusStateLabel(
  continuity: { state: BotContinuityStateWire } | null | undefined,
  action: string,
): string {
  return continuity ? botContinuityLabel(continuity.state) : botActionLabel(action);
}

// ── PR7 §3: resume CTA แยกตาม checkpoint.kind (takeover vs restart) + reassure ผลฟาร์มไม่หาย เสมอ ────────
export const BOT_RESUME_REASSURANCE = "ผลที่ฟาร์มมาไม่หาย";

export function botResumeCtaLabel(kind: BotCheckpointKindWire | undefined): string {
  return kind === "restart" ? "ทำต่อ (เซิร์ฟเวอร์รีสตาร์ท)" : "ทำต่อจากที่ค้าง";
}

/** ป้ายบอกที่มา checkpoint เฉพาะตอน restart (D-067 durable resume) — null = ไม่ต้องแสดง (takeover ปกติ) */
export function botCheckpointRestartBadge(kind: BotCheckpointKindWire | undefined): string | null {
  return kind === "restart" ? "จุดทำงานนี้มาจากตอนเซิร์ฟเวอร์รีสตาร์ท" : null;
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

// ── PR6b งานหลายขั้น (Pro goal chain) — pure helpers (label / progress / mirror validation / draft edits) ──────
//
// ⚠ ต้องตรงกับ server/config/bot.ts workflow.maxSteps เสมอ (Design Knob) — client mirror เพื่อ defense-in-depth
// เท่านั้น; server validate ซ้ำทุก create/update/start (validateWorkflow เดียวกัน, allow-list ฝั่ง server เป็นจริง).
// PR6b UI รองรับ step ชนิด farm + town_service; PR7 เติม branch step editor + live progress ด้านล่าง.

export const BOT_WORKFLOW_MAX_STEPS_CLIENT = 10;

export const BOT_WORKFLOW_METRIC_LABELS: Readonly<Record<BotWorkflowMetric, string>> = {
  kills: "จำนวนที่ล่า",
  gold: "ทองที่ได้",
  exp: "EXP ที่ได้",
  durationMs: "เวลา (นาที)",
};

/** ตัวเลือก goal ที่ UI ให้เลือก (ตรงกับ BotWorkflowMetric) */
export const BOT_WORKFLOW_GOAL_TYPES: readonly BotWorkflowMetric[] = ["kills", "gold", "exp", "durationMs"];

/** ป้าย goal แบบสั้น เช่น "ล่า 50" / "เวลา 5 นาที" (durationMs แสดงเป็นนาที เพื่อ owner อ่านง่าย) */
export function formatWorkflowGoal(goal: BotWorkflowCondition): string {
  if (goal.type === "durationMs") return `${BOT_WORKFLOW_METRIC_LABELS.durationMs} ${Math.round(goal.target / 60000)} นาที`;
  return `${BOT_WORKFLOW_METRIC_LABELS[goal.type]} ${goal.target}`;
}

/** ความคืบหน้าเทียบเป้า เช่น "12/50" — done/target ตาม goalDone/goalTarget ใน bot:status.workflow */
export function formatWorkflowProgress(done: number, target: number): string {
  return `${Math.max(0, done)}/${Math.max(0, target)}`;
}

/** ป้ายหนึ่ง step ในลิสต์ (1-based ให้ owner) เช่น "1. ฟาร์ม กลางทุ่ง (สไลม์) · ล่า 50" หรือ "2. แวะเมือง" */
export function botWorkflowStepLabel(step: BotWorkflowStep, index: number): string {
  const n = index + 1;
  if (step.kind === "farm") {
    return `${n}. ฟาร์ม ${botPocketLabel(step.pocketId)} · ${formatWorkflowGoal(step.goal)}`;
  }
  if (step.kind === "town_service") return `${n}. แวะเมือง (ขาย/ฝาก/ซื้อคืน)`;
  return `${n}. เงื่อนไข (${BOT_WORKFLOW_METRIC_LABELS[step.when.type]} ≥ ${step.when.target})`;
}

/** mirror ของ server validateWorkflow ด้วย allow-list ฝั่ง client — true = ผ่าน (server เป็น truth สุดท้ายเสมอ) */
export function isValidBotWorkflowClient(workflow: BotWorkflowV1): boolean {
  return validateWorkflow(workflow, {
    maxSteps: BOT_WORKFLOW_MAX_STEPS_CLIENT,
    isAllowedPocket: (mapId, pocketId) => isBotAllowedPocketClient(mapId, pocketId),
  }).ok;
}

/** true = แผนนี้ตั้งงานหลายขั้นไว้ (มี step อย่างน้อย 1) */
export function hasWorkflow(rules: BotRulesWire): boolean {
  return !!rules.workflow && rules.workflow.steps.length > 0;
}

/** สร้าง step id ใหม่ที่ไม่ชนของเดิม (deterministic: step-1, step-2, …) */
export function nextWorkflowStepId(workflow: BotWorkflowV1 | undefined): string {
  const existing = new Set((workflow?.steps ?? []).map((s) => s.id));
  let n = (workflow?.steps.length ?? 0) + 1;
  while (existing.has(`step-${n}`)) n += 1;
  return `step-${n}`;
}

/** farm step ใหม่ (goal ค่าเริ่มต้น: ล่า 50) — pocket ต้องมาจาก allow-list ของ map */
export function newWorkflowFarmStep(id: string, mapId: string, pocketId: string): BotWorkflowFarmStep {
  return { id, kind: "farm", mapId, pocketId, goal: { type: "kills", target: 50 }, fallbacks: [] };
}

/** town_service step ใหม่ (ปุ่มเดียว ไม่มีพารามิเตอร์) */
export function newWorkflowTownStep(id: string): BotWorkflowTownStep {
  return { id, kind: "town_service" };
}

/** เพิ่ม step ต่อท้าย (คืน workflow ใหม่ — immutable) */
export function addWorkflowStep(workflow: BotWorkflowV1 | undefined, step: BotWorkflowStep): BotWorkflowV1 {
  const steps = [...(workflow?.steps ?? []), step];
  return { version: BOT_WORKFLOW_VERSION, steps };
}

/** ลบ step ตาม index; คืน undefined เมื่อไม่เหลือ step (ไม่มี workflow แล้ว → กลับเป็นโหมด pocket เดียว) */
export function removeWorkflowStep(workflow: BotWorkflowV1, index: number): BotWorkflowV1 | undefined {
  const steps = workflow.steps.filter((_, i) => i !== index);
  return steps.length === 0 ? undefined : { version: BOT_WORKFLOW_VERSION, steps };
}

/** อัปเดต goal ของ farm step ตาม index (ชนิด + ตัวเลข); durationMs รับเป็น "นาที" แล้วแปลงเป็น ms */
export function setWorkflowFarmGoal(
  workflow: BotWorkflowV1,
  index: number,
  type: BotWorkflowMetric,
  rawTarget: number,
): BotWorkflowV1 {
  const target = type === "durationMs" ? Math.max(1, Math.round(rawTarget)) * 60000 : Math.max(1, Math.round(rawTarget));
  const steps = workflow.steps.map((s, i) => (i === index && s.kind === "farm" ? { ...s, goal: { type, target } } : s));
  return { version: BOT_WORKFLOW_VERSION, steps };
}

// ── PR7 §4: live workflow progress (แท็บสถานะ) — "ขั้น x/y · ชนิดขั้น · เป้า goalDone/goalTarget" ────────────

export const BOT_WORKFLOW_STEP_KIND_LABELS: Readonly<Record<BotWorkflowStepKind, string>> = {
  farm: "ฟาร์ม",
  town_service: "แวะเมือง",
  branch: "เงื่อนไข",
};

/** ป้าย progress ของ cursor ปัจจุบัน (bot:status.workflow) — เป้าโชว์เฉพาะ step ฟาร์ม (town/branch ไม่มีเป้า) */
export function formatWorkflowStepProgress(cursor: BotWorkflowStatusCursor): string {
  const head = `ขั้น ${cursor.stepIndex + 1}/${cursor.stepCount} · ${BOT_WORKFLOW_STEP_KIND_LABELS[cursor.stepKind] ?? cursor.stepKind}`;
  if (cursor.stepKind !== "farm") return head;
  return `${head} · เป้า ${formatWorkflowProgress(cursor.goalDone, cursor.goalTarget)}`;
}

// ── PR7 §4: branch step editor helpers (เลือกเงื่อนไข + then/else จาก step ที่มีอยู่แล้ว) ─────────────────

/** branch step ใหม่ — then/else ต้องเป็น id ของ step ที่มีอยู่แล้วเสมอ (ผู้เรียกส่ง target มาให้) */
export function newWorkflowBranchStep(
  id: string,
  when: BotWorkflowCondition,
  thenStepId: string,
  elseStepId: string,
): BotWorkflowBranchStep {
  return { id, kind: "branch", when, thenStepId, elseStepId };
}

/** ตัวเลือกปลายทาง then/else ของ branch หนึ่งอัน — ทุก step อื่นในสาย (ไม่รวมตัวเอง กันชี้วนตัวเองเปล่าประโยชน์) */
export function workflowBranchTargetOptions(
  workflow: BotWorkflowV1,
  excludeIndex: number,
): readonly { id: string; label: string }[] {
  return workflow.steps
    .map((step, index) => ({ step, index }))
    .filter(({ index }) => index !== excludeIndex)
    .map(({ step, index }) => ({ id: step.id, label: botWorkflowStepLabel(step, index) }));
}

/** อัปเดตเงื่อนไข (metric+target) ของ branch step ตาม index; durationMs รับเป็น "นาที" เหมือน setWorkflowFarmGoal */
export function setWorkflowBranchWhen(
  workflow: BotWorkflowV1,
  index: number,
  type: BotWorkflowMetric,
  rawTarget: number,
): BotWorkflowV1 {
  const target = type === "durationMs" ? Math.max(1, Math.round(rawTarget)) * 60000 : Math.max(1, Math.round(rawTarget));
  const steps = workflow.steps.map((s, i) => (i === index && s.kind === "branch" ? { ...s, when: { type, target } } : s));
  return { version: BOT_WORKFLOW_VERSION, steps };
}

/** อัปเดตปลายทาง then/else ของ branch step ตาม index */
export function setWorkflowBranchTarget(
  workflow: BotWorkflowV1,
  index: number,
  branch: "then" | "else",
  stepId: string,
): BotWorkflowV1 {
  const steps = workflow.steps.map((s, i) => {
    if (i !== index || s.kind !== "branch") return s;
    return branch === "then" ? { ...s, thenStepId: stepId } : { ...s, elseStepId: stepId };
  });
  return { version: BOT_WORKFLOW_VERSION, steps };
}

// ── PR7 §5: setup wizard (สร้างแผนใหม่) — stepper ง่าย ๆ ในหน้าเดิม ไม่เปิดหน้าต่างใหม่ ────────────────────
// ลำดับล็อค: map → pocket (เฉพาะ allowed) → preset พื้นฐาน → กฎ → นโยบายหยุด (global safety + recovery ตาม tier).

export type BotWizardStep = "map" | "pocket" | "preset" | "rules" | "stop_policy";

export const BOT_WIZARD_STEPS: readonly BotWizardStep[] = ["map", "pocket", "preset", "rules", "stop_policy"];

export const BOT_WIZARD_STEP_LABELS: Readonly<Record<BotWizardStep, string>> = {
  map: "เลือกแผนที่",
  pocket: "เลือกจุดฟาร์ม",
  preset: "ชุดเริ่มต้น",
  rules: "ปรับกฎ",
  stop_policy: "นโยบายหยุด",
};

export function nextBotWizardStep(step: BotWizardStep): BotWizardStep | null {
  const i = BOT_WIZARD_STEPS.indexOf(step);
  return i >= 0 && i < BOT_WIZARD_STEPS.length - 1 ? BOT_WIZARD_STEPS[i + 1] : null;
}

export function prevBotWizardStep(step: BotWizardStep): BotWizardStep | null {
  const i = BOT_WIZARD_STEPS.indexOf(step);
  return i > 0 ? BOT_WIZARD_STEPS[i - 1] : null;
}

export interface BotWizardFormSnapshot {
  name: string;
  mapId: string;
  pocketId: string;
  rules: BotRulesWire;
}

/** ก้าวถัดไปกดได้ไหม ณ ขั้นนี้ (mirror validation เดียวกับตอน submit สุดท้าย — server เป็น truth จริงเสมอ) */
export function isBotWizardStepValid(
  step: BotWizardStep,
  form: BotWizardFormSnapshot,
  rulesCap: number | null,
): boolean {
  switch (step) {
    case "map":
      return botPocketOptions(form.mapId).length > 0;
    case "pocket":
      return isBotAllowedPocketClient(form.mapId, form.pocketId);
    case "preset":
      return true;
    case "rules":
      return (
        hasAtLeastOneSkillSlot(form.rules) &&
        (rulesCap === null || countBotRules(form.rules) <= rulesCap) &&
        (!form.rules.workflow || isValidBotWorkflowClient(form.rules.workflow))
      );
    case "stop_policy":
      return isValidBotProfileName(form.name);
    default:
      return false;
  }
}

// ── PR7 §5: rule presets ("preset พื้นฐาน") — ปรับกฎเริ่มต้นให้เร็ว ผู้เล่นแก้ต่อได้เสมอหลังเลือก ────────────
export interface BotRulePreset {
  id: string;
  label: string;
  apply: (rules: BotRulesWire) => BotRulesWire;
}

export const BOT_RULE_PRESETS: readonly BotRulePreset[] = [
  {
    id: "balanced",
    label: "สมดุล — ใช้สกิลหลัก + เก็บของทั้งหมด",
    apply: (rules) => ({ ...rules, skillSlots: [0], lootAll: true }),
  },
  {
    id: "all_skills",
    label: "ดุเดือด — ใช้ทุกสกิล + เก็บของทั้งหมด",
    apply: (rules) => ({ ...rules, skillSlots: [...BOT_RULE_SKILL_SLOTS], lootAll: true }),
  },
];

export function applyBotRulePreset(rules: BotRulesWire, presetId: string): BotRulesWire {
  const preset = BOT_RULE_PRESETS.find((p) => p.id === presetId);
  return preset ? preset.apply(rules) : rules;
}

// ── PR7 §5: นโยบายหยุด (wizard ขั้นสุดท้าย, informational เท่านั้น) — global safety stops ทุก tier เหมือนกัน
// + recovery ตาม tier (mirror เชิงคุณภาพของ server/config/bot.ts recovery/townTrip blocks, ไม่ใช่ตัวเลข balance) ──

/** เหตุผลหยุดที่เป็น "global safety" เหมือนกันทุก tier (mirror รายการใน botStopReasonLabel ด้านบน) */
export const BOT_GLOBAL_SAFETY_STOP_REASONS: readonly string[] = [
  "inventory_full",
  "low_hp",
  "death",
  "map_unsafe",
  "stuck",
  "rare_found",
  "boss_or_event",
  "secret_trigger",
  "captcha",
];

export function botTierRecoveryLabel(tier: BotTierWire): string {
  switch (tier) {
    case "free":
      return "Free: หยุดปลอดภัยเมื่อเจอปัญหาแล้วรอคุณกลับมากดทำต่อเอง";
    case "plus":
      return "Plus: ตายแล้วพยายามใช้โพชั่นฟื้นตัวเองและกลับไปฟาร์มต่อให้ก่อน ถ้าทำไม่ได้จึงหยุดรอคุณ";
    case "pro":
      return "Pro: เหมือน Plus และยังทำแผนต่อได้แม้เซิร์ฟเวอร์รีสตาร์ท";
  }
}

// ── PR7 §7: micro-tutorial ครั้งแรกที่เปิด panel — persist localStorage (pattern เดียวกับ
// help/tutorial-checklist-storage.ts: KeyValueStorage injectable, try/catch ทุก op, memory fallback ตอนไม่มี window) ──

export const BOT_TUTORIAL_STORAGE_KEY = "dungdung.bot.tutorial.v1";

export interface BotTutorialSlide {
  title: string;
  body: string;
}

/** 5 ข้อความ (ในช่วง 5-7 ที่ spec กำหนด) — จุดสำคัญ: ตัวจริงตัวเดียว/รับช่วงต่อทันที/หยุดปลอดภัย/ผลไม่หาย */
export const BOT_TUTORIAL_SLIDES: readonly BotTutorialSlide[] = [
  { title: "ตัวจริงตัวเดียว", body: "แผนควบคุมตัวละครจริงของคุณเท่านั้น ไม่ใช่ตัวช่วยแยกหรือหลายตัวพร้อมกัน" },
  { title: "รับช่วงต่อได้ทันทีเสมอ", body: "กด “รับช่วงต่อ” เมื่อไหร่ก็ได้ คุมตัวละครกลับมาทันที ไม่มีขั้นตอนยืนยัน" },
  { title: "หยุดปลอดภัยเมื่อเจอปัญหา", body: "เจอบอส เอลิต ของแรร์ HP ต่ำ หรือทางตัน ระบบหยุดให้เองเพื่อรอคุณ" },
  { title: "ผลที่ฟาร์มมาไม่หาย", body: "ของ ทอง และ EXP ที่ได้ระหว่างทางถูกเก็บไว้เสมอ ไม่ว่าจะหยุดด้วยเหตุผลไหน" },
  { title: "แผนที่บันทึกไว้หลายแผน", body: "ตั้งแผนล่วงหน้าได้หลายแผน แล้วเลือกว่าจะให้ตัวละครจริงทำแผนไหนตอนนี้" },
];

export interface BotTutorialState {
  dismissed: boolean;
}

export const INITIAL_BOT_TUTORIAL_STATE: BotTutorialState = { dismissed: false };

export function parseStoredBotTutorialState(raw: unknown): BotTutorialState {
  if (typeof raw !== "object" || raw === null) return { ...INITIAL_BOT_TUTORIAL_STATE };
  return { dismissed: (raw as Record<string, unknown>).dismissed === true };
}

export interface BotTutorialStore {
  load(): BotTutorialState;
  save(state: BotTutorialState): void;
}

export function createStorageBotTutorialStore(
  storage: KeyValueStorage,
  key: string = BOT_TUTORIAL_STORAGE_KEY,
): BotTutorialStore {
  return {
    load(): BotTutorialState {
      try {
        const raw = storage.getItem(key);
        if (raw === null) return { ...INITIAL_BOT_TUTORIAL_STATE };
        return parseStoredBotTutorialState(JSON.parse(raw));
      } catch {
        return { ...INITIAL_BOT_TUTORIAL_STATE };
      }
    },
    save(state: BotTutorialState): void {
      try {
        storage.setItem(key, JSON.stringify(state));
      } catch {
        /* quota / private mode — tutorial dismiss เป็น best-effort, ปล่อยผ่าน */
      }
    },
  };
}

export function createMemoryBotTutorialStore(): BotTutorialStore {
  let current: BotTutorialState = { ...INITIAL_BOT_TUTORIAL_STATE };
  return {
    load: () => current,
    save: (state) => {
      current = state;
    },
  };
}

export function createBotTutorialStore(): BotTutorialStore {
  if (typeof window !== "undefined" && window.localStorage) {
    return createStorageBotTutorialStore(window.localStorage);
  }
  return createMemoryBotTutorialStore();
}

export function dismissBotTutorial(prev: BotTutorialState): BotTutorialState {
  return { ...prev, dismissed: true };
}
