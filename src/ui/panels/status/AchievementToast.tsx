"use client";

// C2b (Achievement spec §7.1): achievement unlock feedback — toast สั้น ๆ ตอน auto-claim (ครั้งเดียวต่อ scope).
// อ่าน achievementNotice.atMs จาก store — ค่า atMs เปลี่ยน = achievement ใหม่ → แสดง toast แล้ว auto-dismiss.
// reuse Toast/ToastViewport (E2, token-styled §4.7), pattern เดียวกับ MilestoneToast (sibling). ต่างจาก milestone
// ตรงที่ achievement มี "ชื่อ" จริง (named in-game content §15) → แสดงชื่อไทยได้; reward = gold/title เป็น chrome.

import { useEffect, useState } from "react";
import { useGameStore } from "@/ui/store/use-game-store";
import { selectAchievementNotice } from "@/ui/store/game-store";
import { Toast, ToastViewport } from "@/ui/components/Toast";

/** ระยะแสดง achievement toast (ms) — operational const (§7.1 "4–6 วินาที"), ไม่ใช่ balance. */
const ACHIEVEMENT_TOAST_MS = 5000;

export function AchievementToast() {
  const notice = useGameStore(selectAchievementNotice);
  // dismissedAt = atMs ที่ปิด toast ไปแล้ว (auto หลัง timer / กดปิด). visible = derive ตอน render (pure).
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const atMs = notice?.atMs ?? null;

  useEffect(() => {
    if (atMs === null) return; // ยังไม่เคยปลดล็อก
    const timer = setTimeout(() => setDismissedAt(atMs), ACHIEVEMENT_TOAST_MS);
    return () => clearTimeout(timer); // achievement ใหม่ (atMs เปลี่ยน) → รีเซ็ตตัวจับเวลา
  }, [atMs]);

  if (notice === null || atMs === dismissedAt) return null;
  const reward = notice.gold && notice.gold > 0 ? ` (+${notice.gold} ทอง)` : notice.titleId ? " (ได้ฉายา)" : "";
  return (
    <ToastViewport>
      <Toast
        type="success"
        message={`ปลดล็อก Achievement! “${notice.nameTh}”${reward}`}
        onDismiss={() => setDismissedAt(atMs)}
      />
    </ToastViewport>
  );
}
