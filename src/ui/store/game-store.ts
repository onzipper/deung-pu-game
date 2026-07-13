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
import {
  GOLD_UNKNOWN,
  type DeliveryResultMessage,
  type DeliveryStateMessage,
  type EnhanceResultMessage,
  type InventoryOpRejectedMessage,
  type InventorySnapshot,
  type PlayerProgressMessage,
  type ShopListMessage,
  type ShopResultMessage,
  type StorageResultMessage,
  type StorageStateMessage,
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
  /**
   * catalog ร้านบน map ปัจจุบัน (P2-11, MSG_SHOP_LIST) — null ก่อนขอ/ก่อนได้ผลครั้งแรก. `available: false`
   * = map นี้ไม่มีร้าน (HUD ปุ่ม "ร้านค้า" อ่านค่านี้). ขอใหม่ทุกครั้งที่ join/ข้าม map (engine glue).
   */
  shopList: ShopListMessage | null;
  /** ผลซื้อ/ขายล่าสุด (P2-11, MSG_SHOP_RESULT) — null = ยังไม่เคยทำรายการใน session นี้. */
  shopResult: ShopResultMessage | null;
  /**
   * ยอด gold ล่าสุดที่รู้ (P2-09/P2-11) — มาจาก MSG_PLAYER_PROGRESS (หลังฆ่ามอน) หรือ MSG_SHOP_RESULT
   * (หลังซื้อ/ขาย) แล้วแต่อันไหนมาถึงหลังสุด, ข้าม GOLD_UNKNOWN (-1) เสมอ (ไม่ทับด้วยค่าที่อ่านไม่ได้).
   * null = ยังไม่เคยรู้ยอดเลยใน session นี้ (แสดง "—").
   */
  gold: number | null;
  /**
   * level ตัวละครล่าสุดที่รู้ (P2-12, มาจาก MSG_PLAYER_PROGRESS.level เหมือน gold) — ใช้เป็น input ของ
   * guidance rule engine (DG §7.2 "Player Identity - level"). null = ยังไม่เคยรู้ใน session นี้.
   */
  playerLevel: number | null;
  /**
   * เวลา (ms, wall-clock จาก client) ล่าสุดที่ MSG_PLAYER_PROGRESS มาถึง (P2-12) — message นี้มาถึง
   * "หลังฆ่ามอนที่มีสิทธิ์" เท่านั้น (net-protocol.ts comment) จึงใช้เป็นสัญญาณ "ฆ่ามอนแล้วอย่างน้อย 1 ตัว"
   * สำหรับ tutorial checklist (DG lite) โดยไม่ต้องเพิ่ม message ใหม่. null = ยังไม่เคยเกิดใน session นี้.
   */
  lastKillAtMs: number | null;
  /**
   * snapshot คลังบัญชีล่าสุด (P2-17, MSG_STORAGE_STATE) — null ก่อนขอ/ก่อนได้ผลครั้งแรก. `available: false`
   * = map นี้ไม่มี storage NPC (HUD ปุ่ม "คลัง" อ่านค่านี้, pattern เดียวกับ shopList). ขอใหม่ทุกครั้งที่
   * join/ข้าม map (engine glue, เหมือน sendShopListRequest).
   */
  storageState: StorageStateMessage | null;
  /** ผลฝาก/ถอนล่าสุด (P2-17, MSG_STORAGE_RESULT) — null = ยังไม่เคยทำรายการใน session นี้. */
  storageResult: StorageResultMessage | null;
  /** snapshot กล่องส่งของล่าสุด (P2-17, MSG_DELIVERY_STATE) — null ก่อนขอ/ก่อนได้ผลครั้งแรก. */
  deliveryState: DeliveryStateMessage | null;
  /** ผลรับของล่าสุด (P2-17, MSG_DELIVERY_CLAIM) — null = ยังไม่เคย claim ใน session นี้. */
  deliveryResult: DeliveryResultMessage | null;
}

export const INITIAL_HUD_STATE: HudState = {
  debugInfo: null,
  inventory: null,
  inventoryRejection: null,
  enhanceResult: null,
  shopList: null,
  shopResult: null,
  gold: null,
  playerLevel: null,
  lastKillAtMs: null,
  storageState: null,
  storageResult: null,
  deliveryState: null,
  deliveryResult: null,
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

/** P2-11: engine เรียกทันทีที่ MSG_SHOP_LIST มาถึง (event-driven เหมือน setInventoryState) */
export function setShopList(list: ShopListMessage): void {
  gameStore.setState({ shopList: list });
}

/**
 * P2-11: engine เรียกทันทีที่ MSG_SHOP_RESULT มาถึง — อัปเดต `gold` ไปด้วยในตัว (ข้าม GOLD_UNKNOWN)
 * เพราะ shop result เป็นแหล่งยอด gold authoritative ที่สุดหลังทำรายการ.
 */
export function setShopResult(result: ShopResultMessage): void {
  const patch: Partial<HudState> = { shopResult: result };
  if (result.gold !== GOLD_UNKNOWN) patch.gold = result.gold;
  gameStore.setState(patch);
}

/**
 * P2-09/P2-11/P2-12: engine เรียกทันทีที่ MSG_PLAYER_PROGRESS มาถึง — อัปเดต `gold` (ข้าม GOLD_UNKNOWN),
 * `playerLevel` (มีค่าเสมอ ไม่มี sentinel), และ `lastKillAtMs` (สัญญาณ "ฆ่ามอนแล้ว" ของ tutorial checklist,
 * P2-12 — message นี้มาถึงเฉพาะหลังฆ่ามอนที่มีสิทธิ์เท่านั้น). `nowMs` inject ได้เพื่อเทสต์ deterministic
 * (pattern เดียวกับ createHudPublisher) — default `Date.now()` ตอนเรียกจริงจาก engine glue.
 */
export function setGoldFromProgress(progress: PlayerProgressMessage, nowMs: number = Date.now()): void {
  const patch: Partial<HudState> = { playerLevel: progress.level, lastKillAtMs: nowMs };
  if (progress.gold !== GOLD_UNKNOWN) patch.gold = progress.gold;
  gameStore.setState(patch);
}

/** typed selector — catalog ร้านล่าสุด (P2-11) */
export const selectShopList = (state: HudState): ShopListMessage | null => state.shopList;

/** typed selector — ผลซื้อ/ขายล่าสุด (P2-11) */
export const selectShopResult = (state: HudState): ShopResultMessage | null => state.shopResult;

/** typed selector — ยอด gold ล่าสุดที่รู้ (P2-09/P2-11) */
export const selectGold = (state: HudState): number | null => state.gold;

/** typed selector — level ตัวละครล่าสุดที่รู้ (P2-12) */
export const selectPlayerLevel = (state: HudState): number | null => state.playerLevel;

/** typed selector — เวลาฆ่ามอนล่าสุด (P2-12, tutorial checklist signal) */
export const selectLastKillAtMs = (state: HudState): number | null => state.lastKillAtMs;

/** P2-17: engine เรียกทันทีที่ MSG_STORAGE_STATE มาถึง (event-driven เหมือน setShopList) */
export function setStorageState(snapshot: StorageStateMessage): void {
  gameStore.setState({ storageState: snapshot });
}

/** P2-17: engine เรียกทันทีที่ MSG_STORAGE_RESULT มาถึง (event-driven เหมือน setInventoryRejection) */
export function setStorageResult(result: StorageResultMessage): void {
  gameStore.setState({ storageResult: result });
}

/** P2-17: engine เรียกทันทีที่ MSG_DELIVERY_STATE มาถึง (event-driven เหมือน setShopList) */
export function setDeliveryState(snapshot: DeliveryStateMessage): void {
  gameStore.setState({ deliveryState: snapshot });
}

/** P2-17: engine เรียกทันทีที่ MSG_DELIVERY_RESULT มาถึง (event-driven เหมือน setInventoryRejection) */
export function setDeliveryResult(result: DeliveryResultMessage): void {
  gameStore.setState({ deliveryResult: result });
}

/** typed selector — snapshot คลังบัญชีล่าสุด (P2-17) */
export const selectStorageState = (state: HudState): StorageStateMessage | null => state.storageState;

/** typed selector — ผลฝาก/ถอนล่าสุด (P2-17) */
export const selectStorageResult = (state: HudState): StorageResultMessage | null => state.storageResult;

/** typed selector — snapshot กล่องส่งของล่าสุด (P2-17) */
export const selectDeliveryState = (state: HudState): DeliveryStateMessage | null => state.deliveryState;

/** typed selector — ผลรับของล่าสุด (P2-17) */
export const selectDeliveryResult = (state: HudState): DeliveryResultMessage | null => state.deliveryResult;

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
