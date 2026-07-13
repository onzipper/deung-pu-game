// Shared types ของ Guidance "DG lite" (P2-12) — ตาม DG spec (docs/design/deungpu_DUNG_DUNG_COMPANION_GUIDE_SYSTEM_SPEC_v1.md)
// §6 (help article) / §7 (recommendation) / §14 (content registry) ตัดลงมาเท่าที่ P2 ทำได้จริง (ไม่มี
// companion/server rule service — ทุกอย่างรันฝั่ง client, input จาก HudState เท่านั้น, ดู §15.2).
//
// ห้ามแก้ค่า enum ตรงนี้แบบสุ่ม — ผูกกับ copy/UI ที่อ้างอิงอยู่หลายที่ (help-articles.ts, HelpPanel.tsx).

import type { PanelId } from "@/ui/panels";

/** หมวด intent ของคำถาม "เล่นยังไง" (DG §6.1) — ตัดเหลือเฉพาะระบบที่มีจริงใน P2 */
export type HelpCategory =
  | "movement"
  | "combat"
  | "inventory"
  | "equipment"
  | "shop"
  | "enhancement"
  | "death_respawn"
  | "afk_tab";

/** action ปลอดภัยเท่านั้นตามข้อห้าม DG §6.3 — ไม่มีซื้อของ/ใช้เงิน/ตีบวก/ย้ายของ ฯลฯ ในนี้เด็ดขาด */
export type HelpAction =
  | { type: "open_panel"; panelId: PanelId; label: string }
  | { type: "none" };

/** ความยาวสูงสุดของ one-line answer (DG §6.2 ชั้น 1) */
export const HELP_ONE_LINE_MAX_CHARS = 120;
/** จำนวน steps สูงสุดต่อบทความ (DG §6.2 ชั้น 2) */
export const HELP_STEPS_MAX = 4;

/** โครง Help Article ตาม DG §14.1 ตัดลงมา (ไม่มี unlockRequirement/version/status server — client-local ล้วน) */
export interface HelpArticle {
  id: string;
  category: HelpCategory;
  title: string;
  /** ชั้น 1 — ต้อง ≤120 ตัวอักษร (guard: isValidHelpArticle) */
  oneLine: string;
  /** ชั้น 2 — ต้อง ≤4 ข้อ (guard: isValidHelpArticle) */
  steps: string[];
  /** ชั้น 3 — เปิดเมื่อกด "ดูเพิ่ม" เท่านั้น */
  moreDetail: string;
  action: HelpAction;
  /** จอระบบที่ context help "?" ของจอนั้นควรเปิดบทความนี้ (DG §5.4) — ว่าง = ไม่มี context help ผูกอยู่ */
  applicableScreens: PanelId[];
}

/** หมวดคำแนะนำ "ทำอะไรต่อดี" (DG §7.1) — ตัดเหลือเฉพาะที่ประเมินได้จริงจาก HudState ใน P2 */
export type RecommendationCategory = "power" | "economy" | "explore" | "short_session";

/** action type ของ recommendation (DG §7.3) — ตัดเหลือเท่าที่ P2 มี UI จริงให้เปิด */
export type RecommendationActionType = "open_panel" | "show_article" | "none";

/** ผลลัพธ์ 1 ใบ (DG §7.3 ตัดฟิลด์ server-only ออก — priorityScore ใช้จัดอันดับใน client เท่านั้น ไม่ส่งออก UI) */
export interface Recommendation {
  id: string;
  sourceRuleId: string;
  category: RecommendationCategory;
  title: string;
  summary: string;
  reason: string;
  estimatedMinutes?: number;
  actionType: RecommendationActionType;
  actionTarget: PanelId | string | null;
  priorityScore: number;
}

/** Guidance Mode (DG §4.2) — ค่าเริ่มต้น QUIET (§4.1) */
export type GuidanceMode = "OFF" | "QUIET" | "AVAILABLE" | "ACTIVE";

/** Hint Detail Level (DG §4.3) — P2 lite ใช้เฉพาะ LIGHT/DIRECT (RIDDLE/NAVIGATE รอ companion+navigation จริง) */
export type HintDetail = "LIGHT" | "DIRECT";

export interface GuidancePreferences {
  mode: GuidanceMode;
  hintDetail: HintDetail;
}

export const DEFAULT_GUIDANCE_PREFERENCES: GuidancePreferences = {
  mode: "QUIET", // DG §4.1 ค่าเริ่มต้น
  hintDetail: "LIGHT",
};

/** Play Intent แบบ session-only (DG §8, ตัดเหลือหมวดที่ recommendation rules ใน P2 ใช้จริง) — ไม่ persist */
export type PlayIntent = "power" | "economy" | "explore" | null;
