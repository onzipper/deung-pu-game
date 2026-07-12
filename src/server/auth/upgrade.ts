// P2-03 — guest→email upgrade decision (pure state machine). Source: spec §1.1/§1.2/§1.7/§1.9.
//
// แยกออกจาก service เพื่อเทสต์ตรรกะ idempotent/conflict ได้ตรง ๆ โดยไม่ต้องมี repo.
// ตัดสินจาก "สภาพ account ปัจจุบัน" + "มี account อื่นถือ email นี้ไหม" → action.

import type { AccountRecord } from "./repository";

export type UpgradeDecision =
  | { action: "proceed" }
  // duplicate submit ของ upgrade เดิม (account นี้ผูก email นี้ไปแล้ว) → idempotent success (§1.7)
  | { action: "already_upgraded_same" }
  | { action: "reject"; reason: "account_not_found" | "email_taken" | "already_has_email" };

/**
 * @param account       account ที่ session ชี้ (null = ไม่พบ)
 * @param emailNorm     normalized email ที่ผู้ใช้ขอผูก
 * @param otherHolder   account ที่ถือ emailNorm อยู่แล้ว (null = ว่าง); ต้อง query แยกก่อนเรียก
 */
export function evaluateGuestUpgrade(
  account: AccountRecord | null,
  emailNorm: string,
  otherHolder: AccountRecord | null,
): UpgradeDecision {
  if (!account) return { action: "reject", reason: "account_not_found" };

  // account นี้ผูก email แล้ว
  if (!account.isGuest || account.emailNormalized !== null) {
    if (account.emailNormalized === emailNorm) return { action: "already_upgraded_same" };
    // ผูก email อื่นไปแล้ว — ห้าม overwrite/re-auth (§1.3 ห้ามเปลี่ยน email โดยไม่ re-auth, §1.7 conflict)
    return { action: "reject", reason: "already_has_email" };
  }

  // email ถูกถือโดย account อื่น (ที่ไม่ใช่ตัวเอง) → ห้าม merge อัตโนมัติ (§1.3/§1.7)
  if (otherHolder && otherHolder.id !== account.id) {
    return { action: "reject", reason: "email_taken" };
  }

  return { action: "proceed" };
}
