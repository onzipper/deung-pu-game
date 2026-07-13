"use client";

// เนื้อหา panel ร้านค้า NPC (P2-11) — สองแท็บ: ซื้อ (จาก MSG_SHOP_LIST server prices) / ขาย (จากกระเป๋า
// HudState.inventory — ราคาขายไม่รู้ล่วงหน้า โผล่จริงใน MSG_SHOP_RESULT หลังขาย). อ่าน state ผ่าน Zustand
// bridge เท่านั้น (useGameStore, docs/context/ui.md contract) — ส่ง intent (buy/sell) ผ่าน EngineHandle.net
// ตรง ๆ (imperative, เหมือน InventoryPanel/EnhancementPanel).
//
// Confirmation ตาม invariant ui.md ("mandatory for market purchase") — ตัดสินใจตามแบบเดียวกับ
// EnhancementPanel (P2-10, ที่นี่ก็ไม่มีการยืนยันแบบ modal): ปุ่ม "ยืนยันซื้อ"/"ยืนยันขาย" ทำหน้าที่เป็น
// explicit confirm step (ไม่ใช่ dialog แยก) — ถ้า owner ต้องการ modal จริงจะเป็น follow-up ทั้งสอง panel.
//
// TODO(SVG-01/NPC-entity): รอบนี้เปิดร้านผ่าน HUD ปุ่มเท่านั้น — NPC เดินได้/คลิกได้ในโลกจริงมากับ content
// track (SVG-01) ถัดไป ไม่ใช่ scope ของ P2-11 ครึ่ง UI นี้.
//
// item name/icon: เหมือน panel อื่น — ยังไม่มี client item-catalog → แสดง itemId ดิบไปก่อน (SVG-01).
// ราคา = ตัวเลข gold → tabular-nums (dp-text token) ตาม P2 UI spec §2.2.

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import type { InventoryItemView } from "@/shared/net-protocol";
import { Panel } from "@/ui/panels";
import { ContextHelpButton } from "@/ui/panels/help/ContextHelpButton";
import { findItemByInstanceId } from "@/ui/panels/inventory/inventory-view";
import { selectGold, selectInventory, selectShopList, selectShopResult } from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import { Button, TextInput } from "@/ui/components";
import {
  canConfirmShopTx,
  clampQuantity,
  findCatalogEntry,
  formatGold,
  isShopEntryUnlocked,
  resolveShopTxState,
  SHOP_PANEL_ID,
  shopTxMessage,
  type ShopTab,
  type ShopTxPhase,
} from "./shop-view";

export interface ShopPanelProps {
  /** อ่าน engine handle ปัจจุบัน (pattern เดียวกับ InventoryPanel.getHandle — เรียกใหม่ทุกครั้ง ไม่ cache) */
  getHandle: () => EngineHandle | null;
}

/** ไม่ได้รับ MSG_SHOP_RESULT ภายในนี้หลังกด → UNKNOWN_RECONCILING (pattern เดียวกับ EnhancementPanel) */
const RESULT_TIMEOUT_MS = 8000;
/** โชว์ผลลัพธ์ (สำเร็จ/ปฏิเสธ) ค้างไว้สั้น ๆ ก่อนกลับ idle ให้กดใหม่ได้ */
const RESULT_DISPLAY_MS = 3000;

function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `shop-${Date.now()}-${Math.random().toString(36).slice(2)}`; // fallback (env ไม่มี Web Crypto)
}

/** แถวรายการซื้อ/ขาย 1 ชิ้น — ปุ่มเลือก, ไม่ทำ action ตรง ๆ (ปุ่มยืนยันอยู่นอก list) */
function ShopRow({
  selected,
  disabled,
  label,
  trailing,
  onClick,
}: {
  selected: boolean;
  disabled?: boolean;
  label: string;
  trailing?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "dp-focus-ring dp-text-body-sm flex w-full items-center justify-between gap-2 rounded-(--dp-radius-sm)",
        "border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        selected
          ? "border-(--dp-resonance-teal) bg-(--dp-selected-wash) text-(--dp-highlight)"
          : "border-(--dp-soil-brown) bg-(--dp-warm-ink) text-(--dp-parchment) hover:bg-(--dp-deep-brown)",
      ].join(" ")}
    >
      <span className="truncate">{label}</span>
      {trailing && <span className="shrink-0 tabular-nums text-(--dp-sand)">{trailing}</span>}
    </button>
  );
}

export function ShopPanel({ getHandle }: ShopPanelProps) {
  const shopList = useGameStore(selectShopList);
  const shopResult = useGameStore(selectShopResult);
  const inventory = useGameStore(selectInventory);
  const gold = useGameStore(selectGold);

  const [tab, setTab] = useState<ShopTab>("buy");
  const [buyItemId, setBuyItemId] = useState<string | null>(null);
  const [buyQty, setBuyQty] = useState(1);
  const [sellInstanceId, setSellInstanceId] = useState<string | null>(null);
  const [sellQty, setSellQty] = useState(1);
  const [phase, setPhase] = useState<ShopTxPhase>({ kind: "idle" });

  // เปลี่ยนแท็บ/เปลี่ยน selection → ทิ้ง phase เดิม กลับ idle เสมอ (deferred setState, pattern เดียวกับ
  // EnhancementPanel — ไม่ผิด react-hooks/set-state-in-effect เพราะ setState เกิดใน setTimeout callback)
  useEffect(() => {
    const timer = setTimeout(() => setPhase({ kind: "idle" }), 0);
    return () => clearTimeout(timer);
  }, [tab, buyItemId, sellInstanceId]);

  // ผล MSG_SHOP_RESULT มาถึง → settle เฉพาะ transaction ที่ตรง op+itemId กับที่กำลังรออยู่ (กันผลลัพธ์เก่า
  // ของ item อื่นมาทับ ถ้าผู้เล่นสลับ selection ระหว่างรอ — reset ไป idle ไปแล้วจาก effect ด้านบน แต่กันอีกชั้น)
  useEffect(() => {
    if (!shopResult) return;
    if (phase.kind !== "processing" && phase.kind !== "timed_out") return;
    if (shopResult.op !== phase.op || shopResult.itemId !== phase.itemId) return;
    const timer = setTimeout(() => setPhase({ kind: "settled", result: shopResult }), 0);
    return () => clearTimeout(timer);
  }, [shopResult, phase]);

  // timeout ระหว่าง processing
  useEffect(() => {
    if (phase.kind !== "processing") return;
    const { op, itemId } = phase;
    const timer = setTimeout(() => setPhase({ kind: "timed_out", op, itemId }), RESULT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // settled → โชว์สั้น ๆ แล้วกลับ idle ให้กดใหม่ได้
  useEffect(() => {
    if (phase.kind !== "settled") return;
    const timer = setTimeout(() => setPhase({ kind: "idle" }), RESULT_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const state = resolveShopTxState(phase);
  const busy = !canConfirmShopTx(state);
  const message = shopTxMessage(state, phase.kind === "settled" ? phase.result : shopResult);

  const buyEntry = buyItemId ? findCatalogEntry(shopList, buyItemId) : null;
  const sellItem: InventoryItemView | null =
    inventory && sellInstanceId ? findItemByInstanceId(inventory, sellInstanceId) : null;

  const onConfirmBuy = (): void => {
    if (!buyEntry || !shopList || busy) return;
    const net = getHandle()?.net;
    if (!net) return;
    const qty = clampQuantity(buyQty, 1, Number.MAX_SAFE_INTEGER);
    net.sendShopBuy({
      shopId: shopList.shopId,
      itemId: buyEntry.itemId,
      quantity: qty,
      idempotencyKey: makeIdempotencyKey(),
    });
    setPhase({ kind: "processing", op: "buy", itemId: buyEntry.itemId });
  };

  const onConfirmSell = (): void => {
    if (!sellItem || !shopList || busy) return;
    const net = getHandle()?.net;
    if (!net) return;
    const qty = clampQuantity(sellQty, 1, sellItem.quantity);
    net.sendShopSell({
      shopId: shopList.shopId,
      instanceId: sellItem.instanceId,
      expectedVersion: sellItem.version,
      quantity: qty,
      idempotencyKey: makeIdempotencyKey(),
    });
    setPhase({ kind: "processing", op: "sell", itemId: sellItem.itemId });
  };

  return (
    <Panel id={SHOP_PANEL_ID} title="ร้านค้า" widthPx={420}>
      <div className="flex flex-col gap-3">
        {/* P2-12: context help "?" (DG §5.4) — เปิดบทความ "ซื้อของ/ขายของที่ร้านค้ายังไง" */}
        <div className="flex justify-end">
          <ContextHelpButton articleId="shop_buy_sell" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button variant={tab === "buy" ? "primary" : "ghost"} size="sm" onClick={() => setTab("buy")}>
              ซื้อ
            </Button>
            <Button variant={tab === "sell" ? "primary" : "ghost"} size="sm" onClick={() => setTab("sell")}>
              ขาย
            </Button>
          </div>
          <div className="dp-text-body-sm shrink-0 tabular-nums text-(--dp-sand)">เงิน: {formatGold(gold)}</div>
        </div>

        {!shopList ? (
          <div className="dp-text-body-sm text-(--dp-sand)">กำลังโหลด…</div>
        ) : !shopList.available ? (
          <div className="dp-text-body-sm text-(--dp-sand)">— ไม่มีร้านค้าที่นี่ —</div>
        ) : tab === "buy" ? (
          <>
            {shopList.entries.length === 0 ? (
              <div className="dp-text-body-sm text-(--dp-sand)">— ร้านว่าง —</div>
            ) : (
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {shopList.entries.map((entry) => {
                  const unlocked = isShopEntryUnlocked(entry);
                  return (
                    <ShopRow
                      key={entry.itemId}
                      selected={buyItemId === entry.itemId}
                      disabled={!unlocked}
                      onClick={() => setBuyItemId(entry.itemId)}
                      label={entry.itemId + (!unlocked ? " (ล็อก)" : "")}
                      trailing={`${entry.buyPrice}g`}
                    />
                  );
                })}
              </div>
            )}

            {buyEntry && (
              <div className="flex items-center gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
                <span className="dp-text-body-sm flex-1 truncate text-(--dp-parchment)">{buyEntry.itemId}</span>
                <TextInput
                  type="number"
                  min={1}
                  value={buyQty}
                  onChange={(e) => setBuyQty(clampQuantity(Number(e.target.value), 1, Number.MAX_SAFE_INTEGER))}
                  className="h-8! md:h-8! w-16 px-2 text-right"
                  containerClassName="w-16"
                />
                <Button variant="primary" size="sm" onClick={onConfirmBuy} disabled={busy}>
                  ยืนยันซื้อ
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            {!inventory || inventory.bag.length === 0 ? (
              <div className="dp-text-body-sm text-(--dp-sand)">— กระเป๋าว่าง —</div>
            ) : (
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {inventory.bag.map((item) => (
                  <ShopRow
                    key={item.instanceId}
                    selected={sellInstanceId === item.instanceId}
                    onClick={() => setSellInstanceId(item.instanceId)}
                    label={item.itemId + (item.quantity > 1 ? ` x${item.quantity}` : "")}
                  />
                ))}
              </div>
            )}

            {sellItem && (
              <div className="flex items-center gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
                <span className="dp-text-body-sm flex-1 truncate text-(--dp-parchment)">{sellItem.itemId}</span>
                <TextInput
                  type="number"
                  min={1}
                  max={sellItem.quantity}
                  value={sellQty}
                  onChange={(e) => setSellQty(clampQuantity(Number(e.target.value), 1, sellItem.quantity))}
                  className="h-8! md:h-8! w-16 px-2 text-right"
                  containerClassName="w-16"
                />
                <Button variant="primary" size="sm" onClick={onConfirmSell} disabled={busy}>
                  ยืนยันขาย
                </Button>
              </div>
            )}
          </>
        )}

        {message && (
          <div
            className={[
              "dp-text-body-sm rounded-(--dp-radius-sm) px-3 py-2",
              state === "SUCCESS"
                ? "border border-(--dp-leaf) bg-(--dp-deep-ink) text-(--dp-pale-moss)"
                : "border border-(--dp-soil-brown) bg-(--dp-warm-ink) text-(--dp-parchment)",
            ].join(" ")}
          >
            {message}
          </div>
        )}
      </div>
    </Panel>
  );
}
