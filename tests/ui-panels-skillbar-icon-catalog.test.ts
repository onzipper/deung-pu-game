import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { SKILL_ICON_FILES, skillIconUrl } from "@/ui/panels/skillbar/skill-icon-catalog";
import { WARRIOR_SKILLS_CLIENT } from "@/game/skill/data/warrior-skills-client";

const SVG_UI_ROOT = resolve(__dirname, "..", "svg", "ui");
const PUBLIC_ICONS_ROOT = resolve(__dirname, "..", "public", "assets", "icons");

describe("ui-panels-skillbar-icon-catalog", () => {
  test("(a) ทุก skillId ของนักดาบ (warrior-skills-client) มี entry ใน SKILL_ICON_FILES", () => {
    for (const skill of WARRIOR_SKILLS_CLIENT) {
      expect(SKILL_ICON_FILES[skill.skillId], `missing icon mapping for skillId "${skill.skillId}"`).toBeTruthy();
    }
  });

  test("(b) ทุกไฟล์ที่ SKILL_ICON_FILES ชี้ไป มีอยู่จริงทั้ง svg/ui และ public/assets/icons", () => {
    for (const file of Object.values(SKILL_ICON_FILES)) {
      expect(existsSync(resolve(SVG_UI_ROOT, file)), `not found: svg/ui/${file}`).toBe(true);
      expect(existsSync(resolve(PUBLIC_ICONS_ROOT, file)), `not found: public/assets/icons/${file}`).toBe(true);
    }
  });

  test("(c) skillIconUrl คืน URL ที่ถูกต้อง, id ไม่รู้จักคืน null (fallback text label)", () => {
    expect(skillIconUrl("sword_basic_slash")).toBe("/assets/icons/icon_skill_sword_basic_slash_v01.svg");
    expect(skillIconUrl("not_a_real_skill")).toBeNull();
  });
});
