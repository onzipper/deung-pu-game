"use client";

// HudRoot — layout owner ของ HUD ทั้งชุด (M5 §1). ครอบด้วย fixed inset-0 pointer-events-none แล้วแยกลูกเป็น
// 7 slot ตามชื่อมาตรฐาน (hud-layout.ts HudSlotName) — organizational only: แต่ละ widget ยังคุมตำแหน่งพิกเซล
// จริงด้วย fixed classes ของตัวเอง (Minimap/StatusCluster/SkillBar/WorldStatusChip/AutoPilotChip/BotStatusChip/
// UtilityDock ล้วน pointer-events-auto/none + fixed position เองอยู่แล้ว, pattern เดิมทั้งโปรเจกต์) — HudRoot
// ไม่ reposition ซ้ำ กัน conflict กับ safe-area calc เฉพาะทางที่แต่ละ widget ทำไว้แล้ว. ดู hud-layout.ts header
// comment: z-index semantics (chips 30 / joystick 40 / ปุ่ม+dock 50 / panels 60+ / toast token) ไม่เปลี่ยน.
//
// ไม่ผ่านที่นี่ (mount ตรงใน GameCanvas.tsx เหมือนเดิม): DebugOverlay, MobileControls, toasts (ToastViewport
// ผ่านระบบเดิม), <Panel> ทุกอัน — brief M5 §1.

import type { ReactNode } from "react";
import type { HudSlotName } from "./hud-layout";

// camelCase prop names (ergonomic JSX call site, GameCanvas.tsx) → HudSlotName (kebab, hud-layout.ts) แค่
// สำหรับ `data-hud-slot` debug attribute — ไม่มีผลต่อ layout จริง (ดู header comment ด้านบน).
const SLOT_NAME: Readonly<Record<keyof HudRootSlots, HudSlotName>> = {
  topLeft: "top-left",
  topCenter: "top-center",
  topRight: "top-right",
  rightRail: "right-rail",
  bottomLeft: "bottom-left",
  bottomCenter: "bottom-center",
  bottomRight: "bottom-right",
};

export interface HudRootSlots {
  topLeft?: ReactNode;
  topCenter?: ReactNode;
  topRight?: ReactNode;
  rightRail?: ReactNode;
  bottomLeft?: ReactNode;
  bottomCenter?: ReactNode;
  bottomRight?: ReactNode;
}

export function HudRoot(slots: HudRootSlots) {
  return (
    <div className="pointer-events-none fixed inset-0">
      {(Object.keys(SLOT_NAME) as (keyof HudRootSlots)[]).map((key) => (
        <div key={key} data-hud-slot={SLOT_NAME[key]}>
          {slots[key]}
        </div>
      ))}
    </div>
  );
}
