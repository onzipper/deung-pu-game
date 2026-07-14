"use client";

// ปุ่ม HUD หลักของระบบ guidance (P2-12, DG §5.2) — render เสมอ (ต่างจาก ShopHudButton ที่ conditional)
// มุมขวาบน ห่างจาก panel อื่น ๆ (inventory/enhancement/shop อยู่แถวล่าง). เปิดที่แท็บล่าสุด ไม่ set focus
// article ใหม่ (ต่างจาก ContextHelpButton ที่ focus บทความเฉพาะจอ) — เปิดจากตรงนี้ = ทางเข้าทั่วไป.

import { usePanelManager, useIsMobilePanel } from "@/ui/panels";
import { hudIconUrl } from "@/ui/panels/hud-icon-catalog";
import { HELP_PANEL_ID } from "./help-view";
import { useHelpFocus } from "./help-focus-context";

export function HelpHudButton() {
  const manager = usePanelManager();
  const isMobile = useIsMobilePanel();
  const { setFocusedArticleId } = useHelpFocus();

  // desktop = เดิม (right-3 top-3, 36px). mobile = มุมขวาบน + safe-area, hit target 44px (h-11 w-11).
  const className = [
    "dp-focus-ring dp-shadow-raised pointer-events-auto fixed z-50 flex items-center justify-center",
    "rounded-(--dp-radius-pill) border border-(--dp-warm-wood) bg-(--dp-deep-brown) text-base font-bold",
    "text-(--dp-parchment) transition-colors hover:bg-(--dp-soil-brown) hover:text-(--dp-highlight)",
    isMobile ? "h-11 w-11" : "right-3 top-3 h-9 w-9",
  ].join(" ");
  const style = isMobile
    ? {
        right: "calc(env(safe-area-inset-right, 0px) + 12px)",
        top: "calc(env(safe-area-inset-top, 0px) + 8px)",
      }
    : undefined;

  return (
    <button
      type="button"
      onClick={() => {
        setFocusedArticleId(null); // ทางเข้าทั่วไป — ไม่ focus บทความไหนเฉพาะ (ต่างจาก context help)
        manager.openPanel(HELP_PANEL_ID);
      }}
      aria-label="เปิดตัวช่วยเหลือ"
      className={className}
      style={style}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative HUD glyph, closed icon set (hud-icon-catalog.ts) */}
      <img src={hudIconUrl("help")} alt="" aria-hidden className="h-5 w-5" />
    </button>
  );
}
