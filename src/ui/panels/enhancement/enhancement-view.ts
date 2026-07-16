// Enhancement panel (P2-10 "เสริมแกร่ง") — pure logic only (no React/DOM), เทสต์ตรงด้วย Vitest โดยไม่ต้อง
// พึ่ง RTL/jsdom (pattern เดียวกับ inventory-view.ts/panel-stack.ts, ดู docs/agent-rules.md). Component จริง
// อยู่ EnhancementPanel.tsx — เรียกฟังก์ชันที่นี่เท่านั้น ไม่มี logic ซ้ำใน component.
//
// P2 ทั้งเฟส server ตอบ NO_REINFORCEMENT เสมอ (flag `noReinforcement` เปิดอยู่, R8/D-052) — **inert แต่
// functional จริง** ไม่ใช่ bug. panel นี้ต้องโชว์ state นี้สวย ๆ พร้อม hint copy ที่เคาะแล้ว (verbatim, ห้ามเปลี่ยนคำ).

import type {
  EnhanceResultMessage,
  FragmentExchangeResultMessage,
  InventoryItemView,
  InventorySnapshot,
  ReinforcementProgress,
} from "@/shared/net-protocol";
import type { PanelId } from "@/ui/panels";

/** panel id คงที่ของ enhancement (P2-10) — ใช้ทั้ง openPanel/closePanel และ <Panel id> */
export const ENHANCEMENT_PANEL_ID: PanelId = "enhancement";

/** materialId ของ "เสริมแกร่ง" ตาม rename R10 (Reinforcement §3.1) — canonical id, ตรง server DEFAULT config */
export const REINFORCEMENT_MATERIAL_ID = "upg_reinforcement";

/** materialId ของ "เศษเสริมแกร่ง" (B4, Reinforcement §3.5) — canonical id, ตรง server DEFAULT config */
export const FRAGMENT_MATERIAL_ID = "upg_reinforcement_fragment";

/**
 * §3.5 สูตรแลก 5 เศษ → 1 เสริมแกร่ง — client ใช้แค่ enable ปุ่ม + label; server เป็น authoritative (reject ถ้า < 5).
 * ค่าจริงเป็น Design Knob server-only (FRAGMENT_EXCHANGE_RULES) — ตัวเลขนี้ display เท่านั้น (spec-fixed 5→1).
 */
export const FRAGMENT_EXCHANGE_INPUT = 5;
export const FRAGMENT_EXCHANGE_OUTPUT = 1;

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

/** B4: นับจำนวน "เศษเสริมแกร่ง" ในกระเป๋า (รวมทุก stack) — reuse countReinforcementMaterial ด้วย fragment id. */
export function countFragmentMaterial(snapshot: InventorySnapshot | null): number {
  return countReinforcementMaterial(snapshot, FRAGMENT_MATERIAL_ID);
}

/**
 * B4: หา stack เศษเสริมแกร่งในกระเป๋า (bag) ที่จะใช้จ่ายตอนแลก — client ส่ง instanceId + version ของ stack นี้ใน
 * intent (server ใช้ optimistic lock + retry guard). null = ไม่มีเศษในกระเป๋า. เลือก stack ที่ quantity มากสุด
 * (ปกติมี stack เดียวเพราะ stackable, กันเผื่อ split).
 */
export function findFragmentStack(snapshot: InventorySnapshot | null): InventoryItemView | null {
  if (!snapshot) return null;
  const stacks = snapshot.bag.filter((item) => item.itemId === FRAGMENT_MATERIAL_ID);
  if (stacks.length === 0) return null;
  return stacks.reduce((best, cur) => (cur.quantity > best.quantity ? cur : best));
}

/** B4: ปุ่ม "แลก 5→1" กดได้เมื่อมีเศษ ≥ input (5) — server ยังคง authoritative (reject ถ้าไม่พอ/กระเป๋าเต็ม). */
export function canExchangeFragments(fragmentCount: number): boolean {
  return fragmentCount >= FRAGMENT_EXCHANGE_INPUT;
}

/** B4 (§4.2): label แถบประกันบอส "ประกันบอส: X/Y" — null progress = ยังไม่เคยฆ่า Field Boss (ซ่อนแถบ). */
export function reinforcementPityLabel(progress: ReinforcementProgress | null): string | null {
  if (!progress) return null;
  return `ประกันบอส: ${progress.pityCount}/${progress.guaranteedAtClear}`;
}

/** B4: ข้อความผลการแลกเศษ (สำเร็จ/ปฏิเสธ) — copy รวมศูนย์ (testable, ห้ามเขียน string ซ้ำใน component). */
export function fragmentExchangeMessage(result: FragmentExchangeResultMessage): string {
  if (result.ok) return `แลกสำเร็จ ได้เสริมแกร่ง ×${result.granted}`;
  switch (result.reason) {
    case "NOT_ENOUGH_FRAGMENTS":
      return "เศษเสริมแกร่งไม่พอ (ต้องมีอย่างน้อย 5)";
    case "INVENTORY_FULL":
      return "กระเป๋าเต็ม เว้นช่องก่อนแลก";
    case "NO_DB":
      return "โหมดนี้แลกไม่ได้";
    case "TRANSACTION_CONFLICT":
    default:
      return "ข้อมูลไม่ตรงกัน กำลังซิงก์ใหม่";
  }
}
