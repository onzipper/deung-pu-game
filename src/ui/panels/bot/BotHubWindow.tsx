"use client";

// M4 Bot Hub workspace shell content — sticky header (tier chip + วันหมดอายุ + tab bar เท่านั้น, FIX3
// bot-hub-connection-state 2026-07-17: micro-tutorial/op-result/connection banners ย้ายลง normal scroll flow
// ใต้ sticky แล้ว — เดิมอยู่ในก้อน sticky ทำให้ dynamic-height content ดันแถบ tab ทับเนื้อหา scroll ด้านล่าง)
// เหนือเนื้อหาแท็บที่ scroll ได้ในตัวเอง (PanelFrame `fill` มี scroll region เดียวอยู่แล้ว — sticky top-0 บน
// wrapper นี้พอ ไม่ต้องเพิ่ม scroll container ซ้อน). margin ติดลบชดเชย padding ของ PanelFrame (p-4 md:p-6)
// ให้แถบ sticky ชนขอบซ้าย-ขวาเต็ม panel.

import type { ReactNode } from "react";
import { Button } from "@/ui/components";
import { hudIconUrl } from "@/ui/panels/hud-icon-catalog";
import {
  BOT_TAB_LABELS,
  BOT_TAB_ORDER,
  BOT_TUTORIAL_SLIDES,
  botConnectionBannerMessage,
  botTierLabel,
  formatPassExpiry,
  type BotOpState,
  type BotTab,
  type BotTutorialState,
} from "./bot-view";
import type { BotTierStateMessage } from "@/shared/net-protocol";
import type { ConnectionStateView } from "@/ui/store/game-store";

// M5 §5: icon ประดับแท็บ (ตามเหมาะ) — เฉพาะ 2 แท็บที่มี icon ที่สื่อความหมายชัดพอ (แผนฟาร์ม = workflow node,
// รายงาน = ม้วนกระดาษ) — ภาพรวม/แพ็กเกจไม่มี icon เดี่ยวที่สื่อสารได้ดีกว่าข้อความเปล่า เลยเว้นว่างไว้.
const BOT_TAB_ICON: Partial<Record<BotTab, string>> = {
  profiles: hudIconUrl("workflow"),
  reports: hudIconUrl("report"),
};

export interface BotHubWindowProps {
  tab: BotTab;
  onTabChange: (tab: BotTab) => void;
  tierState: BotTierStateMessage | null;
  nowMs: number;
  /** fix(bot-hub-connection-state): drives the permanent (non-dismissible) connection banner below. */
  connectionState: ConnectionStateView;
  opMessage: string;
  opState: BotOpState;
  onDismissOpMessage: () => void;
  tutorial: BotTutorialState;
  tutorialSlide: number;
  onTutorialNext: () => void;
  onTutorialDismiss: () => void;
  onTutorialFinish: () => void;
  children: ReactNode;
}

export function BotHubWindow({
  tab,
  onTabChange,
  tierState,
  nowMs,
  connectionState,
  opMessage,
  opState,
  onDismissOpMessage,
  tutorial,
  tutorialSlide,
  onTutorialNext,
  onTutorialDismiss,
  onTutorialFinish,
  children,
}: BotHubWindowProps) {
  // fix(bot-hub-connection-state): permanent banner while not "online" — no close button (owner brief: player
  // must keep seeing it until the connection actually recovers, unlike the dismissible opMessage banner below).
  const connectionBanner = botConnectionBannerMessage(connectionState);

  return (
    <div className="dp-text-body-sm flex flex-col gap-3">
      {/* FIX3: sticky block holds ONLY the tier row + tab bar now — tutorial/op/connection banners are dynamic-
          height content that used to live here and push the tab row down over the scrolling content below it. */}
      <div className="sticky top-0 z-10 -mx-4 -mt-4 flex flex-col gap-2 border-b border-(--dp-deep-brown) bg-(--dp-panel-bg) px-4 pt-1 pb-2 md:-mx-6 md:-mt-6 md:px-6">
        {tierState && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-(--dp-highlight)">{botTierLabel(tierState.tier)}</span>
            <span className="dp-text-caption text-(--dp-sand)">{formatPassExpiry(tierState.passExpiresAt, nowMs)}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-1">
          {BOT_TAB_ORDER.map((t) => (
            <Button key={t} variant={tab === t ? "primary" : "ghost"} size="sm" onClick={() => onTabChange(t)}>
              {BOT_TAB_ICON[t] && (
                // eslint-disable-next-line @next/next/no-img-element -- decorative tab glyph, closed icon set (hud-icon-catalog.ts)
                <img src={BOT_TAB_ICON[t]} alt="" aria-hidden className="h-4 w-4 shrink-0" />
              )}
              {BOT_TAB_LABELS[t]}
            </Button>
          ))}
        </div>
      </div>

      {connectionBanner && (
        <div className="flex items-center gap-2 rounded-(--dp-radius-sm) border border-(--dp-fire-light) bg-(--dp-deep-ink) px-3 py-2 text-(--dp-parchment)">
          <span>{connectionBanner}</span>
        </div>
      )}

      {!tutorial.dismissed && (
        <div className="flex flex-col gap-2 rounded-(--dp-radius-sm) border border-(--dp-resonance-teal) bg-(--dp-deep-ink) px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="dp-text-label text-(--dp-resonance-light)">
              {BOT_TUTORIAL_SLIDES[tutorialSlide].title} ({tutorialSlide + 1}/{BOT_TUTORIAL_SLIDES.length})
            </span>
            <button
              type="button"
              aria-label="ข้ามการแนะนำ"
              onClick={onTutorialDismiss}
              className="dp-focus-ring shrink-0 rounded-(--dp-radius-sm) px-1.5 text-(--dp-sand) hover:text-(--dp-highlight)"
            >
              ✕
            </button>
          </div>
          <div className="text-(--dp-parchment)">{BOT_TUTORIAL_SLIDES[tutorialSlide].body}</div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onTutorialDismiss}>
              ข้าม
            </Button>
            {tutorialSlide < BOT_TUTORIAL_SLIDES.length - 1 ? (
              <Button variant="primary" size="sm" onClick={onTutorialNext}>
                ถัดไป
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={onTutorialFinish}>
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
              onClick={onDismissOpMessage}
              className="dp-focus-ring shrink-0 rounded-(--dp-radius-sm) px-1.5 text-(--dp-sand) hover:text-(--dp-highlight)"
            >
              ✕
            </button>
          )}
        </div>
      )}

      <div>{children}</div>
    </div>
  );
}
