"use client";

// ปุ่ม HUD เปิด inventory panel (P2-07) + คีย์ลัด "I" (PC keybind — touch mode ใช้ปุ่มนี้ตรง ๆ, DG spec §13
// สองโหมด responsive). แยกจาก InventoryPanel.tsx เจตนา: ปุ่มต้อง render เสมอที่มุมจอไม่ว่า panel เปิดอยู่
// หรือไม่ ส่วน <Panel> เนื้อหาจริง render เฉพาะตอนเปิด (ดู Panel.tsx).
//
// keyboard block ร่วมกับ PanelContext: ตอนมี panel เปิดอย่างน้อย 1 อัน PanelContext ผูก keydown listener
// ที่ **capture phase** ของ window แล้ว stopPropagation ทุกครั้ง — capture phase มาก่อน bubble phase เสมอ
// แม้ target เดียวกัน (window) ดังนั้น listener "I" ที่นี่ (bubble phase ปกติ) จะไม่ทำงานเลยขณะมี panel
// เปิดอยู่แล้ว (ป้องกัน conflict โดยธรรมชาติ ไม่ต้องเช็ค isPanelOpen ซ้ำที่นี่) — ทำงานเฉพาะตอนไม่มี panel
// เปิดเลย ซึ่งตรงกับ use case จริง ("I" = เปิดกระเป๋า ไม่ใช่ toggle).

import { useEffect } from "react";
import { usePanelManager, useIsMobilePanel } from "@/ui/panels";
import { hudButtonStyle } from "@/ui/panels/hud-layout";
import { hudIconUrl } from "@/ui/panels/hud-icon-catalog";
import { INVENTORY_PANEL_ID } from "./inventory-view";

export function InventoryHudButton() {
  const manager = usePanelManager();
  const isMobile = useIsMobilePanel();
  const { className, style } = hudButtonStyle(isMobile, "inventory");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      if (e.key.toLowerCase() !== "i") return;
      manager.openPanel(INVENTORY_PANEL_ID);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [manager]);

  return (
    <button
      type="button"
      onClick={() => manager.openPanel(INVENTORY_PANEL_ID)}
      aria-label="เปิดกระเป๋า"
      className={`${className} inline-flex items-center gap-1.5`}
      style={style}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative HUD glyph, closed icon set (hud-icon-catalog.ts) */}
      <img src={hudIconUrl("inventory")} alt="" aria-hidden className="h-5 w-5 shrink-0" />
      {!isMobile && (
        <span>
          กระเป๋า <span className="text-(--dp-sand)">(I)</span>
        </span>
      )}
    </button>
  );
}
