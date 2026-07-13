// Storage panel (P2-17 "คลัง" + "กล่องส่งของ") — pure logic only (no React/DOM), เทสต์ตรงด้วย Vitest
// โดยไม่ต้องพึ่ง RTL/jsdom (pattern เดียวกับ shop-view.ts/inventory-view.ts, ดู docs/agent-rules.md).
// Component จริงอยู่ StoragePanel.tsx/StorageHudButton.tsx — เรียกฟังก์ชันที่นี่เท่านั้น ไม่มี logic ซ้ำใน component.
//
// Storage = account-shared 200 ช่อง (Storage §10.1, server-authoritative — ราคา/capacity/fillState มาจาก
// MSG_STORAGE_STATE เท่านั้น, client ไม่มี config เอง). Delivery Box = ที่พักของก่อนรับเข้ากระเป๋า (§16).

import type {
  DeliveryEntryStatus,
  DeliveryEntryView,
  DeliveryResultMessage,
  DeliveryStateMessage,
  StorageFillState,
  StorageItemView,
  StorageOp,
  StorageResultMessage,
  StorageStateMessage,
} from "@/shared/net-protocol";
import type { PanelId } from "@/ui/panels";

/** panel id คงที่ของ storage (P2-17) — ใช้ทั้ง openPanel/closePanel และ <Panel id> */
export const STORAGE_PANEL_ID: PanelId = "storage";

export type StorageTab = "storage" | "delivery";

/** คลังเปิดให้เห็นปุ่ม HUD ไหม — ต้องมี state มาแล้ว (ตอบ MSG_STORAGE_OPEN) และ available=true เท่านั้น (pattern เดียวกับ isShopAvailable) */
export function isStorageAvailable(state: StorageStateMessage | null): boolean {
  return state !== null && state.available;
}

/** หา item จาก instanceId ในคลัง — ใช้ sync selection กับ snapshot ใหม่หลัง mutation (pattern เดียวกับ findItemByInstanceId) */
export function findStorageItemByInstanceId(
  state: StorageStateMessage,
  instanceId: string,
): StorageItemView | null {
  return state.items.find((item) => item.instanceId === instanceId) ?? null;
}

/** หา delivery entry จาก entryId — ใช้ sync selection กับ snapshot ใหม่หลัง claim */
export function findDeliveryEntryById(
  state: DeliveryStateMessage,
  entryId: string,
): DeliveryEntryView | null {
  return state.entries.find((entry) => entry.entryId === entryId) ?? null;
}

/** สีของแถบ capacity ตาม fillState (§15.1: normal <80% เขียว/เทา · warn ≥80% เหลือง · alert ≥90% ส้ม · full แดง) */
export function fillStateColorClass(fillState: StorageFillState): string {
  switch (fillState) {
    case "warn":
      return "bg-amber-500";
    case "alert":
      return "bg-orange-600";
    case "full":
      return "bg-red-600";
    case "normal":
    default:
      return "bg-emerald-600";
  }
}

/** เปอร์เซ็นต์เติมแถบ capacity (0-100) — capacity 0 (ยังไม่รู้/edge case) → 0 กัน div by zero */
export function fillPercent(used: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / capacity) * 100)));
}

/**
 * ข้อความ Thai สั้น ๆ เมื่อ MSG_STORAGE_RESULT ปฏิเสธ (Storage §13.2/§14). reason แปลกที่ไม่รู้จัก
 * (protocol เปลี่ยนในอนาคต) → ข้อความ fallback ทั่วไป (pattern เดียวกับ shopRejectionReasonLabel).
 */
export function storageRejectionReasonLabel(reason: string): string {
  switch (reason) {
    case "STORAGE_UNAVAILABLE":
      return "คลังไม่พร้อมใช้งานที่นี่";
    case "NO_ITEM":
      return "ไม่พบไอเทมนี้";
    case "ITEM_BOUND":
      return "ไอเทมนี้ผูกติดตัวละคร ฝากคลังไม่ได้";
    case "ITEM_EQUIPPED":
      return "ต้องถอดออกก่อนถึงจะฝากได้";
    case "STORAGE_FULL":
      return "คลังเต็ม";
    case "INVENTORY_FULL":
      return "กระเป๋าเต็ม";
    case "ITEM_CHANGED":
      return "ข้อมูลไม่ตรงกัน กำลังซิงก์ใหม่";
    case "TRANSACTION_CONFLICT":
      return "ข้อมูลไม่ตรงกัน กำลังซิงก์ใหม่";
    default:
      return "ทำรายการไม่สำเร็จ";
  }
}

/** ข้อความ Thai สั้น ๆ เมื่อ MSG_DELIVERY_RESULT ปฏิเสธ (Storage §16.4/§16.5) */
export function deliveryRejectionReasonLabel(reason: string): string {
  switch (reason) {
    case "STORAGE_UNAVAILABLE":
      return "กล่องส่งของไม่พร้อมใช้งานที่นี่";
    case "NOT_FOUND":
      return "ไม่พบรายการนี้";
    case "EXPIRED":
      return "รายการนี้หมดอายุแล้ว";
    case "INVENTORY_FULL":
      return "กระเป๋าเต็ม";
    case "TRANSACTION_CONFLICT":
      return "ข้อมูลไม่ตรงกัน กำลังซิงก์ใหม่";
    default:
      return "ทำรายการไม่สำเร็จ";
  }
}

/** label ของ DeliveryEntryStatus (§16.4: เตือน 7 วัน = เหลือง, 1 วัน = แดง, หมดแล้ว = จาง) */
export function deliveryStatusLabel(status: DeliveryEntryStatus): string {
  switch (status) {
    case "expiring_soon":
      return "ใกล้หมดอายุ (เหลือ ~7 วัน)";
    case "expiring_urgent":
      return "ใกล้หมดอายุมาก (เหลือ ~1 วัน)";
    case "expired":
      return "หมดอายุแล้ว";
    case "none":
    default:
      return "";
  }
}

/** สีของป้ายเวลาหมดอายุตาม status (§16.4) */
export function deliveryStatusColorClass(status: DeliveryEntryStatus): string {
  switch (status) {
    case "expiring_soon":
      return "text-amber-300";
    case "expiring_urgent":
      return "text-red-400";
    case "expired":
      return "text-neutral-500";
    case "none":
    default:
      return "text-neutral-400";
  }
}

/** entry หมดอายุแล้ว → ปุ่มรับของจางลง กดไม่ได้ (§16.4 "expired = จางไม่ให้ claim") */
export function canClaimDeliveryEntry(entry: DeliveryEntryView): boolean {
  return entry.status !== "expired" && entry.claimStatus !== "claimed";
}

/** DeliverySource enum label (prisma schema.prisma) — client แสดงชื่อไทยแทน enum ดิบ */
export function deliverySourceLabel(source: string): string {
  switch (source) {
    case "compensation":
      return "ชดเชย";
    case "gm_gift":
      return "ของขวัญจาก GM";
    case "event_reward":
      return "รางวัลกิจกรรม";
    case "achievement_reward":
      return "รางวัลความสำเร็จ";
    case "market_purchase":
      return "ซื้อจากตลาด";
    case "paid_item":
      return "ไอเทมชำระเงิน";
    case "campaign_gift":
      return "ของขวัญแคมเปญ";
    case "migrated_recovery":
      return "กู้คืนข้อมูล";
    default:
      return source;
  }
}

/**
 * เฟสของ 1 transaction ฝาก/ถอน (local ใน component ไม่ใช่ world state) — เก็บ op+instanceId ไว้กันผลลัพธ์ของ
 * item อื่นมาทับ (pattern เดียวกับ ShopTxPhase, shop-view.ts).
 */
export type StorageTxPhase =
  | { kind: "idle" }
  | { kind: "processing"; op: StorageOp; instanceId: string }
  | { kind: "settled"; result: StorageResultMessage }
  | { kind: "timed_out"; op: StorageOp; instanceId: string };

export type StorageTxState = "IDLE" | "PROCESSING" | "SUCCESS" | "REJECTED" | "UNKNOWN_RECONCILING";

export function resolveStorageTxState(phase: StorageTxPhase): StorageTxState {
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

/** ปุ่มฝาก/ถอนกดได้เมื่อไม่มี transaction ค้างอยู่ (pattern เดียวกับ canConfirmShopTx) */
export function canConfirmStorageTx(state: StorageTxState): boolean {
  return state !== "PROCESSING" && state !== "UNKNOWN_RECONCILING";
}

/** ข้อความหลักของแต่ละ storage tx state */
export function storageTxMessage(state: StorageTxState, result: StorageResultMessage | null): string {
  switch (state) {
    case "IDLE":
      return "";
    case "PROCESSING":
      return "กำลังทำรายการ…";
    case "SUCCESS":
      return result?.op === "withdraw" ? "ถอนสำเร็จ" : "ฝากสำเร็จ";
    case "REJECTED":
      return result?.reason ? storageRejectionReasonLabel(result.reason) : "ทำรายการไม่สำเร็จ";
    case "UNKNOWN_RECONCILING":
      return "ไม่ได้รับผลลัพธ์ กำลังซิงก์ข้อมูลล่าสุด กรุณารอสักครู่";
    default:
      return "";
  }
}

/**
 * เฟสของ 1 transaction รับของ (local ใน component) — เก็บ entryId ไว้กันผลลัพธ์ของรายการอื่นมาทับ
 * (pattern เดียวกับ StorageTxPhase).
 */
export type DeliveryTxPhase =
  | { kind: "idle" }
  | { kind: "processing"; entryId: string }
  | { kind: "settled"; result: DeliveryResultMessage }
  | { kind: "timed_out"; entryId: string };

export type DeliveryTxState = "IDLE" | "PROCESSING" | "SUCCESS" | "REJECTED" | "UNKNOWN_RECONCILING";

export function resolveDeliveryTxState(phase: DeliveryTxPhase): DeliveryTxState {
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

export function canConfirmDeliveryTx(state: DeliveryTxState): boolean {
  return state !== "PROCESSING" && state !== "UNKNOWN_RECONCILING";
}

export function deliveryTxMessage(state: DeliveryTxState, result: DeliveryResultMessage | null): string {
  switch (state) {
    case "IDLE":
      return "";
    case "PROCESSING":
      return "กำลังรับของ…";
    case "SUCCESS":
      return "รับของสำเร็จ";
    case "REJECTED":
      return result?.reason ? deliveryRejectionReasonLabel(result.reason) : "ทำรายการไม่สำเร็จ";
    case "UNKNOWN_RECONCILING":
      return "ไม่ได้รับผลลัพธ์ กำลังซิงก์ข้อมูลล่าสุด กรุณารอสักครู่";
    default:
      return "";
  }
}
