"use client";

// M4 §7 — takeover toast: game-store.ts stamps botManualControlNoticeAtMs ทุกครั้งที่ authority เปลี่ยนจาก
// bot คุม → ผู้เล่นคุมเอง (ขยับ/กดโจมตี/สัมผัสจอ ฯลฯ, ไม่ผูกกับปุ่มไหน). pattern เดียวกับ BotAlertToast.tsx
// (ToastViewport + auto-dismiss timer, atMs เปลี่ยน = แจ้งเตือนใหม่).

import { useEffect, useState } from "react";
import { useGameStore } from "@/ui/store/use-game-store";
import { selectBotManualControlNoticeAtMs } from "@/ui/store/game-store";
import { Toast, ToastViewport } from "@/ui/components/Toast";
import { BOT_TAKEOVER_TOAST_MESSAGE } from "./bot-view";

/** ระยะแสดง takeover toast (ms) — operational const เหมือน BOT_ALERT_TOAST_MS, ไม่ใช่ balance */
const BOT_TAKEOVER_TOAST_MS = 6000;

export function BotTakeoverToast() {
  const atMs = useGameStore(selectBotManualControlNoticeAtMs);
  // dismissedAt = atMs ที่ปิด toast ไปแล้ว (auto หลัง timer / กดปิด) — pattern เดียวกับ BotAlertToast
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (atMs === null) return; // ยังไม่เคยมี takeover ใน session นี้
    const timer = setTimeout(() => setDismissedAt(atMs), BOT_TAKEOVER_TOAST_MS);
    return () => clearTimeout(timer); // takeover ใหม่ (atMs เปลี่ยน) → รีเซ็ตตัวจับเวลา
  }, [atMs]);

  if (atMs === null || atMs === dismissedAt) return null;

  return (
    <ToastViewport>
      <Toast type="info" message={BOT_TAKEOVER_TOAST_MESSAGE} onDismiss={() => setDismissedAt(atMs)} />
    </ToastViewport>
  );
}
