// Party id resolution (P1-08, GS §59.3) — **pure**, ไม่แตะ window/pixi/colyseus.
//
// P1 minimal party primitive: ยังไม่มี invite/leader UI (P2). สำหรับทดสอบ party sync ผู้เล่นตั้ง partyId
// ผ่าน URL query `?party=xyz` — 2 tab ที่ใส่ ?party=A เดียวกันจะถูก server จับลง channel เดียวกัน
// (filterBy(['mapId','partyId'])). ไม่มี query → ใช้ค่า default จาก config (ปกติ "" = solo).
//
// แยกเป็น pure fn (รับ search string) เพื่อเทสต์ได้โดยไม่ต้องมี window/jsdom; glue เรียกจาก app.ts
// ด้วย window.location.search (guard SSR/no-window).

/**
 * ดึง partyId จาก query string (`?party=xyz`) — trim แล้วคืน; ว่าง/ไม่มี → fallback.
 * รับได้ทั้ง "?party=A", "party=A", "" (URLSearchParams จัดการ prefix `?` ให้เอง).
 */
export function resolvePartyId(search: string, fallback: string): string {
  try {
    const raw = new URLSearchParams(search).get("party");
    if (raw === null) return fallback;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  } catch {
    return fallback;
  }
}

/** partyId จาก browser location (guard no-window เช่น SSR/test) → fallback ถ้าไม่มี window. */
export function partyIdFromLocation(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return resolvePartyId(window.location.search, fallback);
}
