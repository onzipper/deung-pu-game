"use client";

// M5 §5: locked-control badge — icon (svg/ui/icon_hud_lock_v01.svg) แทน emoji 🔒 เดิม, ใช้ร่วมกันทุกจุดที่
// editor แสดง "ฟีเจอร์นี้ล็อกอยู่ ต้อง tier X" (TargetSection/CompletionSection/WorkflowEditorSection/
// AfkFlowPreviewSection) — กัน markup ซ้ำ 4 ที่.

import { hudIconUrl } from "@/ui/panels/hud-icon-catalog";

export interface LockedBadgeProps {
  /** ป้าย tier ที่ต้องการ (เช่น "Plus"/"Pro") */
  requiredTierLabel: string;
  className?: string;
}

export function LockedBadge({ requiredTierLabel, className }: LockedBadgeProps) {
  return (
    <span className={`dp-text-caption inline-flex items-center gap-1 text-(--dp-fire-light) ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative inline glyph, closed icon set (hud-icon-catalog.ts) */}
      <img src={hudIconUrl("lock")} alt="" aria-hidden className="h-3.5 w-3.5 shrink-0" />
      {requiredTierLabel}
    </span>
  );
}
