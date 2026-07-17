"use client";

// M4 Plans editor — คอลัมน์กลาง "Recovery info ตาม tier": informational เท่านั้น (ไม่มีอะไรให้กด) — global
// safety stop เหมือนกันทุก tier + recovery ตาม tier (เดิมเป็นขั้นสุดท้ายของ wizard "นโยบายหยุด").

import { BOT_GLOBAL_SAFETY_STOP_REASONS, botStopReasonLabel, botTierRecoveryLabel, type BotTierWire } from "../bot-view";
import { BOT_EDITOR_SECTION_CARD_CLASS } from "../bot-layout";

export interface RecoverySectionProps {
  tier: BotTierWire;
}

export function RecoverySection({ tier }: RecoverySectionProps) {
  return (
    <div className={BOT_EDITOR_SECTION_CARD_CLASS}>
      <div className="dp-text-label text-(--dp-sand)">ระบบหยุดปลอดภัยอัตโนมัติเมื่อเจอ</div>
      <ul className="list-inside list-disc text-(--dp-parchment)">
        {BOT_GLOBAL_SAFETY_STOP_REASONS.map((reason) => (
          <li key={reason}>{botStopReasonLabel(reason)}</li>
        ))}
      </ul>
      <div className="dp-text-caption text-(--dp-sand)">{botTierRecoveryLabel(tier)}</div>
    </div>
  );
}
