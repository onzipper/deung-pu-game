// Zustand bridge — game loop → store → React (P2-01, docs/context/ui.md contract).
// Vanilla store เท่านั้น (`zustand/vanilla` createStore) — **ห้าม import React ที่นี่**: engine
// (`src/engine/runtime/app.ts`) import ไฟล์นี้ตรง ๆ เพื่อ publish ค่า, ถ้ามี React import ในไฟล์นี้ engine
// จะดึง React เข้า bundle ทางอ้อม ผิด layer contract (CLAUDE.md: src/engine/** ห้าม import React).
// React hook (สำหรับ component) แยกอยู่ที่ `use-game-store.ts` — "use client" กันคนละไฟล์เจตนา.
//
// ทิศทางข้อมูล (ui.md): game loop → publishHudState (throttled cadence) → store → React subscribe.
// world state (ตำแหน่ง/hp ต่อ frame) ห้ามเข้า React state ตรง ๆ — ที่นี่คือ "snapshot เบา ๆ" ที่ throttle
// แล้วเท่านั้น (tech §2), ไม่ใช่ world state ดิบ.

import { createStore, type StoreApi } from "zustand/vanilla";
import type { EngineDebugInfo } from "@/engine/runtime/debug-info";
import type {
  EnhanceResultMessage,
  InventoryOpRejectedMessage,
  InventorySnapshot,
} from "@/shared/net-protocol";

/** HUD state ที่ UI ทุกจอ subscribe ได้ — เพิ่ม slice ใหม่ที่นี่เมื่อ UI ตัวถัดไป (inventory/shop/...) ต้องใช้ */
export interface HudState {
  /** snapshot ล่าสุดของ debug overlay (P0-11) — null ก่อน engine publish ครั้งแรก */
  debugInfo: EngineDebugInfo | null;
  /** snapshot inventory/equipment ล่าสุดจาก server (P2-07, MSG_INVENTORY_STATE) — null ก่อน join สำเร็จ */
  inventory: InventorySnapshot | null;
  /**
   * mutation ล่าสุดที่ server ปฏิเสธ (P2-07, MSG_INVENTORY_OP_REJECTED) — UI ใช้โชว์ toast สั้น ๆ
   * แล้ว resync จาก `inventory` ล่าสุดที่มีอยู่แล้ว (ไม่มี request ใหม่). null = ยังไม่เคยถูกปฏิเสธใน session นี้.
   */
  inventoryRejection: InventoryOpRejectedMessage | null;
  /**
   * ผลการเสริมแกร่งล่าสุด (P2-10, MSG_ENHANCE_RESULT) — ok=true มากับ `inventory` snapshot ใหม่แยกข้อความ
   * (server ส่งสองข้อความ), ok=false มี reason. null = ยังไม่เคยเสริมแกร่งใน session นี้.
   */
  enhanceResult: EnhanceResultMessage | null;
}

export const INITIAL_HUD_STATE: HudState = {
  debugInfo: null,
  inventory: null,
  inventoryRejection: null,
  enhanceResult: null,
};

/** store singleton ตัวเดียวทั้งแอป — engine publish เข้านี่, React component subscribe ผ่าน useGameStore */
export const gameStore: StoreApi<HudState> = createStore<HudState>(() => ({
  ...INITIAL_HUD_STATE,
}));

/** เขียนค่าลง store ตรง ๆ ไม่ throttle — internal (ใช้เป็น default writer ของ publisher เท่านั้น) */
function writeToStore(partial: Partial<HudState>): void {
  gameStore.setState(partial);
}

/** รีเซ็ตกลับค่าเริ่มต้น — เทสต์/engine teardown ใช้กันสถานะรั่วข้าม world (P1-10 transition/StrictMode) */
export function resetHudState(): void {
  gameStore.setState(INITIAL_HUD_STATE, true);
}

/** typed selector — เลี่ยง `state.debugInfo` กระจายทั่วไฟล์ component */
export const selectDebugInfo = (state: HudState): EngineDebugInfo | null => state.debugInfo;

/**
 * P2-07: event-driven (ไม่ throttle) — engine เรียกตรงทันทีที่ MSG_INVENTORY_STATE มาถึง (ต่างจาก
 * debugInfo ที่ผ่าน createHudPublisher เพราะ mutation เกิดไม่บ่อย ผู้เล่นต้องเห็นผลทันทีหลังกดสวม/ถอด).
 */
export function setInventoryState(snapshot: InventorySnapshot): void {
  gameStore.setState({ inventory: snapshot });
}

/** P2-07: engine เรียกทันทีที่ MSG_INVENTORY_OP_REJECTED มาถึง (event-driven เหมือน setInventoryState) */
export function setInventoryRejection(rejected: InventoryOpRejectedMessage): void {
  gameStore.setState({ inventoryRejection: rejected });
}

/** typed selector — inventory snapshot ล่าสุด (P2-07) */
export const selectInventory = (state: HudState): InventorySnapshot | null => state.inventory;

/** typed selector — mutation ล่าสุดที่ถูกปฏิเสธ (P2-07, สำหรับ toast) */
export const selectInventoryRejection = (state: HudState): InventoryOpRejectedMessage | null =>
  state.inventoryRejection;

/** P2-10: engine เรียกทันทีที่ MSG_ENHANCE_RESULT มาถึง (event-driven เหมือน setInventoryRejection) */
export function setEnhanceResult(result: EnhanceResultMessage): void {
  gameStore.setState({ enhanceResult: result });
}

/** typed selector — ผลเสริมแกร่งล่าสุด (P2-10) */
export const selectEnhanceResult = (state: HudState): EnhanceResultMessage | null =>
  state.enhanceResult;

export interface HudPublisher {
  /**
   * เรียกได้ทุก frame — throttle ภายในเอง (ค่า default ตาม config.debugOverlay.pollIntervalMs เดิม, ~4Hz).
   * `build` เป็น thunk เรียก **เฉพาะตอนถึงคิวจริง** เท่านั้น (กันประกอบ object ทุก frame โดยเปล่าประโยชน์).
   */
  publish(nowMs: number, build: () => Partial<HudState>): void;
}

/**
 * สร้าง publisher throttled แบบ pure/testable — inject clock ผ่าน `nowMs` ที่ caller ส่งเข้ามาเอง
 * (pattern เดียวกับ interpolation.ts/remote-attack.ts: ไม่ผูกกับ `performance.now()`/`Date.now()` ตรง ๆ
 * ในนี้ ให้เทสต์ deterministic ได้). `writer` override ได้ (เทสต์ inject spy แทนแตะ gameStore singleton จริง).
 */
export function createHudPublisher(
  intervalMs: number,
  writer: (partial: Partial<HudState>) => void = writeToStore,
): HudPublisher {
  let lastPublishMs: number | null = null;
  return {
    publish(nowMs, build): void {
      if (lastPublishMs !== null && nowMs - lastPublishMs < intervalMs) return;
      lastPublishMs = nowMs;
      writer(build());
    },
  };
}
