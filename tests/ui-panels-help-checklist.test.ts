import { describe, expect, test } from "vitest";
import {
  dismissChecklist,
  INITIAL_CHECKLIST_STATE,
  isChecklistComplete,
  isChecklistStepDone,
  isChecklistVisible,
  isTileMoved,
  markChecklistStepDoneManually,
  TUTORIAL_CHECKLIST_STEPS,
  updateChecklistFromSignals,
  type ChecklistLiveSignals,
} from "@/ui/panels/help/tutorial-checklist";

const signals = (over: Partial<ChecklistLiveSignals> = {}): ChecklistLiveSignals => ({
  playerTile: null,
  hasKilledMob: false,
  equipmentCount: 0,
  ...over,
});

describe("isTileMoved", () => {
  test("ตำแหน่งเดิมเป๊ะ → ไม่นับว่าเดินแล้ว", () => {
    expect(isTileMoved({ tx: 5, ty: 5 }, { tx: 5, ty: 5 })).toBe(false);
  });

  test("ขยับเล็กน้อยในช่วง epsilon (jitter) → ไม่นับ", () => {
    expect(isTileMoved({ tx: 5.01, ty: 5 }, { tx: 5, ty: 5 })).toBe(false);
  });

  test("ขยับเกิน epsilon → นับว่าเดินแล้ว", () => {
    expect(isTileMoved({ tx: 5.5, ty: 5 }, { tx: 5, ty: 5 })).toBe(true);
  });
});

describe("updateChecklistFromSignals — auto item (เดิน/ฆ่ามอน/สวมใส่)", () => {
  test("ยังไม่เคยเห็น playerTile → baseline ยังไม่ตั้ง, walkDone ยังเป็น false", () => {
    const next = updateChecklistFromSignals(INITIAL_CHECKLIST_STATE, signals());
    expect(next.baselineTile).toBeNull();
    expect(next.walkDone).toBe(false);
  });

  test("เห็น playerTile ครั้งแรก → ตั้ง baseline ทันที (ยังไม่นับว่าเดินแล้ว)", () => {
    const next = updateChecklistFromSignals(INITIAL_CHECKLIST_STATE, signals({ playerTile: { tx: 3, ty: 4 } }));
    expect(next.baselineTile).toEqual({ tx: 3, ty: 4 });
    expect(next.walkDone).toBe(false);
  });

  test("เดินไปไกลจาก baseline → walkDone = true", () => {
    const withBaseline = updateChecklistFromSignals(
      INITIAL_CHECKLIST_STATE,
      signals({ playerTile: { tx: 3, ty: 4 } }),
    );
    const moved = updateChecklistFromSignals(withBaseline, signals({ playerTile: { tx: 10, ty: 4 } }));
    expect(moved.walkDone).toBe(true);
  });

  test("walkDone เป็น sticky — กลับมาที่ baseline เดิมก็ยังเป็น true", () => {
    const withBaseline = updateChecklistFromSignals(
      INITIAL_CHECKLIST_STATE,
      signals({ playerTile: { tx: 3, ty: 4 } }),
    );
    const moved = updateChecklistFromSignals(withBaseline, signals({ playerTile: { tx: 10, ty: 4 } }));
    const backToStart = updateChecklistFromSignals(moved, signals({ playerTile: { tx: 3, ty: 4 } }));
    expect(backToStart.walkDone).toBe(true);
  });

  test("hasKilledMob=true → killDone = true และ sticky", () => {
    const killed = updateChecklistFromSignals(INITIAL_CHECKLIST_STATE, signals({ hasKilledMob: true }));
    expect(killed.killDone).toBe(true);
    const next = updateChecklistFromSignals(killed, signals({ hasKilledMob: false }));
    expect(next.killDone).toBe(true); // sticky, ไม่กลับ false
  });

  test("equipmentCount > 0 → equipDone = true และ sticky", () => {
    const equipped = updateChecklistFromSignals(INITIAL_CHECKLIST_STATE, signals({ equipmentCount: 1 }));
    expect(equipped.equipDone).toBe(true);
    const next = updateChecklistFromSignals(equipped, signals({ equipmentCount: 0 }));
    expect(next.equipDone).toBe(true); // sticky (ถอดออกทีหลังไม่ลบสถานะ tutorial)
  });
});

describe('"skill" — manual dismiss เท่านั้น (ไม่มีสัญญาณจาก HudState)', () => {
  test("markChecklistStepDoneManually('skill') → skillDone = true", () => {
    const next = markChecklistStepDoneManually(INITIAL_CHECKLIST_STATE, "skill");
    expect(next.skillDone).toBe(true);
  });

  test("เรียกกับ step อื่น (auto) → ไม่มีผล (defensive)", () => {
    const next = markChecklistStepDoneManually(INITIAL_CHECKLIST_STATE, "walk");
    expect(next.walkDone).toBe(false);
  });

  test("อัปเดตจากสัญญาณเฉย ๆ ไม่ทำให้ skillDone เป็น true เอง", () => {
    const next = updateChecklistFromSignals(INITIAL_CHECKLIST_STATE, signals({ hasKilledMob: true, equipmentCount: 1, playerTile: { tx: 1, ty: 1 } }));
    expect(next.skillDone).toBe(false);
  });
});

describe("isChecklistComplete / isChecklistStepDone", () => {
  test("ยังไม่ครบ → false", () => {
    expect(isChecklistComplete(INITIAL_CHECKLIST_STATE)).toBe(false);
  });

  test("ครบทั้ง 4 ข้อ (walk/kill/equip/skill) → true", () => {
    const complete = { ...INITIAL_CHECKLIST_STATE, walkDone: true, killDone: true, equipDone: true, skillDone: true };
    expect(isChecklistComplete(complete)).toBe(true);
  });

  test("isChecklistStepDone อ่านค่าตรงกับ field ที่เกี่ยวข้อง", () => {
    const state = { ...INITIAL_CHECKLIST_STATE, walkDone: true };
    expect(isChecklistStepDone(state, "walk")).toBe(true);
    expect(isChecklistStepDone(state, "kill")).toBe(false);
  });
});

describe("dismissChecklist / isChecklistVisible — ไม่มี forced popup", () => {
  test("ปิดได้แม้ยังไม่ครบทุกข้อ", () => {
    const dismissed = dismissChecklist(INITIAL_CHECKLIST_STATE);
    expect(dismissed.dismissed).toBe(true);
    expect(isChecklistVisible(dismissed)).toBe(false);
  });

  test("ยังไม่ dismiss → visible เสมอ", () => {
    expect(isChecklistVisible(INITIAL_CHECKLIST_STATE)).toBe(true);
  });
});

describe("TUTORIAL_CHECKLIST_STEPS", () => {
  test("มีครบ 4 step: walk/kill/equip/skill", () => {
    expect(TUTORIAL_CHECKLIST_STEPS.map((s) => s.id)).toEqual(["walk", "kill", "equip", "skill"]);
  });

  test("เฉพาะ skill เท่านั้นที่ auto=false", () => {
    for (const step of TUTORIAL_CHECKLIST_STEPS) {
      expect(step.auto).toBe(step.id !== "skill");
    }
  });
});
