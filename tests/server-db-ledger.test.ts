import { describe, expect, test, vi } from "vitest";
import {
  appendEntry,
  appendEntryTxn,
  validateLedgerEntry,
  isDuplicateKeyError,
  type LedgerEntryInput,
  type LedgerTxClient,
} from "../server/db/ledger";

// P2-08 — currency ledger double-entry (TA §7/§8, never-downgrade zone).
// ⛔ ไม่ต่อ DB จริง: inject mock tx client (spy $queryRaw/findUnique/create) + ตรวจลำดับ lock→balance→dup→check→insert.

const CHAR = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

type MockOpts = {
  balance?: bigint; // ยอดปัจจุบันที่ SUM ควรคืน
  existingKey?: boolean; // findUnique เจอ key เดิมไหม (idempotent replay)
  createThrows?: unknown; // ให้ create โยน error (จำลอง unique race / DB error)
};

/** mock tx client — บันทึกลำดับ op ใน `calls` เพื่อ assert lock ต้องมาก่อน check ก่อน insert เสมอ. */
function makeTx(opts: MockOpts = {}) {
  const calls: string[] = [];
  const create = vi.fn(async () => {
    calls.push("insert");
    if (opts.createThrows !== undefined) throw opts.createThrows;
    return {};
  });
  const findUnique = vi.fn(async () => {
    calls.push("dupCheck");
    return opts.existingKey ? { id: 1n } : null;
  });
  const $queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join(" ");
    if (/FOR UPDATE/.test(sql)) {
      calls.push("lock");
      return [] as unknown;
    }
    calls.push("balance");
    return [{ balance: opts.balance ?? 0n }] as unknown;
  });
  const tx: LedgerTxClient = {
    $queryRaw: $queryRaw as unknown as LedgerTxClient["$queryRaw"],
    currencyLedger: { findUnique, create },
  };
  return { tx, calls, create, findUnique, $queryRaw };
}

function entry(over: Partial<LedgerEntryInput> = {}): LedgerEntryInput {
  return {
    characterId: CHAR,
    currency: "gold",
    amount: 100n,
    reason: "drop",
    idempotencyKey: "key-1",
    ...over,
  };
}

describe("validateLedgerEntry (input guards — throw = caller bug)", () => {
  test("รับ input ปกติ", () => {
    expect(validateLedgerEntry(entry())).toEqual(entry());
  });
  test("characterId ว่าง → throw", () => {
    expect(() => validateLedgerEntry(entry({ characterId: "" }))).toThrow(/characterId/);
  });
  test("amount = 0 → throw (reject, ไม่ใช่ no-op เงียบ)", () => {
    expect(() => validateLedgerEntry(entry({ amount: 0n }))).toThrow(/amount = 0/);
  });
  test("amount ไม่ใช่ bigint → throw (กัน Number หลุดเข้า)", () => {
    expect(() =>
      validateLedgerEntry(entry({ amount: 100 as unknown as bigint })),
    ).toThrow(/bigint/);
  });
  test("idempotencyKey ว่าง → throw", () => {
    expect(() => validateLedgerEntry(entry({ idempotencyKey: "" }))).toThrow(/idempotencyKey/);
  });
});

describe("isDuplicateKeyError", () => {
  test("Prisma typed P2002 → true", () => {
    expect(isDuplicateKeyError({ code: "P2002" })).toBe(true);
  });
  test("raw path P2010 + meta 1062 → true", () => {
    expect(isDuplicateKeyError({ code: "P2010", meta: { code: "1062" } })).toBe(true);
  });
  test("ข้อความ Duplicate entry → true", () => {
    expect(isDuplicateKeyError({ message: "Duplicate entry 'key-1' for key ..." })).toBe(true);
  });
  test("error อื่น / null → false", () => {
    expect(isDuplicateKeyError({ code: "P2010", meta: { code: "1213" } })).toBe(false);
    expect(isDuplicateKeyError(new Error("connection refused"))).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
  });
});

describe("appendEntryTxn — sequence + business outcomes", () => {
  test("credit ปกติ: lock→balance→dupCheck→insert, ยอดใหม่ = current + amount", async () => {
    const { tx, calls, create } = makeTx({ balance: 500n });
    const r = await appendEntryTxn(tx, entry({ amount: 100n }));
    expect(calls).toEqual(["lock", "balance", "dupCheck", "insert"]);
    expect(r).toEqual({ status: "applied", balance: 600n });
    expect(create).toHaveBeenCalledOnce();
  });

  test("insert ส่ง field ครบ + refType/refId default null", async () => {
    const { tx, create } = makeTx({ balance: 0n });
    await appendEntryTxn(tx, entry({ amount: 50n, reason: "quest_reward" }));
    expect(create).toHaveBeenCalledWith({
      data: {
        characterId: CHAR,
        currency: "gold",
        amount: 50n,
        reason: "quest_reward",
        refType: null,
        refId: null,
        idempotencyKey: "key-1",
      },
    });
  });

  test("debit พอดียอด → applied, ยอดใหม่ = 0", async () => {
    const { tx, create } = makeTx({ balance: 100n });
    const r = await appendEntryTxn(tx, entry({ amount: -100n, reason: "market_purchase" }));
    expect(r).toEqual({ status: "applied", balance: 0n });
    expect(create).toHaveBeenCalledOnce();
  });

  test("debit เกินยอด → insufficient_funds, **ไม่ insert**", async () => {
    const { tx, calls, create } = makeTx({ balance: 100n });
    const r = await appendEntryTxn(tx, entry({ amount: -150n, reason: "market_purchase" }));
    expect(r).toEqual({ status: "insufficient_funds", balance: 100n });
    expect(create).not.toHaveBeenCalled();
    expect(calls).toEqual(["lock", "balance", "dupCheck"]); // ตรวจก่อน insert เสมอ
  });

  test("duplicate key (check-first เจอ) → duplicate, ไม่ insert, คืนยอดปัจจุบัน", async () => {
    const { tx, calls, create } = makeTx({ balance: 300n, existingKey: true });
    const r = await appendEntryTxn(tx, entry({ amount: 100n }));
    expect(r).toEqual({ status: "duplicate", balance: 300n });
    expect(create).not.toHaveBeenCalled();
    expect(calls).toEqual(["lock", "balance", "dupCheck"]);
  });

  test("duplicate race: create โยน P2002 → duplicate (ไม่ throw ใส่ caller)", async () => {
    const { tx, create } = makeTx({ balance: 300n, createThrows: { code: "P2002" } });
    const r = await appendEntryTxn(tx, entry({ amount: 100n }));
    expect(r).toEqual({ status: "duplicate", balance: 300n });
    expect(create).toHaveBeenCalledOnce();
  });

  test("error อื่นตอน insert (DB ล่ม) → strict throw ขึ้น caller", async () => {
    const { tx } = makeTx({ balance: 300n, createThrows: new Error("connection lost") });
    await expect(appendEntryTxn(tx, entry({ amount: 100n }))).rejects.toThrow(/connection lost/);
  });

  test("SUM คืน string/DECIMAL → coerce เป็น bigint ถูกต้อง", async () => {
    const { tx } = makeTx({ balance: "250" as unknown as bigint });
    const r = await appendEntryTxn(tx, entry({ amount: -50n, reason: "market_purchase" }));
    expect(r).toEqual({ status: "applied", balance: 200n });
  });
});

describe("appendEntry — validate ก่อน แล้ว run ใน $transaction", () => {
  test("validate fail → throw ก่อนเปิด transaction (ไม่แตะ DB)", async () => {
    const $transaction = vi.fn();
    await expect(
      appendEntry(entry({ amount: 0n }), { $transaction }),
    ).rejects.toThrow(/amount = 0/);
    expect($transaction).not.toHaveBeenCalled();
  });

  test("valid → เรียก $transaction แล้วคืนผลของ txn", async () => {
    const { tx } = makeTx({ balance: 500n });
    const $transaction = vi.fn(
      (fn: (t: LedgerTxClient) => Promise<unknown>) => fn(tx),
    );
    const r = await appendEntry(
      entry({ amount: 100n }),
      { $transaction } as unknown as Parameters<typeof appendEntry>[1],
    );
    expect($transaction).toHaveBeenCalledOnce();
    expect(r).toEqual({ status: "applied", balance: 600n });
  });
});
