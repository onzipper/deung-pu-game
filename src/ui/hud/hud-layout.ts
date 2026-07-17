// HUD layout — layout-owner pure model (M5 HUD redesign, game spec §45-§47). No React/DOM — testable
// stand-alone (docs/agent-rules.md pattern: colocated `-view.ts`/`-layout.ts` pure logic file per widget
// family, same convention as src/ui/panels/bot/bot-layout.ts).
//
// This file owns two things:
//   1. HudSlotName — the 7 named regions HudRoot.tsx exposes (§1).
//   2. Utility Dock item config (§2) — which 8 buttons exist, their label/shortcut/aria text, and whether
//      they're "always render" or "conditional on live server state" (shop/storage — city-hub only).
//
// z-index semantics are NOT decided here — every HUD widget keeps its own existing z-30/40/50 fixed classes
// (brief invariant: "ห้าม renumber ระบบ"). This module only decides *grouping/order/shortcuts*.

export type HudSlotName =
  | "top-left"
  | "top-center"
  | "top-right"
  | "right-rail"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export const HUD_SLOT_NAMES: readonly HudSlotName[] = [
  "top-left",
  "top-center",
  "top-right",
  "right-rail",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

/** Utility Dock item id — เท่ากับ `PanelId` string ของ panel ที่ปุ่มนั้นเปิด (openPanel(id) ตรง ๆ, ดู
 * panel-stack.ts + แต่ละ *-view.ts `_PANEL_ID` constant) — ไม่ต้อง map id คนละชุด. */
export type HudDockItemId =
  | "inventory"
  | "enhancement"
  | "shop"
  | "storage"
  | "journal"
  | "bot"
  | "help"
  | "settings";

export interface HudDockItemConfig {
  id: HudDockItemId;
  /** ป้ายไทย (desktop label ข้าง icon + tooltip) */
  label: string;
  /** aria-label เต็ม (คงข้อความเดิมจากปุ่ม HudButton ที่ถูกรวมเข้ามา) */
  ariaLabel: string;
  /** คีย์ลัด PC (แสดงผล uppercase) — null = ไม่มี */
  shortcut: string | null;
  /** true = render เสมอทุก map (inventory/enhancement/journal/bot/help/settings) · false = ต้องเช็ค
   * availability จาก store ก่อน (shop/storage — เฉพาะ city-hub, isShopAvailable/isStorageAvailable) */
  alwaysAvailable: boolean;
}

/** ลำดับ render จริงของ Utility Dock (desktop แถวเดียว, mobile stack เดียวกัน ลำดับเดิม) */
export const HUD_DOCK_ITEMS: readonly HudDockItemConfig[] = [
  { id: "inventory", label: "กระเป๋า", ariaLabel: "เปิดกระเป๋า", shortcut: "I", alwaysAvailable: true },
  { id: "enhancement", label: "เสริมแกร่ง", ariaLabel: "เปิดเสริมแกร่ง", shortcut: null, alwaysAvailable: true },
  { id: "shop", label: "ร้านค้า", ariaLabel: "เปิดร้านค้า", shortcut: null, alwaysAvailable: false },
  { id: "storage", label: "คลัง", ariaLabel: "เปิดคลัง", shortcut: null, alwaysAvailable: false },
  { id: "journal", label: "สมุด", ariaLabel: "เปิดสมุดนักผจญภัย", shortcut: "J", alwaysAvailable: true },
  { id: "bot", label: "บอท", ariaLabel: "เปิดผู้ช่วยนักล่า (บอท)", shortcut: "B", alwaysAvailable: true },
  { id: "help", label: "ช่วยเหลือ", ariaLabel: "เปิดตัวช่วยเหลือ", shortcut: null, alwaysAvailable: true },
  { id: "settings", label: "ตั้งค่า", ariaLabel: "ตั้งค่า", shortcut: null, alwaysAvailable: true },
];

export interface HudDockAvailability {
  shopAvailable: boolean;
  storageAvailable: boolean;
}

/** ปุ่มนี้ควร render ไหม ณ ตอนนี้ — shop/storage เท่านั้นที่ conditional (เหมือน ShopHudButton/StorageHudButton เดิม) */
export function isHudDockItemVisible(item: HudDockItemConfig, availability: HudDockAvailability): boolean {
  if (item.id === "shop") return availability.shopAvailable;
  if (item.id === "storage") return availability.storageAvailable;
  return item.alwaysAvailable;
}

/** รายการปุ่มที่ควร render จริง ณ ตอนนี้ (กรองตาม availability) — คง HUD_DOCK_ITEMS order เดิม */
export function visibleHudDockItems(availability: HudDockAvailability): readonly HudDockItemConfig[] {
  return HUD_DOCK_ITEMS.filter((item) => isHudDockItemVisible(item, availability));
}

/** คีย์ลัด (lowercase) → dock item id — รวม I/J/B เป็นตารางเดียว (เดิมกระจาย listener คนละไฟล์ 3 อัน) */
export function hudDockShortcutMap(): Readonly<Record<string, HudDockItemId>> {
  const map: Record<string, HudDockItemId> = {};
  for (const item of HUD_DOCK_ITEMS) {
    if (item.shortcut) map[item.shortcut.toLowerCase()] = item.id;
  }
  return map;
}

/** resolve keydown event key → dock item id ที่ต้องเปิด — null = คีย์นี้ไม่ผูกอะไร */
export function resolveHudDockShortcut(key: string): HudDockItemId | null {
  return hudDockShortcutMap()[key.toLowerCase()] ?? null;
}
