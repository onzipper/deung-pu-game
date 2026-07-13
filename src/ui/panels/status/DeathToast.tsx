"use client";

// E4 death feedback (P2 UI §13 · owner ruling 2026-07-13 = "instant respawn + toast สั้น"): respawn เป็น instant
// server-side (§59.1 anti-exploit) → ไม่มีจอตายค้าง; แค่ toast สั้น ๆ ตอนตาย ("ล้มแล้ว เกิดที่ค่ายปลอดภัย").
// อ่าน deathAtMs จาก store — ค่าเปลี่ยน = ตายรอบใหม่ → แสดง toast แล้ว auto-dismiss. reuse Toast/ToastViewport
// (E2, token-styled §4.7). NB: full death screen §13.1 (countdown/CTA/combat summary) = เลื่อน (owner เลือกทาง toast).

import { useEffect, useState } from "react";
import { useGameStore } from "@/ui/store/use-game-store";
import { selectDeathAtMs } from "@/ui/store/game-store";
import { Toast } from "@/ui/components/Toast";

/** ระยะแสดง death toast (ms) — operational const (§4.7 error toast persist), ไม่ใช่ balance. */
const DEATH_TOAST_MS = 4000;

export function DeathToast() {
  const deathAtMs = useGameStore(selectDeathAtMs);
  // dismissedAt = death timestamp ที่ปิด toast ไปแล้ว (auto หลัง timer / กดปิด). visible = derive ตอน render (pure)
  // → เลี่ยง setState synchronous ใน effect (setState เกิดเฉพาะใน timeout/handler = async).
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (deathAtMs === null) return; // ยังไม่เคยตาย
    const timer = setTimeout(() => setDismissedAt(deathAtMs), DEATH_TOAST_MS);
    return () => clearTimeout(timer); // ตายซ้ำ (deathAtMs เปลี่ยน) → รีเซ็ตตัวจับเวลา
  }, [deathAtMs]);

  const visible = deathAtMs !== null && deathAtMs !== dismissedAt;
  if (!visible) return null;
  return (
    // E4 (owner feedback): แสดง "กลางจอ" ให้เด่น (ไม่ใช่มุมบนแบบ toast ปกติ). container ไม่รับ pointer (Toast รับเอง).
    <div className="pointer-events-none fixed inset-0 z-(--dp-z-toast) flex items-center justify-center px-4">
      <Toast
        type="error"
        message="คุณล้มลงแล้ว — เกิดใหม่ที่ค่ายปลอดภัย"
        onDismiss={() => setDismissedAt(deathAtMs)}
      />
    </div>
  );
}
