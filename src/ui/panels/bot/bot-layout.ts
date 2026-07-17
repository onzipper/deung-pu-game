// Bot Hub workspace layout — pure logic only (no React/DOM), เทสต์ตรงด้วย Vitest เหมือน bot-view.ts.
// ต่างจาก bot-view.ts ตรงไฟล์นี้เก็บเฉพาะเรื่อง "จัดวางหน้าจอ" (grid/section/tab composition + read-only
// data derived จาก store slices อื่นที่ไม่ใช่ bot เอง เช่น inventory) — business rule ของบอทเอง (CTA/tier
// gating/workflow ฯลฯ) ยังอยู่ bot-view.ts ทั้งหมด. Component จริง (BotPanel.tsx และลูก ๆ ใต้ tabs//editor/)
// เรียกฟังก์ชันที่นี่เท่านั้น ไม่มี logic ซ้ำใน component (M4 owner brief 2026-07-17).

import type { BotProfileWire, BotRulesWire, InventorySnapshot } from "@/shared/net-protocol";
// map data = static config (มี mobType ต่อ pocket) — ไม่ใช่ world state, pattern เดียวกับ Minimap.tsx
// (import @/engine/map/registry ตรง ๆ ได้, docs/context/ui.md Minimap precedent) ไม่ผ่าน Zustand bridge
// เพราะไม่ใช่อะไรที่ game loop ต้อง push (ค่าคงที่ตั้งแต่ build).
import { getMap } from "@/engine/map/registry";
import {
  botMapOptions,
  botPocketOptions,
  countBotRules,
  defaultBotRules,
  formatDurationShort,
  hasAtLeastOneSkillSlot,
  hasGoalWorkflowConflict,
  isValidBotProfileName,
  isValidBotWorkflowClient,
  type BotStatsSnapshot,
} from "./bot-view";

// ── Shared editor style constants (M4 §4 Plans editor — token-driven, ห้าม hardcode raw hex, docs/context/ui.md) ──

export const BOT_EDITOR_SECTION_CARD_CLASS =
  "flex flex-col gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2";

export const BOT_EDITOR_SELECT_CLASS =
  "h-10 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-deep-ink) px-3 " +
  "text-(--dp-highlight) dp-focus-ring";

export const BOT_EDITOR_NUMBER_INPUT_CLASS =
  "h-10 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-deep-ink) px-2 " +
  "text-(--dp-highlight) dp-focus-ring";

// ── Profile draft form (M4 — wizard 5 ขั้นเดิมยุบเป็น single-page editor + section, ดู BotPlanEditor.tsx) ────
//
// เดิม (PR7) เป็น stepper 5 ขั้น (BOT_WIZARD_STEPS ใน bot-view.ts — ยังอยู่, มีเทสคุมพฤติกรรมเดิม แต่ UI ใหม่
// ไม่ผูก stepper แล้ว, เก็บไว้เผื่อ milestone อื่นอ้างอิง/cleanup ภายหลัง). ฟอร์มตอนนี้เป็นหน้าเดียวแบ่ง section
// แทน — "ง่าย" ตาม owner brief ด้วยการโชว์ทุก field พร้อมกัน ไม่ต้องกดถัดไป/ย้อนกลับ.

export interface BotProfileFormState {
  mode: "create" | "edit";
  id?: string;
  name: string;
  mapId: string;
  pocketId: string;
  rules: BotRulesWire;
}

/** ฟอร์มเปล่าตอนกด "+ สร้างแผนใหม่" — map/pocket เริ่มจากตัวเลือกแรกที่ bot-safe เสมอ */
export function blankBotProfileForm(): BotProfileFormState {
  const mapId = botMapOptions()[0] ?? "map1";
  const pocketId = botPocketOptions(mapId)[0] ?? "";
  return { mode: "create", name: "", mapId, pocketId, rules: defaultBotRules() };
}

/** ฟอร์มตอนกด "แก้ไข" แผนที่มีอยู่แล้ว — คัด field ที่แก้ได้จาก BotProfileWire */
export function editBotProfileForm(profile: BotProfileWire): BotProfileFormState {
  return { mode: "edit", id: profile.id, name: profile.name, mapId: profile.mapId, pocketId: profile.pocketId, rules: profile.rules };
}

/** mirror server validateRules/countRules (server เป็น truth จริงเสมอ) — ใช้ enable/disable ปุ่มบันทึกฝั่ง client */
export function isBotProfileFormValid(form: BotProfileFormState, rulesCap: number | null): boolean {
  return (
    isValidBotProfileName(form.name) &&
    hasAtLeastOneSkillSlot(form.rules) &&
    (rulesCap === null || countBotRules(form.rules) <= rulesCap) &&
    (!form.rules.workflow || isValidBotWorkflowClient(form.rules.workflow)) &&
    !hasGoalWorkflowConflict(form.rules)
  );
}

// ── Potion count / bag usage (M4 §3 Overview — "ห้ามโชว์เพดานปลอม") ─────────────────────────────────────

/** itemId ของยาเล็ก (con_small_potion) — ตัวเดียวที่ bot ใช้อัตโนมัติตอนนี้ (M1 auto-potion ทุก tier) */
export const BOT_POTION_ITEM_ID = "con_small_potion";

/** จำนวนยาที่มีอยู่จริงในกระเป๋า ณ ตอนนี้ (sum quantity ของ itemId ที่ตรง) — null เมื่อยังไม่มี snapshot */
export function potionCountFromBag(inventory: InventorySnapshot | null, itemId: string = BOT_POTION_ITEM_ID): number | null {
  if (!inventory) return null;
  return inventory.bag.filter((item) => item.itemId === itemId).reduce((sum, item) => sum + item.quantity, 0);
}

/** "used/capacity" ของกระเป๋า (ช่องที่ใช้ไป ไม่ใช่จำนวนไอเทมรวม) — null เมื่อยังไม่มี snapshot */
export function bagUsageLabel(inventory: InventorySnapshot | null): string | null {
  if (!inventory) return null;
  return `${inventory.bag.length}/${inventory.capacity}`;
}

// ── Mob types ต่อ pocket (M4 §4 เลือกชนิดมอน — มอนใน pocket ที่เลือกเท่านั้น) ──────────────────────────
//
// MobPocket (src/engine/map/types.ts) เก็บ mobType เดียวต่อ 1 entry — pocketId ซ้ำกันได้ถ้า map ในอนาคตแบ่ง
// mob หลายชนิดในโซนเดียว (ยังไม่มีจริงตอนนี้ แต่ helper นี้ไม่ assume "1 pocket = 1 ชนิด" เผื่ออนาคต).

/** ชนิดมอนทั้งหมดใน pocket นี้ (dedup, เรียง alphabetical เพื่อ deterministic) — [] เมื่อไม่รู้จัก map/pocket */
export function mobTypesForPocket(mapId: string, pocketId: string): readonly string[] {
  const map = getMap(mapId);
  if (!map) return [];
  const types = new Set<string>();
  for (const pocket of map.mobPockets) {
    if (pocket.pocketId === pocketId) types.add(pocket.mobType);
  }
  return [...types].sort();
}

// ── Plan editor 3-column grid (M4 §4 desktop 3 คอลัมน์ / mobile stack เดียว) ────────────────────────────

export type BotPlanEditorSectionId =
  | "target"
  | "loot"
  | "supply"
  | "completion"
  | "recovery"
  | "afk_preview"
  | "upsell"
  | "workflow";

export type BotPlanEditorColumnKey = "left" | "middle" | "right";

/**
 * ซ้าย: พื้นที่+เป้าหมาย (map/pocket/target mode/เลือกมอน) · กลาง: ของดรอป, เสบียง(ยา), ครบเป้า, recovery info
 * · ขวา: AFK flow preview, สิ่งที่ปลดล็อคเมื่ออัปเกรด, workflow editor (Pro). ลำดับ section ในแต่ละคอลัมน์คือ
 * ลำดับ render จริง (desktop 3 คอลัมน์เคียงกัน, mobile stack ตามลำดับ left→middle→right — ดู botPlanEditorStackOrder).
 */
export const BOT_PLAN_EDITOR_COLUMNS: Readonly<Record<BotPlanEditorColumnKey, readonly BotPlanEditorSectionId[]>> = {
  left: ["target"],
  middle: ["loot", "supply", "completion", "recovery"],
  right: ["afk_preview", "upsell", "workflow"],
};

const BOT_PLAN_EDITOR_COLUMN_ORDER: readonly BotPlanEditorColumnKey[] = ["left", "middle", "right"];

/** ลำดับ section แบบ stack เดียว (mobile) — flatten ของ 3 คอลัมน์ตามลำดับซ้าย→กลาง→ขวา */
export function botPlanEditorStackOrder(): readonly BotPlanEditorSectionId[] {
  return BOT_PLAN_EDITOR_COLUMN_ORDER.flatMap((col) => BOT_PLAN_EDITOR_COLUMNS[col]);
}

// ── Live stats formatting (M4 §3 Overview + §5 Reports — "แสดงเฉพาะเมื่อมีข้อมูลจริง") ──────────────────

export interface BotStatRow {
  key: string;
  label: string;
  value: string;
}

const BOT_STAT_LABELS: Readonly<Record<keyof BotStatsSnapshot, string>> = {
  townTrips: "จำนวนครั้งเข้าเมือง",
  potionsUsed: "ยาที่ใช้",
  deaths: "จำนวนครั้งที่ตาย",
  msFarming: "เวลาฟาร์ม",
  msWalking: "เวลาเดินทาง",
  msInTown: "เวลาที่อยู่ในเมือง",
};

/** แถว stats จาก bot:status.stats — [] เมื่อไม่มีข้อมูล (component ไม่ render section แทนที่จะโชว์ 0 ปลอม) */
export function formatBotStats(stats: BotStatsSnapshot | undefined): readonly BotStatRow[] {
  if (!stats) return [];
  return [
    { key: "townTrips", label: BOT_STAT_LABELS.townTrips, value: String(stats.townTrips) },
    { key: "potionsUsed", label: BOT_STAT_LABELS.potionsUsed, value: String(stats.potionsUsed) },
    { key: "deaths", label: BOT_STAT_LABELS.deaths, value: String(stats.deaths) },
    { key: "msFarming", label: BOT_STAT_LABELS.msFarming, value: formatDurationShort(stats.msFarming) },
    { key: "msWalking", label: BOT_STAT_LABELS.msWalking, value: formatDurationShort(stats.msWalking) },
    { key: "msInTown", label: BOT_STAT_LABELS.msInTown, value: formatDurationShort(stats.msInTown) },
  ];
}
