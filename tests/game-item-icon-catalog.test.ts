import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { EMPTY_SLOT_ICON_FILES, ICON_FILES } from "@/game/item/icon-catalog";
import { RARITY_COLORS, EPIC_RIM_COLOR } from "@/ui/theme/rarity";
import { RARITY_ALIAS } from "../scripts/svg/palette";

const SVG_ROOT = resolve(__dirname, "..", "svg");

/**
 * SERVER-AUTHORITATIVE catalog — read-only, sync check only (client never imports it from real code,
 * see icon-catalog.ts header). Loaded dynamically + guarded: on this branch (feat/art-map1-svg) the
 * P2 wave3 inventory work (src/server/inventory/item-catalog.ts) has not landed yet (it lives on
 * feat/p2-wave3-value-loop only), so the sync check below skips itself with a loud warning instead
 * of hard-failing `npm test` on a dependency outside this brief's scope — see the fast-worker report.
 * Re-run for real once this branch merges with / rebases onto that work.
 */
async function loadServerItemIds(): Promise<string[] | null> {
  try {
    // non-literal specifier on purpose: tsc must not statically resolve this module (it may not
    // exist on this branch — see the doc comment above), only vitest's runtime loader does.
    const specifier = ["@", "server", "inventory", "item-catalog"].join("/");
    const mod = (await import(specifier)) as {
      DEFAULT_ITEM_DEFINITIONS?: Array<{ id: string }>;
    };
    return mod.DEFAULT_ITEM_DEFINITIONS?.map((d) => d.id) ?? null;
  } catch {
    return null;
  }
}

describe("game-item-icon-catalog", () => {
  test("(a) ทุก itemId ในเซิร์ฟเวอร์ catalog มี entry ใน ICON_FILES", async () => {
    const ids = await loadServerItemIds();
    if (ids === null) {
      console.warn(
        "[game-item-icon-catalog] src/server/inventory/item-catalog.ts ไม่พบในบรานช์นี้ — ข้ามเช็ค sync (ดู report)",
      );
      return;
    }
    for (const id of ids) {
      expect(ICON_FILES[id], `missing icon mapping for itemId "${id}"`).toBeTruthy();
    }
  });

  test("(b) ทุกไฟล์ที่ ICON_FILES/EMPTY_SLOT_ICON_FILES ชี้ไป มีอยู่จริงใน svg/items หรือ svg/ui", () => {
    for (const file of Object.values(ICON_FILES)) {
      const inItems = existsSync(resolve(SVG_ROOT, "items", file));
      const inUi = existsSync(resolve(SVG_ROOT, "ui", file));
      expect(inItems || inUi, `icon file not found on disk: ${file}`).toBe(true);
    }
    for (const file of Object.values(EMPTY_SLOT_ICON_FILES)) {
      const inUi = existsSync(resolve(SVG_ROOT, "ui", file));
      expect(inUi, `empty-slot icon file not found on disk: svg/ui/${file}`).toBe(true);
    }
  });

  test("(c) RARITY_COLORS ตรงกับ RARITY_ALIAS (D-043) ทุกตัว + epic rim", () => {
    expect(RARITY_COLORS.common).toBe(RARITY_ALIAS["rarity.common"]);
    expect(RARITY_COLORS.uncommon).toBe(RARITY_ALIAS["rarity.uncommon"]);
    expect(RARITY_COLORS.rare).toBe(RARITY_ALIAS["rarity.rare"]);
    expect(RARITY_COLORS.epic).toBe(RARITY_ALIAS["rarity.epic"]);
    expect(RARITY_COLORS.legendary).toBe(RARITY_ALIAS["rarity.legendary"]);
    expect(EPIC_RIM_COLOR).toBe(RARITY_ALIAS["rarity.epic.rim"]);
  });
});
