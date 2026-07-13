"use client";

// ปุ่ม context help "?" เล็ก ๆ (P2-12, DG §5.4) — ฝังในจอระบบ (Inventory/Enhancement/Shop panel) กดแล้วเปิด
// HelpPanel โฟกัสบทความของจอนั้นตรง ๆ ("เปิดคำอธิบายเฉพาะหน้าปัจจุบัน... ไม่เปลี่ยนหน้าผู้เล่นโดยอัตโนมัติ").

import { usePanelManager } from "@/ui/panels";
import { HELP_PANEL_ID } from "./help-view";
import { useHelpFocus } from "./help-focus-context";

export interface ContextHelpButtonProps {
  /** id ของ HelpArticle ที่จะโฟกัสตรง ๆ (ดู help-articles.ts) */
  articleId: string;
}

export function ContextHelpButton({ articleId }: ContextHelpButtonProps) {
  const manager = usePanelManager();
  const { setFocusedArticleId } = useHelpFocus();

  return (
    <button
      type="button"
      onClick={() => {
        setFocusedArticleId(articleId);
        manager.openPanel(HELP_PANEL_ID);
      }}
      aria-label="ช่วยเหลือ"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-700/50 text-[11px] font-bold text-amber-300 hover:bg-amber-900/40"
    >
      ?
    </button>
  );
}
