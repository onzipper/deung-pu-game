// P2-06a — character repository contract (pattern เดียวกับ src/server/auth/repository.ts).
//
// service.ts พึ่งเฉพาะ interface นี้ (ไม่รู้จัก Prisma) → unit test ใช้ memory-repository.ts.
// Prisma-backed impl อยู่ prisma-repository.ts (route ประกอบเอง ผ่าน http.ts). **ห้ามให้ service import Prisma.**

/** สภาพ character ที่ service ต้องใช้ (subset ของ prisma model Character — schema.prisma). */
export interface CharacterRecord {
  id: string;
  accountId: string;
  /** NFC-normalized display name (unique global case-insensitive — §3.3) */
  name: string;
  /** อ้าง config — ตรวจด้วย src/shared/character-class.ts ก่อนถึง repo */
  classId: string;
  level: number;
  createdAt: Date;
  /**
   * mapId ล่าสุดที่ persist ไว้ (จาก CharacterState relation — schema.prisma) — null = ยังไม่เคย save
   * ตำแหน่ง (ตัวใหม่). ใช้บอก hub ว่าจะ boot map ไหนตอน "เข้าเกม" (P2-05 owner-report#6 fix,
   * Storage §5/§7) — ไม่ใช่ field สำหรับ gameplay logic (server ยัง gate ด้วย pickLoadPosition เหมือนเดิม).
   */
  lastMapId: string | null;
}

export interface CreateCharacterInput {
  accountId: string;
  /** ต้องผ่าน validateCharacterName แล้ว (NFC-normalized) ก่อนเรียก repo */
  name: string;
  classId: string;
}

/**
 * สัญญาที่ layer DB ต้องทำให้ครบ. `create` ต้องกัน name ชนแบบ atomic ฝั่ง impl
 * (Prisma: unique constraint บน `name`, collation case-insensitive ที่ DB — schema.prisma comment).
 */
export interface CharacterRepository {
  /** จำนวนตัวละครปัจจุบันของ account (เทียบกับ account.characterSlots ที่ caller หาเอง — §3.1). */
  countByAccount(accountId: string): Promise<number>;
  create(input: CreateCharacterInput): Promise<CharacterRecord>;
  listByAccount(accountId: string): Promise<CharacterRecord[]>;
  findById(id: string): Promise<CharacterRecord | null>;
}

/** impl โยน error นี้เมื่อชน unique constraint (name) — service แปลงเป็น reason "name_taken". */
export class NameTakenError extends Error {
  constructor() {
    super("character name already taken");
    this.name = "NameTakenError";
  }
}
