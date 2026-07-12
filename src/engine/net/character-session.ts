// Selected-character read (P2-05, Storage §5/§7) — glue เล็ก ๆ อ่าน characterId ที่ Game Hub เขียนไว้ใน
// sessionStorage แล้วส่งเข้า joinOptions.characterId ตอน /game boot. guard no-window (SSR/test) → undefined.
//
// เขียนโดย hub (Continue button, src/app/hub/**); อ่านที่นี่ (app.ts). key = shared constant (net-protocol)
// ให้ทั้งสองฝั่งตรงกัน. **ไม่เคลียร์หลังอ่าน** — refresh /game คงตัวละครเดิม (ไปเลือกใหม่ที่ hub = overwrite).

import { SELECTED_CHARACTER_STORAGE_KEY } from "@/shared/net-protocol";

/** อ่าน characterId ที่เลือก (จาก sessionStorage) — ไม่มี/no-window/error → undefined (anonymous). */
export function readSelectedCharacterId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(SELECTED_CHARACTER_STORAGE_KEY);
    const trimmed = raw?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}
