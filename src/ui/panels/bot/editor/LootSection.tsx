"use client";

// M4 Plans editor — คอลัมน์กลาง "ของดรอป": เก็บของทั้งหมด (lootAll, v1 มีตัวเลือกเดียว) + สกิลที่ให้บอทใช้
// (S1-S4, mirror server MAX_SKILL_SLOTS gate — ต้องเลือกอย่างน้อย 1 ช่อง).

import { hasAtLeastOneSkillSlot, setBotLootAll, toggleBotSkillSlot, BOT_RULE_SKILL_SLOTS, type BotRulesWire } from "../bot-view";
import { BOT_EDITOR_SECTION_CARD_CLASS } from "../bot-layout";

export interface LootSectionProps {
  rules: BotRulesWire;
  disabled: boolean;
  onChange: (rules: BotRulesWire) => void;
}

export function LootSection({ rules, disabled, onChange }: LootSectionProps) {
  return (
    <div className={BOT_EDITOR_SECTION_CARD_CLASS}>
      <div className="dp-text-label text-(--dp-sand)">ของดรอป + สกิลที่ใช้</div>

      <label className="flex items-center gap-1.5 text-(--dp-parchment)">
        <input
          type="checkbox"
          checked={rules.lootAll}
          disabled={disabled}
          onChange={(e) => onChange(setBotLootAll(rules, e.target.checked))}
          className="h-4 w-4 accent-(--dp-resonance-teal)"
        />
        เก็บของทุกอย่างที่บอทฟาร์มได้
      </label>

      <div className="flex flex-wrap gap-3">
        {BOT_RULE_SKILL_SLOTS.map((slot) => (
          <label key={slot} className="flex items-center gap-1.5 text-(--dp-parchment)">
            <input
              type="checkbox"
              checked={rules.skillSlots.includes(slot)}
              disabled={disabled}
              onChange={() => onChange(toggleBotSkillSlot(rules, slot))}
              className="h-4 w-4 accent-(--dp-resonance-teal)"
            />
            S{slot + 1}
          </label>
        ))}
      </div>
      {!hasAtLeastOneSkillSlot(rules) && <div className="dp-text-caption text-(--dp-danger-red)">ต้องเลือกอย่างน้อย 1 สกิล</div>}
    </div>
  );
}
