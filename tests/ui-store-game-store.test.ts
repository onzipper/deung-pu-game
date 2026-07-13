import { describe, expect, test, vi } from "vitest";
import {
  createHudPublisher,
  gameStore,
  INITIAL_HUD_STATE,
  resetHudState,
  selectDebugInfo,
  selectGold,
  selectInventory,
  selectInventoryRejection,
  selectShopList,
  selectShopResult,
  setGoldFromProgress,
  setInventoryRejection,
  setInventoryState,
  setShopList,
  setShopResult,
  type HudState,
} from "@/ui/store/game-store";
import { IDLE_NET_DEBUG_INFO, type EngineDebugInfo } from "@/engine/runtime/debug-info";
import type {
  InventoryOpRejectedMessage,
  InventorySnapshot,
  PlayerProgressMessage,
  ShopListMessage,
  ShopResultMessage,
} from "@/shared/net-protocol";

// P2-01: Zustand bridge — game loop (engine) → publish (throttled) → store → React subscribe (docs/context/ui.md).
// เทสต์นี้ pure ล้วน: ไม่ render React/pixi — publisher inject writer เอง (ไม่แตะ gameStore singleton จริง
// ยกเว้น describe บล็อกสุดท้ายที่ตั้งใจเช็ค singleton โดยเฉพาะ + resetHudState คืนสภาพก่อนออกทุกครั้ง).

const INFO_A: EngineDebugInfo = {
  fps: 60,
  playerTile: { tx: 1, ty: 2 },
  pointerTile: null,
  entityCount: 3,
  net: IDLE_NET_DEBUG_INFO,
};

const INFO_B: EngineDebugInfo = {
  fps: 30,
  playerTile: { tx: 5, ty: 5 },
  pointerTile: { tx: 5, ty: 5 },
  entityCount: 7,
  net: IDLE_NET_DEBUG_INFO,
};

describe("selectDebugInfo", () => {
  test("อ่าน field debugInfo ตรง ๆ", () => {
    const state: HudState = { ...INITIAL_HUD_STATE, debugInfo: INFO_A };
    expect(selectDebugInfo(state)).toBe(INFO_A);
  });

  test("null เมื่อยังไม่ publish", () => {
    expect(selectDebugInfo(INITIAL_HUD_STATE)).toBeNull();
  });
});

describe("createHudPublisher — throttle (pure, clock inject)", () => {
  test("publish ครั้งแรกเสมอ (lastPublishMs ยังไม่มี)", () => {
    const writer = vi.fn();
    const publisher = createHudPublisher(250, writer);
    publisher.publish(0, () => ({ debugInfo: INFO_A }));
    expect(writer).toHaveBeenCalledTimes(1);
    expect(writer).toHaveBeenCalledWith({ debugInfo: INFO_A });
  });

  test("publish ถี่กว่า interval → ถูก drop (ไม่เรียก writer/build)", () => {
    const writer = vi.fn();
    const build = vi.fn(() => ({ debugInfo: INFO_B }));
    const publisher = createHudPublisher(250, writer);
    publisher.publish(0, () => ({ debugInfo: INFO_A }));
    publisher.publish(100, build); // ยังไม่ถึง 250ms นับจากครั้งก่อน
    publisher.publish(249, build);
    expect(writer).toHaveBeenCalledTimes(1);
    expect(build).not.toHaveBeenCalled(); // thunk ต้องไม่ถูกเรียกเลยตอนโดน drop (กัน alloc เปล่าประโยชน์)
  });

  test("publish ถึงคิว interval → ผ่านอีกครั้ง", () => {
    const writer = vi.fn();
    const publisher = createHudPublisher(250, writer);
    publisher.publish(0, () => ({ debugInfo: INFO_A }));
    publisher.publish(250, () => ({ debugInfo: INFO_B })); // ครบพอดี = due
    expect(writer).toHaveBeenCalledTimes(2);
    expect(writer).toHaveBeenLastCalledWith({ debugInfo: INFO_B });
  });

  test("ไม่มี default writer แตะ gameStore singleton โดยไม่ตั้งใจ — inject writer ต้องถูกใช้แทนเสมอ", () => {
    const writer = vi.fn();
    const publisher = createHudPublisher(0, writer);
    publisher.publish(0, () => ({ debugInfo: INFO_A }));
    expect(gameStore.getState().debugInfo).toBeNull(); // singleton ไม่ถูกแตะ
    resetHudState();
  });
});

describe("gameStore singleton — default writer เขียนจริง", () => {
  test("publisher ไม่ inject writer → เขียนลง gameStore singleton", () => {
    resetHudState();
    const publisher = createHudPublisher(0);
    publisher.publish(0, () => ({ debugInfo: INFO_A }));
    expect(gameStore.getState().debugInfo).toEqual(INFO_A);
    resetHudState();
    expect(gameStore.getState()).toEqual(INITIAL_HUD_STATE);
  });
});

// P2-07: inventory slice — event-driven (ไม่ throttle, ต่างจาก debugInfo) ดู comment ที่ game-store.ts
const SNAPSHOT_A: InventorySnapshot = {
  capacity: 40,
  bag: [
    {
      instanceId: "i1",
      itemId: "sword_iron",
      location: "CHARACTER_INVENTORY",
      slot: 0,
      quantity: 1,
      enhancementLevel: 0,
      version: 1,
    },
  ],
  equipment: [],
};

const REJECTION_A: InventoryOpRejectedMessage = { op: "equip", reason: "inventory_full" };

describe("selectInventory / selectInventoryRejection", () => {
  test("null ก่อนมี snapshot/rejection", () => {
    expect(selectInventory(INITIAL_HUD_STATE)).toBeNull();
    expect(selectInventoryRejection(INITIAL_HUD_STATE)).toBeNull();
  });

  test("อ่าน field ตรง ๆ", () => {
    const state: HudState = { ...INITIAL_HUD_STATE, inventory: SNAPSHOT_A, inventoryRejection: REJECTION_A };
    expect(selectInventory(state)).toBe(SNAPSHOT_A);
    expect(selectInventoryRejection(state)).toBe(REJECTION_A);
  });
});

describe("setInventoryState / setInventoryRejection — เขียน gameStore singleton ทันที (ไม่ throttle)", () => {
  test("setInventoryState เขียนค่าใหม่ทันที", () => {
    resetHudState();
    setInventoryState(SNAPSHOT_A);
    expect(gameStore.getState().inventory).toEqual(SNAPSHOT_A);
    resetHudState();
  });

  test("setInventoryRejection เขียนค่าใหม่ทันที ไม่แตะ inventory เดิม", () => {
    resetHudState();
    setInventoryState(SNAPSHOT_A);
    setInventoryRejection(REJECTION_A);
    expect(gameStore.getState().inventoryRejection).toEqual(REJECTION_A);
    expect(gameStore.getState().inventory).toEqual(SNAPSHOT_A);
    resetHudState();
    expect(gameStore.getState()).toEqual(INITIAL_HUD_STATE);
  });
});

// P2-11: shop slice — event-driven เหมือน inventory/enhance (ดู comment ที่ game-store.ts)
const SHOP_LIST_A: ShopListMessage = {
  shopId: "starter_shop",
  available: true,
  entries: [{ itemId: "sword_iron", buyPrice: 100, unlockCondition: "immediate" }],
};

const SHOP_RESULT_BUY_OK: ShopResultMessage = {
  op: "buy",
  ok: true,
  itemId: "sword_iron",
  quantity: 1,
  gold: 900,
};

const SHOP_RESULT_REJECT: ShopResultMessage = {
  op: "sell",
  ok: false,
  itemId: "sword_iron",
  quantity: 0,
  gold: -1, // GOLD_UNKNOWN
  reason: "TRANSACTION_CONFLICT",
};

const PROGRESS_A: PlayerProgressMessage = {
  level: 2,
  exp: 100,
  expFloor: 0,
  expCeil: 200,
  gold: 500,
  leveledUp: false,
  loot: [],
  lootOverflow: [],
};

describe("selectShopList / selectShopResult / selectGold", () => {
  test("null ก่อนมี list/result/gold", () => {
    expect(selectShopList(INITIAL_HUD_STATE)).toBeNull();
    expect(selectShopResult(INITIAL_HUD_STATE)).toBeNull();
    expect(selectGold(INITIAL_HUD_STATE)).toBeNull();
  });
});

describe("setShopList — เขียน gameStore singleton ทันที (ไม่ throttle)", () => {
  test("เขียนค่าใหม่ทันที", () => {
    resetHudState();
    setShopList(SHOP_LIST_A);
    expect(gameStore.getState().shopList).toEqual(SHOP_LIST_A);
    resetHudState();
  });
});

describe("setShopResult", () => {
  test("gold ที่ถูกต้อง (≠ GOLD_UNKNOWN) → อัปเดต gold ไปด้วยในตัว", () => {
    resetHudState();
    setShopResult(SHOP_RESULT_BUY_OK);
    expect(gameStore.getState().shopResult).toEqual(SHOP_RESULT_BUY_OK);
    expect(gameStore.getState().gold).toBe(900);
    resetHudState();
  });

  test("GOLD_UNKNOWN (-1, ตอน reject) → shopResult อัปเดต แต่ gold เดิมไม่ถูกทับ", () => {
    resetHudState();
    setShopResult(SHOP_RESULT_BUY_OK); // gold = 900 ก่อน
    setShopResult(SHOP_RESULT_REJECT); // gold = -1 (GOLD_UNKNOWN)
    expect(gameStore.getState().shopResult).toEqual(SHOP_RESULT_REJECT);
    expect(gameStore.getState().gold).toBe(900); // ไม่ถูกทับด้วย -1
    resetHudState();
  });
});

describe("setGoldFromProgress", () => {
  test("gold ที่ถูกต้อง → อัปเดต gold", () => {
    resetHudState();
    setGoldFromProgress(PROGRESS_A);
    expect(gameStore.getState().gold).toBe(500);
    resetHudState();
  });

  test("GOLD_UNKNOWN → ไม่แตะ gold เดิมเลย", () => {
    resetHudState();
    setGoldFromProgress(PROGRESS_A); // gold = 500
    setGoldFromProgress({ ...PROGRESS_A, gold: -1 });
    expect(gameStore.getState().gold).toBe(500);
    resetHudState();
    expect(gameStore.getState()).toEqual(INITIAL_HUD_STATE);
  });
});
