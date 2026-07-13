"use client";

// เนื้อหา panel "คลัง" + "กล่องส่งของ" (P2-17) — สองแท็บบนสุด: คลัง (2 คอลัมน์ กระเป๋า/คลัง + ปุ่มฝาก-ถอน
// ต่อชิ้น) และ กล่องส่งของ (รายการ entries + ปุ่มรับของ). อ่าน state ผ่าน Zustand bridge เท่านั้น
// (useGameStore, docs/context/ui.md contract) — ส่ง intent (deposit/withdraw/claim) ผ่าน EngineHandle.net
// ตรง ๆ (imperative, เหมือน InventoryPanel/ShopPanel). Deposit/withdraw ไม่อยู่ใน invariant "confirmation
// mandatory" (มีแค่ market purchase/enhancement/rare item/เกรี้ยว) → เลือกแล้วกดปุ่มเดียวจบ (pattern
// เดียวกับ equip/unequip ใน InventoryPanel, ไม่ใช่ 2-step confirm แบบ shop).
//
// item name/icon: เหมือน panel อื่น — ยังไม่มี client item-catalog → แสดง itemId ดิบไปก่อน (SVG-01).

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import type { DeliveryEntryView, StorageItemView } from "@/shared/net-protocol";
import { Panel } from "@/ui/panels";
import { enhancementLabel, findItemByInstanceId } from "@/ui/panels/inventory/inventory-view";
import {
  selectDeliveryResult,
  selectDeliveryState,
  selectInventory,
  selectStorageResult,
  selectStorageState,
} from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import { Button } from "@/ui/components";
import {
  canClaimDeliveryEntry,
  canConfirmDeliveryTx,
  canConfirmStorageTx,
  deliverySourceLabel,
  deliveryStatusColorClass,
  deliveryStatusLabel,
  deliveryTxMessage,
  fillPercent,
  fillStateColorClass,
  findDeliveryEntryById,
  findStorageItemByInstanceId,
  resolveDeliveryTxState,
  resolveStorageTxState,
  STORAGE_PANEL_ID,
  storageTxMessage,
  type DeliveryTxPhase,
  type StorageTab,
  type StorageTxPhase,
} from "./storage-view";

export interface StoragePanelProps {
  /** อ่าน engine handle ปัจจุบัน (pattern เดียวกับ InventoryPanel.getHandle — เรียกใหม่ทุกครั้ง ไม่ cache) */
  getHandle: () => EngineHandle | null;
}

/** ไม่ได้รับผลลัพธ์ภายในนี้หลังกด → UNKNOWN_RECONCILING (pattern เดียวกับ ShopPanel/EnhancementPanel) */
const RESULT_TIMEOUT_MS = 8000;
/** โชว์ผลลัพธ์ (สำเร็จ/ปฏิเสธ) ค้างไว้สั้น ๆ ก่อนกลับ idle ให้กดใหม่ได้ */
const RESULT_DISPLAY_MS = 3000;

function makeIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; // fallback (env ไม่มี Web Crypto)
}

export function StoragePanel({ getHandle }: StoragePanelProps) {
  const storageState = useGameStore(selectStorageState);
  const storageResult = useGameStore(selectStorageResult);
  const deliveryState = useGameStore(selectDeliveryState);
  const deliveryResult = useGameStore(selectDeliveryResult);
  const inventory = useGameStore(selectInventory);

  const [tab, setTab] = useState<StorageTab>("storage");
  const [selectedBagId, setSelectedBagId] = useState<string | null>(null);
  const [selectedStorageId, setSelectedStorageId] = useState<string | null>(null);
  const [phase, setPhase] = useState<StorageTxPhase>({ kind: "idle" });
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [deliveryPhase, setDeliveryPhase] = useState<DeliveryTxPhase>({ kind: "idle" });

  // เปลี่ยน selection → ทิ้ง phase เดิม กลับ idle เสมอ (deferred setState ใน setTimeout callback, pattern
  // เดียวกับ ShopPanel/EnhancementPanel — ไม่ผิด react-hooks/set-state-in-effect)
  useEffect(() => {
    const timer = setTimeout(() => setPhase({ kind: "idle" }), 0);
    return () => clearTimeout(timer);
  }, [selectedBagId, selectedStorageId]);

  useEffect(() => {
    if (!storageResult) return;
    if (phase.kind !== "processing" && phase.kind !== "timed_out") return;
    if (storageResult.op !== phase.op || storageResult.instanceId !== phase.instanceId) return;
    const timer = setTimeout(() => setPhase({ kind: "settled", result: storageResult }), 0);
    return () => clearTimeout(timer);
  }, [storageResult, phase]);

  useEffect(() => {
    if (phase.kind !== "processing") return;
    const { op, instanceId } = phase;
    const timer = setTimeout(() => setPhase({ kind: "timed_out", op, instanceId }), RESULT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase.kind !== "settled") return;
    const timer = setTimeout(() => setPhase({ kind: "idle" }), RESULT_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const timer = setTimeout(() => setDeliveryPhase({ kind: "idle" }), 0);
    return () => clearTimeout(timer);
  }, [selectedEntryId]);

  useEffect(() => {
    if (!deliveryResult) return;
    if (deliveryPhase.kind !== "processing" && deliveryPhase.kind !== "timed_out") return;
    if (deliveryResult.entryId !== deliveryPhase.entryId) return;
    const timer = setTimeout(() => setDeliveryPhase({ kind: "settled", result: deliveryResult }), 0);
    return () => clearTimeout(timer);
  }, [deliveryResult, deliveryPhase]);

  useEffect(() => {
    if (deliveryPhase.kind !== "processing") return;
    const { entryId } = deliveryPhase;
    const timer = setTimeout(() => setDeliveryPhase({ kind: "timed_out", entryId }), RESULT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [deliveryPhase]);

  useEffect(() => {
    if (deliveryPhase.kind !== "settled") return;
    const timer = setTimeout(() => setDeliveryPhase({ kind: "idle" }), RESULT_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [deliveryPhase]);

  const txState = resolveStorageTxState(phase);
  const txBusy = !canConfirmStorageTx(txState);
  const txMessage = storageTxMessage(txState, phase.kind === "settled" ? phase.result : storageResult);

  const deliveryTxState = resolveDeliveryTxState(deliveryPhase);
  const deliveryBusy = !canConfirmDeliveryTx(deliveryTxState);
  const deliveryMessage = deliveryTxMessage(
    deliveryTxState,
    deliveryPhase.kind === "settled" ? deliveryPhase.result : deliveryResult,
  );

  const bagItem = inventory && selectedBagId ? findItemByInstanceId(inventory, selectedBagId) : null;
  const storageItem =
    storageState && selectedStorageId ? findStorageItemByInstanceId(storageState, selectedStorageId) : null;
  const selectedEntry =
    deliveryState && selectedEntryId ? findDeliveryEntryById(deliveryState, selectedEntryId) : null;

  const onDeposit = (): void => {
    if (!bagItem || txBusy) return;
    const net = getHandle()?.net;
    if (!net) return;
    net.sendStorageDeposit({
      instanceId: bagItem.instanceId,
      expectedVersion: bagItem.version,
      idempotencyKey: makeIdempotencyKey("storage-dep"),
    });
    setPhase({ kind: "processing", op: "deposit", instanceId: bagItem.instanceId });
  };

  const onWithdraw = (): void => {
    if (!storageItem || txBusy) return;
    const net = getHandle()?.net;
    if (!net) return;
    net.sendStorageWithdraw({
      instanceId: storageItem.instanceId,
      expectedVersion: storageItem.version,
      idempotencyKey: makeIdempotencyKey("storage-wd"),
    });
    setPhase({ kind: "processing", op: "withdraw", instanceId: storageItem.instanceId });
  };

  const onClaim = (): void => {
    if (!selectedEntry || deliveryBusy || !canClaimDeliveryEntry(selectedEntry)) return;
    const net = getHandle()?.net;
    if (!net) return;
    net.sendDeliveryClaim({
      entryId: selectedEntry.entryId,
      idempotencyKey: makeIdempotencyKey("delivery-claim"),
    });
    setDeliveryPhase({ kind: "processing", entryId: selectedEntry.entryId });
  };

  return (
    <Panel id={STORAGE_PANEL_ID} title="คลัง" widthPx={420}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button variant={tab === "storage" ? "primary" : "ghost"} size="sm" onClick={() => setTab("storage")}>
            คลัง
          </Button>
          <Button variant={tab === "delivery" ? "primary" : "ghost"} size="sm" onClick={() => setTab("delivery")}>
            กล่องส่งของ
          </Button>
        </div>

        {tab === "storage" ? (
          !storageState ? (
            <div className="dp-text-body-sm text-(--dp-sand)">กำลังโหลด…</div>
          ) : !storageState.available ? (
            <div className="dp-text-body-sm text-(--dp-sand)">— ไม่มีคลังที่นี่ —</div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <div className="dp-text-body-sm flex items-center justify-between text-(--dp-parchment)">
                  <span>คลัง</span>
                  <span className="tabular-nums">
                    {storageState.used}/{storageState.capacity}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-(--dp-radius-sm) bg-(--dp-deep-ink)">
                  <div
                    className={`h-full transition-[width] duration-(--dp-motion-normal) ${fillStateColorClass(storageState.fillState)}`}
                    style={{ width: `${fillPercent(storageState.used, storageState.capacity)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="dp-text-label mb-1 text-(--dp-sand)">กระเป๋า</div>
                  {!inventory || inventory.bag.length === 0 ? (
                    <div className="dp-text-body-sm text-(--dp-sand)">— ว่าง —</div>
                  ) : (
                    <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                      {inventory.bag.map((item) => (
                        <li key={item.instanceId}>
                          <StorageRow
                            selected={selectedBagId === item.instanceId}
                            label={`${item.itemId} ${enhancementLabel(item.enhancementLevel)}`}
                            onClick={() => setSelectedBagId(item.instanceId)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  {bagItem && (
                    <Button variant="primary" size="sm" fullWidth onClick={onDeposit} disabled={txBusy} className="mt-1">
                      ฝาก
                    </Button>
                  )}
                </div>
                <div>
                  <div className="dp-text-label mb-1 text-(--dp-sand)">คลัง</div>
                  {storageState.items.length === 0 ? (
                    <div className="dp-text-body-sm text-(--dp-sand)">— ว่าง —</div>
                  ) : (
                    <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                      {storageState.items.map((item: StorageItemView) => (
                        <li key={item.instanceId}>
                          <StorageRow
                            selected={selectedStorageId === item.instanceId}
                            label={`${item.itemId} ${enhancementLabel(item.enhancementLevel)}`}
                            onClick={() => setSelectedStorageId(item.instanceId)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  {storageItem && (
                    <Button variant="primary" size="sm" fullWidth onClick={onWithdraw} disabled={txBusy} className="mt-1">
                      ถอน
                    </Button>
                  )}
                </div>
              </div>

              {txMessage && (
                <div
                  className={[
                    "dp-text-body-sm rounded-(--dp-radius-sm) px-3 py-2",
                    txState === "SUCCESS"
                      ? "border border-(--dp-leaf) bg-(--dp-deep-ink) text-(--dp-pale-moss)"
                      : "border border-(--dp-soil-brown) bg-(--dp-warm-ink) text-(--dp-parchment)",
                  ].join(" ")}
                >
                  {txMessage}
                </div>
              )}
            </>
          )
        ) : !deliveryState ? (
          <div className="dp-text-body-sm text-(--dp-sand)">กำลังโหลด…</div>
        ) : !deliveryState.available ? (
          <div className="dp-text-body-sm text-(--dp-sand)">— ไม่มีกล่องส่งของที่นี่ —</div>
        ) : deliveryState.entries.length === 0 ? (
          <div className="dp-text-body-sm text-(--dp-sand)">— ไม่มีของรอรับ —</div>
        ) : (
          <>
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {deliveryState.entries.map((entry: DeliveryEntryView) => {
                const claimable = canClaimDeliveryEntry(entry);
                return (
                  <li key={entry.entryId}>
                    <button
                      type="button"
                      onClick={() => setSelectedEntryId(entry.entryId)}
                      disabled={!claimable}
                      className={[
                        "dp-focus-ring dp-text-body-sm w-full rounded-(--dp-radius-sm) border px-3 py-2 text-left transition-colors",
                        "disabled:cursor-not-allowed disabled:opacity-45",
                        selectedEntryId === entry.entryId
                          ? "border-(--dp-resonance-teal) bg-(--dp-selected-wash) text-(--dp-highlight)"
                          : "border-(--dp-soil-brown) bg-(--dp-warm-ink) text-(--dp-parchment) hover:bg-(--dp-deep-brown)",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{deliverySourceLabel(entry.source)}</span>
                        {deliveryStatusLabel(entry.status) && (
                          <span className={deliveryStatusColorClass(entry.status)}>
                            {deliveryStatusLabel(entry.status)}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-(--dp-sand)">
                        {entry.items.map((line) => `${line.itemId} x${line.quantity}`).join(", ")}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {selectedEntry && (
              <Button
                variant="primary"
                fullWidth
                onClick={onClaim}
                disabled={deliveryBusy || !canClaimDeliveryEntry(selectedEntry)}
              >
                รับของ
              </Button>
            )}

            {deliveryMessage && (
              <div
                className={[
                  "dp-text-body-sm rounded-(--dp-radius-sm) px-3 py-2",
                  deliveryTxState === "SUCCESS"
                    ? "border border-(--dp-leaf) bg-(--dp-deep-ink) text-(--dp-pale-moss)"
                    : "border border-(--dp-soil-brown) bg-(--dp-warm-ink) text-(--dp-parchment)",
                ].join(" ")}
              >
                {deliveryMessage}
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

/** แถวรายการ item เดียว (bag/storage column) — ปุ่มเลือก, ไม่ทำ action ตรง ๆ (ปุ่มฝาก/ถอนอยู่นอก list) */
function StorageRow({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "dp-focus-ring dp-text-body-sm w-full rounded-(--dp-radius-sm) border px-3 py-2 text-left transition-colors",
        selected
          ? "border-(--dp-resonance-teal) bg-(--dp-selected-wash) text-(--dp-highlight)"
          : "border-(--dp-soil-brown) bg-(--dp-warm-ink) text-(--dp-parchment) hover:bg-(--dp-deep-brown)",
      ].join(" ")}
    >
      {/* TODO(SVG-01/item-catalog): แสดงชื่อ/ไอคอนจริงแทน itemId เมื่อ client catalog พร้อม */}
      {label}
    </button>
  );
}
