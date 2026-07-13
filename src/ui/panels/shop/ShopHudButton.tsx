"use client";

// ปุ่ม HUD เปิด shop panel (P2-11) — render **เฉพาะเมื่อ MSG_SHOP_LIST ตอบ available:true** (brief: ร้าน
// อยู่เฉพาะ city-hub, map อื่นไม่มีร้าน). ต่างจาก InventoryHudButton/EnhancementHudButton ที่ render เสมอ —
// shop ปุ่มนี้ conditionally render ตาม HudState.shopList (อ่านผ่าน Zustand bridge, docs/context/ui.md
// contract). engine glue (app.ts) ยิง sendShopListRequest ตอน self เข้า room สำเร็จทุกครั้ง (join/reconnect/
// ข้าม map) — ปุ่มจึงอัปเดตโชว์/ซ่อนเองตาม map ปัจจุบันโดยไม่ต้อง component นี้ยิง request เอง.
//
// ไม่มีคีย์ลัดเฉพาะ (เหมือน enhancement — ต่างจาก inventory "I") — ไม่ใช่ workflow ที่ต้องเข้าถี่.

import { usePanelManager } from "@/ui/panels";
import { selectShopList } from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import { isShopAvailable, SHOP_PANEL_ID } from "./shop-view";

export function ShopHudButton() {
  const manager = usePanelManager();
  const shopList = useGameStore(selectShopList);

  if (!isShopAvailable(shopList)) return null;

  return (
    <button
      type="button"
      onClick={() => manager.openPanel(SHOP_PANEL_ID)}
      aria-label="เปิดร้านค้า"
      className="pointer-events-auto fixed bottom-3 right-52 z-50 rounded-lg border border-amber-700/50 bg-black/60 px-3 py-2 text-sm font-semibold text-amber-200 shadow-lg hover:bg-black/80"
    >
      ร้านค้า
    </button>
  );
}
