// M5 HUD redesign — pure-logic tests for src/ui/hud/hud-layout.ts (dock model), src/ui/hud/bot-status-chip-view.ts
// (chip state model), and hud-icon-catalog.ts (icon file coverage — mirror pattern of
// tests/ui-panels-hud-icon-catalog.test.ts, extended for the M5 id superset).

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  HUD_DOCK_ITEMS,
  HUD_SLOT_NAMES,
  hudDockShortcutMap,
  isHudDockItemVisible,
  resolveHudDockShortcut,
  visibleHudDockItems,
  type HudDockItemId,
} from "@/ui/hud/hud-layout";
import {
  BOT_CHIP_DOT_CLASS,
  botChipLine1,
  botChipLine2,
  resolveBotChipCategory,
  type BotChipInput,
} from "@/ui/hud/bot-status-chip-view";
import { HUD_ICON_FILES, hudIconUrl, type HudIconId } from "@/ui/panels/hud-icon-catalog";
import type { BotCheckpointWire, BotStatusMessage } from "@/shared/net-protocol";

const SVG_UI_ROOT = resolve(__dirname, "..", "svg", "ui");
const PUBLIC_ICONS_ROOT = resolve(__dirname, "..", "public", "assets", "icons");

describe("hud-layout — Utility Dock model", () => {
  test("HUD_SLOT_NAMES มีครบ 7 slot ตามสเปก (§1)", () => {
    expect(HUD_SLOT_NAMES).toEqual([
      "top-left",
      "top-center",
      "top-right",
      "right-rail",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ]);
  });

  test("HUD_DOCK_ITEMS มีครบ 8 ปุ่มตามสเปก (§2), id ไม่ซ้ำกัน", () => {
    const ids = HUD_DOCK_ITEMS.map((i) => i.id);
    expect(ids).toEqual(["inventory", "enhancement", "shop", "storage", "journal", "bot", "help", "settings"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("คีย์ลัด — เฉพาะ inventory/journal/bot เท่านั้นที่มี (I/J/B), ที่เหลือ null", () => {
    const withShortcut = HUD_DOCK_ITEMS.filter((i) => i.shortcut !== null).map((i) => i.id);
    expect(withShortcut.sort()).toEqual(["bot", "inventory", "journal"].sort());
  });

  test("hudDockShortcutMap/resolveHudDockShortcut — lowercase key → item id, case-insensitive", () => {
    const map = hudDockShortcutMap();
    expect(map).toEqual({ i: "inventory", j: "journal", b: "bot" });
    expect(resolveHudDockShortcut("I")).toBe("inventory");
    expect(resolveHudDockShortcut("j")).toBe("journal");
    expect(resolveHudDockShortcut("B")).toBe("bot");
    expect(resolveHudDockShortcut("x")).toBeNull();
  });

  test("isHudDockItemVisible — shop/storage ตาม availability, ที่เหลือ alwaysAvailable เสมอ", () => {
    const availableBoth = { shopAvailable: true, storageAvailable: true };
    const availableNeither = { shopAvailable: false, storageAvailable: false };
    for (const item of HUD_DOCK_ITEMS) {
      if (item.id === "shop" || item.id === "storage") continue;
      expect(isHudDockItemVisible(item, availableNeither)).toBe(true);
    }
    const shopItem = HUD_DOCK_ITEMS.find((i) => i.id === "shop")!;
    const storageItem = HUD_DOCK_ITEMS.find((i) => i.id === "storage")!;
    expect(isHudDockItemVisible(shopItem, availableNeither)).toBe(false);
    expect(isHudDockItemVisible(storageItem, availableNeither)).toBe(false);
    expect(isHudDockItemVisible(shopItem, availableBoth)).toBe(true);
    expect(isHudDockItemVisible(storageItem, availableBoth)).toBe(true);
  });

  test("visibleHudDockItems — กรอง shop/storage ออกเมื่อไม่มี, คง order เดิม, เหลือ 6 ปุ่มตอนไม่มีทั้งคู่", () => {
    const ids = visibleHudDockItems({ shopAvailable: false, storageAvailable: false }).map((i) => i.id);
    expect(ids).toEqual(["inventory", "enhancement", "journal", "bot", "help", "settings"]);
  });

  test("visibleHudDockItems — city-hub (ทั้งสองมี) เหลือครบ 8 ปุ่ม order เดิม", () => {
    const ids = visibleHudDockItems({ shopAvailable: true, storageAvailable: true }).map((i) => i.id);
    expect(ids).toEqual(HUD_DOCK_ITEMS.map((i) => i.id));
  });
});

describe("bot-status-chip-view — chip state model (§3)", () => {
  const baseStatus = (state: string): BotStatusMessage =>
    ({
      profileId: "p1",
      action: "attacking",
      continuity: { state },
      killCount: 0,
      goldEarned: 0,
      expEarned: 0,
      hpFraction: 1,
      uptimeMs: 0,
      stats: undefined,
    }) as unknown as BotStatusMessage;

  test("idle — ไม่มีบอทรัน ไม่มี checkpoint ค้าง", () => {
    const input: BotChipInput = { authorityActive: false, status: null, checkpoint: null, activeProfileName: null };
    expect(resolveBotChipCategory(input)).toBe("idle");
    expect(botChipLine2("idle", input, undefined)).toBe("หยุดทำงาน");
  });

  test("running — authorityActive true, continuity ไม่ใช่ town-trip state", () => {
    const input: BotChipInput = {
      authorityActive: true,
      status: baseStatus("WORKING"),
      checkpoint: null,
      activeProfileName: "แผนหลัก",
    };
    expect(resolveBotChipCategory(input)).toBe("running");
    expect(botChipLine2("running", input, undefined)).toBe("ทำงาน · แผนหลัก");
  });

  test("running — ไม่มีชื่อแผน (activeProfileName null) ยังคงแสดง continuity label เฉย ๆ", () => {
    const input: BotChipInput = {
      authorityActive: true,
      status: baseStatus("COMBAT"),
      checkpoint: null,
      activeProfileName: null,
    };
    expect(botChipLine2("running", input, undefined)).toBe("ต่อสู้");
  });

  test("town_trip — continuity เป็นหนึ่งใน RETURNING_TO_TOWN/SELLING/DEPOSITING/RESTOCKING", () => {
    for (const state of ["RETURNING_TO_TOWN", "SELLING", "DEPOSITING", "RESTOCKING"]) {
      const input: BotChipInput = {
        authorityActive: true,
        status: baseStatus(state),
        checkpoint: null,
        activeProfileName: null,
      };
      expect(resolveBotChipCategory(input)).toBe("town_trip");
      expect(botChipLine2("town_trip", input, undefined)).toBe("กำลังเข้าเมือง·เดิน/วาร์ป");
    }
  });

  test("RETURNING_TO_WORK นับเป็น running (กลับไปฟาร์ม ไม่ใช่ town trip)", () => {
    const input: BotChipInput = {
      authorityActive: true,
      status: baseStatus("RETURNING_TO_WORK"),
      checkpoint: null,
      activeProfileName: null,
    };
    expect(resolveBotChipCategory(input)).toBe("running");
  });

  test("waiting — checkpoint ready ระหว่างไม่มีบอทรัน + เหตุผลสั้นจาก lastStopped.reason", () => {
    const checkpoint = {
      id: "cp1",
      profileId: "p1",
      sourceSessionId: "s1",
      mapId: "map1",
      pocketId: "map1-slime-center",
      savedAt: 0,
      state: "ready",
      continuity: { state: "PAUSED" },
    } as unknown as BotCheckpointWire;
    const input: BotChipInput = {
      authorityActive: false,
      status: null,
      checkpoint,
      activeProfileName: null,
    };
    expect(resolveBotChipCategory(input)).toBe("waiting");
    expect(botChipLine2("waiting", input, "rare_found")).toBe("รอคุณจัดการ: เจอของแรร์");
    expect(botChipLine2("waiting", input, undefined)).toBe("รอคุณจัดการ: มีจุดทำงานค้างอยู่");
    expect(botChipLine2("waiting", input, "unknown_reason_code")).toBe("รอคุณจัดการ: มีเรื่องต้องจัดการ");
  });

  test("dot class — token เท่านั้น (ห้าม hardcode hex) ครบ 4 category", () => {
    for (const category of ["idle", "running", "town_trip", "waiting"] as const) {
      expect(BOT_CHIP_DOT_CLASS[category]).toMatch(/^bg-\(--dp-[a-z-]+\)$/);
    }
  });

  test("botChipLine1 คงที่เสมอ", () => {
    expect(botChipLine1()).toBe("ผู้ช่วยนักล่า");
  });
});

describe("hud-icon-catalog — M5 superset (8 dock ids + 8 decorative ids)", () => {
  const ALL_IDS: HudIconId[] = [
    "inventory",
    "enhancement",
    "shop",
    "storage",
    "settings",
    "help",
    "journal",
    "bot",
    "lock",
    "town",
    "warp",
    "report",
    "workflow",
    "tier_free",
    "tier_plus",
    "tier_pro",
  ];

  test("ทุก id มี entry ใน HUD_ICON_FILES", () => {
    for (const id of ALL_IDS) {
      expect(HUD_ICON_FILES[id], `missing icon mapping for "${id}"`).toBeTruthy();
    }
  });

  test("ทุก dock item id (hud-layout.ts) resolve ผ่าน hudIconUrl ได้ (type-compatible + ไฟล์จริง)", () => {
    const dockIds: HudDockItemId[] = ["inventory", "enhancement", "shop", "storage", "journal", "bot", "help", "settings"];
    for (const id of dockIds) {
      const url = hudIconUrl(id);
      expect(url).toBe(`/assets/icons/${HUD_ICON_FILES[id]}`);
    }
  });

  test("ทุกไฟล์ที่ HUD_ICON_FILES ชี้ไป มีอยู่จริงทั้ง svg/ui และ public/assets/icons (mirror)", () => {
    for (const file of Object.values(HUD_ICON_FILES)) {
      expect(existsSync(resolve(SVG_UI_ROOT, file)), `not found: svg/ui/${file}`).toBe(true);
      expect(existsSync(resolve(PUBLIC_ICONS_ROOT, file)), `not found: public/assets/icons/${file}`).toBe(true);
    }
  });
});
