// P2-03 — Prisma-backed AccountRepository (เปิดใช้เต็มหลัง schema v2 เพิ่ม field auth แล้ว).
//
// semantics ต้องตรงกับ memory-repository.ts (service ถูกเทสต์ผ่าน memory impl):
// - unique อยู่ที่ emailNormalized (schema @unique) — ชนตอน race = Prisma P2002 → EmailTakenError
//   (service แปลงเป็น reason "email_taken" ทางเดียวกับ login fail — กัน user enumeration)
// - upgradeGuestToEmail = update **accountId เดิม** (ไม่สร้าง account ใหม่, progress อยู่ครบ §1.2/§1.9)
//   set email/emailNormalized/passwordHash/isGuest=false/upgradedAt ใน update เดียว (atomic ระดับ statement)

import { Prisma } from "@prisma/client";
import { getPrisma } from "../db";
import {
  EmailTakenError,
  type AccountRecord,
  type AccountRepository,
  type CreateEmailAccountInput,
  type UpgradeGuestInput,
} from "./repository";

// แถวดิบจาก prisma.account (เฉพาะ field ที่ auth ใช้)
interface AccountRow {
  id: string;
  email: string | null;
  emailNormalized: string | null;
  isGuest: boolean;
  passwordHash: string | null;
  displayName: string | null;
}

function toRecord(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    email: row.email,
    emailNormalized: row.emailNormalized,
    isGuest: row.isGuest,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
  };
}

/** P2002 = unique constraint violation (ที่นี่มีทางเดียวคือ email/emailNormalized ชน). */
function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export function createPrismaAccountRepository(): AccountRepository {
  return {
    async createGuest(): Promise<AccountRecord> {
      const row = await getPrisma().account.create({ data: { isGuest: true } });
      return toRecord(row);
    },

    async findById(id: string): Promise<AccountRecord | null> {
      const row = await getPrisma().account.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    },

    async findByEmailNormalized(emailNormalized: string): Promise<AccountRecord | null> {
      const row = await getPrisma().account.findUnique({ where: { emailNormalized } });
      return row ? toRecord(row) : null;
    },

    async createEmailAccount(input: CreateEmailAccountInput): Promise<AccountRecord> {
      try {
        const row = await getPrisma().account.create({
          data: {
            email: input.emailDisplay,
            emailNormalized: input.emailNormalized,
            passwordHash: input.passwordHash,
            isGuest: false,
            displayName: input.displayName ?? null,
          },
        });
        return toRecord(row);
      } catch (e) {
        if (isUniqueViolation(e)) throw new EmailTakenError();
        throw e;
      }
    },

    async upgradeGuestToEmail(input: UpgradeGuestInput): Promise<AccountRecord> {
      try {
        // update ที่ id เดิมเท่านั้น — คง accountId/progress; unique(emailNormalized) กัน race ที่ระดับ DB
        const row = await getPrisma().account.update({
          where: { id: input.accountId },
          data: {
            email: input.emailDisplay,
            emailNormalized: input.emailNormalized,
            passwordHash: input.passwordHash,
            isGuest: false,
            upgradedAt: new Date(),
          },
        });
        return toRecord(row);
      } catch (e) {
        if (isUniqueViolation(e)) throw new EmailTakenError();
        // P2025 = record not found — ให้ semantics เดียวกับ memory impl
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
          throw new Error("account_not_found");
        }
        throw e;
      }
    },
  };
}
