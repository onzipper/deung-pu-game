// P2-04 — DB session lease (Storage §4.1: 1 active gameplay session/account). server-only.
//
// authority ระดับบัญชี = ตาราง session_lease (PK=accountId). on join (มี accountId) → upsert lease ด้วย
//   sessionId ใหม่ (takeover-wins, §4.2 overwrite แถว). heartbeat ทุก ~30s (bump heartbeatAt) เพื่อให้
//   detect lease ค้าง (stale) ได้. on leave/dispose → ปล่อย lease **เฉพาะถ้ายังเป็นของ session ตัวเอง**
//   (deleteMany scope ด้วย sessionId → ไม่ลบ lease ของ session ใหม่ที่ยึดไปแล้ว).
//
// ⛔ graceful เสมอ (dev/e2e ไม่มี DB): DATABASE_URL ไม่ตั้ง / ต่อไม่ได้ → ข้าม lease (warn ครั้งเดียว),
//    **ห้ามให้ join พังเพราะ DB**. ทุก DB call ห่อ try/catch. registry in-process (session-registry.ts)
//    ยังทำ takeover ได้แม้ไม่มี DB — lease คือชั้น cross-process/persist เสริม.

import { getPrisma } from "../db/client";

/** ระยะ heartbeat (ms) — bump heartbeatAt เป็นระยะให้ตรวจ lease ค้างได้ (§4.1). */
const HEARTBEAT_INTERVAL_MS = 30_000;

let dbUnavailableWarned = false;
const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();

/** DATABASE_URL ตั้งไหม — ไม่ตั้ง = dev/e2e ไม่มี DB → ข้าม lease (warn ครั้งเดียว). */
function dbConfigured(): boolean {
  if (!process.env.DATABASE_URL) {
    if (!dbUnavailableWarned) {
      console.warn(
        "[session-lease] DATABASE_URL ไม่ถูกตั้ง — ข้าม session lease (dev/e2e). " +
          "takeover ยังทำงานผ่าน in-process registry; lease ข้าม process จะมีเมื่อมี DB (production).",
      );
      dbUnavailableWarned = true;
    }
    return false;
  }
  return true;
}

/** warn ครั้งเดียวเมื่อ DB call ล้ม (ต่อไม่ได้) — ไม่ spam log ทุก join. */
function warnDbError(op: string, err: unknown): void {
  if (!dbUnavailableWarned) {
    console.warn(
      `[session-lease] DB ${op} ล้มเหลว — ข้าม lease (เกมเล่นต่อได้): ` +
        (err instanceof Error ? err.message : String(err)),
    );
    dbUnavailableWarned = true;
  }
}

function startHeartbeat(accountId: string, sessionId: string): void {
  stopHeartbeat(accountId);
  const timer = setInterval(() => {
    void touchLease(accountId, sessionId);
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref?.(); // ไม่กัน process ปิด
  heartbeatTimers.set(accountId, timer);
}

function stopHeartbeat(accountId: string): void {
  const timer = heartbeatTimers.get(accountId);
  if (timer) {
    clearInterval(timer);
    heartbeatTimers.delete(accountId);
  }
}

/** bump heartbeatAt (updatedAt) เฉพาะถ้า lease ยังเป็นของ sessionId นี้. best-effort. */
async function touchLease(accountId: string, sessionId: string): Promise<void> {
  if (!dbConfigured()) return;
  try {
    await getPrisma().sessionLease.updateMany({
      where: { accountId, sessionId },
      data: { sessionId }, // touch → @updatedAt bump heartbeatAt
    });
  } catch (err) {
    warnDbError("heartbeat", err);
  }
}

export interface LeaseContext {
  characterId?: string | null;
  serverId?: string | null;
}

/**
 * ยึด lease ให้ accountId ด้วย sessionId ใหม่ (upsert = takeover-wins, §4.2) + เริ่ม heartbeat.
 * best-effort: DB ไม่มี/ล้ม → ข้าม (in-process registry ยัง takeover ได้). ห้าม throw ออกไปให้ join พัง.
 */
export async function acquireLease(
  accountId: string,
  sessionId: string,
  ctx: LeaseContext = {},
): Promise<void> {
  if (!dbConfigured()) return;
  try {
    await getPrisma().sessionLease.upsert({
      where: { accountId },
      create: {
        accountId,
        sessionId,
        characterId: ctx.characterId ?? null,
        serverId: ctx.serverId ?? null,
      },
      update: {
        sessionId,
        characterId: ctx.characterId ?? null,
        serverId: ctx.serverId ?? null,
      },
    });
    startHeartbeat(accountId, sessionId);
  } catch (err) {
    warnDbError("acquire", err);
  }
}

/**
 * ปล่อย lease + หยุด heartbeat — เฉพาะถ้า lease ยังเป็นของ sessionId นี้ (deleteMany scope ด้วย sessionId).
 * takeover: session เก่าเรียกตัวนี้จะ deleteMany(accountId, oldSessionId) = ไม่ match (lease เป็น sessionId ใหม่)
 *   → ไม่ลบ lease ของตัวใหม่. best-effort.
 */
export async function releaseLease(accountId: string, sessionId: string): Promise<void> {
  stopHeartbeat(accountId);
  if (!dbConfigured()) return;
  try {
    await getPrisma().sessionLease.deleteMany({ where: { accountId, sessionId } });
  } catch (err) {
    warnDbError("release", err);
  }
}
