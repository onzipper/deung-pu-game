"use client";

// เนื้อหา panel เสริมแกร่ง (P2-10) — เปิดจากปุ่ม "เสริมแกร่ง" ใน InventoryPanel (ตั้ง target ผ่าน
// EnhancementTargetContext แล้ว openPanel) หรือจาก EnhancementHudButton ตรง ๆ (ไม่มี target = NO_ITEM).
// อ่าน state ผ่าน Zustand bridge เท่านั้น (`useGameStore`, docs/context/ui.md contract) — ส่ง intent
// (enhance) ผ่าน `EngineHandle.net` ตรง ๆ (imperative, เหมือน InventoryPanel).
//
// **P2 ทั้งเฟส server ตอบ NO_REINFORCEMENT เสมอ** (flag เปิดอยู่, R8/D-052) — ปุ่มกดได้จริง ส่งจริง แค่ผล
// เสมอเป็น NO_REINFORCEMENT พร้อม hint "ของหายากมากับบอส" (copy บังคับ, verbatim). ไม่ใช่ bug.
//
// item name/icon: เหมือน InventoryPanel — ยังไม่มี client item-catalog → แสดง itemId ดิบไปก่อน (SVG-01).

import { useEffect, useRef, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import { Panel } from "@/ui/panels";
import { ContextHelpButton } from "@/ui/panels/help/ContextHelpButton";
import { findItemByInstanceId } from "@/ui/panels/inventory/inventory-view";
import {
  selectEnhanceResult,
  selectFragmentExchangeResult,
  selectInventory,
  selectReinforcementProgress,
} from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import { Button } from "@/ui/components";
import { useEnhancementTarget } from "./enhancement-target-context";
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
  FRAGMENT_EXCHANGE_INPUT,
  FRAGMENT_EXCHANGE_OUTPUT,
  reinforcementPityLabel,
  resolveEnhanceUiState,
  type EnhancePhase,
} from "./enhancement-view";

export interface EnhancementPanelProps {
  /** อ่าน engine handle ปัจจุบัน (pattern เดียวกับ InventoryPanel.getHandle — เรียกใหม่ทุกครั้ง ไม่ cache) */
  getHandle: () => EngineHandle | null;
}

/** ไม่ได้รับ MSG_ENHANCE_RESULT ภายในนี้หลังกด → UNKNOWN_RECONCILING (§2.4) */
const RESULT_TIMEOUT_MS = 8000;
/** โชว์ผลลัพธ์ (สำเร็จ/ปฏิเสธ) ค้างไว้สั้น ๆ ก่อนกลับ idle ให้กดใหม่ได้ (pattern เดียวกับ InventoryPanel toast) */
const RESULT_DISPLAY_MS = 3000;

/** idempotencyKey ต่อการกดหนึ่งครั้ง (brief: "สร้าง idempotencyKey ฝั่ง client เช่น crypto.randomUUID") */
function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `enh-${Date.now()}-${Math.random().toString(36).slice(2)}`; // fallback (env ไม่มี Web Crypto)
}

export function EnhancementPanel({ getHandle }: EnhancementPanelProps) {
  const inventory = useGameStore(selectInventory);
  const enhanceResult = useGameStore(selectEnhanceResult);
  const fragmentExchangeResult = useGameStore(selectFragmentExchangeResult);
  const reinforcementProgress = useGameStore(selectReinforcementProgress);
  const { targetId } = useEnhancementTarget();
  const [phase, setPhase] = useState<EnhancePhase>({ kind: "idle" });
  // B4 fragment exchange: local processing flag + a short-lived result message (mirrors the enhance toast pattern).
  const [exchanging, setExchanging] = useState(false);
  const [exchangeMsg, setExchangeMsg] = useState<string | null>(null);
  const seenExchangeResult = useRef(fragmentExchangeResult);

  const selected = inventory && targetId ? findItemByInstanceId(inventory, targetId) : null;

  // เปลี่ยน item เลือกใหม่ (หรือปิด target) → ทิ้ง phase เดิม กลับ idle เสมอ. setState เกิดใน setTimeout
  // callback (deferred, ไม่ใช่ตรงใน effect body — pattern เดียวกับ InventoryPanel toast dismiss) จึงไม่ผิด
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    const timer = setTimeout(() => setPhase({ kind: "idle" }), 0);
    return () => clearTimeout(timer);
  }, [targetId]);

  // ผล MSG_ENHANCE_RESULT มาถึงระหว่างรอ (processing) หรือหลัง timeout (timed_out, resync ช้า) ของ item
  // เดียวกันที่กำลังแสดงอยู่ → settle. เทียบ instanceId กันผลลัพธ์เก่าของ item อื่นมาทับ (เผื่อผู้เล่นสลับ
  // item เลือกระหว่างรอ — reset phase ไป idle ไปแล้วจาก effect ด้านบน แต่กันไว้อีกชั้น).
  useEffect(() => {
    if (!enhanceResult) return;
    if (phase.kind !== "processing" && phase.kind !== "timed_out") return;
    if (enhanceResult.instanceId !== targetId) return;
    const timer = setTimeout(() => setPhase({ kind: "settled", result: enhanceResult }), 0);
    return () => clearTimeout(timer);
  }, [enhanceResult, phase.kind, targetId]);

  // timeout ระหว่าง processing
  useEffect(() => {
    if (phase.kind !== "processing") return;
    const timer = setTimeout(() => setPhase({ kind: "timed_out" }), RESULT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase.kind]);

  // settled (ok หรือ reject) → โชว์สั้น ๆ แล้วกลับ idle ให้กดใหม่ได้ (client ไม่รู้ maxLevel เอง — READY
  // ใหม่คือ best-effort guess, server ยังคง authoritative ทุกครั้งที่กดจริง)
  useEffect(() => {
    if (phase.kind !== "settled") return;
    const timer = setTimeout(() => setPhase({ kind: "idle" }), RESULT_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // B4: a fresh MSG_FRAGMENT_EXCHANGE_RESULT arrived → stop processing + show a short message (deferred setState,
  // same setTimeout(0) pattern as the phase effects above → not a set-state-in-effect violation).
  useEffect(() => {
    if (fragmentExchangeResult === seenExchangeResult.current) return;
    seenExchangeResult.current = fragmentExchangeResult;
    const res = fragmentExchangeResult;
    if (!res) return;
    const timer = setTimeout(() => {
      setExchanging(false);
      setExchangeMsg(fragmentExchangeMessage(res));
    }, 0);
    return () => clearTimeout(timer);
  }, [fragmentExchangeResult]);

  // auto-dismiss the exchange message after a short display window.
  useEffect(() => {
    if (exchangeMsg === null) return;
    const timer = setTimeout(() => setExchangeMsg(null), RESULT_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [exchangeMsg]);

  const state = resolveEnhanceUiState(selected !== null, phase);
  const materialCount = countReinforcementMaterial(inventory);
  const canConfirm = canConfirmEnhance(state);

  // B4 fragment exchange (§3.5) + pity progress (§4.2) — smallest surface: a fragment row + "แลก 5→1" button.
  const fragmentCount = countFragmentMaterial(inventory);
  const canExchange = !exchanging && canExchangeFragments(fragmentCount);
  const pityLabel = reinforcementPityLabel(reinforcementProgress);

  const onExchange = (): void => {
    if (!canExchange) return;
    const stack = findFragmentStack(inventory);
    if (!stack) return;
    const net = getHandle()?.net;
    if (!net) return;
    net.sendFragmentExchange({
      instanceId: stack.instanceId,
      expectedVersion: stack.version,
      idempotencyKey: makeIdempotencyKey(),
    });
    setExchangeMsg(null);
    setExchanging(true);
  };

  const onConfirm = (): void => {
    if (!selected || !canConfirm) return;
    const net = getHandle()?.net;
    if (!net) return;
    net.sendEnhanceItem({
      instanceId: selected.instanceId,
      expectedVersion: selected.version,
      idempotencyKey: makeIdempotencyKey(),
    });
    setPhase({ kind: "processing" });
  };

  return (
    <Panel id={ENHANCEMENT_PANEL_ID} title="เสริมแกร่ง" widthPx={380}>
      <div className="flex flex-col gap-3">
        {/* P2-12: context help "?" (DG §5.4) — เปิดบทความ "เสริมแกร่งยังไง" (มี hint R8 ในตัว) */}
        <div className="flex justify-end">
          <ContextHelpButton articleId="enhancement" />
        </div>
        {selected ? (
          <>
            <div className="rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
              {/* TODO(SVG-01/item-catalog): แสดงชื่อ/ไอคอนจริงแทน itemId เมื่อ client catalog พร้อม */}
              <div className="dp-text-body-sm truncate font-semibold text-(--dp-highlight)">{selected.itemId}</div>
              <div className="dp-text-body-sm text-(--dp-fire-light)">
                {enhancementTransitionLabel(selected.enhancementLevel)}
              </div>
            </div>
            <div className="dp-text-caption text-(--dp-sand)">ใช้: เสริมแกร่ง ×1 (มีอยู่ {materialCount})</div>
          </>
        ) : (
          <div className="dp-text-body-sm text-(--dp-sand)">— ยังไม่ได้เลือกอุปกรณ์ —</div>
        )}

        <div
          className={[
            "dp-text-body-sm rounded-(--dp-radius-sm) px-3 py-2",
            state === "SUCCESS"
              ? "border border-(--dp-leaf) bg-(--dp-deep-ink) text-(--dp-pale-moss)"
              : state === "READY"
                ? "text-(--dp-parchment)"
                : "border border-(--dp-soil-brown) bg-(--dp-warm-ink) text-(--dp-parchment)",
          ].join(" ")}
        >
          {enhanceStateMessage(state)}
        </div>

        <Button variant="primary" fullWidth onClick={onConfirm} disabled={!canConfirm}>
          ยืนยันเสริมแกร่ง
        </Button>

        {/* B4: เศษเสริมแกร่ง แลก 5→1 (§3.5) + แถบประกันบอส (§4.2) */}
        <div className="mt-1 flex flex-col gap-2 border-t border-(--dp-soil-brown) pt-3">
          {pityLabel && <div className="dp-text-caption text-(--dp-sand)">{pityLabel}</div>}
          <div className="dp-text-caption text-(--dp-sand)">
            เศษเสริมแกร่ง: {fragmentCount} (แลก {FRAGMENT_EXCHANGE_INPUT}→{FRAGMENT_EXCHANGE_OUTPUT})
          </div>
          {exchangeMsg && (
            <div className="dp-text-body-sm rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2 text-(--dp-parchment)">
              {exchangeMsg}
            </div>
          )}
          <Button variant="secondary" fullWidth onClick={onExchange} disabled={!canExchange}>
            แลกเศษ {FRAGMENT_EXCHANGE_INPUT}→{FRAGMENT_EXCHANGE_OUTPUT}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
