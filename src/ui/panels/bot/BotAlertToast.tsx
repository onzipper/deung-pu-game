"use client";

// Bot alert toast (7b-UI, P3 §9 "P8 — Rare/High-value Alert") — bot:alert (rare/captcha/gold_cap) ต้องเด่น
// + แจ้งทันที (เป็น 1 ใน 9 mandatory stops, §14 ห้าม dark pattern แต่ alert นี้ "แจ้งชัด" ไม่ใช่ upsell).
// อ่าน botAlert.atMs จาก store — ค่า atMs เปลี่ยน = แจ้งเตือนใหม่ → แสดง toast แล้ว auto-dismiss (pattern
// เดียวกับ AchievementToast/MilestoneToast). ไอเทมที่เจอถูกเก็บเข้ากระเป๋าแล้วตาม loot filter (ไม่หาย) —
// toast นี้แค่แจ้ง ไม่ต้องกดยืนยันอะไร (ต่างจาก market purchase/enhancement ที่ต้อง confirm modal).

import { useEffect, useState } from "react";
import { useGameStore } from "@/ui/store/use-game-store";
import { selectBotAlert } from "@/ui/store/game-store";
import { Toast, ToastViewport } from "@/ui/components/Toast";

/** ระยะแสดง bot alert toast (ms) — operational const เหมือน ACHIEVEMENT_TOAST_MS, ไม่ใช่ balance. */
const BOT_ALERT_TOAST_MS = 6000;

const KIND_LABEL: Readonly<Record<string, string>> = {
  rare: "เจอของแรร์",
  captcha: "ต้องยืนยันตัวตน",
  gold_cap: "ถึงเพดานทอง",
};

export function BotAlertToast() {
  const alert = useGameStore(selectBotAlert);
  // dismissedAt = atMs ที่ปิด toast ไปแล้ว (auto หลัง timer / กดปิด) — pattern เดียวกับ AchievementToast
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const atMs = alert?.atMs ?? null;

  useEffect(() => {
    if (atMs === null) return; // ยังไม่เคยมีแจ้งเตือนใน session นี้
    const timer = setTimeout(() => setDismissedAt(atMs), BOT_ALERT_TOAST_MS);
    return () => clearTimeout(timer); // แจ้งเตือนใหม่ (atMs เปลี่ยน) → รีเซ็ตตัวจับเวลา
  }, [atMs]);

  if (alert === null || atMs === dismissedAt) return null;

  const label = KIND_LABEL[alert.kind] ?? "แจ้งเตือนจากบอท";
  return (
    <ToastViewport>
      <Toast
        type="warning"
        message={`${label}${alert.itemId ? ` — ${alert.itemId}` : ""} · ${alert.message}`}
        onDismiss={() => setDismissedAt(atMs)}
      />
    </ToastViewport>
  );
}
