// P2-03 — short-lived realtime handshake token (item 3, สำหรับ P2-04 WS onAuth).
// Source: TA §6.2 (JWT handshake, short-lived), Bible 5.2.
//
// ออก JWT อายุสั้น (~60s) มี accountId (sub) + jti — Colyseus onAuth (P2-04) verify ด้วย JWT_SECRET เดียวกัน
// แล้วเช็ค jti กัน replay. เซ็น HS256 ผ่าน signed-token.ts (zero-dep primitive).
//
// ⛔ SERVER-ONLY. verifyRealtimeToken export ไว้ให้ P2-04/เทสต์ใช้.

import { randomUUID } from "node:crypto";
import { signToken, verifyToken, type TokenClaims, type VerifyResult } from "./signed-token";

/** อายุ token realtime (วินาที) — Design Knob; สั้นพอกัน replay, ยาวพอเผื่อ handshake latency. */
export const REALTIME_TOKEN_TTL_SEC = 60;

export interface RealtimeTokenClaims extends TokenClaims {
  /** marker ว่า token นี้ออกเพื่อ realtime handshake (กันเอา session ไปใช้ผิดที่) */
  aud: "realtime";
}

export interface IssuedRealtimeToken {
  token: string;
  jti: string;
  expiresAtSec: number;
}

/**
 * ออก token สำหรับ accountId. nowSec/jti inject ได้ (เทสต์ deterministic).
 * default nowSec = เวลาปัจจุบัน, jti = uuid.
 */
export function issueRealtimeToken(
  accountId: string,
  secret: string,
  opts: { nowSec?: number; ttlSec?: number; jti?: string } = {},
): IssuedRealtimeToken {
  if (!accountId) throw new Error("[auth] issueRealtimeToken: accountId ว่าง");
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const ttlSec = opts.ttlSec ?? REALTIME_TOKEN_TTL_SEC;
  const jti = opts.jti ?? randomUUID();
  const token = signToken({ sub: accountId, jti, aud: "realtime" }, secret, ttlSec, nowSec);
  return { token, jti, expiresAtSec: nowSec + ttlSec };
}

/** verify + ยืนยัน aud="realtime". คืน claims ให้ P2-04 เช็ค jti ต่อ. */
export function verifyRealtimeToken(
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): VerifyResult {
  const result = verifyToken(token, secret, nowSec);
  if (!result.ok) return result;
  if (result.claims.aud !== "realtime") return { ok: false, reason: "malformed" };
  return result;
}
