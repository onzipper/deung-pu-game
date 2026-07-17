"use client";

// Utility Dock (M5 §2) — รวมปุ่ม HUD 8 ปุ่มเดิม (กระเป๋า/เสริมแกร่ง/ร้านค้า/คลัง/สมุด/บอท/ช่วยเหลือ/ตั้งค่า)
// เป็นจุดเดียว แทนปุ่ม fixed กระจายทั่วจอเดิม (Inventory/Enhancement/Shop/Storage/Journal/Bot/Help/Settings
// HudButton.tsx เดิม — ลบไปแล้ว, ดู git history). desktop: แถวมุมขวาล่าง (bottom-right slot). mobile: ปุ่ม
// toggle เดียวที่ right-rail (ใต้มินิแมป เหนือปุ่มโจมตี — เลี่ยง joystick/attack/minimap ตาม §6) ขยายเป็น
// stack แนวตั้งเมื่อแตะ.
//
// คีย์ลัด I/J/B รวมเป็น listener เดียว (เดิมกระจาย 3 ไฟล์คนละปุ่ม) — ทำงานเฉพาะตอนไม่มี panel เปิดอยู่เลย
// (PanelContext ผูก keydown capture-phase + stopPropagation ทุกครั้งที่มี panel เปิด ≥1 อัน มาก่อน listener
// bubble-phase นี้เสมอ — พฤติกรรมเดิมทุกประการ, ดู InventoryHudButton.tsx header comment เดิม).

import { useEffect, useState } from "react";
import { usePanelManager, useIsMobilePanel } from "@/ui/panels";
import { useGameStore } from "@/ui/store/use-game-store";
import { selectShopList, selectStorageState } from "@/ui/store/game-store";
import { isShopAvailable } from "@/ui/panels/shop/shop-view";
import { isStorageAvailable } from "@/ui/panels/storage/storage-view";
import { useHelpFocus } from "@/ui/panels/help/help-focus-context";
import { hudIconUrl } from "@/ui/panels/hud-icon-catalog";
import {
  resolveHudDockShortcut,
  visibleHudDockItems,
  type HudDockItemConfig,
  type HudDockItemId,
} from "./hud-layout";

const ITEM_BASE =
  "dp-focus-ring dp-shadow-raised pointer-events-auto relative flex h-12 w-12 shrink-0 items-center " +
  "justify-center rounded-(--dp-radius-md) border transition-colors duration-(--dp-motion-fast)";
const ITEM_INACTIVE =
  "border-(--dp-warm-wood) bg-(--dp-deep-brown) text-(--dp-parchment) hover:bg-(--dp-soil-brown) hover:text-(--dp-highlight)";
const ITEM_ACTIVE = "border-(--dp-resonance-teal) bg-(--dp-resonance-dark) text-(--dp-highlight)";

// mobile stack ต้องลอยอยู่เหนือ AttackButton (bottom 32px + height 84px = ขอบบน 116px จากขอบจอ) — เว้น 16px
const MOBILE_DOCK_BOTTOM_PX = 132;

export function UtilityDock() {
  const manager = usePanelManager();
  const isMobile = useIsMobilePanel();
  const shopList = useGameStore(selectShopList);
  const storageState = useGameStore(selectStorageState);
  const { setFocusedArticleId } = useHelpFocus();
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const items = visibleHudDockItems({
    shopAvailable: isShopAvailable(shopList),
    storageAvailable: isStorageAvailable(storageState),
  });

  const openItem = (id: HudDockItemId): void => {
    if (id === "help") setFocusedArticleId(null); // ทางเข้าทั่วไป — ไม่ focus บทความไหน (เดิม HelpHudButton)
    manager.openPanel(id);
    if (isMobile) setMobileExpanded(false);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      const id = resolveHudDockShortcut(e.key);
      if (!id) return;
      openItem(id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openItem อ่าน manager/isMobile สดทุกครั้งผ่าน closure ใหม่ตอน re-render อยู่แล้ว
  }, [manager, isMobile]);

  if (isMobile) {
    return (
      <div
        className="pointer-events-none fixed z-50 flex flex-col-reverse items-end gap-2"
        style={{
          right: "calc(env(safe-area-inset-right, 0px) + 12px)",
          bottom: `calc(env(safe-area-inset-bottom, 0px) + ${MOBILE_DOCK_BOTTOM_PX}px)`,
        }}
      >
        <button
          type="button"
          onClick={() => setMobileExpanded((v) => !v)}
          aria-label={mobileExpanded ? "ปิดเมนู" : "เปิดเมนู"}
          aria-expanded={mobileExpanded}
          className={`${ITEM_BASE} ${ITEM_INACTIVE}`}
        >
          <span aria-hidden className="text-xl leading-none font-bold">
            {mobileExpanded ? "✕" : "⋮"}
          </span>
        </button>
        {mobileExpanded && (
          <div
            className="pointer-events-auto flex flex-col-reverse gap-2 overflow-y-auto"
            style={{ maxHeight: "calc(50vh - 56px)" }}
          >
            {items.map((item) => (
              <DockButton key={item.id} item={item} active={manager.isPanelOpen(item.id)} onClick={() => openItem(item.id)} compact />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-50 flex items-center gap-2">
      {items.map((item) => (
        <DockButton key={item.id} item={item} active={manager.isPanelOpen(item.id)} onClick={() => openItem(item.id)} />
      ))}
    </div>
  );
}

function DockButton({
  item,
  active,
  onClick,
  compact,
}: {
  item: HudDockItemConfig;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
      aria-label={item.ariaLabel}
      className={`${ITEM_BASE} ${active ? ITEM_ACTIVE : ITEM_INACTIVE}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative HUD glyph, closed icon set (hud-icon-catalog.ts) */}
      <img src={hudIconUrl(item.id)} alt="" aria-hidden className="h-6 w-6" />
      {!compact && item.shortcut && (
        <span aria-hidden className="absolute right-0.5 bottom-0.5 text-[9px] font-bold text-(--dp-sand)">
          {item.shortcut}
        </span>
      )}
    </button>
  );
}
