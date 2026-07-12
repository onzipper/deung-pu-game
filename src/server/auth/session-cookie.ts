// P2-03 — web session (stateless signed cookie). Source: Storage §4, spec §1.9 ("refresh แล้วยังเข้า account เดิม").
//
// ออกแบบ: session = httpOnly signed cookie (HS256, SESSION_SECRET) บรรจุ {sub:accountId, isGuest}.
// เหตุผลเลือก stateless แทน DB session table:
//   - guest identity persist ข้าม refresh ได้ทันทีโดยไม่ต้องมี Session table (ลด schema delta ที่ยังไม่มี)
//   - auditable: verify ด้วย HMAC ล้วน ไม่ต้อง query
//   ข้อจำกัด: revoke รายตัว/lease-takeover (Storage §4.1 SESSION_TAKEN_OVER) ต้องมี server-side session/denylist
//   → เป็นงาน P2-04 (WS session lease). P2-03 คุมแค่ auth identity + realtime token issuance.
//
// ⛔ SERVER-ONLY. cookie flags: httpOnly + sameSite lax + secure(prod) + path / — client อ่านค่าไม่ได้.

import { signToken, verifyToken } from "./signed-token";

export const SESSION_COOKIE_NAME = "dpu_session";
/** อายุ session (วินาที) — 30 วัน; guest ผูกอุปกรณ์/เบราว์เซอร์ (spec §1.5). */
export const SESSION_TTL_SEC = 60 * 60 * 24 * 30;

export interface SessionClaims {
  accountId: string;
  isGuest: boolean;
}

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
}

/** flags ของ session cookie. secure=true เมื่อ production (https). */
export function sessionCookieOptions(isProduction: boolean, maxAge: number = SESSION_TTL_SEC): SessionCookieOptions {
  return { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/", maxAge };
}

/** สร้าง signed session token. nowSec inject ได้ (เทสต์). */
export function createSessionToken(
  claims: SessionClaims,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  ttlSec: number = SESSION_TTL_SEC,
): string {
  return signToken({ sub: claims.accountId, isGuest: claims.isGuest }, secret, ttlSec, nowSec);
}

type SessionVerifyFailReason = "malformed" | "bad_signature" | "expired" | "not_yet_valid";

export type SessionVerifyResult =
  | { ok: true; session: SessionClaims }
  | { ok: false; reason: SessionVerifyFailReason };

/** verify session cookie → คืน accountId/isGuest. */
export function readSessionToken(
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): SessionVerifyResult {
  const result = verifyToken(token, secret, nowSec);
  if (!result.ok) return { ok: false, reason: result.reason };
  const isGuest = result.claims.isGuest;
  if (typeof isGuest !== "boolean") return { ok: false, reason: "malformed" };
  return { ok: true, session: { accountId: result.claims.sub, isGuest } };
}
