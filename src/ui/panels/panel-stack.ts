// Panel stack — pure z-order state (no React, no DOM). แยกออกจาก PanelContext.tsx เพื่อเทสต์ตรงด้วย
// Vitest โดยไม่ต้องพึ่ง RTL/jsdom (pattern เดียวกับ debug-overlay-logic.ts — ดู docs/agent-rules.md).
//
// ใช้โดย inventory (P2-07) / shop (P2-11) / help-hint panel (P2-12) ผ่าน src/ui/panels/PanelContext.tsx.

export type PanelId = string;

/** ลำดับ panel ที่เปิดอยู่ — [0] = ล่างสุด, ตัวสุดท้าย = บนสุด (frontmost, รับ Esc ก่อน) */
export interface PanelStackState {
  readonly order: readonly PanelId[];
}

export const INITIAL_PANEL_STACK_STATE: PanelStackState = { order: [] };

/** z-index เริ่มต้นของ panel ล่างสุด — สูงกว่า DebugOverlay (z-50, src/ui/DebugOverlay.tsx) เสมอ */
export const PANEL_BASE_Z_INDEX = 60;

/** เปิด panel — เปิดอยู่แล้วแค่ยกขึ้นบนสุด (focus), ยังไม่เคยเปิดก็ push ท้าย order */
export function openPanel(state: PanelStackState, id: PanelId): PanelStackState {
  const rest = state.order.filter((existing) => existing !== id);
  return { order: [...rest, id] };
}

/** ปิด panel ด้วย id — no-op (คืน reference เดิม) ถ้าไม่ได้เปิดอยู่ */
export function closePanel(state: PanelStackState, id: PanelId): PanelStackState {
  if (!state.order.includes(id)) return state;
  return { order: state.order.filter((existing) => existing !== id) };
}

/** ปิด panel บนสุด (Esc) — no-op ถ้าไม่มี panel เปิดอยู่เลย */
export function closeTopPanel(state: PanelStackState): PanelStackState {
  if (state.order.length === 0) return state;
  return { order: state.order.slice(0, -1) };
}

/** ปิดทุก panel — คืน state เริ่มต้น */
export function closeAllPanels(): PanelStackState {
  return INITIAL_PANEL_STACK_STATE;
}

export function isPanelOpen(state: PanelStackState, id: PanelId): boolean {
  return state.order.includes(id);
}

/** id ของ panel บนสุด (frontmost) — null ถ้าไม่มี panel เปิดอยู่เลย */
export function topPanelId(state: PanelStackState): PanelId | null {
  return state.order.length > 0 ? state.order[state.order.length - 1] : null;
}

/** z-index จริงของ panel นั้น (base + ตำแหน่งใน order) — panel ปิดอยู่คืน null */
export function zIndexOf(state: PanelStackState, id: PanelId): number | null {
  const idx = state.order.indexOf(id);
  return idx === -1 ? null : PANEL_BASE_Z_INDEX + idx;
}

export type PanelStackAction =
  | { type: "OPEN"; id: PanelId }
  | { type: "CLOSE"; id: PanelId }
  | { type: "CLOSE_TOP" }
  | { type: "CLOSE_ALL" };

/** reducer pure ครอบฟังก์ชันข้างบน — ใช้ตรงกับ useReducer ใน PanelContext.tsx */
export function panelStackReducer(state: PanelStackState, action: PanelStackAction): PanelStackState {
  switch (action.type) {
    case "OPEN":
      return openPanel(state, action.id);
    case "CLOSE":
      return closePanel(state, action.id);
    case "CLOSE_TOP":
      return closeTopPanel(state);
    case "CLOSE_ALL":
      return closeAllPanels();
    default:
      return state;
  }
}
