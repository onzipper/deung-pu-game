"use client";

// M4 Plans editor — คอลัมน์ซ้าย "พื้นที่ + เป้าหมาย": map → pocket (bot-safe เท่านั้น, mirror allow-list
// bot-view.ts BOT_ALLOWED_POCKETS) → target mode (ทุกตัวในพื้นที่ / เลือกเฉพาะชนิด, Plus+) → ถ้าเลือกเฉพาะชนิด
// โชว์ checkbox มอนของ pocket นั้นจริง ๆ (mobTypesForPocket, engine map data — ไม่ hardcode).
// locked control (SELECTED_TYPES ใน tier ต่ำกว่า Plus) ยังมองเห็นเสมอ (disabled + badge 🔒 tier) ไม่ซ่อน.

import {
  botMapLabel,
  botMapOptions,
  botPocketLabel,
  botPocketOptions,
  lockedControlFor,
  mobTypeLabel,
  setBotTargetMode,
  toggleSelectedMobType,
  type BotRulesWire,
  type BotTierWire,
} from "../bot-view";
import { BOT_EDITOR_SECTION_CARD_CLASS, BOT_EDITOR_SELECT_CLASS, mobTypesForPocket } from "../bot-layout";

export interface TargetSectionProps {
  mapId: string;
  pocketId: string;
  rules: BotRulesWire;
  tier: BotTierWire;
  disabled: boolean;
  onMapChange: (mapId: string, pocketId: string) => void;
  onPocketChange: (pocketId: string) => void;
  onRulesChange: (rules: BotRulesWire) => void;
}

export function TargetSection({ mapId, pocketId, rules, tier, disabled, onMapChange, onPocketChange, onRulesChange }: TargetSectionProps) {
  const lock = lockedControlFor(tier, "selected_types");
  const mobTypes = mobTypesForPocket(mapId, pocketId);
  const selected = rules.selectedMobTypes ?? [];

  return (
    <div className={BOT_EDITOR_SECTION_CARD_CLASS}>
      <div className="dp-text-label text-(--dp-sand)">พื้นที่ + เป้าหมาย</div>

      <select
        value={mapId}
        disabled={disabled}
        onChange={(e) => {
          const nextMap = e.target.value;
          onMapChange(nextMap, botPocketOptions(nextMap)[0] ?? "");
        }}
        className={BOT_EDITOR_SELECT_CLASS}
      >
        {botMapOptions().map((id) => (
          <option key={id} value={id}>
            {botMapLabel(id)}
          </option>
        ))}
      </select>

      <select value={pocketId} disabled={disabled} onChange={(e) => onPocketChange(e.target.value)} className={BOT_EDITOR_SELECT_CLASS}>
        {botPocketOptions(mapId).map((id) => (
          <option key={id} value={id}>
            {botPocketLabel(id)}
          </option>
        ))}
      </select>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-(--dp-parchment)">
          <input
            type="radio"
            name="bot-target-mode"
            checked={rules.targetMode !== "SELECTED_TYPES"}
            disabled={disabled}
            onChange={() => onRulesChange(setBotTargetMode(rules, "ALL_IN_AREA"))}
            className="h-4 w-4 accent-(--dp-resonance-teal)"
          />
          ทุกตัวในพื้นที่
        </label>
        <label className={["flex items-center gap-1.5", lock.locked ? "text-(--dp-sand) opacity-60" : "text-(--dp-parchment)"].join(" ")}>
          <input
            type="radio"
            name="bot-target-mode"
            checked={rules.targetMode === "SELECTED_TYPES"}
            disabled={disabled || lock.locked}
            onChange={() => onRulesChange(setBotTargetMode(rules, "SELECTED_TYPES"))}
            className="h-4 w-4 accent-(--dp-resonance-teal)"
          />
          เลือกเฉพาะชนิด
          {lock.locked && <span className="dp-text-caption text-(--dp-fire-light)">🔒 {lock.requiredTierLabel}</span>}
        </label>
      </div>

      {rules.targetMode === "SELECTED_TYPES" && !lock.locked && (
        <div className="flex flex-wrap gap-3">
          {mobTypes.length === 0 ? (
            <span className="dp-text-caption text-(--dp-sand)">พื้นที่นี้ยังไม่มีชนิดมอนให้เลือก</span>
          ) : (
            mobTypes.map((mobType) => (
              <label key={mobType} className="flex items-center gap-1.5 text-(--dp-parchment)">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={selected.includes(mobType)}
                  onChange={() => onRulesChange(toggleSelectedMobType(rules, mobType))}
                  className="h-4 w-4 accent-(--dp-resonance-teal)"
                />
                {mobTypeLabel(mobType)}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
