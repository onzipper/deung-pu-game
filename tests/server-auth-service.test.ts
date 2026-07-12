import { describe, it, expect } from "vitest";
import { createInMemoryAccountRepository } from "@/server/auth/memory-repository";
import {
  createGuestAccount,
  registerEmailAccount,
  loginEmailAccount,
  upgradeGuestAccount,
} from "@/server/auth/service";
import { evaluateGuestUpgrade } from "@/server/auth/upgrade";
import type { AccountRecord } from "@/server/auth/repository";

const GOOD_PW = "correct horse battery";

describe("guest account", () => {
  it("creates a guest instantly (isGuest, no email)", async () => {
    const repo = createInMemoryAccountRepository();
    const acc = await createGuestAccount(repo);
    expect(acc.isGuest).toBe(true);
    expect(acc.email).toBeNull();
    expect(acc.id).toBeTruthy();
  });
});

describe("email register", () => {
  it("registers with valid email+confirm+password", async () => {
    const repo = createInMemoryAccountRepository();
    const r = await registerEmailAccount(repo, {
      email: "New@Example.com",
      emailConfirm: "New@Example.com",
      password: GOOD_PW,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.account.email).toBe("New@example.com");
      expect(r.account.isGuest).toBe(false);
    }
  });

  it("rejects mismatched confirm / weak password / bad email", async () => {
    const repo = createInMemoryAccountRepository();
    expect((await registerEmailAccount(repo, { email: "a@b.com", emailConfirm: "x@b.com", password: GOOD_PW })).ok).toBe(false);
    expect((await registerEmailAccount(repo, { email: "a@b.com", emailConfirm: "a@b.com", password: "short" })).ok).toBe(false);
    expect((await registerEmailAccount(repo, { email: "nope", emailConfirm: "nope", password: GOOD_PW })).ok).toBe(false);
  });

  it("rejects duplicate email (case-insensitive)", async () => {
    const repo = createInMemoryAccountRepository();
    await registerEmailAccount(repo, { email: "dup@example.com", emailConfirm: "dup@example.com", password: GOOD_PW });
    const r = await registerEmailAccount(repo, { email: "DUP@Example.com", emailConfirm: "DUP@Example.com", password: GOOD_PW });
    expect(r).toEqual({ ok: false, reason: "email_taken" });
  });
});

describe("email login", () => {
  it("logs in with correct credentials, fails on wrong password/unknown email (same reason = anti-enumeration)", async () => {
    const repo = createInMemoryAccountRepository();
    await registerEmailAccount(repo, { email: "u@example.com", emailConfirm: "u@example.com", password: GOOD_PW });
    const ok = await loginEmailAccount(repo, "U@Example.com", GOOD_PW);
    expect(ok.ok).toBe(true);
    expect(await loginEmailAccount(repo, "u@example.com", "wrong pass phrase")).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(await loginEmailAccount(repo, "ghost@example.com", GOOD_PW)).toEqual({ ok: false, reason: "invalid_credentials" });
  });
});

describe("guest -> email upgrade (§1.2/§1.9)", () => {
  it("keeps the SAME accountId, flips isGuest, no duplicate account", async () => {
    const repo = createInMemoryAccountRepository();
    const guest = await createGuestAccount(repo);
    const before = repo.count();
    const r = await upgradeGuestAccount(repo, {
      accountId: guest.id,
      email: "up@example.com",
      emailConfirm: "up@example.com",
      password: GOOD_PW,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.account.id).toBe(guest.id); // §1.9 character id เดิม → accountId เดิม
      expect(r.account.isGuest).toBe(false);
      expect(r.account.email).toBe("up@example.com");
    }
    expect(repo.count()).toBe(before); // ไม่สร้าง account ใหม่
  });

  it("can log in with the upgraded email afterwards", async () => {
    const repo = createInMemoryAccountRepository();
    const guest = await createGuestAccount(repo);
    await upgradeGuestAccount(repo, { accountId: guest.id, email: "up2@example.com", emailConfirm: "up2@example.com", password: GOOD_PW });
    const login = await loginEmailAccount(repo, "up2@example.com", GOOD_PW);
    expect(login.ok).toBe(true);
    if (login.ok) expect(login.account.id).toBe(guest.id);
  });

  it("is idempotent: re-submitting the SAME email succeeds without creating anything (§1.7 duplicate submit)", async () => {
    const repo = createInMemoryAccountRepository();
    const guest = await createGuestAccount(repo);
    const args = { accountId: guest.id, email: "idem@example.com", emailConfirm: "idem@example.com", password: GOOD_PW };
    const first = await upgradeGuestAccount(repo, args);
    const countAfterFirst = repo.count();
    const second = await upgradeGuestAccount(repo, args);
    expect(first.ok && second.ok).toBe(true);
    if (second.ok) expect(second.account.id).toBe(guest.id);
    expect(repo.count()).toBe(countAfterFirst);
  });

  it("rejects email already owned by another account (no auto-merge, §1.3/§1.7)", async () => {
    const repo = createInMemoryAccountRepository();
    await registerEmailAccount(repo, { email: "taken@example.com", emailConfirm: "taken@example.com", password: GOOD_PW });
    const guest = await createGuestAccount(repo);
    const r = await upgradeGuestAccount(repo, { accountId: guest.id, email: "taken@example.com", emailConfirm: "taken@example.com", password: GOOD_PW });
    expect(r).toEqual({ ok: false, reason: "email_taken" });
  });

  it("rejects upgrading an account that already has a DIFFERENT email", async () => {
    const repo = createInMemoryAccountRepository();
    const guest = await createGuestAccount(repo);
    await upgradeGuestAccount(repo, { accountId: guest.id, email: "first@example.com", emailConfirm: "first@example.com", password: GOOD_PW });
    const r = await upgradeGuestAccount(repo, { accountId: guest.id, email: "second@example.com", emailConfirm: "second@example.com", password: GOOD_PW });
    expect(r).toEqual({ ok: false, reason: "already_has_email" });
  });

  it("rejects unknown accountId", async () => {
    const repo = createInMemoryAccountRepository();
    const r = await upgradeGuestAccount(repo, { accountId: "ghost", email: "g@example.com", emailConfirm: "g@example.com", password: GOOD_PW });
    expect(r).toEqual({ ok: false, reason: "account_not_found" });
  });
});

describe("evaluateGuestUpgrade (pure state machine)", () => {
  const guest: AccountRecord = { id: "g1", email: null, emailNormalized: null, isGuest: true, passwordHash: null, displayName: null };
  const upgraded: AccountRecord = { id: "g1", email: "a@b.com", emailNormalized: "a@b.com", isGuest: false, passwordHash: "h", displayName: null };

  it("account not found -> reject", () => {
    expect(evaluateGuestUpgrade(null, "a@b.com", null)).toEqual({ action: "reject", reason: "account_not_found" });
  });
  it("guest with free email -> proceed", () => {
    expect(evaluateGuestUpgrade(guest, "a@b.com", null)).toEqual({ action: "proceed" });
  });
  it("guest but email held by other -> email_taken", () => {
    const other: AccountRecord = { ...upgraded, id: "other" };
    expect(evaluateGuestUpgrade(guest, "a@b.com", other)).toEqual({ action: "reject", reason: "email_taken" });
  });
  it("already upgraded to same email -> idempotent success", () => {
    expect(evaluateGuestUpgrade(upgraded, "a@b.com", upgraded)).toEqual({ action: "already_upgraded_same" });
  });
  it("already upgraded to different email -> reject", () => {
    expect(evaluateGuestUpgrade(upgraded, "z@z.com", null)).toEqual({ action: "reject", reason: "already_has_email" });
  });
});
