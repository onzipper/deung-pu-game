import { describe, expect, test } from "vitest";
import {
  achievementProgressPercent,
  achievementTierColorClass,
  achievementTierLabel,
  categoryLabel,
  DUNGDUNG_JOURNAL_BARKS,
  filterAchievementRows,
  formatPlaytimeMs,
  groupAchievementRowsByCategory,
  isAchievementMasked,
  JOURNAL_ACHIEVEMENT_FILTER_LABELS,
  JOURNAL_ACHIEVEMENT_FILTER_ORDER,
  JOURNAL_PANEL_ID,
  JOURNAL_STAT_ITEMS,
  JOURNAL_TAB_LABELS,
  JOURNAL_TAB_ORDER,
  pickDailyBark,
  resolveJournalStatValue,
  topClaimedAchievements,
} from "@/ui/panels/journal/journal-view";
import type { AchievementRow } from "@/shared/net-protocol";

const row = (over: Partial<AchievementRow> = {}): AchievementRow => ({
  id: "ach_x",
  nameTh: "ทดสอบ",
  tier: "COMMON",
  category: "progression",
  state: "locked",
  currentValue: 0,
  target: 1,
  ...over,
});

describe("JOURNAL_PANEL_ID / tab order", () => {
  test("panel id คงที่", () => {
    expect(JOURNAL_PANEL_ID).toBe("journal");
  });

  test("7 แท็บ ตรงตาม spec §2 ทั้งจำนวนและป้าย", () => {
    expect(JOURNAL_TAB_ORDER).toHaveLength(7);
    for (const tab of JOURNAL_TAB_ORDER) {
      expect(JOURNAL_TAB_LABELS[tab]).toBeTruthy();
    }
    expect(JOURNAL_TAB_LABELS.today).toBe("วันนี้ของฉัน");
    expect(JOURNAL_TAB_LABELS.achievement).toBe("Achievement");
    expect(JOURNAL_TAB_LABELS.stats).toBe("สถิติส่วนตัว");
  });
});

describe("isAchievementMasked", () => {
  test('nameTh = "???" → masked', () => {
    expect(isAchievementMasked(row({ nameTh: "???" }))).toBe(true);
  });

  test("ชื่อจริง → ไม่ masked", () => {
    expect(isAchievementMasked(row({ nameTh: "ก้าวแรก" }))).toBe(false);
  });
});

describe("filterAchievementRows", () => {
  const rows = [
    row({ id: "a", state: "locked" }),
    row({ id: "b", state: "in_progress" }),
    row({ id: "c", state: "completed" }),
    row({ id: "d", state: "claimed" }),
    row({ id: "e", nameTh: "???", state: "locked" }),
  ];

  test("all → คืนทุกแถว", () => {
    expect(filterAchievementRows(rows, "all")).toHaveLength(5);
  });

  test("in_progress → เฉพาะ state in_progress", () => {
    const result = filterAchievementRows(rows, "in_progress");
    expect(result.map((r) => r.id)).toEqual(["b"]);
  });

  test("completed → รวมทั้ง completed และ claimed", () => {
    const result = filterAchievementRows(rows, "completed");
    expect(result.map((r) => r.id).sort()).toEqual(["c", "d"]);
  });

  test("hidden → เฉพาะแถว masked (nameTh === ???)", () => {
    const result = filterAchievementRows(rows, "hidden");
    expect(result.map((r) => r.id)).toEqual(["e"]);
  });

  test("ทุกตัวกรองมีป้ายไทยครบ", () => {
    for (const filter of JOURNAL_ACHIEVEMENT_FILTER_ORDER) {
      expect(JOURNAL_ACHIEVEMENT_FILTER_LABELS[filter]).toBeTruthy();
    }
  });
});

describe("groupAchievementRowsByCategory", () => {
  test("จัดกลุ่มตาม category คงลำดับที่พบครั้งแรก", () => {
    const rows = [
      row({ id: "a", category: "combat" }),
      row({ id: "b", category: "progression" }),
      row({ id: "c", category: "combat" }),
    ];
    const groups = groupAchievementRowsByCategory(rows);
    expect(groups.map((g) => g.category)).toEqual(["combat", "progression"]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["a", "c"]);
    expect(groups[1].rows.map((r) => r.id)).toEqual(["b"]);
  });

  test("array ว่าง → กลุ่มว่าง", () => {
    expect(groupAchievementRowsByCategory([])).toEqual([]);
  });
});

describe("categoryLabel", () => {
  test("category รู้จัก → ป้ายไทย", () => {
    expect(categoryLabel("combat")).toBe("การต่อสู้");
  });

  test("category ไม่รู้จัก → fallback เป็น id ดิบ", () => {
    expect(categoryLabel("unknown_future_category")).toBe("unknown_future_category");
  });
});

describe("achievementTierLabel / achievementTierColorClass", () => {
  test("ทุก tier ที่ประกาศใน server/config/achievements.ts มีป้าย+สี", () => {
    const tiers = ["COMMON", "UNCOMMON", "HARD", "EXTREME", "MYSTERY", "MEME"];
    for (const tier of tiers) {
      expect(achievementTierLabel(tier)).toBeTruthy();
      expect(achievementTierColorClass(tier)).toContain("text-(--dp-");
    }
  });

  test("tier แปลก ๆ → fallback ไม่ throw", () => {
    expect(achievementTierLabel("UNKNOWN")).toBe("UNKNOWN");
    expect(achievementTierColorClass("UNKNOWN")).toBe(achievementTierColorClass("COMMON"));
  });
});

describe("achievementProgressPercent", () => {
  test("ครึ่งทาง → 50", () => {
    expect(achievementProgressPercent(row({ currentValue: 5, target: 10 }))).toBe(50);
  });

  test("เกิน target → clamp 100", () => {
    expect(achievementProgressPercent(row({ currentValue: 20, target: 10 }))).toBe(100);
  });

  test("target <= 0 → 0 (กัน div by zero)", () => {
    expect(achievementProgressPercent(row({ currentValue: 5, target: 0 }))).toBe(0);
  });
});

describe("topClaimedAchievements", () => {
  test("เอาเฉพาะ claimed ไม่เกิน limit", () => {
    const rows = [
      row({ id: "a", state: "claimed" }),
      row({ id: "b", state: "locked" }),
      row({ id: "c", state: "claimed" }),
      row({ id: "d", state: "claimed" }),
      row({ id: "e", state: "claimed" }),
    ];
    expect(topClaimedAchievements(rows, 3).map((r) => r.id)).toEqual(["a", "c", "d"]);
  });

  test("ไม่มี claimed เลย → array ว่าง", () => {
    expect(topClaimedAchievements([row({ state: "locked" })])).toEqual([]);
  });
});

describe("pickDailyBark", () => {
  test("มี 3 บรรทัดตามโทนสเปคดึ๋งๆ", () => {
    expect(DUNGDUNG_JOURNAL_BARKS).toHaveLength(3);
  });

  test("day-of-week modulo → deterministic ต่อวันเดียวกัน", () => {
    const sunday = new Date("2026-07-12T10:00:00"); // เสาร์/อาทิตย์ ปรับตาม getDay() จริงของ runtime
    const line = pickDailyBark(sunday);
    expect(DUNGDUNG_JOURNAL_BARKS).toContain(line);
    expect(pickDailyBark(sunday)).toBe(line);
  });
});

describe("formatPlaytimeMs", () => {
  test("ต่ำกว่า 1 นาที → ข้อความพิเศษ", () => {
    expect(formatPlaytimeMs(30_000)).toBe("ไม่ถึง 1 นาที");
  });

  test("ต่ำกว่า 1 ชั่วโมง → X นาที", () => {
    expect(formatPlaytimeMs(5 * 60_000)).toBe("5 นาที");
  });

  test("เกิน 1 ชั่วโมง → X ชม. Y นาที", () => {
    expect(formatPlaytimeMs(65 * 60_000)).toBe("1 ชม. 5 นาที");
  });
});

describe("resolveJournalStatValue", () => {
  test("playtime มีค่า → format แล้วแสดง", () => {
    expect(resolveJournalStatValue("playtime", 5 * 60_000)).toEqual({ value: "5 นาที" });
  });

  test("playtime ยังไม่มีค่า (null) → —", () => {
    expect(resolveJournalStatValue("playtime", null)).toEqual({ value: "—" });
  });

  test("metric อื่นที่ยังไม่มีระบบ tracking → — + subtitle", () => {
    for (const item of JOURNAL_STAT_ITEMS) {
      if (item.id === "playtime") continue;
      const result = resolveJournalStatValue(item.id, null);
      expect(result.value).toBe("—");
      expect(result.subtitle).toBe("เริ่มนับเร็วๆ นี้");
    }
  });
});
