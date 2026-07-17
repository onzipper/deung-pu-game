"use client";

// M4 แท็บ "รายงาน" — เดิม (§8) แทบทั้งหมด, ย้ายมาเป็น component แยก. ขอ report list ใหม่ตอน mount (เทียบเท่า
// "สลับมาแท็บนี้" ของเดิม เพราะแท็บที่ไม่ active ไม่ถูก mount — BotHubWindow render เฉพาะแท็บที่เลือกอยู่).
//
// NOTE (deviation จากบรีฟ, บอก orchestrator แล้ว): บรีฟขอ "แถว stats ใหม่เฉพาะเมื่อมีข้อมูลจริง" แต่
// BotReportSummaryWire/BotReportDetailWire (src/shared/net-protocol.ts) ยังไม่มี field `stats` เลยตอนนี้ —
// bot:status.stats (M1) มีแค่ฝั่ง live status เท่านั้น ยังไม่ถูกส่งมากับ report. เทียบเท่ากับ "ไม่มีข้อมูลจริง
// เสมอ" อยู่แล้ว — ไม่มีอะไรให้เพิ่ม (จะเพิ่มได้ทันทีที่ server เติม field มา ผ่าน formatBotStats เดิม).

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import type { BotReportDetailWire, BotReportSummaryWire, BotTierCapsWire } from "@/shared/net-protocol";
import { formatEpochMs, reportStopReasonLabel } from "../bot-view";

export interface BotReportsTabProps {
  caps: BotTierCapsWire | null;
  reports: BotReportSummaryWire[] | null;
  reportDetail: BotReportDetailWire | null;
  getHandle: () => EngineHandle | null;
}

export function BotReportsTab({ caps, reports, reportDetail, getHandle }: BotReportsTabProps) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => getHandle()?.net?.sendBotReportList(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
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
  );
}
