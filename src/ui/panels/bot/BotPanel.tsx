"use client";

// Bot Hub panel (P3 Bot UI spec, PR7 UX pass) — multi-tab pattern เดียวกับ JournalPanel.tsx (แถวปุ่มแท็บด้านบน
// แทน sidebar). 4 แท็บ: สถานะ (Hub §2 + Live Status §7, continuity.state = authority) · แผนงาน (setup wizard
// §5 ตอนสร้างแผนใหม่ + Rule Builder v1 §4 รวม branch step) · รายงาน (§8) · แพ็กเกจ (Tier Comparison + MOCK
// purchase §11, D-061/D-063 — ไม่มีแถว Schedule แล้ว, D-072).
// Analytics ขั้นสูง (§8.2) = locked placeholder "เร็วๆ นี้" (deferred) — แสดงใน tier table เป็นเครื่องหมายเฉย ๆ
// ไม่มี UI แยกให้กด. notification prefs = defer เช่นกัน.
//
// terminology (PR7 §2 locked): "แผน/แผนงาน" แทน "โปรไฟล์/บอท" ทุกจุด · เริ่มแผน = "มอบการควบคุม" · "รับช่วงต่อ"
// ไม่มี confirmation · resume CTA แยกตาม checkpoint.kind (bot-view.ts botResumeCtaLabel).
//
// อ่าน state ผ่าน Zustand bridge เท่านั้น (useGameStore, docs/context/ui.md contract) — ส่ง intent
// (create/update/delete/start/stop/mockPurchase/reportList/reportFetch) ผ่าน EngineHandle.net ตรง ๆ
// (imperative, เหมือน InventoryPanel/ShopPanel/StoragePanel). ทุก op (ยกเว้น reportFetch/reportList ที่เป็น
// read) ผ่าน BotOpPhase เดียว (bot-view.ts, pattern เดียวกับ ShopTxPhase — ทำได้ทีละ action, ปุ่ม disable
// ระหว่าง processing กันชนกัน).
//
// map/pocket dropdown: mirror ของ server/config/bot.ts botAllowedPockets (ui ห้าม import server/**) — ดู
// comment ที่ bot-view.ts BOT_ALLOWED_POCKETS. server เป็น authority จริง (validate ซ้ำทุก create/update/start).

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import type { BotProfileWire, BotRulesWire, BotTierWire } from "@/shared/net-protocol";
import { Panel, usePanelManager } from "@/ui/panels";
import { Button, ConfirmDialog, TextInput } from "@/ui/components";
import {
  selectBotLastStopped,
  selectBotOpResult,
  selectBotProfiles,
  selectBotReportDetail,
  selectBotReports,
  selectBotStatus,
  selectBotTierState,
  selectBotCheckpoint,
  selectBotAuthorityActive,
} from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import {
  BOT_PANEL_ID,
  BOT_RULE_SKILL_SLOTS,
  BOT_TAB_LABELS,
  BOT_TAB_ORDER,
  botMapLabel,
  botMapOptions,
  botOpMessage,
  botPocketLabel,
  botPocketOptions,
  botStopReasonLabel,
  botTierComparisonRows,
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
  isValidBotWorkflowClient,
  newWorkflowFarmStep,
  newWorkflowTownStep,
  nextWorkflowStepId,
  removeWorkflowStep,
  setWorkflowFarmGoal,
  BOT_WORKFLOW_GOAL_TYPES,
  BOT_WORKFLOW_METRIC_LABELS,
  BOT_WORKFLOW_MAX_STEPS_CLIENT,
  // PR7: continuity-first status, resume CTA, workflow progress + branch editor, setup wizard, presets,
  // stop-policy info, micro-tutorial (P3 Bot UI spec, terminology "แผน/แผนงาน" — see bot-view.ts comments).
  botStatusStateLabel,
  botResumeCtaLabel,
  botCheckpointRestartBadge,
  BOT_RESUME_REASSURANCE,
  formatWorkflowStepProgress,
  newWorkflowBranchStep,
  workflowBranchTargetOptions,
  setWorkflowBranchWhen,
  setWorkflowBranchTarget,
  BOT_WIZARD_STEPS,
  BOT_WIZARD_STEP_LABELS,
  nextBotWizardStep,
  prevBotWizardStep,
  isBotWizardStepValid,
  BOT_RULE_PRESETS,
  applyBotRulePreset,
  BOT_GLOBAL_SAFETY_STOP_REASONS,
  botTierRecoveryLabel,
  BOT_TUTORIAL_SLIDES,
  createBotTutorialStore,
  dismissBotTutorial,
  type BotOpPhase,
  type BotTab,
  type BotWizardStep,
  type BotTutorialState,
} from "./bot-view";
import type { BotWorkflowMetric, BotWorkflowV1 } from "@/shared/bot-workflow";

export interface BotPanelProps {
  /** อ่าน engine handle ปัจจุบัน (pattern เดียวกับ InventoryPanel.getHandle — เรียกใหม่ทุกครั้ง ไม่ cache) */
  getHandle: () => EngineHandle | null;
}

/** ไม่ได้รับ bot:opResult ภายในนี้หลังกด → UNKNOWN_RECONCILING (pattern เดียวกับ ShopPanel) */
const RESULT_TIMEOUT_MS = 8000;

type Net = NonNullable<EngineHandle["net"]>;

interface ProfileFormState {
  mode: "create" | "edit";
  id?: string;
  name: string;
  mapId: string;
  pocketId: string;
  rules: BotRulesWire;
  /** PR7 §5 setup wizard cursor — meaningful only for mode="create" (edit ใช้ฟอร์มเดียวไม่มี stepper). */
  wizardStep: BotWizardStep;
}

function blankForm(): ProfileFormState {
  const mapId = botMapOptions()[0] ?? "map1";
  const pocketId = botPocketOptions(mapId)[0] ?? "";
  return { mode: "create", name: "", mapId, pocketId, rules: defaultBotRules(), wizardStep: "map" };
}

function editForm(profile: BotProfileWire): ProfileFormState {
  return {
    mode: "edit",
    id: profile.id,
    name: profile.name,
    mapId: profile.mapId,
    pocketId: profile.pocketId,
    rules: profile.rules,
    wizardStep: "rules",
  };
}

const SELECT_CLASS =
  "h-10 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-deep-ink) px-3 " +
  "text-(--dp-highlight) dp-focus-ring";

// PR7 §7 micro-tutorial — module-level store เหมือน HelpPanel.tsx prefsStore (load ครั้งเดียว, lazy useState init)
const tutorialStore = createBotTutorialStore();

export function BotPanel({ getHandle }: BotPanelProps) {
  const manager = usePanelManager();
  const isOpen = manager.isPanelOpen(BOT_PANEL_ID);

  const tierState = useGameStore(selectBotTierState);
  const profiles = useGameStore(selectBotProfiles);
  const status = useGameStore(selectBotStatus);
  const lastStopped = useGameStore(selectBotLastStopped);
  const reports = useGameStore(selectBotReports);
  const reportDetail = useGameStore(selectBotReportDetail);
  const opResult = useGameStore(selectBotOpResult);
  const checkpoint = useGameStore(selectBotCheckpoint);
  const authorityActive = useGameStore(selectBotAuthorityActive);

  const [tab, setTab] = useState<BotTab>("status");
  const [phase, setPhase] = useState<BotOpPhase>({ kind: "idle" });
  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BotProfileWire | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [purchaseConfirm, setPurchaseConfirm] = useState<
    { tier: BotTierWire; days: number; lostDays: number } | null
  >(null);
  // "now" สำหรับ formatPassExpiry/countdown — Date.now() ห้ามเรียกตรงใน render body (react-hooks/purity)
  // จึง lazy-init ครั้งแรกผ่าน useState initializer (เหมือน JournalPanel sessionStartMs) แล้ว refresh ตอนเปิด panel.
  const [nowMs, setNowMs] = useState(() => Date.now());
  // PR7 §7: micro-tutorial ครั้งแรกที่เปิด panel — persist localStorage, ข้ามได้เสมอ (ดู bot-view.ts comment)
  const [tutorial, setTutorial] = useState<BotTutorialState>(() => tutorialStore.load());
  const [tutorialSlide, setTutorialSlide] = useState(0);

  // เปิด panel → ขอ tier state + profiles ใหม่ (reply เดียวจาก bot:profileList มาทั้งคู่ — pattern เดียวกับ
  // JournalPanel sendAchievementsRequest, deferred setState/network call ใน setTimeout callback) + refresh nowMs
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      getHandle()?.net?.sendBotProfileList();
      setNowMs(Date.now());
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // เปิด panel ที่แท็บรายงาน (หรือสลับมาแท็บนี้) → ขอ report list ใหม่เสมอ (สดตาม retention ของ tier)
  useEffect(() => {
    if (!isOpen || tab !== "reports") return;
    const timer = setTimeout(() => {
      getHandle()?.net?.sendBotReportList();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab]);

  // ผล bot:opResult มาถึง → settle เฉพาะตอนกำลังรอ op เดียวกัน (กันผลลัพธ์เก่ามาทับ)
  useEffect(() => {
    if (!opResult) return;
    if (phase.kind !== "processing" && phase.kind !== "timed_out") return;
    if (opResult.op !== phase.op) return;
    const timer = setTimeout(() => setPhase({ kind: "settled", result: opResult }), 0);
    return () => clearTimeout(timer);
  }, [opResult, phase]);

  // timeout ระหว่าง processing
  useEffect(() => {
    if (phase.kind !== "processing") return;
    const { op } = phase;
    const timer = setTimeout(() => setPhase({ kind: "timed_out", op }), RESULT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // settled สำเร็จ → ปิดฟอร์ม/เคลียร์ delete target (bot:profiles ใหม่มาเองจาก server อยู่แล้ว) — deferred
  // setState ใน setTimeout callback (pattern เดียวกับ effect อื่นในไฟล์นี้ — ไม่ผิด react-hooks/set-state-in-effect)
  useEffect(() => {
    if (phase.kind !== "settled" || !phase.result.ok) return;
    const op = phase.result.op;
    const timer = setTimeout(() => {
      if (op === "profileCreate" || op === "profileUpdate") setForm(null);
      if (op === "profileDelete") setDeleteTarget(null);
      if (op === "mockPurchase") setPurchaseConfirm(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [phase]);

  const opState = resolveBotOpState(phase);
  const busy = !canConfirmBotOp(opState);
  const opMessage = botOpMessage(opState, phase.kind === "settled" ? phase.result : opResult);
  const caps = tierState?.caps ?? null;

  const send = (op: string, fn: (net: Net) => void): void => {
    const net = getHandle()?.net;
    if (!net) return;
    fn(net);
    setPhase({ kind: "processing", op });
  };

  const onSubmitForm = (): void => {
    if (!form || busy) return;
    if (form.mode === "create") {
      send("profileCreate", (net) =>
        net.sendBotProfileCreate({ name: form.name.trim(), mapId: form.mapId, pocketId: form.pocketId, rules: form.rules }),
      );
    } else if (form.id) {
      send("profileUpdate", (net) =>
        net.sendBotProfileUpdate({ id: form.id!, name: form.name.trim(), mapId: form.mapId, pocketId: form.pocketId, rules: form.rules }),
      );
    }
  };

  const onBuyPass = (tier: BotTierWire, days: number): void => {
    const confirm = resolveBotPurchaseConfirmation(tierState, tier, nowMs);
    if (confirm.needsConfirm) {
      setPurchaseConfirm({ tier, days, lostDays: confirm.lostDays ?? 0 });
      return;
    }
    send("mockPurchase", (net) => net.sendBotMockPurchase({ tier, days }));
  };

  const isPro = tierState?.tier === "pro";

  // PR6b: edit the profile draft's goal chain (form.rules.workflow); undefined = back to a single-pocket run.
  const updateWorkflow = (workflow: BotWorkflowV1 | undefined): void => {
    if (!form) return;
    setForm({ ...form, rules: { ...form.rules, workflow } });
  };
  const goalMinutesOrCount = (target: number, type: BotWorkflowMetric): number =>
    type === "durationMs" ? Math.round(target / 60000) : target;

  const formInvalid =
    !form ||
    !isValidBotProfileName(form.name) ||
    !hasAtLeastOneSkillSlot(form.rules) ||
    (caps !== null && countBotRules(form.rules) > caps.rules) ||
    (!!form.rules.workflow && !isValidBotWorkflowClient(form.rules.workflow));

  // PR7 §5: "ถัดไป" ในสเต็ปสร้างแผนใหม่กดได้เฉพาะเมื่อขั้นปัจจุบันผ่าน mirror validation (server เป็น truth จริงเสมอ)
  const wizardStepValid = form ? isBotWizardStepValid(form.wizardStep, form, caps?.rules ?? null) : false;

  // PR7 §7: ปิด micro-tutorial (ข้าม หรือจบสไลด์สุดท้าย) — persist ทันที, ข้ามได้เสมอตาม spec
  const dismissTutorial = (): void => {
    const next = dismissBotTutorial(tutorial);
    setTutorial(next);
    tutorialStore.save(next);
  };
  const onFinishTutorial = (): void => {
    dismissTutorial();
    setTab("profiles");
    setForm(blankForm());
  };

  return (
    <Panel id={BOT_PANEL_ID} title="ผู้ช่วยนักล่า" widthPx={420}>
      <div className="dp-text-body-sm flex flex-col gap-3">
        <div className="flex flex-wrap gap-1">
          {BOT_TAB_ORDER.map((t) => (
            <Button key={t} variant={tab === t ? "primary" : "ghost"} size="sm" onClick={() => setTab(t)}>
              {BOT_TAB_LABELS[t]}
            </Button>
          ))}
        </div>

        {!tutorial.dismissed && (
          <div className="flex flex-col gap-2 rounded-(--dp-radius-sm) border border-(--dp-resonance-teal) bg-(--dp-deep-ink) px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="dp-text-label text-(--dp-resonance-light)">
                {BOT_TUTORIAL_SLIDES[tutorialSlide].title} ({tutorialSlide + 1}/{BOT_TUTORIAL_SLIDES.length})
              </span>
              <button
                type="button"
                aria-label="ข้ามการแนะนำ"
                onClick={dismissTutorial}
                className="dp-focus-ring shrink-0 rounded-(--dp-radius-sm) px-1.5 text-(--dp-sand) hover:text-(--dp-highlight)"
              >
                ✕
              </button>
            </div>
            <div className="text-(--dp-parchment)">{BOT_TUTORIAL_SLIDES[tutorialSlide].body}</div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={dismissTutorial}>
                ข้าม
              </Button>
              {tutorialSlide < BOT_TUTORIAL_SLIDES.length - 1 ? (
                <Button variant="primary" size="sm" onClick={() => setTutorialSlide((s) => s + 1)}>
                  ถัดไป
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={onFinishTutorial}>
                  สร้างแผนแรก
                </Button>
              )}
            </div>
          </div>
        )}

        {opMessage && (
          <div
            className={[
              "flex items-center justify-between gap-2 rounded-(--dp-radius-sm) px-3 py-2",
              opState === "REJECTED"
                ? "border border-(--dp-danger-red) bg-(--dp-deep-ink) text-(--dp-highlight)"
                : "border border-(--dp-soil-brown) bg-(--dp-warm-ink) text-(--dp-parchment)",
            ].join(" ")}
          >
            <span>{opMessage}</span>
            {opState !== "PROCESSING" && (
              <button
                type="button"
                aria-label="ปิด"
                onClick={() => setPhase({ kind: "idle" })}
                className="dp-focus-ring shrink-0 rounded-(--dp-radius-sm) px-1.5 text-(--dp-sand) hover:text-(--dp-highlight)"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {tab === "status" && (
          <div className="flex flex-col gap-2">
            {tierState && (
              <div className="flex items-center justify-between gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
                <span className="text-(--dp-highlight)">{botTierLabel(tierState.tier)}</span>
                <span className="dp-text-caption text-(--dp-sand)">{formatPassExpiry(tierState.passExpiresAt, nowMs)}</span>
              </div>
            )}

            {authorityActive && !status && (
              <div className="flex flex-col gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
                <span className="text-(--dp-resonance-light)">ตัวละครกำลังทำตามแผน — กำลังเชื่อมสถานะล่าสุด</span>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      send("takeover", (net) =>
                        net.sendBotTakeover({ requestId: `takeover:cta:${Date.now()}`, source: "cta" }),
                      )
                    }
                  >
                    รับช่วงต่อ
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => send("stop", (net) => net.sendBotStop({}))}
                  >
                    หยุดแผน
                  </Button>
                </div>
              </div>
            )}

            {!profiles || profiles.length === 0 ? (
              <div className="text-(--dp-sand)">ยังไม่มีแผน — ไปที่แท็บ “แผนงาน” เพื่อสร้างแผนแรก</div>
            ) : (
              <div className="flex flex-col gap-2">
                {profiles.map((p) => {
                  const running = authorityActive && status?.profileId === p.id;
                  const interrupted = checkpoint?.profileId === p.id ? checkpoint : null;
                  return (
                    <div
                      key={p.id}
                      className="flex flex-col gap-1.5 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-(--dp-parchment)">
                          {p.name}
                          {p.readOnly && <span className="ml-1 dp-text-caption text-(--dp-fire-light)">(ถูกพัก)</span>}
                        </span>
                        <span className="dp-text-caption shrink-0 text-(--dp-sand)">
                          {botMapLabel(p.mapId)} · {botPocketLabel(p.pocketId)}
                        </span>
                      </div>
                      {running && status ? (
                        <>
                          <div className="text-(--dp-resonance-light)">
                            {botStatusStateLabel(status.continuity, status.action)}
                          </div>
                          {status.workflow && (
                            <div className="dp-text-caption text-(--dp-resonance-light)">
                              {formatWorkflowStepProgress(status.workflow)}
                            </div>
                          )}
                          <div className="dp-text-caption text-(--dp-sand)">
                            ฆ่า {status.killCount} · gold {status.goldEarned} · exp {status.expEarned} · HP{" "}
                            {formatHpPercent(status.hpFraction)} · เวลา {formatDurationShort(status.uptimeMs)}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                send("takeover", (net) =>
                                  net.sendBotTakeover({ requestId: `takeover:cta:${Date.now()}`, source: "cta" }),
                                )
                              }
                            >
                              รับช่วงต่อ
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={busy}
                              onClick={() => send("stop", (net) => net.sendBotStop({ profileId: p.id }))}
                            >
                              หยุดแผน
                            </Button>
                          </div>
                        </>
                      ) : interrupted ? (
                        <>
                          <div className="text-(--dp-resonance-light)">
                            {interrupted.state === "saving"
                              ? "กำลังบันทึกจุดทำงาน…"
                              : interrupted.state === "ready"
                                ? "บันทึกจุดทำงานแล้ว — พร้อมทำต่อ"
                                : "บันทึกจุดทำงานไม่สำเร็จ"}
                          </div>
                          {interrupted.state !== "saving" && (
                            <>
                              {botCheckpointRestartBadge(interrupted.kind) && (
                                <div className="dp-text-caption text-(--dp-fire-light)">
                                  {botCheckpointRestartBadge(interrupted.kind)}
                                </div>
                              )}
                              <div className="dp-text-caption text-(--dp-sand)">{BOT_RESUME_REASSURANCE}</div>
                            </>
                          )}
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={busy || interrupted.state === "saving" || p.readOnly}
                            onClick={() => {
                              if (interrupted.state === "ready") {
                                send("resume", (net) => net.sendBotResume({ checkpointId: interrupted.id }));
                              } else if (interrupted.state === "failed") {
                                send("start", (net) => net.sendBotStart({ profileId: p.id }));
                              }
                            }}
                          >
                            {interrupted.state === "failed" ? "มอบการควบคุม" : botResumeCtaLabel(interrupted.kind)}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={busy || p.readOnly || authorityActive || status !== null || checkpoint?.state === "saving"}
                          onClick={() => send("start", (net) => net.sendBotStart({ profileId: p.id }))}
                        >
                          มอบการควบคุม
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {lastStopped && (
              <div className="rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2 text-(--dp-parchment)">
                หยุดล่าสุด: {botStopReasonLabel(lastStopped.reason)}
                <div className="dp-text-caption text-(--dp-sand)">
                  ฆ่า {lastStopped.killCount} · gold {lastStopped.goldEarned} · exp {lastStopped.expEarned}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "profiles" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-(--dp-sand)">{caps ? profileCountLabel(profiles?.length ?? 0, caps.profiles) : "—"}</span>
              <Button
                variant="primary"
                size="sm"
                disabled={busy || form !== null || (caps !== null && !canCreateMoreProfiles(profiles?.length ?? 0, caps.profiles))}
                onClick={() => setForm(blankForm())}
              >
                + สร้างแผนใหม่
              </Button>
            </div>

            {(!profiles || profiles.length === 0) && !form && (
              <div className="text-(--dp-sand)">— ยังไม่มีแผน —</div>
            )}

            {!form &&
              profiles?.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-1.5 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-(--dp-parchment)">
                      {p.name}
                      {p.readOnly && <span className="ml-1 dp-text-caption text-(--dp-fire-light)">(ถูกพัก, อ่านอย่างเดียว)</span>}
                    </span>
                    <span className="dp-text-caption text-(--dp-sand)">
                      {caps ? ruleCountLabel(countBotRules(p.rules), caps.rules) : ""}
                    </span>
                  </div>
                  <div className="dp-text-caption text-(--dp-sand)">
                    {botMapLabel(p.mapId)} · {botPocketLabel(p.pocketId)}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={busy || p.readOnly} onClick={() => setForm(editForm(p))}>
                      แก้ไข
                    </Button>
                    <Button variant="destructive" size="sm" disabled={busy} onClick={() => setDeleteTarget(p)}>
                      ลบ
                    </Button>
                  </div>
                </div>
              ))}

            {form && (
              <div className="flex flex-col gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
                {form.mode === "create" && (
                  <div className="dp-text-caption text-(--dp-sand)">
                    ขั้น {BOT_WIZARD_STEPS.indexOf(form.wizardStep) + 1}/{BOT_WIZARD_STEPS.length} ·{" "}
                    {BOT_WIZARD_STEP_LABELS[form.wizardStep]}
                  </div>
                )}

                <TextInput
                  placeholder="ชื่อแผน"
                  value={form.name}
                  maxLength={40}
                  showCounter
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />

                {(form.mode === "edit" || form.wizardStep === "map") && (
                  <select
                    value={form.mapId}
                    onChange={(e) => {
                      const mapId = e.target.value;
                      setForm({ ...form, mapId, pocketId: botPocketOptions(mapId)[0] ?? "" });
                    }}
                    className={SELECT_CLASS}
                  >
                    {botMapOptions().map((mapId) => (
                      <option key={mapId} value={mapId}>
                        {botMapLabel(mapId)}
                      </option>
                    ))}
                  </select>
                )}

                {(form.mode === "edit" || form.wizardStep === "pocket") && (
                  <select
                    value={form.pocketId}
                    onChange={(e) => setForm({ ...form, pocketId: e.target.value })}
                    className={SELECT_CLASS}
                  >
                    {botPocketOptions(form.mapId).map((pocketId) => (
                      <option key={pocketId} value={pocketId}>
                        {botPocketLabel(pocketId)}
                      </option>
                    ))}
                  </select>
                )}

                {form.mode === "create" && form.wizardStep === "preset" && (
                  <div className="flex flex-col gap-2">
                    <div className="dp-text-label text-(--dp-sand)">เลือกชุดเริ่มต้น — ปรับต่อได้ที่ขั้น “ปรับกฎ”</div>
                    {BOT_RULE_PRESETS.map((preset) => (
                      <Button
                        key={preset.id}
                        variant="secondary"
                        size="sm"
                        onClick={() => setForm({ ...form, rules: applyBotRulePreset(form.rules, preset.id) })}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                )}

                {(form.mode === "edit" || form.wizardStep === "rules") && (
                  <>
                    <div className="dp-text-label text-(--dp-sand)">ใช้สกิลช่อง</div>
                    <div className="flex flex-wrap gap-3">
                      {BOT_RULE_SKILL_SLOTS.map((slot) => (
                        <label key={slot} className="flex items-center gap-1.5 text-(--dp-parchment)">
                          <input
                            type="checkbox"
                            checked={form.rules.skillSlots.includes(slot)}
                            onChange={() => setForm({ ...form, rules: toggleBotSkillSlot(form.rules, slot) })}
                            className="h-4 w-4 accent-(--dp-resonance-teal)"
                          />
                          S{slot + 1}
                        </label>
                      ))}
                    </div>
                    <label className="flex items-center gap-1.5 text-(--dp-parchment)">
                      <input
                        type="checkbox"
                        checked={form.rules.lootAll}
                        onChange={(e) => setForm({ ...form, rules: setBotLootAll(form.rules, e.target.checked) })}
                        className="h-4 w-4 accent-(--dp-resonance-teal)"
                      />
                      เก็บของทุกอย่างที่บอทฟาร์มได้
                    </label>
                    <label className="flex items-center gap-1.5 text-(--dp-sand) opacity-60">
                      <input type="checkbox" disabled className="h-4 w-4" />
                      HP potion threshold — รอระบบโพชั่น
                    </label>

                    {/* งานหลายขั้น (Pro) — farm/town/branch: เพิ่ม/ลบ step, branch เลือกเงื่อนไข + then/else */}
                    <div className="flex flex-col gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-deep-ink) px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="dp-text-label text-(--dp-sand)">งานหลายขั้น (Pro)</span>
                        {!isPro && <span className="dp-text-caption text-(--dp-fire-light)">อัปเกรด Pro เพื่อใช้</span>}
                      </div>

                      {isPro ? (
                        <>
                          {(form.rules.workflow?.steps ?? []).map((step, i) => (
                            <div
                              key={step.id}
                              className="flex flex-col gap-1 border-b border-(--dp-soil-brown) pb-1.5 last:border-b-0 last:pb-0"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-(--dp-parchment)">{botWorkflowStepLabel(step, i)}</span>
                                <button
                                  type="button"
                                  aria-label="ลบขั้น"
                                  onClick={() => updateWorkflow(removeWorkflowStep(form.rules.workflow!, i))}
                                  className="dp-focus-ring shrink-0 rounded-(--dp-radius-sm) px-1.5 text-(--dp-sand) hover:text-(--dp-danger-red)"
                                >
                                  ✕
                                </button>
                              </div>
                              {step.kind === "farm" && (
                                <div className="flex gap-2">
                                  <select
                                    value={step.goal.type}
                                    onChange={(e) =>
                                      updateWorkflow(
                                        setWorkflowFarmGoal(
                                          form.rules.workflow!,
                                          i,
                                          e.target.value as BotWorkflowMetric,
                                          goalMinutesOrCount(step.goal.target, step.goal.type),
                                        ),
                                      )
                                    }
                                    className={SELECT_CLASS}
                                  >
                                    {BOT_WORKFLOW_GOAL_TYPES.map((t) => (
                                      <option key={t} value={t}>
                                        {BOT_WORKFLOW_METRIC_LABELS[t]}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    min={1}
                                    value={goalMinutesOrCount(step.goal.target, step.goal.type)}
                                    onChange={(e) =>
                                      updateWorkflow(
                                        setWorkflowFarmGoal(form.rules.workflow!, i, step.goal.type, Number(e.target.value)),
                                      )
                                    }
                                    className="h-10 w-20 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-deep-ink) px-2 text-(--dp-highlight) dp-focus-ring"
                                  />
                                </div>
                              )}
                              {step.kind === "branch" && (
                                <div className="flex flex-col gap-1">
                                  <div className="flex gap-2">
                                    <select
                                      value={step.when.type}
                                      onChange={(e) =>
                                        updateWorkflow(
                                          setWorkflowBranchWhen(
                                            form.rules.workflow!,
                                            i,
                                            e.target.value as BotWorkflowMetric,
                                            goalMinutesOrCount(step.when.target, step.when.type),
                                          ),
                                        )
                                      }
                                      className={SELECT_CLASS}
                                    >
                                      {BOT_WORKFLOW_GOAL_TYPES.map((t) => (
                                        <option key={t} value={t}>
                                          {BOT_WORKFLOW_METRIC_LABELS[t]}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="number"
                                      min={1}
                                      value={goalMinutesOrCount(step.when.target, step.when.type)}
                                      onChange={(e) =>
                                        updateWorkflow(
                                          setWorkflowBranchWhen(form.rules.workflow!, i, step.when.type, Number(e.target.value)),
                                        )
                                      }
                                      className="h-10 w-20 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-deep-ink) px-2 text-(--dp-highlight) dp-focus-ring"
                                    />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-(--dp-sand)">
                                    <span>ผ่าน→</span>
                                    <select
                                      value={step.thenStepId}
                                      onChange={(e) =>
                                        updateWorkflow(setWorkflowBranchTarget(form.rules.workflow!, i, "then", e.target.value))
                                      }
                                      className={SELECT_CLASS}
                                    >
                                      {workflowBranchTargetOptions(form.rules.workflow!, i).map((opt) => (
                                        <option key={opt.id} value={opt.id}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                    <span>ไม่ผ่าน→</span>
                                    <select
                                      value={step.elseStepId}
                                      onChange={(e) =>
                                        updateWorkflow(setWorkflowBranchTarget(form.rules.workflow!, i, "else", e.target.value))
                                      }
                                      className={SELECT_CLASS}
                                    >
                                      {workflowBranchTargetOptions(form.rules.workflow!, i).map((opt) => (
                                        <option key={opt.id} value={opt.id}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={(form.rules.workflow?.steps.length ?? 0) >= BOT_WORKFLOW_MAX_STEPS_CLIENT}
                              onClick={() =>
                                updateWorkflow(
                                  addWorkflowStep(
                                    form.rules.workflow,
                                    newWorkflowFarmStep(nextWorkflowStepId(form.rules.workflow), form.mapId, form.pocketId),
                                  ),
                                )
                              }
                            >
                              + ขั้นฟาร์ม
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={(form.rules.workflow?.steps.length ?? 0) >= BOT_WORKFLOW_MAX_STEPS_CLIENT}
                              onClick={() =>
                                updateWorkflow(
                                  addWorkflowStep(form.rules.workflow, newWorkflowTownStep(nextWorkflowStepId(form.rules.workflow))),
                                )
                              }
                            >
                              + ขั้นแวะเมือง
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={
                                (form.rules.workflow?.steps.length ?? 0) === 0 ||
                                (form.rules.workflow?.steps.length ?? 0) >= BOT_WORKFLOW_MAX_STEPS_CLIENT
                              }
                              onClick={() => {
                                const wf = form.rules.workflow;
                                if (!wf || wf.steps.length === 0) return;
                                const targetId = wf.steps[0].id;
                                updateWorkflow(
                                  addWorkflowStep(
                                    wf,
                                    newWorkflowBranchStep(nextWorkflowStepId(wf), { type: "kills", target: 1 }, targetId, targetId),
                                  ),
                                );
                              }}
                            >
                              + ขั้นเงื่อนไข
                            </Button>
                          </div>
                          <div className="dp-text-caption text-(--dp-sand)">
                            ว่างไว้ = ฟาร์มจุดเดียวตามด้านบน · ขั้นฟาร์มใหม่ใช้ map/pocket ที่เลือกด้านบน · ขั้นเงื่อนไขต้องมีขั้นอื่นอยู่ก่อนให้ชี้ไป
                          </div>
                        </>
                      ) : (
                        <div className="dp-text-caption text-(--dp-sand)">
                          ให้บอททำงานหลายขั้นต่อเนื่อง (ฟาร์มครบเป้า → แวะเมือง → ทำต่อ) — เฉพาะแพ็กเกจ Pro
                        </div>
                      )}
                    </div>
                  </>
                )}

                {form.mode === "create" && form.wizardStep === "stop_policy" && (
                  <div className="flex flex-col gap-1.5">
                    <div className="dp-text-label text-(--dp-sand)">ระบบหยุดปลอดภัยอัตโนมัติเมื่อเจอ</div>
                    <ul className="list-inside list-disc text-(--dp-parchment)">
                      {BOT_GLOBAL_SAFETY_STOP_REASONS.map((reason) => (
                        <li key={reason}>{botStopReasonLabel(reason)}</li>
                      ))}
                    </ul>
                    {tierState && (
                      <div className="dp-text-caption text-(--dp-sand)">{botTierRecoveryLabel(tierState.tier)}</div>
                    )}
                  </div>
                )}

                <div className="dp-text-caption text-(--dp-sand)">
                  {caps ? ruleCountLabel(countBotRules(form.rules), caps.rules) : ""}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => setForm(null)}>
                    ยกเลิก
                  </Button>
                  <div className="flex gap-2">
                    {form.mode === "create" && prevBotWizardStep(form.wizardStep) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => setForm({ ...form, wizardStep: prevBotWizardStep(form.wizardStep)! })}
                      >
                        ย้อนกลับ
                      </Button>
                    )}
                    {form.mode === "create" && nextBotWizardStep(form.wizardStep) ? (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busy || !wizardStepValid}
                        onClick={() => setForm({ ...form, wizardStep: nextBotWizardStep(form.wizardStep)! })}
                      >
                        ถัดไป
                      </Button>
                    ) : (
                      <Button variant="primary" size="sm" disabled={busy || formInvalid} onClick={onSubmitForm}>
                        {form.mode === "create" ? "สร้างแผน" : "บันทึก"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "reports" && (
          <div className="flex flex-col gap-2">
            {caps && <div className="dp-text-caption text-(--dp-sand)">เก็บย้อนหลัง {caps.reportRetentionDays} วัน</div>}

            {!reports ? (
              <div className="text-(--dp-sand)">กำลังโหลด…</div>
            ) : reports.length === 0 ? (
              <div className="text-(--dp-sand)">— ยังไม่มีรายงาน —</div>
            ) : (
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {reports.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelectedReportId(r.id);
                      getHandle()?.net?.sendBotReportFetch({ id: r.id });
                    }}
                    className={[
                      "dp-focus-ring flex w-full flex-col gap-0.5 rounded-(--dp-radius-sm) border px-3 py-2 text-left transition-colors",
                      selectedReportId === r.id
                        ? "border-(--dp-resonance-teal) bg-(--dp-selected-wash)"
                        : "border-(--dp-soil-brown) bg-(--dp-warm-ink) hover:bg-(--dp-deep-brown)",
                    ].join(" ")}
                  >
                    <span className="text-(--dp-parchment)">
                      {formatEpochMs(r.startedAt)} · ฆ่า {r.killCount} · gold {r.goldEarned} ({r.goldPerHour}/ชม.)
                    </span>
                    <span className="dp-text-caption text-(--dp-sand)">{reportStopReasonLabel(r.stopReason)}</span>
                  </button>
                ))}
              </div>
            )}

            {selectedReportId && reportDetail && reportDetail.id === selectedReportId && (
              <div className="rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
                <div className="dp-text-label text-(--dp-sand)">ของที่ได้</div>
                {Object.keys(reportDetail.drops).length === 0 ? (
                  <div className="text-(--dp-sand)">— ไม่มี —</div>
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {Object.entries(reportDetail.drops).map(([itemId, qty]) => (
                      <li key={itemId} className="flex justify-between text-(--dp-parchment)">
                        <span className="truncate">{itemId}</span>
                        <span className="shrink-0 tabular-nums">x{qty}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {selectedReportId && reportDetail === null && (
              <div className="text-(--dp-sand)">รายงานนี้เก่ากว่าที่แพ็กเกจปัจจุบันเก็บไว้ — อัปเกรดเพื่อดูย้อนหลังได้ไกลขึ้น</div>
            )}
          </div>
        )}

        {tab === "packages" && (
          <div className="flex flex-col gap-3">
            {/* M1: plans (caps + passes) มาจาก server config ทาง tierState.plans เสมอ — ไม่ hardcode ราคาแล้ว */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-left">
                <thead>
                  <tr className="text-(--dp-sand)">
                    <th className="py-1 pr-2 font-normal">ความสามารถ</th>
                    {(tierState?.plans ?? []).map((p) => (
                      <th key={p.tier} className="px-2 py-1 text-center font-semibold text-(--dp-highlight)">
                        {botTierLabel(p.tier)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {botTierComparisonRows(tierState?.plans ?? []).map((row) => (
                    <tr key={row.label} className="border-t border-(--dp-soil-brown)">
                      <td className="py-1 pr-2 text-(--dp-parchment)">{row.label}</td>
                      {(tierState?.plans ?? []).map((p) => (
                        <td key={p.tier} className="px-2 py-1 text-center tabular-nums text-(--dp-parchment)">
                          {row.values[p.tier]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(tierState?.plans ?? []).filter((p) => p.passes.length > 0).map((plan) => (
              <div
                key={plan.tier}
                className="flex flex-col gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-(--dp-highlight)">{botTierLabel(plan.tier)}</span>
                  {tierState?.tier === plan.tier && (
                    <span className="dp-text-caption text-(--dp-pale-moss)">
                      tier ปัจจุบัน · {formatPassExpiry(tierState.passExpiresAt, nowMs)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {plan.passes.map((pass) => (
                    <Button
                      key={pass.days}
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => onBuyPass(plan.tier, pass.days)}
                    >
                      [MOCK] ซื้อ {pass.days} วัน ({pass.priceThb}฿)
                    </Button>
                  ))}
                </div>
              </div>
            ))}

            <div className="dp-text-caption text-(--dp-fire-light)">ทดสอบ — ยังไม่ตัดเงินจริง (D-061)</div>
            <div className="dp-text-caption text-(--dp-sand)">
              Free ใช้ได้ตลอดไป 24/7 — จ่ายเพื่อความสะดวก (หลายแผน, กฎเยอะ, รายงานยาว)
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="ลบแผน"
        description={deleteTarget ? `ลบแผน "${deleteTarget.name}" ถาวร — ต้องสร้างใหม่ถ้าต้องการใช้อีก` : undefined}
        variant="high-risk"
        requireCheckbox
        checkboxLabel="เข้าใจแล้วว่าแผนนี้จะถูกลบถาวร"
        confirmLabel="ลบ"
        cancelLabel="ยกเลิก"
        committing={busy}
        onConfirm={() => {
          if (!deleteTarget) return;
          send("profileDelete", (net) => net.sendBotProfileDelete({ id: deleteTarget.id }));
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={purchaseConfirm !== null}
        title="ยืนยันเปลี่ยนแพ็กเกจ"
        description={
          purchaseConfirm
            ? `แพ็กเกจปัจจุบันยังเหลือประมาณ ${purchaseConfirm.lostDays} วัน — ซื้อแพ็กเกจ ${botTierLabel(purchaseConfirm.tier)} จะทับทันที และวันที่เหลือของแพ็กเกจเดิมจะหายไป (ไม่คืนวัน/เงิน)`
            : undefined
        }
        confirmLabel="ยืนยันซื้อ"
        cancelLabel="ยกเลิก"
        committing={busy}
        onConfirm={() => {
          if (!purchaseConfirm) return;
          send("mockPurchase", (net) => net.sendBotMockPurchase({ tier: purchaseConfirm.tier, days: purchaseConfirm.days }));
        }}
        onCancel={() => setPurchaseConfirm(null)}
      />
    </Panel>
  );
}
