"use client";

// M4 Plans editor shell — desktop 3 คอลัมน์ (ซ้าย: พื้นที่+เป้าหมาย · กลาง: ของดรอป/เสบียง/ครบเป้า/recovery ·
// ขวา: AFK preview/ปลดล็อค/workflow) ตาม BOT_PLAN_EDITOR_COLUMNS (bot-layout.ts, data-driven — mobile stack
// เดียวตาม botPlanEditorStackOrder). Controlled component ล้วน — ไม่มี state ของตัวเอง (state จริงอยู่
// BotPlansTab.tsx ตาม pattern "component render อย่างเดียว, business decision อยู่ bot-view/bot-layout").
//
// เดิม (PR7) เป็น wizard 5 ขั้น — ยุบเป็นฟอร์มหน้าเดียวแบ่ง section ตาม owner brief 2026-07-17 ("ตัดสินใจเองให้
// UX ดี แต่ flow สร้างแผนใหม่ต้องยังง่าย"): ทุก field เห็นพร้อมกัน ไม่ต้องกดถัดไป/ย้อนกลับ.

import { useMediaQuery } from "@/ui/panels/use-media-query";
import { Button, TextInput } from "@/ui/components";
import { countBotRules, ruleCountLabel, type BotRulesWire, type BotTierWire } from "../bot-view";
import {
  BOT_PLAN_EDITOR_COLUMNS,
  botPlanEditorStackOrder,
  isBotProfileFormValid,
  type BotPlanEditorColumnKey,
  type BotPlanEditorSectionId,
  type BotProfileFormState,
} from "../bot-layout";
import { TargetSection } from "./TargetSection";
import { LootSection } from "./LootSection";
import { SupplySection } from "./SupplySection";
import { CompletionSection } from "./CompletionSection";
import { RecoverySection } from "./RecoverySection";
import { AfkFlowPreviewSection } from "./AfkFlowPreviewSection";
import { WorkflowEditorSection } from "./WorkflowEditorSection";
import type { BotTierCapsWire } from "@/shared/net-protocol";

export interface BotPlanEditorProps {
  form: BotProfileFormState;
  tier: BotTierWire;
  caps: BotTierCapsWire | null;
  disabled: boolean;
  onChange: (form: BotProfileFormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

// mobile breakpoint ตรงกับ panel framework (Panel.tsx PANEL_MOBILE_QUERY) — workspace panel เต็มจอมือถือ
// จึง stack เดียวแทน 3 คอลัมน์เคียงกัน
const DESKTOP_GRID_QUERY = "(min-width: 768px)";

export function BotPlanEditor({ form, tier, caps, disabled, onChange, onCancel, onSubmit }: BotPlanEditorProps) {
  const isDesktop = useMediaQuery(DESKTOP_GRID_QUERY, false);

  const onRulesChange = (rules: BotRulesWire): void => onChange({ ...form, rules });

  const renderSection = (id: BotPlanEditorSectionId) => {
    switch (id) {
      case "target":
        return (
          <TargetSection
            key={id}
            mapId={form.mapId}
            pocketId={form.pocketId}
            rules={form.rules}
            tier={tier}
            disabled={disabled}
            onMapChange={(mapId, pocketId) => onChange({ ...form, mapId, pocketId })}
            onPocketChange={(pocketId) => onChange({ ...form, pocketId })}
            onRulesChange={onRulesChange}
          />
        );
      case "loot":
        return <LootSection key={id} rules={form.rules} disabled={disabled} onChange={onRulesChange} />;
      case "supply":
        return <SupplySection key={id} rules={form.rules} disabled={disabled} onChange={onRulesChange} />;
      case "completion":
        return <CompletionSection key={id} rules={form.rules} tier={tier} disabled={disabled} onChange={onRulesChange} />;
      case "recovery":
        return <RecoverySection key={id} tier={tier} />;
      case "afk_preview":
        return <AfkFlowPreviewSection key={id} tier={tier} rules={form.rules} />;
      case "upsell":
        return null; // รวมอยู่ใน AfkFlowPreviewSection แล้ว (ทีเซอร์ locked features) — กัน section ว่างซ้ำ
      case "workflow":
        return (
          <WorkflowEditorSection
            key={id}
            tier={tier}
            mapId={form.mapId}
            pocketId={form.pocketId}
            rules={form.rules}
            disabled={disabled}
            onChange={onRulesChange}
          />
        );
    }
  };

  const columns: readonly BotPlanEditorColumnKey[] = ["left", "middle", "right"];

  return (
    <div className="flex flex-col gap-3 rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-deep-ink) px-3 py-3">
      <TextInput
        placeholder="ชื่อแผน"
        value={form.name}
        maxLength={40}
        showCounter
        disabled={disabled}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
      />

      {isDesktop ? (
        <div className="grid grid-cols-3 gap-3">
          {columns.map((col) => (
            <div key={col} className="flex flex-col gap-3">
              {BOT_PLAN_EDITOR_COLUMNS[col].map(renderSection)}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">{botPlanEditorStackOrder().map(renderSection)}</div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="dp-text-caption text-(--dp-sand)">{caps ? ruleCountLabel(countBotRules(form.rules), caps.rules) : ""}</span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={disabled} onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={disabled || !isBotProfileFormValid(form, caps?.rules ?? null)}
            onClick={onSubmit}
          >
            {form.mode === "create" ? "สร้างแผน" : "บันทึก"}
          </Button>
        </div>
      </div>
    </div>
  );
}
