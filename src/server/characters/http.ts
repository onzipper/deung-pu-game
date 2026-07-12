// P2-06a — route-handler helpers (pattern เดียวกับ src/server/auth/http.ts).
// ⛔ SERVER-ONLY (Prisma). ใช้เฉพาะใน src/app/api/**/route.ts + src/app/hub Server Components.

import { createPrismaCharacterRepository } from "./prisma-repository";
import type { CharacterRepository } from "./repository";
import type { CreateCharacterFailReason } from "./service";

/** route handler สร้าง repo จาก factory นี้ (เปลี่ยน impl ที่เดียว). */
export function getCharacterRepository(): CharacterRepository {
  return createPrismaCharacterRepository();
}

/** map fail reason → HTTP status (validation=400, conflict=409). */
export function statusForCharacterReason(reason: CreateCharacterFailReason): number {
  switch (reason) {
    case "slots_full":
    case "name_taken":
      return 409;
    default:
      return 400; // invalid_name / invalid_class
  }
}
