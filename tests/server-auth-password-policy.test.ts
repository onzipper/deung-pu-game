import { describe, it, expect } from "vitest";
import {
  validatePassword,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "@/server/auth/password-policy";
import { isCommonPassword } from "@/server/auth/common-passwords";

describe("validatePassword (§1.4 passphrase-friendly)", () => {
  it("accepts a 10+ char non-common passphrase (no pattern requirement)", () => {
    expect(validatePassword("correct horse battery")).toEqual({ ok: true });
    expect(validatePassword("aaaaaaaaaaX9")).toEqual({ ok: true });
  });

  it("rejects shorter than min length", () => {
    expect(validatePassword("a".repeat(PASSWORD_MIN_LENGTH - 1))).toEqual({
      ok: false,
      reason: "too_short",
    });
  });

  it("rejects longer than max length", () => {
    expect(validatePassword("a".repeat(PASSWORD_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("rejects common passwords (case-insensitive) even if long enough", () => {
    expect(validatePassword("password123")).toEqual({ ok: false, reason: "common" });
    expect(validatePassword("PASSWORD123")).toEqual({ ok: false, reason: "common" });
    expect(isCommonPassword("QwErTyUiOp")).toBe(true);
  });

  it("rejects non-string", () => {
    expect(validatePassword(1234567890 as unknown)).toEqual({ ok: false, reason: "not_a_string" });
  });

  it("does not trim (leading/trailing spaces are part of the passphrase)", () => {
    expect(validatePassword("  spaced pass  ")).toEqual({ ok: true });
  });
});
