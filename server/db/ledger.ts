// Currency ledger — double-entry (TA §7/§8). **Never-downgrade zone (in-game money): correctness first.**
//
// หลักการ (TA §7): **ไม่มี balance column ที่ไหนทั้งนั้น** — ยอดคงเหลือ = SUM(amount) ของ ledger.
//   append-only: ห้าม UPDATE/DELETE. rollback = compensating entry (แถวใหม่ amount ตรงข้าม) ไม่ใช่ลบแถว.
//   ทุกแถวมี reason + reference + idempotencyKey (unique) กัน replay / double-spend.
//
// ⛔ ต่างจาก character-state (best-effort skip เมื่อ DB ล่ม) — ledger **strict**: DB ล่ม/ไม่มี DATABASE_URL
//    → โยน error ขึ้นไป, ห้ามแกล้งสำเร็จ. เงินหายเงียบ = บั๊กที่แย่กว่าเกมสะดุด.

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
 * ผลของ appendEntry (contract P2-08). ไม่ throw ในเคส business ปกติ — caller อ่าน `status`:
 *   • `applied`            — INSERT สำเร็จ, `balance` = ยอดใหม่หลังรายการนี้
 *   • `duplicate`          — idempotencyKey เคยใช้แล้ว → ไม่ INSERT ซ้ำ, `balance` = ยอดปัจจุบัน
 *   • `insufficient_funds` — debit เกินยอด (ยอดจะติดลบ) → ไม่ INSERT, `balance` = ยอดปัจจุบัน
 * ส่วน input ที่ผิดรูป (amount 0 / ไม่ใช่ bigint / key ว่าง) = บั๊กฝั่ง caller → **throw** (ดู validateLedgerEntry).
 */
export type AppendEntryStatus = "applied" | "duplicate" | "insufficient_funds";
export type AppendEntryResult = {
  status: AppendEntryStatus;
  balance: bigint; // ยอดคงเหลือ (bigint เสมอ — ห้ามแปลงเป็น Number)
};

/** เผื่อ SUM(...) กลับมาเป็น DECIMAL/number/string (driver ต่างกัน) → บังคับเป็น bigint. amounts เป็น integer เสมอ. */
function coerceBalance(raw: bigint | number | string | null | undefined): bigint {
  if (raw == null) return 0n;
  if (typeof raw === "bigint") return raw;
  return BigInt(typeof raw === "number" ? Math.trunc(raw) : String(raw));
}

/**
 * ตรวจ input ก่อนเปิด transaction (throw = บั๊ก caller, ไม่ใช่ business outcome):
 *   • characterId ว่าง → reject (ทุกรายการต้องผูกตัวละคร)
 *   • amount ไม่ใช่ bigint → reject (กัน Number ที่ overflow/ปัดเศษหลุดเข้ามา)
 *   • amount = 0 → **reject** (เลือกไว้: ledger เก็บเฉพาะการเปลี่ยนยอดจริง, entry ศูนย์ = บั๊ก ไม่ใช่ no-op เงียบ)
 *   • idempotencyKey ว่าง → reject (ต้องมี key กัน replay/double-spend)
 */
export function validateLedgerEntry(entry: LedgerEntryInput): LedgerEntryInput {
  if (typeof entry.characterId !== "string" || entry.characterId.length === 0) {
    throw new Error("[ledger] characterId ว่าง — ทุกรายการต้องผูกตัวละคร");
  }
  if (typeof entry.amount !== "bigint") {
    throw new Error("[ledger] amount ต้องเป็น bigint (ห้าม Number — กัน overflow/ปัดเศษในยอดเงิน)");
  }
  if (entry.amount === 0n) {
    throw new Error("[ledger] amount = 0 ไม่อนุญาต — ledger เก็บเฉพาะการเปลี่ยนแปลงยอดจริง");
  }
  if (typeof entry.idempotencyKey !== "string" || entry.idempotencyKey.length === 0) {
    throw new Error("[ledger] idempotencyKey ว่าง — ต้องมี key กัน replay/double-spend");
  }
  return entry;
}

/** duplicate-key ของ unique(idempotency_key) — ทั้ง typed API (P2002) และ raw path (MariaDB ER_DUP_ENTRY 1062). */
export function isDuplicateKeyError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
  if (e.code === "P2002") return true; // Prisma typed create() unique violation
  if (e.code === "P2010" && e.meta?.code === "1062") return true; // Prisma raw path (MySQL/MariaDB dup)
  return typeof e.message === "string" && /Duplicate entry/i.test(e.message);
}

/** surface ขั้นต่ำของ Prisma tx client ที่ ledger ใช้ (seam สำหรับ inject mock ในเทสต์ — ไม่ต่อ DB จริง). */
export type LedgerTxClient = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  currencyLedger: {
    findUnique(args: {
      where: { idempotencyKey: string };
      select: { id: true };
    }): Promise<{ id: bigint } | null>;
    create(args: {
      data: {
        characterId: string;
        currency: CurrencyType;
        amount: bigint;
        reason: LedgerReason;
        refType: string | null;
        refId: string | null;
        idempotencyKey: string;
      };
    }): Promise<unknown>;
  };
};

type LedgerPrismaClient = {
  $transaction<R>(fn: (tx: LedgerTxClient) => Promise<R>): Promise<R>;
};

/**
 * ยอดคงเหลือของ 1 สกุลเงิน = SUM(amount) (ไม่มี balance column — TA §7).
 * ใช้ raw SQL เพราะ ledger path ต้องคุม query ตรง (TA §8). CAST AS SIGNED → ได้ bigint จริง (ไม่ใช่ DECIMAL).
 */
export async function getBalance(
  characterId: string,
  currency: CurrencyType,
): Promise<bigint> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<{ balance: bigint | number | string | null }[]>`
    SELECT CAST(COALESCE(SUM(amount), 0) AS SIGNED) AS balance
    FROM currency_ledger
    WHERE character_id = ${characterId} AND currency = ${currency}
  `;
  return coerceBalance(rows[0]?.balance);
}

/**
 * transaction body ของ appendEntry — แยกออกมาเพื่อเทสต์ลำดับ lock→balance→dup→check→insert
 * ด้วย mock tx (ไม่ต่อ DB). ลำดับสำคัญต่อความถูกต้อง ห้ามสลับ:
 *   1) LOCK — SELECT ... FOR UPDATE บนช่วง index (character_id, currency). ledger ไม่มี anchor row
 *      จึงล็อกที่แถวจริง + gap (InnoDB next-key ใต้ REPEATABLE READ = Prisma/MySQL default) เพื่อ
 *      serialize credit/debit ที่ชนกัน และกัน phantom insert ในช่วงเดียวกัน (กัน double-spend).
 *      **ห้าม lower isolation เป็น READ COMMITTED** — gap lock จะหาย.
 *   2) BALANCE — อ่าน SUM ใต้ lock (bigint ตลอด).
 *   3) IDEMPOTENCY — เจอ key เดิมแล้ว → duplicate (ไม่ insert), คืนยอดปัจจุบัน.
 *   4) DEBIT GUARD — ยอดใหม่ห้ามติดลบ (no overdraft) → insufficient_funds (ไม่ insert).
 *   5) INSERT — unique(idempotency_key) = ด่านสุดท้ายระดับ DB: ถ้าแข่งกันหลุด lock หรือ key ถูกใช้
 *      ข้ามตัวละคร → treat เป็น duplicate, **ไม่ throw ใส่ caller**.
 */
export async function appendEntryTxn(
  tx: LedgerTxClient,
  entry: LedgerEntryInput,
): Promise<AppendEntryResult> {
  // 1) LOCK (character_id, currency) range — result ทิ้ง, จุดประสงค์คือถือ lock ถึง commit.
  await tx.$queryRaw`
    SELECT id FROM currency_ledger
    WHERE character_id = ${entry.characterId} AND currency = ${entry.currency}
    FOR UPDATE
  `;

  // 2) BALANCE ใต้ lock.
  const rows = await tx.$queryRaw<{ balance: bigint | number | string | null }[]>`
    SELECT CAST(COALESCE(SUM(amount), 0) AS SIGNED) AS balance
    FROM currency_ledger
    WHERE character_id = ${entry.characterId} AND currency = ${entry.currency}
  `;
  const current = coerceBalance(rows[0]?.balance);

  // 3) IDEMPOTENCY.
  const existing = await tx.currencyLedger.findUnique({
    where: { idempotencyKey: entry.idempotencyKey },
    select: { id: true },
  });
  if (existing) return { status: "duplicate", balance: current };

  // 4) DEBIT GUARD — ยอดใหม่ติดลบ = จ่ายเกิน → reject โดยไม่ insert.
  const next = current + entry.amount;
  if (next < 0n) return { status: "insufficient_funds", balance: current };

  // 5) INSERT (idempotency_key เป็นด่าน DB สุดท้าย).
  try {
    await tx.currencyLedger.create({
      data: {
        characterId: entry.characterId,
        currency: entry.currency,
        amount: entry.amount,
        reason: entry.reason,
        refType: entry.refType ?? null,
        refId: entry.refId ?? null,
        idempotencyKey: entry.idempotencyKey,
      },
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) return { status: "duplicate", balance: current };
    throw err; // error อื่น (DB ล่ม ฯลฯ) = strict, โยนขึ้น — ห้ามแกล้งสำเร็จ
  }
  return { status: "applied", balance: next };
}

/**
 * เพิ่ม 1 ledger entry แบบ atomic + idempotent (P2-08). contract อยู่ที่ AppendEntryResult / appendEntryTxn.
 * `prisma` param = seam ฉีด mock ในเทสต์ (default = singleton จริง) — caller เดิมเรียก appendEntry(entry) ได้เหมือนเดิม.
 */
export async function appendEntry(
  entry: LedgerEntryInput,
  // getPrisma() มี $transaction ที่กว้างกว่า LedgerPrismaClient (structural subset) — cast ตรงนี้จุดเดียว.
  prisma: LedgerPrismaClient = getPrisma() as unknown as LedgerPrismaClient,
): Promise<AppendEntryResult> {
  const validated = validateLedgerEntry(entry);
  return prisma.$transaction((tx) => appendEntryTxn(tx, validated));
}
