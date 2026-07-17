"use client";

// M4 Plans editor — คอลัมน์กลาง "ครบเป้าหมาย": เป้าหมายเดี่ยว (Plus+) + action เมื่อครบเป้า. ชนกับ workflow
// (Pro หลายขั้น) ไม่ได้ — mirror server "goal_conflicts_workflow" (hasGoalWorkflowConflict, bot-view.ts).

import {
  BOT_COMPLETION_ACTION_LABELS,
  BOT_WORKFLOW_GOAL_TYPES,
  BOT_WORKFLOW_METRIC_LABELS,
  hasWorkflow,
  lockedControlFor,
  setBotCompletionAction,
  setBotGoal,
  type BotRulesWire,
  type BotTierWire,
} from "../bot-view";
import { BOT_EDITOR_NUMBER_INPUT_CLASS, BOT_EDITOR_SECTION_CARD_CLASS, BOT_EDITOR_SELECT_CLASS } from "../bot-layout";
import { LockedBadge } from "../LockedBadge";
import type { BotCompletionActionWire } from "@/shared/net-protocol";
import type { BotWorkflowMetric } from "@/shared/bot-workflow";

export interface CompletionSectionProps {
  rules: BotRulesWire;
  tier: BotTierWire;
  disabled: boolean;
  onChange: (rules: BotRulesWire) => void;
}

const DEFAULT_GOAL_TARGET: Readonly<Record<BotWorkflowMetric, number>> = { kills: 50, gold: 1000, exp: 1000, durationMs: 5 * 60000 };

function goalMinutesOrCount(target: number, type: BotWorkflowMetric): number {
  return type === "durationMs" ? Math.round(target / 60000) : target;
}

export function CompletionSection({ rules, tier, disabled, onChange }: CompletionSectionProps) {
  const lock = lockedControlFor(tier, "goal");
  const workflowActive = hasWorkflow(rules);
  const goal = rules.goal;

  return (
    <div className={BOT_EDITOR_SECTION_CARD_CLASS}>
      <div className="flex items-center justify-between gap-2">
        <span className="dp-text-label text-(--dp-sand)">ครบเป้าหมาย</span>
        {lock.locked && lock.requiredTierLabel && <LockedBadge requiredTierLabel={lock.requiredTierLabel} />}
      </div>

      {workflowActive ? (
        <div className="dp-text-caption text-(--dp-sand)">ปิดใช้งาน — แผนนี้ตั้งงานหลายขั้นไว้แล้ว (เลือกได้อย่างใดอย่างหนึ่ง)</div>
      ) : (
        <>
          <label className={["flex items-center gap-1.5", lock.locked ? "text-(--dp-sand) opacity-60" : "text-(--dp-parchment)"].join(" ")}>
            <input
              type="checkbox"
              checked={!!goal}
              disabled={disabled || lock.locked}
              onChange={(e) => onChange(setBotGoal(rules, e.target.checked ? { type: "kills", target: DEFAULT_GOAL_TARGET.kills } : null))}
              className="h-4 w-4 accent-(--dp-resonance-teal)"
            />
            ตั้งเป้าหมาย
          </label>

          {goal && !lock.locked && (
            <>
              <div className="flex gap-2">
                <select
                  value={goal.type}
                  disabled={disabled}
                  onChange={(e) => {
                    const type = e.target.value as BotWorkflowMetric;
                    onChange(setBotGoal(rules, { type, target: DEFAULT_GOAL_TARGET[type] }));
                  }}
                  className={BOT_EDITOR_SELECT_CLASS}
                >
                  {BOT_WORKFLOW_GOAL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {BOT_WORKFLOW_METRIC_LABELS[t]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  disabled={disabled}
                  value={goalMinutesOrCount(goal.target, goal.type)}
                  onChange={(e) => {
                    const raw = Math.max(1, Math.round(Number(e.target.value)));
                    const target = goal.type === "durationMs" ? raw * 60000 : raw;
                    onChange(setBotGoal(rules, { type: goal.type, target }));
                  }}
                  className={`${BOT_EDITOR_NUMBER_INPUT_CLASS} w-20`}
                />
              </div>
              <select
                value={rules.completionAction ?? "safe_stop"}
                disabled={disabled}
                onChange={(e) => onChange(setBotCompletionAction(rules, e.target.value as BotCompletionActionWire))}
                className={BOT_EDITOR_SELECT_CLASS}
              >
                {(Object.keys(BOT_COMPLETION_ACTION_LABELS) as BotCompletionActionWire[]).map((action) => (
                  <option key={action} value={action}>
                    {BOT_COMPLETION_ACTION_LABELS[action]}
                  </option>
                ))}
              </select>
            </>
          )}
        </>
      )}
    </div>
  );
}
