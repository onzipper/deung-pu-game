// P2-03 — password policy (pure). Source: OWNER_PRODUCTION_DECISIONS_P2B §1.4.
//
// spec §1.4 (passphrase-friendly — ไม่บังคับ pattern):
//   minLength 10 · maxLength 128 · requireUppercase/Lowercase/Number/Symbol = false
//   rejectCommonPasswords: true · hashing: argon2id-or-equivalent (ดู password.ts)

import { isCommonPassword } from "./common-passwords";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordValidation =
  | { ok: true }
  | { ok: false; reason: "too_short" | "too_long" | "common" | "not_a_string" };

/**
 * ตรวจตาม §1.4 — ต้องรันทั้ง client (feedback) และ server (authority, §1.7 "Password weak").
 * ไม่ trim: ช่องว่างต้น/ท้ายเป็นส่วนของ passphrase ที่ผู้ใช้ตั้งใจ.
 */
export function validatePassword(password: unknown): PasswordValidation {
  if (typeof password !== "string") return { ok: false, reason: "not_a_string" };
  if (password.length < PASSWORD_MIN_LENGTH) return { ok: false, reason: "too_short" };
  if (password.length > PASSWORD_MAX_LENGTH) return { ok: false, reason: "too_long" };
  if (isCommonPassword(password)) return { ok: false, reason: "common" };
  return { ok: true };
}
