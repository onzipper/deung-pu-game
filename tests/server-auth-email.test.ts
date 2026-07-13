import { describe, it, expect } from "vitest";
import {
  validateEmail,
  emailConfirmationMatches,
  EMAIL_MAX_LENGTH,
} from "@/server/auth/email";

describe("validateEmail (§1.3 normalize)", () => {
  it("trim + lowercase domain, keep local case in display, normalized = full lowercase", () => {
    const r = validateEmail("  Jom.Worachart@Gmail.COM  ");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.display).toBe("Jom.Worachart@gmail.com");
      expect(r.value.normalized).toBe("jom.worachart@gmail.com");
    }
  });

  it("two addresses differing only by case share the same normalized key (uniqueness)", () => {
    const a = validateEmail("USER@Example.com");
    const b = validateEmail("user@example.COM");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.normalized).toBe(b.value.normalized);
  });

  it("rejects empty / whitespace-only", () => {
    expect(validateEmail("")).toEqual({ ok: false, reason: "empty" });
    expect(validateEmail("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects over max length (254)", () => {
    const long = "a".repeat(EMAIL_MAX_LENGTH) + "@x.com";
    expect(validateEmail(long)).toEqual({ ok: false, reason: "too_long" });
  });

  it("rejects malformed (no @ / no domain dot / double @ / spaces / non-string)", () => {
    for (const bad of ["nope", "a@b", "a@@b.com", "a b@x.com", "@x.com", "a@.com"]) {
      expect(validateEmail(bad).ok).toBe(false);
    }
    expect(validateEmail(123 as unknown).ok).toBe(false);
    expect(validateEmail(null as unknown).ok).toBe(false);
  });
});

describe("emailConfirmationMatches (§1.3 confirmationFieldRequired)", () => {
  it("matches after trim, rejects mismatch/non-string", () => {
    expect(emailConfirmationMatches("a@b.com", "  a@b.com ")).toBe(true);
    expect(emailConfirmationMatches("a@b.com", "b@b.com")).toBe(false);
    expect(emailConfirmationMatches("a@b.com", undefined)).toBe(false);
  });
});
