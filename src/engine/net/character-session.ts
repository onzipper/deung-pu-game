// Selected-character read (P2-05, Storage §5/§7) — glue เล็ก ๆ อ่าน characterId ที่ Game Hub เขียนไว้ใน
// sessionStorage แล้วส่งเข้า joinOptions.characterId ตอน /game boot. guard no-window (SSR/test) → undefined.
//
// เขียนโดย hub (Continue button, src/app/hub/**); อ่านที่นี่ (app.ts). key = shared constant (net-protocol)
// ให้ทั้งสองฝั่งตรงกัน. **ไม่เคลียร์หลังอ่าน** — refresh /game คงตัวละครเดิม (ไปเลือกใหม่ที่ hub = overwrite).
//
// owner-report#6 fix: readSelectedCharacterMapId/rememberSelectedCharacterMapId คู่กัน — hub เขียน mapId
// ล่าสุดตอน "เข้าเกม" (จาก CharacterView.lastMapId), engine boot อ่านมาเลือก map แทน DEFAULT_MAP_ID เสมอ;
// engine เขียนทับเองตอน transition ข้าม map (app.ts requestTransition) กัน refresh กลาง /game ได้ map เก่า.

import {
  SELECTED_CHARACTER_STORAGE_KEY,
  SELECTED_CHARACTER_MAP_STORAGE_KEY,
} from "@/shared/net-protocol";

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

/** อ่าน mapId ล่าสุดของตัวละครที่เลือก (จาก sessionStorage) — ไม่มี/no-window/error → undefined (boot default). */
export function readSelectedCharacterMapId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(SELECTED_CHARACTER_MAP_STORAGE_KEY);
    const trimmed = raw?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/** จำ mapId ปัจจุบัน (best-effort, เงียบเมื่อ sessionStorage ใช้ไม่ได้) — เรียกตอน transition ข้าม map สำเร็จ. */
export function rememberSelectedCharacterMapId(mapId: string): void {
  try {
    window.sessionStorage.setItem(SELECTED_CHARACTER_MAP_STORAGE_KEY, mapId);
  } catch {
    // sessionStorage ใช้ไม่ได้ — เงียบ (ไม่กระทบ gameplay, แค่ boot map ผิดรอบหน้า)
  }
}

/**
 * **pure** decision: เลือก mapId ที่จะ boot world แรก (owner-report#6 fix) — `stored` มี + registry รู้จัก
 * (`hasMap(stored)` true) → boot map นั้น (server จะโหลดตำแหน่ง save จริงผ่าน pickLoadPosition +
 * onSelfSpawn adoption ที่มีอยู่แล้ว); ไม่มี/registry ไม่รู้จัก (mapId เก่าค้างจาก build ก่อนหน้า/map ถูกถอด)
 * → `defaultMapId`. แยกจาก readSelectedCharacterMapId (IO) เพื่อเทสต์ตรง ๆ ไม่ต้อง mock sessionStorage.
 */
export function pickBootMapId(
  stored: string | undefined,
  hasMap: (mapId: string) => boolean,
  defaultMapId: string,
): string {
  return stored !== undefined && hasMap(stored) ? stored : defaultMapId;
}
