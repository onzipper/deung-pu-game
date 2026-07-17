/**
 * Character Autonomy multi-step workflow contract (PR6b · goal-chain engine).
 *
 * A Pro-tier "goal chain": an ordered list of steps the one real actor works through — farm a pocket until a goal
 * (kills / gold / exp / duration), warp to a sibling map, run a town service, or branch on progress. Stored inside
 * `bot_profiles.rulesJson` as the optional `workflow` field (NO new migration). The server is the only writer of
 * runtime state; this module is PURE (types + structural validation + progress math) so BOTH the server validator
 * (server/bot/profiles.ts) and the client mirror (src/ui/panels/bot/bot-view.ts) reuse the identical rules.
 *
 * Semantics (locked by the PR6b brief · checkpoint v15.5 §4.1-4.3):
 *   • A farm-step GOAL reads the PER-STEP delta of the session counters the runtime already tracks (kills/gold/exp)
 *     plus the clock — never a new world read. The goal is met at `metric >= target`.
 *   • A BRANCH `when` reads the CUMULATIVE session counters since the run started (whole-run progress), so a branch
 *     can steer on "have I earned enough overall". The same condition shape as a goal.
 *   • Every balance value (maxSteps, goal targets) is owner data / a Design Knob — never decided here.
 */

/** Contract version. Bumping this is a v15 §59.4 schema change (owner-gated). */
export const BOT_WORKFLOW_VERSION = 1 as const;

/** What a farm goal / branch condition measures. All read counters the runtime already tracks + the clock. */
export type BotWorkflowMetric = "kills" | "gold" | "exp" | "durationMs";
export const BOT_WORKFLOW_METRICS: readonly BotWorkflowMetric[] = ["kills", "gold", "exp", "durationMs"];

/** A threshold on one metric — met when the measured value reaches `target`. Shared by farm goals and branches. */
export interface BotWorkflowCondition {
  type: BotWorkflowMetric;
  /** positive integer target (kills/gold/exp count, or duration in ms). */
  target: number;
}

/** When a farm step gives up on its current pocket. Mirrors the runtime's terminal-condition detection. */
export type BotWorkflowFallbackWhen = "stuck" | "pocket_empty" | "death_capped";
export const BOT_WORKFLOW_FALLBACK_WHENS: readonly BotWorkflowFallbackWhen[] = [
  "stuck",
  "pocket_empty",
  "death_capped",
];

/** What the step does when a fallback fires. `switch_pocket` requires a bot-allowed `pocketId` on the step's map. */
export type BotWorkflowFallbackAction = "next_step" | "switch_pocket" | "stop";
export const BOT_WORKFLOW_FALLBACK_ACTIONS: readonly BotWorkflowFallbackAction[] = [
  "next_step",
  "switch_pocket",
  "stop",
];

export interface BotWorkflowFallback {
  when: BotWorkflowFallbackWhen;
  action: BotWorkflowFallbackAction;
  /** target pocket for `switch_pocket` (must be bot-allowed on the step's map); ignored otherwise. */
  pocketId?: string;
}

/** Farm a bot-allowed pocket until the goal is met; `fallbacks` handle a dry/blocked/death-capped pocket. */
export interface BotWorkflowFarmStep {
  id: string;
  kind: "farm";
  mapId: string;
  pocketId: string;
  goal: BotWorkflowCondition;
  fallbacks: BotWorkflowFallback[];
}

/** Reuse the whole D-069/D-070 town-service run (sell → deposit → restock → return). No extra parameters in v1. */
export interface BotWorkflowTownStep {
  id: string;
  kind: "town_service";
}

/** Pure decision: evaluate `when` on cumulative counters and jump to `thenStepId` (met) or `elseStepId`. */
export interface BotWorkflowBranchStep {
  id: string;
  kind: "branch";
  when: BotWorkflowCondition;
  thenStepId: string;
  elseStepId: string;
}

export type BotWorkflowStep = BotWorkflowFarmStep | BotWorkflowTownStep | BotWorkflowBranchStep;
export type BotWorkflowStepKind = BotWorkflowStep["kind"];

export interface BotWorkflowV1 {
  version: typeof BOT_WORKFLOW_VERSION;
  steps: BotWorkflowStep[];
}

/** Live cursor projection for status (shared shape reused by the wire). Branches resolve instantly → never here. */
export interface BotWorkflowStatusCursor {
  stepIndex: number;
  stepCount: number;
  stepKind: BotWorkflowStepKind;
  /** progress toward the current farm step's goal (0 for a town step); pairs with goalTarget. */
  goalDone: number;
  goalTarget: number;
}

// ── progress math (pure) ──────────────────────────────────────────────────────────────────────────────────────

/** One tick's measured progress. `elapsedMs` is per-step for a goal, whole-run for a branch (the caller decides). */
export interface BotWorkflowProgress {
  kills: number;
  gold: number;
  exp: number;
  elapsedMs: number;
}

/** The scalar a condition measures against its target. */
export function workflowMetricValue(progress: BotWorkflowProgress, metric: BotWorkflowMetric): number {
  switch (metric) {
    case "kills":
      return progress.kills;
    case "gold":
      return progress.gold;
    case "exp":
      return progress.exp;
    case "durationMs":
      return progress.elapsedMs;
  }
}

/** True once the measured metric reaches the condition target. */
export function workflowConditionMet(progress: BotWorkflowProgress, condition: BotWorkflowCondition): boolean {
  return workflowMetricValue(progress, condition.type) >= condition.target;
}

// ── structural validation (pure · allow-list injected) ─────────────────────────────────────────────────────────

export type WorkflowValidationReason = "workflow_map_not_allowed" | "workflow_invalid_step";

export interface WorkflowValidationOptions {
  /** Design Knob (server/config/bot.ts workflow.maxSteps) — max steps a chain may hold. */
  maxSteps: number;
  /** the bot-safe pocket allow-list (server config, or the client mirror). */
  isAllowedPocket: (mapId: string, pocketId: string) => boolean;
}

export type WorkflowValidation =
  | { ok: true; workflow: BotWorkflowV1; stepCount: number }
  | { ok: false; reason: WorkflowValidationReason };

const METRIC_SET: ReadonlySet<string> = new Set(BOT_WORKFLOW_METRICS);
const FALLBACK_WHEN_SET: ReadonlySet<string> = new Set(BOT_WORKFLOW_FALLBACK_WHENS);
const FALLBACK_ACTION_SET: ReadonlySet<string> = new Set(BOT_WORKFLOW_FALLBACK_ACTIONS);

/**
 * True when `raw` is a well-formed condition/goal: a known metric + a positive-integer target. Exported so the
 * Plus single-goal validator (server/bot/profiles.ts) reuses the identical goal shape/check (no duplicate rule).
 */
export function isValidWorkflowCondition(raw: unknown): raw is BotWorkflowCondition {
  if (typeof raw !== "object" || raw === null) return false;
  const c = raw as Record<string, unknown>;
  return (
    typeof c.type === "string" &&
    METRIC_SET.has(c.type) &&
    typeof c.target === "number" &&
    Number.isInteger(c.target) &&
    c.target > 0
  );
}

/**
 * Validate + sanitize a raw workflow payload against the allow-list + maxSteps. Structural failures (bad shape,
 * bad goal, empty/over-cap steps, duplicate ids, a branch target that does not exist, or a branch-only cycle with
 * no exit) all return `workflow_invalid_step`; a farm/switch_pocket pocket outside the bot allow-list returns
 * `workflow_map_not_allowed`. The tier gate + rule-cap counting live in the server validator (never here).
 */
export function validateWorkflow(raw: unknown, opts: WorkflowValidationOptions): WorkflowValidation {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "workflow_invalid_step" };
  const w = raw as Record<string, unknown>;
  if (w.version !== BOT_WORKFLOW_VERSION) return { ok: false, reason: "workflow_invalid_step" };
  if (!Array.isArray(w.steps)) return { ok: false, reason: "workflow_invalid_step" };
  if (w.steps.length < 1 || w.steps.length > opts.maxSteps) return { ok: false, reason: "workflow_invalid_step" };

  const ids = new Set<string>();
  const steps: BotWorkflowStep[] = [];
  for (const rawStep of w.steps) {
    if (typeof rawStep !== "object" || rawStep === null) return { ok: false, reason: "workflow_invalid_step" };
    const s = rawStep as Record<string, unknown>;
    if (typeof s.id !== "string" || s.id.length === 0 || s.id.length > 64 || ids.has(s.id)) {
      return { ok: false, reason: "workflow_invalid_step" };
    }
    ids.add(s.id);

    if (s.kind === "farm") {
      if (typeof s.mapId !== "string" || typeof s.pocketId !== "string") {
        return { ok: false, reason: "workflow_invalid_step" };
      }
      if (!opts.isAllowedPocket(s.mapId, s.pocketId)) return { ok: false, reason: "workflow_map_not_allowed" };
      if (!isValidWorkflowCondition(s.goal)) return { ok: false, reason: "workflow_invalid_step" };
      const fallbacks = sanitizeFallbacks(s.fallbacks, s.mapId, opts.isAllowedPocket);
      if (!fallbacks.ok) return { ok: false, reason: fallbacks.reason };
      steps.push({
        id: s.id,
        kind: "farm",
        mapId: s.mapId,
        pocketId: s.pocketId,
        goal: { type: (s.goal as BotWorkflowCondition).type, target: (s.goal as BotWorkflowCondition).target },
        fallbacks: fallbacks.list,
      });
    } else if (s.kind === "town_service") {
      steps.push({ id: s.id, kind: "town_service" });
    } else if (s.kind === "branch") {
      if (!isValidWorkflowCondition(s.when) || typeof s.thenStepId !== "string" || typeof s.elseStepId !== "string") {
        return { ok: false, reason: "workflow_invalid_step" };
      }
      steps.push({
        id: s.id,
        kind: "branch",
        when: { type: (s.when as BotWorkflowCondition).type, target: (s.when as BotWorkflowCondition).target },
        thenStepId: s.thenStepId,
        elseStepId: s.elseStepId,
      });
    } else {
      return { ok: false, reason: "workflow_invalid_step" };
    }
  }

  // Branch targets must reference real steps, and the branch-only subgraph must be acyclic (a jump chain always
  // reaches a farm/town step or the end — never spins forever within one tick).
  if (!branchTargetsResolve(steps, ids) || hasBranchOnlyCycle(steps)) {
    return { ok: false, reason: "workflow_invalid_step" };
  }

  return { ok: true, workflow: { version: BOT_WORKFLOW_VERSION, steps }, stepCount: steps.length };
}

function sanitizeFallbacks(
  raw: unknown,
  mapId: string,
  isAllowedPocket: (mapId: string, pocketId: string) => boolean,
): { ok: true; list: BotWorkflowFallback[] } | { ok: false; reason: WorkflowValidationReason } {
  if (!Array.isArray(raw)) return { ok: false, reason: "workflow_invalid_step" };
  const list: BotWorkflowFallback[] = [];
  const seen = new Set<string>();
  for (const rawFb of raw) {
    if (typeof rawFb !== "object" || rawFb === null) return { ok: false, reason: "workflow_invalid_step" };
    const f = rawFb as Record<string, unknown>;
    if (typeof f.when !== "string" || !FALLBACK_WHEN_SET.has(f.when)) return { ok: false, reason: "workflow_invalid_step" };
    if (typeof f.action !== "string" || !FALLBACK_ACTION_SET.has(f.action)) {
      return { ok: false, reason: "workflow_invalid_step" };
    }
    if (seen.has(f.when)) return { ok: false, reason: "workflow_invalid_step" }; // one fallback per trigger
    seen.add(f.when);
    const fb: BotWorkflowFallback = {
      when: f.when as BotWorkflowFallbackWhen,
      action: f.action as BotWorkflowFallbackAction,
    };
    if (fb.action === "switch_pocket") {
      if (typeof f.pocketId !== "string") return { ok: false, reason: "workflow_invalid_step" };
      if (!isAllowedPocket(mapId, f.pocketId)) return { ok: false, reason: "workflow_map_not_allowed" };
      fb.pocketId = f.pocketId;
    }
    list.push(fb);
  }
  return { ok: true, list };
}

function branchTargetsResolve(steps: readonly BotWorkflowStep[], ids: ReadonlySet<string>): boolean {
  for (const step of steps) {
    if (step.kind !== "branch") continue;
    if (!ids.has(step.thenStepId) || !ids.has(step.elseStepId)) return false;
  }
  return true;
}

/** True when following branch→branch then/else edges can loop forever (no farm/town step ever reached). */
function hasBranchOnlyCycle(steps: readonly BotWorkflowStep[]): boolean {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const state = new Map<string, 0 | 1 | 2>(); // 0/undefined = unvisited, 1 = on stack, 2 = done
  const dfs = (id: string): boolean => {
    const step = byId.get(id);
    if (!step || step.kind !== "branch") return false; // a farm/town step (or unknown) is an exit, not a cycle
    const s = state.get(id) ?? 0;
    if (s === 1) return true; // back edge to a branch on the current path → a branch-only cycle
    if (s === 2) return false;
    state.set(id, 1);
    const cyclic = dfs(step.thenStepId) || dfs(step.elseStepId);
    state.set(id, 2);
    return cyclic;
  };
  for (const step of steps) {
    if (step.kind === "branch" && dfs(step.id)) return true;
  }
  return false;
}

/** Index of a step id, or -1. Used by the runtime to resolve branch targets to a cursor position. */
export function workflowStepIndexById(workflow: BotWorkflowV1, id: string): number {
  return workflow.steps.findIndex((s) => s.id === id);
}
