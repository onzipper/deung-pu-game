// P2-05 (Storage §5/§7) — Game Hub "เข้าเกม": จำ characterId ที่ผู้เล่นเลือกลง sessionStorage (per-tab)
// ก่อน navigate ไป /game. /game (engine app.ts) อ่านค่านี้ผ่าน readSelectedCharacterId แล้วแนบ joinOptions.
// key = shared constant (net-protocol) ให้ hub เขียน / engine อ่าน ตรงกัน.

import { SELECTED_CHARACTER_STORAGE_KEY } from "@/shared/net-protocol";

/** จำ characterId ที่เลือกเข้าเกม (client-only, best-effort — sessionStorage ปิด/quota → เงียบ, join anonymous). */
export function rememberSelectedCharacter(characterId: string): void {
  try {
    window.sessionStorage.setItem(SELECTED_CHARACTER_STORAGE_KEY, characterId);
  } catch {
    // sessionStorage ใช้ไม่ได้ (private mode/quota) — ปล่อยผ่าน (server จะ spawn default anonymous)
  }
}
