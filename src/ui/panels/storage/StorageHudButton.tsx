"use client";

// ปุ่ม HUD เปิด storage panel (P2-17) — render **เฉพาะเมื่อ MSG_STORAGE_STATE ตอบ available:true** (คลัง
// อยู่เฉพาะ city-hub เหมือนร้านค้า, ดู server/config/storage.ts accessMapIds). ต่างจาก InventoryHudButton/
// EnhancementHudButton ที่ render เสมอ — ปุ่มนี้ conditionally render ตาม HudState.storageState (อ่านผ่าน
// Zustand bridge, docs/context/ui.md contract). engine glue (app.ts) ยิง sendStorageOpen ตอน self เข้า room
// สำเร็จทุกครั้ง (join/reconnect/ข้ามmap, pattern เดียวกับ ShopHudButton) — ปุ่มจึงอัปเดตโชว์/ซ่อนเองตาม map
// ปัจจุบันโดยไม่ต้อง component นี้ยิง request เอง.

import { usePanelManager } from "@/ui/panels";
import { selectStorageState } from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import { isStorageAvailable, STORAGE_PANEL_ID } from "./storage-view";

export function StorageHudButton() {
  const manager = usePanelManager();
  const storageState = useGameStore(selectStorageState);

  if (!isStorageAvailable(storageState)) return null;

  return (
    <button
      type="button"
      onClick={() => manager.openPanel(STORAGE_PANEL_ID)}
      aria-label="เปิดคลัง"
      className="pointer-events-auto fixed bottom-3 right-72 z-50 rounded-lg border border-amber-700/50 bg-black/60 px-3 py-2 text-sm font-semibold text-amber-200 shadow-lg hover:bg-black/80"
    >
      คลัง
    </button>
  );
}
