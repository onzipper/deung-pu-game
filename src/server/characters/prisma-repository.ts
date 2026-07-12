// P2-06a — Prisma-backed CharacterRepository (model Character มีอยู่แล้วใน schema.prisma — P2-02).
//
// semantics ต้องตรงกับ memory-repository.ts (service ถูกเทสต์ผ่าน memory impl):
// - unique อยู่ที่ name (schema @unique, collation utf8mb4_unicode_ci = case-insensitive) — ชนตอน race =
//   Prisma P2002 → NameTakenError (service แปลงเป็น reason "name_taken")

import { Prisma } from "@prisma/client";
import { getPrisma } from "../db";
import {
  NameTakenError,
  type CharacterRecord,
  type CharacterRepository,
  type CreateCharacterInput,
} from "./repository";

interface CharacterRow {
  id: string;
  accountId: string;
  name: string;
  classId: string;
  level: number;
  createdAt: Date;
}

function toRecord(row: CharacterRow): CharacterRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    classId: row.classId,
    level: row.level,
    createdAt: row.createdAt,
  };
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export function createPrismaCharacterRepository(): CharacterRepository {
  return {
    async countByAccount(accountId: string): Promise<number> {
      return getPrisma().character.count({ where: { accountId } });
    },

    async create(input: CreateCharacterInput): Promise<CharacterRecord> {
      try {
        const row = await getPrisma().character.create({
          data: { accountId: input.accountId, name: input.name, classId: input.classId },
        });
        return toRecord(row);
      } catch (e) {
        if (isUniqueViolation(e)) throw new NameTakenError();
        throw e;
      }
    },

    async listByAccount(accountId: string): Promise<CharacterRecord[]> {
      const rows = await getPrisma().character.findMany({
        where: { accountId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toRecord);
    },

    async findById(id: string): Promise<CharacterRecord | null> {
      const row = await getPrisma().character.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    },
  };
}
