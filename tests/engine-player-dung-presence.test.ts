// dung-presence.ts (D-068 §0.0 contextual guide state machine) — pure resolver, no Pixi/I/O/world command.
import { describe, expect, test } from "vitest";
import { resolveDungPresence, type DungPresenceInput } from "@/engine/player/dung-presence";

const HUB = "city-hub";
const FIELD = "map1";
const APPEAR_MS = 8000;

const base = (overrides: Partial<DungPresenceInput> = {}): DungPresenceInput => ({
  currentMapId: HUB,
  cityHubMapId: HUB,
  summonRequestedAt: null,
  reportReadyAt: null,
  dismissedAt: null,
  now: 100_000,
  ...overrides,
});

describe("resolveDungPresence — no trigger (ambient position)", () => {
  test("อยู่ city hub, ไม่มี trigger ใด ๆ → HUB_IDLE (ตำแหน่งประจำ)", () => {
    expect(resolveDungPresence(base({ currentMapId: HUB }), APPEAR_MS)).toBe("HUB_IDLE");
  });

  test("อยู่นอก hub (field), ไม่มี trigger ใด ๆ → HIDDEN", () => {
    expect(
      resolveDungPresence(base({ currentMapId: FIELD }), APPEAR_MS),
    ).toBe("HIDDEN");
  });
});

describe("resolveDungPresence — summon trigger", () => {
  test("summon เพิ่งยิง (นอก hub) → โผล่ SUMMONED_CONTEXT ทันที", () => {
    const input = base({ currentMapId: FIELD, summonRequestedAt: 100_000, now: 100_000 });
    expect(resolveDungPresence(input, APPEAR_MS)).toBe("SUMMONED_CONTEXT");
  });

  test("summon ยังไม่หมดอายุ (now - triggeredAt < appearDurationMs) → ยัง SUMMONED_CONTEXT", () => {
    const input = base({ currentMapId: FIELD, summonRequestedAt: 100_000, now: 100_000 + APPEAR_MS - 1 });
    expect(resolveDungPresence(input, APPEAR_MS)).toBe("SUMMONED_CONTEXT");
  });

  test("summon หมดอายุแล้ว (now - triggeredAt >= appearDurationMs) นอก hub → กลับ HIDDEN", () => {
    const input = base({ currentMapId: FIELD, summonRequestedAt: 100_000, now: 100_000 + APPEAR_MS });
    expect(resolveDungPresence(input, APPEAR_MS)).toBe("HIDDEN");
  });

  test("summon หมดอายุแล้ว ในเมือง → กลับ HUB_IDLE (ไม่ใช่ HIDDEN)", () => {
    const input = base({ currentMapId: HUB, summonRequestedAt: 100_000, now: 100_000 + APPEAR_MS });
    expect(resolveDungPresence(input, APPEAR_MS)).toBe("HUB_IDLE");
  });
});

describe("resolveDungPresence — report trigger (ก่อน/หลังหมดอายุ)", () => {
  test("report เพิ่งพร้อม (ก่อนหมดอายุ) → REPORT_NARRATION", () => {
    const input = base({ currentMapId: FIELD, reportReadyAt: 50_000, now: 50_000 + 500 });
    expect(resolveDungPresence(input, APPEAR_MS)).toBe("REPORT_NARRATION");
  });

  test("report หมดอายุแล้ว (หลัง appearDurationMs) → กลับ fallback (HIDDEN นอก hub)", () => {
    const input = base({ currentMapId: FIELD, reportReadyAt: 50_000, now: 50_000 + APPEAR_MS + 1 });
    expect(resolveDungPresence(input, APPEAR_MS)).toBe("HIDDEN");
  });

  test("summon กับ report active พร้อมกัน → เลือกอันใหม่กว่า (report ทีหลัง ชนะ)", () => {
    const input = base({
      currentMapId: FIELD,
      summonRequestedAt: 10_000,
      reportReadyAt: 12_000,
      now: 12_100,
    });
    expect(resolveDungPresence(input, APPEAR_MS)).toBe("REPORT_NARRATION");
  });

  test("summon กับ report active พร้อมกัน — summon ใหม่กว่า → summon ชนะ", () => {
    const input = base({
      currentMapId: FIELD,
      summonRequestedAt: 12_000,
      reportReadyAt: 10_000,
      now: 12_100,
    });
    expect(resolveDungPresence(input, APPEAR_MS)).toBe("SUMMONED_CONTEXT");
  });
});

describe("resolveDungPresence — dismiss ชนะทุก state", () => {
  test("dismiss ใหม่กว่า summon (แม้ยังไม่หมดอายุ) นอก hub → HIDDEN ทันที", () => {
    const input = base({
      currentMapId: FIELD,
      summonRequestedAt: 100_000,
      dismissedAt: 100_500,
      now: 100_600,
    });
    expect(resolveDungPresence(input, APPEAR_MS)).toBe("HIDDEN");
  });

  test("dismiss ใหม่กว่า report (แม้ยังไม่หมดอายุ) ในเมือง → HUB_IDLE (dismiss ปิดแค่ overlay ไม่ปิดตำแหน่งประจำ)", () => {
    const input = base({
      currentMapId: HUB,
      reportReadyAt: 100_000,
      dismissedAt: 100_500,
      now: 100_600,
    });
    expect(resolveDungPresence(input, APPEAR_MS)).toBe("HUB_IDLE");
  });

  test("dismiss เก่ากว่า trigger ใหม่ (trigger ยิงซ้ำหลัง dismiss) → trigger ใหม่ชนะ โผล่อีกครั้ง", () => {
    const input = base({
      currentMapId: FIELD,
      dismissedAt: 100_000,
      summonRequestedAt: 100_500, // summon ใหม่ ยิงหลัง dismiss เดิม
      now: 100_600,
    });
    expect(resolveDungPresence(input, APPEAR_MS)).toBe("SUMMONED_CONTEXT");
  });

  test("dismiss พร้อมกับทั้ง summon และ report ที่เก่ากว่า → HIDDEN ทั้งคู่โดนปิด", () => {
    const input = base({
      currentMapId: FIELD,
      summonRequestedAt: 90_000,
      reportReadyAt: 95_000,
      dismissedAt: 96_000,
      now: 96_100,
    });
    expect(resolveDungPresence(input, APPEAR_MS)).toBe("HIDDEN");
  });
});

describe("resolveDungPresence — กลับเข้า hub reset", () => {
  test("dismiss ค้างจากตอนอยู่ field, เดินกลับเข้า hub (currentMapId เปลี่ยน) → HUB_IDLE (ไม่ค้าง HIDDEN)", () => {
    const stillInField = base({ currentMapId: FIELD, dismissedAt: 50_000, now: 60_000 });
    expect(resolveDungPresence(stillInField, APPEAR_MS)).toBe("HIDDEN");

    const backInHub = base({ currentMapId: HUB, dismissedAt: 50_000, now: 60_100 });
    expect(resolveDungPresence(backInHub, APPEAR_MS)).toBe("HUB_IDLE");
  });

  test("summon ที่หมดอายุค้างจากตอนอยู่ field, เดินกลับเข้า hub → HUB_IDLE เหมือนไม่เคยมี trigger", () => {
    const backInHub = base({
      currentMapId: HUB,
      summonRequestedAt: 10_000,
      now: 10_000 + APPEAR_MS + 5_000,
    });
    expect(resolveDungPresence(backInHub, APPEAR_MS)).toBe("HUB_IDLE");
  });
});

describe("resolveDungPresence — purity (ไม่มี world command/combat/side effect)", () => {
  test("input เดิม เรียกซ้ำหลายครั้ง → ผลลัพธ์เหมือนเดิมทุกครั้ง (deterministic, ไม่ mutate input)", () => {
    const input = base({ currentMapId: FIELD, summonRequestedAt: 100_000, now: 100_500 });
    const snapshot = { ...input };
    const first = resolveDungPresence(input, APPEAR_MS);
    const second = resolveDungPresence(input, APPEAR_MS);
    const third = resolveDungPresence(input, APPEAR_MS);
    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(input).toEqual(snapshot); // ไม่ mutate input object
  });
});
