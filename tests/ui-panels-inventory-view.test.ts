import { describe, expect, test } from "vitest";
import {
  buildBagGrid,
  enhancementLabel,
  findItemByInstanceId,
  INVENTORY_PANEL_ID,
  rejectionReasonLabel,
  resolveInventoryAction,
} from "@/ui/panels/inventory/inventory-view";
import type { InventoryItemView, InventorySnapshot } from "@/shared/net-protocol";

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
  test("อยู่ในกระเป๋า → equip", () => {
    expect(resolveInventoryAction("CHARACTER_INVENTORY")).toBe("equip");
  });

  test("สวมอยู่ → unequip", () => {
    expect(resolveInventoryAction("CHARACTER_EQUIPMENT")).toBe("unequip");
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
