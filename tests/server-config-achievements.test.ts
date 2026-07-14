import { describe, expect, test } from "vitest";
import { ACHIEVEMENTS } from "../server/config/achievements";

// C2a — lock the 65-row achievement shipping set ตรง
// docs/design/deungpu_ACHIEVEMENT_SHIPPING_SET_OB_v1.md (60 core + 5 expanded, LOCKED for implement C2).
// กันพิมพ์ผิด id/tier/rule/reward ระหว่าง transcribe (never-downgrade adjacent: reward = Design Knob §48).

// 18-type event taxonomy (source doc "Event taxonomy" section) — every CORE row's rule.event must be one of
// these, except the one documented derived-event exception (ach_rain_walk_30 → "weather.rain.tick").
const EVENT_TAXONOMY_18 = [
  "character.created",
  "map.enter",
  "mob.killed",
  "level.up",
  "enhance.success",
  "enhance.fail",
  "shop.buy",
  "shop.sell",
  "storage.deposit",
  "delivery.send",
  "death",
  "gold.earned",
  "gold.balance",
  "item.dropped",
  "npc.talk",
  "weather.changed",
  "phase.changed",
  "ui.logo.click",
];

// documented derived-event exception (source doc implementer note: rain-time accumulator off world clock).
const DERIVED_EVENT_EXCEPTIONS: Record<string, string> = {
  ach_rain_walk_30: "weather.rain.tick",
};

describe("achievement set shape (C2a — 65 rows)", () => {
  test("exactly 65 definitions: 60 core + 5 expanded", () => {
    expect(ACHIEVEMENTS).toHaveLength(65);
    expect(ACHIEVEMENTS.filter((a) => a.phase === "core")).toHaveLength(60);
    expect(ACHIEVEMENTS.filter((a) => a.phase === "expanded")).toHaveLength(5);
  });

  test("ids unique ทุกแถว", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("core rows emit only taxonomy events (18-type list)", () => {
  test("ทุก core row's rule.event ∈ 18-taxonomy, ยกเว้น ach_rain_walk_30 (derived rain-tick, documented)", () => {
    for (const a of ACHIEVEMENTS.filter((x) => x.phase === "core")) {
      const expectedDerived = DERIVED_EVENT_EXCEPTIONS[a.id];
      if (expectedDerived) {
        expect(a.rule.event, a.id).toBe(expectedDerived);
        expect(EVENT_TAXONOMY_18, `${a.id} ควรเป็น derived event นอก taxonomy`).not.toContain(a.rule.event);
      } else {
        expect(EVENT_TAXONOMY_18, `${a.id}: rule.event="${a.rule.event}" ต้องอยู่ใน 18-taxonomy`).toContain(a.rule.event);
      }
    }
  });

  test("expanded rows ไม่ถูกบังคับ taxonomy 18 ชนิด (เนื้อหายังไม่ ship — companion.*/bot.deployed ตามหมายเหตุ source doc)", () => {
    const expanded = ACHIEVEMENTS.filter((a) => a.phase === "expanded");
    expect(expanded).toHaveLength(5);
    // sanity: expanded events exist and are non-empty strings (not asserting taxonomy membership).
    for (const a of expanded) {
      expect(typeof a.rule.event, a.id).toBe("string");
      expect(a.rule.event.length, a.id).toBeGreaterThan(0);
    }
  });
});

describe("reward discipline (source doc §10 / Reward discipline section)", () => {
  test("ทุก gold reward อยู่ในช่วง 30–200", () => {
    for (const a of ACHIEVEMENTS) {
      if (a.reward.gold !== undefined) {
        expect(a.reward.gold, a.id).toBeGreaterThanOrEqual(30);
        expect(a.reward.gold, a.id).toBeLessThanOrEqual(200);
      }
    }
  });

  test("MEME tier หรือ hidden (hidden_condition/hidden_full) ทุกแถว = title/none เท่านั้น ห้ามมี gold", () => {
    for (const a of ACHIEVEMENTS) {
      const isMemeOrHidden = a.tier === "MEME" || a.visibility !== "visible";
      if (isMemeOrHidden) {
        expect(a.reward.gold, `${a.id} (tier=${a.tier}, vis=${a.visibility}) ห้ามมี gold`).toBeUndefined();
      }
    }
  });

  test("ทุกแถวมี reward เดียว: gold หรือ titleId หรือไม่มีเลย (ไม่แจกทั้งคู่พร้อมกัน)", () => {
    for (const a of ACHIEVEMENTS) {
      const hasGold = a.reward.gold !== undefined;
      const hasTitle = a.reward.titleId !== undefined;
      expect(hasGold && hasTitle, `${a.id} ไม่ควรมีทั้ง gold และ titleId พร้อมกัน`).toBe(false);
    }
  });
});

describe("rule-shape completeness per rule type", () => {
  test("distinct_set ทุกแถวมี distinctKey + distinctAllowed + target ≤ allowed.length", () => {
    for (const a of ACHIEVEMENTS) {
      if (a.rule.type === "distinct_set") {
        expect(a.rule.distinctKey, a.id).toBeTruthy();
        expect(a.rule.distinctAllowed, a.id).toBeDefined();
        expect(a.rule.distinctAllowed!.length, a.id).toBeGreaterThan(0);
        expect(a.rule.target, a.id).toBeLessThanOrEqual(a.rule.distinctAllowed!.length);
      }
    }
  });

  test("sequence ทุกแถวมี steps + windowSeconds", () => {
    for (const a of ACHIEVEMENTS) {
      if (a.rule.type === "sequence") {
        expect(a.rule.steps, a.id).toBeDefined();
        expect(a.rule.steps!.length, a.id).toBeGreaterThan(0);
        expect(a.rule.windowSeconds, a.id).toBeGreaterThan(0);
      }
    }
  });

  test("streak ทุกแถวมี resetEvent", () => {
    for (const a of ACHIEVEMENTS) {
      if (a.rule.type === "streak") {
        expect(a.rule.resetEvent, a.id).toBeTruthy();
      }
    }
  });

  test("composite ทุกแถวมี filters รวมใน event เดียว หรือ notOccurredEvent (อย่างน้อยหนึ่งอย่าง)", () => {
    for (const a of ACHIEVEMENTS) {
      if (a.rule.type === "composite") {
        const hasFilters = !!a.rule.filters && Object.keys(a.rule.filters).length > 0;
        const hasNotOccurred = !!a.rule.notOccurredEvent;
        expect(hasFilters || hasNotOccurred, a.id).toBe(true);
      }
    }
  });
});

describe("category row counts ตรงตารางใน source doc", () => {
  const coreByCategory = new Map<string, number>();
  for (const a of ACHIEVEMENTS.filter((x) => x.phase === "core")) {
    coreByCategory.set(a.category, (coreByCategory.get(a.category) ?? 0) + 1);
  }

  test("Progression 7 · Combat 10 · Elite&Boss 6 · Enhancement 7 · Economy 10 · Loot 4 · Living world 7 · NPC/meme 5 · Death 4", () => {
    expect(coreByCategory.get("progression")).toBe(7);
    expect(coreByCategory.get("combat")).toBe(10);
    expect(coreByCategory.get("elite_boss")).toBe(6);
    expect(coreByCategory.get("enhancement")).toBe(7);
    expect(coreByCategory.get("economy")).toBe(10);
    expect(coreByCategory.get("loot")).toBe(4);
    expect(coreByCategory.get("living_world")).toBe(7);
    expect(coreByCategory.get("npc_meme")).toBe(5);
    expect(coreByCategory.get("death")).toBe(4);
  });

  test("expanded 5: ach_map_2, ach_dungdung_rescue, ach_dungdung_speaks, ach_archer_first_kill, ach_bot_first", () => {
    const expandedIds = ACHIEVEMENTS.filter((a) => a.phase === "expanded").map((a) => a.id).sort();
    expect(expandedIds).toEqual(
      ["ach_archer_first_kill", "ach_bot_first", "ach_dungdung_rescue", "ach_dungdung_speaks", "ach_map_2"].sort(),
    );
  });
});
