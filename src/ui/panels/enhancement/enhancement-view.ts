// Enhancement panel (P2-10 "เสริมแกร่ง") — pure logic only (no React/DOM), เทสต์ตรงด้วย Vitest โดยไม่ต้อง
// พึ่ง RTL/jsdom (pattern เดียวกับ inventory-view.ts/panel-stack.ts, ดู docs/agent-rules.md). Component จริง
// อยู่ EnhancementPanel.tsx — เรียกฟังก์ชันที่นี่เท่านั้น ไม่มี logic ซ้ำใน component.
//
// P2 ทั้งเฟส server ตอบ NO_REINFORCEMENT เสมอ (flag `noReinforcement` เปิดอยู่, R8/D-052) — **inert แต่
// functional จริง** ไม่ใช่ bug. panel นี้ต้องโชว์ state นี้สวย ๆ พร้อม hint copy ที่เคาะแล้ว (verbatim, ห้ามเปลี่ยนคำ).

import type { EnhanceResultMessage, InventorySnapshot } from "@/shared/net-protocol";
import type { PanelId } from "@/ui/panels";

/** panel id คงที่ของ enhancement (P2-10) — ใช้ทั้ง openPanel/closePanel และ <Panel id> */
export const ENHANCEMENT_PANEL_ID: PanelId = "enhancement";

/** materialId ของ "เสริมแกร่ง" ตาม rename R10 (Reinforcement §3.1) — canonical id, ตรง server DEFAULT config */
export const REINFORCEMENT_MATERIAL_ID = "upg_reinforcement";

/** 8 state ตาม spec §2.4 (verbatim) — headline ของ panel ผูกกับ state นี้เสมอ */
export type EnhanceUiState =
  | "NO_ITEM"
  | "READY"
  | "PROCESSING"
  | "SUCCESS"
  | "NO_REINFORCEMENT"
  | "MAX_LEVEL"
  | "ITEM_LOCKED"
  | "UNKNOWN_RECONCILING";

/**
 * เฟสของ request 1 ครั้ง (local ใน component, ไม่ใช่ world state) — "idle" ก่อน/หลังกดเสร็จ (reset ตอนเปลี่ยน
 * item เลือก), "processing" หลังกดจนกว่าผลจะมา, "settled" = ผลมาแล้ว (ok หรือ reject reason), "timed_out" =
 * ไม่ได้รับ MSG_ENHANCE_RESULT ภายใน timeout (component ตั้งเอง, ดู EnhancementPanel.tsx).
 */
export type EnhancePhase =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "settled"; result: EnhanceResultMessage }
  | { kind: "timed_out" };

/**
 * state machine หลัก — ตัดสินจาก "มี item เลือกอยู่ไหม" + phase ปัจจุบันของ request (ไม่ผูกกับ maxLevel
 * ฝั่ง client เพราะ enhancement cap เป็น Design Knob server-only (D-048), client ไม่มี config นี้ — MAX_LEVEL
 * รู้ได้จาก server reject reason เท่านั้น ตรงกับที่ enhancement-service.ts ฝั่ง server สร้าง reason ไว้แล้ว).
 */
export function resolveEnhanceUiState(hasTarget: boolean, phase: EnhancePhase): EnhanceUiState {
  if (phase.kind === "processing") return "PROCESSING";
  if (phase.kind === "timed_out") return "UNKNOWN_RECONCILING";
  if (phase.kind === "settled") {
    if (phase.result.ok) return "SUCCESS";
    switch (phase.result.reason) {
      case "NO_REINFORCEMENT":
        return "NO_REINFORCEMENT";
      case "MAX_LEVEL":
        return "MAX_LEVEL";
      case "ITEM_LOCKED":
        return "ITEM_LOCKED";
      case "NO_ITEM":
      default:
        return "NO_ITEM";
    }
  }
  return hasTarget ? "READY" : "NO_ITEM";
}

/** ปุ่ม "ยืนยันเสริมแกร่ง" กดได้เฉพาะตอน READY (มี item เลือก + ไม่ได้กำลังทำรายการ/รอผล/ล็อกอยู่) */
export function canConfirmEnhance(state: EnhanceUiState): boolean {
  return state === "READY";
}

/** ข้อความหลักภาษาไทยของแต่ละ state — copy รวมศูนย์ที่นี่ (testable, ห้ามเขียน string ซ้ำใน component) */
export function enhanceStateMessage(state: EnhanceUiState): string {
  switch (state) {
    case "NO_ITEM":
      return "เลือกอุปกรณ์ในกระเป๋าก่อนเสริมแกร่ง";
    case "READY":
      return "ผลลัพธ์: เพิ่มระดับสำเร็จแน่นอน";
    case "PROCESSING":
      return "กำลังเสริมแกร่ง…";
    case "SUCCESS":
      return "เสริมแกร่งสำเร็จ";
    // R8 (D-052, verbatim) — ห้ามเปลี่ยนคำ: "ของหายากมากับบอส"
    case "NO_REINFORCEMENT":
      return "ของหายากมากับบอส";
    case "MAX_LEVEL":
      return "อุปกรณ์นี้เสริมแกร่งถึงระดับสูงสุดแล้ว";
    case "ITEM_LOCKED":
      return "ข้อมูลไม่ตรงกัน กำลังซิงก์ใหม่";
    case "UNKNOWN_RECONCILING":
      return "ไม่ได้รับผลลัพธ์ กำลังซิงก์ข้อมูลล่าสุด กรุณารอสักครู่";
    default:
      return "";
  }
}

/** label แถวเปลี่ยนระดับ ("+N → +N+1") — ต่างจาก enhancementLabel (inventory-view.ts) ที่ซ่อน +0 เพราะที่นี่
 * ต้องโชว์ทั้งสองข้างเสมอตาม mock spec §2.4 ("ดาบคมกก +2 → +3") แม้ level เริ่มที่ 0 */
export function enhancementTransitionLabel(level: number): string {
  return `+${level} → +${level + 1}`;
}

/** นับจำนวนวัสดุ "เสริมแกร่ง" (upg_reinforcement) ที่มีในกระเป๋า — รวมทุก stack (ปกติมี 1 stack, กันเผื่อ) */
export function countReinforcementMaterial(
  snapshot: InventorySnapshot | null,
  materialId: string = REINFORCEMENT_MATERIAL_ID,
): number {
  if (!snapshot) return 0;
  return snapshot.bag
    .filter((item) => item.itemId === materialId)
    .reduce((sum, item) => sum + item.quantity, 0);
}
