"use client";

// Mobile OS notice banner (P2-15, ฝากจาก P2-13/D-056) — บนมือถือ แสดงครั้งเดียว (จำใน localStorage),
// dismiss ได้. เนื้อความ: แท็บพื้นหลังบนมือถืออาจถูก OS ปิด — กลับมาแล้ว reconnect อัตโนมัติ. logic
// show-once pure อยู่ os-notice-storage.ts (เทสต์ตรง) — คอมโพเนนต์นี้แค่ต่อ DOM + useIsMobilePanel.

import { useState } from "react";
import { useIsMobilePanel } from "@/ui/panels";
import {
  MOBILE_OS_NOTICE_TEXT,
  createOsNoticeStore,
  shouldShowOsNotice,
} from "./os-notice-storage";

const store = createOsNoticeStore();

export function MobileOsNotice() {
  const isMobile = useIsMobilePanel();
  // อ่าน dismissed ครั้งเดียวตอน mount (lazy) — จำข้าม reload ผ่าน localStorage
  const [dismissed, setDismissed] = useState<boolean>(() => store.isDismissed());

  if (!shouldShowOsNotice(isMobile, dismissed)) return null;

  return (
    <div
      role="status"
      className="pointer-events-auto fixed inset-x-0 z-[60] mx-auto flex max-w-md items-start gap-2 rounded-lg border border-amber-700/50 bg-neutral-950/95 px-3 py-2 text-xs text-neutral-100 shadow-2xl"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 8px)", width: "min(92vw, 28rem)" }}
    >
      <span className="flex-1 leading-snug">{MOBILE_OS_NOTICE_TEXT}</span>
      <button
        type="button"
        aria-label="ปิดข้อความ"
        onClick={() => {
          store.markDismissed();
          setDismissed(true);
        }}
        className="shrink-0 rounded px-2 py-0.5 text-amber-200 hover:bg-white/10"
      >
        รับทราบ
      </button>
    </div>
  );
}
