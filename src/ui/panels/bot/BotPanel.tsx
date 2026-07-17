"use client";

// Bot Hub panel (M4 workspace redesign, owner brief 2026-07-17) — shell บาง: <Panel layout="workspace"> +
// BotHubWindow (header/tabs) + 4 แท็บแยกไฟล์ (tabs/*). ทุก network wiring (op phase machine, effects) อยู่ที่นี่
// ที่เดียว แล้วส่งลงเป็น props/BotHubCtx ให้ลูก ๆ เรียก — component ลูกไม่ import net-client เอง.
//
// CTA เดี่ยว "เริ่มบอท"/"หยุดบอท" (resolveBotCta + resolveBotCtaAction, bot-view.ts) แทนที่ปุ่มต่อแผนเดิม (PR7
// "มอบการควบคุม"/"รับช่วงต่อ"/"หยุดแผน" — ห้ามหลุดออกมาให้ผู้เล่นเห็นอีก, ดู tests/ui-panels-bot-copy-guard.test.ts).
// "แผนที่เลือกอยู่" (active plan สำหรับ CTA + Overview) แยกจากบอทที่กำลังรันจริง — resolveActiveBotProfileId
// ให้ authority (status/checkpoint) ชนะการเลือกของผู้เล่นเสมอ (bot-view.ts comment).
//
// อ่าน state ผ่าน Zustand bridge เท่านั้น (useGameStore, docs/context/ui.md contract) — ส่ง intent ผ่าน
// EngineHandle.net ตรง ๆ (imperative, เหมือน InventoryPanel/ShopPanel/StoragePanel). ทุก op (ยกเว้น
// reportFetch/reportList ที่เป็น read, จัดการเองใน BotReportsTab) ผ่าน BotOpPhase เดียว (bot-view.ts).

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import { Panel, usePanelManager } from "@/ui/panels";
import {
  selectBotAuthorityActive,
  selectBotCheckpoint,
  selectBotLastStopped,
  selectBotOpResult,
  selectBotProfiles,
  selectBotReportDetail,
  selectBotReports,
  selectBotStatus,
  selectBotTierState,
  selectConnectionState,
  selectInventory,
} from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import {
  BOT_PANEL_ID,
  botBusyOpFromPhase,
  botOpMessage,
  botOpsAvailable,
  canConfirmBotOp,
  createBotTutorialStore,
  dismissBotTutorial,
  resolveActiveBotProfileId,
  resolveBotCta,
  resolveBotCtaAction,
  resolveBotOpState,
  type BotOpPhase,
  type BotTab,
  type BotTutorialState,
} from "./bot-view";
import { BotHubWindow } from "./BotHubWindow";
import { BotOverviewTab } from "./tabs/BotOverviewTab";
import { BotPlansTab } from "./tabs/BotPlansTab";
import { BotReportsTab } from "./tabs/BotReportsTab";
import { BotPackagesTab } from "./tabs/BotPackagesTab";

export interface BotPanelProps {
  /** อ่าน engine handle ปัจจุบัน (pattern เดียวกับ InventoryPanel.getHandle — เรียกใหม่ทุกครั้ง ไม่ cache) */
  getHandle: () => EngineHandle | null;
}

/** net client ที่ไม่เป็น null แล้ว (หลัง getHandle()?.net เช็คผ่าน) — ใช้เป็น type ของพารามิเตอร์ send() ทั่ว panel */
export type BotNet = NonNullable<EngineHandle["net"]>;

/** ไม่ได้รับ bot:opResult ภายในนี้หลังกด → UNKNOWN_RECONCILING (pattern เดียวกับ ShopPanel) */
const RESULT_TIMEOUT_MS = 8000;

// M4 §7 micro-tutorial — module-level store เหมือน HelpPanel.tsx prefsStore (load ครั้งเดียว, lazy useState init)
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
  const inventory = useGameStore(selectInventory);
  // fix(bot-hub-connection-state): connectionState gates every op button (send() fail-fast below) — not just
  // BotStatusChip's stale tierState≠null check (tierState can be non-null from before a drop, FIX2 root cause).
  const connectionState = useGameStore(selectConnectionState);
  const opsAvailable = botOpsAvailable(connectionState);

  const [tab, setTab] = useState<BotTab>("status");
  const [phase, setPhase] = useState<BotOpPhase>({ kind: "idle" });
  const [explicitSelection, setExplicitSelection] = useState<string | null>(null);
  // "now" สำหรับ formatPassExpiry/countdown — Date.now() ห้ามเรียกตรงใน render body (react-hooks/purity)
  // จึง lazy-init ครั้งแรกผ่าน useState initializer แล้ว refresh ตอนเปิด panel.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [tutorial, setTutorial] = useState<BotTutorialState>(() => tutorialStore.load());
  const [tutorialSlide, setTutorialSlide] = useState(0);

  // เปิด panel → ขอ tier state + profiles ใหม่ (reply เดียวจาก bot:profileList มาทั้งคู่) + refresh nowMs
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      getHandle()?.net?.sendBotProfileList();
      setNowMs(Date.now());
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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

  const opState = resolveBotOpState(phase);
  // fix(bot-hub-connection-state): fold offline-ness into `busy` too — every button downstream (BotPlansTab
  // create/edit/delete, BotPackagesTab buy) already threads this single `busy` prop through unchanged.
  const busy = !canConfirmBotOp(opState) || !opsAvailable;
  const busyOp = botBusyOpFromPhase(phase); // CTA label only (FIX4) — must NOT include offline (see bot-view.ts doc)
  const opMessage = botOpMessage(opState, phase.kind === "settled" ? phase.result : opResult);
  const caps = tierState?.caps ?? null;

  const send = (op: string, fn: (net: BotNet) => void): void => {
    const net = getHandle()?.net;
    // fix(bot-hub-connection-state): fail-fast — every sendBot* is a silent no-op when net isn't "online"
    // (net-client.ts guard). Entering "processing" anyway is the root cause of the stuck 8s timeout banner.
    if (!net || !opsAvailable) {
      setPhase({ kind: "offline" });
      return;
    }
    fn(net);
    setPhase({ kind: "processing", op });
  };

  const selectedProfileId = resolveActiveBotProfileId({ explicitSelection, profiles, status, checkpoint });
  const activeProfile = profiles?.find((p) => p.id === selectedProfileId) ?? null;
  const hasStartableProfile = !!profiles?.some((p) => !p.readOnly);

  const cta = resolveBotCta({
    authorityActive,
    status,
    checkpoint,
    opState,
    hasStartableProfile,
    selectedProfileReadOnly: activeProfile?.readOnly ?? false,
  });

  const onCtaClick = (): void => {
    const action = resolveBotCtaAction(cta, selectedProfileId, checkpoint);
    if (!action) return;
    if (action.kind === "stop") send("stop", (net) => net.sendBotStop({}));
    else if (action.kind === "resume") send("resume", (net) => net.sendBotResume({ checkpointId: action.checkpointId }));
    else send("start", (net) => net.sendBotStart({ profileId: action.profileId }));
  };

  const dismissTutorial = (): void => {
    const next = dismissBotTutorial(tutorial);
    setTutorial(next);
    tutorialStore.save(next);
  };
  const onFinishTutorial = (): void => {
    dismissTutorial();
    setTab("profiles");
  };

  return (
    <Panel id={BOT_PANEL_ID} title="ผู้ช่วยนักล่า" layout="workspace" bodyScroll={false}>
      <BotHubWindow
        tab={tab}
        onTabChange={setTab}
        tierState={tierState}
        nowMs={nowMs}
        connectionState={connectionState}
        opMessage={opMessage}
        opState={opState}
        onDismissOpMessage={() => setPhase({ kind: "idle" })}
        tutorial={tutorial}
        tutorialSlide={tutorialSlide}
        onTutorialNext={() => setTutorialSlide((s) => s + 1)}
        onTutorialDismiss={dismissTutorial}
        onTutorialFinish={onFinishTutorial}
      >
        {tab === "status" && (
          <BotOverviewTab
            profiles={profiles}
            activeProfile={activeProfile}
            status={status}
            lastStopped={lastStopped}
            checkpoint={checkpoint}
            authorityActive={authorityActive}
            inventory={inventory}
            busy={busy}
            busyOp={busyOp}
            cta={cta}
            onCtaClick={onCtaClick}
            onGoToPlans={() => setTab("profiles")}
          />
        )}

        {tab === "profiles" && (
          <BotPlansTab
            profiles={profiles}
            tier={tierState?.tier ?? "free"}
            caps={caps}
            busy={busy}
            phase={phase}
            selectedProfileId={selectedProfileId}
            runningProfileId={status?.profileId ?? null}
            onSelect={setExplicitSelection}
            send={send}
          />
        )}

        {tab === "reports" && <BotReportsTab caps={caps} reports={reports} reportDetail={reportDetail} getHandle={getHandle} />}

        {tab === "packages" && <BotPackagesTab tierState={tierState} nowMs={nowMs} busy={busy} phase={phase} send={send} />}
      </BotHubWindow>
    </Panel>
  );
}
