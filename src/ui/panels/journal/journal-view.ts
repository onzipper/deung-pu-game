// Adventurer Journal "สมุดนักผจญภัย" (C3-MVP, ACHIEVEMENT_AND_ADVENTURE_JOURNAL_SPEC_v1 §2/§8) — pure logic
// only (no React/DOM), เทสต์ตรงด้วย Vitest (pattern เดียวกับ storage-view.ts/help-view.ts, docs/agent-rules.md).
// Component จริงอยู่ JournalPanel.tsx/JournalHudButton.tsx — เรียกฟังก์ชันที่นี่เท่านั้น ไม่มี logic ซ้ำใน component.
//
// MVP scope (owner-approved brief): เต็ม 7 แท็บตาม §2 แต่มีข้อมูลจริงแค่แท็บ 2 (Achievement, consume
// MSG_ACHIEVEMENTS_SNAPSHOT ที่ C2b วางไว้แล้ว) + แท็บ 7 (สถิติ, เฉพาะ metric ที่มีอยู่แล้วฝั่ง client) +
// แท็บ 1 (สรุปสั้น ๆ จาก snapshot เดียวกัน + bark ดึ๋งๆ). แท็บ 3/4/5/6 = empty-state placeholder เท่านั้น
// (ยังไม่มี data plumbing ฝั่ง server สำหรับ world/monster/people/collection log — คนละงานจาก C3-MVP).

import type { PanelId } from "@/ui/panels";
import type { AchievementRow } from "@/shared/net-protocol";

/** panel id คงที่ของ journal (C3) — ใช้ทั้ง openPanel/closePanel และ <Panel id> */
export const JOURNAL_PANEL_ID: PanelId = "journal";

/** 7 แท็บหลักตาม spec §2 (ลำดับตรงตาม source doc) */
export type JournalTab =
  | "today"
  | "achievement"
  | "world"
  | "monster"
  | "people"
  | "collection"
  | "stats";

/** ป้ายแท็บภาษาไทย ตรงตามชื่อใน spec §2 คำต่อคำ */
export const JOURNAL_TAB_LABELS: Record<JournalTab, string> = {
  today: "วันนี้ของฉัน",
  achievement: "Achievement",
  world: "โลกที่ค้นพบ",
  monster: "มอนสเตอร์",
  people: "ผู้คนและเรื่องเล่า",
  collection: "ของสะสม",
  stats: "สถิติส่วนตัว",
};

/** ลำดับแท็บ render (ใช้แทนการวน Object.keys เพื่อ lock ลำดับตรงตาม spec §2 เสมอ) */
export const JOURNAL_TAB_ORDER: readonly JournalTab[] = [
  "today",
  "achievement",
  "world",
  "monster",
  "people",
  "collection",
  "stats",
];

// ── Achievement tab (§2.2) — MVP filter ชุดย่อยตาม brief: ทั้งหมด/ทำอยู่/สำเร็จ/ซ่อน (4 จาก 11 ตัวกรองเต็มใน
// spec — ตัวกรองยาก/ยากมาก/ตำนาน/กาว/Server First/Seasonal ยังไม่ทำใน MVP นี้) ────────────────────────────

export type AchievementFilter = "all" | "in_progress" | "completed" | "hidden";

export const JOURNAL_ACHIEVEMENT_FILTER_LABELS: Record<AchievementFilter, string> = {
  all: "ทั้งหมด",
  in_progress: "ทำอยู่",
  completed: "สำเร็จ",
  hidden: "ซ่อน",
};

export const JOURNAL_ACHIEVEMENT_FILTER_ORDER: readonly AchievementFilter[] = [
  "all",
  "in_progress",
  "completed",
  "hidden",
];

/** row ถูก mask อยู่ไหม (hidden + ยังไม่ claim, §8.4 "ไม่ spoil") — server ส่ง nameTh="???" มาแทนที่ visibility
 * field ตรง ๆ (ดู server/economy/achievements.ts buildAchievementsSnapshot) จึงเช็คจาก nameTh ตรงนี้. */
export function isAchievementMasked(row: AchievementRow): boolean {
  return row.nameTh === "???";
}

/** กรอง rows ตามแท็บ filter ที่เลือก (client-side เท่านั้น, MVP) */
export function filterAchievementRows(
  rows: readonly AchievementRow[],
  filter: AchievementFilter,
): AchievementRow[] {
  switch (filter) {
    case "in_progress":
      return rows.filter((row) => row.state === "in_progress");
    case "completed":
      // auto-claim ทำให้ "completed" ปกติไม่ค้าง (§4.2/§7.1 "auto-claim ครั้งเดียว") — รวม claimed ด้วยกันไว้กันพลาด
      return rows.filter((row) => row.state === "completed" || row.state === "claimed");
    case "hidden":
      return rows.filter((row) => isAchievementMasked(row));
    case "all":
    default:
      return [...rows];
  }
}

/** จัดกลุ่ม rows ตาม category คงลำดับที่พบครั้งแรก (pure, ไม่ sort ตัวอักษร — ตามลำดับ shipping set เดิม) */
export function groupAchievementRowsByCategory(
  rows: readonly AchievementRow[],
): { category: string; rows: AchievementRow[] }[] {
  const order: string[] = [];
  const byCategory = new Map<string, AchievementRow[]>();
  for (const row of rows) {
    if (!byCategory.has(row.category)) {
      byCategory.set(row.category, []);
      order.push(row.category);
    }
    byCategory.get(row.category)!.push(row);
  }
  return order.map((category) => ({ category, rows: byCategory.get(category)! }));
}

/** ป้ายไทยของ category (server/config/achievements.ts 9 core + 4 expanded) — category แปลกใหม่ในอนาคต →
 * fallback แสดง id ดิบไปก่อน (ไม่ throw, กันพังตอน spec เพิ่ม category ใหม่). */
const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  progression: "ความก้าวหน้า",
  combat: "การต่อสู้",
  elite_boss: "เอลีท/บอส",
  enhancement: "การเสริมแกร่ง",
  economy: "เศรษฐกิจ",
  loot: "ของดรอป",
  living_world: "โลกมีชีวิต",
  npc_meme: "NPC/มุกกาว",
  death: "ความตาย",
  maps_2_4: "แผนที่ 2-4",
  companion: "คู่หู",
  archer: "นักธนู",
  bot: "บอท",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** ป้ายไทยของ tier (server/config/achievements.ts 6 tier) */
const TIER_LABELS: Readonly<Record<string, string>> = {
  COMMON: "ทั่วไป",
  UNCOMMON: "ไม่ธรรมดา",
  HARD: "ยาก",
  EXTREME: "ยากมาก",
  MYSTERY: "ลึกลับ",
  MEME: "กาว",
};

export function achievementTierLabel(tier: string): string {
  return TIER_LABELS[tier] ?? tier;
}

/** สี tier chip (Design Knob inline table, brief: COMMON เทา/UNCOMMON เขียว/HARD ฟ้า/EXTREME ม่วง/
 * MYSTERY teal/MEME ทอง) — token-driven, ไม่มี token "เทา" แท้จริงในพาเลตอุ่นนี้จึงใช้ --dp-sand (โทนกลาง/
 * muted ที่ใช้เป็นสี "รอง" ทั่วแอปอยู่แล้ว) แทน gray. fallback = สี COMMON (ปลอดภัยสุด ไม่ throw). */
const TIER_COLOR_CLASS: Readonly<Record<string, string>> = {
  COMMON: "text-(--dp-sand)",
  UNCOMMON: "text-(--dp-fresh-leaf)",
  HARD: "text-(--dp-moon-light)",
  EXTREME: "text-(--dp-rift-violet)",
  MYSTERY: "text-(--dp-resonance-teal)",
  MEME: "text-(--dp-legendary-gold)",
};

export function achievementTierColorClass(tier: string): string {
  return TIER_COLOR_CLASS[tier] ?? TIER_COLOR_CLASS.COMMON;
}

/** เปอร์เซ็นต์ progress bar (0-100) — target<=0 (edge case ป้องกัน div by zero) → 0 */
export function achievementProgressPercent(row: AchievementRow): number {
  if (row.target <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((row.currentValue / row.target) * 100)));
}

/** แท็บ 1 "วันนี้ของฉัน" (§2.1 "Achievement ล่าสุด") — snapshot ไม่มี timestamp จริง จึงเอา claimed rows
 * ตามลำดับที่พบใน snapshot ไม่เกิน limit แถว (brief: "ถ้าไม่มี timestamp ก็เอา claimed แถวบนสุด 3 อัน") */
export function topClaimedAchievements(rows: readonly AchievementRow[], limit = 3): AchievementRow[] {
  return rows.filter((row) => row.state === "claimed").slice(0, limit);
}

// ── companion bark (§2.1 "ข้อความสั้นจากดึ๋งๆ") — โทน/รูปแบบภาษาตาม
// deungpu_DUNG_DUNG_COMPANION_GUIDE_SYSTEM_SPEC_v1.md §2.2/§2.3: พูดน้อย ตอบสั้น ขี้สงสัย ขี้เล่น ไม่สั่ง/ไม่
// เร่ง, ประโยคสั้น 1-2 บรรทัด. 3 บรรทัด, เลือกด้วย day-of-week modulo (static rotation, ไม่ผูก server). ──────

export const DUNGDUNG_JOURNAL_BARKS: readonly string[] = [
  "ดึ๋ง... วันนี้ทำอะไรมาบ้างนะ",
  "สมุดนี่มีเรื่องราวเยอะเหมือนกันนะ",
  "จะไปผจญภัยต่อกันไหม",
];

/** เลือก bark ตามวันในสัปดาห์ของ `date` (default = วันนี้จริง; inject ได้เพื่อเทสต์) */
export function pickDailyBark(date: Date = new Date()): string {
  const idx = date.getDay() % DUNGDUNG_JOURNAL_BARKS.length;
  return DUNGDUNG_JOURNAL_BARKS[idx];
}

// ── แท็บ 3/4/5/6 empty-state copy (ยังไม่มี data plumbing — placeholder เท่านั้น) ─────────────────────────

export type JournalEmptyTab = "world" | "monster" | "people" | "collection";

export const JOURNAL_EMPTY_STATE_COPY: Readonly<Record<JournalEmptyTab, string>> = {
  world: "สำรวจแผนที่เพื่อค้นพบสถานที่และวิวใหม่ ๆ ลงสมุด",
  monster: "พบมอนสเตอร์ครั้งแรกเพื่อบันทึกลงสมุด",
  people: "พูดคุยกับผู้คนในโลกเพื่อบันทึกเรื่องราวของพวกเขา",
  collection: "เก็บของหายากไว้ในสมุดของสะสม",
};

// ── แท็บ 7 "สถิติส่วนตัว" (§2.7) — layout ครบ 10 รายการตาม spec, มีข้อมูลจริงแค่ "เวลาเล่น" (client session
// clock) ที่เหลือ "—" + subtitle รอระบบ tracking ในอนาคต (brief: "ห้ามสร้างระบบ tracking ใหม่") ──────────────

export interface JournalStatItem {
  id: string;
  label: string;
}

export const JOURNAL_STAT_ITEMS: readonly JournalStatItem[] = [
  { id: "playtime", label: "เวลาเล่น" },
  { id: "distance", label: "ระยะทาง" },
  { id: "deaths", label: "จำนวนครั้งที่ตาย" },
  { id: "topKilled", label: "ศัตรูที่ฆ่ามากที่สุด" },
  { id: "longestMap", label: "Map ที่อยู่นานที่สุด" },
  { id: "goldFlow", label: "เงินที่หา/ใช้" },
  { id: "potionUsed", label: "Potion ที่ใช้" },
  { id: "maxCrit", label: "Critical สูงสุด" },
  { id: "playPattern", label: "ช่วงเวลาเล่นประจำ" },
  { id: "memeStats", label: "สถิติกาวบางรายการ" },
];

export const JOURNAL_STAT_PLACEHOLDER_SUBTITLE = "เริ่มนับเร็วๆ นี้";

/** นาที:ชั่วโมงแบบไทยสั้น ๆ — ไม่ถึง 1 นาที = ข้อความพิเศษ (กัน "0 นาที" ดูเหมือน bug) */
export function formatPlaytimeMs(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return "ไม่ถึง 1 นาที";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} ชม. ${minutes} นาที` : `${minutes} นาที`;
}

export interface JournalStatValue {
  value: string;
  subtitle?: string;
}

/** ค่าที่แสดงจริงของแต่ละแถวสถิติ — มีแค่ "playtime" ที่คำนวณได้จริงตอนนี้ (client-side session clock),
 * ที่เหลือทุกตัว "—" + subtitle คงที่ (ไม่ใช่ error, แค่ยังไม่มีระบบ tracking). */
export function resolveJournalStatValue(id: string, playtimeMs: number | null): JournalStatValue {
  if (id === "playtime") {
    return { value: playtimeMs !== null ? formatPlaytimeMs(playtimeMs) : "—" };
  }
  return { value: "—", subtitle: JOURNAL_STAT_PLACEHOLDER_SUBTITLE };
}
