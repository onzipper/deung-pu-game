import { describe, expect, test } from "vitest";
import {
  canClaimDeliveryEntry,
  canConfirmDeliveryTx,
  canConfirmStorageTx,
  deliveryRejectionReasonLabel,
  deliverySourceLabel,
  deliveryStatusColorClass,
  deliveryStatusLabel,
  deliveryTxMessage,
  fillPercent,
  fillStateColorClass,
  findDeliveryEntryById,
  findStorageItemByInstanceId,
  isStorageAvailable,
  resolveDeliveryTxState,
  resolveStorageTxState,
  STORAGE_PANEL_ID,
  storageRejectionReasonLabel,
  storageTxMessage,
  type DeliveryTxState,
  type StorageTxState,
} from "@/ui/panels/storage/storage-view";
import type {
  DeliveryEntryView,
  DeliveryResultMessage,
  DeliveryStateMessage,
  StorageItemView,
  StorageResultMessage,
  StorageStateMessage,
} from "@/shared/net-protocol";

const storageItem = (over: Partial<StorageItemView> = {}): StorageItemView => ({
  instanceId: "s1",
  itemId: "sword_iron",
  slot: 0,
  quantity: 1,
  enhancementLevel: 0,
  version: 1,
  ...over,
});

const storageState = (over: Partial<StorageStateMessage> = {}): StorageStateMessage => ({
  available: true,
  capacity: 200,
  used: 0,
  fillState: "normal",
  items: [],
  ...over,
});

const deliveryEntry = (over: Partial<DeliveryEntryView> = {}): DeliveryEntryView => ({
  entryId: "d1",
  source: "compensation",
  items: [{ itemId: "sword_iron", quantity: 1 }],
  claimStatus: "unclaimed",
  expiresAt: null,
  status: "none",
  ...over,
});

const deliveryState = (over: Partial<DeliveryStateMessage> = {}): DeliveryStateMessage => ({
  available: true,
  maxEntries: 50,
  used: 0,
  entries: [],
  ...over,
});

describe("STORAGE_PANEL_ID", () => {
  test("คงที่ (ใช้เป็น PanelId เดียวทั้งแอป)", () => {
    expect(STORAGE_PANEL_ID).toBe("storage");
  });
});

describe("isStorageAvailable", () => {
  test("state = null → false", () => {
    expect(isStorageAvailable(null)).toBe(false);
  });

  test("available: false → false", () => {
    expect(isStorageAvailable(storageState({ available: false }))).toBe(false);
  });

  test("available: true → true", () => {
    expect(isStorageAvailable(storageState({ available: true }))).toBe(true);
  });
});

describe("findStorageItemByInstanceId", () => {
  test("เจอ → คืน item", () => {
    const item = storageItem();
    const state = storageState({ items: [item] });
    expect(findStorageItemByInstanceId(state, "s1")).toBe(item);
  });

  test("ไม่เจอ → null", () => {
    expect(findStorageItemByInstanceId(storageState(), "ghost")).toBeNull();
  });
});

describe("findDeliveryEntryById", () => {
  test("เจอ → คืน entry", () => {
    const entry = deliveryEntry();
    const state = deliveryState({ entries: [entry] });
    expect(findDeliveryEntryById(state, "d1")).toBe(entry);
  });

  test("ไม่เจอ → null", () => {
    expect(findDeliveryEntryById(deliveryState(), "ghost")).toBeNull();
  });
});

describe("fillStateColorClass", () => {
  test("ครบ 4 fillState มีสีต่างกัน", () => {
    const classes = new Set(
      (["normal", "warn", "alert", "full"] as const).map((s) => fillStateColorClass(s)),
    );
    expect(classes.size).toBe(4);
  });
});

describe("fillPercent", () => {
  test("คำนวณ % ปกติ (round)", () => {
    expect(fillPercent(80, 200)).toBe(40);
    expect(fillPercent(1, 3)).toBe(33);
  });

  test("capacity 0 → 0 (กัน div by zero)", () => {
    expect(fillPercent(5, 0)).toBe(0);
  });

  test("clamp 0-100", () => {
    expect(fillPercent(-5, 200)).toBe(0);
    expect(fillPercent(999, 200)).toBe(100);
  });
});

describe("storageRejectionReasonLabel", () => {
  test.each([
    ["STORAGE_UNAVAILABLE"],
    ["NO_ITEM"],
    ["ITEM_BOUND"],
    ["ITEM_EQUIPPED"],
    ["STORAGE_FULL"],
    ["INVENTORY_FULL"],
    ["ITEM_CHANGED"],
    ["TRANSACTION_CONFLICT"],
  ])("%s → มีข้อความไทยไม่ว่าง", (reason) => {
    expect(storageRejectionReasonLabel(reason)).not.toBe("");
  });

  test("reason แปลกที่ไม่รู้จัก → fallback ทั่วไป", () => {
    expect(storageRejectionReasonLabel("something_new")).toBe("ทำรายการไม่สำเร็จ");
  });
});

describe("deliveryRejectionReasonLabel", () => {
  test.each([
    ["STORAGE_UNAVAILABLE"],
    ["NOT_FOUND"],
    ["EXPIRED"],
    ["INVENTORY_FULL"],
    ["TRANSACTION_CONFLICT"],
  ])("%s → มีข้อความไทยไม่ว่าง", (reason) => {
    expect(deliveryRejectionReasonLabel(reason)).not.toBe("");
  });

  test("reason แปลกที่ไม่รู้จัก → fallback ทั่วไป", () => {
    expect(deliveryRejectionReasonLabel("something_new")).toBe("ทำรายการไม่สำเร็จ");
  });
});

describe("deliveryStatusLabel / deliveryStatusColorClass", () => {
  test("none → ว่าง", () => {
    expect(deliveryStatusLabel("none")).toBe("");
  });

  test("expiring_soon/expiring_urgent/expired → ข้อความไม่ว่าง สีต่างกัน", () => {
    const statuses = ["expiring_soon", "expiring_urgent", "expired"] as const;
    const labels = statuses.map((s) => deliveryStatusLabel(s));
    const colors = new Set(statuses.map((s) => deliveryStatusColorClass(s)));
    for (const label of labels) expect(label).not.toBe("");
    expect(colors.size).toBe(3);
  });
});

describe("canClaimDeliveryEntry", () => {
  test("unclaimed + status ไม่ expired → รับได้", () => {
    expect(canClaimDeliveryEntry(deliveryEntry({ status: "expiring_soon" }))).toBe(true);
  });

  test("status expired → รับไม่ได้", () => {
    expect(canClaimDeliveryEntry(deliveryEntry({ status: "expired" }))).toBe(false);
  });

  test("claimStatus claimed → รับไม่ได้ (แม้ status ยังไม่ expired)", () => {
    expect(canClaimDeliveryEntry(deliveryEntry({ claimStatus: "claimed" }))).toBe(false);
  });
});

describe("deliverySourceLabel", () => {
  test.each([
    ["compensation"],
    ["gm_gift"],
    ["event_reward"],
    ["achievement_reward"],
    ["market_purchase"],
    ["paid_item"],
    ["campaign_gift"],
    ["migrated_recovery"],
  ])("%s → มีชื่อไทย (ไม่ใช่ enum ดิบ)", (source) => {
    expect(deliverySourceLabel(source)).not.toBe(source);
  });

  test("source แปลกที่ไม่รู้จัก → คืน raw string เป็น fallback", () => {
    expect(deliverySourceLabel("future_source")).toBe("future_source");
  });
});

describe("resolveStorageTxState / canConfirmStorageTx", () => {
  test("idle → IDLE, กดได้", () => {
    const state = resolveStorageTxState({ kind: "idle" });
    expect(state).toBe("IDLE");
    expect(canConfirmStorageTx(state)).toBe(true);
  });

  test("processing → PROCESSING, กดไม่ได้", () => {
    const state = resolveStorageTxState({ kind: "processing", op: "deposit", instanceId: "s1" });
    expect(state).toBe("PROCESSING");
    expect(canConfirmStorageTx(state)).toBe(false);
  });

  test("timed_out → UNKNOWN_RECONCILING, กดไม่ได้", () => {
    const state = resolveStorageTxState({ kind: "timed_out", op: "withdraw", instanceId: "s1" });
    expect(state).toBe("UNKNOWN_RECONCILING");
    expect(canConfirmStorageTx(state)).toBe(false);
  });

  test("settled ok:true → SUCCESS, กดได้", () => {
    const result: StorageResultMessage = { op: "deposit", ok: true, instanceId: "s1" };
    const state = resolveStorageTxState({ kind: "settled", result });
    expect(state).toBe("SUCCESS");
    expect(canConfirmStorageTx(state)).toBe(true);
  });

  test("settled ok:false → REJECTED, กดได้", () => {
    const result: StorageResultMessage = {
      op: "withdraw",
      ok: false,
      instanceId: "s1",
      reason: "STORAGE_FULL",
    };
    const state = resolveStorageTxState({ kind: "settled", result });
    expect(state).toBe("REJECTED");
    expect(canConfirmStorageTx(state)).toBe(true);
  });
});

describe("storageTxMessage", () => {
  test("IDLE → ว่าง", () => {
    expect(storageTxMessage("IDLE", null)).toBe("");
  });

  test("SUCCESS deposit vs withdraw → ข้อความต่างกัน", () => {
    const dep: StorageResultMessage = { op: "deposit", ok: true, instanceId: "s1" };
    const wd: StorageResultMessage = { op: "withdraw", ok: true, instanceId: "s1" };
    expect(storageTxMessage("SUCCESS", dep)).toBe("ฝากสำเร็จ");
    expect(storageTxMessage("SUCCESS", wd)).toBe("ถอนสำเร็จ");
  });

  test("REJECTED → ใช้ storageRejectionReasonLabel ของ reason", () => {
    const result: StorageResultMessage = {
      op: "deposit",
      ok: false,
      instanceId: "s1",
      reason: "STORAGE_FULL",
    };
    expect(storageTxMessage("REJECTED", result)).toBe(storageRejectionReasonLabel("STORAGE_FULL"));
  });

  test("UNKNOWN_RECONCILING → ข้อความ resync", () => {
    expect(storageTxMessage("UNKNOWN_RECONCILING", null)).toContain("ซิงก์");
  });

  test("state แปลก (fallback branch) → ว่าง", () => {
    expect(storageTxMessage("UNKNOWN" as StorageTxState, null)).toBe("");
  });
});

describe("resolveDeliveryTxState / canConfirmDeliveryTx", () => {
  test("idle → IDLE, กดได้", () => {
    const state = resolveDeliveryTxState({ kind: "idle" });
    expect(state).toBe("IDLE");
    expect(canConfirmDeliveryTx(state)).toBe(true);
  });

  test("processing → PROCESSING, กดไม่ได้", () => {
    const state = resolveDeliveryTxState({ kind: "processing", entryId: "d1" });
    expect(state).toBe("PROCESSING");
    expect(canConfirmDeliveryTx(state)).toBe(false);
  });

  test("timed_out → UNKNOWN_RECONCILING, กดไม่ได้", () => {
    const state = resolveDeliveryTxState({ kind: "timed_out", entryId: "d1" });
    expect(state).toBe("UNKNOWN_RECONCILING");
    expect(canConfirmDeliveryTx(state)).toBe(false);
  });

  test("settled ok:true → SUCCESS", () => {
    const result: DeliveryResultMessage = { ok: true, entryId: "d1", granted: [] };
    expect(resolveDeliveryTxState({ kind: "settled", result })).toBe("SUCCESS");
  });

  test("settled ok:false → REJECTED", () => {
    const result: DeliveryResultMessage = { ok: false, entryId: "d1", granted: [], reason: "EXPIRED" };
    expect(resolveDeliveryTxState({ kind: "settled", result })).toBe("REJECTED");
  });
});

describe("deliveryTxMessage", () => {
  test("IDLE → ว่าง", () => {
    expect(deliveryTxMessage("IDLE", null)).toBe("");
  });

  test("SUCCESS → รับของสำเร็จ", () => {
    const result: DeliveryResultMessage = { ok: true, entryId: "d1", granted: [] };
    expect(deliveryTxMessage("SUCCESS", result)).toBe("รับของสำเร็จ");
  });

  test("REJECTED → ใช้ deliveryRejectionReasonLabel ของ reason", () => {
    const result: DeliveryResultMessage = { ok: false, entryId: "d1", granted: [], reason: "EXPIRED" };
    expect(deliveryTxMessage("REJECTED", result)).toBe(deliveryRejectionReasonLabel("EXPIRED"));
  });

  test("UNKNOWN_RECONCILING → ข้อความ resync", () => {
    expect(deliveryTxMessage("UNKNOWN_RECONCILING", null)).toContain("ซิงก์");
  });

  test("state แปลก (fallback branch) → ว่าง", () => {
    expect(deliveryTxMessage("UNKNOWN" as DeliveryTxState, null)).toBe("");
  });
});
