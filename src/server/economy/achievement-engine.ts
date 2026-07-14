// C2b — achievement tracking ENGINE (pure) + service factory (DI). **SERVER-AUTHORITATIVE, never-downgrade
// zone**: reward grants + combat-derived event fields must be exact. Depends only on injected seams
// (progress store / ledger) → unit-tested with fakes, **never touches a real DB / .env**. The wiring that
// supplies the real Prisma seams lives in server/economy/achievements.ts (mirrors milestone.ts ↔ milestones.ts).
//
// Two halves:
//   1. `evaluateAchievement(def, prev, event)` + `eventIndexFor(defs)` — PURE rule evaluator (no IO). Implements
//      all 7 rule types from server/config/achievements.ts (counter / max_value / distinct_set / streak /
//      sequence / composite / time_accum), including the sameKey / sameCell grouping conventions, numeric-string
//      filter patterns ("<0.05" / ">300"), the eventType-synthetic distinct set, sequence windows and the
//      composite notOccurred "poison" flag.
//   2. `createAchievementService(deps)` — DI factory with `emit(event)`: resolves listening defs (core phase
//      only), scopes progress (account|character), loads → evaluates → persists → auto-claims + grants (idempotent
//      via ledger key + claimed-state gate). Anti-exploit-lite per-session token bucket for client-reported types.
//
// Achievement spec: §4.2 progress states (locked→in_progress→completed→claimed), §6 rule semantics, §13
// anti-exploit. Shipping discipline: **auto-claim** (never a lingering "completed" state), retroactive = none
// for OB (no back-fill from history — a locked achievement only tracks events that arrive after C2b ships).
//
// ⛔ SERVER-ONLY. Deliberately does NOT import server/config (root tsc excludes server/**) — the def shape below
//    is a structural subset of AchievementDefinition; the wiring passes the real ACHIEVEMENTS array into it.

// ── structural def shape (subset of server/config/achievements.ts AchievementDefinition) ───────────────────
export type AchRuleType =
  | "counter"
  | "max_value"
  | "distinct_set"
  | "streak"
  | "sequence"
  | "composite"
  | "time_accum";

export interface AchRule {
  type: AchRuleType;
  event: string;
  target: number;
  filters?: Record<string, string | number | boolean>;
  distinctKey?: string;
  distinctAllowed?: string[];
  resetEvent?: string;
  steps?: { event: string; filters?: Record<string, string | number | boolean> }[];
  windowSeconds?: number;
  notOccurredEvent?: string;
  valueField?: string;
}

export interface AchDef {
  id: string;
  nameTh: string;
  category: string;
  tier: string;
  visibility: string;
  scope: "account" | "character";
  rule: AchRule;
  reward: { gold?: number; titleId?: string };
  phase: "core" | "expanded";
}

// ── progress state (pure) ───────────────────────────────────────────────────────────────────────────────
/** live sequence tracker (JSON-serializable) — which step is next + window anchor + captured sameKey value. */
export interface SeqState {
  /** index of the next step to satisfy (0 = fresh; length = complete). */
  step: number;
  /** nowMs when step 0 matched (window is measured from here). */
  startedMs: number;
  /** the sameKey payload value captured at step 0 (undefined when the sequence has no sameKey). */
  key?: string;
}

/** sub-shape persisted into the single `distinct_keys` Json column (one blob for every non-scalar rule state). */
export interface ProgressJson {
  /** distinct_set members collected so far. */
  distinct?: string[];
  /** sequence tracker. */
  seq?: SeqState;
  /** sameKey / sameCell counters (group value → count). */
  groups?: Record<string, number>;
  /** composite notOccurred poison flag — once true the achievement can never complete. */
  poisoned?: boolean;
}

/** the evaluator's working state (currentValue/streakValue map to columns; distinctKeys+extra → the Json blob). */
export interface ProgressState {
  currentValue: number;
  distinctKeys: string[] | null;
  streakValue: number;
  extra?: ProgressJson;
}

export interface AchEvent {
  type: string;
  payload: Record<string, unknown>;
  /** server clock (ms) — sequence windows measure from this. */
  nowMs: number;
}

export interface EvalResult {
  next: ProgressState;
  completed: boolean;
}

// ── filters ──────────────────────────────────────────────────────────────────────────────────────────────
const NUMERIC_PATTERN = /^(<=|>=|<|>)(-?\d+(?:\.\d+)?)$/;
/** payload keys that are grouping directives, NOT plain equality filters. */
const DIRECTIVE_KEYS = new Set(["sameKey", "sameCell"]);

function toNum(x: unknown): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * exact-match + numeric-string-pattern filter test. String values like "<0.05" / ">300" are parsed to a
 * comparison against `payload[key]` (numeric); every other value is compared with `===`. `sameKey`/`sameCell`
 * are grouping directives (handled by the rule), never plain filters — they are skipped here.
 */
export function filterMatch(
  payload: Record<string, unknown>,
  filters: Record<string, string | number | boolean> | undefined,
): boolean {
  if (!filters) return true;
  for (const [key, want] of Object.entries(filters)) {
    if (DIRECTIVE_KEYS.has(key)) continue;
    if (typeof want === "string") {
      const m = NUMERIC_PATTERN.exec(want);
      if (m) {
        const got = Number(payload[key]);
        if (!Number.isFinite(got)) return false;
        const threshold = Number(m[2]);
        const op = m[1];
        if (op === "<" && !(got < threshold)) return false;
        if (op === ">" && !(got > threshold)) return false;
        if (op === "<=" && !(got <= threshold)) return false;
        if (op === ">=" && !(got >= threshold)) return false;
        continue;
      }
    }
    if (payload[key] !== want) return false;
  }
  return true;
}

// ── per-rule evaluators ─────────────────────────────────────────────────────────────────────────────────
function bestGroup(groups: Record<string, number>): number {
  let best = 0;
  for (const v of Object.values(groups)) if (v > best) best = v;
  return best;
}

function extraOf(prev: ProgressState): ProgressJson {
  return prev.extra ?? {};
}

function unchanged(prev: ProgressState): EvalResult {
  return { next: prev, completed: false };
}

function evalCounter(rule: AchRule, prev: ProgressState, event: AchEvent): EvalResult {
  if (event.type !== rule.event) return unchanged(prev);
  if (!filterMatch(event.payload, rule.filters)) return unchanged(prev);
  const inc = rule.valueField ? toNum(event.payload[rule.valueField]) : 1;

  // sameKey: count per payload[filters.sameKey] value → complete when ANY group reaches target.
  if (rule.filters?.sameKey) {
    const keyName = String(rule.filters.sameKey);
    const groupVal = event.payload[keyName];
    if (groupVal == null || String(groupVal).length === 0) return unchanged(prev);
    const groups = { ...(extraOf(prev).groups ?? {}) };
    groups[String(groupVal)] = (groups[String(groupVal)] ?? 0) + inc;
    const best = bestGroup(groups);
    return {
      next: { ...prev, currentValue: best, extra: { ...extraOf(prev), groups } },
      completed: best >= rule.target,
    };
  }
  // sameCell: group by mapId + gridCell → complete when ANY cell reaches target.
  if (rule.filters?.sameCell) {
    const cellKey = `${event.payload.mapId ?? ""}|${event.payload.gridCell ?? ""}`;
    const groups = { ...(extraOf(prev).groups ?? {}) };
    groups[cellKey] = (groups[cellKey] ?? 0) + inc;
    const best = bestGroup(groups);
    return {
      next: { ...prev, currentValue: best, extra: { ...extraOf(prev), groups } },
      completed: best >= rule.target,
    };
  }

  const cv = prev.currentValue + inc;
  return { next: { ...prev, currentValue: cv }, completed: cv >= rule.target };
}

function evalMaxValue(rule: AchRule, prev: ProgressState, event: AchEvent): EvalResult {
  if (event.type !== rule.event) return unchanged(prev);
  if (!filterMatch(event.payload, rule.filters)) return unchanged(prev);
  const v = toNum(event.payload[rule.valueField ?? ""]);
  const cv = Math.max(prev.currentValue, v); // monotonic — never regresses
  if (cv === prev.currentValue) return unchanged(prev); // not a new max → no progress
  return { next: { ...prev, currentValue: cv }, completed: cv >= rule.target };
}

function evalDistinct(rule: AchRule, prev: ProgressState, event: AchEvent): EvalResult {
  const byEventType = rule.distinctKey === "eventType";
  let value: string | undefined;
  if (byEventType) {
    if (!rule.distinctAllowed?.includes(event.type)) return unchanged(prev);
    value = event.type;
  } else {
    if (event.type !== rule.event) return unchanged(prev);
    const raw = event.payload[rule.distinctKey ?? ""];
    if (raw == null) return unchanged(prev);
    value = String(raw);
    if (!rule.distinctAllowed?.includes(value)) return unchanged(prev);
  }
  const set = prev.distinctKeys ? [...prev.distinctKeys] : [];
  if (set.includes(value)) return unchanged(prev); // duplicate distinct key ignored (never re-counts)
  set.push(value);
  return {
    next: { ...prev, distinctKeys: set, currentValue: set.length },
    completed: set.length >= rule.target,
  };
}

function evalStreak(rule: AchRule, prev: ProgressState, event: AchEvent): EvalResult {
  if (event.type === rule.resetEvent) {
    if (prev.streakValue === 0) return unchanged(prev);
    return { next: { ...prev, streakValue: 0, currentValue: 0 }, completed: false };
  }
  if (event.type === rule.event) {
    if (!filterMatch(event.payload, rule.filters)) return unchanged(prev);
    const sv = prev.streakValue + 1;
    return { next: { ...prev, streakValue: sv, currentValue: sv }, completed: sv >= rule.target };
  }
  return unchanged(prev);
}

function sameKeyName(filters?: Record<string, string | number | boolean>): string | null {
  return filters?.sameKey != null ? String(filters.sameKey) : null;
}

function evalSequence(rule: AchRule, prev: ProgressState, event: AchEvent): EvalResult {
  const steps = rule.steps ?? [];
  if (steps.length === 0) return unchanged(prev);
  const windowMs = (rule.windowSeconds ?? 0) * 1000;
  let seq = extraOf(prev).seq;
  const expired = seq !== undefined && event.nowMs - seq.startedMs > windowMs;
  if (expired) seq = undefined;

  // 1) advance the awaited step (mid-sequence) — ordered, within the window, matching sameKey when required.
  if (seq && seq.step > 0 && seq.step < steps.length) {
    const s = steps[seq.step];
    const keyName = sameKeyName(s.filters);
    const keyOk = keyName == null || String(event.payload[keyName]) === seq.key;
    if (event.type === s.event && filterMatch(event.payload, s.filters) && keyOk) {
      const nextStep = seq.step + 1;
      if (nextStep >= steps.length) {
        return {
          next: { ...prev, currentValue: steps.length, extra: { ...extraOf(prev), seq: undefined } },
          completed: true,
        };
      }
      return {
        next: { ...prev, currentValue: nextStep, extra: { ...extraOf(prev), seq: { step: nextStep, startedMs: seq.startedMs, key: seq.key } } },
        completed: false,
      };
    }
  }

  // 2) (re)anchor at step 0 — a fresh step-0 match always restarts the window at nowMs.
  const s0 = steps[0];
  if (event.type === s0.event && filterMatch(event.payload, s0.filters)) {
    const keyName = sameKeyName(s0.filters);
    const key = keyName != null ? String(event.payload[keyName]) : undefined;
    return {
      next: { ...prev, currentValue: 1, extra: { ...extraOf(prev), seq: { step: 1, startedMs: event.nowMs, key } } },
      completed: false,
    };
  }

  // 3) no match — persist the cleared tracker if the window had expired, else leave untouched.
  if (expired) {
    return { next: { ...prev, currentValue: 0, extra: { ...extraOf(prev), seq: undefined } }, completed: false };
  }
  return unchanged(prev);
}

function evalComposite(rule: AchRule, prev: ProgressState, event: AchEvent): EvalResult {
  if (rule.notOccurredEvent) {
    // notOccurred: the guard event poisons the achievement permanently once seen (§ ach_die_before_kill).
    if (event.type === rule.notOccurredEvent) {
      if (extraOf(prev).poisoned) return unchanged(prev);
      return { next: { ...prev, extra: { ...extraOf(prev), poisoned: true } }, completed: false };
    }
    if (event.type === rule.event) {
      if (extraOf(prev).poisoned) return unchanged(prev);
      if (!filterMatch(event.payload, rule.filters)) return unchanged(prev);
      return { next: { ...prev, currentValue: 1 }, completed: true };
    }
    return unchanged(prev);
  }
  // all-of filters on ONE event (§ ach_boss_solo).
  if (event.type === rule.event && filterMatch(event.payload, rule.filters)) {
    return { next: { ...prev, currentValue: 1 }, completed: true };
  }
  return unchanged(prev);
}

function evalTimeAccum(rule: AchRule, prev: ProgressState, event: AchEvent): EvalResult {
  if (event.type !== rule.event) return unchanged(prev);
  if (!filterMatch(event.payload, rule.filters)) return unchanged(prev);
  const inc = rule.valueField ? toNum(event.payload[rule.valueField]) : 1;
  const cv = prev.currentValue + inc;
  return { next: { ...prev, currentValue: cv }, completed: cv >= rule.target };
}

/**
 * PURE rule evaluation. Returns the next progress state + whether the achievement just completed. Called only
 * for defs whose index contains `event.type` (see eventIndexFor) — a def never sees an irrelevant event type.
 */
export function evaluateAchievement(def: AchDef, prev: ProgressState, event: AchEvent): EvalResult {
  switch (def.rule.type) {
    case "counter":
      return evalCounter(def.rule, prev, event);
    case "max_value":
      return evalMaxValue(def.rule, prev, event);
    case "distinct_set":
      return evalDistinct(def.rule, prev, event);
    case "streak":
      return evalStreak(def.rule, prev, event);
    case "sequence":
      return evalSequence(def.rule, prev, event);
    case "composite":
      return evalComposite(def.rule, prev, event);
    case "time_accum":
      return evalTimeAccum(def.rule, prev, event);
    default:
      return unchanged(prev);
  }
}

/**
 * PURE index eventType → defs[]. Includes every event a def must observe: the primary `rule.event`, plus
 * `resetEvent` (streak), `notOccurredEvent` (composite guard), each `steps[].event` (sequence), and — for the
 * synthetic `distinctKey:"eventType"` distinct set (ach_all_systems) — each of its `distinctAllowed` types.
 */
export function eventIndexFor(defs: readonly AchDef[]): Map<string, AchDef[]> {
  const index = new Map<string, AchDef[]>();
  const add = (type: string, def: AchDef): void => {
    const arr = index.get(type) ?? [];
    if (!arr.includes(def)) arr.push(def);
    index.set(type, arr);
  };
  for (const def of defs) {
    const r = def.rule;
    add(r.event, def);
    if (r.resetEvent) add(r.resetEvent, def);
    if (r.notOccurredEvent) add(r.notOccurredEvent, def);
    if (r.steps) for (const s of r.steps) add(s.event, def);
    if (r.type === "distinct_set" && r.distinctKey === "eventType" && r.distinctAllowed) {
      for (const t of r.distinctAllowed) add(t, def);
    }
  }
  return index;
}

// ── service (DI factory) ────────────────────────────────────────────────────────────────────────────────
export type AchState = "locked" | "in_progress" | "completed" | "claimed";

/** the persisted view the service works with (currentValue/streakValue = columns, json = the Json blob). */
export interface StoredAchievementProgress {
  state: AchState;
  currentValue: number;
  streakValue: number;
  json: ProgressJson;
  claimed: boolean;
}

export interface SaveAchievementInput {
  scopeKey: string;
  achievementId: string;
  state: AchState;
  currentValue: number;
  streakValue: number;
  json: ProgressJson;
  claimedAt: Date | null;
  idempotencyKey: string | null;
}

/** progress persistence seam (DB upsert under unique(scopeKey, achievementId)) — null in deps → in-memory. */
export interface AchievementStoreSeam {
  load(scopeKey: string, achievementId: string): Promise<StoredAchievementProgress | null>;
  save(input: SaveAchievementInput): Promise<void>;
}

/** gold ledger seam (reward grant, reason quest_reward) — null → gold skipped (EXP-less achievements still track). */
export interface AchievementLedgerSeam {
  appendEntry(entry: {
    characterId: string;
    currency: "gold";
    amount: bigint;
    reason: "quest_reward";
    refType?: string;
    refId?: string;
    idempotencyKey: string;
  }): Promise<{ status: "applied" | "duplicate" | "insufficient_funds"; balance: bigint }>;
}

/** the unlocked-notification payload the caller relays to the owning client session (MSG_ACHIEVEMENT_UNLOCKED). */
export interface AchievementUnlockedView {
  achievementId: string;
  nameTh: string;
  tier: string;
  gold?: number;
  titleId?: string;
}

export interface AchievementEmitEvent {
  type: string;
  payload: Record<string, unknown>;
  /** account scope key (account-scoped defs skip when absent). */
  accountId?: string;
  /** character scope key + the ledger character for gold grants (character-scoped defs skip when absent). */
  characterId?: string;
  /** for the per-session rate-limit bucket + notify routing. */
  sessionId?: string;
  nowMs: number;
  /** true = came from an untrusted client (MSG_CLIENT_EVENT) → apply the token bucket (§13). */
  clientReported?: boolean;
  notify?: (msg: AchievementUnlockedView) => void;
}

export interface AchievementServiceDeps {
  defs: readonly AchDef[];
  /** null → the in-memory `memory` Map is the progress store (no-DB dev, mirror milestone fallback). */
  store: AchievementStoreSeam | null;
  ledger: AchievementLedgerSeam | null;
  /** process-local progress (no-DB mode) — key `${scopeKey}:${achievementId}`. */
  memory: Map<string, StoredAchievementProgress>;
  /** §13 anti-exploit: client-reported events per session per type per minute (default 10). */
  clientEventLimitPerMin?: number;
  /** money-loud error sink (a grant/persist failure) — never throws into the caller's path. */
  onError?: (achievementId: string, err: unknown) => void;
}

export interface AchievementService {
  /** fire-and-forget from hooks (`void service.emit(...)`) — resolves after this event's defs are processed. */
  emit(event: AchievementEmitEvent): Promise<void>;
  /** drop a session's rate-limit buckets (call on leave) — progress itself is scope-keyed and survives. */
  forgetSession(sessionId: string): void;
}

function initialStored(): StoredAchievementProgress {
  return { state: "locked", currentValue: 0, streakValue: 0, json: {}, claimed: false };
}

function toProgressState(s: StoredAchievementProgress): ProgressState {
  return {
    currentValue: s.currentValue,
    streakValue: s.streakValue,
    distinctKeys: s.json.distinct ?? null,
    extra: { seq: s.json.seq, groups: s.json.groups, poisoned: s.json.poisoned },
  };
}

function toJson(p: ProgressState): ProgressJson {
  const json: ProgressJson = {};
  if (p.distinctKeys && p.distinctKeys.length > 0) json.distinct = p.distinctKeys;
  const e = p.extra ?? {};
  if (e.seq) json.seq = e.seq;
  if (e.groups && Object.keys(e.groups).length > 0) json.groups = e.groups;
  if (e.poisoned) json.poisoned = true;
  return json;
}

/** did any tracked progress change? (currentValue / streakValue / the Json blob). */
function progressChanged(prev: ProgressState, next: ProgressState): boolean {
  return (
    prev.currentValue !== next.currentValue ||
    prev.streakValue !== next.streakValue ||
    JSON.stringify(toJson(prev)) !== JSON.stringify(toJson(next))
  );
}

function hasProgress(json: ProgressJson, currentValue: number, streakValue: number): boolean {
  return (
    currentValue > 0 ||
    streakValue > 0 ||
    (json.distinct?.length ?? 0) > 0 ||
    json.seq !== undefined ||
    (json.groups && Object.keys(json.groups).length > 0) ||
    json.poisoned === true
  );
}

/**
 * build the tracking service. `emit` is serialized per player (a promise chain keyed by characterId||accountId||
 * sessionId) so concurrent emits — e.g. an AoE that kills several mobs in one cast — never lose a counter
 * increment or double-grant a reward via a read-modify-write race.
 */
export function createAchievementService(deps: AchievementServiceDeps): AchievementService {
  const index = eventIndexFor(deps.defs);
  const limit = deps.clientEventLimitPerMin ?? 10;
  const buckets = new Map<string, number[]>(); // `${sessionId}:${type}` → recent timestamps (60s window)
  const chains = new Map<string, Promise<void>>();

  function allowClient(sessionId: string, type: string, nowMs: number): boolean {
    const key = `${sessionId}:${type}`;
    const cutoff = nowMs - 60_000;
    const recent = (buckets.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= limit) {
      buckets.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    buckets.set(key, recent);
    return true;
  }

  async function load(scopeKey: string, achievementId: string): Promise<StoredAchievementProgress | null> {
    if (deps.store) return deps.store.load(scopeKey, achievementId);
    return deps.memory.get(`${scopeKey}:${achievementId}`) ?? null;
  }

  async function save(input: SaveAchievementInput): Promise<void> {
    if (deps.store) {
      await deps.store.save(input);
      return;
    }
    deps.memory.set(`${input.scopeKey}:${input.achievementId}`, {
      state: input.state,
      currentValue: input.currentValue,
      streakValue: input.streakValue,
      json: input.json,
      claimed: input.state === "claimed",
    });
  }

  async function grantAndClaim(
    def: AchDef,
    scopeKey: string,
    next: ProgressState,
    event: AchievementEmitEvent,
  ): Promise<void> {
    const idempotencyKey = `achievement:${scopeKey}:${def.id}`;
    // gold first (idempotent by ledger key — a retry after a mid-grant crash never double-credits), then mark
    // claimed. gold needs a character to credit; account-scoped achievements credit the triggering character.
    if (deps.ledger && def.reward.gold && def.reward.gold > 0 && event.characterId) {
      await deps.ledger.appendEntry({
        characterId: event.characterId,
        currency: "gold",
        amount: BigInt(def.reward.gold),
        reason: "quest_reward",
        refType: "achievement",
        refId: def.id,
        idempotencyKey,
      });
    }
    await save({
      scopeKey,
      achievementId: def.id,
      state: "claimed",
      currentValue: next.currentValue,
      streakValue: next.streakValue,
      json: toJson(next),
      claimedAt: new Date(event.nowMs),
      idempotencyKey,
    });
    event.notify?.({
      achievementId: def.id,
      nameTh: def.nameTh,
      tier: def.tier,
      gold: def.reward.gold,
      titleId: def.reward.titleId,
    });
  }

  async function processDef(def: AchDef, event: AchievementEmitEvent): Promise<void> {
    if (def.phase !== "core") return; // expanded content not shipped for OB
    const scopeKey = def.scope === "account" ? event.accountId : event.characterId;
    if (!scopeKey) return; // missing scope id → cannot track (anonymous/dev)
    const stored = (await load(scopeKey, def.id)) ?? initialStored();
    if (stored.claimed) return; // terminal — claimed once, never re-grants (double-grant gate #1)

    const prev = toProgressState(stored);
    const { next, completed } = evaluateAchievement(def, prev, {
      type: event.type,
      payload: event.payload,
      nowMs: event.nowMs,
    });
    if (!completed && !progressChanged(prev, next)) return; // no-op event for this def → no write

    if (completed) {
      await grantAndClaim(def, scopeKey, next, event);
      return;
    }
    const json = toJson(next);
    await save({
      scopeKey,
      achievementId: def.id,
      state: hasProgress(json, next.currentValue, next.streakValue) ? "in_progress" : "locked",
      currentValue: next.currentValue,
      streakValue: next.streakValue,
      json,
      claimedAt: null,
      idempotencyKey: null,
    });
  }

  async function process(event: AchievementEmitEvent): Promise<void> {
    const defs = index.get(event.type);
    if (!defs) return;
    for (const def of defs) {
      try {
        await processDef(def, event);
      } catch (err) {
        deps.onError?.(def.id, err); // one def's DB/grant failure never blocks the rest (best-effort)
      }
    }
  }

  function emit(event: AchievementEmitEvent): Promise<void> {
    if (event.clientReported && event.sessionId && !allowClient(event.sessionId, event.type, event.nowMs)) {
      return Promise.resolve(); // §13: over the per-session/type budget → drop silently
    }
    const serialKey = event.characterId || event.accountId || event.sessionId || "";
    const prev = chains.get(serialKey) ?? Promise.resolve();
    const run = prev.then(() => process(event));
    // store a swallowed tail so the chain never rejects (one event's failure must not break the next); the
    // returned `run` still surfaces to an awaiting caller. drop the tail once it is the last link (no growth).
    const chained = run.catch(() => {});
    chains.set(serialKey, chained);
    void chained.finally(() => {
      if (chains.get(serialKey) === chained) chains.delete(serialKey);
    });
    return run;
  }

  function forgetSession(sessionId: string): void {
    const prefix = `${sessionId}:`;
    for (const key of buckets.keys()) if (key.startsWith(prefix)) buckets.delete(key);
  }

  return { emit, forgetSession };
}
