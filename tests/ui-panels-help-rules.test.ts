import { describe, expect, test } from "vitest";
import {
  DISMISSED_TAG_COOLDOWN_MS,
  dismissRecommendationOnce,
  dismissRecommendationTagsForever,
  findRuleById,
  getRecommendations,
  INITIAL_RULE_RUNTIME_STATE,
  MAX_CONSECUTIVE_SHOWS,
  MAX_RECOMMENDATIONS,
  RECOMMENDATION_RULES,
  recordRecommendationsShown,
  SAME_RULE_COOLDOWN_MS,
  type RecommendationRuleDef,
  type RecommendationRuleInput,
  type RuleRuntimeState,
} from "@/ui/panels/help/guidance-rules";

const baseInput = (over: Partial<RecommendationRuleInput> = {}): RecommendationRuleInput => ({
  level: 1,
  gold: 1000,
  inventory: null,
  mapId: null,
  shopAvailable: false,
  sessionIntent: null,
  nowMs: 0,
  ...over,
});

const rule = (over: Partial<RecommendationRuleDef> = {}): RecommendationRuleDef => ({
  id: "a",
  category: "explore",
  intentMatch: null,
  title: "t",
  summary: "s",
  reason: "r",
  actionType: "none",
  actionTarget: null,
  tags: ["a"],
  baseScore: 10,
  isEligible: () => true,
  ...over,
});

describe("getRecommendations — คัดจาก eligible pool", () => {
  test("ตัด rule ที่ isEligible=false ออกก่อนจัดอันดับเสมอ (DG §7.4)", () => {
    const rules = [
      rule({ id: "always", baseScore: 5 }),
      rule({ id: "never", baseScore: 100, isEligible: () => false }),
    ];
    const result = getRecommendations(baseInput(), INITIAL_RULE_RUNTIME_STATE, rules);
    expect(result.map((r) => r.id)).toEqual(["always"]);
  });

  test("เรียงตาม priorityScore มากไปน้อย", () => {
    const rules = [
      rule({ id: "low", baseScore: 1 }),
      rule({ id: "high", baseScore: 9 }),
      rule({ id: "mid", baseScore: 5 }),
    ];
    const result = getRecommendations(baseInput(), INITIAL_RULE_RUNTIME_STATE, rules);
    expect(result.map((r) => r.id)).toEqual(["high", "mid", "low"]);
  });

  test("ไม่เกิน MAX_RECOMMENDATIONS (4, DG §13.3) แม้ pool มีมากกว่า", () => {
    const rules = Array.from({ length: 6 }, (_, i) => rule({ id: `r${i}`, baseScore: 6 - i }));
    const result = getRecommendations(baseInput(), INITIAL_RULE_RUNTIME_STATE, rules);
    expect(result.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
    expect(result.length).toBe(4);
  });

  test("intent bonus: rule ที่ category ตรงกับ sessionIntent ได้คะแนนเพิ่มจนแซงได้ (DG §8)", () => {
    const rules = [
      rule({ id: "no_match", baseScore: 6, intentMatch: "explore" }),
      rule({ id: "match", baseScore: 5, intentMatch: "power" }),
    ];
    const result = getRecommendations(
      baseInput({ sessionIntent: "power" }),
      INITIAL_RULE_RUNTIME_STATE,
      rules,
    );
    expect(result[0].id).toBe("match"); // 5 + 2 (intent bonus) = 7 > 6
  });

  test("ต้องมีอย่างน้อย 1 ใบ ≤10 นาที เมื่อเป็นไปได้ (DG §7.4) — สลับใบคะแนนต่ำสุดที่ถูกเลือกออก", () => {
    const rules = [
      rule({ id: "a", baseScore: 10, estimatedMinutes: 20 }),
      rule({ id: "b", baseScore: 9, estimatedMinutes: 15 }),
      rule({ id: "c", baseScore: 8, estimatedMinutes: 30 }),
      rule({ id: "d", baseScore: 7, estimatedMinutes: 25 }),
      rule({ id: "e", baseScore: 1, estimatedMinutes: 5 }),
    ];
    const result = getRecommendations(baseInput(), INITIAL_RULE_RUNTIME_STATE, rules);
    expect(result.length).toBe(4);
    expect(result.some((r) => (r.estimatedMinutes ?? Infinity) <= 10)).toBe(true);
    expect(result.map((r) => r.id)).toContain("e");
    expect(result.map((r) => r.id)).not.toContain("d"); // ตัวคะแนนต่ำสุดที่เคยถูกเลือกโดนสลับออก
  });
});

describe("cooldown — sameRuleCooldown 30 นาที (DG §9.3)", () => {
  test("rule ที่เพิ่งโชว์ไป → ไม่โผล่อีกจนกว่าจะพ้น cooldown", () => {
    const rules = [rule({ id: "a" }), rule({ id: "b", baseScore: 1 })];
    let runtime = INITIAL_RULE_RUNTIME_STATE;
    const shown = getRecommendations(baseInput({ nowMs: 0 }), runtime, rules);
    runtime = recordRecommendationsShown(runtime, shown.map((r) => r.id), 0);

    const stillCoolingDown = getRecommendations(baseInput({ nowMs: SAME_RULE_COOLDOWN_MS - 1 }), runtime, rules);
    expect(stillCoolingDown.map((r) => r.id)).not.toContain("a");

    const afterCooldown = getRecommendations(baseInput({ nowMs: SAME_RULE_COOLDOWN_MS + 1 }), runtime, rules);
    expect(afterCooldown.map((r) => r.id)).toContain("a");
  });

  test("SAME_RULE_COOLDOWN_MS = 30 นาที ตรง DG §9.3", () => {
    expect(SAME_RULE_COOLDOWN_MS).toBe(30 * 60 * 1000);
  });
});

describe("MAX_CONSECUTIVE_SHOWS — ห้ามแนะนำซ้ำเกิน 2 ครั้งติด (DG §7.4)", () => {
  test("โดนตัดออกทั้งหมดหลังโดนโชว์ครบ 2 ครั้งติดกัน แล้วกลับมาได้เมื่อไม่ได้โชว์ 1 รอบ", () => {
    const rules = [rule({ id: "a" }), rule({ id: "fallback", baseScore: 1 })];
    let runtime = INITIAL_RULE_RUNTIME_STATE;
    let t = 0;
    const step = SAME_RULE_COOLDOWN_MS + 1;

    // โชว์ "a" ติดกัน MAX_CONSECUTIVE_SHOWS ครั้ง (คูลดาวน์หมดก่อนทุกครั้ง)
    for (let i = 0; i < MAX_CONSECUTIVE_SHOWS; i++) {
      const shown = getRecommendations(baseInput({ nowMs: t }), runtime, rules);
      expect(shown.map((r) => r.id)).toContain("a");
      runtime = recordRecommendationsShown(runtime, shown.map((r) => r.id), t);
      t += step;
    }

    // ครั้งถัดไป (คูลดาวน์หมดแล้วเช่นกัน) — "a" ต้องหายไปเพราะติด MAX_CONSECUTIVE_SHOWS
    const afterLimit = getRecommendations(baseInput({ nowMs: t }), runtime, rules);
    expect(afterLimit.map((r) => r.id)).not.toContain("a");

    // รอบที่ไม่โชว์ "a" เลย → consecutiveCount รีเซ็ตเป็น 0
    runtime = recordRecommendationsShown(runtime, ["fallback"], t);
    t += step;
    const afterReset = getRecommendations(baseInput({ nowMs: t }), runtime, rules);
    expect(afterReset.map((r) => r.id)).toContain("a");
  });
});

describe("dismiss (DG §9.4)", () => {
  test('"ไม่เอาตอนนี้" (dismissRecommendationOnce) = เข้า cooldown ทันที', () => {
    const rules = [rule({ id: "a" }), rule({ id: "b", baseScore: 1 })];
    const runtime = dismissRecommendationOnce(INITIAL_RULE_RUNTIME_STATE, "a", 1000);
    const result = getRecommendations(baseInput({ nowMs: 1000 }), runtime, rules);
    expect(result.map((r) => r.id)).not.toContain("a");
  });

  test('"ไม่ต้องเตือนเรื่องนี้อีก" (dismissRecommendationTagsForever) = 24 ชม. ตาม tag', () => {
    const target = rule({ id: "a", tags: ["enhancement"] });
    const rules = [target, rule({ id: "b", baseScore: 1, tags: ["other"] })];
    const runtime = dismissRecommendationTagsForever(INITIAL_RULE_RUNTIME_STATE, target, 0);

    const stillDismissed = getRecommendations(
      baseInput({ nowMs: DISMISSED_TAG_COOLDOWN_MS - 1 }),
      runtime,
      rules,
    );
    expect(stillDismissed.map((r) => r.id)).not.toContain("a");

    const afterExpiry = getRecommendations(
      baseInput({ nowMs: DISMISSED_TAG_COOLDOWN_MS + 1 }),
      runtime,
      rules,
    );
    expect(afterExpiry.map((r) => r.id)).toContain("a");
  });

  test("DISMISSED_TAG_COOLDOWN_MS = 24 ชั่วโมง ตรง DG §9.3", () => {
    expect(DISMISSED_TAG_COOLDOWN_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("findRuleById", () => {
  test("หา rule จริงใน RECOMMENDATION_RULES เจอ", () => {
    expect(findRuleById("try_enhancement_ready")).toBeDefined();
  });

  test("id ไม่มีจริง → undefined", () => {
    expect(findRuleById("not_a_real_rule")).toBeUndefined();
  });
});

describe("RECOMMENDATION_RULES (rule pool จริงของ P2-12)", () => {
  test("id ไม่ซ้ำกันเลย", () => {
    const ids = RECOMMENDATION_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("ครอบทั้ง 4 หมวด power/economy/explore/short_session", () => {
    const categories = new Set(RECOMMENDATION_RULES.map((r) => r.category));
    expect(categories).toEqual(new Set(["power", "economy", "explore", "short_session"]));
  });

  test("มี fallback rule ที่ eligible เสมอ (short_session_hunt) — กันเหลือ 0 ใบ", () => {
    const always = RECOMMENDATION_RULES.find((r) => r.id === "short_session_hunt");
    expect(always?.isEligible(baseInput())).toBe(true);
  });

  test("สถานการณ์จริง: มี map + gold พอ + ไม่มีของในกระเป๋า → ได้ 2 ใบขึ้นไป (DG §7.1 'เสนอ 2-4 ทาง')", () => {
    const result = getRecommendations(
      baseInput({ mapId: "map_01", gold: 1000 }),
      INITIAL_RULE_RUNTIME_STATE,
    );
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.length).toBeLessThanOrEqual(4);
  });
});
