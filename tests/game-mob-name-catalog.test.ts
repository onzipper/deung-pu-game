import { describe, expect, test } from "vitest";
import { getMobNameEntry } from "@/game/mob/name-catalog";

describe("getMobNameEntry — mobType → ชื่อไทย + rank (nameplates)", () => {
  test("normal mobs → ชื่อ spec-sourced, rank normal", () => {
    expect(getMobNameEntry("slime")).toEqual({ nameTh: "สไลม์เมือกดึ๋ง", rank: "normal" });
    expect(getMobNameEntry("bird")).toEqual({ nameTh: "นกจิกปุ๊", rank: "normal" });
    expect(getMobNameEntry("boar")).toEqual({ nameTh: "หมูป่าพอง", rank: "normal" });
  });

  test("elite → ชื่อเต็มของตัวเอง (ไม่ใช่ prefix), rank elite", () => {
    expect(getMobNameEntry("boar_elite")).toEqual({ nameTh: "หมูป่าพองคลั่ง", rank: "elite" });
  });

  test("boss (D-064 Field Boss) → rank boss", () => {
    expect(getMobNameEntry("boss_boiling_boar")).toEqual({
      nameTh: "หมูป่าหม้อเดือด",
      rank: "boss",
    });
  });

  test("mobType ไม่มีใน catalog (test-field placeholder / art skin) → undefined, ไม่ crash", () => {
    expect(getMobNameEntry("mushroom")).toBeUndefined();
    expect(getMobNameEntry("slime_leaf")).toBeUndefined();
    expect(getMobNameEntry("does_not_exist")).toBeUndefined();
  });
});
