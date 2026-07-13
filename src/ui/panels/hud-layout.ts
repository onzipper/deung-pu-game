// Responsive HUD layout (P2-15, Bible 3.4 · GS §45 "HUD compact, never blocks combat") — className/style
// ต่อปุ่ม HUD แยก desktop/mobile. Desktop = ตำแหน่งเดิมเป๊ะ (right-hand row/top). Mobile = จัดกลุ่มใหม่ไม่
// บังจอ: ปุ่มเมนู (กระเป๋า/เสริมแกร่ง/ร้าน/คลัง) = คอลัมน์ซ้ายบน, settings = ขวาบน (คู่ help) — เว้นมุมล่าง
// ให้ joystick (ซ้ายล่าง) + ปุ่มโจมตี (ขวาล่าง). hit target ≥44px + safe-area (env(safe-area-inset-*)).
//
// caller เลือก isMobile ผ่าน useIsMobilePanel (768px breakpoint เดียวกับ panel framework).

import type { CSSProperties } from "react";

export type HudSlot = "inventory" | "enhancement" | "shop" | "storage" | "settings";

/** visual ร่วม (สี/ขอบ/เงา) — ไม่รวม position; desktop/mobile เติม position เอง.
 * Token-driven (P2 UI spec §4.2 Secondary button family — HUD toggle buttons sit directly on canvas,
 * not inside a Panel, so they use the "wood frame" secondary treatment rather than the panel bg). */
const BASE =
  "pointer-events-auto fixed z-50 rounded-(--dp-radius-md) border border-(--dp-warm-wood) bg-(--dp-deep-brown) " +
  "font-semibold text-(--dp-parchment) dp-shadow-raised transition-colors duration-(--dp-motion-fast) " +
  "hover:bg-(--dp-soil-brown) hover:text-(--dp-highlight) dp-focus-ring";

/** desktop = ตำแหน่งเดิม (px-3 py-2 text-sm) — คงพฤติกรรม/หน้าตาเดิมทุกปุ่ม. */
const DESKTOP_POS: Record<HudSlot, string> = {
  inventory: "bottom-3 right-3",
  enhancement: "bottom-3 right-28",
  shop: "bottom-3 right-52",
  storage: "bottom-3 right-72",
  settings: "top-3 right-16",
};

/** mobile slot: ด้านที่ยึด (ซ้าย/ขวา) + ระยะจากขอบ (px) + ระยะจากบน (px, บวก safe-area-top). */
const MOBILE_SLOT: Record<HudSlot, { side: "left" | "right"; sidePx: number; topPx: number }> = {
  inventory: { side: "left", sidePx: 12, topPx: 8 },
  enhancement: { side: "left", sidePx: 12, topPx: 64 },
  shop: { side: "left", sidePx: 12, topPx: 120 },
  storage: { side: "left", sidePx: 12, topPx: 176 },
  settings: { side: "right", sidePx: 64, topPx: 8 },
};

export interface HudButtonStyle {
  className: string;
  style?: CSSProperties;
}

/** className + style ของปุ่ม HUD ตาม slot + โหมดจอ. */
export function hudButtonStyle(isMobile: boolean, slot: HudSlot): HudButtonStyle {
  if (!isMobile) {
    return { className: `${BASE} ${DESKTOP_POS[slot]} px-3 py-2 text-sm` };
  }
  const m = MOBILE_SLOT[slot];
  const style: CSSProperties = {
    top: `calc(env(safe-area-inset-top, 0px) + ${m.topPx}px)`,
    [m.side]: `calc(env(safe-area-inset-${m.side}, 0px) + ${m.sidePx}px)`,
  };
  return {
    className: `${BASE} min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-sm`,
    style,
  };
}
