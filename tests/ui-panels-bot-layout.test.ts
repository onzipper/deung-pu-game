import { describe, expect, test } from "vitest";
import {
  BOT_PLAN_EDITOR_COLUMNS,
  BOT_POTION_ITEM_ID,
  bagUsageLabel,
  blankBotProfileForm,
  botPlanEditorStackOrder,
  editBotProfileForm,
  formatBotStats,
  isBotProfileFormValid,
  mobTypesForPocket,
  potionCountFromBag,
  type BotPlanEditorSectionId,
} from "@/ui/panels/bot/bot-layout";
import { addWorkflowStep, defaultBotRules, newWorkflowFarmStep } from "@/ui/panels/bot/bot-view";
import type { BotProfileWire, InventorySnapshot } from "@/shared/net-protocol";

function fakeInventory(overrides: Partial<InventorySnapshot> = {}): InventorySnapshot {
  return {
    capacity: 40,
    bag: [],
    equipment: [],
    ...overrides,
  } as InventorySnapshot;
}

describe("potionCountFromBag", () => {
  test("null inventory → null (ยังไม่มี snapshot, ห้ามโชว์ 0 ปลอม)", () => {
    expect(potionCountFromBag(null)).toBeNull();
  });

  test("sum quantity ของ itemId ที่ตรง เท่านั้น", () => {
    const inv = fakeInventory({
      bag: [
        { instanceId: "a", itemId: BOT_POTION_ITEM_ID, location: "CHARACTER_INVENTORY", slot: 0, quantity: 5, enhancementLevel: 0, version: 1 },
        { instanceId: "b", itemId: BOT_POTION_ITEM_ID, location: "CHARACTER_INVENTORY", slot: 1, quantity: 3, enhancementLevel: 0, version: 1 },
        { instanceId: "c", itemId: "some_other_item", location: "CHARACTER_INVENTORY", slot: 2, quantity: 99, enhancementLevel: 0, version: 1 },
      ] as InventorySnapshot["bag"],
    });
    expect(potionCountFromBag(inv)).toBe(8);
  });

  test("ไม่มียาเลย → 0 (ไม่ใช่ null — มี snapshot จริงแล้ว)", () => {
    expect(potionCountFromBag(fakeInventory())).toBe(0);
  });
});

describe("bagUsageLabel", () => {
  test("null → null", () => {
    expect(bagUsageLabel(null)).toBeNull();
  });

  test("used/capacity จากจำนวนช่องที่ใช้ (bag.length) ไม่ใช่ผลรวม quantity", () => {
    const inv = fakeInventory({
      capacity: 40,
      bag: [
        { instanceId: "a", itemId: "x", location: "CHARACTER_INVENTORY", slot: 0, quantity: 99, enhancementLevel: 0, version: 1 },
      ] as InventorySnapshot["bag"],
    });
    expect(bagUsageLabel(inv)).toBe("1/40");
  });
});

describe("mobTypesForPocket", () => {
  test("map/pocket ที่มีจริง → mobType ของ pocket นั้น", () => {
    expect(mobTypesForPocket("map1", "map1-slime-center")).toEqual(["slime"]);
    expect(mobTypesForPocket("map1", "map1-bird-east")).toEqual(["bird"]);
    expect(mobTypesForPocket("map2", "map2-mushroom-west")).toEqual(["mushroom_startle"]);
  });

  test("mapId ไม่รู้จัก → []", () => {
    expect(mobTypesForPocket("no-such-map", "whatever")).toEqual([]);
  });

  test("pocketId ไม่รู้จักใน map ที่มีจริง → []", () => {
    expect(mobTypesForPocket("map1", "no-such-pocket")).toEqual([]);
  });
});

describe("BOT_PLAN_EDITOR_COLUMNS / botPlanEditorStackOrder", () => {
  test("ทุก section ปรากฏครั้งเดียว ครบ 8 ตัว", () => {
    const order = botPlanEditorStackOrder();
    const expected: BotPlanEditorSectionId[] = [
      "target",
      "loot",
      "supply",
      "completion",
      "recovery",
      "afk_preview",
      "upsell",
      "workflow",
    ];
    expect(order).toEqual(expected);
    expect(new Set(order).size).toBe(order.length);
  });

  test("คอลัมน์ซ้ายมี target เท่านั้น (พื้นที่+เป้าหมาย)", () => {
    expect(BOT_PLAN_EDITOR_COLUMNS.left).toEqual(["target"]);
  });
});

describe("formatBotStats", () => {
  test("undefined → [] (ไม่มีข้อมูล ห้ามโชว์แถวเปล่า/0 ปลอม)", () => {
    expect(formatBotStats(undefined)).toEqual([]);
  });

  test("มีข้อมูล → 6 แถว ครบทุก key พร้อมป้ายเวลาแบบสั้น", () => {
    const rows = formatBotStats({
      townTrips: 3,
      potionsUsed: 12,
      deaths: 1,
      msFarming: 3_661_000,
      msWalking: 65_000,
      msInTown: 5_000,
    });
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.key)).toEqual(["townTrips", "potionsUsed", "deaths", "msFarming", "msWalking", "msInTown"]);
    expect(rows.find((r) => r.key === "townTrips")?.value).toBe("3");
    expect(rows.find((r) => r.key === "msFarming")?.value).toBe("1 ชม. 1 นาที");
  });
});

describe("BotProfileFormState helpers", () => {
  test("blankBotProfileForm: create mode, map/pocket แรกที่ bot-safe เสมอ", () => {
    const form = blankBotProfileForm();
    expect(form.mode).toBe("create");
    expect(form.name).toBe("");
    expect(form.mapId).toBe("map1");
    expect(form.pocketId).toBe("map1-slime-center");
  });

  test("editBotProfileForm: edit mode คัด field จาก profile", () => {
    const profile: BotProfileWire = {
      id: "p1",
      name: "ฟาร์มเช้า",
      mapId: "map2",
      pocketId: "map2-rat-east",
      rules: defaultBotRules(),
      createdAt: 0,
      updatedAt: 0,
      readOnly: false,
    };
    expect(editBotProfileForm(profile)).toEqual({
      mode: "edit",
      id: "p1",
      name: "ฟาร์มเช้า",
      mapId: "map2",
      pocketId: "map2-rat-east",
      rules: defaultBotRules(),
    });
  });

  test("isBotProfileFormValid: ผ่านเมื่อชื่อ/สกิล/workflow ผ่านหมด", () => {
    const form = blankBotProfileForm();
    expect(isBotProfileFormValid({ ...form, name: "แผน 1" })).toBe(true);
  });

  test("isBotProfileFormValid: ชื่อว่าง → false", () => {
    expect(isBotProfileFormValid(blankBotProfileForm())).toBe(false);
  });

  test("D-074: isBotProfileFormValid ไม่มีเพดานจำนวนกฎอีกแล้ว — สกิลเต็มก็ยังผ่าน", () => {
    const form = blankBotProfileForm();
    const rules = { ...form.rules, skillSlots: [0, 1, 2, 3, 4, 5, 6, 7], potionThresholdPct: 50 };
    expect(isBotProfileFormValid({ ...form, name: "แผน 1", rules })).toBe(true);
  });

  test("isBotProfileFormValid: goal ชนกับ workflow → false", () => {
    const form = blankBotProfileForm();
    const rules = { ...form.rules, goal: { type: "kills" as const, target: 10 }, workflow: addWorkflowStep(undefined, newWorkflowFarmStep("step-1", form.mapId, form.pocketId)) };
    expect(isBotProfileFormValid({ ...form, name: "แผน 1", rules })).toBe(false);
  });
});
