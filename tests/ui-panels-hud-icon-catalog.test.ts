import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { HUD_ICON_FILES, hudIconUrl } from "@/ui/panels/hud-icon-catalog";

const SVG_UI_ROOT = resolve(__dirname, "..", "svg", "ui");
const PUBLIC_ICONS_ROOT = resolve(__dirname, "..", "public", "assets", "icons");

describe("ui-panels-hud-icon-catalog", () => {
  test("(a) ทุก slot (inventory/enhancement/shop/storage/settings/help) มี entry ใน HUD_ICON_FILES", () => {
    const slots: Array<keyof typeof HUD_ICON_FILES> = [
      "inventory",
      "enhancement",
      "shop",
      "storage",
      "settings",
      "help",
    ];
    for (const slot of slots) {
      expect(HUD_ICON_FILES[slot], `missing icon mapping for slot "${slot}"`).toBeTruthy();
    }
  });

  test("(b) ทุกไฟล์ที่ HUD_ICON_FILES ชี้ไป มีอยู่จริงทั้ง svg/ui และ public/assets/icons", () => {
    for (const file of Object.values(HUD_ICON_FILES)) {
      expect(existsSync(resolve(SVG_UI_ROOT, file)), `not found: svg/ui/${file}`).toBe(true);
      expect(existsSync(resolve(PUBLIC_ICONS_ROOT, file)), `not found: public/assets/icons/${file}`).toBe(true);
    }
  });

  test("(c) hudIconUrl คืน URL ที่ถูกต้อง", () => {
    expect(hudIconUrl("inventory")).toBe("/assets/icons/icon_hud_bag_v01.svg");
    expect(hudIconUrl("help")).toBe("/assets/icons/icon_hud_help_v01.svg");
  });
});
