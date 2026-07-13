// P2-03 — email normalization + validation (pure).
// Source of truth: OWNER_PRODUCTION_DECISIONS_P2B §1.3 (email rules).
//
// spec §1.3:
//   normalize: trimWhitespace, lowercaseDomain, lowercaseFullAddressForUniqueness
//   unique: true · maxLength: 254 · confirmationFieldRequired: true
//
// เก็บทั้ง display (trim + lowercase domain) และ normalized (lowercase ทั้ง address)
// — normalized ใช้เป็น uniqueness key; display เก็บไว้แสดง/ส่งเมล.

export const EMAIL_MAX_LENGTH = 254;

// RFC 5321 practical: local@domain, ไม่รับ whitespace/หลาย @ — ตรวจหยาบพอสำหรับ gate
// (bounce จริง = verification flow ตอน closed alpha, spec §1.6).
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export interface NormalizedEmail {
  /** สำหรับแสดง/ส่งเมล — trim + domain lowercase (local case คงไว้) */
  display: string;
  /** สำหรับ uniqueness — lowercase ทั้ง address */
  normalized: string;
}

export type EmailValidation =
  | { ok: true; value: NormalizedEmail }
  | { ok: false; reason: "empty" | "too_long" | "invalid_format" };

/** แยก local@domain, lowercase domain เสมอ. คืน null ถ้ารูปแบบผิด. */
function splitEmail(trimmed: string): { local: string; domain: string } | null {
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  return { local: trimmed.slice(0, at), domain: trimmed.slice(at + 1).toLowerCase() };
}

export function validateEmail(raw: unknown): EmailValidation {
  if (typeof raw !== "string") return { ok: false, reason: "invalid_format" };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (trimmed.length > EMAIL_MAX_LENGTH) return { ok: false, reason: "too_long" };
  if (!EMAIL_RE.test(trimmed)) return { ok: false, reason: "invalid_format" };
  const parts = splitEmail(trimmed);
  if (!parts) return { ok: false, reason: "invalid_format" };
  const display = `${parts.local}@${parts.domain}`;
  const normalized = display.toLowerCase();
  return { ok: true, value: { display, normalized } };
}

/**
 * true ถ้าผู้ใช้พิมพ์ email ทั้งสองช่องตรงกัน (double-entry กัน typo, §1.3 confirmationFieldRequired).
 * เทียบ **ค่าดิบที่ผู้ใช้กรอก** (หลัง trim) ไม่ใช่ display ที่ normalize domain แล้ว —
 * ไม่งั้นกรอกโดเมนตัวใหญ่เหมือนกันสองครั้งจะถูกปฏิเสธผิด ๆ.
 */
export function emailConfirmationMatches(email: unknown, confirm: unknown): boolean {
  return (
    typeof email === "string" &&
    typeof confirm === "string" &&
    email.trim() === confirm.trim()
  );
}
