// /game entry gate (owner-report รอบ 2, Storage §5/§5.3) — จุดตัดสินใจเดียวก่อน mount engine: เลิกเชื่อ
// ค่า hub-time (`lastMapId` ที่ /hub อ่านครั้งเดียวตอนเปิดหน้า) เป็น source สุดท้าย เพราะมันค้าง (กด back
// จากเกมแล้วค่าเก่าไม่ refresh) แล้วเขียนทับ sessionStorage map key ที่ engine เพิ่งอัปเดตเองตอน transition
// → boot ผิด map → server `pickLoadPosition` (gate mapId ตรง room) fallback จุดเริ่ม map. แก้ที่นี่: อ่าน
// ข้อมูลสดจาก API ก่อน mount engine ทุกครั้ง แทนเชื่อ sessionStorage เฉย ๆ. อาการที่สองที่ root เดียวกัน:
// เข้า `/game` ตรง ๆ ทั้งที่ login อยู่ = anonymous ไม่จำตัวละคร (ต้องผ่าน /hub เท่านั้น, Storage §5).
//
// Contracts ที่พึ่ง (อ่านเท่านั้น ไม่แก้):
// - GET /api/auth/session → { ok, authenticated, session:{accountId,isGuest}|null } (src/app/api/auth/session/route.ts)
// - GET /api/characters → 401 ไม่ login | { ok:true, characters:CharacterView[] } (src/app/api/characters/route.ts)
//   CharacterView.lastMapId: string|null (owner-report#6, src/server/characters/service.ts)
//
// **best-effort ทุก fetch**: network error/offline → "mount" เสมอ (ห้าม block dev/offline solo 2-tab flow —
// ดู docs/current-state.md "วิธีรัน realtime local"). ผลลัพธ์เป็น discriminated union ให้ caller (GameCanvas)
// ตัดสินใจ mount engine หรือ router.replace("/hub") เอง — ไฟล์นี้ไม่มี React/next dependency (unit-testable
// ล้วน ๆ ผ่าน DI).

/** ผลตัดสินใจของ gate — mount engine ตามปกติ หรือ redirect ไป Game Hub ก่อน. */
export type GameEntryResult = { action: "mount" } | { action: "redirect-hub" };

/** dependency ที่ฉีดเข้า resolveGameEntry — แยกจาก IO จริงเพื่อเทสต์ไม่ต้อง mock global window/fetch. */
export interface GameEntryDeps {
  /** อ่าน characterId ที่เลือกไว้ (sessionStorage) — {@link readSelectedCharacterId} */
  readCharacterId: () => string | undefined;
  /** fetch ที่ใช้เรียก API (global fetch ตอนใช้จริง; เทสต์ฉีด mock) */
  fetchFn: typeof fetch;
  /** จำ mapId สดของตัวละครที่เลือก — {@link rememberSelectedCharacterMapId} */
  rememberMapId: (mapId: string) => void;
  /** เคลียร์ characterId ที่เลือก (ตัวละครหาย/ถูกลบ/ของบัญชีอื่น) — {@link clearSelectedCharacter} */
  clearCharacterId: () => void;
  /** เคลียร์ mapId ที่เลือก (คู่กับ clearCharacterId หรือเดี่ยวตอนตัวละครยังไม่เคย save) — {@link clearSelectedCharacterMapId} */
  clearMapId: () => void;
}

interface SessionResponseShape {
  ok: boolean;
  authenticated?: boolean;
}

interface CharacterViewShape {
  id: string;
  lastMapId: string | null;
}

interface CharactersResponseShape {
  ok: boolean;
  characters?: CharacterViewShape[];
}

/**
 * ตัดสินใจว่า `/game` mount engine ได้เลย หรือต้อง redirect ไป `/hub` ก่อน — ดูหัวไฟล์สำหรับ root cause
 * เต็ม. เรียกก่อน `createEngine` เสมอ (caller = GameCanvas).
 */
export async function resolveGameEntry(deps: GameEntryDeps): Promise<GameEntryResult> {
  const characterId = deps.readCharacterId();

  if (characterId === undefined) {
    return resolveNoCharacterSelected(deps);
  }
  return resolveCharacterSelected(deps, characterId);
}

/** ไม่มี characterId ที่เลือก — authenticated ต้องผ่าน hub เสมอ (Storage §5), ไม่งั้นปล่อย anonymous mount เดิม. */
async function resolveNoCharacterSelected(deps: GameEntryDeps): Promise<GameEntryResult> {
  // เรียกผ่าน local binding (this=undefined) ไม่ใช่ `deps.fetchFn(...)` (this=deps): type ของ fetchFn คือ
  // `typeof fetch` — caller มักฉีด `fetch` ตรง ๆ ตามธรรมชาติ แต่ browser fetch brand-check this แล้วโยน
  // "Illegal invocation" ถ้าถูกเรียกเป็น method ของ object อื่น → catch ด้านล่างกลืนเงียบเป็น best-effort
  // mount = gate อัมพาต (owner-report#6 รอบ 3; Node/undici ไม่ check this จึงหลุดถึง browser เท่านั้น).
  const doFetch = deps.fetchFn;
  try {
    const res = await doFetch("/api/auth/session");
    if (!res.ok) return { action: "mount" }; // error ที่ไม่ใช่ ok → best-effort ให้เล่นต่อ
    const body = (await res.json()) as SessionResponseShape;
    const authenticated = body.ok === true && body.authenticated === true;
    return authenticated ? { action: "redirect-hub" } : { action: "mount" };
  } catch {
    return { action: "mount" }; // network error/offline → dev/offline solo flow ต้องรอด
  }
}

/** มี characterId ที่เลือก — ตรวจ ownership สด + sync mapId ก่อน mount. */
async function resolveCharacterSelected(
  deps: GameEntryDeps,
  characterId: string,
): Promise<GameEntryResult> {
  const doFetch = deps.fetchFn; // local binding (this=undefined) — ดู resolveNoCharacterSelected
  try {
    const res = await doFetch("/api/characters");
    if (res.status === 401) return { action: "redirect-hub" };
    if (!res.ok) return { action: "mount" }; // error อื่น (500 ฯลฯ) → best-effort ใช้ sessionStorage เดิม
    const body = (await res.json()) as CharactersResponseShape;
    if (body.ok !== true || !body.characters) return { action: "mount" };

    const found = body.characters.find((c) => c.id === characterId);
    if (!found) {
      // ถูกลบ/ของบัญชีอื่น — เคลียร์ selection กันวนกลับด้วยค่าตายแล้ว
      deps.clearCharacterId();
      deps.clearMapId();
      return { action: "redirect-hub" };
    }

    if (found.lastMapId !== null) {
      deps.rememberMapId(found.lastMapId);
    } else {
      deps.clearMapId(); // ตัวละครยังไม่เคย save — อย่าค้างค่า map เก่า
    }
    return { action: "mount" };
  } catch {
    return { action: "mount" }; // fetch fail/network → best-effort ใช้ค่า sessionStorage เดิม
  }
}
