// Inventory panel (P2-07) — pure logic only (no React/DOM) เทสต์ตรงด้วย Vitest โดยไม่ต้องพึ่ง RTL/jsdom
// (pattern เดียวกับ panel-stack.ts/debug-overlay-logic.ts, ดู docs/agent-rules.md). Component จริงอยู่
// InventoryPanel.tsx/InventoryHudButton.tsx — เรียกฟังก์ชันที่นี่เท่านั้น ไม่มี logic ซ้ำใน component.

import type { InventoryItemView, InventorySnapshot, UseItemResultMessage } from "@/shared/net-protocol";
import type { PanelId } from "@/ui/panels";

/** panel id คงที่ของ inventory (P2-07) — ใช้ทั้ง openPanel/closePanel และ <Panel id> */
export const INVENTORY_PANEL_ID: PanelId = "inventory";

/**
 * grid ช่องกระเป๋าตาม capacity — index ตรงกับ `slot` ของแต่ละ item (ช่องว่าง = null).
 * item ที่ slot ไม่อยู่ในช่วง [0, capacity) (ข้อมูลเพี้ยน/ระหว่าง sync) ถูกข้ามเงียบ ๆ — defensive, ไม่ throw.
 */
export function buildBagGrid(snapshot: InventorySnapshot): (InventoryItemView | null)[] {
  const grid: (InventoryItemView | null)[] = new Array(snapshot.capacity).fill(null);
  for (const item of snapshot.bag) {
    if (item.slot >= 0 && item.slot < snapshot.capacity) grid[item.slot] = item;
  }
  return grid;
}

/** label ระดับตีบวก ตาม spec ("+N ถ้า >0") — 0 = ไม่แสดงอะไรเลย (ไม่ใช่ "+0") */
export function enhancementLabel(level: number): string {
  return level > 0 ? `+${level}` : "";
}

/** action ที่ทำได้กับ item ตามตำแหน่ง+ชนิดปัจจุบัน — สวมอยู่ = ถอดได้เท่านั้น, อยู่กระเป๋า = consumable ที่รู้จัก
 * = ใช้ได้ (PR5, MSG_USE_ITEM), ที่เหลือ = สวมใส่ได้ (server เป็นตัวกันจริงถ้า itemId ไม่ใช่ equipment จริง ๆ). */
export type InventoryAction = "equip" | "unequip" | "use";

/**
 * PR5: consumable itemId ที่รู้จักฝั่ง client — duplication จำเป็นเพราะ `InventoryItemView` (net-protocol.ts)
 * ไม่มี field `kind` (server item-catalog.ts เป็น server-authoritative, client ห้าม import ตรง ๆ same rule as
 * icon-catalog.ts). ปัจจุบัน P2 มีแค่ `con_small_potion` เป็น consumable — เพิ่มที่นี่เมื่อมี consumable ใหม่.
 */
const CONSUMABLE_ITEM_IDS: ReadonlySet<string> = new Set(["con_small_potion"]);

export function isConsumableItemId(itemId: string): boolean {
  return CONSUMABLE_ITEM_IDS.has(itemId);
}

export function resolveInventoryAction(item: Pick<InventoryItemView, "location" | "itemId">): InventoryAction {
  if (item.location === "CHARACTER_EQUIPMENT") return "unequip";
  if (isConsumableItemId(item.itemId)) return "use";
  return "equip";
}

/** หา item ปัจจุบันจาก instanceId (ค้นทั้ง bag+equipment) — ใช้ sync selection กับ snapshot ใหม่หลัง mutation */
export function findItemByInstanceId(
  snapshot: InventorySnapshot,
  instanceId: string,
): InventoryItemView | null {
  return (
    snapshot.bag.find((item) => item.instanceId === instanceId) ??
    snapshot.equipment.find((item) => item.instanceId === instanceId) ??
    null
  );
}

/**
 * ข้อความ Thai สั้น ๆ สำหรับ toast เมื่อ mutation ถูกปฏิเสธ (MSG_INVENTORY_OP_REJECTED.reason จาก
 * server, ดู net-protocol.ts). reason แปลกที่ไม่รู้จัก (protocol เปลี่ยนในอนาคต) → ข้อความ fallback ทั่วไป.
 */
export function rejectionReasonLabel(reason: string): string {
  switch (reason) {
    case "unknown_item":
      return "ไม่พบไอเทมนี้";
    case "not_equippable":
      return "ไอเทมนี้สวมใส่ไม่ได้";
    case "not_equipped":
      return "ไอเทมนี้ยังไม่ได้สวมอยู่";
    case "inventory_full":
      return "กระเป๋าเต็ม";
    case "invalid_slot":
      return "ช่องไม่ถูกต้อง";
    case "unique_conflict":
      return "มีไอเทมชนิดนี้อยู่แล้ว";
    case "version_conflict":
      return "ข้อมูลไม่ตรงกัน กำลังซิงก์ใหม่";
    default:
      return "ทำรายการไม่สำเร็จ";
  }
}

/**
 * PR5: ข้อความ Thai สั้น ๆ สำหรับ toast หลังใช้ consumable (MSG_USE_ITEM_RESULT). ok=true → ข้อความสำเร็จ;
 * ok=false → map ตาม reason (UseConsumableReject, net-protocol.ts). `version_conflict` คืน `null` โดยตั้งใจ
 * (เงียบ ๆ — snapshot ใหม่มาทาง MSG_INVENTORY_STATE เองจาก server, mirror ความเงียบของ equip's version_conflict
 * resync flow, ไม่ต้องโชว์ toast ซ้ำ). reason แปลกที่ไม่รู้จัก → fallback ทั่วไป.
 * ตั้งชื่อ `itemUseResultLabel` (ไม่ใช่ `useItemResultLabel`) เพราะ prefix `use` ชนกับ react-hooks naming
 * convention (eslint react-hooks/rules-of-hooks ตีความว่าเป็น hook ทันทีถ้าขึ้นต้นด้วย use — ฟังก์ชันนี้ pure ธรรมดา).
 */
export function itemUseResultLabel(result: UseItemResultMessage): string | null {
  if (result.ok) return "ใช้ยาแล้ว ฟื้นพลังชีวิต";
  switch (result.reason) {
    case "on_cooldown":
      return "ยังติดคูลดาวน์";
    case "hp_already_full":
      return "พลังชีวิตเต็มแล้ว";
    case "no_stock":
    case "unknown_item":
      return "ไม่มีไอเทมนี้แล้ว";
    case "no_effect":
      return "ไอเทมนี้ยังใช้ไม่ได้";
    case "version_conflict":
      return null;
    default:
      return "ทำรายการไม่สำเร็จ";
  }
}
