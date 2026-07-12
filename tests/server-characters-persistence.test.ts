import { describe, expect, test } from "vitest";
import {
  decideOwnership,
  pickLoadPosition,
  pickSavePosition,
  shouldSaveNow,
  type SavedCharacterState,
} from "../server/characters/persistence-decision";

// P2-05 — pure persistence decisions (Storage §5/§7/§22/§24). ไม่ยิง DB — inject isWalkable/ค่าเวลาเอง.

describe("decideOwnership (Storage §22)", () => {
  test("owner = account → allow", () => {
    expect(decideOwnership("acc-1", "acc-1")).toBe("allow");
  });
  test("owner ต่างบัญชี → reject (ปลอม characterId คนอื่น)", () => {
    expect(decideOwnership("acc-1", "acc-2")).toBe("reject");
  });
  test("ไม่พบตัวละคร (owner=null) → reject", () => {
    expect(decideOwnership("acc-1", null)).toBe("reject");
  });
});

describe("pickLoadPosition (Storage §5 — resume ตำแหน่ง)", () => {
  const saved: SavedCharacterState = { mapId: "map1", tx: 5.5, ty: 6.5 };
  const fallback = { tx: 1, ty: 1 };

  test("saved อยู่ map เดียวกัน + finite → ใช้ saved", () => {
    expect(pickLoadPosition(saved, "map1", fallback)).toEqual({ tx: 5.5, ty: 6.5 });
  });
  test("saved คนละ map → fallback (client boot map ปัจจุบัน)", () => {
    expect(pickLoadPosition(saved, "city-hub", fallback)).toEqual(fallback);
  });
  test("ไม่มี saved (ตัวใหม่) → fallback", () => {
    expect(pickLoadPosition(null, "map1", fallback)).toEqual(fallback);
  });
  test("saved พิกัด non-finite → fallback", () => {
    const bad: SavedCharacterState = { mapId: "map1", tx: Number.NaN, ty: 3 };
    expect(pickLoadPosition(bad, "map1", fallback)).toEqual(fallback);
  });
});

describe("pickSavePosition (Storage §24 — safe-valid ล่าสุด)", () => {
  const safeCamp = { tx: 2, ty: 2 };
  const walkableEverywhere = () => true;
  const walkableNowhere = () => false;

  test("ตำแหน่งปัจจุบัน walkable → ใช้ตำแหน่งปัจจุบัน", () => {
    expect(pickSavePosition({ tx: 7, ty: 8 }, safeCamp, walkableEverywhere)).toEqual({ tx: 7, ty: 8 });
  });
  test("ตำแหน่งปัจจุบันเดินไม่ได้ → safe camp", () => {
    expect(pickSavePosition({ tx: 7, ty: 8 }, safeCamp, walkableNowhere)).toEqual(safeCamp);
  });
  test("ตำแหน่งปัจจุบัน non-finite → safe camp", () => {
    expect(pickSavePosition({ tx: Number.POSITIVE_INFINITY, ty: 8 }, safeCamp, walkableEverywhere)).toEqual(
      safeCamp,
    );
  });
});

describe("shouldSaveNow (Storage §24 — throttle hot write)", () => {
  test("ผ่านเกิน interval → save ได้", () => {
    expect(shouldSaveNow(1000, 1000 + 30_000, 30_000)).toBe(true);
  });
  test("ยังไม่ถึง interval → ยังไม่ save", () => {
    expect(shouldSaveNow(1000, 1000 + 29_999, 30_000)).toBe(false);
  });
});
