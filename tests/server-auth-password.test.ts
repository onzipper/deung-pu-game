import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("password hashing (scrypt, §1.4)", () => {
  it("hash -> verify roundtrip succeeds", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  it("wrong password fails", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
  });

  it("hash is self-describing (scrypt$N$r$p$salt$hash) and salted (unique per call)", async () => {
    const a = await hashPassword("same-passphrase-xyz");
    const b = await hashPassword("same-passphrase-xyz");
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(a.split("$")).toHaveLength(6);
    expect(a).not.toBe(b); // random salt
    expect(await verifyPassword("same-passphrase-xyz", a)).toBe(true);
    expect(await verifyPassword("same-passphrase-xyz", b)).toBe(true);
  });

  it("verify returns false (no throw) on malformed/unknown-algo hash", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "argon2$1$2$3$4$5")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1$2$3$$")).toBe(false);
    expect(await verifyPassword("x", 123 as unknown as string)).toBe(false);
  });
});
