import { describe, expect, test } from "vitest";
import {
  canConfirmShopTx,
  clampQuantity,
  findCatalogEntry,
  formatGold,
  isShopAvailable,
  isShopEntryUnlocked,
  resolveShopTxState,
  SHOP_PANEL_ID,
  shopRejectionReasonLabel,
  shopTxMessage,
  type ShopTxState,
} from "@/ui/panels/shop/shop-view";
import type { ShopCatalogEntry, ShopListMessage, ShopResultMessage } from "@/shared/net-protocol";

const entry = (over: Partial<ShopCatalogEntry> = {}): ShopCatalogEntry => ({
  itemId: "sword_iron",
  buyPrice: 100,
  unlockCondition: "immediate",
  ...over,
});

const list = (over: Partial<ShopListMessage> = {}): ShopListMessage => ({
  shopId: "starter_shop",
  available: true,
  entries: [],
  ...over,
});

const ok = (op: "buy" | "sell", over: Partial<ShopResultMessage> = {}): ShopResultMessage => ({
  op,
  ok: true,
  itemId: "sword_iron",
  quantity: 1,
  gold: 900,
  ...over,
});

const reject = (op: "buy" | "sell", reason: string): ShopResultMessage => ({
  op,
  ok: false,
  itemId: "sword_iron",
  quantity: 0,
  gold: -1,
  reason,
});

describe("SHOP_PANEL_ID", () => {
  test("คงที่ (ใช้เป็น PanelId เดียวทั้งแอป)", () => {
    expect(SHOP_PANEL_ID).toBe("shop");
  });
});

describe("isShopEntryUnlocked", () => {
  test("immediate → ปลดล็อกแล้ว", () => {
    expect(isShopEntryUnlocked(entry({ unlockCondition: "immediate" }))).toBe(true);
  });

  test("เงื่อนไขอื่น (เช่น shop_tutorial_complete) → ล็อกอยู่", () => {
    expect(isShopEntryUnlocked(entry({ unlockCondition: "shop_tutorial_complete" }))).toBe(false);
  });
});

describe("findCatalogEntry", () => {
  test("list = null → null", () => {
    expect(findCatalogEntry(null, "sword_iron")).toBeNull();
  });

  test("หาเจอ → คืน entry", () => {
    const e = entry();
    expect(findCatalogEntry(list({ entries: [e] }), "sword_iron")).toBe(e);
  });

  test("หาไม่เจอ → null", () => {
    expect(findCatalogEntry(list({ entries: [entry()] }), "shield_wood")).toBeNull();
  });
});

describe("isShopAvailable", () => {
  test("list = null → false", () => {
    expect(isShopAvailable(null)).toBe(false);
  });

  test("available: false → false", () => {
    expect(isShopAvailable(list({ available: false }))).toBe(false);
  });

  test("available: true → true", () => {
    expect(isShopAvailable(list({ available: true }))).toBe(true);
  });
});

describe("clampQuantity", () => {
  test("ค่าปกติในช่วง → คงเดิม (floor)", () => {
    expect(clampQuantity(3.7, 1, 10)).toBe(3);
  });

  test("ต่ำกว่า min → min", () => {
    expect(clampQuantity(0, 1, 10)).toBe(1);
    expect(clampQuantity(-5, 1, 10)).toBe(1);
  });

  test("สูงกว่า max → max", () => {
    expect(clampQuantity(999, 1, 10)).toBe(10);
  });

  test("NaN/Infinity → min", () => {
    expect(clampQuantity(NaN, 1, 10)).toBe(1);
    expect(clampQuantity(Infinity, 1, 10)).toBe(1);
  });

  test("max < min (ของหมด/stack เดียว) → คืน min เสมอ", () => {
    expect(clampQuantity(5, 3, 1)).toBe(3);
  });
});

describe("resolveShopTxState", () => {
  test("idle → IDLE", () => {
    expect(resolveShopTxState({ kind: "idle" })).toBe("IDLE");
  });

  test("processing → PROCESSING", () => {
    expect(resolveShopTxState({ kind: "processing", op: "buy", itemId: "sword_iron" })).toBe("PROCESSING");
  });

  test("timed_out → UNKNOWN_RECONCILING", () => {
    expect(resolveShopTxState({ kind: "timed_out", op: "sell", itemId: "sword_iron" })).toBe(
      "UNKNOWN_RECONCILING",
    );
  });

  test("settled ok:true → SUCCESS", () => {
    expect(resolveShopTxState({ kind: "settled", result: ok("buy") })).toBe("SUCCESS");
  });

  test("settled ok:false → REJECTED", () => {
    expect(resolveShopTxState({ kind: "settled", result: reject("buy", "INSUFFICIENT_GOLD") })).toBe(
      "REJECTED",
    );
  });
});

describe("canConfirmShopTx", () => {
  test("กดได้ยกเว้น PROCESSING/UNKNOWN_RECONCILING", () => {
    const allowed: ShopTxState[] = ["IDLE", "SUCCESS", "REJECTED"];
    const blocked: ShopTxState[] = ["PROCESSING", "UNKNOWN_RECONCILING"];
    for (const s of allowed) expect(canConfirmShopTx(s)).toBe(true);
    for (const s of blocked) expect(canConfirmShopTx(s)).toBe(false);
  });
});

describe("shopRejectionReasonLabel", () => {
  test.each([
    ["SHOP_ITEM_NOT_FOUND"],
    ["SHOP_LOCKED"],
    ["INSUFFICIENT_GOLD"],
    ["INVENTORY_FULL"],
    ["ITEM_UNSELLABLE"],
    ["ITEM_EQUIPPED"],
    ["TRANSACTION_CONFLICT"],
  ])("%s → มีข้อความไทยไม่ว่าง", (reason) => {
    expect(shopRejectionReasonLabel(reason)).not.toBe("");
  });

  test("reason แปลกที่ไม่รู้จัก → fallback ทั่วไป", () => {
    expect(shopRejectionReasonLabel("something_new")).toBe("ทำรายการไม่สำเร็จ");
  });
});

describe("shopTxMessage", () => {
  test("IDLE → ว่าง", () => {
    expect(shopTxMessage("IDLE", null)).toBe("");
  });

  test("SUCCESS buy vs sell → ข้อความต่างกัน", () => {
    expect(shopTxMessage("SUCCESS", ok("buy"))).toBe("ซื้อสำเร็จ");
    expect(shopTxMessage("SUCCESS", ok("sell"))).toBe("ขายสำเร็จ");
  });

  test("REJECTED → ใช้ shopRejectionReasonLabel ของ reason", () => {
    expect(shopTxMessage("REJECTED", reject("buy", "INSUFFICIENT_GOLD"))).toBe(
      shopRejectionReasonLabel("INSUFFICIENT_GOLD"),
    );
  });

  test("UNKNOWN_RECONCILING → ข้อความ resync", () => {
    expect(shopTxMessage("UNKNOWN_RECONCILING", null)).toContain("ซิงก์");
  });
});

describe("formatGold", () => {
  test("null → em dash", () => {
    expect(formatGold(null)).toBe("—");
  });

  test("0 → \"0\" (ไม่ใช่ falsy fallback)", () => {
    expect(formatGold(0)).toBe("0");
  });

  test("จำนวนปกติ", () => {
    expect(formatGold(1234)).toBe("1234");
  });
});

