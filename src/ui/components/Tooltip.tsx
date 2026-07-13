"use client";

// Tooltip — P2 UI Visual Implementation Spec §4.5. Desktop: hover/focus. Mobile: tap toggles open with an
// explicit close affordance (spec: "Mobile เปิดด้วย tap/long press และต้องปิดได้ชัด"). No floating-position
// library in this repo (kept dependency-free) — anchors above the trigger, centered; edge-of-screen
// collision avoidance is a follow-up, not required by the spec DoD.

import { useState, type ReactNode } from "react";
import { useIsMobilePanel } from "@/ui/panels/use-media-query";
import { RARITY_COLORS, type RarityTier } from "@/ui/theme/rarity";

export interface TooltipProps {
  /** ชื่อไอเทม/หัวข้อ — สีตาม rarity ถ้ามี (§4.5 "Item name ใช้ rarity color") */
  title?: string;
  titleRarity?: RarityTier;
  /** เนื้อหา body — ปกติ parchment; ใช้ text-[var(--dp-pale-moss)]/text-[var(--dp-danger-red)]/
   * text-[var(--dp-moon-light)] เองใน children สำหรับ stat บวก/ลบ/lore ตาม §4.5 */
  children: ReactNode;
  trigger: ReactNode;
  className?: string;
}

export function Tooltip({ title, titleRarity, children, trigger, className }: TooltipProps) {
  const isMobile = useIsMobilePanel();
  const [open, setOpen] = useState(false);

  const desktopHandlers = isMobile
    ? {}
    : {
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
        onFocus: () => setOpen(true),
        onBlur: () => setOpen(false),
      };
  const mobileHandlers = isMobile ? { onClick: () => setOpen((v) => !v) } : {};

  return (
    <span className={["relative inline-block", className ?? ""].filter(Boolean).join(" ")}>
      <span {...desktopHandlers} {...mobileHandlers}>
        {trigger}
      </span>
      {open && (
        <span
          role="tooltip"
          className={[
            "dp-shadow-modal absolute bottom-full left-1/2 z-[var(--dp-z-tooltip)] mb-2 -translate-x-1/2",
            "w-max max-w-[88vw] rounded-[var(--dp-radius-md)] border border-[var(--dp-soil-brown)]",
            "bg-[var(--dp-deep-ink)] p-3 text-left text-[length:var(--dp-text-body-sm)] text-[var(--dp-parchment)] md:max-w-[360px]",
          ].join(" ")}
        >
          {isMobile && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="ปิด"
              className="dp-focus-ring absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-[var(--dp-radius-sm)] text-[var(--dp-parchment)] hover:bg-[var(--dp-warm-ink)]"
            >
              ✕
            </button>
          )}
          {title && (
            <div
              className="mb-1 pr-6 text-[length:var(--dp-text-body)] font-semibold"
              style={{ color: titleRarity ? RARITY_COLORS[titleRarity] : "var(--dp-highlight)" }}
            >
              {title}
            </div>
          )}
          {children}
        </span>
      )}
    </span>
  );
}
