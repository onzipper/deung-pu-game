"use client";

// เนื้อหา panel ร้านค้า NPC (P2-11) — สองแท็บ: ซื้อ (จาก MSG_SHOP_LIST + ราคา server) / ขาย (จากกระเป๋า
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

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import type { InventoryItemView } from "@/shared/net-protocol";
import { Panel } from "@/ui/panels";
import { findItemByInstanceId } from "@/ui/panels/inventory/inventory-view";
import { selectGold, selectInventory, selectShopList, selectShopResult } from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
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
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between text-xs">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setTab("buy")}
              className={`rounded px-2 py-1 font-semibold ${
                tab === "buy" ? "bg-amber-700/80 text-black" : "border border-neutral-700 text-neutral-300"
              }`}
            >
              ซื้อ
            </button>
            <button
              type="button"
              onClick={() => setTab("sell")}
              className={`rounded px-2 py-1 font-semibold ${
                tab === "sell" ? "bg-amber-700/80 text-black" : "border border-neutral-700 text-neutral-300"
              }`}
            >
              ขาย
            </button>
          </div>
          <div className="font-semibold text-amber-300">เงิน: {formatGold(gold)}</div>
        </div>

        {!shopList ? (
          <div className="text-xs text-neutral-400">กำลังโหลด…</div>
        ) : !shopList.available ? (
          <div className="text-xs text-neutral-500">— ไม่มีร้านค้าที่นี่ —</div>
        ) : tab === "buy" ? (
          <>
            {shopList.entries.length === 0 ? (
              <div className="text-xs text-neutral-500">— ร้านว่าง —</div>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {shopList.entries.map((entry) => {
                  const unlocked = isShopEntryUnlocked(entry);
                  return (
                    <li key={entry.itemId}>
                      <button
                        type="button"
                        disabled={!unlocked}
                        onClick={() => setBuyItemId(entry.itemId)}
                        className={`w-full rounded border px-2 py-1 text-left text-xs ${
                          buyItemId === entry.itemId
                            ? "border-amber-400 bg-amber-900/30"
                            : "border-neutral-700 bg-neutral-900/40 hover:bg-neutral-800/60"
                        } ${!unlocked ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        {/* TODO(SVG-01/item-catalog): แสดงชื่อ/ไอคอนจริงแทน itemId เมื่อ client catalog พร้อม */}
                        {entry.itemId} — {entry.buyPrice}g{!unlocked ? " (ล็อก)" : ""}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {buyEntry && (
              <div className="flex items-center gap-2 rounded border border-amber-700/50 bg-black/40 px-2 py-2 text-xs">
                <span className="flex-1 truncate">{buyEntry.itemId}</span>
                <input
                  type="number"
                  min={1}
                  value={buyQty}
                  onChange={(e) =>
                    setBuyQty(clampQuantity(Number(e.target.value), 1, Number.MAX_SAFE_INTEGER))
                  }
                  className="w-14 rounded border border-neutral-700 bg-black/60 px-1 py-1 text-right"
                />
                <button
                  type="button"
                  onClick={onConfirmBuy}
                  disabled={busy}
                  className="rounded bg-amber-700/80 px-2 py-1 font-semibold text-black hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  ยืนยันซื้อ
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {!inventory || inventory.bag.length === 0 ? (
              <div className="text-xs text-neutral-500">— กระเป๋าว่าง —</div>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {inventory.bag.map((item) => (
                  <li key={item.instanceId}>
                    <button
                      type="button"
                      onClick={() => setSellInstanceId(item.instanceId)}
                      className={`w-full rounded border px-2 py-1 text-left text-xs ${
                        sellInstanceId === item.instanceId
                          ? "border-amber-400 bg-amber-900/30"
                          : "border-neutral-700 bg-neutral-900/40 hover:bg-neutral-800/60"
                      }`}
                    >
                      {item.itemId}
                      {item.quantity > 1 ? ` x${item.quantity}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {sellItem && (
              <div className="flex items-center gap-2 rounded border border-amber-700/50 bg-black/40 px-2 py-2 text-xs">
                <span className="flex-1 truncate">{sellItem.itemId}</span>
                <input
                  type="number"
                  min={1}
                  max={sellItem.quantity}
                  value={sellQty}
                  onChange={(e) => setSellQty(clampQuantity(Number(e.target.value), 1, sellItem.quantity))}
                  className="w-14 rounded border border-neutral-700 bg-black/60 px-1 py-1 text-right"
                />
                <button
                  type="button"
                  onClick={onConfirmSell}
                  disabled={busy}
                  className="rounded bg-amber-700/80 px-2 py-1 font-semibold text-black hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  ยืนยันขาย
                </button>
              </div>
            )}
          </>
        )}

        {message && (
          <div
            className={`rounded px-2 py-1 text-xs ${
              state === "SUCCESS" ? "bg-emerald-900/50 text-emerald-200" : "bg-neutral-900/60 text-neutral-300"
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </Panel>
  );
}
