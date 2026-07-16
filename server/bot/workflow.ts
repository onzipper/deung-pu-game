// Character Autonomy Pro goal-chain engine (PR6b). Drives the ONE real actor through an ordered list of steps:
// farm a pocket until a goal, warp to a sibling map, run a town service, or branch on progress. Modeled on the
// TownTripController pattern (a narrow facade over the runtime + a per-step phase), so the runtime keeps its
// internals private and the whole engine is unit-testable through a real BotRuntime wired to a FakeWorld.
//
// Ownership: the SERVER is the only writer of runtime state; every continuity transition goes through the runtime's
// revision-fenced advance. The engine READS the session counters the runtime already tracks (kills/gold/exp) + the
// clock — it NEVER adds a world read. Free/Plus never carry a workflow; a Pro downgrade mid-run stops the chain.
//
// ⛔ SERVER-ONLY, but imports NOTHING room/schema (BotHost is a type-only import from runtime.ts).

import type { BotConfig, BotStopReason } from "../config/bot";
import type { Vec2 } from "./agent";
import type { BotHost } from "./runtime";
import type { BotContinuityOperationalStateWire } from "../../src/shared/bot-continuity";
import {
  workflowConditionMet,
  workflowStepIndexById,
  type BotWorkflowFallbackWhen,
  type BotWorkflowFarmStep,
  type BotWorkflowStatusCursor,
  type BotWorkflowStep,
  type BotWorkflowV1,
} from "../../src/shared/bot-workflow";
import { transferActor, type TransferResult } from "./warp";

/** Live per-run counters snapshot (whole run). The engine diffs it against a per-step base for goal progress. */
export interface WorkflowCounters {
  killCount: number;
  goldEarned: number;
  expEarned: number;
}

/**
 * The narrow runtime surface the engine drives. The runtime builds this from private closures (keeping its own
 * internals private); tests exercise the engine through a real BotRuntime wired to a FakeWorld.
 */
export interface WorkflowFacade {
  readonly config: BotConfig;
  readonly actorId: string;
  readonly sessionRowId: string;
  now(): number;
  runStartedAtMs(): number;
  isStopped(): boolean;
  /** cumulative session counters (whole run) — branch conditions read these; goals diff them against a step base. */
  counters(): WorkflowCounters;
  /** the host the runtime currently drives (rebinds across a cross-map warp). */
  currentHost(): BotHost;
  currentHostMapId(): string;
  /** force the farmed pocket for the current step (the recovery loop is pinned to it — no wandering). */
  setActivePocket(pocketId: string): void;
  activePocketId(): string;
  /** reset the idle/stuck counter (after a pocket switch). */
  resetIdle(): void;
  /** run one recovery+farm decision on the forced active pocket. A blocked/dry/death-capped pocket routes back to
   *  the engine via {@link WorkflowController.onFallbackTrigger}; it never stops the run directly here. */
  runFarmTick(dtMs: number): void;
  /** continuity advance (revision-fenced); false = fence lost (a takeover/stop raced). */
  advance(to: BotContinuityOperationalStateWire, reasonCode: string): boolean;
  /** acquire (or create) a solo host for a target map; null when none exists and creation fails. */
  acquireHostForMap(mapId: string): Promise<BotHost | null>;
  rebindHost(next: BotHost): void;
  persistNow(): void;
  /** plan A* home from the current (safe-camp) tile and enter the recovery "returning" phase; false = unroutable. */
  beginReturnRouteFromCurrent(pocketId: string): boolean;
  /** take/drop a lease so a stop drains a committed op into the report before authority release. */
  acquireLease(): symbol;
  releaseLease(token: symbol): void;
  /** begin a town-service run (reuse the whole D-069/D-070 trip). true = started; wait until hasActiveTrip()==false. */
  beginTownTrip(): boolean;
  hasActiveTrip(): boolean;
  stop(reason: BotStopReason): void;
  ownerStatusPush(): void;
}

/** Where the engine sits inside the current step. Branch steps are resolved instantly, so `sub` is never a branch. */
type StepPhase = "traveling" | "farming" | "town";

export class WorkflowController {
  private readonly f: WorkflowFacade;
  private readonly steps: readonly BotWorkflowStep[];
  private readonly workflow: BotWorkflowV1;

  private initialized = false;
  private stepIndex: number;
  private sub: StepPhase = "farming";
  /** true while an async cross-map transfer is pumping — tickWorkflow is a no-op until it resolves. */
  private busy = false;
  private townStarted = false;

  private baseCounters: WorkflowCounters = { killCount: 0, goldEarned: 0, expEarned: 0 };
  private stepStartMs: number;

  constructor(facade: WorkflowFacade, workflow: BotWorkflowV1, startStepIndex: number) {
    this.f = facade;
    this.workflow = workflow;
    this.steps = workflow.steps;
    const clamped = Number.isInteger(startStepIndex) ? startStepIndex : 0;
    this.stepIndex = Math.max(0, Math.min(clamped, this.steps.length - 1));
    this.stepStartMs = facade.now();
  }

  /** One engine tick. The runtime calls this from tickWorkflow when no town trip owns the tick. */
  tickWorkflow(dtMs: number): void {
    if (this.f.isStopped() || this.busy) return;
    if (!this.initialized) {
      this.initialized = true;
      this.advanceTo(this.stepIndex);
      if (this.f.isStopped() || this.busy) return;
    }
    const step = this.steps[this.stepIndex];
    switch (step.kind) {
      case "farm":
        return this.tickFarmStep(step, dtMs);
      case "town_service":
        return this.tickTownStep();
      case "branch":
        return this.advanceTo(this.stepIndex); // defensive — advanceTo resolves branches, never rests on one.
    }
  }

  // ── step drivers ────────────────────────────────────────────────────────────────────────────────────────────

  private tickFarmStep(step: BotWorkflowFarmStep, dtMs: number): void {
    if (this.sub === "traveling") return this.doCrossMapTravel(step);
    // sub === "farming": run one recovery+farm decision on the pinned pocket; hooks may change the step/stop.
    this.f.runFarmTick(dtMs);
    if (this.f.isStopped() || this.busy) return;
    if (this.stepIndex !== stepIndexOf(this.steps, step)) return; // a fallback advanced the chain this tick.
    if (this.sub !== "farming") return;
    if (this.goalMet(step)) this.advanceTo(this.stepIndex + 1);
  }

  private tickTownStep(): void {
    if (!this.townStarted) {
      this.townStarted = true;
      // A refused trip (cooldown / warp dep / tier) can't be forced — skip this step and move on (safe).
      if (!this.f.beginTownTrip()) return this.advanceTo(this.stepIndex + 1);
      return; // trip started — the runtime now delegates every tick to the trip until it ends.
    }
    if (this.f.hasActiveTrip()) return; // still running (defensive — the runtime shouldn't tick us mid-trip).
    this.advanceTo(this.stepIndex + 1); // the trip finished (it walked the actor home) → next step.
  }

  // ── cross-map travel (async, one transfer per pump) ─────────────────────────────────────────────────────────

  private doCrossMapTravel(step: BotWorkflowFarmStep): void {
    this.busy = true;
    const lease = this.f.acquireLease();
    void (async () => {
      try {
        const target = await this.f.acquireHostForMap(step.mapId);
        if (this.f.isStopped()) return;
        if (!target) return this.onTravelFailed(step); // no host on the target map → treat as a stuck pocket.
        const anchor: Vec2 = target.botSafeCampAnchor();
        const result: TransferResult = transferActor(
          this.f.actorId,
          this.f.currentHost(),
          target,
          anchor,
          (next) => this.f.rebindHost(next),
        );
        switch (result) {
          case "ok":
            this.f.persistNow();
            // Arrived on the new map at its safe camp → walk into the step's pocket via the recovery machinery.
            if (!this.f.advance("RETURNING_TO_WORK", "workflow_arrived_map")) return; // fence lost.
            if (!this.f.beginReturnRouteFromCurrent(step.pocketId)) return void this.f.stop("stuck");
            this.sub = "farming";
            this.f.ownerStatusPush();
            return;
          case "export_null":
            return; // a death raced — the runtime death path owns continuity; nothing to unwind here.
          case "reserve_fail":
          case "attach_recovered":
            return this.onTravelFailed(step); // the actor never left the source map — retry via the stuck fallback.
          case "attach_fatal":
            return void this.f.stop("map_unsafe"); // the actor could not be attached anywhere — fail closed.
        }
      } catch (e) {
        console.error(
          `[bot ${this.f.sessionRowId}] workflow travel error: ${e instanceof Error ? e.message : String(e)}`,
        );
        if (!this.f.isStopped()) this.onTravelFailed(step);
      } finally {
        this.busy = false;
        this.f.releaseLease(lease);
      }
    })();
  }

  /** Cross-map travel could not complete — the actor stayed on the source map. Route it through the stuck fallback. */
  private onTravelFailed(step: BotWorkflowFarmStep): void {
    if (this.f.isStopped()) return;
    this.f.advance("WORKING", "workflow_travel_failed"); // back to a farm state on the source map.
    this.sub = "farming";
    this.applyFallback(step, "stuck");
  }

  // ── fallback + goal ─────────────────────────────────────────────────────────────────────────────────────────

  /** The runtime routes a stuck / pocket-empty / death-capped farm-step terminal here instead of stopping. */
  onFallbackTrigger(when: BotWorkflowFallbackWhen): void {
    if (this.f.isStopped()) return;
    const step = this.steps[this.stepIndex];
    if (step.kind !== "farm") return void this.f.stop(this.stopReasonFor(when));
    this.applyFallback(step, when);
  }

  private applyFallback(step: BotWorkflowFarmStep, when: BotWorkflowFallbackWhen): void {
    const fb = step.fallbacks.find((f) => f.when === when);
    if (!fb) return void this.f.stop(this.stopReasonFor(when)); // no rule for this trigger → the safe default stop.
    switch (fb.action) {
      case "next_step":
        return this.advanceTo(this.stepIndex + 1);
      case "switch_pocket":
        if (fb.pocketId) {
          this.f.setActivePocket(fb.pocketId); // keep the same step + goal, farm a different pocket.
          this.f.resetIdle();
          return;
        }
        return this.advanceTo(this.stepIndex + 1); // defensive — a switch_pocket with no pocket falls through.
      case "stop":
        return void this.f.stop(this.stopReasonFor(when));
    }
  }

  private stopReasonFor(when: BotWorkflowFallbackWhen): BotStopReason {
    return when === "death_capped" ? "death" : "stuck";
  }

  private goalMet(step: BotWorkflowFarmStep): boolean {
    const c = this.f.counters();
    return workflowConditionMet(
      {
        kills: c.killCount - this.baseCounters.killCount,
        gold: c.goldEarned - this.baseCounters.goldEarned,
        exp: c.expEarned - this.baseCounters.expEarned,
        elapsedMs: this.f.now() - this.stepStartMs,
      },
      step.goal,
    );
  }

  // ── cursor movement ─────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Move the cursor to `idx`, resolving any branch chain instantly (bounded by the step count — the validator
   * guarantees no branch-only cycle). Landing past the end completes the whole chain. Resets the step's counter
   * base + clock so the new step's goal measures its own delta.
   */
  private advanceTo(idx: number): void {
    let target = idx;
    let jumps = 0;
    while (target >= 0 && target < this.steps.length) {
      const step = this.steps[target];
      if (step.kind !== "branch") break;
      if (jumps++ > this.steps.length) return this.completeWorkflow(); // defensive cycle guard.
      const met = workflowConditionMet(this.branchProgress(), step.when);
      target = workflowStepIndexById(this.workflow, met ? step.thenStepId : step.elseStepId);
    }
    if (target < 0 || target >= this.steps.length) return this.completeWorkflow();

    this.stepIndex = target;
    this.baseCounters = { ...this.f.counters() };
    this.stepStartMs = this.f.now();
    this.townStarted = false;
    const step = this.steps[target];
    if (step.kind === "farm") {
      this.f.setActivePocket(step.pocketId);
      this.f.resetIdle();
      if (step.mapId === this.f.currentHostMapId()) {
        this.sub = "farming";
      } else {
        this.sub = "traveling";
        this.f.advance("TRAVELING", "workflow_travel_start"); // synchronous; the transfer pumps next.
      }
    } else {
      // town_service
      this.sub = "town";
    }
  }

  /** Branch conditions read cumulative whole-run progress (not a per-step delta). */
  private branchProgress() {
    const c = this.f.counters();
    return {
      kills: c.killCount,
      gold: c.goldEarned,
      exp: c.expEarned,
      elapsedMs: this.f.now() - this.f.runStartedAtMs(),
    };
  }

  private completeWorkflow(): void {
    this.f.stop("workflow_complete");
  }

  // ── projections for status + checkpoint ─────────────────────────────────────────────────────────────────────

  /** The cursor persisted into a checkpoint (resume restarts at this step, counters reset). */
  checkpointCursor(): { stepIndex: number } {
    return { stepIndex: this.stepIndex };
  }

  /** The live status projection the runtime folds into bot:status. */
  statusView(): BotWorkflowStatusCursor {
    const step = this.steps[this.stepIndex];
    if (step.kind === "farm") {
      const c = this.f.counters();
      const progress = {
        kills: c.killCount - this.baseCounters.killCount,
        gold: c.goldEarned - this.baseCounters.goldEarned,
        exp: c.expEarned - this.baseCounters.expEarned,
        elapsedMs: this.f.now() - this.stepStartMs,
      };
      return {
        stepIndex: this.stepIndex,
        stepCount: this.steps.length,
        stepKind: "farm",
        goalDone: metricValue(progress, step.goal.type),
        goalTarget: step.goal.target,
      };
    }
    return {
      stepIndex: this.stepIndex,
      stepCount: this.steps.length,
      stepKind: step.kind,
      goalDone: 0,
      goalTarget: 0,
    };
  }
}

/** Index of a step in the ordered list (identity match); -1 when absent. */
function stepIndexOf(steps: readonly BotWorkflowStep[], step: BotWorkflowStep): number {
  return steps.indexOf(step);
}

function metricValue(
  p: { kills: number; gold: number; exp: number; elapsedMs: number },
  type: BotWorkflowFarmStep["goal"]["type"],
): number {
  switch (type) {
    case "kills":
      return p.kills;
    case "gold":
      return p.gold;
    case "exp":
      return p.exp;
    case "durationMs":
      return p.elapsedMs;
  }
}
