// P2-05 — character save/load best-effort DB glue (Storage §5/§7/§22/§24 · TA §8). server-only (realtime process).
//
// pattern = server/security/session-lease.ts: ทุก DB call **best-effort** — DATABASE_URL ไม่ตั้ง / DB ล่ม →
//   ข้าม (warn ครั้งเดียว), **ห้ามให้ join/save พังเพราะ DB** (dev/e2e ไม่มี DB → เกมเดินต่อ in-memory).
//   pure decision (ownership/spawn/save position) แยกอยู่ persistence-decision.ts (testable ไม่ต้องมี Prisma).

import { getPrisma } from "../db/client";
import type { SavedCharacterState } from "./persistence-decision";

let dbUnavailableWarned = false;

/** DATABASE_URL ตั้งไหม — ไม่ตั้ง = dev/e2e ไม่มี DB → ข้าม persistence (warn ครั้งเดียว). */
function dbConfigured(): boolean {
  if (!process.env.DATABASE_URL) {
    if (!dbUnavailableWarned) {
      console.warn(
        "[character-state] DATABASE_URL ไม่ถูกตั้ง — ข้าม character save/load (dev/e2e). " +
          "ตำแหน่ง/ตัวละครจะไม่ persist จนกว่าจะมี DB (production).",
      );
      dbUnavailableWarned = true;
    }
    return false;
  }
  return true;
}

/** warn ครั้งเดียวเมื่อ DB call ล้ม (ต่อไม่ได้) — ไม่ spam log ทุก save/join. */
function warnDbError(op: string, err: unknown): void {
  if (!dbUnavailableWarned) {
    console.warn(
      `[character-state] DB ${op} ล้มเหลว — ข้าม persistence (เกมเล่นต่อได้): ` +
        (err instanceof Error ? err.message : String(err)),
    );
    dbUnavailableWarned = true;
  }
}

/**
 * อ่าน accountId เจ้าของตัวละคร (ownership check §22). คืน:
 *   • string = accountId เจ้าของ · null = ไม่พบตัวละคร · **undefined = DB ใช้ไม่ได้/error** (best-effort skip).
 * caller (onAuth) แยก undefined (ข้าม verify, ปล่อยผ่านแบบ inert) ออกจาก null/ต่างบัญชี (reject).
 */
export async function fetchCharacterOwner(
  characterId: string,
): Promise<string | null | undefined> {
  if (!dbConfigured()) return undefined;
  try {
    const row = await getPrisma().character.findUnique({
      where: { id: characterId },
      select: { accountId: true },
    });
    return row ? row.accountId : null;
  } catch (err) {
    warnDbError("owner", err);
    return undefined;
  }
}

/** โหลด CharacterState (map+ตำแหน่ง safe-valid ล่าสุด). best-effort: DB ล่ม/ไม่มี row → null (spawn default). */
export async function loadCharacterState(
  characterId: string,
): Promise<SavedCharacterState | null> {
  if (!dbConfigured()) return null;
  try {
    const row = await getPrisma().characterState.findUnique({
      where: { characterId },
      select: { mapId: true, tx: true, ty: true },
    });
    return row ? { mapId: row.mapId, tx: row.tx, ty: row.ty } : null;
  } catch (err) {
    warnDbError("load", err);
    return null;
  }
}

/**
 * upsert CharacterState (ตำแหน่ง safe-valid ล่าสุด). best-effort — save ล้ม = เกมเดินต่อ (persist รอบหน้า).
 * ตาราง character_state แยกมาเพื่อ hot write (TA §8) — caller throttle ด้วย shouldSaveNow (§24).
 */
export async function saveCharacterState(
  characterId: string,
  mapId: string,
  tx: number,
  ty: number,
): Promise<void> {
  if (!dbConfigured()) return;
  try {
    await getPrisma().characterState.upsert({
      where: { characterId },
      create: { characterId, mapId, tx, ty },
      update: { mapId, tx, ty },
    });
  } catch (err) {
    warnDbError("save", err);
  }
}

/** อัปเดต Account.lastPlayedCharacterId (§7.2 Continue default) ตอน join. best-effort. */
export async function updateLastPlayed(
  accountId: string,
  characterId: string,
): Promise<void> {
  if (!dbConfigured()) return;
  try {
    await getPrisma().account.update({
      where: { id: accountId },
      data: { lastPlayedCharacterId: characterId },
    });
  } catch (err) {
    warnDbError("lastPlayed", err);
  }
}
