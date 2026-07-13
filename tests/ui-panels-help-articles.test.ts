import { describe, expect, test } from "vitest";
import {
  getContextHelpArticle,
  getHelpArticle,
  getHelpArticlesByCategory,
  HELP_ARTICLES,
  validateAllHelpArticles,
  validateHelpArticle,
} from "@/ui/panels/help/help-articles";
import { HELP_ONE_LINE_MAX_CHARS, HELP_STEPS_MAX } from "@/ui/panels/help/help-types";
import { ENHANCEMENT_PANEL_ID } from "@/ui/panels/enhancement/enhancement-view";
import { INVENTORY_PANEL_ID } from "@/ui/panels/inventory/inventory-view";
import { SHOP_PANEL_ID } from "@/ui/panels/shop/shop-view";

describe("HELP_ARTICLES registry shape guard (DG §6.2)", () => {
  test("ทุกบทความผ่าน validateHelpArticle (ไม่มี error เลย)", () => {
    expect(validateAllHelpArticles()).toEqual([]);
  });

  test("ทุก oneLine ยาวไม่เกิน 120 ตัวอักษร", () => {
    for (const article of HELP_ARTICLES) {
      expect(article.oneLine.length).toBeLessThanOrEqual(HELP_ONE_LINE_MAX_CHARS);
    }
  });

  test("ทุก steps ไม่เกิน 4 ข้อ", () => {
    for (const article of HELP_ARTICLES) {
      expect(article.steps.length).toBeLessThanOrEqual(HELP_STEPS_MAX);
    }
  });

  test("validateHelpArticle จับ oneLine เกิน 120 ตัวอักษร", () => {
    const bad = {
      id: "x",
      category: "movement" as const,
      title: "x",
      oneLine: "a".repeat(121),
      steps: ["1"],
      moreDetail: "d",
      action: { type: "none" as const },
      applicableScreens: [],
    };
    const result = validateHelpArticle(bad);
    expect(result.errors.some((e) => e.includes("oneLine"))).toBe(true);
  });

  test("validateHelpArticle จับ steps เกิน 4 ข้อ", () => {
    const bad = {
      id: "y",
      category: "movement" as const,
      title: "y",
      oneLine: "สั้น ๆ",
      steps: ["1", "2", "3", "4", "5"],
      moreDetail: "d",
      action: { type: "none" as const },
      applicableScreens: [],
    };
    const result = validateHelpArticle(bad);
    expect(result.errors.some((e) => e.includes("steps"))).toBe(true);
  });

  test("id ไม่ซ้ำกันเลยทั้ง registry", () => {
    const ids = HELP_ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("เนื้อหาบังคับตาม brief P2-12", () => {
  test("บทความเสริมแกร่งมี hint 'ของหายากมากับบอส' (R8/D-052, verbatim)", () => {
    const article = getHelpArticle("enhancement");
    expect(article).toBeDefined();
    expect(article!.moreDetail).toContain("ของหายากมากับบอส");
  });

  test("ครอบทุกหมวดที่ brief ระบุ: เดิน/ตี/กระเป๋า/สวมใส่/ร้านค้า/เสริมแกร่ง/ตาย-ฟื้น/AFK", () => {
    const ids = new Set(HELP_ARTICLES.map((a) => a.id));
    for (const required of [
      "movement",
      "combat",
      "inventory_bag",
      "equip_item",
      "shop_buy_sell",
      "enhancement",
      "death_respawn",
      "afk_tab_switch",
    ]) {
      expect(ids.has(required)).toBe(true);
    }
  });

  test("บทความ AFK พูดถึงนโยบายค้างได้ไม่หลุด (D-056) ไม่ใช่ forced disconnect", () => {
    const article = getHelpArticle("afk_tab_switch");
    expect(article!.oneLine).toContain("ไม่ถูกเตะออก");
  });
});

describe("getHelpArticlesByCategory / getHelpArticle", () => {
  test("คืน article ตาม category ที่ขอเท่านั้น", () => {
    const combat = getHelpArticlesByCategory("combat");
    expect(combat.length).toBeGreaterThan(0);
    expect(combat.every((a) => a.category === "combat")).toBe(true);
  });

  test("id ไม่มีจริง → undefined", () => {
    expect(getHelpArticle("not_a_real_id")).toBeUndefined();
  });
});

describe("getContextHelpArticle (DG §5.4, context help ปุ่ม ? บนจอระบบ)", () => {
  test("inventory panel → มี article ผูกอยู่", () => {
    expect(getContextHelpArticle(INVENTORY_PANEL_ID)?.applicableScreens).toContain(INVENTORY_PANEL_ID);
  });

  test("enhancement panel → article มี hint R8 อยู่แล้วในตัว", () => {
    const article = getContextHelpArticle(ENHANCEMENT_PANEL_ID);
    expect(article?.id).toBe("enhancement");
  });

  test("shop panel → มี article ผูกอยู่", () => {
    expect(getContextHelpArticle(SHOP_PANEL_ID)?.applicableScreens).toContain(SHOP_PANEL_ID);
  });

  test("panel ที่ไม่มี context help ผูกไว้ → null", () => {
    expect(getContextHelpArticle("not_a_panel")).toBeNull();
  });
});
