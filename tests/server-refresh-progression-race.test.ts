import { beforeEach, describe, expect, test } from "vitest";
import {
  carryKey,
  recallProgress,
  stashProgress,
  _resetCarrierForTest,
} from "../server/characters/progress-carrier";

// fix/refresh-progression-race — refresh = UNCLEAN disconnect → session เก่าเข้า grace (await allowReconnection)
//   โดย **ไม่** persist/stash ระหว่าง await. หน้าเว็บที่ reload ยิง joinOrCreate ใหม่ (sessionId ใหม่, same
//   account/character) → onJoin resolve progression (DB → carrier → default). ถ้า resolve **ก่อน** takeover
//   ของตัวเก่าจะ stash → carrier ว่าง (no-DB) → reset lv1 (อาการที่ผู้เล่นเจอ).
//
// การแก้ (server-authoritative, ไม่เชื่อค่าจาก client): บังคับลำดับใน MapRoom.onJoin ให้ claimSession/
//   forceTakeover (ซึ่ง stash progression ล่าสุดของ session ที่ถูกเตะเข้า carrier แบบ sync) มา **ก่อน** การ
//   resolve progression (recallProgress). เทสต์นี้ยืนยันว่า "ลำดับ" นี้เป็นตัวชี้ผลลัพธ์ ผ่านฟังก์ชัน carrier
//   จริง (carryKey/stashProgress/recallProgress) — MapRoom เป็น Colyseus Room ที่ unit-test ตรงไม่ได้ จึงจำลอง
//   ordering ที่โค้ดบังคับ (mirror tests/server-progress-carrier.test.ts).

beforeEach(() => {
  _resetCarrierForTest();
});

/** จำลอง forceTakeover: server เขียน progression ล่าสุดของ session ที่ถูกเตะเข้า carrier (sync) ก่อน leave. */
function forceTakeoverStash(key: string, prog: { level: number; exp: number }): void {
  stashProgress(key, prog.level, prog.exp);
}

/** resolve เดียวกับ MapRoom.onJoin: DB (durable) → carrier (recall) → default lv1. */
function resolveProgress(
  key: string | null,
  dbLoad: { level: number; exp: number } | null,
): { level: number; exp: number } {
  return dbLoad ?? (key ? recallProgress(key) : null) ?? { level: 1, exp: 0 };
}

/** ลำดับ **หลังแก้**: claimSession/forceTakeover (stash ตัวเก่า) มาก่อน แล้วค่อย resolve. */
function onJoinFixed(
  accountId: string | null,
  characterId: string | null,
  dbLoad: { level: number; exp: number } | null,
  takeover: ((key: string) => void) | null,
): { level: number; exp: number } {
  const key = carryKey(accountId, characterId);
  if (key && takeover) takeover(key); // claimSession → forceTakeover → stash ก่อน
  return resolveProgress(key, dbLoad);
}

/** ลำดับ **เดิม (bug)**: resolve ก่อน แล้ว takeover จึง stash (สายไป — resolve เห็น carrier ว่าง). */
function onJoinBuggy(
  accountId: string | null,
  characterId: string | null,
  dbLoad: { level: number; exp: number } | null,
  takeover: ((key: string) => void) | null,
): { level: number; exp: number } {
  const key = carryKey(accountId, characterId);
  const resolved = resolveProgress(key, dbLoad);
  if (key && takeover) takeover(key);
  return resolved;
}

describe("refresh takeover ordering (level ไม่ reset เป็น 1 ตอน refresh)", () => {
  test("แก้แล้ว: no-DB refresh → resolve หลัง takeover-stash → ได้ level ที่ carry (ไม่ใช่ 1)", () => {
    const outgoing = { level: 8, exp: 4200 }; // ตัวเก่ากำลังหลุด (in grace) — ยังไม่ได้ stash เอง
    // carrier ว่างตอน join ใหม่เริ่ม; takeover ของตัวเก่าจะ stash progression ล่าสุด (จำลอง forceTakeover).
    const resolved = onJoinFixed("acc-7", "char-7", null, (key) =>
      forceTakeoverStash(key, outgoing),
    );
    expect(resolved).toEqual({ level: 8, exp: 4200 });
  });

  test("regression proof: ลำดับเดิม (resolve ก่อน takeover) → carrier ว่าง → reset lv1 (บั๊กที่แก้)", () => {
    const outgoing = { level: 8, exp: 4200 };
    const resolved = onJoinBuggy("acc-7", "char-7", null, (key) =>
      forceTakeoverStash(key, outgoing),
    );
    expect(resolved).toEqual({ level: 1, exp: 0 });
  });

  test("accountId-only refresh (ยังไม่ผูก characterId, ไม่มี DB) → level รอดผ่าน acct: key", () => {
    const resolved = onJoinFixed("acc-guest", null, null, (key) =>
      forceTakeoverStash(key, { level: 5, exp: 900 }),
    );
    expect(resolved).toEqual({ level: 5, exp: 900 });
  });

  test("DB durable ชนะ carrier เมื่อมีทั้งคู่ (ลำดับใหม่ไม่ทำ DB authority เพี้ยน)", () => {
    const resolved = onJoinFixed("acc-1", "char-1", { level: 12, exp: 12000 }, (key) =>
      forceTakeoverStash(key, { level: 3, exp: 30 }),
    );
    expect(resolved).toEqual({ level: 12, exp: 12000 });
  });

  test("anonymous จริง (ไม่มี identity) → ไม่ carry, fallback lv1 (out-of-scope คงเดิม, ไม่ดึงของคนอื่น)", () => {
    stashProgress("acct:someone-else", 10, 9999);
    const resolved = onJoinFixed(null, null, null, null);
    expect(resolved).toEqual({ level: 1, exp: 0 });
  });
});

describe("grace-path stash (refresh ที่ไม่ถูก resolve เป็น takeover)", () => {
  test("stash ก่อน await grace → join ที่มาอ่าน carrier ทีหลังเห็นค่าล่าสุด (ไม่ reset)", () => {
    const key = carryKey("acc-9", "char-9")!;
    // จำลอง onLeave(unclean): stash progression ล่าสุด **ก่อน** await allowReconnection.
    stashProgress(key, 6, 3300);
    // ต่อมามี resolve (เช่น grace หมด แล้ว join ใหม่ / path ที่ไม่ผ่าน takeover) → ได้ค่าที่ stash ไว้.
    expect(resolveProgress(key, null)).toEqual({ level: 6, exp: 3300 });
  });

  test("same-account: takeover stash ทับ grace stash → ค่าล่าสุดชนะ (idempotent, ไม่ double-count)", () => {
    const key = carryKey("acc-9", "char-9")!;
    stashProgress(key, 6, 3300); // grace stash ตอนหลุด
    forceTakeoverStash(key, { level: 6, exp: 3350 }); // takeover stash (exp ขยับเล็กน้อยก่อนถูกเตะ)
    expect(resolveProgress(key, null)).toEqual({ level: 6, exp: 3350 });
  });
});
