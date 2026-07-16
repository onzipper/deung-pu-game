import { describe, expect, test } from "vitest";
import {
  BOT_ALLOWED_POCKETS,
  BOT_PANEL_ID,
  BOT_TAB_ORDER,
  BOT_TIER_PLANS,
  botActionLabel,
  botMapLabel,
  botOpMessage,
  botOpRejectionLabel,
  botPocketLabel,
  botStopReasonLabel,
  botTierLabel,
  canConfirmBotOp,
  canCreateMoreProfiles,
  countBotRules,
  defaultBotRules,
  formatDurationShort,
  formatEpochMs,
  formatHpPercent,
  formatPassExpiry,
  hasAtLeastOneSkillSlot,
  isBotAllowedPocketClient,
  isValidBotProfileName,
  profileCountLabel,
  reportStopReasonLabel,
  resolveBotOpState,
  resolveBotPurchaseConfirmation,
  ruleCountLabel,
  setBotLootAll,
  toggleBotSkillSlot,
  addWorkflowStep,
  botWorkflowStepLabel,
  formatWorkflowGoal,
  formatWorkflowProgress,
  isValidBotWorkflowClient,
  newWorkflowFarmStep,
  newWorkflowTownStep,
  nextWorkflowStepId,
  removeWorkflowStep,
  setWorkflowFarmGoal,
  type BotOpPhase,
} from "@/ui/panels/bot/bot-view";
import type { BotOpResultMessage, BotTierStateMessage } from "@/shared/net-protocol";
import type { BotWorkflowV1 } from "@/shared/bot-workflow";

describe("BOT_PANEL_ID / BOT_TAB_ORDER", () => {
  test("panel id คงที่", () => {
    expect(BOT_PANEL_ID).toBe("bot");
  });
  test("4 แท็บตาม MVP scope", () => {
    expect(BOT_TAB_ORDER).toEqual(["status", "profiles", "reports", "packages"]);
  });
});

describe("botTierLabel", () => {
  test("free/plus/pro", () => {
    expect(botTierLabel("free")).toBe("Free");
    expect(botTierLabel("plus")).toBe("Plus");
    expect(botTierLabel("pro")).toBe("Pro");
  });
});

describe("formatPassExpiry", () => {
  const nowMs = Date.UTC(2026, 6, 15, 12, 0, 0); // 2026-07-15 12:00 UTC

  test("null → ฟรีตลอดไป", () => {
    expect(formatPassExpiry(null, nowMs)).toBe("ฟรีตลอดไป");
  });

  test("เหลือเยอะ (>24 ชม.) → วันที่เต็ม ไม่มี countdown", () => {
    const expiresAt = nowMs + 10 * 24 * 60 * 60 * 1000; // +10 days
    const label = formatPassExpiry(expiresAt, nowMs);
    expect(label).toContain("25/07/2026");
    expect(label).not.toContain("ชม.");
  });

  test("เหลือ < 24 ชม. → มี countdown ชม.", () => {
    const expiresAt = nowMs + 5 * 60 * 60 * 1000; // +5h
    const label = formatPassExpiry(expiresAt, nowMs);
    expect(label).toContain("เหลืออีก 5 ชม.");
  });

  test("หมดอายุแล้ว → บอกชัดเจน", () => {
    const expiresAt = nowMs - 1000;
    expect(formatPassExpiry(expiresAt, nowMs)).toContain("หมดอายุแล้ว");
  });
});

describe("BOT_TIER_PLANS (D-063 §15 verbatim)", () => {
  test("caps ตรงตามตาราง", () => {
    const free = BOT_TIER_PLANS.find((p) => p.tier === "free")!;
    const plus = BOT_TIER_PLANS.find((p) => p.tier === "plus")!;
    const pro = BOT_TIER_PLANS.find((p) => p.tier === "pro")!;
    expect(free.caps.profiles).toBe(1);
    expect(plus.caps.profiles).toBe(3);
    expect(pro.caps.profiles).toBe(10);
    expect(free.caps.rules).toBe(3);
    expect(plus.caps.rules).toBe(10);
    expect(pro.caps.rules).toBe(25);
    expect(free.passes).toEqual([]);
    expect(plus.passes).toEqual([
      { days: 1, priceThb: 9 },
      { days: 10, priceThb: 39 },
      { days: 30, priceThb: 79 },
    ]);
    expect(pro.passes).toEqual([
      { days: 1, priceThb: 15 },
      { days: 10, priceThb: 69 },
      { days: 30, priceThb: 149 },
    ]);
  });
});

describe("resolveBotPurchaseConfirmation", () => {
  const nowMs = 1_000_000;

  const state = (over: Partial<BotTierStateMessage> = {}): BotTierStateMessage => ({
    tier: "free",
    passExpiresAt: null,
    caps: { profiles: 1, rules: 3, reportRetentionDays: 1, notifications: false, schedules: 0, analytics: false },
    pausedProfileIds: [],
    ...over,
  });

  test("null/Free current → ไม่ต้อง confirm", () => {
    expect(resolveBotPurchaseConfirmation(null, "plus", nowMs).needsConfirm).toBe(false);
    expect(resolveBotPurchaseConfirmation(state(), "plus", nowMs).needsConfirm).toBe(false);
  });

  test("pass หมดอายุแล้ว → ไม่ต้อง confirm", () => {
    const cur = state({ tier: "plus", passExpiresAt: nowMs - 1000 });
    expect(resolveBotPurchaseConfirmation(cur, "pro", nowMs).needsConfirm).toBe(false);
  });

  test("same-tier renew → ไม่ต้อง confirm (§12.6)", () => {
    const cur = state({ tier: "plus", passExpiresAt: nowMs + 10 * DAY_MS() });
    expect(resolveBotPurchaseConfirmation(cur, "plus", nowMs).needsConfirm).toBe(false);
  });

  test("cross-tier overwrite → ต้อง confirm พร้อมจำนวนวันที่จะหาย (§12.5)", () => {
    const cur = state({ tier: "plus", passExpiresAt: nowMs + 10 * DAY_MS() });
    const res = resolveBotPurchaseConfirmation(cur, "pro", nowMs);
    expect(res.needsConfirm).toBe(true);
    expect(res.lostDays).toBe(10);
  });

  function DAY_MS(): number {
    return 24 * 60 * 60 * 1000;
  }
});

describe("botStopReasonLabel / reportStopReasonLabel", () => {
  const compatibilityReasons = [
    "inventory_full",
    "low_hp",
    "death",
    "map_unsafe",
    "rare_found",
    "boss_or_event",
    "secret_trigger",
    "captcha",
  ];

  test("global safety/tier obstacle/item-event reasons มีข้อความไทยทุกตัว ไม่ fallback", () => {
    for (const reason of [...compatibilityReasons, "stuck"]) {
      expect(botStopReasonLabel(reason)).not.toBe("บอทหยุดทำงาน");
    }
    expect(botStopReasonLabel("boss_or_event")).toContain("อีลิต");
  });

  test("manual/profile_deleted/server_restart/expired_readonly มีข้อความเฉพาะ", () => {
    expect(botStopReasonLabel("manual")).toContain("คุณเอง");
    expect(botStopReasonLabel("profile_deleted")).toContain("ถูกลบ");
    expect(botStopReasonLabel("server_restart")).toContain("รีสตาร์ท");
    expect(botStopReasonLabel("expired_readonly")).toContain("อ่านอย่างเดียว");
  });

  test("town_trip_failed (D-069) มีข้อความเฉพาะ ไม่ fallback", () => {
    expect(botStopReasonLabel("town_trip_failed")).toContain("เมือง");
    expect(botStopReasonLabel("town_trip_failed")).not.toBe("บอทหยุดทำงาน");
  });

  test("reason แปลกไม่รู้จัก → fallback", () => {
    expect(botStopReasonLabel("unknown_xyz")).toBe("บอทหยุดทำงาน");
  });

  test("reportStopReasonLabel: null = ยังไม่หยุด", () => {
    expect(reportStopReasonLabel(null)).toContain("กำลังทำงาน");
    expect(reportStopReasonLabel("manual")).toBe(botStopReasonLabel("manual"));
  });
});

describe("botOpRejectionLabel", () => {
  test("รู้จัก reason หลัก ๆ", () => {
    expect(botOpRejectionLabel("profiles_at_cap")).toContain("เพดาน");
    expect(botOpRejectionLabel("already_running")).toContain("ทำงานอยู่แล้ว");
    expect(botOpRejectionLabel("requires_db")).toContain("ไม่พร้อมใช้งาน");
    expect(botOpRejectionLabel("checkpoint_saving")).toContain("บันทึกจุดทำงาน");
    expect(botOpRejectionLabel("checkpoint_failed")).toContain("เริ่มแผนใหม่");
  });
  test("undefined/ไม่รู้จัก → fallback", () => {
    expect(botOpRejectionLabel(undefined)).toBe("ตั้งค่ากฎไม่ถูกต้อง");
    expect(botOpRejectionLabel("something_new")).toBe("ตั้งค่ากฎไม่ถูกต้อง");
  });
});

describe("BotOpPhase state machine", () => {
  test("resolveBotOpState ครบทุก kind", () => {
    expect(resolveBotOpState({ kind: "idle" })).toBe("IDLE");
    expect(resolveBotOpState({ kind: "processing", op: "start" })).toBe("PROCESSING");
    expect(resolveBotOpState({ kind: "timed_out", op: "start" })).toBe("UNKNOWN_RECONCILING");
    const ok: BotOpResultMessage = { op: "start", ok: true };
    const bad: BotOpResultMessage = { op: "start", ok: false, reason: "not_found" };
    expect(resolveBotOpState({ kind: "settled", result: ok })).toBe("SUCCESS");
    expect(resolveBotOpState({ kind: "settled", result: bad })).toBe("REJECTED");
  });

  test("canConfirmBotOp: PROCESSING/UNKNOWN_RECONCILING เท่านั้นที่ false", () => {
    const phases: BotOpPhase[] = [
      { kind: "idle" },
      { kind: "processing", op: "start" },
      { kind: "timed_out", op: "start" },
      { kind: "settled", result: { op: "start", ok: true } },
    ];
    const states = phases.map(resolveBotOpState);
    expect(states.map(canConfirmBotOp)).toEqual([true, false, false, true]);
  });

  test("botOpMessage: REJECTED ใช้ reason label", () => {
    const bad: BotOpResultMessage = { op: "profileCreate", ok: false, reason: "bad_name" };
    expect(botOpMessage("REJECTED", bad)).toBe(botOpRejectionLabel("bad_name"));
  });
});

describe("countBotRules (mirror server/bot/profiles.ts countRules)", () => {
  test("skillSlots.length + potion(0/1) + loot(1 เสมอ)", () => {
    expect(countBotRules({ skillSlots: [0], potionThresholdPct: null, lootAll: true })).toBe(2);
    expect(countBotRules({ skillSlots: [0, 1], potionThresholdPct: 30, lootAll: true })).toBe(4);
    expect(countBotRules({ skillSlots: [], potionThresholdPct: null, lootAll: false })).toBe(1);
  });
  test("PR6b: แต่ละ workflow step นับเป็น 1 rule ด้วย", () => {
    const workflow: BotWorkflowV1 = {
      version: 1,
      steps: [
        { id: "s1", kind: "farm", mapId: "map1", pocketId: "map1-slime-center", goal: { type: "kills", target: 10 }, fallbacks: [] },
        { id: "s2", kind: "town_service" },
      ],
    };
    expect(countBotRules({ skillSlots: [0], potionThresholdPct: null, lootAll: true, workflow })).toBe(4); // 1+0+1+2
  });
});

describe("PR6b งานหลายขั้น helpers", () => {
  test("botOpRejectionLabel รู้จัก 3 reason ใหม่ ไม่ fallback", () => {
    expect(botOpRejectionLabel("workflow_requires_pro")).toContain("Pro");
    expect(botOpRejectionLabel("workflow_map_not_allowed")).toContain("พื้นที่");
    expect(botOpRejectionLabel("workflow_invalid_step")).not.toBe("ตั้งค่ากฎไม่ถูกต้อง");
  });

  test("formatWorkflowGoal: kills/gold/exp ปกติ · durationMs แสดงเป็นนาที", () => {
    expect(formatWorkflowGoal({ type: "kills", target: 50 })).toContain("50");
    expect(formatWorkflowGoal({ type: "durationMs", target: 300000 })).toContain("5 นาที");
  });

  test("formatWorkflowProgress: done/target clamp ไม่ติดลบ", () => {
    expect(formatWorkflowProgress(12, 50)).toBe("12/50");
    expect(formatWorkflowProgress(-3, 50)).toBe("0/50");
  });

  test("botWorkflowStepLabel: farm มี pocket + goal · town เป็นข้อความเดียว · 1-based", () => {
    const farm = newWorkflowFarmStep("s1", "map1", "map1-slime-center");
    expect(botWorkflowStepLabel(farm, 0)).toMatch(/^1\./);
    expect(botWorkflowStepLabel(farm, 0)).toContain("ฟาร์ม");
    expect(botWorkflowStepLabel(newWorkflowTownStep("s2"), 1)).toContain("แวะเมือง");
  });

  test("add/remove/nextId + goal edit + client mirror validation", () => {
    const id1 = nextWorkflowStepId(undefined);
    let wf = addWorkflowStep(undefined, newWorkflowFarmStep(id1, "map1", "map1-slime-center"));
    expect(wf.steps).toHaveLength(1);
    expect(isValidBotWorkflowClient(wf)).toBe(true);

    const id2 = nextWorkflowStepId(wf);
    expect(id2).not.toBe(id1);
    wf = addWorkflowStep(wf, newWorkflowTownStep(id2));
    expect(wf.steps).toHaveLength(2);

    // durationMs goal: UI enters minutes (2) → stored as ms (120000).
    wf = setWorkflowFarmGoal(wf, 0, "durationMs", 2);
    const farm0 = wf.steps[0];
    expect(farm0.kind === "farm" && farm0.goal).toEqual({ type: "durationMs", target: 120000 });

    // removing the last step yields undefined (back to a single-pocket run).
    expect(removeWorkflowStep(wf, 0)!.steps).toHaveLength(1);
    const single = { version: 1 as const, steps: [wf.steps[0]] };
    expect(removeWorkflowStep(single, 0)).toBeUndefined();
  });

  test("client mirror rejects a forbidden pocket (server is truth, this is defense-in-depth)", () => {
    const bad: BotWorkflowV1 = {
      version: 1,
      steps: [{ id: "s1", kind: "farm", mapId: "map1", pocketId: "map1-boss-arena", goal: { type: "kills", target: 5 }, fallbacks: [] }],
    };
    expect(isValidBotWorkflowClient(bad)).toBe(false);
  });
});

describe("ruleCountLabel / profileCountLabel / canCreateMoreProfiles", () => {
  test("รูปแบบ X/Y", () => {
    expect(ruleCountLabel(2, 10)).toBe("ใช้กฎไป 2/10");
    expect(profileCountLabel(1, 3)).toBe("1/3");
  });
  test("canCreateMoreProfiles", () => {
    expect(canCreateMoreProfiles(0, 1)).toBe(true);
    expect(canCreateMoreProfiles(1, 1)).toBe(false);
  });
});

describe("isValidBotProfileName", () => {
  test("ว่าง/เกิน 40 ตัวอักษร → ไม่ถูกต้อง", () => {
    expect(isValidBotProfileName("")).toBe(false);
    expect(isValidBotProfileName("   ")).toBe(false);
    expect(isValidBotProfileName("a".repeat(41))).toBe(false);
  });
  test("ชื่อปกติ → ถูกต้อง", () => {
    expect(isValidBotProfileName("ฟาร์มสไลม์")).toBe(true);
    expect(isValidBotProfileName("a".repeat(40))).toBe(true);
  });
});

describe("bot-allowed pockets (client mirror)", () => {
  test("มีครบ 4 map ตาม server config", () => {
    expect(Object.keys(BOT_ALLOWED_POCKETS)).toEqual(["map1", "map2", "map3", "map4"]);
  });
  test("isBotAllowedPocketClient", () => {
    expect(isBotAllowedPocketClient("map1", "map1-slime-center")).toBe(true);
    expect(isBotAllowedPocketClient("map1", "map1-boss-arena")).toBe(false);
    expect(isBotAllowedPocketClient("map99", "anything")).toBe(false);
  });
  test("botMapLabel/botPocketLabel มีป้ายไทย ไม่ fallback เป็น id ดิบ", () => {
    expect(botMapLabel("map1")).not.toBe("map1");
    expect(botPocketLabel("map1-slime-center")).not.toBe("map1-slime-center");
  });
  test("fallback: id แปลก → คืน id ดิบ", () => {
    expect(botMapLabel("map_x")).toBe("map_x");
    expect(botPocketLabel("pocket_x")).toBe("pocket_x");
  });
});

describe("Rule Builder v1 helpers", () => {
  test("defaultBotRules มีอย่างน้อย 1 skill slot + lootAll true + potion null", () => {
    const r = defaultBotRules();
    expect(hasAtLeastOneSkillSlot(r)).toBe(true);
    expect(r.lootAll).toBe(true);
    expect(r.potionThresholdPct).toBeNull();
  });

  test("toggleBotSkillSlot: เพิ่ม/ลบ + เรียงลำดับ", () => {
    let r = defaultBotRules(); // [0]
    r = toggleBotSkillSlot(r, 2);
    expect(r.skillSlots).toEqual([0, 2]);
    r = toggleBotSkillSlot(r, 0);
    expect(r.skillSlots).toEqual([2]);
  });

  test("setBotLootAll", () => {
    const r = setBotLootAll(defaultBotRules(), false);
    expect(r.lootAll).toBe(false);
  });

  test("hasAtLeastOneSkillSlot: ปิดหมด → false", () => {
    const r = toggleBotSkillSlot(defaultBotRules(), 0); // ปิดตัวเดียวที่มี → []
    expect(r.skillSlots).toEqual([]);
    expect(hasAtLeastOneSkillSlot(r)).toBe(false);
  });
});

describe("Live status formatting", () => {
  test("botActionLabel: รู้จัก 3 action + fallback", () => {
    expect(botActionLabel("moving")).not.toBe("moving");
    expect(botActionLabel("attacking")).not.toBe("attacking");
    expect(botActionLabel("searching")).not.toBe("searching");
    expect(botActionLabel("weird")).toBe("weird");
  });

  test("formatHpPercent clamp 0..1", () => {
    expect(formatHpPercent(0.5)).toBe("50%");
    expect(formatHpPercent(-1)).toBe("0%");
    expect(formatHpPercent(2)).toBe("100%");
  });

  test("formatDurationShort: ชม./นาที/วิ", () => {
    expect(formatDurationShort(0)).toBe("0 วิ");
    expect(formatDurationShort(45_000)).toBe("45 วิ");
    expect(formatDurationShort(90_000)).toBe("1 นาที 30 วิ");
    expect(formatDurationShort(2 * 60 * 60 * 1000 + 5 * 60 * 1000)).toBe("2 ชม. 5 นาที");
  });

  test("formatEpochMs: DD/MM HH:mm (UTC)", () => {
    const ms = Date.UTC(2026, 6, 15, 9, 5, 0);
    expect(formatEpochMs(ms)).toBe("15/07 09:05");
  });
});
