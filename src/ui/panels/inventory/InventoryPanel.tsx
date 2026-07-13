"use client";

// เนื้อหา panel กระเป๋า (P2-07) — grid ช่องตาม capacity + รายการ equipment + ปุ่มสวม/ถอด (ไม่มีลาก-วางรอบนี้
// ตาม brief: "ลาก-วางไม่ต้องทำในรอบนี้ — ปุ่มพอ, mobile-first"). อ่าน state ผ่าน Zustand bridge เท่านั้น
// (`useGameStore`, docs/context/ui.md contract) — ส่ง intent (equip/unequip) ผ่าน `EngineHandle.net` ตรง ๆ
// (imperative command เหมือน setDepthDebug ใน DebugOverlay.tsx, ไม่ใช่ store — store เป็น engine→UI ทางเดียว).
//
// item name/icon: catalog ฝั่ง client ยังไม่มี (server-authoritative) → แสดง itemId ดิบไปก่อน. TODO: แทนที่
// ด้วยชื่อ/ไอคอนจริงเมื่อ item-catalog พร้อม (มากับ SVG-01 หรืองาน catalog ถัดไป — ห้ามสร้าง catalog เองที่นี่).

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import type { InventoryItemView, InventoryOpRejectedMessage } from "@/shared/net-protocol";
import { Panel, usePanelManager } from "@/ui/panels";
import { ENHANCEMENT_PANEL_ID } from "@/ui/panels/enhancement/enhancement-view";
import { useEnhancementTarget } from "@/ui/panels/enhancement/enhancement-target-context";
import { selectInventory, selectInventoryRejection } from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import {
  buildBagGrid,
  enhancementLabel,
  findItemByInstanceId,
  INVENTORY_PANEL_ID,
  rejectionReasonLabel,
  resolveInventoryAction,
} from "./inventory-view";
import { REINFORCEMENT_MATERIAL_ID } from "@/ui/panels/enhancement/enhancement-view";

// P2-10: ยังไม่มี client item-catalog (บรรทัดข้างบน "ห้ามสร้าง catalog เองที่นี่") จึงเช็ค "equip ได้ไหม"
// แบบ heuristic เบา ๆ ที่สุด — โชว์ปุ่ม "เสริมแกร่ง" ให้ item ที่เลือกทุกชิ้น ยกเว้นตัววัสดุเสริมแกร่งเอง
// (itemId ตรง materialId) เพราะเห็นชัดว่าไม่ใช่ equipment แน่ ๆ. ตัวกันจริงคือ server (NO_ITEM ครอบ
// "not equipment" ด้วย, ดู enhancement-service.ts) — ปุ่มนี้แค่กันเคสที่เห็นชัดที่สุดไม่ให้กดมั่ว.
function canOfferEnhance(item: InventoryItemView): boolean {
  return item.itemId !== REINFORCEMENT_MATERIAL_ID;
}

export interface InventoryPanelProps {
  /** อ่าน engine handle ปัจจุบัน (pattern เดียวกับ DebugOverlay.getHandle — เรียกใหม่ทุกครั้ง ไม่ cache) */
  getHandle: () => EngineHandle | null;
}

const TOAST_DURATION_MS = 3000;

export function InventoryPanel({ getHandle }: InventoryPanelProps) {
  const inventory = useGameStore(selectInventory);
  const rejection = useGameStore(selectInventoryRejection);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const panelManager = usePanelManager();
  const enhancementTarget = useEnhancementTarget();
  // toast = derived จาก rejection ตรง ๆ (ไม่เก็บ text ซ้ำใน state — กัน react-hooks/set-state-in-effect
  // cascading render). `dismissed` เก็บ reference ของ rejection ล่าสุดที่หมดเวลาแสดงแล้วเท่านั้น — setState
  // เกิดขึ้นใน setTimeout callback (deferred, ไม่ใช่ตรงใน effect body) จึงไม่ผิด lint rule.
  const [dismissed, setDismissed] = useState<InventoryOpRejectedMessage | null>(null);

  // rejection เป็น object ใหม่ทุกครั้งที่ server ปฏิเสธ (แม้ reason ซ้ำ) → effect รันจริงทุกครั้ง (reference เปลี่ยน)
  useEffect(() => {
    if (!rejection) return;
    const timer = setTimeout(() => setDismissed(rejection), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [rejection]);

  const toast = rejection && rejection !== dismissed ? rejectionReasonLabel(rejection.reason) : null;

  if (!inventory) {
    return (
      <Panel id={INVENTORY_PANEL_ID} title="กระเป๋า">
        <div className="text-sm text-neutral-400">กำลังโหลด…</div>
      </Panel>
    );
  }

  const grid = buildBagGrid(inventory);
  const selected = selectedId ? findItemByInstanceId(inventory, selectedId) : null;

  const onSelect = (item: InventoryItemView | null): void => {
    setSelectedId(item ? item.instanceId : null);
  };

  const onAction = (): void => {
    if (!selected) return;
    const net = getHandle()?.net;
    if (!net) return;
    const msg = { instanceId: selected.instanceId, expectedVersion: selected.version };
    if (resolveInventoryAction(selected.location) === "equip") {
      net.sendEquipItem(msg);
    } else {
      net.sendUnequipItem(msg);
    }
    setSelectedId(null); // resync มาจาก MSG_INVENTORY_STATE ล่าสุด ไม่ optimistic update ที่นี่
  };

  return (
    <Panel id={INVENTORY_PANEL_ID} title="กระเป๋า" widthPx={400}>
      <div className="space-y-3">
        {toast && (
          <div className="rounded bg-red-900/60 px-2 py-1 text-xs text-red-100">{toast}</div>
        )}

        <div>
          <div className="mb-1 text-xs font-semibold text-amber-300">สวมใส่อยู่</div>
          {inventory.equipment.length === 0 ? (
            <div className="text-xs text-neutral-500">— ไม่มี —</div>
          ) : (
            <ul className="space-y-1">
              {inventory.equipment.map((item) => (
                <li key={item.instanceId}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className={`w-full rounded border px-2 py-1 text-left text-xs ${
                      selectedId === item.instanceId
                        ? "border-amber-400 bg-amber-900/30"
                        : "border-neutral-700 bg-neutral-900/40 hover:bg-neutral-800/60"
                    }`}
                  >
                    {/* TODO(SVG-01/item-catalog): แสดงชื่อ/ไอคอนจริงแทน itemId เมื่อ client catalog พร้อม */}
                    {item.itemId} {enhancementLabel(item.enhancementLevel)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-amber-300">
            กระเป๋า ({inventory.bag.length}/{inventory.capacity})
          </div>
          <div className="grid grid-cols-5 gap-1">
            {grid.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => item && onSelect(item)}
                disabled={!item}
                className={`aspect-square rounded border text-[10px] leading-tight ${
                  item
                    ? selectedId === item.instanceId
                      ? "border-amber-400 bg-amber-900/30"
                      : "border-neutral-700 bg-neutral-900/60 hover:bg-neutral-800"
                    : "border-neutral-800 bg-neutral-950/40"
                }`}
              >
                {item && (
                  <span className="block truncate px-0.5">
                    {item.itemId}
                    {item.quantity > 1 ? ` x${item.quantity}` : ""}
                    {enhancementLabel(item.enhancementLevel) && (
                      <span className="block text-amber-300">
                        {enhancementLabel(item.enhancementLevel)}
                      </span>
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <div className="flex items-center justify-between gap-2 rounded border border-amber-700/50 bg-black/40 px-2 py-2 text-xs">
            <span className="truncate">{selected.itemId}</span>
            <div className="flex shrink-0 gap-1">
              {canOfferEnhance(selected) && (
                <button
                  type="button"
                  onClick={() => {
                    enhancementTarget.setTarget(selected.instanceId);
                    panelManager.openPanel(ENHANCEMENT_PANEL_ID);
                  }}
                  className="rounded border border-amber-700/50 bg-black/60 px-2 py-1 font-semibold text-amber-200 hover:bg-black/80"
                >
                  เสริมแกร่ง
                </button>
              )}
              <button
                type="button"
                onClick={onAction}
                className="rounded bg-amber-700/80 px-2 py-1 font-semibold text-black hover:bg-amber-600"
              >
                {resolveInventoryAction(selected.location) === "equip" ? "สวมใส่" : "ถอด"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
