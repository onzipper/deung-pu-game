"use client";

// ปุ่ม HUD เปิด storage panel (P2-17) — render **เฉพาะเมื่อ MSG_STORAGE_STATE ตอบ available:true** (คลัง
// อยู่เฉพาะ city-hub เหมือนร้านค้า, ดู server/config/storage.ts accessMapIds). ต่างจาก InventoryHudButton/
// EnhancementHudButton ที่ render เสมอ — ปุ่มนี้ conditionally render ตาม HudState.storageState (อ่านผ่าน
// Zustand bridge, docs/context/ui.md contract). engine glue (app.ts) ยิง sendStorageOpen ตอน self เข้า room
// สำเร็จทุกครั้ง (join/reconnect/ข้ามmap, pattern เดียวกับ ShopHudButton) — ปุ่มจึงอัปเดตโชว์/ซ่อนเองตาม map
// ปัจจุบันโดยไม่ต้อง component นี้ยิง request เอง.

import { usePanelManager, useIsMobilePanel } from "@/ui/panels";
import { hudButtonStyle } from "@/ui/panels/hud-layout";
import { hudIconUrl } from "@/ui/panels/hud-icon-catalog";
import { selectStorageState } from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import { isStorageAvailable, STORAGE_PANEL_ID } from "./storage-view";

export function StorageHudButton() {
  const manager = usePanelManager();
  const isMobile = useIsMobilePanel();
  const storageState = useGameStore(selectStorageState);
  const { className, style } = hudButtonStyle(isMobile, "storage");

  if (!isStorageAvailable(storageState)) return null;

  return (
    <button
      type="button"
      onClick={() => manager.openPanel(STORAGE_PANEL_ID)}
      aria-label="เปิดคลัง"
      className={`${className} inline-flex items-center gap-1.5`}
      style={style}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative HUD glyph, closed icon set (hud-icon-catalog.ts) */}
      <img src={hudIconUrl("storage")} alt="" aria-hidden className="h-5 w-5 shrink-0" />
      {!isMobile && <span>คลัง</span>}
    </button>
  );
}
