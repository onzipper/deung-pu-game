"use client";

// M4 แท็บ "แพ็กเกจ" — 3 tier card (headline ตามพฤติกรรมจริง, Free ต้องดูใช้งานได้จริง) + ตารางเทียบ
// (botTierComparisonRows) + แถว "พลังต่อสู้และรางวัล: เท่ากันทุกแพ็กเกจ" เด่นชัด + ปุ่มซื้อ [MOCK] + confirm
// (D-061 disclaimer คงไว้). gold accent (--dp-legendary-gold) ใช้เฉพาะ Pro card — ห้าม gold เป็น primary CTA
// (ปุ่มซื้อทุกใบยังใช้ variant="secondary" เหมือนเดิม ไม่ใช่ gold-filled button).

import { useEffect, useState } from "react";
import type { BotTierStateMessage, BotTierWire } from "@/shared/net-protocol";
import { Button, ConfirmDialog } from "@/ui/components";
import { hudIconUrl, type HudIconId } from "@/ui/panels/hud-icon-catalog";
import { botTierComparisonRows, botTierLabel, formatPassExpiry, resolveBotPurchaseConfirmation, type BotOpPhase } from "../bot-view";
import type { BotNet } from "../BotPanel";

const TIER_HEADLINE: Readonly<Record<BotTierWire, string>> = {
  free: "ฟาร์มพื้นฐานครบวงจร",
  plus: "ฟาร์มแม่นยำและกลับมาทำต่อเร็วขึ้น",
  pro: "จัดการแผน AFK หลายขั้นให้ครบวงจร",
};

// M5 §5: โล่ tier — icon_hud_tier_<tier>_v01.svg (pro = gold, ดู hud-icon-catalog.ts)
const TIER_SHIELD_ICON: Readonly<Record<BotTierWire, HudIconId>> = {
  free: "tier_free",
  plus: "tier_plus",
  pro: "tier_pro",
};

export interface BotPackagesTabProps {
  tierState: BotTierStateMessage | null;
  nowMs: number;
  busy: boolean;
  phase: BotOpPhase;
  send: (op: string, fn: (net: BotNet) => void) => void;
}

export function BotPackagesTab({ tierState, nowMs, busy, phase, send }: BotPackagesTabProps) {
  const [purchaseConfirm, setPurchaseConfirm] = useState<{ tier: BotTierWire; days: number; lostDays: number } | null>(null);

  useEffect(() => {
    if (phase.kind !== "settled" || !phase.result.ok || phase.result.op !== "mockPurchase") return;
    // deferred setState (react-hooks/set-state-in-effect) — pattern เดียวกับ BotPanel.tsx เดิม (PR7)
    const timer = setTimeout(() => setPurchaseConfirm(null), 0);
    return () => clearTimeout(timer);
  }, [phase]);

  const onBuyPass = (tier: BotTierWire, days: number): void => {
    const confirm = resolveBotPurchaseConfirmation(tierState, tier, nowMs);
    if (confirm.needsConfirm) {
      setPurchaseConfirm({ tier, days, lostDays: confirm.lostDays ?? 0 });
      return;
    }
    send("mockPurchase", (net) => net.sendBotMockPurchase({ tier, days }));
  };

  const plans = tierState?.plans ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.tier}
            className={[
              "flex flex-col gap-1.5 rounded-(--dp-radius-sm) border bg-(--dp-warm-ink) px-3 py-2",
              plan.tier === "pro" ? "border-(--dp-legendary-gold)" : "border-(--dp-soil-brown)",
            ].join(" ")}
          >
            <span className="flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative tier glyph, closed icon set (hud-icon-catalog.ts) */}
              <img src={hudIconUrl(TIER_SHIELD_ICON[plan.tier])} alt="" aria-hidden className="h-5 w-5 shrink-0" />
              <span className={plan.tier === "pro" ? "text-(--dp-legendary-gold)" : "text-(--dp-highlight)"}>{botTierLabel(plan.tier)}</span>
            </span>
            <span className="dp-text-caption text-(--dp-parchment)">{TIER_HEADLINE[plan.tier]}</span>
            {tierState?.tier === plan.tier && (
              <span className="dp-text-caption text-(--dp-pale-moss)">tier ปัจจุบัน · {formatPassExpiry(tierState.passExpiresAt, nowMs)}</span>
            )}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-105 text-left">
          <thead>
            <tr className="text-(--dp-sand)">
              <th className="py-1 pr-2 font-normal">ความสามารถ</th>
              {plans.map((p) => (
                <th key={p.tier} className={["px-2 py-1 text-center font-semibold", p.tier === "pro" ? "text-(--dp-legendary-gold)" : "text-(--dp-highlight)"].join(" ")}>
                  <span className="inline-flex items-center gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- decorative tier glyph, closed icon set (hud-icon-catalog.ts) */}
                    <img src={hudIconUrl(TIER_SHIELD_ICON[p.tier])} alt="" aria-hidden className="h-4 w-4 shrink-0" />
                    {botTierLabel(p.tier)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {botTierComparisonRows(plans).map((row) => (
              <tr key={row.label} className="border-t border-(--dp-soil-brown)">
                <td className="py-1 pr-2 text-(--dp-parchment)">{row.label}</td>
                {plans.map((p) => (
                  <td key={p.tier} className="px-2 py-1 text-center tabular-nums text-(--dp-parchment)">
                    {row.values[p.tier]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {plans.filter((p) => p.passes.length > 0).map((plan) => (
        <div key={plan.tier} className="flex flex-col gap-2 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-warm-ink) px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className={plan.tier === "pro" ? "text-(--dp-legendary-gold)" : "text-(--dp-highlight)"}>{botTierLabel(plan.tier)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {plan.passes.map((pass) => (
              <Button key={pass.days} variant="secondary" size="sm" disabled={busy} onClick={() => onBuyPass(plan.tier, pass.days)}>
                [MOCK] ซื้อ {pass.days} วัน ({pass.priceThb}฿)
              </Button>
            ))}
          </div>
        </div>
      ))}

      <div className="dp-text-caption text-(--dp-fire-light)">ทดสอบ — ยังไม่ตัดเงินจริง (D-061)</div>
      <div className="dp-text-caption text-(--dp-sand)">Free ใช้ได้ตลอดไป 24/7 — จ่ายเพื่อความสะดวก (หลายแผน, กฎเยอะ, รายงานยาว)</div>

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
    </div>
  );
}
