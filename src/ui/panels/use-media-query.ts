"use client";

// matchMedia hook — สลับ desktop/mobile layout ของ panel framework (DG spec §13). SSR-safe: เริ่มด้วย
// `fallback` (window ไม่มีตอน render บน server) แล้ว sync ค่าจริงหลัง mount ผ่าน useEffect.

import { useSyncExternalStore } from "react";

/** useSyncExternalStore แทน useEffect+setState — เลี่ยง cascading render (react-hooks/set-state-in-effect)
 * และได้ค่าที่ sync กับ matchMedia จริงตั้งแต่ paint แรกบน client โดยไม่มี tearing */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => fallback, // server snapshot (SSR — ไม่มี window)
  );
}

/** breakpoint mobile ของ panel framework (mirror Tailwind `md` = 768px) — desktop = panel ลอย, mobile = bottom sheet */
export const PANEL_MOBILE_QUERY = "(max-width: 767px)";

export function useIsMobilePanel(): boolean {
  return useMediaQuery(PANEL_MOBILE_QUERY);
}
