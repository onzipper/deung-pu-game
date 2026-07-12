// P2-03 — account repository contract (trust boundary: inject-able เพื่อเทสต์โดยไม่ต่อ DB).
//
// service.ts พึ่งเฉพาะ interface นี้ (ไม่รู้จัก Prisma) → unit test ใช้ memory-repository.ts.
// Prisma-backed impl อยู่ prisma-repository.ts (server route ประกอบเอง). **ห้ามให้ service import Prisma.**

/** สภาพ account ที่ auth ต้องใช้ (subset ของตาราง accounts + field ที่ schema ยังต้องเพิ่ม — ดูรายงาน). */
export interface AccountRecord {
  id: string;
  /** display email (trim + domain lowercase) — null = guest ยังไม่ผูก */
  email: string | null;
  /** uniqueness key (lowercase ทั้ง address) — null = guest; **ต้องเพิ่ม field ใน schema** */
  emailNormalized: string | null;
  isGuest: boolean;
  /** self-describing password hash — null = guest/no password; **ต้องเพิ่ม field ใน schema** */
  passwordHash: string | null;
  displayName: string | null;
}

export interface CreateEmailAccountInput {
  emailDisplay: string;
  emailNormalized: string;
  passwordHash: string;
  displayName?: string | null;
}

export interface UpgradeGuestInput {
  accountId: string;
  emailDisplay: string;
  emailNormalized: string;
  passwordHash: string;
}

/**
 * สัญญาที่ layer DB ต้องทำให้ครบ. write ที่ต้องกัน race (email unique, guest upgrade)
 * ต้องเป็น atomic ฝั่ง impl (Prisma: unique constraint + transaction; §1.2 "transaction เดียว").
 */
export interface AccountRepository {
  createGuest(): Promise<AccountRecord>;
  findById(id: string): Promise<AccountRecord | null>;
  findByEmailNormalized(emailNormalized: string): Promise<AccountRecord | null>;
  createEmailAccount(input: CreateEmailAccountInput): Promise<AccountRecord>;
  /**
   * ผูก email เข้า guest account เดิม (accountId เดิม, progress ครบ — §1.2/§1.9).
   * ต้อง atomic + กัน email ซ้ำ (unique violation → EmailTakenError).
   */
  upgradeGuestToEmail(input: UpgradeGuestInput): Promise<AccountRecord>;
}

/** impl โยน error นี้เมื่อชน unique constraint (email) — service แปลงเป็น reason "email_taken". */
export class EmailTakenError extends Error {
  constructor() {
    super("email already registered");
    this.name = "EmailTakenError";
  }
}
