// P2-06a — in-memory CharacterRepository (เทสต์ + local reasoning, ไม่ต่อ DB).
// จำลอง unique constraint บน name (case-insensitive, ตรงกับ DB collation utf8mb4_unicode_ci — schema.prisma).

import { randomUUID } from "node:crypto";
import {
  NameTakenError,
  type CharacterRecord,
  type CharacterRepository,
  type CreateCharacterInput,
} from "./repository";

export interface InMemoryCharacterRepository extends CharacterRepository {
  /** จำนวนตัวละครทั้งหมด (ทุก account) — assert ไม่มี duplicate id หลัง create */
  count(): number;
}

export function createInMemoryCharacterRepository(): InMemoryCharacterRepository {
  const byId = new Map<string, CharacterRecord>();
  const nameIndex = new Map<string, string>(); // name.toLowerCase() → characterId

  function clone(c: CharacterRecord): CharacterRecord {
    return { ...c };
  }

  return {
    async countByAccount(accountId: string): Promise<number> {
      let n = 0;
      for (const c of byId.values()) if (c.accountId === accountId) n++;
      return n;
    },

    async create(input: CreateCharacterInput): Promise<CharacterRecord> {
      const key = input.name.toLowerCase();
      if (nameIndex.has(key)) throw new NameTakenError();
      const record: CharacterRecord = {
        id: randomUUID(),
        accountId: input.accountId,
        name: input.name,
        classId: input.classId,
        level: 1,
        createdAt: new Date(),
        lastMapId: null, // memory repo ไม่จำลอง CharacterState relation — ตัวใหม่ = ยังไม่เคย save
      };
      byId.set(record.id, record);
      nameIndex.set(key, record.id);
      return clone(record);
    },

    async listByAccount(accountId: string): Promise<CharacterRecord[]> {
      return Array.from(byId.values())
        .filter((c) => c.accountId === accountId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(clone);
    },

    async findById(id: string): Promise<CharacterRecord | null> {
      const c = byId.get(id);
      return c ? clone(c) : null;
    },

    count(): number {
      return byId.size;
    },
  };
}
