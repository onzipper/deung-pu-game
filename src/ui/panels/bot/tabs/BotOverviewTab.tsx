"use client";

// M4 แท็บ "ภาพรวม" — active plan (map/pocket/target mode) + continuity/current action + HP%/ยา/กระเป๋า +
// kills/EXP/gold/uptime + goal/stats/workflow progress (เฉพาะเมื่อมีข้อมูลจริง) + CTA เดียวของทั้ง panel.
// tier chip/วันหมดอายุอยู่ที่ header ของ BotHubWindow แล้ว (เห็นทุกแท็บ) — ไม่ซ้ำที่นี่.

import type { BotCheckpointWire, BotProfileWire, BotStatusMessage, BotStoppedMessage, InventorySnapshot } from "@/shared/net-protocol";
import { Button } from "@/ui/components";
import {
  BOT_RESUME_REASSURANCE,
  botCheckpointRestartBadge,
  botCtaButtonLabel,
  botMapLabel,
  botPocketLabel,
  botStatusStateLabel,
  botStopReasonLabel,
  botTargetSummaryLabel,
  formatBotGoalProgress,
  formatDurationShort,
  formatHpPercent,
  formatWorkflowStepProgress,
  type BotCta,
} from "../bot-view";
import { bagUsageLabel, formatBotStats, potionCountFromBag } from "../bot-layout";

export interface BotOverviewTabProps {
  profiles: BotProfileWire[] | null;
  activeProfile: BotProfileWire | null;
  status: BotStatusMessage | null;
  lastStopped: BotStoppedMessage | null;
  checkpoint: BotCheckpointWire | null;
  authorityActive: boolean;
  inventory: InventorySnapshot | null;
  busy: boolean;
  cta: BotCta;
  onCtaClick: () => void;
  onGoToPlans: () => void;
}

export function BotOverviewTab({
  profiles,
  activeProfile,
  status,
  lastStopped,
  checkpoint,
  authorityActive,
  inventory,
  busy,
  cta,
  onCtaClick,
  onGoToPlans,
}: BotOverviewTabProps) {
  const potionCount = potionCountFromBag(inventory);
  const bagUsage = bagUsageLabel(inventory);
  const statRows = formatBotStats(status?.stats);

  return (
    <div className="flex flex-col gap-3">
      {/* CTA เดียวของทั้ง panel (product decision #1) — min-width กันปุ่มกระโดดขนาดตอนสลับ "เริ่มบอท"/"หยุดบอท" */}
      <div className="flex flex-col gap-1 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-3">
        <Button variant={cta.kind === "stop" ? "destructive" : "primary"} size="lg" fullWidth disabled={!cta.enabled} onClick={onCtaClick} className="min-w-[160px]">
          {botCtaButtonLabel(cta, busy)}
        </Button>
        {cta.disabledReason && <span className="dp-text-caption text-center text-(--dp-fire-light)">{cta.disabledReason}</span>}
        {cta.helperText && <span className="dp-text-caption text-center text-(--dp-resonance-light)">{cta.helperText}</span>}
      </div>

      {!profiles || profiles.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
          <span className="text-(--dp-sand)">ยังไม่มีแผน — สร้างแผนแรกที่แท็บ “แผนฟาร์ม”</span>
          <Button variant="secondary" size="sm" onClick={onGoToPlans}>
            ไปที่แผนฟาร์ม
          </Button>
        </div>
      ) : activeProfile ? (
        <div className="flex flex-col gap-1.5 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-(--dp-parchment)">{activeProfile.name}</span>
            <span className="dp-text-caption text-(--dp-sand)">
              {botMapLabel(activeProfile.mapId)} · {botPocketLabel(activeProfile.pocketId)}
            </span>
          </div>
          <div className="dp-text-caption text-(--dp-sand)">เป้าหมาย: {botTargetSummaryLabel(activeProfile.rules)}</div>
        </div>
      ) : null}

      {authorityActive && !status && (
        <div className="rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2 text-(--dp-resonance-light)">
          ตัวละครกำลังทำตามแผน — กำลังเชื่อมสถานะล่าสุด
        </div>
      )}

      {status ? (
        <div className="flex flex-col gap-1.5 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
          <div className="text-(--dp-resonance-light)">{botStatusStateLabel(status.continuity, status.action)}</div>
          {status.workflow && <div className="dp-text-caption text-(--dp-resonance-light)">{formatWorkflowStepProgress(status.workflow)}</div>}
          {status.goal && <div className="dp-text-caption text-(--dp-resonance-light)">เป้าหมาย: {formatBotGoalProgress(status.goal)}</div>}
          <div className="dp-text-caption text-(--dp-sand)">
            ฆ่า {status.killCount} · gold {status.goldEarned} · exp {status.expEarned} · HP {formatHpPercent(status.hpFraction)} · เวลา{" "}
            {formatDurationShort(status.uptimeMs)}
          </div>
          <div className="dp-text-caption text-(--dp-sand)">
            ยาในกระเป๋า {potionCount ?? "—"} · กระเป๋า {bagUsage ?? "—"}
          </div>
          {statRows.length > 0 && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-(--dp-soil-brown) pt-1.5">
              {statRows.map((row) => (
                <div key={row.key} className="dp-text-caption flex justify-between text-(--dp-sand)">
                  <span>{row.label}</span>
                  <span className="text-(--dp-parchment)">{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : checkpoint ? (
        <div className="flex flex-col gap-1.5 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
          <div className="text-(--dp-resonance-light)">
            {checkpoint.state === "saving" ? "กำลังบันทึกจุดทำงาน…" : checkpoint.state === "ready" ? "บันทึกจุดทำงานแล้ว — พร้อมทำต่อ" : "บันทึกจุดทำงานไม่สำเร็จ"}
          </div>
          {checkpoint.state !== "saving" && (
            <>
              {botCheckpointRestartBadge(checkpoint.kind) && (
                <div className="dp-text-caption text-(--dp-fire-light)">{botCheckpointRestartBadge(checkpoint.kind)}</div>
              )}
              <div className="dp-text-caption text-(--dp-sand)">{BOT_RESUME_REASSURANCE}</div>
            </>
          )}
        </div>
      ) : (
        inventory && (
          <div className="dp-text-caption text-(--dp-sand)">
            ยาในกระเป๋า {potionCount ?? "—"} · กระเป๋า {bagUsage ?? "—"}
          </div>
        )
      )}

      {lastStopped && !status && (
        <div className="rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2 text-(--dp-parchment)">
          หยุดล่าสุด: {botStopReasonLabel(lastStopped.reason)}
          <div className="dp-text-caption text-(--dp-sand)">
            ฆ่า {lastStopped.killCount} · gold {lastStopped.goldEarned} · exp {lastStopped.expEarned}
          </div>
        </div>
      )}
    </div>
  );
}
