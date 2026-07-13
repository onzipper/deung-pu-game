// fix/level-persist-map-cross — cross-room in-process progression carrier (P2-09 · Storage §5/§7).
//
// ปัญหา: map-cross = leave room เดิม → join room ปลายทาง (คนละ MapRoom instance). progression (level/exp)
//   อยู่ใน per-room `sessionProgress` (in-memory) — เดิม carry ข้าม map ผ่าน DB เท่านั้น. ไม่มี DATABASE_URL
//   (local dev) หรือ session ไม่มี characterId ผูก (มีแต่ accountId) → ไม่มีตัวขน progression ข้ามห้อง →
//   ทุกครั้งที่ข้าม map = room ใหม่ = re-init level 1 (bug: level reset).
//
// วิธีแก้: ทุก MapRoom instance อยู่ใน process เดียวกัน = แชร์ module scope. เก็บ {level,exp} ล่าสุดไว้ที่นี่
//   ตอน leave/transition แล้วอ่านกลับตอน join ห้องใหม่ ทำให้ level รอดข้าม map แม้ไม่มี DB.
//
// **ความปลอดภัย (server-authoritative):** key = identity ที่ **server verify แล้วเท่านั้น** (characterId/
//   accountId จาก onAuth/JWT ผ่าน client.auth) — ไม่เคยใช้ค่าดิบจาก client. server เขียนฝ่ายเดียว; client
//   อ่าน/เขียน cache นี้ไม่ได้. DB ยังเป็น durable authority (recall ใช้ต่อเมื่อ DB โหลดไม่ได้). session ที่
//   ไม่มี identity ที่ verify (anonymous จริง ๆ: ไม่มี token/DB) → คืน null key → ไม่ carry (fallback lv1) —
//   ไม่แต่ง client-trust ให้ปลอมของคนอื่นได้.

/** progression ที่ขนข้ามห้อง (level + cumulative exp) — subset เดียวกับ sessionProgress. */
export interface CarriedProgress {
  level: number;
  exp: number;
}

/**
 * pure: เลือก stable key สำหรับ carrier จาก identity ที่ server verify แล้ว. prefix กันชนกันระหว่าง
 * characterId กับ accountId ที่บังเอิญเป็น string เดียวกัน. คืน null = ไม่มี identity ที่ verify → ไม่ carry.
 *   • characterId ผูก (verified ownership, onAuth) → `char:<id>` (durable identity, ตรงกับ DB row).
 *   • มีแต่ accountId (token ผ่านแต่ยังไม่เลือก/ผูก characterId) → `acct:<id>` (guest/account คงที่ข้าม cookie).
 *   • ไม่มีทั้งคู่ (dev bypass, ไม่มี token/DB) → null.
 */
export function carryKey(
  accountId: string | null,
  characterId: string | null,
): string | null {
  if (characterId) return `char:${characterId}`;
  if (accountId) return `acct:${accountId}`;
  return null;
}

// module-singleton: 1 map ต่อ 1 Node process (ทุก MapRoom แชร์). ไม่ evict (entry เล็ก + จำนวน identity
// จำกัดต่อ process; eviction จริงอยู่นอก scope) — DB คือ durable store, cache นี้เป็นแค่ carrier ระยะสั้น.
const carrier = new Map<string, CarriedProgress>();

/** server เขียน {level,exp} ล่าสุดของ identity นี้ (ตอน leave/transition). key จาก {@link carryKey}. */
export function stashProgress(key: string, level: number, exp: number): void {
  carrier.set(key, { level, exp });
}

/** อ่าน progression ที่ขนไว้ (ตอน join ห้องใหม่ เมื่อ DB โหลดไม่ได้). ไม่มี → null. คืน copy (กันแก้ค้าง). */
export function recallProgress(key: string): CarriedProgress | null {
  const v = carrier.get(key);
  return v ? { level: v.level, exp: v.exp } : null;
}

/** ทดสอบ/รีเซ็ต (เคลียร์ carrier ทั้งหมด) — ใช้ในเทสต์เท่านั้น. */
export function _resetCarrierForTest(): void {
  carrier.clear();
}
