"use client";

// เนื้อหา panel กระเป๋า (P2-07) — grid ช่องตาม capacity + รายการ equipment + ปุ่มสวม/ถอด (ไม่มีลาก-วางรอบนี้
// ตาม brief: "ลาก-วางไม่ต้องทำในรอบนี้ — ปุ่มพอ, mobile-first"). อ่าน state ผ่าน Zustand bridge เท่านั้น
// (`useGameStore`, docs/context/ui.md contract) — ส่ง intent (equip/unequip) ผ่าน `EngineHandle.net` ตรง ๆ
// (imperative command เหมือน setDepthDebug ใน DebugOverlay.tsx, ไม่ใช่ store — store เป็น engine→UI ทางเดียว).
//
// item icon: itemIconUrl() (src/game/item/icon-catalog.ts) เป็น URL lookup ล้วน ไม่มี stat/state ผูกมา —
// public/assets/icons/*.svg มีจริงแล้วสำหรับ item ส่วนใหญ่ (SVG-01), ItemSlot fallback เป็นข้อความ itemId
// ดิบเองถ้า id ไหนไม่มีใน catalog หรือโหลดรูปไม่สำเร็จ (onError). ไม่มี rarity field ในสายข้อมูลนี้
// (net-protocol.ts InventoryItemView) — ItemSlot จึงไม่ส่ง rarity prop (fallback border เป็นกลาง, พร้อมต่อ
// rarity ทันทีที่ field มา).

import { useEffect, useState, type ReactNode } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import type { InventoryItemView, InventoryOpRejectedMessage } from "@/shared/net-protocol";
import { Panel, usePanelManager } from "@/ui/panels";
import { ENHANCEMENT_PANEL_ID } from "@/ui/panels/enhancement/enhancement-view";
import { useEnhancementTarget } from "@/ui/panels/enhancement/enhancement-target-context";
import { ContextHelpButton } from "@/ui/panels/help/ContextHelpButton";
import { selectInventory, selectInventoryRejection } from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import { Button, ItemSlot, Tooltip } from "@/ui/components";
import { itemIconUrl } from "@/game/item/icon-catalog";
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

function ItemTooltip({ item, children }: { item: InventoryItemView; children: ReactNode }) {
  return (
    <Tooltip title={item.itemId} trigger={children}>
      <div className="flex flex-col gap-0.5">
        {item.enhancementLevel > 0 && (
          <span className="text-(--dp-fire-light)">ระดับเสริมแกร่ง {enhancementLabel(item.enhancementLevel)}</span>
        )}
        {item.quantity > 1 && <span className="text-(--dp-sand)">จำนวน {item.quantity}</span>}
      </div>
    </Tooltip>
  );
}

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
        <div className="flex justify-end">
          <ContextHelpButton articleId="inventory_bag" />
        </div>
        <div className="dp-text-body-sm text-(--dp-sand)">กำลังโหลด…</div>
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
      <div className="flex flex-col gap-3">
        {/* P2-12: context help "?" (DG §5.4) — เปิดบทความ "เก็บของ/ใช้กระเป๋ายังไง" ตรง ๆ */}
        <div className="flex justify-end">
          <ContextHelpButton articleId="inventory_bag" />
        </div>
        {toast && (
          <div className="dp-text-body-sm rounded-(--dp-radius-sm) border border-(--dp-danger-red) bg-(--dp-deep-ink) px-3 py-2 text-(--dp-danger-red)">
            {toast}
          </div>
        )}

        <div>
          <div className="dp-text-label mb-2 text-(--dp-sand)">สวมใส่อยู่</div>
          {inventory.equipment.length === 0 ? (
            <div className="dp-text-body-sm text-(--dp-sand)">— ไม่มี —</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {inventory.equipment.map((item) => (
                <ItemTooltip key={item.instanceId} item={item}>
                  <ItemSlot
                    context="equipment"
                    equipped
                    selected={selectedId === item.instanceId}
                    enhancementLevel={item.enhancementLevel}
                    iconUrl={itemIconUrl(item.itemId)}
                    fallbackLabel={item.itemId}
                    ariaLabel={item.itemId}
                    onClick={() => onSelect(item)}
                  />
                </ItemTooltip>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="dp-text-label mb-2 text-(--dp-sand)">
            กระเป๋า ({inventory.bag.length}/{inventory.capacity})
          </div>
          <div className="flex flex-wrap gap-2">
            {grid.map((item, idx) =>
              item ? (
                <ItemTooltip key={item.instanceId} item={item}>
                  <ItemSlot
                    context="inventory"
                    selected={selectedId === item.instanceId}
                    stackCount={item.quantity}
                    enhancementLevel={item.enhancementLevel}
                    iconUrl={itemIconUrl(item.itemId)}
                    fallbackLabel={item.itemId}
                    ariaLabel={item.itemId}
                    onClick={() => onSelect(item)}
                  />
                </ItemTooltip>
              ) : (
                <ItemSlot key={`empty-${idx}`} context="inventory" empty disabled ariaLabel="ช่องว่าง" />
              ),
            )}
          </div>
        </div>

        {selected && (
          <div className="flex items-center justify-between gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
            <span className="dp-text-body-sm truncate text-(--dp-parchment)">{selected.itemId}</span>
            <div className="flex shrink-0 gap-2">
              {canOfferEnhance(selected) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    enhancementTarget.setTarget(selected.instanceId);
                    panelManager.openPanel(ENHANCEMENT_PANEL_ID);
                  }}
                >
                  เสริมแกร่ง
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={onAction}>
                {resolveInventoryAction(selected.location) === "equip" ? "สวมใส่" : "ถอด"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
