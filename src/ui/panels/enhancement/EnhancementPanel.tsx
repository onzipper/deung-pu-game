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

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import { Panel } from "@/ui/panels";
import { findItemByInstanceId } from "@/ui/panels/inventory/inventory-view";
import { selectEnhanceResult, selectInventory } from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import { useEnhancementTarget } from "./enhancement-target-context";
import {
  canConfirmEnhance,
  countReinforcementMaterial,
  ENHANCEMENT_PANEL_ID,
  enhanceStateMessage,
  enhancementTransitionLabel,
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
  const { targetId } = useEnhancementTarget();
  const [phase, setPhase] = useState<EnhancePhase>({ kind: "idle" });

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

  const state = resolveEnhanceUiState(selected !== null, phase);
  const materialCount = countReinforcementMaterial(inventory);
  const canConfirm = canConfirmEnhance(state);

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
      <div className="space-y-3 text-sm">
        {selected ? (
          <>
            <div className="rounded border border-amber-700/40 bg-black/30 px-2 py-2">
              {/* TODO(SVG-01/item-catalog): แสดงชื่อ/ไอคอนจริงแทน itemId เมื่อ client catalog พร้อม */}
              <div className="truncate font-semibold text-amber-200">{selected.itemId}</div>
              <div className="text-amber-300">
                {enhancementTransitionLabel(selected.enhancementLevel)}
              </div>
            </div>
            <div className="text-xs text-neutral-400">
              ใช้: เสริมแกร่ง ×1 (มีอยู่ {materialCount})
            </div>
          </>
        ) : (
          <div className="text-xs text-neutral-500">— ยังไม่ได้เลือกอุปกรณ์ —</div>
        )}

        <div
          className={`rounded px-2 py-1 text-xs ${
            state === "SUCCESS"
              ? "bg-emerald-900/50 text-emerald-200"
              : state === "READY"
                ? "text-neutral-300"
                : "bg-neutral-900/60 text-neutral-300"
          }`}
        >
          {enhanceStateMessage(state)}
        </div>

        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          className="w-full rounded bg-amber-700/80 px-2 py-2 font-semibold text-black hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          ยืนยันเสริมแกร่ง
        </button>
      </div>
    </Panel>
  );
}
