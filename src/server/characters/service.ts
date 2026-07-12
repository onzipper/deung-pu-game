// P2-06a — character service (orchestration). พึ่งเฉพาะ CharacterRepository → เทสต์ด้วย memory repo ได้ ไม่ต่อ DB.
// Source: Account/Character/Storage Flow Spec v1 §3 (slots/naming) §8 (creation) §9 (management).
//
// ทุก method คืน discriminated result (ไม่ throw สำหรับ validation ที่คาดได้) → route handler map เป็น HTTP status.

import { validateCharacterName, type CharacterNameErrorCode } from "@/shared/character-name";
import { isValidClassId } from "@/shared/character-class";
import { NameTakenError, type CharacterRepository, type CharacterRecord } from "./repository";

/** view ที่ปลอดภัยส่งกลับ client. */
export interface CharacterView {
  id: string;
  accountId: string;
  name: string;
  classId: string;
  level: number;
  /** mapId ล่าสุดที่ persist ไว้ (null = ตัวใหม่ ยังไม่เคย save) — hub ใช้บอก /game boot map ไหน (owner-report#6) */
  lastMapId: string | null;
}

export function toCharacterView(c: CharacterRecord): CharacterView {
  return {
    id: c.id,
    accountId: c.accountId,
    name: c.name,
    classId: c.classId,
    level: c.level,
    lastMapId: c.lastMapId,
  };
}

export interface CreateCharacterInput {
  accountId: string;
  name: unknown;
  classId: unknown;
  /** account.characterSlots — caller หาเอง (ผ่าน auth account repo/Prisma) ก่อนเรียก service (§3.1) */
  characterSlots: number;
  /**
   * รับไว้ก่อนตาม §8.4 (idempotency key ตอน commit create) — **ยังไม่ persist/ตรวจ replay จริง**
   * (TODO P2-05: idempotency store). พารามิเตอร์นี้เป็น placeholder กัน API contract เปลี่ยนตอนต่อ P2-05.
   */
  idempotencyKey?: string;
}

export type CreateCharacterFailReason =
  | "invalid_name"
  | "invalid_class"
  | "slots_full"
  | "name_taken";

export type CreateCharacterResult =
  | { ok: true; character: CharacterView }
  | { ok: false; reason: CreateCharacterFailReason; nameError?: CharacterNameErrorCode };

export async function createCharacter(
  repo: CharacterRepository,
  input: CreateCharacterInput,
): Promise<CreateCharacterResult> {
  const nameResult = validateCharacterName(input.name);
  if (!nameResult.ok) return { ok: false, reason: "invalid_name", nameError: nameResult.reason };

  if (!isValidClassId(input.classId)) return { ok: false, reason: "invalid_class" };

  const count = await repo.countByAccount(input.accountId);
  if (count >= input.characterSlots) return { ok: false, reason: "slots_full" };

  try {
    const record = await repo.create({
      accountId: input.accountId,
      name: nameResult.value,
      classId: input.classId,
    });
    return { ok: true, character: toCharacterView(record) };
  } catch (err) {
    if (err instanceof NameTakenError) return { ok: false, reason: "name_taken" };
    throw err;
  }
}

export async function listCharacters(
  repo: CharacterRepository,
  accountId: string,
): Promise<CharacterView[]> {
  const records = await repo.listByAccount(accountId);
  return records.map(toCharacterView);
}

/** กัน cross-account: คืน null ถ้าตัวละครไม่ใช่ของ account นี้ (§9.5 "no cross-session mutation" หลักการเดียวกัน). */
export async function getCharacter(
  repo: CharacterRepository,
  accountId: string,
  characterId: string,
): Promise<CharacterView | null> {
  const record = await repo.findById(characterId);
  if (!record || record.accountId !== accountId) return null;
  return toCharacterView(record);
}
