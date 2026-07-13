import { beforeEach, describe, expect, test } from "vitest";
import {
  carryKey,
  recallProgress,
  stashProgress,
  _resetCarrierForTest,
} from "../server/characters/progress-carrier";

// fix/level-persist-map-cross — cross-room progression carrier (P2-09 · Storage §5/§7).
// พิสูจน์: level/exp รอดข้าม map (leave→join คนละ MapRoom instance) ผ่าน process-cache แม้ไม่มี DB,
//   และ key มาจาก identity ที่ server verify แล้วเท่านั้น (ไม่มี = ไม่ carry, กัน client ปลอมของคนอื่น).

beforeEach(() => {
  _resetCarrierForTest();
});

describe("carryKey (stable identity เลือกจาก verified id)", () => {
  test("มี characterId → char: prefix (durable, ตรง DB row) ชนะ accountId", () => {
    expect(carryKey("acc-1", "char-1")).toBe("char:char-1");
  });
  test("มีแต่ accountId (ยังไม่ผูก characterId) → acct: prefix", () => {
    expect(carryKey("acc-1", null)).toBe("acct:acc-1");
  });
  test("ไม่มี identity ที่ verify (dev bypass ไม่มี token/DB) → null (ไม่ carry)", () => {
    expect(carryKey(null, null)).toBeNull();
  });
  test("prefix กันชนกันระหว่าง accountId กับ characterId ที่ string ตรงกัน", () => {
    expect(carryKey("x", null)).not.toBe(carryKey(null, "x"));
  });
});

describe("stash/recall (carrier roundtrip)", () => {
  test("ไม่เคย stash → recall = null (fallback lv1 ที่ caller)", () => {
    expect(recallProgress("char:nobody")).toBeNull();
  });

  test("stash แล้ว recall คืนค่าเดิม", () => {
    stashProgress("char:c1", 7, 1234);
    expect(recallProgress("char:c1")).toEqual({ level: 7, exp: 1234 });
  });

  test("recall คืน copy — แก้ผลลัพธ์ไม่กระทบค่าใน cache", () => {
    stashProgress("char:c1", 3, 100);
    const got = recallProgress("char:c1")!;
    got.level = 99;
    expect(recallProgress("char:c1")).toEqual({ level: 3, exp: 100 });
  });

  test("stash ทับ key เดิม → ค่าใหม่ล่าสุดชนะ", () => {
    stashProgress("acct:a1", 2, 50);
    stashProgress("acct:a1", 5, 900);
    expect(recallProgress("acct:a1")).toEqual({ level: 5, exp: 900 });
  });
});

describe("cross-room map-cross carry (no-DB regression: level ไม่ reset เป็น 1)", () => {
  // จำลอง leave room เดิม (stash) → join room ใหม่ (resolve: DB null → recall carrier → default).
  const resolveOnJoin = (
    accountId: string | null,
    characterId: string | null,
    dbLoad: { level: number; exp: number } | null,
  ) => {
    const key = carryKey(accountId, characterId);
    return dbLoad ?? (key ? recallProgress(key) : null) ?? { level: 1, exp: 0 };
  };

  test("accountId-only session (ไม่มี characterId, ไม่มี DB) → level รอดข้าม map", () => {
    // room เดิม: ผู้เล่น lv 6 กำลัง transition → stash
    stashProgress(carryKey("acc-42", null)!, 6, 5000);
    // room ปลายทาง join: DB โหลดไม่ได้ (null) → ต้องได้ 6 จาก carrier ไม่ใช่ 1
    expect(resolveOnJoin("acc-42", null, null)).toEqual({ level: 6, exp: 5000 });
  });

  test("DB load ชนะ carrier (durable authority) เมื่อมีทั้งคู่", () => {
    stashProgress(carryKey("acc-1", "char-1")!, 4, 400);
    expect(resolveOnJoin("acc-1", "char-1", { level: 9, exp: 9000 })).toEqual({
      level: 9,
      exp: 9000,
    });
  });

  test("anonymous จริง ๆ (ไม่มี identity) → fallback lv1 (ไม่ดึงของ session อื่น)", () => {
    stashProgress("acct:someone-else", 10, 9999);
    expect(resolveOnJoin(null, null, null)).toEqual({ level: 1, exp: 0 });
  });
});
