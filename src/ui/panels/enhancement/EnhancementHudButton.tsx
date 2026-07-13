"use client";

// ปุ่ม HUD เปิด enhancement panel ตรง ๆ (P2-10) — ไม่ผูก target ใหม่ (ใช้ target ล่าสุดที่เคยเลือกไว้ ถ้ามี
// ไม่มีก็ NO_ITEM ปกติ, ผู้เล่นไปเลือกที่กระเป๋าต่อ). แยกจาก EnhancementPanel.tsx เจตนาเดียวกับ
// InventoryHudButton.tsx: ปุ่มต้อง render เสมอที่มุมจอ, panel เนื้อหาจริง render เฉพาะตอนเปิด.
// ไม่มีคีย์ลัดเฉพาะ (ต่างจาก inventory "I") — เข้าทาง InventoryPanel เป็นทางหลักตาม spec brief.

import { usePanelManager } from "@/ui/panels";
import { ENHANCEMENT_PANEL_ID } from "./enhancement-view";

export function EnhancementHudButton() {
  const manager = usePanelManager();

  return (
    <button
      type="button"
      onClick={() => manager.openPanel(ENHANCEMENT_PANEL_ID)}
      aria-label="เปิดเสริมแกร่ง"
      className="pointer-events-auto fixed bottom-3 right-28 z-50 rounded-lg border border-amber-700/50 bg-black/60 px-3 py-2 text-sm font-semibold text-amber-200 shadow-lg hover:bg-black/80"
    >
      เสริมแกร่ง
    </button>
  );
}
