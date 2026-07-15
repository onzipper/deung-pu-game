"use client";

// ปุ่ม HUD เปิด Bot Hub panel (7b-UI, P3 §1 "entry point เดียว") — render เสมอทุก map (pattern เดียวกับ
// InventoryHudButton/JournalHudButton — ต่างจาก shop/storage ที่ conditional บน city-hub, บอทไม่ผูก map ใด map หนึ่ง).
//
// ยังไม่มี icon asset เฉพาะ (เหมือน journal ตอน MVP) — ปุ่ม text-only ("บอท") สไตล์เดียวกับปุ่ม HUD อื่น
// (คัด class มาจาก hud-layout.ts BASE ตรง ๆ, ไม่แก้ hud-layout.ts/hud-icon-catalog.ts เพราะเป็น closed Record
// ที่ทุก HudSlot ต้องมี icon จริง — ดู rationale เดียวกันที่ JournalHudButton.tsx). วางถัดจากปุ่ม "สมุด".
//
// ⚠ ห้ามเรียก/ปนกับ Auto Pilot (D-037 auto-walk, AutoPilotChip) หรือดึ๋งๆ companion (D-035) — คนละปุ่ม/
// คนละสิทธิ์เด็ดขาด (P3 §0.1).

import { useEffect } from "react";
import { usePanelManager, useIsMobilePanel } from "@/ui/panels";
import { BOT_PANEL_ID } from "./bot-view";

const BASE =
  "pointer-events-auto fixed z-50 rounded-(--dp-radius-md) border border-(--dp-warm-wood) bg-(--dp-deep-brown) " +
  "font-semibold text-(--dp-parchment) dp-shadow-raised transition-colors duration-(--dp-motion-fast) " +
  "hover:bg-(--dp-soil-brown) hover:text-(--dp-highlight) dp-focus-ring inline-flex items-center gap-1.5";

export function BotHudButton() {
  const manager = usePanelManager();
  const isMobile = useIsMobilePanel();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      if (e.key.toLowerCase() !== "b") return;
      manager.openPanel(BOT_PANEL_ID);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [manager]);

  // desktop: ถัดจาก "สมุด" (bottom-3 right-96) ระยะห่างเท่าปุ่มอื่นในแถว (~24 หน่วย tailwind)
  // mobile: ถัดจาก "สมุด" ในคอลัมน์ซ้าย (topPx 232 + 56 = 288, ห่างเท่าปุ่มอื่นในคอลัมน์)
  const className = isMobile
    ? `${BASE} min-h-[44px] min-w-[44px] justify-center px-3 py-2 text-sm`
    : `${BASE} bottom-3 right-[30rem] px-3 py-2 text-sm`;
  const style = isMobile
    ? {
        top: "calc(env(safe-area-inset-top, 0px) + 288px)",
        left: "calc(env(safe-area-inset-left, 0px) + 12px)",
      }
    : undefined;

  return (
    <button
      type="button"
      onClick={() => manager.openPanel(BOT_PANEL_ID)}
      aria-label="เปิดผู้ช่วยนักล่า (บอท)"
      className={className}
      style={style}
    >
      <span>
        บอท{!isMobile && <span className="text-(--dp-sand)"> (B)</span>}
      </span>
    </button>
  );
}
