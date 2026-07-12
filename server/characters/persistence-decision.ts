// P2-05 — character save/load persistence **pure decisions** (Storage §5/§7/§22/§24). server-only, ไม่มี DB dep.
//
// แยกจาก best-effort DB glue (character-state.ts) เพื่อเทสต์ได้โดยไม่ต้องมี Prisma/DB — pattern เดียวกับ
// src/shared/movement-validation.ts (pure) vs MapRoom glue. MapRoom เรียก fn เหล่านี้ตัดสิน spawn/save/ownership.

/** state ที่ persist ต่อตัวละคร (subset ของ character_state — schema.prisma). */
export interface SavedCharacterState {
  mapId: string;
  tx: number;
  ty: number;
}

/** tile position ต่อเนื่อง (foot) — ใช้ทั้ง load/save decision. */
export interface Vec2 {
  tx: number;
  ty: number;
}

export type OwnershipVerdict = "allow" | "reject";

/**
 * ตัดสินว่า characterId เป็นของ accountId นี้ไหม (Storage §22 "Storage never accepts foreign account item"
 * หลักการเดียวกันกับ session). `ownerAccountId` = accountId เจ้าของตัวละครจาก DB (null = ไม่พบตัวละคร).
 *   ตรงกับ account → allow · ต่างบัญชี/ไม่พบ → reject (ปลอม characterId คนอื่น หรือ id ที่ไม่มีจริง).
 * caller เรียกเฉพาะเมื่อมี accountId (verified token) + DB ใช้ได้ (best-effort: DB ล่ม → ข้าม ไม่เรียกตัวนี้).
 */
export function decideOwnership(accountId: string, ownerAccountId: string | null): OwnershipVerdict {
  return ownerAccountId !== null && ownerAccountId === accountId ? "allow" : "reject";
}

/**
 * เลือก "ตำแหน่งที่ขอ spawn" ตอน load (Storage §5 entry flow): ใช้ตำแหน่ง save ล่าสุด **เฉพาะเมื่อ**
 * อยู่ map เดียวกับ room ที่ join (mapId ตรง) + พิกัด finite — ไม่งั้นใช้ fallback (จุด default/ที่ client ขอ).
 *
 * เหตุผลที่ gate ด้วย mapId: room ถูกสร้างต่อ mapId (client เลือก map ที่ boot). client boot ด้วย mapId
 * ที่ตัวละครที่เลือก save ไว้ล่าสุด (owner-report#6 fix — `src/engine/net/character-session.ts`
 * `pickBootMapId` + `SELECTED_CHARACTER_MAP_STORAGE_KEY`, ไม่ใช่ DEFAULT_MAP_ID เสมอเหมือนก่อนหน้า) →
 * ปกติ mapId ตรงกัน; ถ้าไม่ตรง (storage ว่าง/ตัวละครใหม่/hub ยังไม่ sync) → fallback ปกติ ไม่ crash.
 * ผลลัพธ์นี้ยังต้องผ่าน resolveSpawnPosition (walkable gate → safe camp) อีกชั้นที่ caller.
 */
export function pickLoadPosition(
  saved: SavedCharacterState | null,
  roomMapId: string,
  fallback: Vec2,
): Vec2 {
  if (
    saved !== null &&
    saved.mapId === roomMapId &&
    Number.isFinite(saved.tx) &&
    Number.isFinite(saved.ty)
  ) {
    return { tx: saved.tx, ty: saved.ty };
  }
  return fallback;
}

/**
 * เลือกตำแหน่งที่จะ persist (Storage §24 "safe-valid ล่าสุด"): ตำแหน่งปัจจุบันถ้า finite + walkable,
 * ไม่งั้น fallback (จุด safe ที่จำไว้ เช่น safe camp). ในทางปฏิบัติ tracker.tx/ty ฝั่ง server ผ่าน
 * validateMove มาแล้ว = walkable เสมอ — fn นี้เป็น defense-in-depth + จุดเทสต์ logic.
 */
export function pickSavePosition(
  current: Vec2,
  fallback: Vec2,
  isWalkable: (tx: number, ty: number) => boolean,
): Vec2 {
  if (Number.isFinite(current.tx) && Number.isFinite(current.ty) && isWalkable(current.tx, current.ty)) {
    return current;
  }
  return fallback;
}

/**
 * throttle hot write (Storage §24 · TA §8 "อย่าเขียนถี่เกิน"): ผ่านไป ≥ intervalMs นับจาก save ครั้งก่อน
 * → เขียนได้. interval save เรียกทุก tick ของ timer แล้ว gate ด้วยตัวนี้; save ตอน transition/leave = force
 * (caller ข้าม throttle เอง แต่ยังอัปเดต lastSaveMs กันเขียนซ้อนรอบถัดไป).
 */
export function shouldSaveNow(lastSaveMs: number, nowMs: number, intervalMs: number): boolean {
  return nowMs - lastSaveMs >= intervalMs;
}
