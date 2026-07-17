"use client";

// Bot status chip (M5 §3) — bottom-left (desktop) widget เดี่ยว: "ผู้ช่วยนักล่า" + สถานะบรรทัดสอง + CTA เล็ก
// เดียวกับ Bot Hub (resolveBotCta/resolveBotCtaAction, bot-view.ts — single source, ไม่ derive CTA เอง).
// คลิก chip → เปิด Bot Hub. ต้องไม่ชน/ปนกับ AutoPilotChip (bottom-28 center, คนละระบบ, D-035/D-037) — วางคนละมุมเสมอ.
// แสดงเฉพาะ tierState !== null (server ตอบ bot:tierState แล้ว = online + ระบบบอทพร้อม — engine ยิง
// sendBotProfileList() ทุกครั้ง self เข้า room สำเร็จอยู่แล้ว, app.ts, ไม่ต้องรอเปิด Bot Hub ก่อน).
//
// mobile: joystick อยู่ซ้ายล่างแล้ว (VirtualJoystick.tsx) — ชิปนี้ขยับไปวางใต้ StatusCluster (บนซ้าย) แทน
// ไม่งั้นชนก้านบังคับ (ตำแหน่ง "bottom-left" ในสเปกหมายถึง desktop slot — deviation ที่ตั้งใจสำหรับ mobile).

import { useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import { usePanelManager, useIsMobilePanel } from "@/ui/panels";
import { useGameStore } from "@/ui/store/use-game-store";
import {
  selectBotAuthorityActive,
  selectBotCheckpoint,
  selectBotLastStopped,
  selectBotProfiles,
  selectBotStatus,
  selectBotTierState,
} from "@/ui/store/game-store";
import {
  BOT_PANEL_ID,
  botCtaButtonLabel,
  resolveActiveBotProfileId,
  resolveBotCta,
  resolveBotCtaAction,
  type BotCtaInput,
  type BotOpState,
} from "@/ui/panels/bot/bot-view";
import { BOT_CHIP_DOT_CLASS, botChipLine1, botChipLine2, resolveBotChipCategory } from "./bot-status-chip-view";

export interface BotStatusChipProps {
  getHandle: () => EngineHandle | null;
}

export function BotStatusChip({ getHandle }: BotStatusChipProps) {
  const manager = usePanelManager();
  const isMobile = useIsMobilePanel();
  const tierState = useGameStore(selectBotTierState);
  const profiles = useGameStore(selectBotProfiles);
  const status = useGameStore(selectBotStatus);
  const checkpoint = useGameStore(selectBotCheckpoint);
  const authorityActive = useGameStore(selectBotAuthorityActive);
  const lastStopped = useGameStore(selectBotLastStopped);
  // chip ไม่ track op phase เต็มแบบ Bot Hub (ไม่มี bot:opResult reconciliation ที่นี่) — busy เป็นแค่ debounce
  // สั้น ๆ กันกดซ้ำระหว่างรอ server ตอบ (authorityActive/status จะอัปเดตจริงตอนถัดไปอยู่แล้ว).
  const [busy, setBusy] = useState(false);

  if (!tierState) return null;

  const selectedProfileId = resolveActiveBotProfileId({ explicitSelection: null, profiles, status, checkpoint });
  const activeProfile = profiles?.find((p) => p.id === selectedProfileId) ?? null;
  const hasStartableProfile = !!profiles?.some((p) => !p.readOnly);

  const opState: BotOpState = busy ? "PROCESSING" : "IDLE";
  const ctaInput: BotCtaInput = {
    authorityActive,
    status,
    checkpoint,
    opState,
    hasStartableProfile,
    selectedProfileReadOnly: activeProfile?.readOnly ?? false,
  };
  const cta = resolveBotCta(ctaInput);

  const chipInput = { authorityActive, status, checkpoint, activeProfileName: activeProfile?.name ?? null };
  const category = resolveBotChipCategory(chipInput);
  const line2 = botChipLine2(category, chipInput, lastStopped?.reason);

  const onOpenHub = (): void => manager.openPanel(BOT_PANEL_ID);

  const onCtaClick = (): void => {
    const action = resolveBotCtaAction(cta, selectedProfileId, checkpoint);
    const net = getHandle()?.net;
    if (!action || !net) return;
    setBusy(true);
    if (action.kind === "stop") net.sendBotStop({});
    else if (action.kind === "resume") net.sendBotResume({ checkpointId: action.checkpointId });
    else net.sendBotStart({ profileId: action.profileId });
    setTimeout(() => setBusy(false), 1500); // เผื่อ round-trip เท่านั้น — server เป็น authority จริง
  };

  const positionClass = isMobile ? "fixed z-30" : "fixed bottom-4 left-4 z-30";
  const positionStyle = isMobile
    ? { top: "calc(env(safe-area-inset-top, 0px) + 92px)", left: "calc(env(safe-area-inset-left, 0px) + 16px)" }
    : undefined;

  return (
    <div
      className={`${positionClass} dp-shadow-raised pointer-events-auto flex max-w-[220px] items-center gap-2 rounded-(--dp-radius-md) border border-(--dp-warm-wood) bg-(--dp-deep-brown) px-3 py-2`}
      style={positionStyle}
    >
      <button
        type="button"
        onClick={onOpenHub}
        aria-label="เปิดผู้ช่วยนักล่า (บอท)"
        className="dp-focus-ring flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${BOT_CHIP_DOT_CLASS[category]}`} />
        <span className="flex min-w-0 flex-col">
          <span className="text-[11px] font-semibold text-(--dp-parchment)">{botChipLine1()}</span>
          <span className="truncate text-[11px] text-(--dp-sand)">{line2}</span>
        </span>
      </button>
      {!isMobile && (
        <button
          type="button"
          onClick={onCtaClick}
          disabled={!cta.enabled}
          className="dp-focus-ring shrink-0 rounded-(--dp-radius-sm) bg-(--dp-resonance-teal)/80 px-2 py-1 text-[11px] font-semibold text-(--dp-deep-brown) hover:bg-(--dp-resonance-teal) disabled:cursor-not-allowed disabled:opacity-50"
        >
          {botCtaButtonLabel(cta, busy)}
        </button>
      )}
    </div>
  );
}
