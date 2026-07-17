"use client";

// M4 Plans editor — คอลัมน์กลาง "เสบียง (ยา)": เปิด/ปิด auto-potion + slider threshold (%HP), ซื้อคืนถึง
// (potionRestockTarget) + สำรองขั้นต่ำก่อนแวะเมือง (potionLowReserve) — ทุก tier ใช้ได้ (M1 Free ก็มี auto-potion
// แล้ว). ว่างไว้ (null) = ใช้ค่า default ของ server config (Design Knob, ไม่ hardcode ตัวเลขฝั่ง client).

import { setBotPotionReserve, setBotPotionRestock, setBotPotionThreshold, type BotRulesWire } from "../bot-view";
import { BOT_EDITOR_NUMBER_INPUT_CLASS, BOT_EDITOR_SECTION_CARD_CLASS } from "../bot-layout";

export interface SupplySectionProps {
  rules: BotRulesWire;
  disabled: boolean;
  onChange: (rules: BotRulesWire) => void;
}

const DEFAULT_THRESHOLD_PCT = 30;

export function SupplySection({ rules, disabled, onChange }: SupplySectionProps) {
  const enabled = rules.potionThresholdPct != null;

  return (
    <div className={BOT_EDITOR_SECTION_CARD_CLASS}>
      <div className="dp-text-label text-(--dp-sand)">เสบียง (ยา)</div>

      <label className="flex items-center gap-1.5 text-(--dp-parchment)">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => onChange(setBotPotionThreshold(rules, e.target.checked ? DEFAULT_THRESHOLD_PCT : null))}
          className="h-4 w-4 accent-(--dp-resonance-teal)"
        />
        ใช้ยาอัตโนมัติเมื่อ HP ต่ำกว่า
      </label>

      {enabled && (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={5}
            max={80}
            step={5}
            disabled={disabled}
            value={rules.potionThresholdPct ?? DEFAULT_THRESHOLD_PCT}
            onChange={(e) => onChange(setBotPotionThreshold(rules, Number(e.target.value)))}
            className="flex-1 accent-(--dp-resonance-teal)"
          />
          <span className="w-12 shrink-0 text-right tabular-nums text-(--dp-highlight)">
            {rules.potionThresholdPct ?? DEFAULT_THRESHOLD_PCT}%
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-(--dp-sand)">
          <span className="dp-text-caption">ซื้อคืนถึง</span>
          <input
            type="number"
            min={0}
            disabled={disabled}
            value={rules.potionRestockTarget ?? ""}
            placeholder="ค่าเริ่มต้น"
            onChange={(e) => onChange(setBotPotionRestock(rules, e.target.value === "" ? null : Number(e.target.value)))}
            className={BOT_EDITOR_NUMBER_INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1 text-(--dp-sand)">
          <span className="dp-text-caption">สำรองขั้นต่ำก่อนแวะเมือง</span>
          <input
            type="number"
            min={0}
            disabled={disabled}
            value={rules.potionLowReserve ?? ""}
            placeholder="ค่าเริ่มต้น"
            onChange={(e) => onChange(setBotPotionReserve(rules, e.target.value === "" ? null : Number(e.target.value)))}
            className={BOT_EDITOR_NUMBER_INPUT_CLASS}
          />
        </label>
      </div>
    </div>
  );
}
