// P2-05 (Storage §5/§7) — Game Hub "เข้าเกม": จำ characterId ที่ผู้เล่นเลือกลง sessionStorage (per-tab)
// ก่อน navigate ไป /game. /game (engine app.ts) อ่านค่านี้ผ่าน readSelectedCharacterId แล้วแนบ joinOptions.
// key = shared constant (net-protocol) ให้ hub เขียน / engine อ่าน ตรงกัน.
//
// owner-report#6 fix: เขียน lastMapId คู่กัน (key ที่สอง) → /game boot map เดียวกับที่ save ไว้แทน
// DEFAULT_MAP_ID เสมอ (ก่อนหน้านี้ boot ผิด map ทำให้ pickLoadPosition ฝั่ง server ทิ้งตำแหน่ง save).

import {
  SELECTED_CHARACTER_STORAGE_KEY,
  SELECTED_CHARACTER_MAP_STORAGE_KEY,
} from "@/shared/net-protocol";

/**
 * จำ characterId + mapId ล่าสุดที่เลือกเข้าเกม (client-only, best-effort — sessionStorage ปิด/quota →
 * เงียบ, join anonymous/boot DEFAULT_MAP_ID). `lastMapId` = null (ตัวละครใหม่ยังไม่เคย save) → ลบ key
 * mapId ทิ้ง กันค่าเก่าจากตัวละครก่อนหน้าค้าง (เลือกตัวละครใหม่ที่ยังไม่เคยเข้าเกม แต่ key เก่ายังอยู่).
 */
export function rememberSelectedCharacter(characterId: string, lastMapId: string | null): void {
  try {
    window.sessionStorage.setItem(SELECTED_CHARACTER_STORAGE_KEY, characterId);
    if (lastMapId) {
      window.sessionStorage.setItem(SELECTED_CHARACTER_MAP_STORAGE_KEY, lastMapId);
    } else {
      window.sessionStorage.removeItem(SELECTED_CHARACTER_MAP_STORAGE_KEY);
    }
  } catch {
    // sessionStorage ใช้ไม่ได้ (private mode/quota) — ปล่อยผ่าน (server จะ spawn default anonymous)
  }
}
