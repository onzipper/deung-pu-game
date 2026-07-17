// Batch 7b-server — Profile service. PURE validation + tier-gated CRUD orchestration over a repo seam.
//
// D-063 gating: profiles count ≤ tier cap · rules count ≤ tier cap · after a tier downgrade the EXCESS profiles
// are NOT deleted — they are returned flagged `readOnly` (paused) and `start` rejects them (§12.4).
//
// ⛔ SERVER-ONLY. The repo seam is injected → the service is fully unit-testable with an in-memory fake (no DB).

import { randomUUID } from "node:crypto";
import { DEFAULT_BOT_CONFIG, type BotConfig, type BotTier } from "../config/bot";
import { capsFor } from "./tier";
import {
  BOT_COMPLETION_ACTIONS,
  type BotCompletionAction,
  type BotProfileRow,
  type BotProfileView,
  type BotRulesV1,
  type BotTargetMode,
  type RulesValidation,
} from "./types";
import { isValidWorkflowCondition, validateWorkflow, type BotWorkflowCondition } from "../../src/shared/bot-workflow";

/** Upper bound on skill-slot indices at create time (class binding + range check happens at start). */
export const MAX_SKILL_SLOTS = 8;

/**
 * Count the rules a payload uses toward the tier cap (P3 §4/§16 Q4: 1 toggle/condition = 1 rule; §16 Q3:
 * custom stops share the same quota). v1: one rule per allowed skill slot + one for the potion rule (if set) +
 * one for the loot filter. Documented so the client counter can mirror it (defense-in-depth, server is truth).
 */
export function countRules(rules: BotRulesV1): number {
  const skill = rules.skillSlots.length;
  const potion = rules.potionThresholdPct != null ? 1 : 0;
  const loot = 1; // the loot filter is always one configured rule
  const workflow = rules.workflow ? rules.workflow.steps.length : 0; // PR6b: each chain step is one rule
  const targeting = rules.targetMode === "SELECTED_TYPES" ? 1 : 0; // M1: a selected-types filter is one rule
  const goal = rules.goal ? 1 : 0; // M1: a single completion goal is one rule
  return skill + potion + loot + workflow + targeting + goal;
}

/** Set membership for the completion-action enum (M1). */
const COMPLETION_ACTION_SET: ReadonlySet<string> = new Set(BOT_COMPLETION_ACTIONS);

/**
 * M1: context the caller (server/bot/manager.ts) assembles from LIVE map data so `validateRules` can check that a
 * SELECTED_TYPES target is a normal mob that actually lives in the assigned pocket. Omitted (tests / no map) ⇒ the
 * in-pocket + class checks are skipped (shape is still enforced).
 */
export interface RuleTargetCtx {
  /** mob types present in the profile's assigned pocket, or null when unknown (skip the in-pocket check). */
  mobTypesInPocket: readonly string[] | null;
  /** milestone class of a mob type (normal/elite/boss/null) — server/economy/kill-rewards.ts `mobClassForMobType`. */
  mobClassOf: (mobType: string) => "normal" | "elite" | "boss" | null;
}

/** Resolver the manager passes to createProfile/updateProfile → a RuleTargetCtx for the profile's map+pocket. */
export type ResolveRuleTargetCtx = (mapId: string, pocketId: string) => RuleTargetCtx;

/**
 * M1: fill defaults on a rules object that predates the M1 fields (a profile row loaded from the DB before this
 * milestone). PURE + in-memory only — the store calls it on parse so an old profile loads without crashing, and it
 * NEVER persists the normalized copy back. potionRestockTarget/potionLowReserve stay null ⇒ the runtime uses the
 * config default. (config is intentionally not a parameter: every default here is structural, not a balance value.)
 */
export function normalizeBotRules(rules: BotRulesV1): BotRulesV1 {
  const completionAction: BotCompletionAction | undefined =
    rules.completionAction ?? (rules.goal ? "safe_stop" : undefined);
  return {
    ...rules,
    targetMode: rules.targetMode ?? "ALL_IN_AREA",
    ...(completionAction !== undefined ? { completionAction } : {}),
    potionRestockTarget: rules.potionRestockTarget ?? null,
    potionLowReserve: rules.potionLowReserve ?? null,
  };
}

/**
 * Validate + sanitize a raw rules payload against a tier's rule cap. Rejects a bad shape, out-of-range/duplicate
 * skill slots, an empty skill set, a bad target/goal/potion dial, or a rule count over the cap. Returns the
 * sanitized (already-normalized) BotRulesV1 + its count. `targetCtx` (from the manager) enables the SELECTED_TYPES
 * class/pocket checks against live map data.
 */
export function validateRules(
  raw: unknown,
  tier: BotTier,
  config: BotConfig = DEFAULT_BOT_CONFIG,
  targetCtx?: RuleTargetCtx,
): RulesValidation {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "bad_rules_shape" };
  const r = raw as Record<string, unknown>;

  if (!Array.isArray(r.skillSlots)) return { ok: false, reason: "bad_skill_slots" };
  const slots: number[] = [];
  for (const s of r.skillSlots) {
    if (typeof s !== "number" || !Number.isInteger(s) || s < 0 || s >= MAX_SKILL_SLOTS) {
      return { ok: false, reason: "bad_skill_slot_value" };
    }
    if (!slots.includes(s)) slots.push(s);
  }
  if (slots.length === 0) return { ok: false, reason: "no_skill_slots" };
  slots.sort((a, b) => a - b);

  let potionThresholdPct: number | null = null;
  if (r.potionThresholdPct != null) {
    if (typeof r.potionThresholdPct !== "number" || r.potionThresholdPct < 0 || r.potionThresholdPct > 100) {
      return { ok: false, reason: "bad_potion_threshold" };
    }
    potionThresholdPct = r.potionThresholdPct;
  }

  if (typeof r.lootAll !== "boolean") return { ok: false, reason: "bad_loot_all" };

  const rules: BotRulesV1 = { skillSlots: slots, potionThresholdPct, lootAll: r.lootAll };

  // PR6b: an optional Pro goal chain. A workflow is a Pro-only capability (tier gate here, re-gated at start +
  // mid-run). Structural validation (allow-list / branch cycle / maxSteps) is the pure shared validator; each
  // step counts toward the same rule cap.
  if (r.workflow != null) {
    if (tier !== "pro") return { ok: false, reason: "workflow_requires_pro" };
    const validated = validateWorkflow(r.workflow, {
      maxSteps: config.workflow.maxSteps,
      isAllowedPocket: (mapId, pocketId) => isBotAllowedPocket(mapId, pocketId, config),
    });
    if (!validated.ok) return { ok: false, reason: validated.reason };
    rules.workflow = validated.workflow;
  }

  // M1: target selection. Default ALL_IN_AREA (pre-M1). SELECTED_TYPES is a Plus/Pro capability restricted to normal
  // mobs that live in the assigned pocket (class/pocket checks run only when the caller supplies targetCtx).
  let targetMode: BotTargetMode = "ALL_IN_AREA";
  if (r.targetMode !== undefined) {
    if (r.targetMode !== "ALL_IN_AREA" && r.targetMode !== "SELECTED_TYPES") {
      return { ok: false, reason: "bad_target_mode" };
    }
    targetMode = r.targetMode;
  }
  if (targetMode === "SELECTED_TYPES") {
    if (tier === "free") return { ok: false, reason: "target_mode_requires_plus" };
    if (!Array.isArray(r.selectedMobTypes) || r.selectedMobTypes.length === 0) {
      return { ok: false, reason: "bad_selected_mob_types" };
    }
    const types: string[] = [];
    for (const t of r.selectedMobTypes) {
      if (typeof t !== "string" || t.length === 0) return { ok: false, reason: "bad_selected_mob_types" };
      if (!types.includes(t)) types.push(t);
    }
    if (targetCtx) {
      for (const t of types) {
        if (targetCtx.mobClassOf(t) !== "normal") return { ok: false, reason: "mob_type_not_normal" };
        if (targetCtx.mobTypesInPocket && !targetCtx.mobTypesInPocket.includes(t)) {
          return { ok: false, reason: "mob_type_not_in_pocket" };
        }
      }
    }
    rules.targetMode = "SELECTED_TYPES";
    rules.selectedMobTypes = types;
  } else {
    // ALL_IN_AREA (or absent → default): a selectedMobTypes list makes no sense here → reject (strict pattern).
    if (r.selectedMobTypes !== undefined) return { ok: false, reason: "bad_selected_mob_types" };
    rules.targetMode = "ALL_IN_AREA";
  }

  // M1: an optional Plus single completion goal (reuses the workflow condition shape). Plus/Pro only, and mutually
  // exclusive with a Pro workflow chain (the chain already carries its own per-step goals).
  const rawGoal = r.goal;
  if (rawGoal !== undefined) {
    if (tier === "free") return { ok: false, reason: "goal_requires_plus" };
    if (rules.workflow) return { ok: false, reason: "goal_conflicts_workflow" };
    if (!isValidWorkflowCondition(rawGoal)) return { ok: false, reason: "bad_goal" };
    const goal: BotWorkflowCondition = { type: rawGoal.type, target: rawGoal.target };
    rules.goal = goal;
  }

  // M1: completion action — only meaningful with a goal; defaults to safe_stop when a goal exists.
  if (r.completionAction !== undefined) {
    if (!rules.goal) return { ok: false, reason: "bad_completion_action" };
    if (typeof r.completionAction !== "string" || !COMPLETION_ACTION_SET.has(r.completionAction)) {
      return { ok: false, reason: "bad_completion_action" };
    }
    rules.completionAction = r.completionAction as BotCompletionAction;
  } else if (rules.goal) {
    rules.completionAction = "safe_stop";
  }

  // M1: per-profile town-trip potion dials. null ⇒ the runtime uses the config default (M2). potionLowReserve is
  // bounded by the EFFECTIVE restock target (this profile's, or the config default when it left it null).
  rules.potionRestockTarget = null;
  if (r.potionRestockTarget != null) {
    const v = r.potionRestockTarget;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > config.townTrip.potionRestockTargetMax) {
      return { ok: false, reason: "bad_potion_restock" };
    }
    rules.potionRestockTarget = v;
  }
  rules.potionLowReserve = null;
  if (r.potionLowReserve != null) {
    const v = r.potionLowReserve;
    const effectiveRestock = rules.potionRestockTarget ?? config.townTrip.potionRestockTarget;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > effectiveRestock) {
      return { ok: false, reason: "bad_potion_reserve" };
    }
    rules.potionLowReserve = v;
  }

  const ruleCount = countRules(rules);
  const cap = capsFor(tier, config).rules;
  if (ruleCount > cap) return { ok: false, reason: "rules_over_cap" };
  return { ok: true, rules, ruleCount };
}

/**
 * Flag excess profiles read-only after a tier downgrade (D-063 §12.4). The OLDEST `cap` profiles stay editable;
 * anything beyond the cap is paused read-only (never deleted). Ordered by createdAt asc so the flag is stable.
 */
export function markReadOnlyExcess(
  profiles: readonly BotProfileRow[],
  tier: BotTier,
  config: BotConfig = DEFAULT_BOT_CONFIG,
): BotProfileView[] {
  const cap = capsFor(tier, config).profiles;
  const ordered = [...profiles].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return ordered.map((p, i) => ({ ...p, readOnly: i >= cap }));
}

/** True when a new profile can be created under the tier cap (D-063 profiles 1/3/10). */
export function canCreateProfile(existingCount: number, tier: BotTier, config: BotConfig = DEFAULT_BOT_CONFIG): boolean {
  return existingCount < capsFor(tier, config).profiles;
}

// ── CRUD orchestration over a repo seam (DI) ─────────────────────────────────

/** Persistence seam for profiles (implemented by the Prisma store; a fake in tests). */
export interface ProfileRepo {
  listByAccount(accountId: string): Promise<BotProfileRow[]>;
  getById(accountId: string, id: string): Promise<BotProfileRow | null>;
  insert(row: BotProfileRow): Promise<void>;
  update(row: BotProfileRow): Promise<void>;
  remove(accountId: string, id: string): Promise<void>;
}

export interface CreateProfileInput {
  accountId: string;
  name: string;
  mapId: string;
  pocketId: string;
  rawRules: unknown;
}

export type ProfileOpResult =
  | { ok: true; profile: BotProfileRow }
  | { ok: false; reason: string };

/**
 * Create a profile (tier-gated). Enforces the profile cap + validates the rules against the rule cap + checks
 * the pocket is bot-allowed for the map. `tier` = the account's resolved tier. Best-effort id = uuid.
 */
export async function createProfile(
  repo: ProfileRepo,
  tier: BotTier,
  input: CreateProfileInput,
  nowMs: number,
  config: BotConfig = DEFAULT_BOT_CONFIG,
  resolveTargetCtx?: ResolveRuleTargetCtx,
): Promise<ProfileOpResult> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length === 0 || name.length > 40) return { ok: false, reason: "bad_name" };
  if (!isBotAllowedPocket(input.mapId, input.pocketId, config)) return { ok: false, reason: "pocket_not_allowed" };

  const existing = await repo.listByAccount(input.accountId);
  if (!canCreateProfile(existing.length, tier, config)) return { ok: false, reason: "profiles_at_cap" };

  const validated = validateRules(input.rawRules, tier, config, resolveTargetCtx?.(input.mapId, input.pocketId));
  if (!validated.ok) return { ok: false, reason: validated.reason };

  const row: BotProfileRow = {
    id: randomUUID(),
    accountId: input.accountId,
    name,
    mapId: input.mapId,
    pocketId: input.pocketId,
    rules: validated.rules,
    createdAt: nowMs,
    updatedAt: nowMs,
  };
  await repo.insert(row);
  return { ok: true, profile: row };
}

export interface UpdateProfileInput {
  accountId: string;
  id: string;
  name?: string;
  mapId?: string;
  pocketId?: string;
  rawRules?: unknown;
}

/**
 * Update a profile. Rejects when the profile is currently read-only (excess after a downgrade — D-063 §12.4).
 * Re-validates rules/pocket against the CURRENT tier so a downgraded account can't edit past its caps.
 */
export async function updateProfile(
  repo: ProfileRepo,
  tier: BotTier,
  input: UpdateProfileInput,
  nowMs: number,
  config: BotConfig = DEFAULT_BOT_CONFIG,
  resolveTargetCtx?: ResolveRuleTargetCtx,
): Promise<ProfileOpResult> {
  const current = await repo.getById(input.accountId, input.id);
  if (!current) return { ok: false, reason: "not_found" };

  // read-only excess guard: if this profile is beyond the tier cap it is paused (cannot be edited).
  const all = await repo.listByAccount(input.accountId);
  const views = markReadOnlyExcess(all, tier, config);
  if (views.find((v) => v.id === input.id)?.readOnly) return { ok: false, reason: "profile_readonly" };

  const next: BotProfileRow = { ...current, updatedAt: nowMs };
  if (input.name != null) {
    const name = String(input.name).trim();
    if (name.length === 0 || name.length > 40) return { ok: false, reason: "bad_name" };
    next.name = name;
  }
  if (input.mapId != null) next.mapId = String(input.mapId);
  if (input.pocketId != null) next.pocketId = String(input.pocketId);
  if (!isBotAllowedPocket(next.mapId, next.pocketId, config)) return { ok: false, reason: "pocket_not_allowed" };
  if (input.rawRules !== undefined) {
    const validated = validateRules(input.rawRules, tier, config, resolveTargetCtx?.(next.mapId, next.pocketId));
    if (!validated.ok) return { ok: false, reason: validated.reason };
    next.rules = validated.rules;
  }
  await repo.update(next);
  return { ok: true, profile: next };
}

/** Delete a profile (always allowed — freeing a slot; caller aborts the matching run after a successful delete). */
export async function deleteProfile(repo: ProfileRepo, accountId: string, id: string): Promise<ProfileOpResult> {
  const current = await repo.getById(accountId, id);
  if (!current) return { ok: false, reason: "not_found" };
  await repo.remove(accountId, id);
  return { ok: true, profile: current };
}

/** List profiles as views (read-only flags applied for the current tier). */
export async function listProfiles(
  repo: ProfileRepo,
  accountId: string,
  tier: BotTier,
  config: BotConfig = DEFAULT_BOT_CONFIG,
): Promise<BotProfileView[]> {
  const rows = await repo.listByAccount(accountId);
  return markReadOnlyExcess(rows, tier, config);
}

/** True when `pocketId` is a bot-safe pocket for `mapId` (config allow-list; boss/elite/secret are absent). */
export function isBotAllowedPocket(mapId: string, pocketId: string, config: BotConfig = DEFAULT_BOT_CONFIG): boolean {
  const allowed = config.botAllowedPockets[mapId];
  return !!allowed && allowed.includes(pocketId);
}
