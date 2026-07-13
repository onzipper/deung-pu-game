// Shop panel (P2-11 "ร้านค้า") — pure logic only (no React/DOM), เทสต์ตรงด้วย Vitest โดยไม่ต้องพึ่ง
// RTL/jsdom (pattern เดียวกับ inventory-view.ts/enhancement-view.ts, ดู docs/agent-rules.md). Component
// จริงอยู่ ShopPanel.tsx/ShopHudButton.tsx — เรียกฟังก์ชันที่นี่เท่านั้น ไม่มี logic ซ้ำใน component.
//
// Server-authoritative (Economy §8/§8.3, NCONTEXT ที่ brief แนบมา): ราคาซื้อรู้จาก MSG_SHOP_LIST เท่านั้น
// (client ไม่มีราคาเอง/ไม่ bundle config) — ราคาขายไม่รู้ล่วงหน้าเลย โผล่ทีหลังใน MSG_SHOP_RESULT.gold.

import type {
  ShopCatalogEntry,
  ShopListMessage,
  ShopOp,
  ShopResultMessage,
} from "@/shared/net-protocol";
import type { PanelId } from "@/ui/panels";

/** panel id คงที่ของ shop (P2-11) — ใช้ทั้ง openPanel/closePanel และ <Panel id> */
export const SHOP_PANEL_ID: PanelId = "shop";

export type ShopTab = "buy" | "sell";

/** entry ปลดล็อกไหม (§8.2) — "immediate" เท่านั้นที่ซื้อได้ตอนนี้ ค่าอื่น (เช่น shop_tutorial_complete) = ล็อก */
export function isShopEntryUnlocked(entry: ShopCatalogEntry): boolean {
  return entry.unlockCondition === "immediate";
}

/** หา entry จาก itemId ใน catalog ล่าสุด — null ถ้ายังไม่มี list หรือหาไม่เจอ */
export function findCatalogEntry(
  list: ShopListMessage | null,
  itemId: string,
): ShopCatalogEntry | null {
  if (!list) return null;
  return list.entries.find((entry) => entry.itemId === itemId) ?? null;
}

/** ร้านเปิดให้เห็นปุ่ม HUD ไหม — ต้องมี list มาแล้ว (ตอบ MSG_SHOP_LIST_REQUEST) และ available=true เท่านั้น */
export function isShopAvailable(list: ShopListMessage | null): boolean {
  return list !== null && list.available;
}

/** clamp จำนวนซื้อ/ขาย — จำนวนเต็ม, ขั้นต่ำ min เสมอ (ค่าเพี้ยน/NaN/ติดลบ → min), เพดาน max (ไม่ต่ำกว่า min) */
export function clampQuantity(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const floored = Math.floor(value);
  const upper = Math.max(min, max);
  return Math.min(Math.max(floored, min), upper);
}

/**
 * เฟสของ 1 transaction (ซื้อหรือขาย 1 ครั้ง, local ใน component ไม่ใช่ world state) — เก็บ op+itemId ไว้กัน
 * ผลลัพธ์ของ item อื่นมาทับ (ผู้เล่นสลับ selection ระหว่างรอ), pattern เดียวกับ EnhancePhase (enhancement-view.ts).
 */
export type ShopTxPhase =
  | { kind: "idle" }
  | { kind: "processing"; op: ShopOp; itemId: string }
  | { kind: "settled"; result: ShopResultMessage }
  | { kind: "timed_out"; op: ShopOp; itemId: string };

export type ShopTxState = "IDLE" | "PROCESSING" | "SUCCESS" | "REJECTED" | "UNKNOWN_RECONCILING";

export function resolveShopTxState(phase: ShopTxPhase): ShopTxState {
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

/** ปุ่ม "ยืนยันซื้อ/ยืนยันขาย" กดได้เมื่อไม่มี transaction ค้างอยู่ (ไม่ processing/ไม่รอ resync) */
export function canConfirmShopTx(state: ShopTxState): boolean {
  return state !== "PROCESSING" && state !== "UNKNOWN_RECONCILING";
}

/**
 * ข้อความ Thai สั้น ๆ เมื่อ MSG_SHOP_RESULT ปฏิเสธ (Economy §23 shop error code). reason แปลกที่ไม่รู้จัก
 * (protocol เปลี่ยนในอนาคต) → ข้อความ fallback ทั่วไป (pattern เดียวกับ rejectionReasonLabel, inventory-view.ts).
 */
export function shopRejectionReasonLabel(reason: string): string {
  switch (reason) {
    case "SHOP_ITEM_NOT_FOUND":
      return "ไม่พบไอเทมนี้ในร้าน";
    case "SHOP_LOCKED":
      return "ร้านยังไม่เปิดให้บริการรายการนี้";
    case "INSUFFICIENT_GOLD":
      return "เงินไม่พอ";
    case "INVENTORY_FULL":
      return "กระเป๋าเต็ม";
    case "ITEM_UNSELLABLE":
      return "ไอเทมนี้ขายไม่ได้";
    case "ITEM_EQUIPPED":
      return "ต้องถอดออกก่อนถึงจะขายได้";
    case "TRANSACTION_CONFLICT":
      return "ข้อมูลไม่ตรงกัน กำลังซิงก์ใหม่";
    default:
      return "ทำรายการไม่สำเร็จ";
  }
}

/** ข้อความหลักของแต่ละ state — ผูก result เข้าด้วยเพื่อรู้ op (ซื้อ/ขาย) ตอน SUCCESS + reason ตอน REJECTED */
export function shopTxMessage(state: ShopTxState, result: ShopResultMessage | null): string {
  switch (state) {
    case "IDLE":
      return "";
    case "PROCESSING":
      return "กำลังทำรายการ…";
    case "SUCCESS":
      return result?.op === "sell" ? "ขายสำเร็จ" : "ซื้อสำเร็จ";
    case "REJECTED":
      return result?.reason ? shopRejectionReasonLabel(result.reason) : "ทำรายการไม่สำเร็จ";
    case "UNKNOWN_RECONCILING":
      return "ไม่ได้รับผลลัพธ์ กำลังซิงก์ข้อมูลล่าสุด กรุณารอสักครู่";
    default:
      return "";
  }
}

/** แสดงยอด gold — null (ยังไม่รู้ยอดใน session นี้ ก่อน MSG_PLAYER_PROGRESS/MSG_SHOP_RESULT แรก) = "—" */
export function formatGold(gold: number | null): string {
  return gold === null ? "—" : String(gold);
}
