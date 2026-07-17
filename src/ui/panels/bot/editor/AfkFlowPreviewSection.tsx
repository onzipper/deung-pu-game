"use client";

// M4 Plans editor — คอลัมน์ขวา "AFK flow preview" (afkFlowStepsFor, presentation-only) + "สิ่งที่ปลดล็อคเมื่อ
// อัปเกรด" (lockedBotFeaturesFor) — ไม่ใช่ purchase modal เอง แค่ทีเซอร์ให้เห็น ไม่ dark-pattern (owner brief).

import { afkFlowStepsFor, lockedBotFeaturesFor, type BotRulesWire, type BotTierWire } from "../bot-view";
import { BOT_EDITOR_SECTION_CARD_CLASS } from "../bot-layout";
import { LockedBadge } from "../LockedBadge";

export interface AfkFlowPreviewSectionProps {
  tier: BotTierWire;
  rules: BotRulesWire;
}

export function AfkFlowPreviewSection({ tier, rules }: AfkFlowPreviewSectionProps) {
  const steps = afkFlowStepsFor(tier, rules);
  const locked = lockedBotFeaturesFor(tier);

  return (
    <div className={BOT_EDITOR_SECTION_CARD_CLASS}>
      <div className="dp-text-label text-(--dp-sand)">ลำดับที่บอทจะทำ (โดยสรุป)</div>
      <ol className="list-inside list-decimal text-(--dp-parchment)">
        {steps.map((step) => (
          <li key={step.key}>{step.label}</li>
        ))}
      </ol>

      {locked.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-(--dp-soil-brown) pt-2">
          <div className="dp-text-label text-(--dp-sand)">สิ่งที่ปลดล็อคเมื่ออัปเกรด</div>
          {locked.map((f) => (
            <div key={f.feature} className="dp-text-caption flex items-center justify-between gap-2 text-(--dp-parchment)">
              <span>{f.label}</span>
              <LockedBadge requiredTierLabel={f.requiredTierLabel} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
