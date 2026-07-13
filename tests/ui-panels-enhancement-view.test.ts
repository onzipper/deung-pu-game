import { describe, expect, test } from "vitest";
import {
  canConfirmEnhance,
  countReinforcementMaterial,
  ENHANCEMENT_PANEL_ID,
  enhanceStateMessage,
  enhancementTransitionLabel,
  REINFORCEMENT_MATERIAL_ID,
  resolveEnhanceUiState,
  type EnhancePhase,
  type EnhanceUiState,
} from "@/ui/panels/enhancement/enhancement-view";
import type { EnhanceResultMessage, InventoryItemView, InventorySnapshot } from "@/shared/net-protocol";

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

const ok = (level: number): EnhanceResultMessage => ({
  ok: true,
  instanceId: "i1",
  level,
});

const reject = (reason: string): EnhanceResultMessage => ({
  ok: false,
  instanceId: "i1",
  level: -1,
  reason,
});

describe("ENHANCEMENT_PANEL_ID", () => {
  test("คงที่ (ใช้เป็น PanelId เดียวทั้งแอป)", () => {
    expect(ENHANCEMENT_PANEL_ID).toBe("enhancement");
  });
});

describe("REINFORCEMENT_MATERIAL_ID", () => {
  test("ตรง materialId ตาม rename R10", () => {
    expect(REINFORCEMENT_MATERIAL_ID).toBe("upg_reinforcement");
  });
});

describe("resolveEnhanceUiState", () => {
  const idle: EnhancePhase = { kind: "idle" };
  const processing: EnhancePhase = { kind: "processing" };
  const timedOut: EnhancePhase = { kind: "timed_out" };

  test("ไม่มี target + idle → NO_ITEM", () => {
    expect(resolveEnhanceUiState(false, idle)).toBe("NO_ITEM");
  });

  test("มี target + idle → READY", () => {
    expect(resolveEnhanceUiState(true, idle)).toBe("READY");
  });

  test("processing → PROCESSING เสมอ ไม่ว่ามี target หรือไม่", () => {
    expect(resolveEnhanceUiState(true, processing)).toBe("PROCESSING");
    expect(resolveEnhanceUiState(false, processing)).toBe("PROCESSING");
  });

  test("timed_out → UNKNOWN_RECONCILING", () => {
    expect(resolveEnhanceUiState(true, timedOut)).toBe("UNKNOWN_RECONCILING");
  });

  test("settled ok:true → SUCCESS", () => {
    expect(resolveEnhanceUiState(true, { kind: "settled", result: ok(3) })).toBe("SUCCESS");
  });

  test.each([
    ["NO_REINFORCEMENT", "NO_REINFORCEMENT"],
    ["MAX_LEVEL", "MAX_LEVEL"],
    ["ITEM_LOCKED", "ITEM_LOCKED"],
    ["NO_ITEM", "NO_ITEM"],
    ["something_new_unmapped", "NO_ITEM"], // reason แปลกที่ไม่รู้จัก → fallback NO_ITEM
  ])("settled ok:false reason=%s → %s", (reason, expected) => {
    expect(resolveEnhanceUiState(true, { kind: "settled", result: reject(reason) })).toBe(
      expected as EnhanceUiState,
    );
  });
});

describe("canConfirmEnhance", () => {
  test("กดได้เฉพาะ READY", () => {
    expect(canConfirmEnhance("READY")).toBe(true);
    const others: EnhanceUiState[] = [
      "NO_ITEM",
      "PROCESSING",
      "SUCCESS",
      "NO_REINFORCEMENT",
      "MAX_LEVEL",
      "ITEM_LOCKED",
      "UNKNOWN_RECONCILING",
    ];
    for (const s of others) expect(canConfirmEnhance(s)).toBe(false);
  });
});

describe("enhanceStateMessage", () => {
  test("NO_REINFORCEMENT ต้องเป็น hint copy บังคับ R8 verbatim", () => {
    expect(enhanceStateMessage("NO_REINFORCEMENT")).toBe("ของหายากมากับบอส");
  });

  test("ทุก state มีข้อความไม่ว่าง", () => {
    const states: EnhanceUiState[] = [
      "NO_ITEM",
      "READY",
      "PROCESSING",
      "SUCCESS",
      "NO_REINFORCEMENT",
      "MAX_LEVEL",
      "ITEM_LOCKED",
      "UNKNOWN_RECONCILING",
    ];
    for (const s of states) expect(enhanceStateMessage(s)).not.toBe("");
  });
});

describe("enhancementTransitionLabel", () => {
  test("โชว์ทั้งสองข้างเสมอ แม้ level 0 (ต่างจาก enhancementLabel ที่ซ่อน +0)", () => {
    expect(enhancementTransitionLabel(0)).toBe("+0 → +1");
  });

  test("+2 → +3", () => {
    expect(enhancementTransitionLabel(2)).toBe("+2 → +3");
  });

  test("+14 → +15 (ขอบ cap)", () => {
    expect(enhancementTransitionLabel(14)).toBe("+14 → +15");
  });
});

describe("countReinforcementMaterial", () => {
  test("snapshot null → 0", () => {
    expect(countReinforcementMaterial(null)).toBe(0);
  });

  test("ไม่มีวัสดุในกระเป๋า → 0", () => {
    expect(countReinforcementMaterial(snapshot({ bag: [bagItem()] }))).toBe(0);
  });

  test("รวมทุก stack ของ materialId", () => {
    const s = snapshot({
      bag: [
        bagItem({ instanceId: "m1", itemId: "upg_reinforcement", quantity: 3, slot: 0 }),
        bagItem({ instanceId: "m2", itemId: "upg_reinforcement", quantity: 2, slot: 1 }),
        bagItem({ instanceId: "sw", itemId: "sword_iron", slot: 2 }),
      ],
    });
    expect(countReinforcementMaterial(s)).toBe(5);
  });

  test("materialId override เอง (custom id) ใช้ได้", () => {
    const s = snapshot({ bag: [bagItem({ itemId: "frag_x", quantity: 9, slot: 0 })] });
    expect(countReinforcementMaterial(s, "frag_x")).toBe(9);
  });
});
