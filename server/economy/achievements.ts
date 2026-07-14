// C2b — achievement runtime wiring for MapRoom (pattern = server/economy/milestones.ts).
//
// The pure engine + service factory (src/server/economy/achievement-engine.ts) are DB-agnostic; this thin layer
// injects the real Prisma seams (the achievement_progress upsert store + the gold ledger, reason `quest_reward`)
// and owns the process singleton. No DB (`inventoryPersistenceAvailable()` false) → seams null → the service
// uses a process-local progress Map, so dev still tracks/auto-claims per scope per process (gold-less). MapRoom
// `void`s `emitAchievementEvent` (fire-and-forget — must never delay/break the calling combat/economy path).
//
// Also owns: the client-reported event whitelist + sanitizer (§13 anti-exploit — client events carry only
// cosmetic/meme rewards) and the journal snapshot builder (masks hidden achievements per §7/§8.4).
//
// ⛔ SERVER-ONLY. Achievement definitions/rewards never enter the client bundle (config = server-authoritative).

import type { Prisma } from "@prisma/client";
import { ACHIEVEMENTS } from "../config/achievements";
import { getPrisma } from "../../src/server/db";
import { appendEntry } from "../db/ledger";
import { inventoryPersistenceAvailable } from "../inventory/inventory-state";
import {
  createAchievementService,
  type AchDef,
  type AchievementEmitEvent,
  type AchievementLedgerSeam,
  type AchievementService,
  type AchievementStoreSeam,
  type AchState,
  type ProgressJson,
  type StoredAchievementProgress,
} from "../../src/server/economy/achievement-engine";

/** the C2a shipping defs as the engine's structural view (identical shape — the fields the engine reads). */
const DEFS = ACHIEVEMENTS as unknown as readonly AchDef[];

/** process-local progress store used only in no-DB mode (dev/e2e) — key `${scopeKey}:${achievementId}`. */
const memoryProgress = new Map<string, StoredAchievementProgress>();

/** real progress store (achievement_progress, unique(scope_key, achievement_id)) — best-effort upsert. */
const prismaStore: AchievementStoreSeam = {
  async load(scopeKey, achievementId) {
    const row = await getPrisma().achievementProgress.findUnique({
      where: { scopeKey_achievementId: { scopeKey, achievementId } },
    });
    if (!row) return null;
    return {
      state: row.state as AchState,
      currentValue: row.currentValue,
      streakValue: row.streakValue,
      json: (row.distinctKeys as unknown as ProgressJson | null) ?? {},
      claimed: row.state === "claimed" || row.claimedAt != null,
    };
  },
  async save(input) {
    const data = {
      state: input.state,
      currentValue: input.currentValue,
      streakValue: input.streakValue,
      distinctKeys: input.json as unknown as Prisma.InputJsonValue,
      claimedAt: input.claimedAt,
      idempotencyKey: input.idempotencyKey,
    };
    await getPrisma().achievementProgress.upsert({
      where: { scopeKey_achievementId: { scopeKey: input.scopeKey, achievementId: input.achievementId } },
      create: { scopeKey: input.scopeKey, achievementId: input.achievementId, ...data },
      update: data,
    });
  },
};

/** gold reward via the strict double-entry ledger (reason quest_reward, idempotent by `achievement:{scope}:{id}`). */
const ledgerSeam: AchievementLedgerSeam = { appendEntry: (e) => appendEntry(e) };

/** warn once per process — a persist/grant failure is money-loud but must never crash the room. */
const errorWarned = new Set<string>();
function warnError(achievementId: string, err: unknown): void {
  if (errorWarned.has(achievementId)) return;
  errorWarned.add(achievementId);
  console.warn(
    `[achievements] achievement "${achievementId}" persist/grant error (best-effort, tracking skipped): ` +
      (err instanceof Error ? err.message : String(err)),
  );
}

let cachedService: AchievementService | null = null;
/** lazy singleton — wires the real seams when a DB is present, else the process-local Map (mirrors milestone). */
function service(): AchievementService {
  if (!cachedService) {
    const dbOk = inventoryPersistenceAvailable();
    cachedService = createAchievementService({
      defs: DEFS,
      store: dbOk ? prismaStore : null,
      ledger: dbOk ? ledgerSeam : null,
      memory: memoryProgress,
      onError: warnError,
    });
  }
  return cachedService;
}

/**
 * fire one achievement event (fire-and-forget from MapRoom hooks). Resolves after this event's defs are
 * processed; MapRoom `void`s it so it never blocks the combat/economy path. `clientReported` events (from
 * MSG_CLIENT_EVENT) pass through the per-session token bucket inside the service (§13).
 */
export function emitAchievementEvent(event: AchievementEmitEvent): Promise<void> {
  return service().emit(event);
}

/** drop a leaving session's rate-limit buckets (progress itself is scope-keyed and survives). */
export function forgetAchievementSession(sessionId: string): void {
  service().forgetSession(sessionId);
}

// ── client-reported event whitelist (§13: title/none rewards only — documented trust tradeoff) ─────────────
/** the only client → server event types the server accepts (MSG_CLIENT_EVENT). Everything else is dropped. */
export const CLIENT_EVENT_WHITELIST: ReadonlySet<string> = new Set([
  "npc.talk",
  "ui.logo.click",
  "weather.changed",
  "phase.changed",
  "weather.rain.tick",
]);

/** per-type payload sanitizer — pulls ONLY the fields the rules read, coercing to primitives (no trust). */
export function sanitizeClientEvent(
  type: unknown,
  payload: unknown,
): { type: string; payload: Record<string, unknown> } | null {
  if (typeof type !== "string" || !CLIENT_EVENT_WHITELIST.has(type)) return null;
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  switch (type) {
    case "npc.talk":
      return { type, payload: { npcId: str(p.npcId) } };
    case "ui.logo.click":
      return { type, payload: {} };
    case "weather.changed":
      return { type, payload: { weather: str(p.weather) } };
    case "phase.changed":
      return { type, payload: { phase: str(p.phase), mapId: str(p.mapId) } };
    case "weather.rain.tick":
      return { type, payload: { mapId: str(p.mapId) } };
    default:
      return null;
  }
}

// ── journal snapshot (Part 5 — masks hidden achievements per §8.4) ─────────────────────────────────────────
/** one journal row the client renders (C3 consumes this next). nameTh is "???" while a hidden row is unrevealed. */
export interface AchievementSnapshotRow {
  id: string;
  nameTh: string;
  tier: string;
  category: string;
  state: AchState;
  currentValue: number;
  target: number;
  gold?: number;
  titleId?: string;
}

/**
 * build the journal snapshot for a session's scopes. A hidden achievement (visibility !== "visible") stays masked
 * ("???") until claimed — this covers both hidden_condition and hidden_full (§8.4); visible rows always show
 * their name. Only CORE defs (OB shipping set) are listed. Best-effort: a scope with no id yields locked rows.
 */
export async function buildAchievementsSnapshot(input: {
  accountId?: string;
  characterId?: string;
}): Promise<AchievementSnapshotRow[]> {
  const svc = service();
  void svc; // ensure the singleton (and its store choice) is initialized before we load progress below
  const rows: AchievementSnapshotRow[] = [];
  for (const def of DEFS) {
    if (def.phase !== "core") continue;
    const scopeKey = def.scope === "account" ? input.accountId : input.characterId;
    const stored = scopeKey ? await loadStored(scopeKey, def.id) : null;
    const state: AchState = stored?.state ?? "locked";
    const masked = def.visibility !== "visible" && state !== "claimed";
    rows.push({
      id: def.id,
      nameTh: masked ? "???" : def.nameTh,
      tier: def.tier,
      category: def.category,
      state,
      currentValue: stored?.currentValue ?? 0,
      target: def.rule.target,
      gold: def.reward.gold,
      titleId: def.reward.titleId,
    });
  }
  return rows;
}

/** load one progress row through whichever store the singleton chose (DB or the process-local Map). */
async function loadStored(scopeKey: string, achievementId: string): Promise<StoredAchievementProgress | null> {
  if (inventoryPersistenceAvailable()) return prismaStore.load(scopeKey, achievementId);
  return memoryProgress.get(`${scopeKey}:${achievementId}`) ?? null;
}
