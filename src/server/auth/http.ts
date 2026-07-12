// P2-03 — route-handler helpers (session cookie read/write + JSON responses).
// ⛔ SERVER-ONLY (next/headers). ใช้เฉพาะใน src/app/api/**/route.ts.

import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  readSessionToken,
  sessionCookieOptions,
  type SessionClaims,
} from "./session-cookie";
import { getSessionSecret } from "./secret";
import { getPrisma } from "../db";
import { createPrismaAccountRepository } from "./prisma-repository";
import type { AccountRepository } from "./repository";

/** route handler สร้าง repo จาก factory นี้ (เปลี่ยน impl ที่เดียว). */
export function getAccountRepository(): AccountRepository {
  return createPrismaAccountRepository();
}

/** touch getPrisma เพื่อ fail-fast ถ้า DATABASE_URL ไม่มี (route ตอบ 500 ชัดกว่า throw ลึก ๆ). */
export function assertDbConfigured(): void {
  getPrisma();
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/** อ่าน + verify session จาก httpOnly cookie. คืน null ถ้าไม่มี/หมดอายุ/แก้. */
export async function readSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const result = readSessionToken(raw, getSessionSecret());
  return result.ok ? result.session : null;
}

/** เขียน session cookie ใหม่ (login/register/guest/upgrade). */
export async function writeSession(claims: SessionClaims): Promise<void> {
  const store = await cookies();
  const token = createSessionToken(claims, getSessionSecret());
  store.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(isProd()));
}

/** ลบ session cookie (logout). */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions(isProd()), maxAge: 0 });
}

export function jsonOk(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function jsonError(reason: string, status: number): Response {
  return Response.json({ ok: false, reason }, { status });
}

/** map fail reason → HTTP status (validation=400/401, conflict=409). */
export function statusForReason(reason: string): number {
  switch (reason) {
    case "invalid_credentials":
      return 401;
    case "account_not_found":
      return 404;
    case "email_taken":
    case "already_has_email":
      return 409;
    default:
      return 400; // invalid_email / email_mismatch / weak_password / bad_request
  }
}
