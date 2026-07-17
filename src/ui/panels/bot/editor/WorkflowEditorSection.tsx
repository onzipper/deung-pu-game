"use client";

// M4 Plans editor — คอลัมน์ขวา "Workflow editor (Pro)": migrate ทั้ง logic เดิมจาก BotPanel.tsx (PR6b/PR7,
// add farm/town/branch step, branch เลือกเงื่อนไข + then/else) มาไว้ที่นี่ — เนื้อหาเหมือนเดิมทุกประการ
// (ไม่มีการเปลี่ยนพฤติกรรม แค่แยกไฟล์). ชนกับ goal เดี่ยวไม่ได้ (hasGoalWorkflowConflict, CompletionSection ปิด
// ตัวเองให้เมื่อ workflow มี step แล้ว — ที่นี่เตือนกลับตอน goal ยังตั้งอยู่).

import {
  BOT_WORKFLOW_GOAL_TYPES,
  BOT_WORKFLOW_MAX_STEPS_CLIENT,
  BOT_WORKFLOW_METRIC_LABELS,
  addWorkflowStep,
  botWorkflowStepLabel,
  hasGoalWorkflowConflict,
  newWorkflowBranchStep,
  newWorkflowFarmStep,
  newWorkflowTownStep,
  nextWorkflowStepId,
  removeWorkflowStep,
  setWorkflowBranchTarget,
  setWorkflowBranchWhen,
  setWorkflowFarmGoal,
  workflowBranchTargetOptions,
  type BotRulesWire,
  type BotTierWire,
} from "../bot-view";
import { BOT_EDITOR_NUMBER_INPUT_CLASS, BOT_EDITOR_SECTION_CARD_CLASS, BOT_EDITOR_SELECT_CLASS } from "../bot-layout";
import { Button } from "@/ui/components";
import type { BotWorkflowMetric, BotWorkflowV1 } from "@/shared/bot-workflow";

export interface WorkflowEditorSectionProps {
  tier: BotTierWire;
  mapId: string;
  pocketId: string;
  rules: BotRulesWire;
  disabled: boolean;
  onChange: (rules: BotRulesWire) => void;
}

function goalMinutesOrCount(target: number, type: BotWorkflowMetric): number {
  return type === "durationMs" ? Math.round(target / 60000) : target;
}

export function WorkflowEditorSection({ tier, mapId, pocketId, rules, disabled, onChange }: WorkflowEditorSectionProps) {
  const isPro = tier === "pro";
  const workflow = rules.workflow;

  const updateWorkflow = (next: BotWorkflowV1 | undefined): void => onChange({ ...rules, workflow: next });

  return (
    <div className={BOT_EDITOR_SECTION_CARD_CLASS}>
      <div className="flex items-center justify-between gap-2">
        <span className="dp-text-label text-(--dp-sand)">งานหลายขั้น (Pro)</span>
        {!isPro && <span className="dp-text-caption text-(--dp-fire-light)">🔒 Pro</span>}
      </div>

      {hasGoalWorkflowConflict(rules) && (
        <div className="dp-text-caption text-(--dp-danger-red)">ปิดเป้าหมายเดี่ยว (ครบเป้าหมาย) ก่อน ถึงจะตั้งงานหลายขั้นได้</div>
      )}

      {isPro ? (
        <>
          {(workflow?.steps ?? []).map((step, i) => (
            <div key={step.id} className="flex flex-col gap-1 border-b border-(--dp-soil-brown) pb-1.5 last:border-b-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-(--dp-parchment)">{botWorkflowStepLabel(step, i)}</span>
                <button
                  type="button"
                  aria-label="ลบขั้น"
                  disabled={disabled}
                  onClick={() => updateWorkflow(removeWorkflowStep(workflow!, i))}
                  className="dp-focus-ring shrink-0 rounded-(--dp-radius-sm) px-1.5 text-(--dp-sand) hover:text-(--dp-danger-red)"
                >
                  ✕
                </button>
              </div>

              {step.kind === "farm" && (
                <div className="flex gap-2">
                  <select
                    value={step.goal.type}
                    disabled={disabled}
                    onChange={(e) =>
                      updateWorkflow(
                        setWorkflowFarmGoal(workflow!, i, e.target.value as BotWorkflowMetric, goalMinutesOrCount(step.goal.target, step.goal.type)),
                      )
                    }
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
                    value={goalMinutesOrCount(step.goal.target, step.goal.type)}
                    onChange={(e) => updateWorkflow(setWorkflowFarmGoal(workflow!, i, step.goal.type, Number(e.target.value)))}
                    className={`${BOT_EDITOR_NUMBER_INPUT_CLASS} w-20`}
                  />
                </div>
              )}

              {step.kind === "branch" && (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <select
                      value={step.when.type}
                      disabled={disabled}
                      onChange={(e) =>
                        updateWorkflow(
                          setWorkflowBranchWhen(workflow!, i, e.target.value as BotWorkflowMetric, goalMinutesOrCount(step.when.target, step.when.type)),
                        )
                      }
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
                      value={goalMinutesOrCount(step.when.target, step.when.type)}
                      onChange={(e) => updateWorkflow(setWorkflowBranchWhen(workflow!, i, step.when.type, Number(e.target.value)))}
                      className={`${BOT_EDITOR_NUMBER_INPUT_CLASS} w-20`}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-(--dp-sand)">
                    <span>ผ่าน→</span>
                    <select
                      value={step.thenStepId}
                      disabled={disabled}
                      onChange={(e) => updateWorkflow(setWorkflowBranchTarget(workflow!, i, "then", e.target.value))}
                      className={BOT_EDITOR_SELECT_CLASS}
                    >
                      {workflowBranchTargetOptions(workflow!, i).map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <span>ไม่ผ่าน→</span>
                    <select
                      value={step.elseStepId}
                      disabled={disabled}
                      onChange={(e) => updateWorkflow(setWorkflowBranchTarget(workflow!, i, "else", e.target.value))}
                      className={BOT_EDITOR_SELECT_CLASS}
                    >
                      {workflowBranchTargetOptions(workflow!, i).map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || (workflow?.steps.length ?? 0) >= BOT_WORKFLOW_MAX_STEPS_CLIENT}
              onClick={() => updateWorkflow(addWorkflowStep(workflow, newWorkflowFarmStep(nextWorkflowStepId(workflow), mapId, pocketId)))}
            >
              + ขั้นฟาร์ม
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || (workflow?.steps.length ?? 0) >= BOT_WORKFLOW_MAX_STEPS_CLIENT}
              onClick={() => updateWorkflow(addWorkflowStep(workflow, newWorkflowTownStep(nextWorkflowStepId(workflow))))}
            >
              + ขั้นแวะเมือง
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || (workflow?.steps.length ?? 0) === 0 || (workflow?.steps.length ?? 0) >= BOT_WORKFLOW_MAX_STEPS_CLIENT}
              onClick={() => {
                if (!workflow || workflow.steps.length === 0) return;
                const targetId = workflow.steps[0].id;
                updateWorkflow(addWorkflowStep(workflow, newWorkflowBranchStep(nextWorkflowStepId(workflow), { type: "kills", target: 1 }, targetId, targetId)));
              }}
            >
              + ขั้นเงื่อนไข
            </Button>
          </div>
          <div className="dp-text-caption text-(--dp-sand)">
            ว่างไว้ = ฟาร์มจุดเดียวตามคอลัมน์ซ้าย · ขั้นฟาร์มใหม่ใช้ map/pocket ที่เลือกไว้ · ขั้นเงื่อนไขต้องมีขั้นอื่นอยู่ก่อนให้ชี้ไป
          </div>
        </>
      ) : (
        <div className="dp-text-caption text-(--dp-sand)">ให้บอททำงานหลายขั้นต่อเนื่อง (ฟาร์มครบเป้า → แวะเมือง → ทำต่อ) — เฉพาะแพ็กเกจ Pro</div>
      )}
    </div>
  );
}
