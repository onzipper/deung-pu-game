// P2-03 — auth service (orchestration). พึ่งเฉพาะ AccountRepository → เทสต์ด้วย memory repo ได้ ไม่ต่อ DB.
// Source: OWNER_PRODUCTION_DECISIONS_P2B §1 · Storage §4/§5.
//
// ทุก method คืน discriminated result (ไม่ throw สำหรับ validation ที่คาดได้) → route handler map เป็น HTTP status.
// hashing/verify = async (scrypt). email/password validate = pure module.

import { validateEmail, emailConfirmationMatches } from "./email";
import { validatePassword } from "./password-policy";
import { hashPassword, verifyPassword } from "./password";
import { evaluateGuestUpgrade } from "./upgrade";
import { EmailTakenError, type AccountRepository, type AccountRecord } from "./repository";

/** view ที่ปลอดภัยส่งกลับ client (ไม่มี passwordHash). */
export interface AccountView {
  id: string;
  email: string | null;
  isGuest: boolean;
  displayName: string | null;
}

export function toAccountView(a: AccountRecord): AccountView {
  return { id: a.id, email: a.email, isGuest: a.isGuest, displayName: a.displayName };
}

export interface RegisterInput {
  email: unknown;
  emailConfirm: unknown;
  password: unknown;
  displayName?: string | null;
}

export interface UpgradeInput {
  accountId: string;
  email: unknown;
  emailConfirm: unknown;
  password: unknown;
}

export type AuthFailReason =
  | "invalid_email"
  | "email_mismatch"
  | "weak_password"
  | "email_taken"
  | "invalid_credentials"
  | "account_not_found"
  | "already_has_email";

export type AuthResult =
  | { ok: true; account: AccountView }
  | { ok: false; reason: AuthFailReason };

// ── guest ────────────────────────────────────────────────────────────────────

/** สร้าง guest ทันที (ไม่ต้องกรอกอะไร) — §5.1. */
export async function createGuestAccount(repo: AccountRepository): Promise<AccountView> {
  const account = await repo.createGuest();
  return toAccountView(account);
}

// ── email register ─────────────────────────────────────────────────────────────

export async function registerEmailAccount(
  repo: AccountRepository,
  input: RegisterInput,
): Promise<AuthResult> {
  const email = validateEmail(input.email);
  if (!email.ok) return { ok: false, reason: "invalid_email" };
  if (!emailConfirmationMatches(input.email, input.emailConfirm)) {
    return { ok: false, reason: "email_mismatch" };
  }
  const pw = validatePassword(input.password);
  if (!pw.ok) return { ok: false, reason: "weak_password" };

  const existing = await repo.findByEmailNormalized(email.value.normalized);
  if (existing) return { ok: false, reason: "email_taken" };

  const passwordHash = await hashPassword(input.password as string);
  try {
    const account = await repo.createEmailAccount({
      emailDisplay: email.value.display,
      emailNormalized: email.value.normalized,
      passwordHash,
      displayName: input.displayName ?? null,
    });
    return { ok: true, account: toAccountView(account) };
  } catch (err) {
    if (err instanceof EmailTakenError) return { ok: false, reason: "email_taken" };
    throw err;
  }
}

// ── email login ──────────────────────────────────────────────────────────────

export async function loginEmailAccount(
  repo: AccountRepository,
  email: unknown,
  password: unknown,
): Promise<AuthResult> {
  const parsed = validateEmail(email);
  // ไม่แยก reason invalid_email กับ not-found → กัน user-enumeration (คืน invalid_credentials เหมือนกัน)
  if (!parsed.ok || typeof password !== "string") {
    return { ok: false, reason: "invalid_credentials" };
  }
  const account = await repo.findByEmailNormalized(parsed.value.normalized);
  if (!account || account.passwordHash === null) {
    return { ok: false, reason: "invalid_credentials" };
  }
  const match = await verifyPassword(password, account.passwordHash);
  if (!match) return { ok: false, reason: "invalid_credentials" };
  return { ok: true, account: toAccountView(account) };
}

// ── guest → email upgrade ──────────────────────────────────────────────────────

/**
 * ผูก email เข้า guest account เดิม — accountId เดิม, progress ครบ (§1.2/§1.9).
 * idempotent: ผูก email เดิมซ้ำ = success (§1.7 duplicate submit); email ของคนอื่น = email_taken.
 */
export async function upgradeGuestAccount(
  repo: AccountRepository,
  input: UpgradeInput,
): Promise<AuthResult> {
  const email = validateEmail(input.email);
  if (!email.ok) return { ok: false, reason: "invalid_email" };
  if (!emailConfirmationMatches(input.email, input.emailConfirm)) {
    return { ok: false, reason: "email_mismatch" };
  }
  const pw = validatePassword(input.password);
  if (!pw.ok) return { ok: false, reason: "weak_password" };

  const account = await repo.findById(input.accountId);
  const otherHolder = await repo.findByEmailNormalized(email.value.normalized);
  const decision = evaluateGuestUpgrade(account, email.value.normalized, otherHolder);

  switch (decision.action) {
    case "already_upgraded_same":
      // account! แน่นอน (decision นี้เกิดเมื่อ account ผูก email เดิมแล้ว)
      return { ok: true, account: toAccountView(account as AccountRecord) };
    case "reject":
      return { ok: false, reason: decision.reason };
    case "proceed": {
      const passwordHash = await hashPassword(input.password as string);
      try {
        const upgraded = await repo.upgradeGuestToEmail({
          accountId: input.accountId,
          emailDisplay: email.value.display,
          emailNormalized: email.value.normalized,
          passwordHash,
        });
        return { ok: true, account: toAccountView(upgraded) };
      } catch (err) {
        // race: อีก request คว้า email ระหว่างทาง (unique violation) → §1.7 email used
        if (err instanceof EmailTakenError) return { ok: false, reason: "email_taken" };
        throw err;
      }
    }
  }
}
