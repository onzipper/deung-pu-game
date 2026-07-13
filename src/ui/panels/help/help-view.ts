// Help/Guidance panel (P2-12 "DG lite") — pure glue only (no React/DOM), เทสต์ตรงด้วย Vitest (pattern
// เดียวกับ shop-view.ts/enhancement-view.ts, ดู docs/agent-rules.md). Component จริงอยู่ HelpPanel.tsx.

import type { InventorySnapshot } from "@/shared/net-protocol";
import type { PanelId } from "@/ui/panels";
import type { PlayIntent } from "./help-types";
import type { RecommendationRuleInput } from "./guidance-rules";

/** panel id คงที่ของ help/guidance (P2-12) — ใช้ทั้ง openPanel/closePanel และ <Panel id> */
export const HELP_PANEL_ID: PanelId = "help";

/** แท็บหลักของ HelpPanel (DG §13.2 mockup: ทำอะไรต่อดี / เล่นระบบนี้ยังไง / checklist / ตั้งค่า) */
export type HelpTab = "recommend" | "articles" | "checklist" | "settings";

/** ประกอบ input ของ rule engine จาก field ที่ HudState/glue มีจริง — รวม logic "แปลง raw → rule input" ที่นี่ที่เดียว */
export function buildRecommendationInput(params: {
  playerLevel: number | null;
  gold: number | null;
  inventory: InventorySnapshot | null;
  mapId: string | null;
  shopAvailable: boolean;
  sessionIntent: PlayIntent;
  nowMs: number;
}): RecommendationRuleInput {
  return {
    level: params.playerLevel,
    gold: params.gold,
    inventory: params.inventory,
    mapId: params.mapId,
    shopAvailable: params.shopAvailable,
    sessionIntent: params.sessionIntent,
    nowMs: params.nowMs,
  };
}
