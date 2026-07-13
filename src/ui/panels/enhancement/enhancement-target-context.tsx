"use client";

// Enhancement target context (P2-10) — เก็บ instanceId ของ item ที่กำลังจะเสริมแกร่งอยู่ตอนนี้ ให้ทั้ง
// InventoryPanel (ปุ่ม "เสริมแกร่ง" ตั้งค่า target แล้ว openPanel) และ EnhancementHudButton (เปิดตรง ๆ
// โดยไม่มี target = NO_ITEM) เขียน/อ่านค่าเดียวกันได้โดยไม่ต้อง prop-drill.
//
// ตัดสินใจ (ตาม pattern เดียวกับ PanelContext.tsx — ดู rationale comment ที่นั่น): เก็บเป็น React Context
// แยกเอกเทศ ไม่ใช่ Zustand gameStore (HudState = engine→UI snapshot เท่านั้น ตาม contract docs/context/ui.md)
// และไม่ผูกกับ panel-stack.ts (panel framework ไม่รู้จัก "target ของ panel ไหน" — เป็นเรื่องเฉพาะจอ
// enhancement เท่านั้น ผูกเข้า framework กลางจะทำให้ shop/help-hint panel ถัดไปต้องแบกคอนเซปต์นี้ไปด้วยเปล่า ๆ).

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface EnhancementTarget {
  /** instanceId ของ item ที่เลือกไว้ล่าสุดให้ enhancement panel แสดง — null = ยังไม่เลือก (NO_ITEM) */
  targetId: string | null;
  setTarget(id: string | null): void;
}

const EnhancementTargetContext = createContext<EnhancementTarget | null>(null);

export function EnhancementTargetProvider({ children }: { children: ReactNode }) {
  const [targetId, setTargetId] = useState<string | null>(null);

  const value = useMemo<EnhancementTarget>(
    () => ({ targetId, setTarget: setTargetId }),
    [targetId],
  );

  return (
    <EnhancementTargetContext.Provider value={value}>{children}</EnhancementTargetContext.Provider>
  );
}

/** hook ใช้ใน InventoryPanel/EnhancementPanel/EnhancementHudButton — ต้องอยู่ใต้ <EnhancementTargetProvider> */
export function useEnhancementTarget(): EnhancementTarget {
  const ctx = useContext(EnhancementTargetContext);
  if (!ctx) throw new Error("useEnhancementTarget ต้องเรียกใต้ <EnhancementTargetProvider> เท่านั้น");
  return ctx;
}
