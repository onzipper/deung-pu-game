// Currency ledger — double-entry (TA §7/§8).
//
// หลักการ (TA §7): **ไม่มี balance column ที่ไหนทั้งนั้น** — ยอดคงเหลือ = SUM(amount) ของ ledger.
//   append-only: ห้าม UPDATE/DELETE. rollback = compensating entry (แถวใหม่ amount ตรงข้าม) ไม่ใช่ลบแถว.
//   ทุกแถวมี reason + reference + idempotencyKey (unique) กัน replay / double-spend.
//
// ⛔ P2-02 = SKELETON เท่านั้น (lock type/contract). Transaction จริง (SELECT ... FOR UPDATE row lock +
//    idempotency insert + reconcile) มาใน **P2-08**. อย่า implement เกิน scope ที่นี่.

import { getPrisma } from "./client";
import type { CurrencyType, LedgerReason } from "@prisma/client";

export type { CurrencyType, LedgerReason };

/** input ของ 1 ledger entry — amount เป็น +/- delta (bigint, กัน overflow ที่ยอดสูง). */
export type LedgerEntryInput = {
  characterId: string;
  currency: CurrencyType;
  amount: bigint; // + = ได้เงิน, - = จ่ายเงิน
  reason: LedgerReason;
  refType?: string;
  refId?: string;
  idempotencyKey: string; // unique — ยิงซ้ำด้วย key เดิม = no-op (idempotent)
};

/**
 * ยอดคงเหลือของ 1 สกุลเงิน = SUM(amount) (ไม่มี balance column — TA §7).
 * ใช้ raw SQL เพราะ ledger path ต้องคุม query ตรง (TA §8: ledger ใช้ Prisma + raw SQL).
 */
export async function getBalance(
  characterId: string,
  currency: CurrencyType,
): Promise<bigint> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<{ balance: bigint | null }[]>`
    SELECT COALESCE(SUM(amount), 0) AS balance
    FROM currency_ledger
    WHERE character_id = ${characterId} AND currency = ${currency}
  `;
  return rows[0]?.balance ?? 0n;
}

/**
 * เพิ่ม 1 ledger entry (idempotent ด้วย idempotencyKey).
 *
 * TODO(P2-08): implement เป็น transaction จริง —
 *   1) SELECT ... FOR UPDATE row lock ตาม (characterId, currency) กัน race/double-spend
 *   2) INSERT ledger entry; unique(idempotencyKey) → ยิงซ้ำ = ไม่เพิ่มยอด (catch duplicate → return เดิม)
 *   3) (ถ้ามี debit) ตรวจ SUM ≥ amount ก่อน commit — ยอดติดลบ = reject
 *   rollback = compensating entry ไม่ใช่ลบแถว.
 * ตอนนี้ยังไม่ implement (skeleton lock contract เท่านั้น) — เรียกแล้ว throw กัน misuse ก่อน P2-08.
 */
export async function appendEntry(_entry: LedgerEntryInput): Promise<void> {
  throw new Error(
    "[ledger] appendEntry ยังไม่ implement — transaction path มาใน P2-08 (P2-02 = schema/foundation เท่านั้น)",
  );
}
