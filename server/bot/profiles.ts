// Batch 7b-server — Profile service. PURE validation + tier-gated CRUD orchestration over a repo seam.
//
// D-063 gating: profiles count ≤ tier cap · rules count ≤ tier cap · after a tier downgrade the EXCESS profiles
// are NOT deleted — they are returned flagged `readOnly` (paused) and `start` rejects them (§12.4).
//
// ⛔ SERVER-ONLY. The repo seam is injected → the service is fully unit-testable with an in-memory fake (no DB).

import { randomUUID } from "node:crypto";
import { DEFAULT_BOT_CONFIG, type BotConfig, type BotTier } from "../config/bot";
import { capsFor } from "./tier";
import type { BotProfileRow, BotProfileView, BotRulesV1, RulesValidation } from "./types";
import { validateWorkflow } from "../../src/shared/bot-workflow";

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
  return skill + potion + loot + workflow;
}

/**
 * Validate + sanitize a raw rules payload against a tier's rule cap. Rejects a bad shape, out-of-range/duplicate
 * skill slots, an empty skill set, or a rule count over the cap. Returns the sanitized BotRulesV1 + its count.
 */
export function validateRules(raw: unknown, tier: BotTier, config: BotConfig = DEFAULT_BOT_CONFIG): RulesValidation {
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
): Promise<ProfileOpResult> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length === 0 || name.length > 40) return { ok: false, reason: "bad_name" };
  if (!isBotAllowedPocket(input.mapId, input.pocketId, config)) return { ok: false, reason: "pocket_not_allowed" };

  const existing = await repo.listByAccount(input.accountId);
  if (!canCreateProfile(existing.length, tier, config)) return { ok: false, reason: "profiles_at_cap" };

  const validated = validateRules(input.rawRules, tier, config);
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
    const validated = validateRules(input.rawRules, tier, config);
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
