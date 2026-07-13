"use client";

// Help focus context (P2-12) — เก็บ articleId ที่ HelpPanel ควรเปิดตรง ๆ ตอนนี้ (context help "?" บนจอระบบ
// ตั้งค่านี้แล้ว openPanel HELP_PANEL_ID, DG §5.4) ให้ ContextHelpButton (ฝัง Inventory/Enhancement/Shop
// panel) กับ HelpPanel อ่าน/เขียนค่าเดียวกันได้โดยไม่ต้อง prop-drill — pattern เดียวกับ
// enhancement-target-context.tsx (React Context เฉพาะเรื่อง, ไม่ใช่ Zustand gameStore/panel-stack.ts
// ตาม rationale เดียวกับที่นั่น: นี่เป็นเรื่องเฉพาะจอ help ไม่ใช่ engine→UI snapshot หรือ panel framework กลาง).

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface HelpFocus {
  /** articleId ที่ควรเปิดตรง ๆ เมื่อ HelpPanel เปิดขึ้นมา — null = เปิดที่แท็บล่าสุดตามปกติ (ไม่ focus บทความไหน) */
  focusedArticleId: string | null;
  setFocusedArticleId(id: string | null): void;
}

const HelpFocusContext = createContext<HelpFocus | null>(null);

export function HelpFocusProvider({ children }: { children: ReactNode }) {
  const [focusedArticleId, setFocusedArticleId] = useState<string | null>(null);

  const value = useMemo<HelpFocus>(
    () => ({ focusedArticleId, setFocusedArticleId }),
    [focusedArticleId],
  );

  return <HelpFocusContext.Provider value={value}>{children}</HelpFocusContext.Provider>;
}

/** hook ใช้ใน ContextHelpButton/HelpPanel — ต้องอยู่ใต้ <HelpFocusProvider> เท่านั้น */
export function useHelpFocus(): HelpFocus {
  const ctx = useContext(HelpFocusContext);
  if (!ctx) throw new Error("useHelpFocus ต้องเรียกใต้ <HelpFocusProvider> เท่านั้น");
  return ctx;
}
