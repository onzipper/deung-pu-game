"use client";

// Mobile OS notice banner (P2-15, ฝากจาก P2-13/D-056) — บนมือถือ แสดงครั้งเดียว (จำใน localStorage),
// dismiss ได้. เนื้อความ: แท็บพื้นหลังบนมือถืออาจถูก OS ปิด — กลับมาแล้ว reconnect อัตโนมัติ. logic
// show-once pure อยู่ os-notice-storage.ts (เทสต์ตรง) — คอมโพเนนต์นี้แค่ต่อ DOM + useIsMobilePanel.
//
// ใช้ Toast component (§4.7, type="info" = teal accent) เป็น chrome จริง — banner นี้คือ use case จริงตัว
// แรกของ Toast (ไม่ใช่ floating toast queue เต็มรูปแบบ, แค่ 1 ข้อความ show-once).

import { useState } from "react";
import { useIsMobilePanel } from "@/ui/panels";
import { Toast } from "@/ui/components";
import { MOBILE_OS_NOTICE_TEXT, createOsNoticeStore, shouldShowOsNotice } from "./os-notice-storage";

const store = createOsNoticeStore();

export function MobileOsNotice() {
  const isMobile = useIsMobilePanel();
  // อ่าน dismissed ครั้งเดียวตอน mount (lazy) — จำข้าม reload ผ่าน localStorage
  const [dismissed, setDismissed] = useState<boolean>(() => store.isDismissed());

  if (!shouldShowOsNotice(isMobile, dismissed)) return null;

  const onDismiss = (): void => {
    store.markDismissed();
    setDismissed(true);
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] mx-auto flex justify-center px-3"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      <div className="pointer-events-auto w-full" style={{ width: "min(92vw, 28rem)" }}>
        <Toast type="info" message={MOBILE_OS_NOTICE_TEXT} actionLabel="รับทราบ" onAction={onDismiss} />
      </div>
    </div>
  );
}
