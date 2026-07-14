"use client";

// C1 (Economy §18): milestone reward feedback — toast สั้น ๆ ตอนปลดล็อก milestone (แจก EXP/Gold ครั้งเดียว
// ต่อบัญชี). อ่าน milestoneNotice.atMs จาก store — ค่า atMs เปลี่ยน = milestone ใหม่ → แสดง toast แล้ว auto-dismiss.
// reuse Toast/ToastViewport (E2, token-styled §4.7), pattern เดียวกับ DeathToast. ข้อความ generic (ไม่ตั้งชื่อ
// milestone รายตัว — เป็น UI chrome ไม่ใช่ named in-game content).

import { useEffect, useState } from "react";
import { useGameStore } from "@/ui/store/use-game-store";
import { selectMilestoneNotice } from "@/ui/store/game-store";
import { Toast, ToastViewport } from "@/ui/components/Toast";

/** ระยะแสดง milestone toast (ms) — operational const (§4.7), ไม่ใช่ balance. */
const MILESTONE_TOAST_MS = 4500;

export function MilestoneToast() {
  const notice = useGameStore(selectMilestoneNotice);
  // dismissedAt = atMs ที่ปิด toast ไปแล้ว (auto หลัง timer / กดปิด). visible = derive ตอน render (pure).
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const atMs = notice?.atMs ?? null;

  useEffect(() => {
    if (atMs === null) return; // ยังไม่เคยปลดล็อก
    const timer = setTimeout(() => setDismissedAt(atMs), MILESTONE_TOAST_MS);
    return () => clearTimeout(timer); // milestone ใหม่ (atMs เปลี่ยน) → รีเซ็ตตัวจับเวลา
  }, [atMs]);

  if (notice === null || atMs === dismissedAt) return null;
  const rewards = [
    notice.exp > 0 ? `+${notice.exp} EXP` : null,
    notice.gold > 0 ? `+${notice.gold} ทอง` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <ToastViewport>
      <Toast
        type="success"
        message={rewards ? `ปลดล็อกก้าวสำคัญ! ${rewards}` : "ปลดล็อกก้าวสำคัญ!"}
        onDismiss={() => setDismissedAt(atMs)}
      />
    </ToastViewport>
  );
}
