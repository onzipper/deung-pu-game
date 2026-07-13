import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "@/server/auth/signed-token";
import { issueRealtimeToken, verifyRealtimeToken, REALTIME_TOKEN_TTL_SEC } from "@/server/auth/realtime-token";
import {
  createSessionToken,
  readSessionToken,
  sessionCookieOptions,
  SESSION_TTL_SEC,
} from "@/server/auth/session-cookie";

const SECRET = "test-secret-at-least-16-chars-long";

describe("signed-token HS256 primitive", () => {
  it("sign -> verify roundtrip returns claims", () => {
    const t = signToken({ sub: "acc1", foo: "bar" }, SECRET, 60, 1000);
    const r = verifyToken(t, SECRET, 1001);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.claims.sub).toBe("acc1");
      expect(r.claims.foo).toBe("bar");
      expect(r.claims.iat).toBe(1000);
      expect(r.claims.exp).toBe(1060);
    }
  });

  it("rejects tampered payload (bad signature)", () => {
    const t = signToken({ sub: "acc1" }, SECRET, 60, 1000);
    const [h, , s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "attacker", iat: 1000, exp: 1060 })).toString("base64url");
    const r = verifyToken(`${h}.${forged}.${s}`, SECRET, 1001);
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects wrong secret", () => {
    const t = signToken({ sub: "acc1" }, SECRET, 60, 1000);
    expect(verifyToken(t, "another-secret-16chars-xx", 1001)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects expired and malformed", () => {
    const t = signToken({ sub: "acc1" }, SECRET, 60, 1000);
    expect(verifyToken(t, SECRET, 1060)).toEqual({ ok: false, reason: "expired" });
    expect(verifyToken("a.b", SECRET, 1000)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyToken("a.b.c", SECRET, 1000)).toEqual({ ok: false, reason: "malformed" });
  });

  it("throws on empty secret / bad ttl", () => {
    expect(() => signToken({ sub: "a" }, "", 60, 0)).toThrow();
    expect(() => signToken({ sub: "a" }, SECRET, 0, 0)).toThrow();
  });
});

describe("realtime token (item 3: ~60s, accountId + jti, aud=realtime)", () => {
  it("issues token carrying sub + jti with default 60s ttl", () => {
    const issued = issueRealtimeToken("acc42", SECRET, { nowSec: 2000, jti: "jti-1" });
    expect(issued.jti).toBe("jti-1");
    expect(issued.expiresAtSec).toBe(2000 + REALTIME_TOKEN_TTL_SEC);
    const r = verifyRealtimeToken(issued.token, SECRET, 2001);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.claims.sub).toBe("acc42");
      expect(r.claims.jti).toBe("jti-1");
      expect(r.claims.aud).toBe("realtime");
    }
  });

  it("generates unique jti per call when not injected", () => {
    const a = issueRealtimeToken("acc", SECRET);
    const b = issueRealtimeToken("acc", SECRET);
    expect(a.jti).not.toBe(b.jti);
  });

  it("expires ~60s after issue", () => {
    const issued = issueRealtimeToken("acc", SECRET, { nowSec: 100 });
    expect(verifyRealtimeToken(issued.token, SECRET, 160).ok).toBe(false);
  });

  it("rejects a session cookie token used as realtime (aud mismatch)", () => {
    const sessTok = createSessionToken({ accountId: "acc", isGuest: true }, SECRET, 100);
    expect(verifyRealtimeToken(sessTok, SECRET, 101)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("session cookie", () => {
  it("createSessionToken -> readSessionToken roundtrip preserves accountId + isGuest", () => {
    const t = createSessionToken({ accountId: "acc7", isGuest: true }, SECRET, 500);
    const r = readSessionToken(t, SECRET, 600);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session).toEqual({ accountId: "acc7", isGuest: true });
  });

  it("expires after SESSION_TTL_SEC", () => {
    const t = createSessionToken({ accountId: "acc", isGuest: false }, SECRET, 0);
    expect(readSessionToken(t, SECRET, SESSION_TTL_SEC).ok).toBe(false);
  });

  it("cookie options are httpOnly + lax + path/, secure only in production", () => {
    expect(sessionCookieOptions(false)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false, path: "/" });
    expect(sessionCookieOptions(true).secure).toBe(true);
  });
});
