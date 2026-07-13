// Debug overlay — pure toggle-state logic (P0-11). แยกจาก DebugOverlay.tsx เพื่อเทสต์ได้โดยไม่ต้อง
// render React/canvas (ไม่มี jsdom WebGL ในเทสต์). ไม่แตะ engine/pixi/React ที่นี่.

/** state ของ overlay ฝั่ง React (ไม่ใช่ world state — แค่ UI toggle 2 ตัว). */
export interface DebugOverlayState {
  /** panel แสดงอยู่ไหม (F3 หรือปุ่มซ่อน/แสดง toggle ได้) */
  visible: boolean;
  /** depth-rank label เหนือ entity เปิดอยู่ไหม (engine-side, สั่งผ่าน EngineHandle.setDepthDebug) */
  depthDebug: boolean;
}

/** ค่าเริ่มต้นเมื่อยังไม่ทราบ config (caller ปกติ override ด้วย config.debugOverlay.defaultVisible) */
export const INITIAL_DEBUG_OVERLAY_STATE: DebugOverlayState = {
  visible: true,
  depthDebug: false,
};

/** KeyboardEvent.code ของคีย์ลัดเปิด/ปิด overlay — เลี่ยงชนกับ browser devtools (F12) */
export const DEBUG_TOGGLE_KEY_CODE = "F3";

/** true ถ้า code ที่กดคือคีย์ลัด toggle overlay */
export function isDebugToggleKey(code: string): boolean {
  return code === DEBUG_TOGGLE_KEY_CODE;
}

/** สลับ visible (reducer, pure — ใช้กับ setState โดยตรง) */
export function toggleVisible(state: DebugOverlayState): DebugOverlayState {
  return { ...state, visible: !state.visible };
}

/** สลับ depthDebug flag (reducer, pure) — caller ยังต้องเรียก engine.setDepthDebug(next.depthDebug) เอง */
export function toggleDepthDebug(state: DebugOverlayState): DebugOverlayState {
  return { ...state, depthDebug: !state.depthDebug };
}
