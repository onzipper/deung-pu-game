import { describe, expect, test } from "vitest";
import {
  buildBagGrid,
  enhancementLabel,
  findItemByInstanceId,
  INVENTORY_PANEL_ID,
  itemUseResultLabel,
  rejectionReasonLabel,
  resolveInventoryAction,
} from "@/ui/panels/inventory/inventory-view";
import type { InventoryItemView, InventorySnapshot, UseItemResultMessage } from "@/shared/net-protocol";

const bagItem = (over: Partial<InventoryItemView> = {}): InventoryItemView => ({
  instanceId: "i1",
  itemId: "sword_iron",
  location: "CHARACTER_INVENTORY",
  slot: 0,
  quantity: 1,
  enhancementLevel: 0,
  version: 1,
  ...over,
});

const snapshot = (over: Partial<InventorySnapshot> = {}): InventorySnapshot => ({
  capacity: 4,
  bag: [],
  equipment: [],
  ...over,
});

describe("INVENTORY_PANEL_ID", () => {
  test("คงที่ (ใช้เป็น PanelId เดียวทั้งแอป)", () => {
    expect(INVENTORY_PANEL_ID).toBe("inventory");
  });
});

describe("buildBagGrid", () => {
  test("จัด item ลง index ตรงกับ slot ที่เหลือเป็น null", () => {
    const s = snapshot({
      bag: [bagItem({ instanceId: "a", slot: 2 }), bagItem({ instanceId: "b", slot: 0 })],
    });
    const grid = buildBagGrid(s);
    expect(grid).toHaveLength(4);
    expect(grid[0]?.instanceId).toBe("b");
    expect(grid[1]).toBeNull();
    expect(grid[2]?.instanceId).toBe("a");
    expect(grid[3]).toBeNull();
  });

  test("item slot นอกช่วง [0, capacity) ถูกข้ามเงียบ ๆ (defensive)", () => {
    const s = snapshot({ capacity: 2, bag: [bagItem({ instanceId: "bad", slot: 9 })] });
    const grid = buildBagGrid(s);
    expect(grid).toEqual([null, null]);
  });

  test("capacity 0 → grid ว่าง", () => {
    expect(buildBagGrid(snapshot({ capacity: 0 }))).toEqual([]);
  });
});

describe("enhancementLabel", () => {
  test("0 = ไม่แสดง (สตริงว่าง)", () => {
    expect(enhancementLabel(0)).toBe("");
  });

  test(">0 = '+N'", () => {
    expect(enhancementLabel(5)).toBe("+5");
    expect(enhancementLabel(15)).toBe("+15");
  });
});

describe("resolveInventoryAction", () => {
  test("อยู่ในกระเป๋า (ไม่ใช่ consumable ที่รู้จัก) → equip", () => {
    expect(resolveInventoryAction(bagItem())).toBe("equip");
  });

  test("สวมอยู่ → unequip (แม้ itemId จะเป็น consumable ก็ตาม — location มาก่อน)", () => {
    expect(
      resolveInventoryAction(bagItem({ location: "CHARACTER_EQUIPMENT", itemId: "con_small_potion" })),
    ).toBe("unequip");
  });

  test("PR5: potion อยู่ในกระเป๋า → use", () => {
    expect(resolveInventoryAction(bagItem({ itemId: "con_small_potion" }))).toBe("use");
  });
});

describe("findItemByInstanceId", () => {
  test("เจอใน bag", () => {
    const s = snapshot({ bag: [bagItem({ instanceId: "a" })] });
    expect(findItemByInstanceId(s, "a")?.instanceId).toBe("a");
  });

  test("เจอใน equipment", () => {
    const s = snapshot({
      equipment: [bagItem({ instanceId: "eq1", location: "CHARACTER_EQUIPMENT", slot: 0 })],
    });
    expect(findItemByInstanceId(s, "eq1")?.location).toBe("CHARACTER_EQUIPMENT");
  });

  test("ไม่เจอ → null", () => {
    expect(findItemByInstanceId(snapshot(), "ghost")).toBeNull();
  });
});

describe("rejectionReasonLabel", () => {
  test("ครบทุก reason ที่ protocol กำหนด (ดู net-protocol.ts InventoryOpRejectedMessage)", () => {
    const reasons = [
      "unknown_item",
      "not_equippable",
      "not_equipped",
      "inventory_full",
      "invalid_slot",
      "unique_conflict",
      "version_conflict",
    ];
    for (const reason of reasons) {
      expect(rejectionReasonLabel(reason)).not.toBe("ทำรายการไม่สำเร็จ");
    }
  });

  test("reason แปลกที่ไม่รู้จัก → fallback", () => {
    expect(rejectionReasonLabel("something_new")).toBe("ทำรายการไม่สำเร็จ");
  });
});

describe("itemUseResultLabel (PR5)", () => {
  const buildUseItemResult = (over: Partial<UseItemResultMessage> = {}): UseItemResultMessage => ({
    ok: false,
    ...over,
  });

  test("ok:true → ข้อความสำเร็จ", () => {
    expect(
      itemUseResultLabel(buildUseItemResult({ ok: true, itemId: "con_small_potion", hp: 80 })),
    ).not.toBeNull();
  });

  test("ครบทุก reason ที่ protocol กำหนด (UseConsumableReject, ดู net-protocol.ts) ยกเว้น version_conflict", () => {
    const reasons = ["unknown_item", "no_effect", "on_cooldown", "hp_already_full", "no_stock"];
    for (const reason of reasons) {
      expect(itemUseResultLabel(buildUseItemResult({ reason }))).not.toBeNull();
    }
  });

  test("version_conflict → null (เงียบ ๆ, resync มาเองจาก server)", () => {
    expect(itemUseResultLabel(buildUseItemResult({ reason: "version_conflict" }))).toBeNull();
  });

  test("reason แปลกที่ไม่รู้จัก → fallback (ไม่ใช่ null)", () => {
    expect(itemUseResultLabel(buildUseItemResult({ reason: "something_new" }))).toBe("ทำรายการไม่สำเร็จ");
  });
});
