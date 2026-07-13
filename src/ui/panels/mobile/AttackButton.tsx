"use client";

// ปุ่มโจมตี (P2-15, Bible 3.4 · L11 touch mode) — มุมขวาล่าง (มือถือ, แทน Space). กด → engine.pressAttack()
// = target assist (keyboardAssist 0.65 tile, Combat Bible §3) auto-engage มอนใกล้ตัว / ตีไปทางหน้า (ดู
// pressAttack ใน engine/runtime/app.ts). imperative ผ่าน EngineHandle เท่านั้น. hit target ใหญ่ + safe-area.

import type { EngineHandle } from "@/engine/runtime/app";

export interface AttackButtonProps {
  getHandle: () => EngineHandle | null;
}

export function AttackButton({ getHandle }: AttackButtonProps) {
  return (
    <button
      type="button"
      aria-label="โจมตี"
      // pointerdown (ไม่ใช่ onClick) → ตอบสนองทันทีแบบเกม, ไม่รอ click ปล่อยนิ้ว
      onPointerDown={(e) => {
        e.preventDefault();
        getHandle()?.pressAttack();
      }}
      // Fire family (warm/aggressive action tone) แทน raw red — Danger Red สงวนไว้กับ "immediate danger/
      // invalid action" (VLB §3), ปุ่มโจมตีคือ core combat action ไม่ใช่คำเตือน
      className="dp-shadow-raised pointer-events-auto fixed z-40 flex touch-none items-center justify-center select-none rounded-(--dp-radius-pill) border-2 border-(--dp-danger-red) bg-(--dp-fire-deep) font-bold text-(--dp-highlight) active:bg-(--dp-danger-red)"
      style={{
        right: "calc(env(safe-area-inset-right, 0px) + 24px)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
        width: 84,
        height: 84,
      }}
    >
      โจมตี
    </button>
  );
}
