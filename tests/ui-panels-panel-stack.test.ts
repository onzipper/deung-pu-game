import { describe, expect, test } from "vitest";
import {
  INITIAL_PANEL_STACK_STATE,
  PANEL_BASE_Z_INDEX,
  closeAllPanels,
  closePanel,
  closeTopPanel,
  isPanelOpen,
  openPanel,
  panelStackReducer,
  topPanelId,
  zIndexOf,
  type PanelStackState,
} from "@/ui/panels/panel-stack";

describe("panel-stack — openPanel/closePanel (pure)", () => {
  test("เปิด panel ใหม่ → push ท้าย order", () => {
    const s1 = openPanel(INITIAL_PANEL_STACK_STATE, "inventory");
    expect(s1.order).toEqual(["inventory"]);
    const s2 = openPanel(s1, "shop");
    expect(s2.order).toEqual(["inventory", "shop"]);
  });

  test("เปิด panel ที่เปิดอยู่แล้ว → ยกขึ้นบนสุดแทนที่จะ push ซ้ำ", () => {
    const s1 = openPanel(openPanel(INITIAL_PANEL_STACK_STATE, "inventory"), "shop");
    const s2 = openPanel(s1, "inventory");
    expect(s2.order).toEqual(["shop", "inventory"]);
  });

  test("ปิด panel ที่เปิดอยู่ → ตัดออกจาก order", () => {
    const s1 = openPanel(openPanel(INITIAL_PANEL_STACK_STATE, "inventory"), "shop");
    const s2 = closePanel(s1, "inventory");
    expect(s2.order).toEqual(["shop"]);
  });

  test("ปิด panel ที่ไม่ได้เปิดอยู่ → no-op คืน state เดิม (reference เท่ากัน)", () => {
    const s1 = openPanel(INITIAL_PANEL_STACK_STATE, "inventory");
    const s2 = closePanel(s1, "shop");
    expect(s2).toBe(s1);
  });

  test("closeTopPanel ปิดตัวบนสุด (ตัวสุดท้ายใน order) เท่านั้น", () => {
    const s1 = openPanel(openPanel(INITIAL_PANEL_STACK_STATE, "inventory"), "shop");
    const s2 = closeTopPanel(s1);
    expect(s2.order).toEqual(["inventory"]);
  });

  test("closeTopPanel บน state ว่าง → no-op", () => {
    expect(closeTopPanel(INITIAL_PANEL_STACK_STATE)).toBe(INITIAL_PANEL_STACK_STATE);
  });

  test("closeAllPanels → กลับเป็น initial state เสมอ", () => {
    const s1 = openPanel(openPanel(INITIAL_PANEL_STACK_STATE, "inventory"), "shop");
    expect(closeAllPanels()).toEqual(INITIAL_PANEL_STACK_STATE);
    expect(s1.order).toEqual(["inventory", "shop"]); // ไม่ mutate ของเดิม
  });

  test("state เดิมไม่ถูก mutate (pure)", () => {
    const start: PanelStackState = { order: ["inventory"] };
    const next = openPanel(start, "shop");
    expect(start.order).toEqual(["inventory"]);
    expect(next).not.toBe(start);
  });
});

describe("panel-stack — isPanelOpen / topPanelId / zIndexOf", () => {
  test("isPanelOpen สะท้อน order ปัจจุบัน", () => {
    const s = openPanel(INITIAL_PANEL_STACK_STATE, "inventory");
    expect(isPanelOpen(s, "inventory")).toBe(true);
    expect(isPanelOpen(s, "shop")).toBe(false);
  });

  test("topPanelId คืน panel บนสุด, null เมื่อไม่มี panel เปิดเลย", () => {
    expect(topPanelId(INITIAL_PANEL_STACK_STATE)).toBeNull();
    const s = openPanel(openPanel(INITIAL_PANEL_STACK_STATE, "inventory"), "shop");
    expect(topPanelId(s)).toBe("shop");
  });

  test("zIndexOf ไล่ตาม PANEL_BASE_Z_INDEX + ตำแหน่งใน order, null ถ้าปิดอยู่", () => {
    const s = openPanel(openPanel(INITIAL_PANEL_STACK_STATE, "inventory"), "shop");
    expect(zIndexOf(s, "inventory")).toBe(PANEL_BASE_Z_INDEX);
    expect(zIndexOf(s, "shop")).toBe(PANEL_BASE_Z_INDEX + 1);
    expect(zIndexOf(s, "help")).toBeNull();
  });
});

describe("panel-stack — panelStackReducer (ใช้ตรงกับ useReducer)", () => {
  test("OPEN/CLOSE/CLOSE_TOP/CLOSE_ALL ให้ผลตรงกับฟังก์ชัน pure ที่สอดคล้องกัน", () => {
    let s = panelStackReducer(INITIAL_PANEL_STACK_STATE, { type: "OPEN", id: "inventory" });
    s = panelStackReducer(s, { type: "OPEN", id: "shop" });
    expect(s.order).toEqual(["inventory", "shop"]);

    s = panelStackReducer(s, { type: "CLOSE_TOP" });
    expect(s.order).toEqual(["inventory"]);

    s = panelStackReducer(s, { type: "OPEN", id: "shop" });
    s = panelStackReducer(s, { type: "CLOSE", id: "inventory" });
    expect(s.order).toEqual(["shop"]);

    s = panelStackReducer(s, { type: "CLOSE_ALL" });
    expect(s).toEqual(INITIAL_PANEL_STACK_STATE);
  });
});
