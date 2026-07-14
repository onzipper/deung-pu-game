"use client";

// ปุ่ม HUD เปิด journal panel (C3-MVP) — render เสมอทุก map (ต่างจาก shop/storage ที่ conditional บน
// city-hub) เหมือน inventory/enhancement. คีย์ลัด "J" — เปิดเท่านั้น (pattern เดียวกับ InventoryHudButton
// "I": PanelContext ผูก keydown ที่ capture phase ของ window แล้ว stopPropagation ทุกครั้งที่มี panel เปิด
// อย่างน้อย 1 อัน ก่อนจะถึง listener ตรงนี้ (bubble phase) เสมอ — จึง "toggle ปิด" ด้วยคีย์เดิมไม่ได้จริงตราบใด
// journal เองเปิดอยู่ (ปิดต้องกดปุ่ม title bar หรือ Esc เหมือน panel อื่นทุกอัน) — ตั้งใจไม่ฝืนสร้าง toggle
// ปลอมที่ผิดสัญญากับ PanelContext, ตรงตามพฤติกรรมจริงของ "I" ที่มีอยู่แล้ว.
//
// ยังไม่มี icon asset (svg/ui/icon_hud_journal_v01.svg ไม่มี, hud-icon-catalog.ts เป็น closed set ต้องมี
// ไฟล์จริงทุก slot) — MVP: ปุ่ม text-only ("สมุด") สไตล์เดียวกับปุ่ม HUD อื่น (คัด class มาจาก hud-layout.ts
// BASE ตรง ๆ, ไม่แก้ hud-layout.ts/hud-icon-catalog.ts เพราะเป็น closed Record ที่ทุก HudSlot ต้องมี icon —
// แก้ตอนนี้จะบังคับผูก path icon ที่ไม่มีไฟล์จริง). วางถัดจากปุ่ม "คลัง" ในกลุ่มเดียวกัน (desktop แถวล่างขวา,
// mobile คอลัมน์ซ้ายบน) ตาม hud-layout.ts convention (ระยะห่างเท่าปุ่มอื่นในกลุ่ม).

import { useEffect } from "react";
import { usePanelManager, useIsMobilePanel } from "@/ui/panels";
import { JOURNAL_PANEL_ID } from "./journal-view";

const BASE =
  "pointer-events-auto fixed z-50 rounded-(--dp-radius-md) border border-(--dp-warm-wood) bg-(--dp-deep-brown) " +
  "font-semibold text-(--dp-parchment) dp-shadow-raised transition-colors duration-(--dp-motion-fast) " +
  "hover:bg-(--dp-soil-brown) hover:text-(--dp-highlight) dp-focus-ring inline-flex items-center gap-1.5";

export function JournalHudButton() {
  const manager = usePanelManager();
  const isMobile = useIsMobilePanel();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      if (e.key.toLowerCase() !== "j") return;
      manager.openPanel(JOURNAL_PANEL_ID);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [manager]);

  // desktop: ถัดจาก "คลัง" (bottom-3 right-72) ระยะห่างเท่าปุ่มอื่นในแถว (~24 หน่วย tailwind)
  // mobile: ถัดจาก "คลัง" ในคอลัมน์ซ้าย (topPx 176 + 56 = 232, ห่างเท่าปุ่มอื่นในคอลัมน์)
  const className = isMobile ? `${BASE} min-h-[44px] min-w-[44px] justify-center px-3 py-2 text-sm` : `${BASE} bottom-3 right-96 px-3 py-2 text-sm`;
  const style = isMobile
    ? {
        top: "calc(env(safe-area-inset-top, 0px) + 232px)",
        left: "calc(env(safe-area-inset-left, 0px) + 12px)",
      }
    : undefined;

  return (
    <button type="button" onClick={() => manager.openPanel(JOURNAL_PANEL_ID)} aria-label="เปิดสมุดนักผจญภัย" className={className} style={style}>
      <span>
        สมุด{!isMobile && <span className="text-(--dp-sand)"> (J)</span>}
      </span>
    </button>
  );
}
