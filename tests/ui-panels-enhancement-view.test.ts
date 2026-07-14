import { describe, expect, test } from "vitest";
import {
  canConfirmEnhance,
  canExchangeFragments,
  countFragmentMaterial,
  countReinforcementMaterial,
  ENHANCEMENT_PANEL_ID,
  enhanceStateMessage,
  enhancementTransitionLabel,
  findFragmentStack,
  fragmentExchangeMessage,
  FRAGMENT_MATERIAL_ID,
  REINFORCEMENT_MATERIAL_ID,
  reinforcementPityLabel,
  resolveEnhanceUiState,
  type EnhancePhase,
  type EnhanceUiState,
} from "@/ui/panels/enhancement/enhancement-view";
import type {
  EnhanceResultMessage,
  FragmentExchangeResultMessage,
  InventoryItemView,
  InventorySnapshot,
} from "@/shared/net-protocol";

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

// ── B4 fragment exchange + pity display ──────────────────────────────────────
describe("FRAGMENT_MATERIAL_ID", () => {
  test("ตรง materialId ตาม §3.5", () => {
    expect(FRAGMENT_MATERIAL_ID).toBe("upg_reinforcement_fragment");
  });
});

describe("countFragmentMaterial", () => {
  test("null → 0; รวมทุก stack ของเศษ", () => {
    expect(countFragmentMaterial(null)).toBe(0);
    const s = snapshot({
      bag: [
        bagItem({ instanceId: "f1", itemId: FRAGMENT_MATERIAL_ID, quantity: 3, slot: 0 }),
        bagItem({ instanceId: "f2", itemId: FRAGMENT_MATERIAL_ID, quantity: 4, slot: 1 }),
        bagItem({ instanceId: "r", itemId: "upg_reinforcement", quantity: 2, slot: 2 }),
      ],
    });
    expect(countFragmentMaterial(s)).toBe(7); // ไม่นับ upg_reinforcement
  });
});

describe("findFragmentStack", () => {
  test("null snapshot / ไม่มีเศษ → null", () => {
    expect(findFragmentStack(null)).toBeNull();
    expect(findFragmentStack(snapshot({ bag: [bagItem()] }))).toBeNull();
  });

  test("เลือก stack ที่ quantity มากสุด (ส่ง instanceId + version ใน intent)", () => {
    const s = snapshot({
      bag: [
        bagItem({ instanceId: "f1", itemId: FRAGMENT_MATERIAL_ID, quantity: 2, slot: 0, version: 4 }),
        bagItem({ instanceId: "f2", itemId: FRAGMENT_MATERIAL_ID, quantity: 6, slot: 1, version: 7 }),
      ],
    });
    const found = findFragmentStack(s)!;
    expect(found.instanceId).toBe("f2");
    expect(found.version).toBe(7);
  });
});

describe("canExchangeFragments", () => {
  test("กดได้เมื่อ ≥ 5 (§3.5 input)", () => {
    expect(canExchangeFragments(4)).toBe(false);
    expect(canExchangeFragments(5)).toBe(true);
    expect(canExchangeFragments(12)).toBe(true);
    expect(canExchangeFragments(0)).toBe(false);
  });
});

describe("reinforcementPityLabel", () => {
  test("null → null (ยังไม่เคยฆ่า Field Boss → ซ่อนแถบ)", () => {
    expect(reinforcementPityLabel(null)).toBeNull();
  });
  test("แสดง X/Y (§4.2)", () => {
    expect(reinforcementPityLabel({ pityCount: 3, guaranteedAtClear: 15 })).toBe("ประกันบอส: 3/15");
    expect(reinforcementPityLabel({ pityCount: 0, guaranteedAtClear: 15 })).toBe("ประกันบอส: 0/15");
  });
});

describe("fragmentExchangeMessage", () => {
  const res = (over: Partial<FragmentExchangeResultMessage>): FragmentExchangeResultMessage => ({
    ok: false,
    granted: 0,
    ...over,
  });
  test("ok → บอกจำนวนที่ได้", () => {
    expect(fragmentExchangeMessage(res({ ok: true, granted: 1 }))).toBe("แลกสำเร็จ ได้เสริมแกร่ง ×1");
  });
  test.each([
    ["NOT_ENOUGH_FRAGMENTS"],
    ["INVENTORY_FULL"],
    ["NO_DB"],
    ["TRANSACTION_CONFLICT"],
    ["something_unmapped"],
  ])("reason=%s → ข้อความไม่ว่าง", (reason) => {
    expect(fragmentExchangeMessage(res({ reason }))).not.toBe("");
  });
});
