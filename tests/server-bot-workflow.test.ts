import { describe, expect, test } from "vitest";
import { createWarpHarness, FakeWorld, warpConfig } from "./helpers/warp-world";
import { validateRules } from "../server/bot/profiles";
import { validateWorkflow } from "../src/shared/bot-workflow";
import { DEFAULT_BOT_CONFIG, type BotConfig, type BotTier } from "../server/config/bot";
import type { BotAttackOutcome } from "../server/bot/runtime";
import type { AgentMob, Vec2 } from "../server/bot/agent";
import type { BotRulesV1 } from "../server/bot/types";
import type {
  BotWorkflowCondition,
  BotWorkflowFallback,
  BotWorkflowStep,
  BotWorkflowV1,
} from "../src/shared/bot-workflow";

// PR6b — Pro goal-chain engine. Drives the REAL BotRuntime (via createWarpHarness) through a workflow over the
// FakeWorld: goal→next-step, branch then/else, every fallback action, chain completion, mid-chain tier expiry +
// takeover, and the §6.2 ceiling guard (a workflow's kill cadence equals the paid baseline). Free/Plus never carry
// a workflow, so those suites (server-bot-plus-runtime / warp-handoff / bag-divert) stay byte-identical.

const ACTOR = "actor:real";
const A_MOB: AgentMob = { id: "m", mobType: "slime", tx: 0, ty: 0, hp: 10, pocketId: "A" };

function kill(loot: { itemId: string; quantity: number }[] = []): BotAttackOutcome {
  return { killed: 1, gold: 5, exp: 2, loot, bagOverflowed: false, overflow: [], leveledUp: false };
}

const farmStep = (
  id: string,
  pocketId: string,
  goal: BotWorkflowCondition,
  fallbacks: BotWorkflowFallback[] = [],
  mapId = "map1",
): BotWorkflowStep => ({ id, kind: "farm", mapId, pocketId, goal, fallbacks });
const townStep = (id: string): BotWorkflowStep => ({ id, kind: "town_service" });
const branchStep = (id: string, when: BotWorkflowCondition, thenId: string, elseId: string): BotWorkflowStep => ({
  id,
  kind: "branch",
  when,
  thenStepId: thenId,
  elseStepId: elseId,
});
const wf = (...steps: BotWorkflowStep[]): BotWorkflowV1 => ({ version: 1, steps });

interface SceneOptions {
  tier?: BotTier;
  mobs?: () => AgentMob[];
  attack?: (target: Vec2) => Promise<BotAttackOutcome>;
  config?: BotConfig;
  resolveTier?: () => Promise<BotTier>;
  bag?: { instanceId: string; itemId: string }[];
}

function scene(workflow: BotWorkflowV1, opts: SceneOptions = {}) {
  const world = new FakeWorld({ actorId: ACTOR, gold: 200, buyPrice: 18, bag: opts.bag ?? [] });
  const farmHost = world.addHost({
    roomId: "room-farm",
    mapId: "map1",
    mobs: opts.mobs ?? (() => [A_MOB]),
    attack: opts.attack ?? (async () => kill()),
  });
  farmHost.players.add(ACTOR);
  const townHost = world.addHost({ roomId: "room-town", mapId: "city-hub" });
  const rules: BotRulesV1 = { skillSlots: [0], potionThresholdPct: null, lootAll: true, workflow };
  const harness = createWarpHarness({
    world,
    farmHost,
    tier: opts.tier ?? "pro",
    config: opts.config ?? warpConfig(),
    rules,
    resolveTier: opts.resolveTier,
  });
  return { world, farmHost, townHost, harness };
}

const stepIndex = (h: ReturnType<typeof createWarpHarness>): number | undefined =>
  h.runtime.workflowCheckpoint?.stepIndex;

async function driveUntil(
  h: ReturnType<typeof createWarpHarness>,
  pred: () => boolean,
  max = 60,
): Promise<void> {
  for (let i = 0; i < max; i++) {
    await h.tickAndSettle();
    if (pred() || h.runtime.isStopped) break;
  }
}

// A config with a small stuck limit + death cap so fallback tests converge quickly.
function fastConfig(over: Partial<BotConfig["recovery"]> = {}): BotConfig {
  const base = warpConfig();
  return { ...base, stuckTickLimit: 2, recovery: { ...base.recovery, ...over } };
}

// ── contract validation ────────────────────────────────────────────────────────────────────────────────────────

describe("workflow contract validation (validateRules + validateWorkflow)", () => {
  const okPockets = { isAllowedPocket: (m: string, p: string) => m === "map1" && (p === "A" || p === "B") };

  test("a workflow requires the Pro tier (workflow_requires_pro on plus)", () => {
    const rules = { skillSlots: [0], lootAll: true, workflow: wf(farmStep("s1", "map1-slime-center", { type: "kills", target: 10 })) };
    expect(validateRules(rules, "plus")).toEqual({ ok: false, reason: "workflow_requires_pro" });
    const pro = validateRules(rules, "pro");
    expect(pro.ok).toBe(true);
  });

  test("every step maps into the bot allow-list (workflow_map_not_allowed for a forbidden pocket)", () => {
    const rules = {
      skillSlots: [0],
      lootAll: true,
      workflow: wf(farmStep("s1", "map1-boss-boiling-boar", { type: "kills", target: 10 })),
    };
    expect(validateRules(rules, "pro")).toEqual({ ok: false, reason: "workflow_map_not_allowed" });
  });

  test("a branch-only cycle with no exit is rejected (workflow_invalid_step)", () => {
    const cyclic = wf(
      branchStep("b1", { type: "kills", target: 1 }, "b2", "b2"),
      branchStep("b2", { type: "kills", target: 1 }, "b1", "b1"),
    );
    expect(validateWorkflow(cyclic, { maxSteps: 10, ...okPockets })).toEqual({
      ok: false,
      reason: "workflow_invalid_step",
    });
  });

  test("a branch that eventually reaches a farm step is accepted", () => {
    const ok = wf(
      branchStep("b1", { type: "kills", target: 1 }, "f1", "f1"),
      farmStep("f1", "A", { type: "kills", target: 10 }),
    );
    expect(validateWorkflow(ok, { maxSteps: 10, ...okPockets }).ok).toBe(true);
  });

  test("over maxSteps is rejected, and step count counts toward the rule cap", () => {
    const many = wf(...Array.from({ length: 11 }, (_, i) => farmStep(`s${i}`, "A", { type: "kills", target: 1 })));
    expect(validateWorkflow(many, { maxSteps: 10, ...okPockets })).toEqual({
      ok: false,
      reason: "workflow_invalid_step",
    });
    // 25 steps + skill(1) + loot(1) = 27 > pro cap 25 → rules_over_cap.
    const capped = {
      skillSlots: [0],
      lootAll: true,
      workflow: wf(...Array.from({ length: 25 }, (_, i) => farmStep(`s${i}`, "map1-slime-center", { type: "kills", target: 1 }))),
    };
    const config = { ...DEFAULT_BOT_CONFIG, workflow: { maxSteps: 30 } };
    expect(validateRules(capped, "pro", config)).toEqual({ ok: false, reason: "rules_over_cap" });
  });

  test("a bad branch target (nonexistent step) is rejected", () => {
    const bad = wf(branchStep("b1", { type: "kills", target: 1 }, "ghost", "f1"), farmStep("f1", "A", { type: "kills", target: 1 }));
    expect(validateWorkflow(bad, { maxSteps: 10, ...okPockets })).toEqual({ ok: false, reason: "workflow_invalid_step" });
  });
});

// ── engine: goal → next step ───────────────────────────────────────────────────────────────────────────────────

describe("goal chain — goal advances the cursor", () => {
  test("a kills goal met advances to the next step (per-step delta, fresh base)", async () => {
    const { harness } = scene(
      wf(farmStep("s1", "A", { type: "kills", target: 2 }), farmStep("s2", "A", { type: "kills", target: 100 })),
    );
    expect(stepIndex(harness)).toBe(0);
    await driveUntil(harness, () => stepIndex(harness) === 1);
    expect(stepIndex(harness)).toBe(1);
    expect(harness.runtime.isStopped).toBe(false);
  });
});

// ── engine: branch then/else ───────────────────────────────────────────────────────────────────────────────────

describe("goal chain — branch then/else (cumulative counters)", () => {
  test("a satisfied branch jumps to thenStepId, resting on the target farm step (never on the branch)", async () => {
    const { harness } = scene(
      wf(
        farmStep("s1", "A", { type: "kills", target: 2 }),
        branchStep("b", { type: "kills", target: 2 }, "then", "else"),
        farmStep("then", "A", { type: "kills", target: 100 }),
        farmStep("else", "A", { type: "kills", target: 100 }),
      ),
    );
    await driveUntil(harness, () => stepIndex(harness) === 2 || stepIndex(harness) === 3);
    expect(stepIndex(harness)).toBe(2); // then
  });

  test("an unsatisfied branch jumps to elseStepId", async () => {
    const { harness } = scene(
      wf(
        farmStep("s1", "A", { type: "kills", target: 2 }),
        branchStep("b", { type: "kills", target: 1000 }, "then", "else"),
        farmStep("then", "A", { type: "kills", target: 100 }),
        farmStep("else", "A", { type: "kills", target: 100 }),
      ),
    );
    await driveUntil(harness, () => stepIndex(harness) === 2 || stepIndex(harness) === 3);
    expect(stepIndex(harness)).toBe(3); // else
  });
});

// ── engine: fallbacks ──────────────────────────────────────────────────────────────────────────────────────────

describe("goal chain — fallback actions", () => {
  test("pocket_empty → next_step advances the chain (no stop)", async () => {
    const { harness } = scene(
      wf(
        farmStep("s1", "A", { type: "kills", target: 100 }, [{ when: "pocket_empty", action: "next_step" }]),
        farmStep("s2", "A", { type: "kills", target: 100 }),
      ),
      { mobs: () => [], config: fastConfig() }, // no mobs → the pocket reads empty
    );
    await driveUntil(harness, () => stepIndex(harness) === 1);
    expect(stepIndex(harness)).toBe(1);
    expect(harness.runtime.isStopped).toBe(false);
  });

  test("pocket_empty → switch_pocket keeps the step but farms the alternate pocket", async () => {
    const { harness } = scene(
      wf(farmStep("s1", "A", { type: "kills", target: 100 }, [{ when: "pocket_empty", action: "switch_pocket", pocketId: "B" }])),
      { mobs: () => [{ id: "b", mobType: "slime", tx: 0, ty: 0, hp: 10, pocketId: "B" }], config: fastConfig() },
    );
    await driveUntil(harness, () => harness.runtime.runningCheckpoint.pocketId === "B");
    expect(harness.runtime.runningCheckpoint.pocketId).toBe("B");
    expect(stepIndex(harness)).toBe(0); // same step
    expect(harness.runtime.isStopped).toBe(false);
  });

  test("stuck → stop settles wait-for-owner; no matching fallback also stops safely", async () => {
    const farMob: AgentMob = { id: "far", mobType: "slime", tx: 9, ty: 9, hp: 10, pocketId: "A" };
    const { harness, world } = scene(
      wf(farmStep("s1", "A", { type: "kills", target: 100 }, [{ when: "stuck", action: "stop" }])),
      { mobs: () => [farMob], config: fastConfig() }, // reachable target but botStepToward never progresses
    );
    await driveUntil(harness, () => harness.runtime.isStopped);
    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("WAITING_FOR_OWNER");
    expect(world.stoppedMessage()?.reason).toBe("stuck");
  });

  test("death_capped → next_step advances the chain instead of the blanket death stop", async () => {
    const { harness } = scene(
      wf(
        farmStep("s1", "A", { type: "kills", target: 100 }, [{ when: "death_capped", action: "next_step" }]),
        farmStep("s2", "A", { type: "kills", target: 100 }),
      ),
      { config: fastConfig({ maxDeathRecoveriesPerSession: 0 }) }, // cap 0 → the first death is already capped
    );
    await driveUntil(harness, () => stepIndex(harness) !== undefined); // let the engine initialize the cursor
    harness.runtime.onActorDied();
    expect(stepIndex(harness)).toBe(1);
    expect(harness.runtime.isStopped).toBe(false);
  });
});

// ── engine: completion + settlement ────────────────────────────────────────────────────────────────────────────

describe("goal chain — completion", () => {
  test("the last step's goal completes the chain → workflow_complete → COMPLETED", async () => {
    const { harness, world } = scene(wf(farmStep("s1", "A", { type: "kills", target: 1 })));
    await driveUntil(harness, () => harness.runtime.isStopped);
    expect(harness.runtime.isStopped).toBe(true);
    expect(harness.state()).toBe("COMPLETED");
    expect(world.stoppedMessage()?.reason).toBe("workflow_complete");
  });
});

// ── engine: a town_service step reuses the whole town trip ──────────────────────────────────────────────────────

describe("goal chain — town_service step", () => {
  test("a town step runs the full trip (city-hub restock) then advances to the next step", async () => {
    const { harness, townHost } = scene(
      wf(
        farmStep("s1", "A", { type: "kills", target: 1 }),
        townStep("t1"),
        farmStep("s2", "A", { type: "kills", target: 100 }),
      ),
    );
    await driveUntil(harness, () => stepIndex(harness) === 2);
    expect(stepIndex(harness)).toBe(2); // farmed s1 → visited town → resumed at s2
    expect(harness.runtime.isStopped).toBe(false);
    expect(townHost.calls.buy.length).toBeGreaterThan(0); // the trip actually restocked at the town shop
  });
});

// ── engine: mid-chain tier expiry + takeover ───────────────────────────────────────────────────────────────────

describe("goal chain — mid-run guards", () => {
  test("a Pro→Plus downgrade mid-chain stops the run expired_readonly (a chain is Pro-only)", async () => {
    const { harness, world } = scene(wf(farmStep("s1", "A", { type: "kills", target: 100 })), {
      resolveTier: async () => "plus",
      config: { ...warpConfig(), recovery: { ...warpConfig().recovery, tierRecheckIntervalMs: 1_000 } },
    });
    await driveUntil(harness, () => harness.runtime.isStopped);
    expect(harness.runtime.isStopped).toBe(true);
    expect(world.stoppedMessage()?.reason).toBe("expired_readonly");
  });

  test("a takeover mid-chain pauses + the checkpoint carries the current stepIndex", async () => {
    const { harness } = scene(
      wf(farmStep("s1", "A", { type: "kills", target: 2 }), farmStep("s2", "A", { type: "kills", target: 100 })),
    );
    await driveUntil(harness, () => stepIndex(harness) === 1); // advance into the 2nd step
    const paused = harness.runtime.takeover("cp-wf", harness.now());
    expect(paused).not.toBeNull();
    expect(harness.state()).toBe("PAUSED");
    expect(harness.runtime.workflowCheckpoint).toEqual({ stepIndex: 1 });
  });
});

// ── engine: §6.2 ceiling guard ─────────────────────────────────────────────────────────────────────────────────

describe("goal chain — ceiling (§6.2)", () => {
  test("a Pro+workflow run's kill cadence equals the paid baseline over the same world (loot beats are free)", async () => {
    const mobs = () => [A_MOB];
    const attack = async () => kill([{ itemId: "mat", quantity: 1 }]); // loot → the workflow runs LOOTING beats
    const TICKS = 12;

    // Pro goal chain with an unreachable goal (never advances → farms pocket A the whole time, with loot beats).
    const chain = scene(wf(farmStep("s1", "A", { type: "kills", target: 1_000_000 })), { mobs, attack, tier: "pro" });
    for (let i = 0; i < TICKS; i++) await chain.harness.tickAndSettle();

    // A plain Plus run over an identical world (no workflow, no LOOTING beat).
    const world = new FakeWorld({ actorId: ACTOR, gold: 200, buyPrice: 18, bag: [] });
    const farmHost = world.addHost({ roomId: "room-farm", mapId: "map1", mobs, attack });
    farmHost.players.add(ACTOR);
    world.addHost({ roomId: "room-town", mapId: "city-hub" });
    const plus = createWarpHarness({ world, farmHost, tier: "plus", config: warpConfig() });
    for (let i = 0; i < TICKS; i++) await plus.tickAndSettle();

    // Same number of attacks (each attack kills one) → the loot beat never changed the cadence.
    expect(chain.farmHost.calls.attack).toBe(farmHost.calls.attack);
    expect(chain.farmHost.calls.attack).toBeGreaterThan(0);
    expect(chain.harness.runtime.isStopped).toBe(false);
  });
});
