import { describe, expect, test } from "vitest";
import { findRuleById, type RecommendationRuleInput } from "@/ui/panels/help/guidance-rules";
import { getHelpArticle, validateHelpArticle } from "@/ui/panels/help/help-articles";

// Wave 3 (OB) — surface the Map 1 capstone (Field Boss หมูป่าหม้อเดือด) via the existing guidance + help
// systems: a guidance rule that appears once the player has some progression, and a help article w/ Ch1 flavor.

const input = (level: number | null): RecommendationRuleInput => ({
  level,
  gold: 100,
  inventory: null,
  mapId: "map1",
  shopAvailable: false,
  sessionIntent: null,
  nowMs: 0,
});

describe("Field Boss guidance rule (OB)", () => {
  const rule = findRuleById("challenge_field_boss");

  test("rule exists in the pool", () => {
    expect(rule).toBeDefined();
    expect(rule!.category).toBe("power");
  });

  test("eligible only once the player has progressed (level ≥ 3)", () => {
    expect(rule!.isEligible(input(5))).toBe(true);
    expect(rule!.isEligible(input(3))).toBe(true);
    expect(rule!.isEligible(input(2))).toBe(false);
    expect(rule!.isEligible(input(null))).toBe(false); // ยังไม่เคยฆ่ามอน → ยังไม่รู้ level
  });
});

describe("Field Boss help article (OB, Arc1 Ch1 flavor)", () => {
  test("article exists, valid shape, mentions the reinforcement-material reward", () => {
    const article = getHelpArticle("field_boss");
    expect(article).toBeDefined();
    expect(validateHelpArticle(article!).errors).toEqual([]);
    expect(article!.category).toBe("combat");
    expect(article!.oneLine).toMatch(/เสริมแกร่ง/);
  });
});
