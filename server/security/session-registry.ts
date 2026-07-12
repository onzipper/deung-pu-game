// P2-04 — in-process active-session registry (Storage §4.1 "one active gameplay session", §4.2 takeover).
//
// เก็บ "session ที่ active อยู่จริงใน process นี้" ต่อ accountId → เมื่อ account เดียวกันเข้าเล่นจาก
//   device/tab ใหม่ (sessionId ต่าง) = **takeover-wins**: ตัวใหม่ยึด, สั่ง disconnect ตัวเก่า (SESSION_TAKEN_OVER).
//   reconnect ภายใน grace ใช้ sessionId เดิม + ไม่ผ่าน onAuth/onJoin → ไม่ trigger takeover (ถูกต้องตาม §4.1).
//
// state จริง (position ฯลฯ) อยู่ Colyseus; DB session_lease = authority ระดับบัญชี (ดู session-lease.ts).
//   registry นี้คือชั้นที่ "ลงมือ disconnect" ได้จริงใน single process. **หลาย process** ต้อง coordinate ผ่าน
//   DB lease + presence (TODO scale) — registry in-memory มองไม่เห็น session ข้าม process.

/** session ที่ลงทะเบียน — disconnect() = วิธีเตะ session นี้ (caller ผูกกับ Colyseus client.leave(code)). */
export interface RegisteredSession {
  sessionId: string;
  disconnect: () => void;
}

/**
 * pure: ควร takeover (เตะตัวเก่า) ไหม เมื่อ session ใหม่เข้ามาสำหรับ account เดียวกัน.
 * true = มี session เดิมอยู่ **และ** sessionId ต่างกัน (device/tab ใหม่). เท่ากัน = เดิม (idempotent) → ไม่เตะ.
 */
export function shouldTakeOverSession(
  existing: { sessionId: string } | undefined,
  incomingSessionId: string,
): boolean {
  return existing !== undefined && existing.sessionId !== incomingSessionId;
}

const active = new Map<string, RegisteredSession>();

/**
 * ลงทะเบียน session ใหม่ให้ accountId. ถ้ามี session เดิมของ account นี้ (sessionId ต่าง) → เรียก disconnect
 * ของตัวเก่า (takeover) ก่อน แล้วตัวใหม่เข้าแทน. คืน true ถ้าเกิด takeover (มีการเตะตัวเก่า).
 */
export function claimSession(
  accountId: string,
  sessionId: string,
  disconnect: () => void,
): boolean {
  const existing = active.get(accountId);
  const takingOver = shouldTakeOverSession(existing, sessionId);
  if (takingOver) existing!.disconnect();
  active.set(accountId, { sessionId, disconnect });
  return takingOver;
}

/**
 * ปล่อย session ของ accountId — **เฉพาะเมื่อ sessionId ที่ถืออยู่ตรงกับ sessionId ที่ปล่อย** (takeover-wins:
 * session เก่าที่เพิ่งถูกเตะจะไม่ลบ entry ของ session ใหม่ที่ยึดไปแล้ว).
 */
export function releaseSession(accountId: string, sessionId: string): void {
  const existing = active.get(accountId);
  if (existing && existing.sessionId === sessionId) active.delete(accountId);
}

/** test helper — ล้าง registry ทั้งหมด. */
export function _resetSessionRegistry(): void {
  active.clear();
}
