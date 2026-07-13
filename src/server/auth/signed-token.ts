// P2-03 — HS256 signed-token primitive (trust boundary).
//
// Zero-dependency JWT (compact JWS, HS256) built on node:crypto only — auditable,
// no external auth library in the signing path. ใช้ร่วมทั้ง realtime token (JWT_SECRET)
// และ session cookie (SESSION_SECRET); แต่ละ caller เลือก secret/ttl/claim ของตัวเอง.
//
// ⛔ SERVER-ONLY: import node:crypto — ห้าม import เข้า src/engine|game|ui (client bundle).
//    ไฟล์นี้ pure (ไม่มี DB, ไม่มี env read) → เทสต์ได้ตรง ๆ.

import { createHmac, timingSafeEqual } from "node:crypto";

/** claim มาตรฐาน: iat/exp = epoch seconds; ที่เหลือเป็น claim เฉพาะทาง. */
export interface TokenClaims {
  /** subject = accountId */
  sub: string;
  /** issued-at (epoch seconds) */
  iat: number;
  /** expiry (epoch seconds) */
  exp: number;
  /** token id (unique per token) — realtime handshake ใช้กัน replay */
  jti?: string;
  [key: string]: unknown;
}

export type VerifyResult =
  | { ok: true; claims: TokenClaims }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "not_yet_valid" };

const HEADER_B64 = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecodeToString(input: string): string | null {
  try {
    return Buffer.from(input, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function sign(signingInput: string, secret: string): string {
  return createHmac("sha256", secret).update(signingInput).digest("base64url");
}

/**
 * Sign claims เป็น compact JWS (HS256). caller ตั้ง iat/exp ผ่าน nowSec+ttlSec
 * เพื่อให้ deterministic ในเทสต์ (ไม่เรียก Date.now() ในนี้).
 */
/** claim ที่ caller ส่งเข้ามา (ยังไม่มี iat/exp — signToken เติมให้). */
export interface SignableClaims {
  sub: string;
  jti?: string;
  [key: string]: unknown;
}

export function signToken(
  claims: SignableClaims,
  secret: string,
  ttlSec: number,
  nowSec: number,
): string {
  if (!secret) throw new Error("[auth] signToken: secret ว่าง");
  if (!Number.isFinite(ttlSec) || ttlSec <= 0) throw new Error("[auth] signToken: ttlSec ต้อง > 0");
  const full: TokenClaims = { ...claims, iat: nowSec, exp: nowSec + Math.floor(ttlSec) };
  const payloadB64 = base64UrlEncode(JSON.stringify(full));
  const signingInput = `${HEADER_B64}.${payloadB64}`;
  return `${signingInput}.${sign(signingInput, secret)}`;
}

/**
 * Verify signature + expiry ด้วย constant-time compare. nowSec inject ได้ (เทสต์).
 * ไม่ throw — คืน reason ให้ caller ตัดสิน.
 */
export function verifyToken(token: string, secret: string, nowSec: number): VerifyResult {
  if (!secret) throw new Error("[auth] verifyToken: secret ว่าง");
  if (typeof token !== "string") return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [headerB64, payloadB64, sigB64] = parts;
  if (headerB64 !== HEADER_B64) return { ok: false, reason: "malformed" };

  const expected = sign(`${headerB64}.${payloadB64}`, secret);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  const json = base64UrlDecodeToString(payloadB64);
  if (json === null) return { ok: false, reason: "malformed" };
  let claims: TokenClaims;
  try {
    claims = JSON.parse(json) as TokenClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof claims !== "object" ||
    claims === null ||
    typeof claims.sub !== "string" ||
    typeof claims.iat !== "number" ||
    typeof claims.exp !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (nowSec < claims.iat - 1) return { ok: false, reason: "not_yet_valid" };
  if (nowSec >= claims.exp) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}
