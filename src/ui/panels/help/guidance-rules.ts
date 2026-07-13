// "ทำอะไรต่อดี" rule engine v1 (P2-12, DG §7) — pure, data-driven, testable (no React/DOM, no network:
// client-only ตาม DG §15.2 "client-side: local help article rendering / presentation order after server
// eligibility" — P2 lite ไม่มี server recommendation service เลย ทุกอย่างประเมินจาก HudState ฝั่ง client).
//
// input ใช้เฉพาะสิ่งที่ HudState มีจริงตอนนี้ (level, inventory, gold, map — ตาม brief) — ไม่ implement
// input categories อื่นจาก DG §7.2 (quest/party/world event ฯลฯ) เพราะยังไม่มีระบบเหล่านั้นใน client เลย
// (deviation จาก DG §7.2 เต็มรูป — บันทึกไว้ตรงนี้, ขยายได้ทีหลังเมื่อ HudState มี field เพิ่ม).

import type { InventorySnapshot } from "@/shared/net-protocol";
import { ENHANCEMENT_PANEL_ID, countReinforcementMaterial } from "@/ui/panels/enhancement/enhancement-view";
import { INVENTORY_PANEL_ID } from "@/ui/panels/inventory/inventory-view";
import { SHOP_PANEL_ID } from "@/ui/panels/shop/shop-view";
import type {
  PlayIntent,
  Recommendation,
  RecommendationActionType,
  RecommendationCategory,
} from "./help-types";

/** input ของ rule engine — subset ของ HudState + สัญญาณ session (DG §7.2 ตัดเหลือเท่าที่มีจริงใน P2) */
export interface RecommendationRuleInput {
  level: number | null;
  gold: number | null;
  inventory: InventorySnapshot | null;
  mapId: string | null;
  shopAvailable: boolean;
  sessionIntent: PlayIntent;
  nowMs: number;
}

/** sameRuleCooldown — DG §9.3 (30 นาที) */
export const SAME_RULE_COOLDOWN_MS = 30 * 60 * 1000;
/** dismissedTagCooldown — DG §9.3 (24 ชั่วโมง) */
export const DISMISSED_TAG_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** DG §7.4 "ห้ามแนะนำซ้ำจากครั้งก่อนเกิน 2 ครั้งติด" — โดนตัดออกทั้งหมดเมื่อแสดงติดกันครบจำนวนนี้แล้ว */
export const MAX_CONSECUTIVE_SHOWS = 2;
/** DG §13.3 "ห้ามมีเกิน 4 cards ในครั้งเดียว" */
export const MAX_RECOMMENDATIONS = 4;
/** DG §7.1 "เสนอทางเลือก 2–4 แบบ" — ขั้นต่ำเมื่อ pool มีพอ (ไม่บังคับยัดถ้า pool ไม่พอจริง ๆ) */
export const MIN_RECOMMENDATIONS = 2;
/** DG §7.4 "ต้องมีอย่างน้อย 1 ตัวเลือกที่ใช้เวลาไม่เกิน 10 นาทีเมื่อเป็นไปได้" */
export const SHORT_OPTION_MAX_MINUTES = 10;
/** โบนัสคะแนนเมื่อหมวดตรงกับ Play Intent ที่ผู้เล่นเลือกไว้ (DG §8 "ใช้เป็นเพียงน้ำหนักใน recommendation") */
const INTENT_MATCH_BONUS = 2;
/** DG §7.4 repetitionPenalty — หักคะแนนตามจำนวนครั้งติดกันที่เคยแสดง (ก่อนถึง MAX_CONSECUTIVE_SHOWS ที่ตัดทิ้งเลย) */
const REPETITION_PENALTY_PER_SHOW = 1;

/** นิยาม rule 1 ใบ — data-driven (เงื่อนไข/คะแนนเป็น field ธรรมดา, ฟังก์ชัน isEligible ยังคง pure) */
export interface RecommendationRuleDef {
  id: string;
  category: RecommendationCategory;
  intentMatch: PlayIntent;
  title: string;
  summary: string;
  reason: string;
  estimatedMinutes?: number;
  actionType: RecommendationActionType;
  actionTarget: string | null;
  /** ใช้ผูก "ไม่ต้องเตือนเรื่องนี้อีก" (dismissedTagCooldown, DG §9.4) — rule เดียวมีได้หลาย tag */
  tags: string[];
  baseScore: number;
  isEligible(input: RecommendationRuleInput): boolean;
}

const bagNearFull = (inventory: InventorySnapshot | null): boolean =>
  inventory !== null && inventory.bag.length >= Math.ceil(inventory.capacity * 0.7);

/** rule pool v1 (P2-12) — ครอบ 4 หมวด (power/economy/explore/short_session) ตาม DG §7.1 หมวดที่ตัดมาใช้ได้จริง */
export const RECOMMENDATION_RULES: readonly RecommendationRuleDef[] = [
  {
    id: "try_enhancement_ready",
    category: "power",
    intentMatch: "power",
    title: "ลองเสริมแกร่งอุปกรณ์",
    summary: "มีวัสดุเสริมแกร่งอยู่ในกระเป๋าแล้ว",
    reason: "เสริมแกร่งการันตี 100% ไม่มีทางพลาด ใช้เลยไม่เสียของ",
    estimatedMinutes: 1,
    actionType: "open_panel",
    actionTarget: ENHANCEMENT_PANEL_ID,
    tags: ["enhancement"],
    baseScore: 9,
    isEligible: (input) => countReinforcementMaterial(input.inventory) > 0,
  },
  {
    // OB — surface the Map 1 capstone (Field Boss หมูป่าหม้อเดือด). ไม่มี panel action (world destination):
    // การ์ดบอกที่อยู่ + รางวัลพอ. gate ที่ level ≥ 3 กันส่งผู้เล่นสด (lv1) ไปเจอบอสเลือด 2500.
    id: "challenge_field_boss",
    category: "power",
    intentMatch: "power",
    title: "ท้าหมูป่าหม้อเดือด (บอสประจำแมพ)",
    summary: "บอสตัวเป้งรออยู่ที่ลาน boss ทางใต้สุดของแผนที่",
    reason: "ล้มได้ = ดรอปวัสดุเสริมแกร่ง + ของหายาก เอาไปตีบวกอาวุธต่อได้",
    estimatedMinutes: 10,
    actionType: "none",
    actionTarget: null,
    tags: ["boss"],
    baseScore: 7,
    isEligible: (input) => input.level !== null && input.level >= 3,
  },
  {
    id: "check_bag_unequipped",
    category: "power",
    intentMatch: "power",
    title: "เช็คของในกระเป๋า",
    summary: "มีของในกระเป๋าที่อาจยังไม่ได้สวม",
    reason: "ของใหม่ที่เพิ่งเก็บมาอาจแรงกว่าที่ใส่อยู่ ลองเช็คดู",
    estimatedMinutes: 2,
    actionType: "open_panel",
    actionTarget: INVENTORY_PANEL_ID,
    tags: ["inventory", "equipment"],
    baseScore: 5,
    isEligible: (input) => (input.inventory?.bag.length ?? 0) > 0,
  },
  {
    id: "sell_extra_items",
    category: "economy",
    intentMatch: "economy",
    title: "ขายของที่ไม่ใช้",
    summary: "กระเป๋าเริ่มใกล้เต็มแล้ว",
    reason: "เคลียร์กระเป๋าแลกเป็นเงิน ยังพอมีที่เก็บของใหม่",
    estimatedMinutes: 3,
    actionType: "open_panel",
    actionTarget: SHOP_PANEL_ID,
    tags: ["shop", "inventory"],
    baseScore: 6,
    isEligible: (input) => input.shopAvailable && bagNearFull(input.inventory),
  },
  {
    id: "visit_shop",
    category: "economy",
    intentMatch: "economy",
    title: "แวะร้านค้า",
    summary: "ตอนนี้อยู่ใกล้ร้านค้าพอดี",
    reason: "ดูของในร้านไว้เผื่อมีอุปกรณ์ที่อยากได้",
    estimatedMinutes: 2,
    actionType: "open_panel",
    actionTarget: SHOP_PANEL_ID,
    tags: ["shop"],
    baseScore: 3,
    isEligible: (input) => input.shopAvailable,
  },
  {
    id: "hunt_for_gold",
    category: "economy",
    intentMatch: "economy",
    title: "ล่ามอนหาเงินเพิ่ม",
    summary: "เงินตอนนี้ค่อนข้างน้อย",
    reason: "ฆ่ามอนแถวนี้เก็บเงิน/ของ เผื่อเอาไปใช้ที่ร้านค้า",
    estimatedMinutes: 5,
    actionType: "none",
    actionTarget: null,
    tags: ["economy"],
    baseScore: 4,
    isEligible: (input) => input.gold !== null && input.gold < 50,
  },
  {
    id: "short_session_hunt",
    category: "short_session",
    intentMatch: null,
    title: "ล่ามอนรอบตัวสัก 2-3 ตัว",
    summary: "มีเวลาแป๊บเดียวก็เล่นได้",
    reason: "ใช้เวลาไม่นาน ได้ EXP/ของกลับมาแน่นอน",
    estimatedMinutes: 5,
    actionType: "none",
    actionTarget: null,
    tags: ["combat"],
    baseScore: 2,
    isEligible: () => true,
  },
  {
    id: "explore_map",
    category: "explore",
    intentMatch: "explore",
    title: "สำรวจแผนที่ต่อ",
    summary: "ลองเดินสำรวจมุมที่ยังไม่เคยไป",
    reason: "แผนที่นี้อาจมีจุดที่ยังไม่เคยผ่าน",
    estimatedMinutes: 8,
    actionType: "none",
    actionTarget: null,
    tags: ["explore"],
    baseScore: 1,
    isEligible: (input) => input.mapId !== null,
  },
];

/** state ที่ต้อง persist ข้าม session (cooldown/dismissal, DG §9.3/§9.4) — key = ruleId/tag */
export interface RuleRuntimeState {
  lastShownAtMsByRuleId: Record<string, number>;
  consecutiveShowCountByRuleId: Record<string, number>;
  dismissedTagUntilMsByTag: Record<string, number>;
}

export const INITIAL_RULE_RUNTIME_STATE: RuleRuntimeState = {
  lastShownAtMsByRuleId: {},
  consecutiveShowCountByRuleId: {},
  dismissedTagUntilMsByTag: {},
};

function isRuleTagDismissed(rule: RecommendationRuleDef, runtime: RuleRuntimeState, nowMs: number): boolean {
  return rule.tags.some((tag) => (runtime.dismissedTagUntilMsByTag[tag] ?? 0) > nowMs);
}

function isOnCooldown(rule: RecommendationRuleDef, runtime: RuleRuntimeState, nowMs: number): boolean {
  const lastShown = runtime.lastShownAtMsByRuleId[rule.id];
  if (lastShown === undefined) return false;
  return nowMs - lastShown < SAME_RULE_COOLDOWN_MS;
}

function isOverConsecutiveLimit(rule: RecommendationRuleDef, runtime: RuleRuntimeState): boolean {
  return (runtime.consecutiveShowCountByRuleId[rule.id] ?? 0) >= MAX_CONSECUTIVE_SHOWS;
}

function scoreRule(rule: RecommendationRuleDef, input: RecommendationRuleInput, runtime: RuleRuntimeState): number {
  const intentBonus = rule.intentMatch !== null && rule.intentMatch === input.sessionIntent ? INTENT_MATCH_BONUS : 0;
  const repetitionPenalty =
    (runtime.consecutiveShowCountByRuleId[rule.id] ?? 0) * REPETITION_PENALTY_PER_SHOW;
  return rule.baseScore + intentBonus - repetitionPenalty;
}

function toRecommendation(rule: RecommendationRuleDef, score: number): Recommendation {
  return {
    id: rule.id,
    sourceRuleId: rule.id,
    category: rule.category,
    title: rule.title,
    summary: rule.summary,
    reason: rule.reason,
    estimatedMinutes: rule.estimatedMinutes,
    actionType: rule.actionType,
    actionTarget: rule.actionTarget,
    priorityScore: score,
  };
}

/**
 * คัด 2–4 ใบ (DG §7.1/§13.3) จาก rule pool — ตัด rule ที่ไม่ eligible/ติด cooldown/ติด dismissedTag/เกิน
 * MAX_CONSECUTIVE_SHOWS ออกก่อนจัดอันดับเสมอ (DG §7.4 "สิ่งที่ทำไม่ได้ต้องถูกตัดออกก่อนจัดอันดับ"), เรียง
 * priorityScore มากไปน้อย แล้วสลับให้มีตัวเลือก ≤10 นาทีอย่างน้อย 1 ใบถ้าเป็นไปได้ (DG §7.4).
 */
export function getRecommendations(
  input: RecommendationRuleInput,
  runtime: RuleRuntimeState,
  rules: readonly RecommendationRuleDef[] = RECOMMENDATION_RULES,
): Recommendation[] {
  const eligible = rules.filter(
    (rule) =>
      rule.isEligible(input) &&
      !isOnCooldown(rule, runtime, input.nowMs) &&
      !isRuleTagDismissed(rule, runtime, input.nowMs) &&
      !isOverConsecutiveLimit(rule, runtime),
  );

  const scored = eligible
    .map((rule) => ({ rule, score: scoreRule(rule, input, runtime) }))
    .sort((a, b) => b.score - a.score);

  let selected = scored.slice(0, MAX_RECOMMENDATIONS);

  const hasShortOption = selected.some(
    (entry) => entry.rule.estimatedMinutes !== undefined && entry.rule.estimatedMinutes <= SHORT_OPTION_MAX_MINUTES,
  );
  if (!hasShortOption) {
    const shortCandidate = scored.find(
      (entry) =>
        entry.rule.estimatedMinutes !== undefined &&
        entry.rule.estimatedMinutes <= SHORT_OPTION_MAX_MINUTES &&
        !selected.includes(entry),
    );
    if (shortCandidate && selected.length > 0) {
      selected = [...selected.slice(0, selected.length - 1), shortCandidate];
    } else if (shortCandidate) {
      selected = [shortCandidate];
    }
  }

  return selected.map((entry) => toRecommendation(entry.rule, entry.score));
}

/**
 * เรียกหลังโชว์ recommendation รอบหนึ่งจริง ๆ (การ์ดขึ้นจอ) — เดินตาม DG §9.3 sameRuleCooldown + §7.4
 * "ห้ามแนะนำซ้ำเกิน 2 ครั้งติด": id ที่ถูกโชว์รอบนี้ → cooldown ใหม่ + consecutiveCount+1, id อื่นที่เคย
 * โชว์มาก่อนแต่รอบนี้ไม่โชว์ → consecutiveCount รีเซ็ตเป็น 0 (ไม่ติดกันแล้ว).
 */
export function recordRecommendationsShown(
  runtime: RuleRuntimeState,
  shownRuleIds: readonly string[],
  nowMs: number,
): RuleRuntimeState {
  const lastShownAtMsByRuleId = { ...runtime.lastShownAtMsByRuleId };
  const consecutiveShowCountByRuleId = { ...runtime.consecutiveShowCountByRuleId };

  for (const id of shownRuleIds) {
    lastShownAtMsByRuleId[id] = nowMs;
    consecutiveShowCountByRuleId[id] = (consecutiveShowCountByRuleId[id] ?? 0) + 1;
  }
  for (const id of Object.keys(consecutiveShowCountByRuleId)) {
    if (!shownRuleIds.includes(id)) consecutiveShowCountByRuleId[id] = 0;
  }

  return { ...runtime, lastShownAtMsByRuleId, consecutiveShowCountByRuleId };
}

/** "ไม่เอาตอนนี้" (DG §9.4) — เข้า sameRuleCooldown ทันที (ไม่ต้องรอครบรอบธรรมชาติ) */
export function dismissRecommendationOnce(
  runtime: RuleRuntimeState,
  ruleId: string,
  nowMs: number,
): RuleRuntimeState {
  return {
    ...runtime,
    lastShownAtMsByRuleId: { ...runtime.lastShownAtMsByRuleId, [ruleId]: nowMs },
  };
}

/** "ไม่ต้องเตือนเรื่องนี้อีก" (DG §9.4) — dismissedTagCooldown 24 ชม. ต่อทุก tag ของ rule นั้น */
export function dismissRecommendationTagsForever(
  runtime: RuleRuntimeState,
  rule: RecommendationRuleDef,
  nowMs: number,
): RuleRuntimeState {
  const dismissedTagUntilMsByTag = { ...runtime.dismissedTagUntilMsByTag };
  for (const tag of rule.tags) {
    dismissedTagUntilMsByTag[tag] = nowMs + DISMISSED_TAG_COOLDOWN_MS;
  }
  return { ...runtime, dismissedTagUntilMsByTag };
}

/** หา rule def จาก id (ใช้ตอน dismiss แบบ "ไม่ต้องเตือนอีก" ที่ UI มีแค่ Recommendation ไม่มี tags ติดมา) */
export function findRuleById(
  ruleId: string,
  rules: readonly RecommendationRuleDef[] = RECOMMENDATION_RULES,
): RecommendationRuleDef | undefined {
  return rules.find((rule) => rule.id === ruleId);
}
