"use client";

// ปุ่ม HUD เปิด enhancement panel ตรง ๆ (P2-10) — ไม่ผูก target ใหม่ (ใช้ target ล่าสุดที่เคยเลือกไว้ ถ้ามี
// ไม่มีก็ NO_ITEM ปกติ, ผู้เล่นไปเลือกที่กระเป๋าต่อ). แยกจาก EnhancementPanel.tsx เจตนาเดียวกับ
// InventoryHudButton.tsx: ปุ่มต้อง render เสมอที่มุมจอ, panel เนื้อหาจริง render เฉพาะตอนเปิด.
// ไม่มีคีย์ลัดเฉพาะ (ต่างจาก inventory "I") — เข้าทาง InventoryPanel เป็นทางหลักตาม spec brief.

import { usePanelManager, useIsMobilePanel } from "@/ui/panels";
import { hudButtonStyle } from "@/ui/panels/hud-layout";
import { hudIconUrl } from "@/ui/panels/hud-icon-catalog";
import { ENHANCEMENT_PANEL_ID } from "./enhancement-view";

export function EnhancementHudButton() {
  const manager = usePanelManager();
  const isMobile = useIsMobilePanel();
  const { className, style } = hudButtonStyle(isMobile, "enhancement");

  return (
    <button
      type="button"
      onClick={() => manager.openPanel(ENHANCEMENT_PANEL_ID)}
      aria-label="เปิดเสริมแกร่ง"
      className={`${className} inline-flex items-center gap-1.5`}
      style={style}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative HUD glyph, closed icon set (hud-icon-catalog.ts) */}
      <img src={hudIconUrl("enhancement")} alt="" aria-hidden className="h-5 w-5 shrink-0" />
      {!isMobile && <span>เสริมแกร่ง</span>}
    </button>
  );
}
