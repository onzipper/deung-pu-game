import { describe, expect, test } from "vitest";
import {
  BOT_ALLOWED_POCKETS,
  BOT_PANEL_ID,
  BOT_TAB_LABELS,
  BOT_TAB_ORDER,
  botActionLabel,
  botMapLabel,
  botOpMessage,
  botOpRejectionLabel,
  botPocketLabel,
  botStopReasonLabel,
  botTierComparisonRows,
  botTierLabel,
  canConfirmBotOp,
  canCreateMoreProfiles,
  defaultBotRules,
  formatDurationShort,
  formatEpochMs,
  formatHpPercent,
  formatPassExpiry,
  hasAtLeastOneSkillSlot,
  isBotAllowedPocketClient,
  isValidBotProfileName,
  passesForTier,
  profileCountLabel,
  reportStopReasonLabel,
  resolveBotOpState,
  resolveBotPurchaseConfirmation,
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
  // PR7
  BOT_CONTINUITY_LABELS,
  BOT_GLOBAL_SAFETY_STOP_REASONS,
  BOT_RESUME_REASSURANCE,
  BOT_RULE_PRESETS,
  BOT_TUTORIAL_SLIDES,
  BOT_WIZARD_STEPS,
  BOT_WIZARD_STEP_LABELS,
  BOT_WORKFLOW_STEP_KIND_LABELS,
  applyBotRulePreset,
  botCheckpointRestartBadge,
  botContinuityLabel,
  botResumeCtaLabel,
  botStatusStateLabel,
  botTierRecoveryLabel,
  createMemoryBotTutorialStore,
  dismissBotTutorial,
  formatWorkflowStepProgress,
  isBotWizardStepValid,
  newWorkflowBranchStep,
  nextBotWizardStep,
  parseStoredBotTutorialState,
  prevBotWizardStep,
  setWorkflowBranchTarget,
  setWorkflowBranchWhen,
  workflowBranchTargetOptions,
  INITIAL_BOT_TUTORIAL_STATE,
  type BotOpPhase,
  // M3
  BOT_COMPLETION_ACTION_LABELS,
  BOT_TAKEOVER_TOAST_MESSAGE,
  afkFlowStepsFor,
  botCompletionActionLabel,
  lockedControlFor,
  mobTypeLabel,
  resolveBotCta,
  setBotCompletionAction,
  setBotGoal,
  setBotPotionReserve,
  setBotPotionRestock,
  setBotPotionThreshold,
  setBotTargetMode,
  shouldShowTakeoverToast,
  toggleSelectedMobType,
  type BotCta,
  type BotCtaInput,
  // M4
  BOT_LOCKED_FEATURE_LABELS,
  BOT_TARGET_MODE_LABELS,
  botCtaButtonLabel,
  botTargetSummaryLabel,
  botTownSkipLabel,
  formatBotGoalProgress,
  hasGoalWorkflowConflict,
  lockedBotFeaturesFor,
  resolveActiveBotProfileId,
  resolveBotCtaAction,
  // fix(bot-hub-connection-state)
  botBusyOpFromPhase,
  botConnectionBannerMessage,
  botOpsAvailable,
} from "@/ui/panels/bot/bot-view";
import type {
  BotCheckpointWire,
  BotOpResultMessage,
  BotProfileWire,
  BotStatusMessage,
  BotTierPlanWire,
  BotTierStateMessage,
} from "@/shared/net-protocol";
import type { BotWorkflowV1 } from "@/shared/bot-workflow";
import { BOT_CONTINUITY_STATES, type BotContinuityStateWire } from "@/shared/bot-continuity";

/** M1: fake plans wire (server config shape) — comparison-rows tests read caps/passes from this, not a hardcoded const. */
const FAKE_BOT_TIER_PLANS: readonly BotTierPlanWire[] = [
  { tier: "free", caps: { profiles: 1, rules: 3, reportRetentionDays: 1, notifications: false, schedules: 0, analytics: false }, passes: [] },
  {
    tier: "plus",
    caps: { profiles: 3, rules: 10, reportRetentionDays: 14, notifications: true, schedules: 0, analytics: false },
    passes: [
      { days: 1, priceThb: 9 },
      { days: 10, priceThb: 39 },
      { days: 30, priceThb: 79 },
    ],
  },
  {
    tier: "pro",
    caps: { profiles: 10, rules: 25, reportRetentionDays: 90, notifications: true, schedules: 0, analytics: true },
    passes: [
      { days: 1, priceThb: 15 },
      { days: 10, priceThb: 69 },
      { days: 30, priceThb: 149 },
    ],
  },
];

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

describe("passesForTier (M1 — plans จาก wire, ไม่ hardcode ราคาแล้ว)", () => {
  test("อ่านราคาตรงตาม plan ที่ส่งมา", () => {
    expect(passesForTier(FAKE_BOT_TIER_PLANS, "free")).toEqual([]);
    expect(passesForTier(FAKE_BOT_TIER_PLANS, "plus")).toEqual([
      { days: 1, priceThb: 9 },
      { days: 10, priceThb: 39 },
      { days: 30, priceThb: 79 },
    ]);
    expect(passesForTier(FAKE_BOT_TIER_PLANS, "pro")).toEqual([
      { days: 1, priceThb: 15 },
      { days: 10, priceThb: 69 },
      { days: 30, priceThb: 149 },
    ]);
  });

  test("tier ที่ไม่มีใน plans (ยังไม่โหลด/hasn't arrived) → []", () => {
    expect(passesForTier([], "plus")).toEqual([]);
  });
});

describe("resolveBotPurchaseConfirmation", () => {
  const nowMs = 1_000_000;

  const state = (over: Partial<BotTierStateMessage> = {}): BotTierStateMessage => ({
    tier: "free",
    passExpiresAt: null,
    caps: { profiles: 1, rules: 3, reportRetentionDays: 1, notifications: false, schedules: 0, analytics: false },
    pausedProfileIds: [],
    plans: [],
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

  test("M1: goal_complete (จบสวย) / town_trip_no_route (รอเจ้าของ) มีข้อความเฉพาะ ไม่ fallback", () => {
    expect(botStopReasonLabel("goal_complete")).toContain("สำเร็จ");
    expect(botStopReasonLabel("town_trip_no_route")).toContain("เมือง");
    expect(botStopReasonLabel("town_trip_no_route")).not.toBe("บอทหยุดทำงาน");
  });

  test("M1: low_hp ยุคใหม่พูดถึงยา (Free มี auto-potion แล้ว ไม่ใช่ “ยังไม่มีระบบโพชั่น”)", () => {
    expect(botStopReasonLabel("low_hp")).toContain("ยา");
    expect(botStopReasonLabel("low_hp")).not.toContain("ยังไม่มีระบบโพชั่น");
  });

  test("D-075: out_of_supplies (ยา/เงินหมด จอดรอที่เมือง) มีข้อความเฉพาะ ไม่ fallback", () => {
    expect(botStopReasonLabel("out_of_supplies")).toContain("เมือง");
    expect(botStopReasonLabel("out_of_supplies")).not.toBe("บอทหยุดทำงาน");
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
    // Fix A: manager.ts `guarded` fail-soft catch → this label, distinct from validation fallback text.
    expect(botOpRejectionLabel("internal_error")).toContain("ระบบขัดข้องชั่วคราว");
  });
  test("undefined/ไม่รู้จัก → fallback", () => {
    expect(botOpRejectionLabel(undefined)).toBe("ตั้งค่ากฎไม่ถูกต้อง");
    expect(botOpRejectionLabel("something_new")).toBe("ตั้งค่ากฎไม่ถูกต้อง");
  });

  test("M1: 11 reason ใหม่ (target mode/selected types/goal/potion dials) ไม่ fallback ทุกตัว", () => {
    const M1_REASONS = [
      "bad_target_mode",
      "target_mode_requires_plus",
      "bad_selected_mob_types",
      "mob_type_not_normal",
      "mob_type_not_in_pocket",
      "goal_requires_plus",
      "bad_goal",
      "goal_conflicts_workflow",
      "bad_completion_action",
      "bad_potion_restock",
      "bad_potion_reserve",
    ];
    for (const reason of M1_REASONS) {
      expect(botOpRejectionLabel(reason), reason).not.toBe("ตั้งค่ากฎไม่ถูกต้อง");
    }
    expect(botOpRejectionLabel("target_mode_requires_plus")).toContain("Plus");
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

describe("M3 §1 resolveBotCta — CTA เหลือปุ่มเดียว เริ่มบอท/หยุดบอท", () => {
  function statusFixture(state: BotContinuityStateWire): BotStatusMessage {
    return {
      profileId: "p1",
      sessionId: "s1",
      mapId: "map1",
      pocketId: "map1-slime-center",
      continuity: { state, revision: 1, enteredAt: 0, interruptedState: null },
      action: "searching",
      killCount: 0,
      goldEarned: 0,
      expEarned: 0,
      hpFraction: 1,
      uptimeMs: 0,
    };
  }

  function checkpointFixture(state: "saving" | "ready" | "failed"): BotCheckpointWire {
    return {
      id: "cp1",
      profileId: "p1",
      sourceSessionId: "s1",
      mapId: "map1",
      pocketId: "map1-slime-center",
      savedAt: 0,
      state,
      continuity: { state: "PAUSED", revision: 1, enteredAt: 0, interruptedState: null },
    };
  }

  function ctaInput(over: Partial<BotCtaInput> = {}): BotCtaInput {
    return {
      authorityActive: false,
      status: null,
      checkpoint: null,
      opState: "IDLE",
      hasStartableProfile: true,
      selectedProfileReadOnly: false,
      ...over,
    };
  }

  function cta(over: Partial<BotCtaInput> = {}): BotCta {
    return resolveBotCta(ctaInput(over));
  }

  test("ไม่มี run เลย (idle) → เริ่มบอท", () => {
    const c = cta();
    expect(c.kind).toBe("start");
    expect(c.label).toBe("เริ่มบอท");
    expect(c.enabled).toBe(true);
    expect(c.disabledReason).toBeNull();
  });

  test("authorityActive=true → หยุดบอท เสมอ (ไม่ต้องมี status)", () => {
    const c = cta({ authorityActive: true });
    expect(c.kind).toBe("stop");
    expect(c.label).toBe("หยุดบอท");
    expect(c.enabled).toBe(true);
  });

  test("status !== null ครอบทุก continuity ที่กำลังรัน (WORKING/COMBAT/town-trip/RECOVERING) → หยุดบอท", () => {
    const runningStates: BotContinuityStateWire[] = [
      "WORKING",
      "COMBAT",
      "TRAVELING",
      "RETURNING_TO_TOWN",
      "SELLING",
      "DEPOSITING",
      "RESTOCKING",
      "RETURNING_TO_WORK",
      "RECOVERING",
      "LOOTING",
    ];
    for (const state of runningStates) {
      const c = cta({ status: statusFixture(state) });
      expect(c.kind, state).toBe("stop");
      expect(c.label, state).toBe("หยุดบอท");
    }
  });

  test("COMPLETED/FAILED/WAITING_FOR_OWNER เกิดเฉพาะใน bot:stopped (server) → client เคลียร์ status เป็น null แล้ว → เริ่มบอท", () => {
    // continuity เหล่านี้เป็น terminal (server/bot/continuity.ts isTerminal + policy.ts settlementForStoppedPlan) —
    // ปรากฏเฉพาะใน BotStoppedMessage.continuity ไม่ใช่ BotStatusMessage; game-store.ts เคลียร์ botStatus=null ทันที
    // ที่ได้ bot:stopped (setBotStopped) ดังนั้น resolver เห็น status=null เสมอในเคสนี้.
    const c = cta({ status: null, authorityActive: false });
    expect(c.kind).toBe("start");
    expect(c.label).toBe("เริ่มบอท");
  });

  test("checkpoint ready → isResume=true + helperText", () => {
    const c = cta({ checkpoint: checkpointFixture("ready") });
    expect(c.kind).toBe("start");
    expect(c.isResume).toBe(true);
    expect(c.helperText).toBe("จะทำต่อจากจุดที่บันทึกไว้");
    expect(c.enabled).toBe(true);
  });

  test("checkpoint saving → start disabled พร้อมเหตุผล", () => {
    const c = cta({ checkpoint: checkpointFixture("saving") });
    expect(c.kind).toBe("start");
    expect(c.enabled).toBe(false);
    expect(c.disabledReason).toContain("บันทึกจุดทำงาน");
  });

  test("checkpoint failed → ไม่ resume, ไม่ disable (แค่ checkpoint ใช้ไม่ได้ ไม่ใช่ปัญหา start ใหม่)", () => {
    const c = cta({ checkpoint: checkpointFixture("failed") });
    expect(c.isResume).toBe(false);
    expect(c.enabled).toBe(true);
  });

  test("opState PROCESSING/UNKNOWN_RECONCILING → disabled ทั้ง start และ stop", () => {
    expect(cta({ opState: "PROCESSING" }).enabled).toBe(false);
    expect(cta({ opState: "UNKNOWN_RECONCILING" }).enabled).toBe(false);
    expect(cta({ authorityActive: true, opState: "PROCESSING" }).enabled).toBe(false);
    expect(cta({ authorityActive: true, opState: "UNKNOWN_RECONCILING" }).enabled).toBe(false);
  });

  test("!hasStartableProfile → start disabled “ยังไม่มีแผน — สร้างแผนก่อน”", () => {
    const c = cta({ hasStartableProfile: false });
    expect(c.enabled).toBe(false);
    expect(c.disabledReason).toBe("ยังไม่มีแผน — สร้างแผนก่อน");
  });

  test("selectedProfileReadOnly → start disabled ด้วยป้าย “ถูกพัก” เดียวกับ botOpRejectionLabel(profile_readonly)", () => {
    const c = cta({ selectedProfileReadOnly: true });
    expect(c.enabled).toBe(false);
    expect(c.disabledReason).toBe(botOpRejectionLabel("profile_readonly"));
    expect(c.disabledReason).toContain("ถูกพัก");
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

describe("profileCountLabel / canCreateMoreProfiles", () => {
  test("รูปแบบ X/Y", () => {
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
  test("defaultBotRules: อย่างน้อย 1 skill slot + lootAll true + potion 30% (M1, เปิดใช้เป็นค่าเริ่มต้น) + ALL_IN_AREA", () => {
    const r = defaultBotRules();
    expect(hasAtLeastOneSkillSlot(r)).toBe(true);
    expect(r.lootAll).toBe(true);
    expect(r.potionThresholdPct).toBe(30);
    expect(r.targetMode).toBe("ALL_IN_AREA");
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

describe("PR7 continuity — authority for status display (14 states)", () => {
  test("ครบทุก state ตาม src/shared/bot-continuity.ts มีป้ายไทย ไม่ซ้ำ", () => {
    for (const state of BOT_CONTINUITY_STATES) {
      expect(BOT_CONTINUITY_LABELS[state]).toBeTruthy();
      expect(botContinuityLabel(state)).toBe(BOT_CONTINUITY_LABELS[state]);
    }
    expect(BOT_CONTINUITY_STATES.length).toBe(14);
  });

  test("botStatusStateLabel: มี continuity → ใช้ continuity เสมอ (ไม่ใช้ action)", () => {
    expect(botStatusStateLabel({ state: "COMBAT" }, "moving")).toBe(botContinuityLabel("COMBAT"));
    expect(botStatusStateLabel({ state: "WAITING_FOR_OWNER" }, "attacking")).toBe(
      botContinuityLabel("WAITING_FOR_OWNER"),
    );
  });

  test("botStatusStateLabel: ไม่มี continuity → fallback เป็น action", () => {
    expect(botStatusStateLabel(null, "moving")).toBe(botActionLabel("moving"));
    expect(botStatusStateLabel(undefined, "weird")).toBe("weird");
  });
});

describe("PR7 §3 resume CTA — แยกตาม checkpoint.kind", () => {
  test("takeover/undefined → “ทำต่อจากที่ค้าง” · restart → ป้ายเฉพาะรีสตาร์ท", () => {
    expect(botResumeCtaLabel("takeover")).toBe("ทำต่อจากที่ค้าง");
    expect(botResumeCtaLabel(undefined)).toBe("ทำต่อจากที่ค้าง");
    expect(botResumeCtaLabel("running")).toBe("ทำต่อจากที่ค้าง");
    expect(botResumeCtaLabel("restart")).toContain("รีสตาร์ท");
  });

  test("botCheckpointRestartBadge: มีเฉพาะ restart, ตัวอื่น null", () => {
    expect(botCheckpointRestartBadge("restart")).not.toBeNull();
    expect(botCheckpointRestartBadge("takeover")).toBeNull();
    expect(botCheckpointRestartBadge(undefined)).toBeNull();
  });

  test("BOT_RESUME_REASSURANCE: ข้อความ reassure ผลฟาร์มไม่หาย", () => {
    expect(BOT_RESUME_REASSURANCE).toContain("ไม่หาย");
  });
});

describe("PR7 §4 workflow progress + branch editor", () => {
  test("formatWorkflowStepProgress: farm มีเป้า · town/branch ไม่มีเป้า", () => {
    const farm = formatWorkflowStepProgress({ stepIndex: 1, stepCount: 4, stepKind: "farm", goalDone: 12, goalTarget: 50 });
    expect(farm).toContain("ขั้น 2/4");
    expect(farm).toContain(BOT_WORKFLOW_STEP_KIND_LABELS.farm);
    expect(farm).toContain("12/50");

    const town = formatWorkflowStepProgress({ stepIndex: 2, stepCount: 4, stepKind: "town_service", goalDone: 0, goalTarget: 0 });
    expect(town).toContain("ขั้น 3/4");
    expect(town).toContain(BOT_WORKFLOW_STEP_KIND_LABELS.town_service);
    expect(town).not.toContain("เป้า");
  });

  test("newWorkflowBranchStep + workflowBranchTargetOptions (ไม่รวมตัวเอง)", () => {
    const farm = newWorkflowFarmStep("step-1", "map1", "map1-slime-center");
    const town = newWorkflowTownStep("step-2");
    const branch = newWorkflowBranchStep("step-3", { type: "kills", target: 30 }, "step-1", "step-2");
    const wf: BotWorkflowV1 = { version: 1, steps: [farm, town, branch] };

    expect(isValidBotWorkflowClient(wf)).toBe(true);

    const options = workflowBranchTargetOptions(wf, 2);
    expect(options.map((o) => o.id)).toEqual(["step-1", "step-2"]);
    expect(options.some((o) => o.id === "step-3")).toBe(false);
  });

  test("setWorkflowBranchWhen/setWorkflowBranchTarget: แก้เฉพาะ branch step ที่ index ตรง", () => {
    const farm = newWorkflowFarmStep("step-1", "map1", "map1-slime-center");
    const town = newWorkflowTownStep("step-2");
    let wf: BotWorkflowV1 = { version: 1, steps: [farm, town, newWorkflowBranchStep("step-3", { type: "kills", target: 1 }, "step-1", "step-1")] };

    wf = setWorkflowBranchWhen(wf, 2, "gold", 100);
    const branchStep = wf.steps[2];
    expect(branchStep.kind === "branch" && branchStep.when).toEqual({ type: "gold", target: 100 });

    wf = setWorkflowBranchTarget(wf, 2, "else", "step-2");
    const branchStep2 = wf.steps[2];
    expect(branchStep2.kind === "branch" && branchStep2.elseStepId).toBe("step-2");
    expect(branchStep2.kind === "branch" && branchStep2.thenStepId).toBe("step-1"); // then ไม่ถูกแตะ
  });
});

describe("PR7 §5 setup wizard (สร้างแผนใหม่)", () => {
  test("ลำดับล็อค: map → pocket → preset → rules → stop_policy", () => {
    expect(BOT_WIZARD_STEPS).toEqual(["map", "pocket", "preset", "rules", "stop_policy"]);
    for (const step of BOT_WIZARD_STEPS) expect(BOT_WIZARD_STEP_LABELS[step]).toBeTruthy();
  });

  test("next/prevBotWizardStep: เดินหน้า/ถอยหลังตามลำดับ, null ที่ปลายทาง", () => {
    expect(prevBotWizardStep("map")).toBeNull();
    expect(nextBotWizardStep("map")).toBe("pocket");
    expect(nextBotWizardStep("stop_policy")).toBeNull();
    expect(prevBotWizardStep("stop_policy")).toBe("rules");
  });

  test("isBotWizardStepValid: gate ตามขั้น (pocket ต้อง allow-list, rules ต้องมีสกิล, stop_policy ต้องชื่อถูก)", () => {
    const base = { name: "ฟาร์มสไลม์", mapId: "map1", pocketId: "map1-slime-center", rules: defaultBotRules() };
    expect(isBotWizardStepValid("map", base)).toBe(true);
    expect(isBotWizardStepValid("pocket", base)).toBe(true);
    expect(isBotWizardStepValid("pocket", { ...base, pocketId: "map1-boss-arena" })).toBe(false);
    expect(isBotWizardStepValid("rules", base)).toBe(true);
    expect(isBotWizardStepValid("rules", { ...base, rules: { skillSlots: [], potionThresholdPct: null, lootAll: true } })).toBe(false);
    expect(isBotWizardStepValid("stop_policy", base)).toBe(true);
    expect(isBotWizardStepValid("stop_policy", { ...base, name: "" })).toBe(false);
  });
});

describe("PR7 §5 rule presets", () => {
  test("มีอย่างน้อย 1 preset, apply แล้วยังผ่าน hasAtLeastOneSkillSlot", () => {
    expect(BOT_RULE_PRESETS.length).toBeGreaterThan(0);
    for (const preset of BOT_RULE_PRESETS) {
      const applied = applyBotRulePreset(defaultBotRules(), preset.id);
      expect(hasAtLeastOneSkillSlot(applied)).toBe(true);
    }
  });

  test("applyBotRulePreset: preset id ไม่รู้จัก → คืน rules เดิม", () => {
    const rules = defaultBotRules();
    expect(applyBotRulePreset(rules, "no_such_preset")).toEqual(rules);
  });
});

describe("PR7 §5 นโยบายหยุด (informational)", () => {
  test("BOT_GLOBAL_SAFETY_STOP_REASONS ครบตามเหตุผลหยุด global (ไม่รวม manual/profile_deleted/server_restart)", () => {
    expect(BOT_GLOBAL_SAFETY_STOP_REASONS).toContain("boss_or_event");
    expect(BOT_GLOBAL_SAFETY_STOP_REASONS).toContain("low_hp");
    expect(BOT_GLOBAL_SAFETY_STOP_REASONS).not.toContain("manual");
  });

  test("botTierRecoveryLabel: ทุก tier มีข้อความเฉพาะ", () => {
    expect(botTierRecoveryLabel("free")).toContain("Free");
    expect(botTierRecoveryLabel("plus")).toContain("Plus");
    expect(botTierRecoveryLabel("pro")).toContain("Pro");
  });

  test("M1: botTierRecoveryLabel(free) พูดถึงยา/เข้าเมืองเอง ไม่ใช่หยุดทันที", () => {
    const free = botTierRecoveryLabel("free");
    expect(free).toContain("ยา");
    expect(free).toContain("เข้าเมือง");
  });
});

describe("M3 §4 editor helpers (target mode / selected mob types / goal / potion dials) — immutable", () => {
  test("setBotTargetMode: → ALL_IN_AREA เคลียร์ selectedMobTypes; → SELECTED_TYPES ไม่แตะ rest; ไม่แก้ object เดิม", () => {
    const base = { ...defaultBotRules(), targetMode: "SELECTED_TYPES" as const, selectedMobTypes: ["slime"] };
    const toAll = setBotTargetMode(base, "ALL_IN_AREA");
    expect(toAll.targetMode).toBe("ALL_IN_AREA");
    expect(toAll.selectedMobTypes).toBeUndefined();
    expect(base.selectedMobTypes).toEqual(["slime"]); // original untouched

    const toSelected = setBotTargetMode(defaultBotRules(), "SELECTED_TYPES");
    expect(toSelected.targetMode).toBe("SELECTED_TYPES");
  });

  test("toggleSelectedMobType: เพิ่ม/ลบ ไม่แก้ array เดิม", () => {
    const base = defaultBotRules();
    const withSlime = toggleSelectedMobType(base, "slime");
    expect(withSlime.selectedMobTypes).toEqual(["slime"]);
    expect(base.selectedMobTypes).toBeUndefined();

    const withBoth = toggleSelectedMobType(withSlime, "bird");
    expect(withBoth.selectedMobTypes).toEqual(["slime", "bird"]);

    const removed = toggleSelectedMobType(withBoth, "slime");
    expect(removed.selectedMobTypes).toEqual(["bird"]);
  });

  test("setBotGoal: null ลบทั้ง goal และ completionAction", () => {
    const withGoal = setBotGoal(defaultBotRules(), { type: "kills", target: 50 });
    const withAction = setBotCompletionAction(withGoal, "town_stop");
    expect(withAction.goal).toEqual({ type: "kills", target: 50 });
    expect(withAction.completionAction).toBe("town_stop");

    const cleared = setBotGoal(withAction, null);
    expect(cleared.goal).toBeUndefined();
    expect(cleared.completionAction).toBeUndefined();
  });

  test("setBotPotionThreshold/Restock/Reserve: number/null immutable", () => {
    const r1 = setBotPotionThreshold(defaultBotRules(), null);
    expect(r1.potionThresholdPct).toBeNull();
    const r2 = setBotPotionRestock(defaultBotRules(), 5);
    expect(r2.potionRestockTarget).toBe(5);
    const r3 = setBotPotionReserve(defaultBotRules(), 2);
    expect(r3.potionLowReserve).toBe(2);
  });

  test("BOT_COMPLETION_ACTION_LABELS / botCompletionActionLabel ครบ 4 action", () => {
    expect(botCompletionActionLabel("safe_stop")).toBe(BOT_COMPLETION_ACTION_LABELS.safe_stop);
    expect(botCompletionActionLabel("notify_continue")).toBeTruthy();
    expect(botCompletionActionLabel("town_stop")).toBeTruthy();
    expect(botCompletionActionLabel("town_continue")).toBeTruthy();
  });

  test("mobTypeLabel: reuse name-catalog ไทย + fallback raw id เมื่อไม่พบ", () => {
    expect(mobTypeLabel("slime")).toBe("สไลม์เมือกดึ๋ง");
    expect(mobTypeLabel("not_a_real_mob")).toBe("not_a_real_mob");
  });
});

describe("M3 §4 lockedControlFor — Plus/Pro gate", () => {
  test("selected_types/goal/warp_town ต้อง Plus ขึ้นไป · workflow ต้อง Pro", () => {
    for (const feature of ["selected_types", "goal", "warp_town"] as const) {
      expect(lockedControlFor("free", feature)).toEqual({ locked: true, requiredTierLabel: "Plus" });
      expect(lockedControlFor("plus", feature)).toEqual({ locked: false, requiredTierLabel: null });
      expect(lockedControlFor("pro", feature)).toEqual({ locked: false, requiredTierLabel: null });
    }
    expect(lockedControlFor("free", "workflow")).toEqual({ locked: true, requiredTierLabel: "Pro" });
    expect(lockedControlFor("plus", "workflow")).toEqual({ locked: true, requiredTierLabel: "Pro" });
    expect(lockedControlFor("pro", "workflow")).toEqual({ locked: false, requiredTierLabel: null });
  });
});

describe("M3 §5 afkFlowStepsFor — AFK flow preview ต่อ tier (presentation-only)", () => {
  test("Free: ไม่มี “วาร์ป”, มี “เดินเข้าเมือง”/“เดินกลับ”", () => {
    const steps = afkFlowStepsFor("free", defaultBotRules()).map((s) => s.label);
    expect(steps.some((l) => l.includes("วาร์ป"))).toBe(false);
    expect(steps.some((l) => l.includes("เดินเข้าเมือง"))).toBe(true);
    expect(steps.some((l) => l === "เดินกลับ")).toBe(true);
  });

  test("Plus: มี “วาร์ป” + “ฟื้นหลังตาย” · SELECTED_TYPES → ค้นหาเฉพาะมอนที่เลือก", () => {
    const allInArea = afkFlowStepsFor("plus", defaultBotRules()).map((s) => s.label);
    expect(allInArea.some((l) => l.includes("วาร์ป"))).toBe(true);
    expect(allInArea.some((l) => l === "ฟื้นหลังตาย")).toBe(true);
    expect(allInArea[0]).toBe("ค้นหามอน");

    const selected = setBotTargetMode(defaultBotRules(), "SELECTED_TYPES");
    const selectedSteps = afkFlowStepsFor("plus", selected).map((s) => s.label);
    expect(selectedSteps[0]).toContain("เฉพาะมอนที่เลือก");
  });

  test("Plus + goal → มี step ครบเป้า→action", () => {
    const rules = setBotCompletionAction(setBotGoal(defaultBotRules(), { type: "kills", target: 50 }), "town_stop");
    const steps = afkFlowStepsFor("plus", rules).map((s) => s.label);
    expect(steps.some((l) => l.includes("ครบเป้า"))).toBe(true);
    expect(steps.some((l) => l.includes(botCompletionActionLabel("town_stop")))).toBe(true);
  });

  test("Pro: 5 step แบบ generic (ทำ step ปัจจุบัน→ประเมิน→town/เปลี่ยนพื้นที่→ถัดไป/branch/loop→จบ/รอเจ้าของ)", () => {
    const steps = afkFlowStepsFor("pro", defaultBotRules());
    expect(steps.length).toBe(5);
    expect(steps.map((s) => s.key)).toEqual(["current_step", "evaluate", "town_or_map", "advance", "end"]);
  });

  test("ปิด auto-potion (potionThresholdPct=null) → ไม่มี step ดื่มยา", () => {
    const noPotion = setBotPotionThreshold(defaultBotRules(), null);
    const steps = afkFlowStepsFor("free", noPotion).map((s) => s.key);
    expect(steps).not.toContain("drink");
  });

  test("D-075: ปิด auto-potion ด้วย sentinel 0 → ไม่มี step ดื่มยา (0 = ปิด เหมือน null); >0 → มี", () => {
    const off = setBotPotionThreshold(defaultBotRules(), 0);
    expect(afkFlowStepsFor("free", off).map((s) => s.key)).not.toContain("drink");
    const on = setBotPotionThreshold(defaultBotRules(), 30);
    expect(afkFlowStepsFor("free", on).map((s) => s.key)).toContain("drink");
  });
});

describe("M3 §6 takeover toast", () => {
  test("BOT_TAKEOVER_TOAST_MESSAGE: ข้อความคงที่", () => {
    expect(BOT_TAKEOVER_TOAST_MESSAGE).toBe("คุณกลับมาควบคุมตัวละครแล้ว");
  });

  test("shouldShowTakeoverToast: true→false เท่านั้นที่ true", () => {
    expect(shouldShowTakeoverToast(true, false)).toBe(true);
    expect(shouldShowTakeoverToast(false, true)).toBe(false);
    expect(shouldShowTakeoverToast(false, false)).toBe(false);
    expect(shouldShowTakeoverToast(true, true)).toBe(false);
  });
});

describe("M3 §2 แพ็กเกจ — comparison rows จาก plans wire", () => {
  test("ไม่มีแถว/ช่องไหนพูดถึง schedule/ตารางเวลา (D-072, ครอบทั้ง label และทุก cell)", () => {
    const rows = botTierComparisonRows(FAKE_BOT_TIER_PLANS);
    for (const row of rows) {
      expect(row.label.toLowerCase()).not.toContain("schedule");
      expect(row.label).not.toContain("ตารางเวลา");
      for (const tier of ["free", "plus", "pro"] as const) {
        expect(row.values[tier].toLowerCase()).not.toContain("schedule");
        expect(row.values[tier]).not.toContain("ตารางเวลา");
      }
    }
  });

  test("แถวสุดท้าย “พลังต่อสู้และรางวัล” = เท่ากันทุกแพ็กเกจ ทั้งสามช่อง", () => {
    const rows = botTierComparisonRows(FAKE_BOT_TIER_PLANS);
    const last = rows[rows.length - 1];
    expect(last.label).toBe("พลังต่อสู้และรางวัล");
    expect(last.values.free).toBe("เท่ากันทุกแพ็กเกจ");
    expect(last.values.plus).toBe("เท่ากันทุกแพ็กเกจ");
    expect(last.values.pro).toBe("เท่ากันทุกแพ็กเกจ");
  });

  test("Free สื่อว่าใช้งานได้จริง (ตีในพื้นที่/เก็บของ/ใช้ยา/เดินเข้าเมือง ✓) — ไม่มีเลือกชนิดมอน/วาร์ป/death recovery/goal/workflow/resume", () => {
    const rows = botTierComparisonRows(FAKE_BOT_TIER_PLANS);
    const byLabel = (label: string) => rows.find((r) => r.label === label)!;
    expect(byLabel("ตีมอนในพื้นที่").values.free).toBe("✓");
    expect(byLabel("เก็บของ").values.free).toBe("✓");
    expect(byLabel("ใช้ยาอัตโนมัติ").values.free).toBe("✓");
    expect(byLabel("เดินเข้าเมือง (ขาย/ฝาก/ซื้อยา)").values.free).toBe("✓");
    expect(byLabel("เลือกชนิดมอน").values.free).toBe("—");
    expect(byLabel("วาร์ปเข้าเมือง").values.free).toBe("—");
    expect(byLabel("Death recovery").values.free).toBe("—");
    expect(byLabel("เป้าหมายเดี่ยว + action เมื่อครบเป้า").values.free).toBe("—");
    expect(byLabel("Workflow หลายขั้น + เงื่อนไข").values.free).toBe("—");
    expect(byLabel("Resume หลัง restart").values.free).toBe("—");
  });

  test("caps rows (จำนวนแผน/เก็บรายงานย้อนหลัง/รายงานเชิงลึก) อ่านจาก plans wire จริง", () => {
    const rows = botTierComparisonRows(FAKE_BOT_TIER_PLANS);
    const byLabel = (label: string) => rows.find((r) => r.label === label)!;
    expect(byLabel("จำนวนแผน").values).toEqual({ free: "1", plus: "3", pro: "10" });
    expect(byLabel("เก็บรายงานย้อนหลัง").values).toEqual({ free: "1 วัน", plus: "14 วัน", pro: "90 วัน" });
    expect(byLabel("รายงานเชิงลึก").values).toEqual({ free: "—", plus: "—", pro: "✓" });
  });

  test("plan หายไปจาก wire (ยังไม่โหลด) → caps row fallback เป็น “—” ไม่พัง", () => {
    const rows = botTierComparisonRows([]);
    const byLabel = (label: string) => rows.find((r) => r.label === label)!;
    expect(byLabel("จำนวนแผน").values).toEqual({ free: "—", plus: "—", pro: "—" });
  });
});

describe("PR7 §7 micro-tutorial ครั้งแรก", () => {
  test("5-7 ข้อความ ทุกอันมี title+body", () => {
    expect(BOT_TUTORIAL_SLIDES.length).toBeGreaterThanOrEqual(5);
    expect(BOT_TUTORIAL_SLIDES.length).toBeLessThanOrEqual(7);
    for (const slide of BOT_TUTORIAL_SLIDES) {
      expect(slide.title).toBeTruthy();
      expect(slide.body).toBeTruthy();
    }
  });

  test("dismissBotTutorial + memory store: round-trip persist", () => {
    const store = createMemoryBotTutorialStore();
    expect(store.load()).toEqual(INITIAL_BOT_TUTORIAL_STATE);
    const next = dismissBotTutorial(store.load());
    store.save(next);
    expect(store.load().dismissed).toBe(true);
  });

  test("parseStoredBotTutorialState: corrupt/ผิดรูปแบบ → fallback ค่าเริ่มต้น", () => {
    expect(parseStoredBotTutorialState(null)).toEqual(INITIAL_BOT_TUTORIAL_STATE);
    expect(parseStoredBotTutorialState({ dismissed: "yes" })).toEqual(INITIAL_BOT_TUTORIAL_STATE);
    expect(parseStoredBotTutorialState({ dismissed: true })).toEqual({ dismissed: true });
  });
});

describe("PR7 terminology — ไม่มีคำว่า “โปรไฟล์” โดดๆ ใน copy หลัก (แทนด้วย “แผน/แผนงาน”)", () => {
  test("BOT_TAB_LABELS ไม่มี “โปรไฟล์”", () => {
    for (const label of Object.values(BOT_TAB_LABELS)) {
      expect(label).not.toContain("โปรไฟล์");
    }
    expect(BOT_TAB_LABELS.profiles).toContain("แผน");
  });

  test("botOpRejectionLabel / botStopReasonLabel ไม่มี “โปรไฟล์” เหลืออยู่", () => {
    const rejectionReasons = [
      "not_found",
      "profiles_at_cap",
      "profile_readonly",
      "rules_over_cap",
      "already_running",
      "workflow_requires_pro",
    ];
    for (const reason of rejectionReasons) {
      expect(botOpRejectionLabel(reason)).not.toContain("โปรไฟล์");
    }
    expect(botStopReasonLabel("expired_readonly")).not.toContain("โปรไฟล์");
  });

  test("botTierComparisonRows ไม่มี “โปรไฟล์” ในป้าย", () => {
    for (const row of botTierComparisonRows(FAKE_BOT_TIER_PLANS)) {
      expect(row.label).not.toContain("โปรไฟล์");
    }
  });
});

describe("M3 product decision — copy guard: ห้ามคำต้องห้ามใน user-facing copy ทุก surface", () => {
  // owner brief 2026-07-17: CTA เหลือปุ่มเดียว "เริ่มบอท"/"หยุดบอท" — ห้ามคำ "รับช่วงต่อ"/"มอบการควบคุม"/
  // "หยุดแผน"/"Schedule"/"ตารางเวลา" ปรากฏใน copy ที่ resolver/label export คืนออกไปให้ผู้เล่นเห็น (ไม่รวม
  // BotPanel.tsx — ตัว panel ยังถูกรื้อใหม่ใน milestone ถัดไป ตามบรีฟ).
  const FORBIDDEN = /รับช่วงต่อ|มอบการควบคุม|หยุดแผน|schedule|ตารางเวลา/i;

  function assertClean(label: string, value: string): void {
    expect(value, `${label}: "${value}"`).not.toMatch(FORBIDDEN);
  }

  test("tab labels", () => {
    for (const [k, v] of Object.entries(BOT_TAB_LABELS)) assertClean(`tab:${k}`, v);
  });

  test("continuity labels (14 states)", () => {
    for (const [k, v] of Object.entries(BOT_CONTINUITY_LABELS)) assertClean(`continuity:${k}`, v);
  });

  test("stop reason labels ทุก reason ที่รู้จัก (compat + M1 ใหม่)", () => {
    const reasons = [
      "inventory_full",
      "low_hp",
      "death",
      "map_unsafe",
      "stuck",
      "rare_found",
      "boss_or_event",
      "secret_trigger",
      "captcha",
      "manual",
      "profile_deleted",
      "server_restart",
      "expired_readonly",
      "town_trip_failed",
      "town_trip_no_route",
      "goal_complete",
      "out_of_supplies", // D-075
    ];
    for (const r of reasons) assertClean(`stop:${r}`, botStopReasonLabel(r));
  });

  test("rejection labels ทุก code ที่รู้จัก (รวม 11 ใหม่)", () => {
    const codes = [
      "requires_db",
      "bad_name",
      "pocket_not_allowed",
      "profiles_at_cap",
      "rules_over_cap",
      "not_found",
      "profile_readonly",
      "no_character",
      "already_running",
      "at_capacity",
      "no_room",
      "db_error",
      "spawn_failed",
      "not_running",
      "checkpoint_saving",
      "checkpoint_not_found",
      "checkpoint_failed",
      "checkpoint_character_mismatch",
      "actor_mismatch",
      "checkpoint_requires_pro",
      "free_not_purchasable",
      "unknown_tier",
      "unknown_pass_duration",
      "workflow_requires_pro",
      "workflow_map_not_allowed",
      "workflow_invalid_step",
      "bad_target_mode",
      "target_mode_requires_plus",
      "bad_selected_mob_types",
      "mob_type_not_normal",
      "mob_type_not_in_pocket",
      "goal_requires_plus",
      "bad_goal",
      "goal_conflicts_workflow",
      "bad_completion_action",
      "bad_potion_restock",
      "bad_potion_reserve",
      "internal_error",
    ];
    for (const c of codes) assertClean(`reject:${c}`, botOpRejectionLabel(c));
  });

  test("tutorial slides (title + body)", () => {
    for (const slide of BOT_TUTORIAL_SLIDES) {
      assertClean(`tutorial.title:${slide.title}`, slide.title);
      assertClean(`tutorial.body:${slide.title}`, slide.body);
    }
  });

  test("completion action labels", () => {
    for (const action of ["safe_stop", "notify_continue", "town_stop", "town_continue"] as const) {
      assertClean(`completion:${action}`, botCompletionActionLabel(action));
    }
  });

  test("AFK flow steps ทุก tier (ทั้ง ALL_IN_AREA และ SELECTED_TYPES)", () => {
    const withSelected = setBotTargetMode(defaultBotRules(), "SELECTED_TYPES");
    const withGoal = setBotCompletionAction(setBotGoal(defaultBotRules(), { type: "kills", target: 10 }), "town_continue");
    for (const tier of ["free", "plus", "pro"] as const) {
      for (const rules of [defaultBotRules(), withSelected, withGoal]) {
        for (const step of afkFlowStepsFor(tier, rules)) assertClean(`afk:${tier}:${step.key}`, step.label);
      }
    }
  });

  test("CTA labels + disabled reasons + helper text (ทุกสาขาของ resolveBotCta)", () => {
    const base: BotCtaInput = {
      authorityActive: false,
      status: null,
      checkpoint: null,
      opState: "IDLE",
      hasStartableProfile: true,
      selectedProfileReadOnly: false,
    };
    const scenarios: BotCtaInput[] = [
      base,
      { ...base, authorityActive: true },
      { ...base, checkpoint: { id: "c", profileId: "p", sourceSessionId: "s", mapId: "map1", pocketId: "map1-slime-center", savedAt: 0, state: "ready", continuity: { state: "PAUSED", revision: 1, enteredAt: 0, interruptedState: null } } },
      { ...base, checkpoint: { id: "c", profileId: "p", sourceSessionId: "s", mapId: "map1", pocketId: "map1-slime-center", savedAt: 0, state: "saving", continuity: { state: "PAUSED", revision: 1, enteredAt: 0, interruptedState: null } } },
      { ...base, opState: "PROCESSING" },
      { ...base, opState: "UNKNOWN_RECONCILING" },
      { ...base, opState: "OFFLINE" }, // fix(bot-hub-connection-state)
      { ...base, hasStartableProfile: false },
      { ...base, selectedProfileReadOnly: true },
    ];
    for (const scenario of scenarios) {
      const c = resolveBotCta(scenario);
      assertClean(`cta.label`, c.label);
      if (c.disabledReason) assertClean(`cta.disabledReason`, c.disabledReason);
      if (c.helperText) assertClean(`cta.helperText`, c.helperText);
    }
  });

  test("tier comparison rows: label + ทุก cell (ครอบ D-072 schedule ด้วยในตัว)", () => {
    for (const row of botTierComparisonRows(FAKE_BOT_TIER_PLANS)) {
      assertClean(`row.label:${row.label}`, row.label);
      for (const tier of ["free", "plus", "pro"] as const) assertClean(`row.value:${row.label}.${tier}`, row.values[tier]);
    }
  });

  test("M4: locked-feature labels + tab labels ใหม่ (ภาพรวม/แผนฟาร์ม)", () => {
    for (const feature of ["selected_types", "goal", "warp_town", "workflow"] as const) {
      assertClean(`locked-feature:${feature}`, BOT_LOCKED_FEATURE_LABELS[feature]);
    }
    for (const entry of lockedBotFeaturesFor("free")) assertClean(`locked:${entry.feature}`, entry.label);
    assertClean("tab:status", BOT_TAB_LABELS.status);
    assertClean("tab:profiles", BOT_TAB_LABELS.profiles);
  });
});

describe("M4 workspace redesign (owner brief 2026-07-17) — active-plan selection + CTA action mapping", () => {
  const P1: BotProfileWire = { id: "p1", name: "หนึ่ง", mapId: "map1", pocketId: "map1-slime-center", rules: defaultBotRules(), createdAt: 0, updatedAt: 0, readOnly: false };
  const P2_RO: BotProfileWire = { id: "p2", name: "สอง", mapId: "map1", pocketId: "map1-bird-east", rules: defaultBotRules(), createdAt: 0, updatedAt: 0, readOnly: true };
  const STATUS: BotStatusMessage = {
    profileId: "p2",
    sessionId: "s1",
    mapId: "map1",
    pocketId: "map1-bird-east",
    continuity: { state: "WORKING", revision: 1, enteredAt: 0, interruptedState: null },
    action: "attacking",
    killCount: 1,
    goldEarned: 1,
    expEarned: 1,
    hpFraction: 1,
    uptimeMs: 1,
  };
  const CHECKPOINT: BotCheckpointWire = {
    id: "cp1",
    profileId: "p1",
    sourceSessionId: "s0",
    mapId: "map1",
    pocketId: "map1-slime-center",
    savedAt: 0,
    state: "ready",
    continuity: { state: "PAUSED", revision: 1, enteredAt: 0, interruptedState: null },
  };

  test("resolveActiveBotProfileId: status ชนะทุกอย่าง", () => {
    expect(
      resolveActiveBotProfileId({ explicitSelection: "p1", profiles: [P1, P2_RO], status: STATUS, checkpoint: CHECKPOINT }),
    ).toBe("p2");
  });

  test("resolveActiveBotProfileId: ไม่มี status → checkpoint ชนะ explicit selection", () => {
    expect(
      resolveActiveBotProfileId({ explicitSelection: "p2", profiles: [P1, P2_RO], status: null, checkpoint: CHECKPOINT }),
    ).toBe("p1");
  });

  test("resolveActiveBotProfileId: ไม่มี status/checkpoint → explicit selection ที่มีอยู่จริง", () => {
    expect(resolveActiveBotProfileId({ explicitSelection: "p2", profiles: [P1, P2_RO], status: null, checkpoint: null })).toBe("p2");
  });

  test("resolveActiveBotProfileId: explicit selection ไม่มีอยู่จริง → fallback แผนแรกที่ไม่ readOnly", () => {
    expect(resolveActiveBotProfileId({ explicitSelection: "ghost", profiles: [P2_RO, P1], status: null, checkpoint: null })).toBe("p1");
  });

  test("resolveActiveBotProfileId: ไม่มีแผนเลย → null", () => {
    expect(resolveActiveBotProfileId({ explicitSelection: null, profiles: null, status: null, checkpoint: null })).toBeNull();
  });

  test("resolveBotCtaAction: stop ไม่ผูก profileId", () => {
    const cta = resolveBotCta({ authorityActive: true, status: STATUS, checkpoint: null, opState: "IDLE", hasStartableProfile: true, selectedProfileReadOnly: false });
    expect(resolveBotCtaAction(cta, "p2", null)).toEqual({ kind: "stop" });
  });

  test("resolveBotCtaAction: enabled=false (processing) → null", () => {
    const cta = resolveBotCta({ authorityActive: false, status: null, checkpoint: null, opState: "PROCESSING", hasStartableProfile: true, selectedProfileReadOnly: false });
    expect(resolveBotCtaAction(cta, "p1", null)).toBeNull();
  });

  test("resolveBotCtaAction: resume เมื่อ checkpoint ready ตรงกับแผนที่เลือก", () => {
    const cta = resolveBotCta({ authorityActive: false, status: null, checkpoint: CHECKPOINT, opState: "IDLE", hasStartableProfile: true, selectedProfileReadOnly: false });
    expect(cta.isResume).toBe(true);
    expect(resolveBotCtaAction(cta, "p1", CHECKPOINT)).toEqual({ kind: "resume", checkpointId: "cp1" });
  });

  test("resolveBotCtaAction: start ปกติเมื่อไม่มี checkpoint/ไม่ resume", () => {
    const cta = resolveBotCta({ authorityActive: false, status: null, checkpoint: null, opState: "IDLE", hasStartableProfile: true, selectedProfileReadOnly: false });
    expect(resolveBotCtaAction(cta, "p1", null)).toEqual({ kind: "start", profileId: "p1" });
  });

  test("resolveBotCtaAction: ไม่มีแผนให้ start → null", () => {
    const cta = resolveBotCta({ authorityActive: false, status: null, checkpoint: null, opState: "IDLE", hasStartableProfile: true, selectedProfileReadOnly: false });
    expect(resolveBotCtaAction(cta, null, null)).toBeNull();
  });

  test("hasGoalWorkflowConflict", () => {
    const withGoal = setBotGoal(defaultBotRules(), { type: "kills", target: 10 });
    expect(hasGoalWorkflowConflict(withGoal)).toBe(false);
    const withBoth = addWorkflowStep(undefined, newWorkflowFarmStep("step-1", "map1", "map1-slime-center"));
    expect(hasGoalWorkflowConflict({ ...withGoal, workflow: withBoth })).toBe(true);
  });

  test("botTargetSummaryLabel: ALL_IN_AREA vs SELECTED_TYPES", () => {
    expect(botTargetSummaryLabel(defaultBotRules())).toBe(BOT_TARGET_MODE_LABELS.ALL_IN_AREA);
    const selected = toggleSelectedMobType(setBotTargetMode(defaultBotRules(), "SELECTED_TYPES"), "slime");
    expect(botTargetSummaryLabel(selected)).toBe(mobTypeLabel("slime"));
    expect(botTargetSummaryLabel(setBotTargetMode(defaultBotRules(), "SELECTED_TYPES"))).toBe(BOT_TARGET_MODE_LABELS.SELECTED_TYPES);
  });

  test("formatBotGoalProgress: kills/gold/exp ตรงตัว, durationMs แปลงเป็นนาที", () => {
    expect(formatBotGoalProgress({ type: "kills", target: 50, done: 12 })).toBe("จำนวนที่ล่า 12/50");
    expect(formatBotGoalProgress({ type: "durationMs", target: 300000, done: 120000 })).toBe("เวลา (นาที) 2/5 นาที");
  });

  test("botTownSkipLabel: gold_reserve/skip อื่นมีข้อความ · restock_done(ไม่มีค่า) = null", () => {
    expect(botTownSkipLabel(undefined)).toBeNull();
    expect(botTownSkipLabel("gold_reserve")).toContain("เงินสำรอง");
    expect(botTownSkipLabel("restock_skipped")).toContain("ไม่ได้ซื้อยา");
    expect(botTownSkipLabel("future_reason")).toContain("ไม่ได้ซื้อยา"); // forward-compat: reason ใหม่ไม่พังจอ
  });

  test("lockedBotFeaturesFor: free ล็อกครบ 4, pro ปลดหมด", () => {
    expect(lockedBotFeaturesFor("free").map((f) => f.feature)).toEqual(["selected_types", "goal", "warp_town", "workflow"]);
    expect(lockedBotFeaturesFor("plus").map((f) => f.feature)).toEqual(["workflow"]);
    expect(lockedBotFeaturesFor("pro")).toEqual([]);
  });

  // fix(bot-hub-connection-state) FIX4: busyOp เดิมเป็น boolean → เปลี่ยนเป็น op name (จาก botBusyOpFromPhase)
  // — ต้องแยกว่า busy op ตรงกับ action ของ CTA นี้จริงไหม กัน op อื่น (เช่น profileCreate ค้าง) ทำให้ CTA โชว์
  // "กำลังเริ่ม…" ผิด ๆ (root cause เดิมของ FIX4).
  test("botCtaButtonLabel: matrix ครบ kind (start/stop) × busyOp (null/ตรง action/ op อื่น)", () => {
    const startCta = resolveBotCta({ authorityActive: false, status: null, checkpoint: null, opState: "IDLE", hasStartableProfile: true, selectedProfileReadOnly: false });
    const stopCta = resolveBotCta({ authorityActive: true, status: null, checkpoint: null, opState: "IDLE", hasStartableProfile: true, selectedProfileReadOnly: false });

    // ไม่ busy เลย (idle) → label ปกติเสมอ
    expect(botCtaButtonLabel(startCta, null)).toBe("เริ่มบอท");
    expect(botCtaButtonLabel(stopCta, null)).toBe("หยุดบอท");

    // busyOp ตรงกับ action ของ CTA นี้ → label "กำลัง…"
    expect(botCtaButtonLabel(startCta, "start")).toBe("กำลังเริ่ม…");
    expect(botCtaButtonLabel(startCta, "resume")).toBe("กำลังเริ่ม…");
    expect(botCtaButtonLabel(stopCta, "stop")).toBe("กำลังหยุด…");

    // busyOp เป็น op อื่น (ไม่ตรง action ของ CTA นี้ เช่น profileCreate ค้าง, หรือ cta ตรงข้ามกำลังส่ง) →
    // ยังคง label ปกติ (ปุ่มยัง disabled ผ่าน enabled/busy ที่ caller คำนวณแยก — นี่ทดสอบแค่ text)
    expect(botCtaButtonLabel(startCta, "profileCreate")).toBe("เริ่มบอท");
    expect(botCtaButtonLabel(startCta, "stop")).toBe("เริ่มบอท");
    expect(botCtaButtonLabel(stopCta, "start")).toBe("หยุดบอท");
    expect(botCtaButtonLabel(stopCta, "profileCreate")).toBe("หยุดบอท");
  });
});

// ── fix(bot-hub-connection-state): FIX1/2/4 pure helpers ─────────────────────────────────────────────────

describe("botBusyOpFromPhase", () => {
  test("processing/timed_out → op, อื่น ๆ (idle/settled/offline) → null", () => {
    expect(botBusyOpFromPhase({ kind: "idle" })).toBeNull();
    expect(botBusyOpFromPhase({ kind: "processing", op: "start" })).toBe("start");
    expect(botBusyOpFromPhase({ kind: "timed_out", op: "profileCreate" })).toBe("profileCreate");
    expect(botBusyOpFromPhase({ kind: "offline" })).toBeNull();
    const ok: BotOpResultMessage = { ok: true, op: "start" };
    expect(botBusyOpFromPhase({ kind: "settled", result: ok })).toBeNull();
  });
});

describe("botOpsAvailable", () => {
  test("true เฉพาะ online", () => {
    expect(botOpsAvailable("online")).toBe(true);
    expect(botOpsAvailable("connecting")).toBe(false);
    expect(botOpsAvailable("reconnecting")).toBe(false);
    expect(botOpsAvailable("offline")).toBe(false);
  });
});

describe("botConnectionBannerMessage", () => {
  test("online → null (ไม่มี banner), อื่น ๆ → ข้อความต่อ state", () => {
    expect(botConnectionBannerMessage("online")).toBeNull();
    expect(botConnectionBannerMessage("offline")).toMatch(/ออฟไลน์/);
    expect(botConnectionBannerMessage("connecting")).toMatch(/เชื่อมต่อ/);
    expect(botConnectionBannerMessage("reconnecting")).toMatch(/เชื่อมต่อ/);
    // connecting/reconnecting ใช้ข้อความเดียวกัน (ทั้งคู่ "ยังไม่ online, กำลังพยายามต่อเอง")
    expect(botConnectionBannerMessage("connecting")).toBe(botConnectionBannerMessage("reconnecting"));
  });
});

describe("resolveBotOpState / botOpMessage — OFFLINE (fix(bot-hub-connection-state) FIX2)", () => {
  test("phase offline → opState OFFLINE → ข้อความเฉพาะ + ไม่นับเป็น busy (canConfirmBotOp true)", () => {
    const state = resolveBotOpState({ kind: "offline" });
    expect(state).toBe("OFFLINE");
    expect(canConfirmBotOp(state)).toBe(true);
    expect(botOpMessage(state, null)).toBe("ยังเชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — คำสั่งยังไม่ถูกส่ง ลองใหม่เมื่อเชื่อมต่อแล้ว");
  });
});
