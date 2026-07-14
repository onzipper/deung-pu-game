"use client";

// Auto Pilot HUD chip (Batch 7a, D-037) — โชว์สถานะ auto-walk: กำลังเดิน ("กำลังเดินอัตโนมัติ… ✖หยุด",
// คลิก = หยุด) หรือ เพิ่งหยุด (โชว์เหตุผลสั้น ๆ แล้ว auto-dismiss). อ่าน state จาก game-store (engine publish
// จาก AutoPilotStateChange, ui.md contract: store read-only ฝั่ง UI). หยุดสั่งผ่าน EngineHandle.stopAutoPilot()
// (imperative command ต้องผ่าน EngineHandle เหมือน closeDialogue/pressAttack — engine ไม่ import React).

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import { useGameStore } from "@/ui/store/use-game-store";
import {
  selectAutoPilotActive,
  selectAutoPilotStopReason,
  selectAutoPilotStopAtMs,
  type AutoPilotStopReasonView,
} from "@/ui/store/game-store";

/** เหตุผลหยุด → ข้อความไทย (D-037 brief §3). */
const STOP_REASON_LABEL_TH: Readonly<Record<AutoPilotStopReasonView, string>> = {
  arrived: "ถึงแล้ว",
  manual: "หยุดเอง",
  combat: "เข้าสู่การต่อสู้",
  tabHidden: "สลับแท็บ",
  noPath: "ไม่มีเส้นทาง",
  transition: "ข้ามแผนที่",
  disconnect: "หลุดการเชื่อมต่อ",
};

/** ระยะโชว์ chip เหตุผลหยุด (ms) — operational const, ไม่ใช่ balance. */
const STOP_CHIP_MS = 2500;

export interface AutoPilotChipProps {
  /** อ่าน engine handle ปัจจุบัน (pattern เดียวกับ DialoguePanel/Minimap). */
  getHandle: () => EngineHandle | null;
}

export function AutoPilotChip({ getHandle }: AutoPilotChipProps) {
  const active = useGameStore(selectAutoPilotActive);
  const stopReason = useGameStore(selectAutoPilotStopReason);
  const stopAtMs = useGameStore(selectAutoPilotStopAtMs);
  // dismissedAt = stop timestamp ที่ปิด chip ไปแล้ว (auto หลัง timer). visible = derive ตอน render (pure) →
  // เลี่ยง setState synchronous ใน effect (pattern เดียวกับ DeathToast).
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (stopAtMs === null) return;
    const timer = setTimeout(() => setDismissedAt(stopAtMs), STOP_CHIP_MS);
    return () => clearTimeout(timer); // หยุดรอบใหม่ (stopAtMs เปลี่ยน) → รีเซ็ตตัวจับเวลา
  }, [stopAtMs]);

  // กำลังเดิน = chip พร้อมปุ่มหยุด (ชนะการโชว์เหตุผลหยุดเสมอ)
  if (active) {
    return (
      <div className="pointer-events-auto fixed bottom-28 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-(--dp-radius-md) border border-(--dp-warm-wood) bg-(--dp-deep-brown)/95 px-3 py-1 text-[12px] text-(--dp-parchment) dp-shadow-raised">
        <span aria-hidden>🧭</span>
        <span>กำลังเดินอัตโนมัติ…</span>
        <button
          type="button"
          onClick={() => getHandle()?.stopAutoPilot()}
          aria-label="หยุดเดินอัตโนมัติ"
          className="rounded-(--dp-radius-sm) bg-(--dp-danger-red)/80 px-1.5 leading-tight text-(--dp-parchment) hover:bg-(--dp-danger-red)"
        >
          ✖ หยุด
        </button>
      </div>
    );
  }

  // เพิ่งหยุด → โชว์เหตุผลสั้น ๆ
  const showStop = stopReason !== null && stopAtMs !== null && stopAtMs !== dismissedAt;
  if (!showStop) return null;
  return (
    <div className="pointer-events-none fixed bottom-28 left-1/2 z-30 -translate-x-1/2 rounded-(--dp-radius-md) border border-(--dp-warm-wood) bg-(--dp-deep-brown)/95 px-3 py-1 text-[12px] text-(--dp-parchment) dp-shadow-raised">
      เดินอัตโนมัติ: {STOP_REASON_LABEL_TH[stopReason]}
    </div>
  );
}
