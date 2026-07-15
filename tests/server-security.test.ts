import { describe, it, expect } from "vitest";
import { parseAllowedOrigins, isOriginAllowed } from "../server/security/origin-allowlist";
import { createRateLimiter } from "../server/security/rate-limiter";
import { authorizeHandshake } from "../server/security/handshake";
import {
  shouldTakeOverSession,
  claimSession,
  releaseSession,
  transferSession,
  _resetSessionRegistry,
} from "../server/security/session-registry";
import { issueRealtimeToken, verifyRealtimeToken } from "../src/server/auth/realtime-token";
import { KeyedOperationQueue } from "../server/security/keyed-operation-queue";

const SECRET = "test-secret-at-least-16-chars-long";

describe("keyed session mutation ordering", () => {
  it("preserves invocation order per account even when the first operation is slow", async () => {
    const queue = new KeyedOperationQueue();
    const events: string[] = [];
    let finishFirst!: () => void;
    const gate = new Promise<void>((resolve) => { finishFirst = resolve; });

    const first = queue.run("account-a", async () => {
      events.push("first:start");
      await gate;
      events.push("first:end");
    });
    const second = queue.run("account-a", async () => {
      events.push("second");
    });
    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    finishFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  it("does not poison later operations when an earlier mutation rejects", async () => {
    const queue = new KeyedOperationQueue();
    const first = queue.run("account-a", async () => { throw new Error("expected"); });
    const second = queue.run("account-a", async () => "recovered");
    await expect(first).rejects.toThrow("expected");
    await expect(second).resolves.toBe("recovered");
  });
});

describe("origin allowlist (P2-04, Bible 5.2)", () => {
  it("parses comma-separated env, trims, drops empties", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("")).toEqual([]);
    expect(parseAllowedOrigins(" https://a.com , https://b.com ,")).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("empty allowlist = dev mode → allows any origin (even undefined)", () => {
    expect(isOriginAllowed("https://anything", [])).toBe(true);
    expect(isOriginAllowed(undefined, [])).toBe(true);
  });

  it("non-empty allowlist → exact match required, origin mandatory", () => {
    const list = ["https://deung-pu.softrock.space"];
    expect(isOriginAllowed("https://deung-pu.softrock.space", list)).toBe(true);
    expect(isOriginAllowed("https://evil.com", list)).toBe(false);
    expect(isOriginAllowed(undefined, list)).toBe(false);
  });
});

describe("rate limiter (P2-04 sliding window)", () => {
  it("limits after maxFailures within window, recovers after window slides", () => {
    const rl = createRateLimiter({ maxFailures: 3, windowMs: 1000 });
    const ip = "1.2.3.4";
    expect(rl.isLimited(ip, 0)).toBe(false);
    rl.recordFailure(ip, 100);
    rl.recordFailure(ip, 200);
    expect(rl.isLimited(ip, 300)).toBe(false); // 2 < 3
    rl.recordFailure(ip, 300);
    expect(rl.isLimited(ip, 350)).toBe(true); // 3 >= 3
    // หลัง window ผ่าน (>1000ms จาก failure แรก ๆ) → รายการเก่าหลุด
    expect(rl.isLimited(ip, 1250)).toBe(false); // เหลือแค่ failure @300 อยู่ในหน้าต่าง (1 < 3)
  });

  it("reset clears a key; keys prune to empty free the map", () => {
    const rl = createRateLimiter({ maxFailures: 2, windowMs: 500 });
    rl.recordFailure("a", 0);
    rl.recordFailure("a", 10);
    expect(rl.isLimited("a", 20)).toBe(true);
    rl.reset("a");
    expect(rl.isLimited("a", 20)).toBe(false);
    // prune: หลัง window ผ่าน key ถูกลบออกจาก map
    rl.recordFailure("b", 0);
    rl.isLimited("b", 10_000);
    expect(rl.size()).toBe(0);
  });
});

describe("session registry takeover decision (P2-04, Storage §4.2)", () => {
  it("shouldTakeOverSession: true only when a different session already active", () => {
    expect(shouldTakeOverSession(undefined, "s1")).toBe(false);
    expect(shouldTakeOverSession({ sessionId: "s1" }, "s1")).toBe(false);
    expect(shouldTakeOverSession({ sessionId: "s1" }, "s2")).toBe(true);
  });

  it("claim disconnects the previous session on takeover; release is session-scoped", () => {
    _resetSessionRegistry();
    const kicked: string[] = [];
    // แท็บแรก
    const t1 = claimSession("acc", "s1", () => kicked.push("s1"));
    expect(t1).toBe(false);
    // แท็บใหม่ account เดียวกัน → เตะ s1
    const t2 = claimSession("acc", "s2", () => kicked.push("s2"));
    expect(t2).toBe(true);
    expect(kicked).toEqual(["s1"]);
    // s1 (ตัวเก่า) release = no-op (registry ถือ s2 แล้ว, takeover-wins)
    releaseSession("acc", "s1");
    // s2 ยังถือ session → เตะได้ถ้ามีตัวใหม่
    const t3 = claimSession("acc", "s3", () => kicked.push("s3-kick-old"));
    expect(t3).toBe(true);
    expect(kicked).toEqual(["s1", "s2"]);
    _resetSessionRegistry();
  });

  it("transfers a closing controller slot to a server actor without disconnecting either side", () => {
    _resetSessionRegistry();
    const kicked: string[] = [];
    claimSession("acc", "controller", () => kicked.push("controller"));
    expect(transferSession("acc", "controller", "actor:opaque", () => kicked.push("actor"))).toBe(true);
    expect(kicked).toEqual([]);

    expect(claimSession("acc", "controller-2", () => kicked.push("controller-2"))).toBe(true);
    expect(kicked).toEqual(["actor"]);
    expect(transferSession("acc", "controller", "stale-actor", () => undefined)).toBe(false);
    _resetSessionRegistry();
  });
});

describe("handshake authorize (P2-04, TA §6.2 ข้อ 3)", () => {
  const base = {
    origin: undefined,
    allowlist: [] as string[],
    jwtSecret: SECRET,
    nowSec: 1000,
    verify: verifyRealtimeToken,
  };

  it("dev + no token → guest bypass (accountId null)", () => {
    const d = authorizeHandshake({ ...base, token: undefined, isProduction: false });
    expect(d).toEqual({ ok: true, accountId: null });
  });

  it("production + no token → rejected (no_token)", () => {
    const d = authorizeHandshake({ ...base, token: undefined, isProduction: true });
    expect(d).toEqual({ ok: false, reason: "no_token" });
  });

  it("valid signed token → ok with accountId from sub (both dev and prod)", () => {
    const { token } = issueRealtimeToken("acc-42", SECRET, { nowSec: 990 });
    for (const isProduction of [false, true]) {
      const d = authorizeHandshake({ ...base, token, isProduction, nowSec: 1000 });
      expect(d).toEqual({ ok: true, accountId: "acc-42" });
    }
  });

  it("tampered/expired token → bad_token even in dev", () => {
    const { token } = issueRealtimeToken("acc", SECRET, { nowSec: 100 });
    // expired (issued@100 ttl 60 → exp 160; verify @ 200)
    expect(authorizeHandshake({ ...base, token, isProduction: false, nowSec: 200 })).toEqual({
      ok: false,
      reason: "bad_token",
    });
    // wrong-secret token
    const other = issueRealtimeToken("acc", "another-secret-16chars-xx", { nowSec: 990 }).token;
    expect(authorizeHandshake({ ...base, token: other, isProduction: true, nowSec: 1000 })).toEqual({
      ok: false,
      reason: "bad_token",
    });
  });

  it("bad origin rejected before token check", () => {
    const { token } = issueRealtimeToken("acc", SECRET, { nowSec: 990 });
    const d = authorizeHandshake({
      ...base,
      token,
      isProduction: true,
      allowlist: ["https://ok.com"],
      origin: "https://evil.com",
      nowSec: 1000,
    });
    expect(d).toEqual({ ok: false, reason: "bad_origin" });
  });

  it("production + token present but no secret configured → bad_token (fail closed)", () => {
    const d = authorizeHandshake({
      ...base,
      token: "some.jwt.here",
      isProduction: true,
      jwtSecret: undefined,
    });
    expect(d).toEqual({ ok: false, reason: "bad_token" });
  });

  it("dev + token present but no secret → guest bypass (can't verify → ignore token)", () => {
    const d = authorizeHandshake({
      ...base,
      token: "some.jwt.here",
      isProduction: false,
      jwtSecret: undefined,
    });
    expect(d).toEqual({ ok: true, accountId: null });
  });
});
