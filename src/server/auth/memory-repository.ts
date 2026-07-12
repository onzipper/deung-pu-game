// P2-03 — in-memory AccountRepository (เทสต์ + local reasoning, ไม่ต่อ DB).
// จำลอง unique constraint บน emailNormalized + atomic upgrade เพื่อทดสอบ service logic ครบเส้นทาง.

import { randomUUID } from "node:crypto";
import {
  EmailTakenError,
  type AccountRecord,
  type AccountRepository,
  type CreateEmailAccountInput,
  type UpgradeGuestInput,
} from "./repository";

export interface InMemoryAccountRepository extends AccountRepository {
  /** จำนวน account (assert ว่าไม่มี duplicate account หลัง upgrade — §1.9). */
  count(): number;
}

export function createInMemoryAccountRepository(): InMemoryAccountRepository {
  const byId = new Map<string, AccountRecord>();
  const emailIndex = new Map<string, string>(); // emailNormalized → accountId

  function clone(a: AccountRecord): AccountRecord {
    return { ...a };
  }

  return {
    async createGuest(): Promise<AccountRecord> {
      const account: AccountRecord = {
        id: randomUUID(),
        email: null,
        emailNormalized: null,
        isGuest: true,
        passwordHash: null,
        displayName: null,
      };
      byId.set(account.id, account);
      return clone(account);
    },

    async findById(id: string): Promise<AccountRecord | null> {
      const a = byId.get(id);
      return a ? clone(a) : null;
    },

    async findByEmailNormalized(emailNormalized: string): Promise<AccountRecord | null> {
      const id = emailIndex.get(emailNormalized);
      if (!id) return null;
      const a = byId.get(id);
      return a ? clone(a) : null;
    },

    async createEmailAccount(input: CreateEmailAccountInput): Promise<AccountRecord> {
      if (emailIndex.has(input.emailNormalized)) throw new EmailTakenError();
      const account: AccountRecord = {
        id: randomUUID(),
        email: input.emailDisplay,
        emailNormalized: input.emailNormalized,
        isGuest: false,
        passwordHash: input.passwordHash,
        displayName: input.displayName ?? null,
      };
      byId.set(account.id, account);
      emailIndex.set(input.emailNormalized, account.id);
      return clone(account);
    },

    async upgradeGuestToEmail(input: UpgradeGuestInput): Promise<AccountRecord> {
      const account = byId.get(input.accountId);
      if (!account) throw new Error("account_not_found");
      const holder = emailIndex.get(input.emailNormalized);
      if (holder && holder !== account.id) throw new EmailTakenError();
      // atomic mutate — accountId เดิม, ไม่สร้าง account ใหม่ (§1.2/§1.9)
      account.email = input.emailDisplay;
      account.emailNormalized = input.emailNormalized;
      account.passwordHash = input.passwordHash;
      account.isGuest = false;
      emailIndex.set(input.emailNormalized, account.id);
      return clone(account);
    },

    count(): number {
      return byId.size;
    },
  };
}
