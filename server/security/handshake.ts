// P2-04 — WS handshake authorization (pure decision). Bible 5.2 + TA §6.2 ข้อ 3 + Storage §4.
//
// รวม 2 ด่านที่เป็น "การตัดสินใจล้วน" (verify token + origin) ไว้ในฟังก์ชัน pure เดียว — inject verify
//   (verifyRealtimeToken) + clock → เทสต์ได้โดยไม่ต้องมี Colyseus/DB/env. rate limit เป็น state จึงอยู่ที่
//   caller (MapRoom.onAuth) แยกต่างหาก.
//
// นโยบาย token (สรุป):
//   - production (isProduction=true): **บังคับ token เสมอ** — ไม่มี/verify ไม่ผ่าน = ปฏิเสธ.
//   - dev/e2e (isProduction=false): ไม่มี token = ผ่านแบบ guest (accountId=null, dev bypass) เพื่อไม่พัง
//     harness/flow local เดิม; **มี** token = ยัง verify ตามจริง (ผิด = ปฏิเสธ แม้ dev).
//   - jwtSecret ไม่ตั้ง: production = ปฏิเสธ (fail closed) · dev = bypass (ยอมรับ token ไม่ได้ → guest).

import { isOriginAllowed } from "./origin-allowlist";

/** ผลของ handshake authorize. accountId=null = dev bypass (ยังไม่ผูกบัญชี → ข้าม session lease). */
export type HandshakeDecision =
  | { ok: true; accountId: string | null }
  | { ok: false; reason: "bad_origin" | "no_token" | "bad_token" };

/** ผล verify token (subset ของ VerifyResult ใน signed-token.ts) — decouple ให้ inject ได้. */
export type TokenVerify = (
  token: string,
  secret: string,
  nowSec: number,
) => { ok: true; claims: { sub: string } } | { ok: false; reason: string };

export interface HandshakeParams {
  /** token จาก joinOptions.token (หรือ Authorization/_authToken) — undefined = ไม่ส่งมา */
  token: string | undefined;
  /** Origin header ของ WS handshake */
  origin: string | undefined;
  /** process.env.NODE_ENV === "production" */
  isProduction: boolean;
  /** allowlist ที่ parse แล้ว ([] = dev อนุญาตทุก origin) */
  allowlist: string[];
  /** JWT_SECRET (undefined/"" = ไม่ตั้ง) */
  jwtSecret: string | undefined;
  /** เวลาปัจจุบัน (epoch seconds) — verify exp */
  nowSec: number;
  /** inject verifyRealtimeToken (verify signature/exp/aud) */
  verify: TokenVerify;
}

export function authorizeHandshake(params: HandshakeParams): HandshakeDecision {
  // ด่าน 1: origin (ถูกที่สุด ตัดก่อน)
  if (!isOriginAllowed(params.origin, params.allowlist)) {
    return { ok: false, reason: "bad_origin" };
  }

  // ด่าน 2: token
  const hasToken = typeof params.token === "string" && params.token.length > 0;
  const hasSecret = typeof params.jwtSecret === "string" && params.jwtSecret.length > 0;

  if (!hasToken) {
    // ไม่มี token: production บังคับต้องมี · dev = guest bypass
    return params.isProduction ? { ok: false, reason: "no_token" } : { ok: true, accountId: null };
  }

  // มี token แต่ verify ไม่ได้ (secret ไม่ตั้ง): production = ปฏิเสธ (fail closed) · dev = guest bypass
  if (!hasSecret) {
    return params.isProduction ? { ok: false, reason: "bad_token" } : { ok: true, accountId: null };
  }

  const result = params.verify(params.token as string, params.jwtSecret as string, params.nowSec);
  if (!result.ok) return { ok: false, reason: "bad_token" };
  return { ok: true, accountId: result.claims.sub };
}
