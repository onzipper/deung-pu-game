"use client";

// Panel manager — React Context + useReducer ครอบ panel-stack.ts (pure logic) ให้ component ไหนก็เปิด/ปิด
// panel ได้ผ่าน usePanelManager() โดยไม่ต้อง prop-drill (inventory P2-07 / shop P2-11 / help-hint P2-12).
//
// ตัดสินใจ (บันทึกไว้ตามที่ brief ขอ): เก็บสถานะเปิด/ปิด panel เป็น React Context แยกจาก Zustand gameStore
// (HudState, src/ui/store/game-store.ts) เพราะเป็นเรื่อง UI ล้วน ไม่ใช่ engine→UI snapshot — HudState ตาม
// contract (docs/context/ui.md) คือ "throttled snapshot จาก game loop เท่านั้น" ผสม panel state (ซึ่งไม่มี
// อะไรเกี่ยวกับ world เลย) เข้าไปจะทำให้ store ตัวเดียวรับผิดชอบสองเรื่องต่างกัน — engine (app.ts) ไม่ควร
// รู้จัก panel state เลยด้วยซ้ำ แยกไฟล์ชัดเจนกว่า.
//
// กัน keyboard event ทะลุไปสั่งเกม (DG spec §13): ตอนมี panel เปิดอย่างน้อย 1 อัน ผูก keydown listener ที่
// **capture phase ของ window** (`addEventListener(..., true)`) แล้ว stopPropagation ทุกครั้ง — capture phase
// วิ่งก่อน bubble phase เสมอแม้ target เดียวกัน (window) จึงตัด event ก่อนไปถึง keyboard tracker ของ engine
// (attachKeyboard ผูกแบบ bubble ปกติที่ src/engine/input/keyboard.ts) โดยไม่ต้องแตะไฟล์ engine เลย.
// Escape ปิด panel บนสุดก่อน (CLOSE_TOP) แล้วค่อย stopPropagation เหมือนปุ่มอื่น.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  INITIAL_PANEL_STACK_STATE,
  isPanelOpen,
  panelStackReducer,
  zIndexOf,
  type PanelId,
} from "./panel-stack";

export interface PanelManager {
  openPanel(id: PanelId): void;
  closePanel(id: PanelId): void;
  closeAllPanels(): void;
  isPanelOpen(id: PanelId): boolean;
  /** z-index จริง (คำนวณจาก z-order) — panel ปิดอยู่คืน null, Panel.tsx ใช้ตัดสินใจ render */
  zIndexOf(id: PanelId): number | null;
}

const PanelManagerContext = createContext<PanelManager | null>(null);

export function PanelProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(panelStackReducer, INITIAL_PANEL_STACK_STATE);

  useEffect(() => {
    if (state.order.length === 0) return;
    const onKeyDownCapture = (e: KeyboardEvent): void => {
      if (e.key === "Escape") dispatch({ type: "CLOSE_TOP" });
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDownCapture, true);
    return () => window.removeEventListener("keydown", onKeyDownCapture, true);
  }, [state.order.length]);

  const manager = useMemo<PanelManager>(
    () => ({
      openPanel: (id) => dispatch({ type: "OPEN", id }),
      closePanel: (id) => dispatch({ type: "CLOSE", id }),
      closeAllPanels: () => dispatch({ type: "CLOSE_ALL" }),
      isPanelOpen: (id) => isPanelOpen(state, id),
      zIndexOf: (id) => zIndexOf(state, id),
    }),
    [state],
  );

  return <PanelManagerContext.Provider value={manager}>{children}</PanelManagerContext.Provider>;
}

/** hook ใช้ใน panel เนื้อหาจริง (inventory/shop/...) — ต้องอยู่ใต้ <PanelProvider> เท่านั้น */
export function usePanelManager(): PanelManager {
  const ctx = useContext(PanelManagerContext);
  if (!ctx) throw new Error("usePanelManager ต้องเรียกใต้ <PanelProvider> เท่านั้น");
  return ctx;
}
