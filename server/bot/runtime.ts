// Character Autonomy runtime: one server controller attached to an existing character actor. Driven by the
// actor's host-room sim tick (no client clock and no separate worker/entity).
//
// Reuses the room's EXISTING seams via the BotHost interface (MapRoom implements it): movement on the collision
// grid, attacks through the SAME server combat resolution + the IDENTICAL economy entry (grantKillRewardsForMob),
// so guardrails/audit apply exactly as for a real player. PR4 adds the Free single-area safe-stop baseline;
// PR5-PR6 own recovery and multi-step workflow. Continuity itself is tier-neutral and never grants power.
//
// ⛔ SERVER-ONLY. DB writes (counter flush + stop) are best-effort — a DB error never crashes the room.

import {
  MSG_BOT_ACTOR_MAP,
  MSG_BOT_ALERT,
  MSG_BOT_STATUS,
  MSG_BOT_STOPPED,
  botPotionThresholdEnabled,
  type BotActorMapMessage,
  type BotAlertMessage,
  type BotStatusMessage,
  type BotStoppedMessage,
} from "../../src/shared/net-protocol";
import type {
  BotContinuityOperationalStateWire,
  BotContinuitySnapshotWire,
  BotContinuityStateWire,
} from "../../src/shared/bot-continuity";
import type { BotConfig, BotStopReason, BotTier } from "../config/bot";
import {
  pickTarget,
  pocketsWithAliveMobs,
  stopForForbiddenTargetInRange,
  stopForInventoryOverflow,
  stopForLowHp,
  findRareDrop,
  stopForStuck,
  throttledAttackCooldownMs,
  withinRange,
  type AgentMob,
  type Vec2,
} from "./agent";
import { planRecovery, type RecoveryPhase, type RecoverySnapshot } from "./recovery";
import { planTownPressure, type TownPressureTrigger } from "./town-pressure";
import { DEFAULT_INVENTORY_CAPACITY } from "../../src/server/inventory/item-catalog";
import type { SessionRepo } from "./store";
import type { BotRulesV1, BotSessionCounters } from "./types";
import {
  applyBotContinuityTransition,
  canIssueAutomationCommand,
  createBotContinuity,
  legacyBotActionForContinuity,
  toBotContinuityWire,
  type BotContinuitySnapshot,
} from "./continuity";
import { settlementForStoppedPlan } from "./policy";
import { buildMapAdjacency, nextHopToward, type MapAdjacency } from "./map-route";
import { MAP_REGISTRY } from "../../src/engine/map/registry";
import { TownTripController, type TownTripFacade, type TownTripTrigger, type TripEndAction } from "./town-trip";
import { WorkflowController, type WorkflowFacade } from "./workflow";
import {
  workflowConditionMet,
  workflowMetricValue,
  type BotWorkflowProgress,
  type BotWorkflowStatusCursor,
} from "../../src/shared/bot-workflow";
import type { SkillDefinition } from "../../src/game/skill/types";

/**
 * Batch 7b (Bot): per-bot state the room keeps alongside the shared session maps. Identity = the owner's
 * account/character; `skill` = the resolved basic-attack skill the bot casts each cadence. Canonical definition
 * lives HERE (not MapRoom) so warp types never pull the room/schema modules into the client/test tsc program.
 */
export interface BotMemberState {
  accountId: string;
  characterId: string;
  profileId: string;
  classId: string;
  skill: SkillDefinition;
  pocketId: string;
}

/** One attack's aggregated result from the host (may kill several mobs in the arc). */
export interface BotAttackOutcome {
  killed: number;
  gold: number;
  exp: number;
  loot: { itemId: string; quantity: number }[];
  /** True when any earned item missed the real bag, including items safely routed to Delivery Box. */
  bagOverflowed: boolean;
  /** loot that could not be banked (bag full / no delivery) — drives the inventory_full stop. */
  overflow: { itemId: string; quantity: number }[];
  leveledUp: boolean;
}

/** Result of one bot potion attempt through the shared consumable service (mirrors the manual use-item path). */
export interface BotPotionOutcome {
  status: "healed" | "not_needed" | "no_potion" | "on_cooldown" | "conflict" | "unavailable";
  /** live hp/maxHp after the attempt (best-effort). */
  hpFraction: number;
  /** current per-actor consumable gate (0 if unknown). */
  cooldownUntilMs: number;
}

/**
 * Result of one bot town transaction (sell/deposit/buy) through the SAME shop/storage services as manual play
 * (D-069/D-070). Town seams are gated by the room's own map: shopForMap / storageAvailableForMap return nothing on
 * a farm map, so a bot that is not physically in the city-hub structurally cannot transact — there are NO remote
 * transactions. Town seams MUST NOT emit achievements/milestones (D-070: bots never trigger them from services).
 */
export interface BotTownTxResult {
  ok: boolean;
  /** the service reject code (or "unavailable"/"error") when !ok; absent on success. */
  reason?: string;
  /** ledger gold delta: +sell proceeds / -buy cost; 0 when n/a (deposit) or !ok. */
  goldDelta?: number;
}

/**
 * Minimal per-instance bag view the trip controller (next task) filters by policy (rarity / keep-list / equip /
 * sellability) without re-deriving item semantics. Shaped from what the inventory record + catalog + the current
 * map's shop config already know: `rarity` from the catalog; `equipped` from the instance location; `sellPrice`
 * from the map shop's sell table (null when the shop is absent, the id is non-sellable, or has no price); and
 * `deliverable = false` when the item cannot be deposited (equipped / bound / blocked storage policy).
 */
export interface BotBagItemView {
  instanceId: string;
  itemId: string;
  quantity: number;
  version: number;
  rarity: string;
  equipped: boolean;
  sellPrice: number | null;
  deliverable: boolean;
}

/**
 * Per-waypoint arrival tolerance (tiles) when walking a planned return route: advance to the next node once the
 * real actor is within this radius. A navigation epsilon, not a balance knob — the pocket arrival radius that
 * ends the whole return (config.recovery.pocketArriveRadiusTiles) is the design-tuned value the planner owns.
 */
const RETURN_WAYPOINT_ARRIVE_TILES = 0.5;

/** Shared inert placeholders for the Free recovery snapshot's paid-only pocket fields (never read by the Free branch). */
const EMPTY_POCKET_SET: ReadonlySet<string> = new Set<string>();
const EMPTY_ANCHOR_MAP: ReadonlyMap<string, Vec2> = new Map<string, Vec2>();

/**
 * D-071 M2b: the directed portal graph, built ONCE from the real map registry (city-hub↔map1↔map2↔map3↔map4). The
 * walk town trip recomputes the next hop per leg over this graph; warp trips ignore it (they transfer directly).
 */
const MAP_ADJACENCY: MapAdjacency = buildMapAdjacency(MAP_REGISTRY.values());

/** Continuity reason code per town-trip trigger (audit-only; the trip itself is identical across triggers). */
const TOWN_TRIP_REASON: Record<TownTripTrigger, string> = {
  bag_full: "bag_full_town_trip",
  preflight: "preflight_town_trip",
  workflow: "workflow_town_step",
  potion_low: "potion_low_town_trip", // M2a (D-073)
  bag_pressure: "bag_pressure_town_trip", // M2a (D-073)
  hp_no_potion: "hp_no_potion_town_trip", // M2a (D-073)
  goal: "goal_town_trip", // M1 Plus single-goal town_stop / town_continue completion action
};

/**
 * M1 Plus single-goal: project the runtime's live session counters (kills/gold/exp) + the run duration into the
 * shared workflow-progress shape, so a single goal reuses `workflowConditionMet` / `workflowMetricValue` — never a
 * duplicate formula. A single goal reads WHOLE-RUN counters (a workflow farm-step reads a per-step delta). Pure.
 */
export function goalProgress(
  counters: Pick<BotSessionCounters, "killCount" | "goldEarned" | "expEarned">,
  elapsedMs: number,
): BotWorkflowProgress {
  return { kills: counters.killCount, gold: counters.goldEarned, exp: counters.expEarned, elapsedMs };
}

/**
 * M1 live-stats time bucket for one tick, derived from the current continuity operational state (the runtime
 * already owns it, so no controller/phase peeking). Trip travel to/from town (RETURNING_TO_TOWN / RETURNING_TO_WORK,
 * which also covers the post-warp walk home) is `walking`; the in-town service beats (SELLING / DEPOSITING /
 * RESTOCKING) are `inTown`; everything else (farming / combat / recovery at the pocket, incl. the walk-to-service
 * leg which is still RETURNING_TO_TOWN → walking) is `farming`. Pure.
 */
export function statsTimeBucket(state: BotContinuityStateWire): "farming" | "walking" | "inTown" {
  switch (state) {
    case "RETURNING_TO_TOWN":
    case "RETURNING_TO_WORK":
      return "walking";
    case "SELLING":
    case "DEPOSITING":
    case "RESTOCKING":
      return "inTown";
    default:
      return "farming";
  }
}

/** Verified request to hand an already-materialized character actor to automation. */
export interface BotAuthorityInput {
  controllerSessionId: string;
  accountId: string;
  characterId: string;
  profileId: string;
  /** allowed skill-slot indices (validated against the actor's real class/loadout by the host). */
  allowedSlots: number[];
  /** The permitted pocket; claiming authority never teleports the actor into it. */
  pocketId: string;
}

/**
 * Snapshot of a live character actor captured for a server-owned warp transfer between sibling MapRooms (D-069,
 * PR5 Phase B). In-memory only; combat stats are recomputed at the target from level + equipment, never copied.
 * Position is intentionally omitted — the destination anchor overrides it.
 */
export interface BotWarpExport {
  /** stable opaque actor id (unchanged across the warp). */
  actorId: string;
  accountId: string;
  characterId: string;
  /** PlayerState schema fields carried verbatim (recomputed maxHp equals this by construction). */
  classId: string;
  name: string;
  hp: number;
  maxHp: number;
  level: number;
  exp: number;
  expFloor: number;
  expCeil: number;
  /** per-actor session maps to restore at the target (progression / identity / worn gear / class). */
  sessionProgress: { level: number; exp: number };
  sessionCharacters: { accountId: string; characterId: string; lastSaveMs: number };
  sessionEquipment: readonly { itemId: string; enhancementLevel: number }[];
  sessionClassId: string;
  /** automation metadata re-registered at the target so the running runtime keeps driving the same actor. */
  botMember: BotMemberState;
  /** true when a controller transport was attached to the actor at export time (owner is watching). */
  ownerAttached: boolean;
}

/** The room seam the bot drives. MapRoom implements this; tests use a fake. */
export interface BotHost {
  readonly mapId: string;
  readonly roomId: string;
  /** "" for a solo channel; the warp target selection never routes into a party channel. */
  readonly partyId: string;
  /**
   * Claim the verified controller's existing actor. Returns its stable actor id; null means missing actor,
   * ownership mismatch, invalid skill/pocket, or authority already claimed. This method must never spawn.
   */
  botClaimAuthority(input: BotAuthorityInput): string | null;
  /** Release automation only. The real actor and its state must remain materialized while its owner is attached. */
  botReleaseAuthority(actorId: string): void;
  /** snapshot of live mobs for the agent. */
  botMobs(): AgentMob[];
  /** current bot tile position (null = member gone). */
  botPos(actorId: string): Vec2 | null;
  /** current hp fraction 0..1. */
  botHpFraction(actorId: string): number;
  /** the chosen basic-attack skill's range (tiles). */
  botAttackRange(actorId: string): number;
  /** the chosen basic-attack skill's base cooldown (seconds) — throttled by the runtime. */
  botBaseCooldownSeconds(actorId: string): number;
  /** Step toward `target` at normal move speed. True only when the real actor position advanced. */
  botStepToward(actorId: string, target: Vec2, dtMs: number): boolean;
  /**
   * face `target`, cast the basic attack through the room combat+economy seams, resolve the aggregate outcome.
   * Async: the reward grant (EXP/gold/drops) runs through the same async economy path as a real player's kill.
   * Damage + the visual broadcast happen synchronously first; the promise resolves after the grants persist.
   */
  botAttack(actorId: string, target: Vec2): Promise<BotAttackOutcome>;
  /** send a message to the owner IF they are connected in this room (offline owner → false, no push). */
  botOwnerSend(accountId: string, type: string, msg: unknown): boolean;
  /** True for boss/elite/event/unknown targets that Character Autonomy may never fight. */
  isForbiddenTargetType(mobType: string): boolean;
  /** true when the pocket still exists + is bot-safe (map_unsafe guard). */
  pocketExists(pocketId: string): boolean;
  /**
   * Drink one unit of `itemId` for the automated actor through the SAME server consumable service + per-actor
   * cooldown gate as manual play (never-downgrade: the consume commits before the heal). Async: the version-
   * guarded consume + owner inventory push run the identical DB path as a real player's use-item. See
   * {@link BotPotionOutcome}; missing member/persistence/state or a config/DB error all fail closed to "unavailable".
   */
  botUsePotion(actorId: string, itemId: string): Promise<BotPotionOutcome>;
  /**
   * A* route on the room collision grid from the actor's current tile to `goal` (same pathfinding module + node
   * cap as movement). `[]` = already there; `null` = unreachable, goal blocked, or over the search cap.
   */
  botPlanPath(actorId: string, goal: Vec2): Vec2[] | null;
  /**
   * Walkable anchor tile for a mob pocket (a route target): the pocket rect's center, or the nearest walkable
   * tile scanned outward within the rect. null = the pocket is missing or has no walkable tile.
   */
  botPocketAnchor(pocketId: string): Vec2 | null;
  /**
   * D-069 warp seam (PR5 Phase B). Reserve a world seat for an incoming warp on the same actor-keyed mechanism as
   * onJoin (players.size + pending vs maxClients). True = a seat is held; the caller releases it after attach.
   */
  botReserveWarpSeat(actorId: string): boolean;
  /** Release a warp seat reservation taken by {@link botReserveWarpSeat} (mirrors the onJoin finally). */
  botReleaseWarpSeat(actorId: string): void;
  /**
   * Synchronously detach the actor from THIS room and collect its full transferable state, or null when the actor
   * is not a live bot member here. This is a transfer, NOT a leave: it deliberately bypasses removePlayer and never
   * releases authority, stops the bot, or notifies the manager. The caller must attach it elsewhere in the same tick.
   */
  botExportActor(actorId: string): BotWarpExport | null;
  /**
   * Synchronously re-materialize an exported actor at `anchor` in THIS room and re-register its automation. Returns
   * false (invariant breach guard) when the actor/character is already present here. Combat stats are recomputed.
   */
  botAttachWarpedActor(exported: BotWarpExport, anchor: Vec2): boolean;
  /** Fire-and-forget durable save of the actor's position/progression (best-effort; never throws). */
  botPersistNow(actorId: string): void;
  /**
   * D-071 (walk town trip): the exit on THIS map toward `targetMapId` — a walkable `approach` tile inside the
   * exit's trigger area (the bot walks here before the server-owned transfer, mirroring where a real player
   * crosses) and the `landing` spawn in the target map. null when no exit connects the two maps. Optional: a host
   * that never carries a walking bot (warp-only tiers, most fakes) may omit it — the runtime falls back to null.
   */
  botExitToward?(targetMapId: string): { approach: Vec2; landing: Vec2 } | null;

  // ── D-069/D-070 town transaction seams (PR5 Phase C) ──────────────────────────────────────────────────────
  // Delegate to the SAME pure shop/storage services the manual handlers use, gated by the room's own map
  // (shopForMap/storageAvailableForMap yield nothing on a farm map → structurally no remote transactions) and
  // MUST NOT emit achievements/milestones. INERT until the trip controller (next task) drives them.

  /** Live bag + worn-gear view for the trip controller's policy filtering (rarity / keep / equip / sellability). */
  botBagItems(actorId: string): Promise<BotBagItemView[]>;
  /** Sell `quantity` of a bag instance through the manual sell service, keyed by the bot's fixed idempotency key. */
  botTownSell(
    actorId: string,
    instanceId: string,
    expectedVersion: number,
    quantity: number,
    idemKey: string,
  ): Promise<BotTownTxResult>;
  /** Deposit a bag instance into account storage through the manual deposit service (idempotency-keyed). */
  botTownDeposit(
    actorId: string,
    instanceId: string,
    expectedVersion: number,
    idemKey: string,
  ): Promise<BotTownTxResult>;
  /** Buy `quantity` of `itemId` from the town shop through the manual buy service (idempotency-keyed). */
  botTownBuy(actorId: string, itemId: string, quantity: number, idemKey: string): Promise<BotTownTxResult>;
  /**
   * Authoritative gold balance (SUM of the currency ledger) for the actor's character — the SAME value the shop
   * buy path debits. The trip controller re-reads this before each restock buy so the D-070 gold reserve holds
   * (a summed goldDelta is unreliable under a duplicate replay). null = missing member / no persistence / DB error.
   */
  botGoldBalance(actorId: string): Promise<number | null>;
  /**
   * This room's safe-camp anchor tile (§59.1). Used as the warp arrival anchor when townTrip.townAnchor is null
   * (city-hub has no farm pockets) and as the always-safe return anchor at the farm. Read-only position getter.
   */
  botSafeCampAnchor(): Vec2;
}

export interface BotRuntimeDeps {
  host: BotHost;
  config: BotConfig;
  sessionRepo: SessionRepo;
  /** Rarity lookup for ordinary-rare notification and future plan-selected actions. */
  rarityOf: (itemId: string) => string | undefined;
  /** the persisted bot_sessions row id (a report). */
  sessionRowId: string;
  accountId: string;
  characterId: string;
  profileId: string;
  actorId: string; // stable id of the owner's real character actor in the room
  mapId: string;
  pocketId: string;
  rules: BotRulesV1;
  /** effective tier resolved at start. Free runs the PR4 baseline verbatim; paid tiers unlock the recovery loop. */
  tier: BotTier;
  /** live re-resolve of the effective tier — a pass may expire mid-run (periodic recheck stops the run safely). */
  resolveTier: () => Promise<BotTier>;
  /** base attack cooldown (seconds) of the chosen skill — throttled by efficiency. */
  baseCooldownSeconds: number;
  startedAtMs: number;
  /** Continuity begins when authority is claimed, before the accepted session insert finishes. */
  initialContinuity?: BotContinuitySnapshot;
  /** authoritative wall clock (DI keeps transitions deterministic in tests). */
  now: () => number;
  /** called when the runtime stops (any reason) so the manager drops it. */
  onStopped: (accountId: string, sessionRowId: string) => void;
  /** takeover checkpoint becomes resumable only after the accepted reward/report write has drained. */
  onTakeoverSettled: (accountId: string, checkpointId: string, saved: boolean) => void;
  /**
   * PR5 Phase C (D-069): acquire (or create) a SOLO host for a target map — the town-trip warp target on the way
   * out (city-hub) and the farm map on the way back. Optional: absent = the runtime cannot town-trip (Free path
   * and the existing recovery suites never pass it, and never call {@link BotRuntime.beginTownTrip}).
   */
  acquireHostForMap?: (mapId: string) => Promise<BotHost | null>;
  /**
   * PR5 Phase B (D-069): fan an owner-directed message across every registered host. After a warp the owner's
   * transport may sit in a sibling room, so a single stored host is no longer authoritative. Optional: absent =
   * fall back to the current host's own `botOwnerSend` (identical to the pre-trip behavior).
   */
  ownerSend?: (accountId: string, type: string, message: unknown) => boolean;
  /**
   * PR5 Phase C (D-069/D-070) · D-073: the manager's proactive bag preflight found the bag already at/over the town
   * pressure threshold at start (free slots < townTrip.resumeMinFreeSlots). On the FIRST tick the runtime opens a
   * town trip BEFORE farming a single mob (never farm with a full bag → loot leaks). A refusal (cooldown / no warp
   * dep / tier not enabled) clears the flag and farms normally; the bag-full divert then catches the next real
   * overflow. Absent/false = the ordinary farm start. D-073 added Free (walk mode) — it now preflights too.
   */
  initialTownTrip?: boolean;
  /**
   * PR6a (D-067): persist a durable running checkpoint so a Pro run survives a server restart. The runtime calls
   * this ONLY for Pro (gated on the live tier) — piggybacked on the flush cadence and once more on a graceful
   * `server_restart` stop. Optional: absent (Free path + the recovery/warp suites) = no durable persistence, so
   * every tier's in-process behavior is byte-identical to before. The manager reads {@link BotRuntime.runningCheckpoint}.
   */
  persistRunningCheckpoint?: () => void;
  /**
   * PR6b (Pro goal chain): the step to resume a workflow at (a checkpoint cursor). Absent/0 = start at the first
   * step. Only used when the profile carries a workflow AND the tier is Pro; the counters always start fresh.
   */
  workflowStartStepIndex?: number;
}

export class BotRuntime {
  private readonly d: BotRuntimeDeps;
  private readonly throttleMs: number;
  private readonly counters: BotSessionCounters = { killCount: 0, goldEarned: 0, expEarned: 0, drops: {} };
  private continuity: BotContinuitySnapshot;
  private decisionTimer = 0;
  private idleDecisions = 0;
  private sinceFlushMs = 0;
  private sinceStatusMs = 0;
  private stopped = false;
  /**
   * Async automation ops in flight (attack+grant today; potion/path/service arrive in PR5). Each dispatch takes a
   * lease; the resolution continuation drops it. A nonempty registry defers finalizeStop so an already-committed
   * economy grant always drains into the report before authority release.
   */
  private readonly pendingLeases = new Map<symbol, "attack" | "potion" | "town">();
  private pendingStop: { reason: BotStopReason; requestedAt: number } | null = null;
  private stopFinalized = false;
  private authorityReleased = false;
  private takeoverCheckpointId: string | null = null;
  /** Serialize periodic/final report patches so an older flush can never land after the checkpoint close. */
  private persistenceTail: Promise<void> = Promise.resolve();

  // ── PR5 recovery state (paid tiers only; Free never touches any of this) ──────────────────────────────
  /** The pocket currently farmed — equals the assigned pocket for Free forever; a paid fallback may swap it. */
  private activePocketId: string;
  /** The effective tier this tick — reconfirmed periodically so a lapsed pass stops the run (expired_readonly). */
  private currentTier: BotTier;
  private recoveryPhase: RecoveryPhase = { kind: "none" };
  private deathRecoveryCount = 0;
  /** D-075 (F7): log a failed no_potion drink at most once per episode (reset on a successful heal) — not every retry. */
  private noPotionLogged = false;
  private sinceTierCheckMs = 0;
  private tierCheckInFlight = false;
  /** Log a flaky tier-recheck DB error at most once per runtime — it must never kill an otherwise healthy run. */
  private tierWarned = false;
  private lastRouteReplanMs = 0;
  /** Lazily built for paid tiers only (config allowed pockets ∩ existing) — never computed for Free. */
  private allowedPocketsCache: readonly string[] | null = null;
  /** Static-per-map anchor cache (built on first paid need over the allowed pockets) — never built for Free. */
  private pocketAnchorsCache: Map<string, Vec2> | null = null;

  // ── PR5 Phase C town-trip state (D-069/D-070; Plus/Pro only — Free never town-trips) ──────────────────────
  /**
   * The host the runtime currently drives. Starts at `deps.host`; a town-trip warp rebinds it to the town host and
   * then back to a farm host. Mutable so tickRoom routing (`rt.host === host`) follows the actor automatically.
   */
  private currentHost: BotHost;
  /** Active town trip, or null when farming. While non-null, tickPaid delegates the whole tick to it (no planner). */
  private tripController: TownTripController | null = null;
  /**
   * D-071 (walk town trip): the active walk cursor toward an arbitrary tile (a map portal, the town shop). Driven
   * directly by the controller — independent of the recovery planner — so Free (whose tick never enters
   * runRecoveryFarm) walks to the city-hub and back. null when not mid-walk.
   */
  private tripWalk: { goal: Vec2; waypoints: Vec2[]; nextIndex: number } | null = null;
  /** Last completed town trip (epoch ms) — the cooldown gate; NEGATIVE_INFINITY = never (first trip allowed). */
  private lastTownTripAt = Number.NEGATIVE_INFINITY;
  /** Short backoff after a trip that never moved the actor (target/seat unavailable) so it does not spin per tick. */
  private townTripRetryUntil = 0;
  /** D-075 (F7): the last logged town-trip refusal gate, so a trigger firing every tick during a backoff/cooldown
   *  window logs the reason once (per episode) instead of spamming. Cleared on a successful begin. */
  private lastTownTripRefusal: string | null = null;
  /** Per-runtime trip sequence — fixes the idempotency-key namespace so a retried transaction reuses its key. */
  private tripSeq = 0;
  /** One-shot proactive preflight: the first tick opens a town trip before farming (D-069/D-070; D-073 adds Free). */
  private initialTownTripPending = false;

  // ── M2a (D-073) proactive bag-pressure sample (every tier) ─────────────────────────────────────────────────
  /**
   * The last bag sample driving proactive town pressure, or null before the first read / after a trip (stale). The
   * runtime refreshes it on a cadence (config.townTrip.pressureCheckIntervalMs) via the async botBagItems seam — a
   * pressure decision is NEVER made from empty data (null → skip). Kept fresh between reads by sync patches: −1
   * potion on a successful drink, freeSlots=0 on an attack overflow, nulled on trip end (re-read next farm tick).
   */
  private bagStat: { freeSlots: number; potionCount: number; readAtMs: number } | null = null;
  /** true while a bag sample read is in flight (one read at a time — never read every tick). */
  private bagStatInFlight = false;
  /**
   * D-075 follow-up: has THIS run ever observed a potion in the bag (a sample saw potionCount > 0)? Gates the
   * proactive `potion_low` trigger so it means "ran out mid-run", not "a fresh actor carries no potions". Per-run
   * (a new run = a new BotRuntime), so it never needs resetting.
   */
  private hadPotionsThisRun = false;
  /** ms since the last bag sample read (initialized past the interval so the first farm tick samples). */
  private sinceBagCheckMs = 0;

  // ── PR6b Pro goal-chain state (Pro + a profile workflow only — every other run is null here) ────────────────
  /** The goal-chain engine, or null when the run has no workflow (Free/Plus, or Pro without a chain). */
  private readonly workflowController: WorkflowController | null;

  // ── M1 Plus single-goal + targeting + live stats (paid single-pocket runs; Free/workflow are null-ops here) ──
  /** SELECTED_TYPES filter (undefined = ALL_IN_AREA, the pre-M1 behaviour). Built once from the normalized rules. */
  private readonly selectedMobTypes: ReadonlySet<string> | undefined;
  /** True once the single goal (rules.goal) has been dispatched — fences a second completion action / alert. */
  private goalReached = false;
  /** In-memory-only activity stats surfaced in every status push (data, never power; not persisted, no column). */
  private readonly stats = { townTrips: 0, potionsUsed: 0, deaths: 0, msFarming: 0, msWalking: 0, msInTown: 0 };
  /**
   * The reason the last restock did not fully top up potions (`gold_reserve` / `restock_skipped`), or null once a
   * restock completes (`restock_done`) — folded into every status push so the owner can see WHY the bot did not
   * buy potions. In-memory only (diagnostic, never power); the town-trip controller reports it via the facade.
   */
  private lastTownSkip: string | null = null;

  constructor(deps: BotRuntimeDeps) {
    this.d = deps;
    this.currentHost = deps.host;
    this.throttleMs = throttledAttackCooldownMs(deps.baseCooldownSeconds, deps.config.botEfficiencyTarget);
    this.continuity = deps.initialContinuity
      ? { ...deps.initialContinuity }
      : createBotContinuity(deps.startedAtMs);
    this.activePocketId = deps.pocketId;
    this.currentTier = deps.tier;
    this.initialTownTripPending = deps.initialTownTrip === true;
    // Sample the bag on the first farm tick (not one full interval later) so proactive pressure reacts promptly.
    this.sinceBagCheckMs = deps.config.townTrip.pressureCheckIntervalMs;
    // A goal chain is a Pro capability (validateRules + start re-gate it). Constructing the engine here means tick
    // routes Pro+workflow to tickWorkflow; any non-Pro run (or a Pro run with no chain) keeps the pre-PR6b path.
    this.workflowController =
      deps.tier === "pro" && deps.rules.workflow
        ? new WorkflowController(this.makeWorkflowFacade(), deps.rules.workflow, deps.workflowStartStepIndex ?? 0)
        : null;
    // M1 SELECTED_TYPES: the runtime only ever restricts targets to a non-empty selected set; ALL_IN_AREA (or a
    // malformed empty list) leaves the filter off so the farm loop targets every bot-safe mob in the pocket.
    this.selectedMobTypes =
      deps.rules.targetMode === "SELECTED_TYPES" && deps.rules.selectedMobTypes && deps.rules.selectedMobTypes.length > 0
        ? new Set(deps.rules.selectedMobTypes)
        : undefined;
  }

  get actorId(): string {
    return this.d.actorId;
  }
  get accountId(): string {
    return this.d.accountId;
  }
  get characterId(): string {
    return this.d.characterId;
  }
  get profileId(): string {
    return this.d.profileId;
  }
  get sessionRowId(): string {
    return this.d.sessionRowId;
  }
  get mapId(): string {
    return this.d.mapId;
  }
  get pocketId(): string {
    return this.d.pocketId;
  }
  get host(): BotHost {
    return this.currentHost;
  }
  get isStopped(): boolean {
    return this.stopped;
  }
  get continuitySnapshot(): BotContinuitySnapshotWire {
    return toBotContinuityWire(this.continuity);
  }

  /**
   * PR6a (D-067): the durable running-checkpoint snapshot the manager persists for a Pro restart resume. `mapId` +
   * `pocketId` are where the actor currently farms; `continuity` is diagnostic only — resume starts a NEW run at
   * WORKING and re-validates the live actor. Never replayed.
   */
  get runningCheckpoint(): {
    mapId: string;
    pocketId: string;
    continuity: BotContinuitySnapshotWire;
    workflow?: { stepIndex: number };
  } {
    return {
      mapId: this.currentHost.mapId,
      pocketId: this.activePocketId,
      continuity: toBotContinuityWire(this.continuity),
      workflow: this.workflowController?.checkpointCursor(),
    };
  }

  /** PR6b: the goal-chain cursor captured into a takeover checkpoint (absent for a single-pocket run). */
  get workflowCheckpoint(): { stepIndex: number } | undefined {
    return this.workflowController?.checkpointCursor();
  }

  /** advance one host sim tick; may stop the bot. */
  tick(dtMs: number): void {
    if (this.stopped || !canIssueAutomationCommand(this.continuity)) return;
    // M1 live stats: bucket this tick's elapsed time by the CURRENT operational state (before any transition below).
    this.accrueStatsTime(dtMs);

    // Free tier (D-073): auto-potion + proactive town pressure around the PR4 farm loop. No death recovery, no
    // pocket fallback, no tier recheck (`activePocketId` never leaves the assigned pocket for Free).
    if (this.currentTier === "free") {
      this.tickFree(dtMs);
      return;
    }

    // Pro goal chain (PR6b): the engine owns the tick, reusing the same recovery/farm loop + town trip below.
    if (this.workflowController) {
      this.tickWorkflow(dtMs);
      return;
    }

    this.tickPaid(dtMs);
  }

  /**
   * Free-tier tick (D-073): a proactive preflight, then — with no active trip — one auto-potion / low-hp-floor
   * decision, proactive town pressure, and the farm loop. Free never rechecks tier, never enters death recovery,
   * and never pocket-fallbacks; the walk town trip (D-071) is its only away-from-pocket movement.
   */
  private tickFree(dtMs: number): void {
    // (a) one-shot proactive preflight: the bag was already full at start → walk to town before farming a mob.
    if (this.initialTownTripPending) {
      this.initialTownTripPending = false;
      this.beginTownTrip("preflight");
    }

    // (b) an active WALK town trip owns the whole tick (walk out → services → walk home).
    if (this.tripController) {
      if (this.hasPendingAttack()) return; // never walk-out while a committed grant is still draining.
      this.tripController.tickTrip(dtMs);
      return;
    }

    this.runFreeFarm(dtMs);
  }

  /**
   * Free recovery + proactive pressure + farm, in order: (b) auto-potion / low-hp-floor via the shared planner
   * (Free branch: potion + floor only); (c) proactive town pressure — a would-be floor stop is DEFERRED so a walk
   * to restock gets first crack (better than an immediate wait-for-owner); (d) the deferred floor stop, else farm.
   */
  private runFreeFarm(dtMs: number): void {
    const host = this.currentHost;
    const config = this.d.config;
    const pos = host.botPos(this.d.actorId);
    if (!pos) return void this.stop("map_unsafe"); // member vanished (matches runFarmBody's guard order).
    if (!host.pocketExists(this.activePocketId)) return void this.stop("map_unsafe");

    // (b) auto-potion / low-hp floor. The Free branch only ever returns use_potion / hold / stop(low_hp) / baseline.
    const decision = planRecovery(this.buildFreeRecoverySnapshot(pos), config.recovery);
    // D-075 (F2): a use_potion decision with a known-empty potion bag falls through (no bottle to drink) to the
    // proactive town pressure / farm below — the hp_no_potion trigger walks to restock instead of spam-failing a drink.
    if (decision.kind === "use_potion" && !this.potionsDepleted()) return void this.dispatchUsePotion();
    if (decision.kind === "hold") return; // a drink is in flight — wait for its result.
    const floorStop = decision.kind === "stop" ? decision.reason : null;

    // (c) proactive town pressure (potion low / bag pressure / hp with no potion → WALK to town). Skipped until a
    //     bag sample exists (never trigger from empty data). A refused begin falls through to the floor stop / farm,
    //     except an hp_no_potion refusal at/below the floor stops low_hp (never farm to death — Free has no recovery).
    const trigger = this.proactiveTownTrigger(dtMs);
    if (trigger) {
      if (this.beginTownTrip(trigger)) return; // walk trip owns the next ticks.
      if (trigger === "hp_no_potion" && host.botHpFraction(this.d.actorId) <= config.lowHpStopFraction) {
        return void this.stop("low_hp");
      }
    }

    // (d) apply a deferred floor stop, else run the ordinary Free farm loop (planner owns the floor → skip inline).
    if (floorStop) return void this.stop(floorStop);
    this.runFarmBody(dtMs, true);
  }

  /**
   * Minimal recovery snapshot for the Free branch of planRecovery (potion + floor only). Pocket fields are inert
   * placeholders — the Free branch never reads them — so Free never builds the paid pocket/anchor caches or makes
   * the extra host calls those would incur.
   */
  private buildFreeRecoverySnapshot(pos: Vec2): RecoverySnapshot {
    const host = this.currentHost;
    return {
      nowMs: this.d.now(),
      tier: "free",
      hpFraction: host.botHpFraction(this.d.actorId),
      position: pos,
      assignedPocketId: this.d.pocketId,
      activePocketId: this.activePocketId,
      allowedPockets: [this.activePocketId],
      pocketsWithAliveMobs: EMPTY_POCKET_SET,
      pocketAnchors: EMPTY_ANCHOR_MAP,
      potionThresholdFraction: this.potionThresholdFraction(),
      lowHpStopFraction: this.d.config.lowHpStopFraction,
      idleDecisions: this.idleDecisions,
      deathRecoveryCount: this.deathRecoveryCount,
      phase: this.recoveryPhase,
    };
  }

  /**
   * The PR4 farm loop (pos/pocket guard → low-hp → boss → target → travel/combat/attack → stuck → flush/status),
   * targeting `activePocketId`. Free runs it with `skipInlineLowHp === false` (identical to PR4); a paid baseline
   * runs it with the inline low-hp stop skipped because the recovery planner owns the low-hp floor.
   */
  private runFarmBody(dtMs: number, skipInlineLowHp: boolean): void {
    const host = this.currentHost;
    const config = this.d.config;
    const pocketId = this.activePocketId;

    const pos = host.botPos(this.d.actorId);
    if (!pos) return void this.stop("map_unsafe"); // member vanished
    if (!host.pocketExists(pocketId)) return void this.stop("map_unsafe");

    // #2 low hp (potion-exhausted substitution). death arrives via the host contact path (onActorDied).
    if (!skipInlineLowHp) {
      const hpStop = stopForLowHp(host.botHpFraction(this.d.actorId), config.lowHpStopFraction);
      if (hpStop) return void this.stop(hpStop);
    }

    const mobs = host.botMobs();
    // #7 boss/event in range.
    const bossStop = stopForForbiddenTargetInRange(
      pos,
      mobs,
      (mobType) => host.isForbiddenTargetType(mobType),
      config.bossStopRadiusTiles,
    );
    if (bossStop) return void this.stop(bossStop);

    // M1 SELECTED_TYPES: the same farm loop for every path (Free / paid / Pro chain), so the type filter applies
    // uniformly. undefined = ALL_IN_AREA (every bot-safe mob in the pocket).
    const target = pickTarget(pos, mobs, pocketId, this.selectedMobTypes);
    this.decisionTimer += dtMs;

    if (target) {
      const range = host.botAttackRange(this.d.actorId) * config.attackRangeFactor;
      if (!withinRange(pos, target, range)) {
        if (!this.advanceContinuity("TRAVELING", "target_out_of_range")) return;
        const progressed = host.botStepToward(this.d.actorId, target, dtMs);
        if (progressed) {
          this.idleDecisions = 0;
        } else if (this.decisionTimer >= this.throttleMs) {
          // Sample blocked movement on the same throttled cadence as an empty pocket. A target behind collision
          // must eventually become an owner-visible Free obstacle instead of spinning forever in TRAVELING.
          this.decisionTimer = 0;
          this.idleDecisions += 1;
          const stuck = stopForStuck(this.idleDecisions, config.stuckTickLimit);
          if (stuck) return void this.onFarmBlocked("stuck"); // a reachable-but-blocked target
        }
      } else if (!this.advanceContinuity("COMBAT", "target_in_range")) {
        return;
      }
      if (this.decisionTimer >= this.throttleMs && !this.hasPendingAttack()) {
        const p2 = host.botPos(this.d.actorId) ?? pos;
        if (withinRange(p2, target, range)) {
          this.decisionTimer = 0;
          this.idleDecisions = 0;
          if (!this.advanceContinuity("COMBAT", "attack_committed")) return;
          this.runAttack(target);
        }
      }
    } else {
      if (!this.advanceContinuity("WORKING", "seeking_work")) return;
      if (this.decisionTimer >= this.throttleMs) {
        // Keep accumulating toward the next stuck decision without inventing a separate IDLE state.
        this.decisionTimer = 0;
        this.idleDecisions += 1;
        const stuck = stopForStuck(this.idleDecisions, config.stuckTickLimit);
        if (stuck) return void this.onFarmBlocked("pocket_empty"); // no reachable target in the pocket
      }
    }

    this.sinceFlushMs += dtMs;
    if (this.sinceFlushMs >= config.sessionFlushIntervalMs) {
      this.sinceFlushMs = 0;
      void this.flush(null);
      // PR6a (D-067): piggyback a durable running checkpoint so a Pro run survives a restart. Pro-only, and a
      // no-op without the manager dep wired (Free/recovery suites) → every tier's flush cadence is unchanged.
      if (this.currentTier === "pro") this.d.persistRunningCheckpoint?.();
    }
    this.sinceStatusMs += dtMs;
    if (this.sinceStatusMs >= config.statusPushIntervalMs) {
      this.sinceStatusMs = 0;
      this.pushStatus();
    }
  }

  /**
   * Paid-tier tick: a periodic entitlement recheck, then one pure recovery decision (potion / respawn-return /
   * pocket-fallback / stop) applied around the same farm loop. The planner only reads; every phase transition and
   * host side effect lives here, state-before-side-effect and revision-fenced like PR4.
   */
  private tickPaid(dtMs: number): void {
    const host = this.currentHost;
    const config = this.d.config;

    // (a) periodic tier recheck — runs during a town trip too: a lapsed pass aborts the paid transactions but the
    //     return warp still runs (getting the actor home is safety, not paid value) before settling expired_readonly.
    this.sinceTierCheckMs += dtMs;
    if (this.sinceTierCheckMs >= config.recovery.tierRecheckIntervalMs && !this.tierCheckInFlight) {
      this.recheckTier();
    }

    // (a2) one-shot proactive preflight: the manager found the bag already at/over the town pressure threshold at
    //      start, so open a town trip BEFORE farming a single mob (never farm with a full bag → loot leaks). A
    //      refusal (cooldown / no warp dep / tier not enabled) clears the flag and farms normally; the bag-full
    //      divert catches the next real overflow. One-shot: cleared on the first attempt regardless of outcome.
    if (this.initialTownTripPending) {
      this.initialTownTripPending = false;
      this.beginTownTrip("preflight");
    }

    // (b) an active town trip owns the whole tick — no recovery planner, no farm loop, no pocket/map_unsafe check
    //     (the trip states are not farm states). canIssueAutomationCommand (tick's outer gate) still fences it.
    if (this.tripController) {
      // Never run the synchronous warp export while an attack grant is still in flight: the committed grant must
      // drain into the report before authority moves rooms. By construction the bag-full divert sets the
      // controller only inside the attack continuation (the lease releases in that same microtask, before any
      // later tick), so this defers at most nothing in practice — it makes the invariant explicit + refactor-safe.
      if (this.hasPendingAttack()) return;
      this.tripController.tickTrip(dtMs);
      return;
    }

    // (b2) M1 Plus single-goal: a met goal dispatches its completion action (stop / notify+farm / town trip). It
    //      runs AFTER the active-trip check so a goal never re-fires mid-trip, and BEFORE the farm loop so a met
    //      goal need not farm one more mob. Free (no goal by validation) never reaches here; a Pro chain uses
    //      tickWorkflow. Returns true when the tick is handled (stopped, or a completion town-trip opened).
    if (this.maybeHandleGoal()) return;

    // (c)+(d) one deterministic recovery decision + the farm loop.
    this.runRecoveryFarm(dtMs);
  }

  /**
   * M1 Plus single-goal completion (paid single-pocket runs only — a Pro workflow carries its own per-step goals,
   * Free has no goal). Once the whole-run session counters reach the goal target, dispatch the completion action
   * ONCE (fenced by `goalReached`). Returns true when this tick is fully handled — the caller must not farm:
   *   • safe_stop → stop("goal_complete").
   *   • notify_continue → one owner alert (kind "goal") + keep farming (returns false so the farm loop still runs).
   *   • town_stop → open a services town trip that PARKS in town + completes; a refused begin completes in place.
   *   • town_continue → mark reached, open a services town trip that resumes farming; a refused begin farms on now.
   */
  private maybeHandleGoal(): boolean {
    const goal = this.d.rules.goal;
    if (!goal || this.goalReached || this.workflowController) return false;
    if (!workflowConditionMet(goalProgress(this.counters, this.d.now() - this.d.startedAtMs), goal)) return false;

    switch (this.d.rules.completionAction ?? "safe_stop") {
      case "notify_continue": {
        this.goalReached = true;
        const alert: BotAlertMessage = {
          profileId: this.d.profileId,
          kind: "goal",
          message: "บอททำเป้าหมายสำเร็จแล้ว",
        };
        this.ownerSendMessage(MSG_BOT_ALERT, alert);
        return false; // farm on — goalReached fences a second alert/dispatch.
      }
      case "town_stop":
        // Run sell → deposit → restock, then park in the city-hub and settle goal_complete (no return leg). A
        // refused begin (cooldown / gate / no warp dep) completes in place instead of hanging.
        if (this.beginTownTrip("goal", "stop_in_town")) return true;
        this.stop("goal_complete");
        return true;
      case "town_continue":
        // Run the town service and resume farming afterward; a refused begin just keeps farming this tick. Either
        // way goalReached fences a re-trigger once the run continues.
        this.goalReached = true;
        return this.beginTownTrip("goal");
      case "safe_stop":
      default:
        this.stop("goal_complete");
        return true;
    }
  }

  /**
   * PR6b Pro goal-chain tick: the SAME periodic tier recheck (a mid-run Pro downgrade stops the chain), the SAME
   * town-trip delegation (a workflow town step and a bag-full divert both run through the trip), then the engine
   * drives the chain — reusing runRecoveryFarm for every farm step so the kill cadence equals the paid baseline.
   */
  private tickWorkflow(dtMs: number): void {
    const config = this.d.config;

    // (a) periodic tier recheck — a Pro→(Plus/Free) downgrade stops the chain (expired_readonly); see recheckTier.
    this.sinceTierCheckMs += dtMs;
    if (this.sinceTierCheckMs >= config.recovery.tierRecheckIntervalMs && !this.tierCheckInFlight) {
      this.recheckTier();
    }

    // (a2) proactive preflight: the bag was already full at start → town-trip before farming a single mob.
    if (this.initialTownTripPending) {
      this.initialTownTripPending = false;
      this.beginTownTrip("preflight");
    }

    // (b) an active town trip owns the whole tick (a workflow town step, or a bag-full divert).
    if (this.tripController) {
      if (this.hasPendingAttack()) return;
      this.tripController.tickTrip(dtMs);
      return;
    }

    // (c) drive the chain (farm steps call runRecoveryFarm; branch/town/travel are owned by the engine).
    this.workflowController?.tickWorkflow(dtMs);
  }

  /**
   * One deterministic recovery decision + the farm loop, shared by the paid single-pocket tick and every Pro
   * goal-chain farm step. For a workflow the pocket is PINNED to the active step (allowedPockets = [active];
   * assigned := active), so the recovery pocket-fallback never wanders — the chain owns pocket changes.
   */
  private runRecoveryFarm(dtMs: number): void {
    const host = this.currentHost;
    const config = this.d.config;
    const workflow = this.workflowController !== null;

    const snapshot: RecoverySnapshot = {
      nowMs: this.d.now(),
      tier: this.currentTier,
      hpFraction: host.botHpFraction(this.d.actorId),
      position: host.botPos(this.d.actorId),
      assignedPocketId: workflow ? this.activePocketId : this.d.pocketId,
      activePocketId: this.activePocketId,
      allowedPockets: this.allowedPockets(),
      pocketsWithAliveMobs: pocketsWithAliveMobs(host.botMobs()),
      pocketAnchors: this.pocketAnchors(),
      potionThresholdFraction: this.potionThresholdFraction(),
      lowHpStopFraction: config.lowHpStopFraction,
      idleDecisions: this.idleDecisions,
      deathRecoveryCount: this.deathRecoveryCount,
      phase: this.recoveryPhase,
    };
    const decision = planRecovery(snapshot, config.recovery);

    // apply the single decision (state transition before side effect, revision-fenced).
    switch (decision.kind) {
      case "baseline":
        this.runBaselineFarm(dtMs);
        return;
      case "hold":
        return;
      case "use_potion":
        // D-075 (F2): a use_potion decision with a known-empty potion bag → skip the doomed drink and act like
        // baseline (proactive town trip / farm) so the hp_no_potion pressure trigger warps to restock instead.
        if (this.potionsDepleted()) return this.runBaselineFarm(dtMs);
        this.dispatchUsePotion();
        return;
      case "plan_return":
        this.dispatchPlanReturn(decision.targetPocketId);
        return;
      case "follow_route":
        this.dispatchFollowRoute(dtMs);
        return;
      case "arrived":
        this.dispatchArrived();
        return;
      case "fallback_pocket":
        this.dispatchFallbackPocket(decision.targetPocketId);
        return;
      case "stop":
        this.stop(decision.reason);
        return;
    }
  }

  /**
   * The recovery `baseline` path (also reused by the D-075 F2 depleted-potion fall-through): M2a (D-073) proactive
   * town trip first — a bag/potion/hp pressure sample may WARP to town for services before a hard overflow or a
   * floor stop; a refused begin (cooldown/gate) simply farms on. Same decision module as Free — the tier difference
   * is warp vs walk, never capability.
   */
  private runBaselineFarm(dtMs: number): void {
    const trigger = this.proactiveTownTrigger(dtMs);
    if (trigger && this.beginTownTrip(trigger)) return;
    this.runFarmBody(dtMs, true);
  }

  /**
   * Host reports the real actor died. Free stops immediately (`death`, PR4 behavior). A paid tier enters death
   * recovery — but only while under the per-session cap; once the cap is hit it settles as `death` like Free. The
   * gate lives HERE (the planner never re-gates on the count, so the two owners cannot disagree).
   */
  onActorDied(): void {
    if (this.stopped) return;
    this.stats.deaths += 1; // M1 live stats: every death (Free stop, or a paid recovery attempt below).
    if (this.currentTier === "free") return void this.stop("death");
    // A death during a town trip can only happen in the outbound window (the city-hub is a safe zone once the actor
    // lands), so there is no recovery to attempt — settle `death` like Free. The controller observes `stopped` and
    // unwinds on its next entry without transferring the actor.
    if (this.tripController) return void this.stop("death");
    if (this.deathRecoveryCount >= this.d.config.recovery.maxDeathRecoveriesPerSession) {
      // PR6b: a Pro goal chain routes a death-capped pocket to its fallback rules (switch pocket / next step / stop)
      // instead of the blanket death stop. With no chain this stays the pre-PR6b safe stop.
      if (this.workflowController) return void this.workflowController.onFallbackTrigger("death_capped");
      return void this.stop("death");
    }
    // State before side effect: enter RECOVERING first; a lost fence (takeover raced) falls back to a safe stop.
    if (!this.advanceContinuity("RECOVERING", "death_await_respawn")) return void this.stop("death");
    this.recoveryPhase = { kind: "awaiting_respawn", diedAtMs: this.d.now() };
    this.deathRecoveryCount += 1;
  }

  /** fire-and-forget entitlement recheck: a paid→Free drop stops the run; a DB error keeps the last tier. */
  private recheckTier(): void {
    this.tierCheckInFlight = true;
    void this.d
      .resolveTier()
      .then((tier) => {
        // A single-pocket paid run needs any paid tier; a Pro goal chain needs Pro specifically (a Pro→Plus
        // downgrade pauses the chain too — it is a Pro-only capability). Below-threshold → stop expired_readonly.
        const belowThreshold = this.workflowController ? tier !== "pro" : tier === "free";
        if (belowThreshold) {
          if (this.currentTier !== "free" && !this.stopped) {
            // Mid-trip expiry: skip the remaining paid transactions but let the return warp finish (getting the
            // actor home is safety, not paid value); the controller settles expired_readonly after it lands.
            if (this.tripController) this.tripController.abortForTierExpiry();
            else this.stop("expired_readonly");
          }
        } else {
          this.currentTier = tier;
        }
      })
      .catch((e: unknown) => {
        // A flaky DB read must never kill an otherwise healthy paid run — keep the last known tier, warn once.
        if (!this.tierWarned) {
          this.tierWarned = true;
          console.warn(
            `[bot ${this.d.sessionRowId}] tier recheck failed, keeping ${this.currentTier}: ` +
              `${e instanceof Error ? e.message : String(e)}`,
          );
        }
      })
      .finally(() => {
        this.tierCheckInFlight = false;
        this.sinceTierCheckMs = 0;
      });
  }

  /** Auto-potion drink (opt-in): enter RECOVERING, drink through the shared consumable seam, settle on resolve. */
  private dispatchUsePotion(): void {
    // The planner already returns hold while a drink is pending; assert that guard so we never double-drink.
    if (this.recoveryPhase.kind === "potion_pending") return;
    if (this.continuity.state !== "RECOVERING" && !this.advanceContinuity("RECOVERING", "low_hp_potion")) {
      return; // fence lost (e.g. takeover raced) — treat as a no-op tick.
    }
    this.recoveryPhase = { kind: "potion_pending" };
    const lease = this.acquireLease("potion");
    void this.d.host
      .botUsePotion(this.d.actorId, this.d.config.recovery.potionItemId)
      .then((outcome) => {
        if (!this.stopped) this.applyPotionOutcome(outcome);
        this.releaseLease(lease); // release LAST — a committed heal always drains into the report on stop.
      })
      .catch((e: unknown) => {
        console.error(
          `[bot ${this.d.sessionRowId}] potion error: ${e instanceof Error ? e.message : String(e)}`,
        );
        // Fail closed to backoff so a rejected drink never wedges the run in potion_pending.
        if (!this.stopped) this.applyPotionOutcome({ status: "unavailable", hpFraction: 0, cooldownUntilMs: 0 });
        this.releaseLease(lease);
      });
  }

  /** Settle a resolved drink: healed/not_needed resumes work; anything else backs off (planner's floor still stops). */
  private applyPotionOutcome(outcome: BotPotionOutcome): void {
    if (outcome.status === "healed" || outcome.status === "not_needed") {
      // M2a (D-073): a successful drink consumed one potion — keep the pressure sample fresh between reads so a
      // potion_low / hp_no_potion trigger reflects the real stock (not_needed drank nothing → leave it).
      if (outcome.status === "healed") {
        this.stats.potionsUsed += 1; // M1 live stats: one potion actually drunk (not_needed drank nothing).
        if (this.bagStat) {
          this.bagStat = { ...this.bagStat, potionCount: Math.max(0, this.bagStat.potionCount - 1) };
        }
      }
      this.recoveryPhase = { kind: "none" };
      this.noPotionLogged = false; // D-075 (F7): a heal ends the current no_potion episode.
      this.advanceContinuity("WORKING", "potion_heal_applied");
    } else {
      // D-075 (F7): surface a drink that failed because the bag is empty — once per episode, not every backoff retry.
      if (outcome.status === "no_potion" && !this.noPotionLogged) {
        this.noPotionLogged = true;
        console.info(`[bot ${this.d.sessionRowId}] potion drink failed: no_potion (bag has none) — backing off`);
      }
      this.recoveryPhase = {
        kind: "potion_backoff",
        retryAtMs: this.d.now() + this.d.config.recovery.potionRetryIntervalMs,
      };
      this.advanceContinuity("WORKING", "potion_unavailable");
    }
  }

  /** Post-respawn: enter RETURNING_TO_WORK and plan an A* route back to the assigned pocket's anchor. */
  private dispatchPlanReturn(targetPocketId: string): void {
    if (!this.advanceContinuity("RETURNING_TO_WORK", "respawn_return_to_pocket")) return; // fence lost.
    const anchor = this.pocketAnchors().get(targetPocketId) ?? this.currentHost.botPocketAnchor(targetPocketId);
    if (!anchor) return void this.stop("stuck"); // no walkable anchor — cannot route back.
    const route = this.currentHost.botPlanPath(this.d.actorId, anchor);
    if (route === null) return void this.stop("stuck"); // unreachable — a factual obstacle for the owner.
    this.recoveryPhase = { kind: "returning", targetPocketId, waypoints: route, nextIndex: 0 };
  }

  /** Walk one node of the planned return route; a blocked step counts idle, may replan, and can settle as stuck. */
  private dispatchFollowRoute(dtMs: number): void {
    const phase = this.recoveryPhase;
    if (phase.kind !== "returning") return; // the planner only asks to follow while returning.
    const waypoint = phase.waypoints[phase.nextIndex];
    if (!waypoint) return; // consumed — the planner settles it as `arrived` next tick.

    this.decisionTimer += dtMs;
    const progressed = this.currentHost.botStepToward(this.d.actorId, waypoint, dtMs);
    if (progressed) {
      this.idleDecisions = 0;
      const pos = this.currentHost.botPos(this.d.actorId);
      if (pos && withinRange(pos, waypoint, RETURN_WAYPOINT_ARRIVE_TILES)) {
        phase.nextIndex += 1;
        this.decisionTimer = 0;
      }
      return;
    }
    // Blocked step: sample on the same throttled cadence as the farm loop, maybe replan, let the stuck limit settle.
    if (this.decisionTimer >= this.throttleMs) {
      this.decisionTimer = 0;
      this.idleDecisions += 1;
      this.maybeReplanRoute(phase);
      const stuck = stopForStuck(this.idleDecisions, this.d.config.stuckTickLimit);
      if (stuck) return void this.stop("stuck");
    }
  }

  /** Re-plan the return route from the current tile, at most once per routeReplanCooldownMs. */
  private maybeReplanRoute(phase: Extract<RecoveryPhase, { kind: "returning" }>): void {
    const now = this.d.now();
    if (now - this.lastRouteReplanMs < this.d.config.recovery.routeReplanCooldownMs) return;
    this.lastRouteReplanMs = now;
    const anchor = this.pocketAnchors().get(phase.targetPocketId) ?? this.currentHost.botPocketAnchor(phase.targetPocketId);
    if (!anchor) return; // keep counting; the stuck limit is the terminal guard.
    const route = this.currentHost.botPlanPath(this.d.actorId, anchor);
    if (route === null) return; // keep counting.
    phase.waypoints = route;
    phase.nextIndex = 0;
  }

  /** Reached the pocket: clear recovery and resume the farm loop. */
  private dispatchArrived(): void {
    this.recoveryPhase = { kind: "none" };
    this.idleDecisions = 0;
    this.advanceContinuity("WORKING", "pocket_reentered");
  }

  /** Hand the active pocket off to another allowed pocket that still has mobs (or back to the assigned one). */
  private dispatchFallbackPocket(targetPocketId: string): void {
    if (!this.advanceContinuity("TRAVELING", "pocket_fallback")) return; // fence lost.
    this.activePocketId = targetPocketId;
    this.idleDecisions = 0;
  }

  /** The bot's low-hp drink threshold as a fraction, or null when auto-potion is off (D-075: null/undefined never
   *  set, OR 0 = the player turned it off — both read as no potion path via botPotionThresholdEnabled). */
  private potionThresholdFraction(): number | null {
    const pct = this.d.rules.potionThresholdPct;
    if (!botPotionThresholdEnabled(pct) || pct == null) return null; // `pct == null` also narrows pct to number below.
    return Math.max(0, Math.min(100, pct)) / 100;
  }

  /** D-075 (F2): true once a bag sample exists AND it shows zero potions held — the runtime then skips a doomed
   *  use_potion drink (no bag potion to consume) and lets town-pressure / farming take over instead of spamming. */
  private potionsDepleted(): boolean {
    return this.bagStat !== null && this.bagStat.potionCount === 0;
  }

  // ── M2a (D-073) proactive town-pressure sampling ──────────────────────────────────────────────────────────

  /**
   * Refresh the bag sample on its cadence, then evaluate the proactive town-trip trigger (or null when no sample
   * exists yet — never trigger from empty data). Called from the farm path (currentHost is the farm host there).
   */
  private proactiveTownTrigger(dtMs: number): TownPressureTrigger | null {
    this.maybeRefreshBagStat(dtMs);
    if (!this.bagStat) return null;
    const cfg = this.d.config;
    const result = planTownPressure({
      freeSlots: this.bagStat.freeSlots,
      potionCount: this.bagStat.potionCount,
      hpFraction: this.currentHost.botHpFraction(this.d.actorId),
      potionThresholdPct: this.d.rules.potionThresholdPct ?? null,
      potionLowReserve: this.d.rules.potionLowReserve ?? cfg.townTrip.potionLowReserveDefault,
      pressureMinFreeSlots: cfg.townTrip.pressureMinFreeSlots,
      lowHpStopFraction: cfg.lowHpStopFraction,
      hadPotionsThisRun: this.hadPotionsThisRun, // D-075 follow-up: gate potion_low to "ran out mid-run".
    });
    return result.kind === "town_trip" ? result.trigger : null;
  }

  /**
   * Fire-and-forget bag sample on the pressure cadence — one read at a time (in-flight guard), NEVER every tick,
   * and NEVER awaited in the tick path. A read failure keeps the last sample (best-effort); the timer resets so a
   * flaky seam does not hammer the DB. Uses no lease: a pure read owns no economy state a stop must drain.
   */
  private maybeRefreshBagStat(dtMs: number): void {
    this.sinceBagCheckMs += dtMs;
    if (this.sinceBagCheckMs < this.d.config.townTrip.pressureCheckIntervalMs || this.bagStatInFlight) return;
    this.sinceBagCheckMs = 0;
    this.bagStatInFlight = true;
    const potionId = this.d.config.townTrip.potionItemId;
    void this.currentHost
      .botBagItems(this.d.actorId)
      .then((bag) => {
        if (this.stopped) return; // a stop raced the read — the sample is moot.
        // Slots: capacity − non-equipped instances (mirrors manager.freeBagSlots + the trip's route-home math).
        // Potions: non-equipped stacks of the town potion, summed (mirrors town-trip.ts tickRestocking).
        let occupied = 0;
        let potions = 0;
        for (const item of bag) {
          if (item.equipped) continue;
          occupied += 1;
          if (item.itemId === potionId) potions += item.quantity;
        }
        if (potions > 0) this.hadPotionsThisRun = true; // D-075 follow-up: the run has carried a potion at least once.
        this.bagStat = {
          freeSlots: DEFAULT_INVENTORY_CAPACITY - occupied,
          potionCount: potions,
          readAtMs: this.d.now(),
        };
      })
      .catch((e: unknown) => {
        console.error(
          `[bot ${this.d.sessionRowId}] bag sample error: ${e instanceof Error ? e.message : String(e)}`,
        );
      })
      .finally(() => {
        this.bagStatInFlight = false;
      });
  }

  /** Force the next farm tick to re-sample the bag (a trip changed it a lot). */
  private markBagStatStale(): void {
    this.bagStat = null;
    this.sinceBagCheckMs = this.d.config.townTrip.pressureCheckIntervalMs;
  }

  /** Allowed pockets for this map (config ∩ existing), lazily cached; falls back to the assigned pocket if empty. */
  private allowedPockets(): readonly string[] {
    // PR6b: a goal chain pins the recovery loop to the step's active pocket (the chain owns pocket changes via its
    // own fallbacks), so the recovery pocket-fallback never wanders. Not cached — the active pocket changes per step.
    if (this.workflowController) return [this.activePocketId];
    if (this.allowedPocketsCache) return this.allowedPocketsCache;
    const configured = this.d.config.botAllowedPockets[this.d.mapId] ?? [];
    const existing = configured.filter((p) => this.currentHost.pocketExists(p));
    this.allowedPocketsCache = existing.length > 0 ? existing : [this.d.pocketId];
    return this.allowedPocketsCache;
  }

  /**
   * PR6b: a farm terminal (a blocked/dry pocket) routes to the goal chain's fallback rules instead of stopping;
   * with no workflow it is byte-identical to the pre-PR6b `stop("stuck")`. `trigger` distinguishes an unreachable
   * target (`stuck`) from an empty pocket (`pocket_empty`) for the chain's `when` matching.
   */
  private onFarmBlocked(trigger: "stuck" | "pocket_empty"): void {
    if (this.workflowController) this.workflowController.onFallbackTrigger(trigger);
    else this.stop("stuck");
  }

  /** Anchor tile per allowed pocket, built once on first paid need (anchors are static per map). */
  private pocketAnchors(): ReadonlyMap<string, Vec2> {
    if (this.pocketAnchorsCache) return this.pocketAnchorsCache;
    const anchors = new Map<string, Vec2>();
    for (const p of this.allowedPockets()) {
      const anchor = this.currentHost.botPocketAnchor(p);
      if (anchor) anchors.set(p, anchor);
    }
    this.pocketAnchorsCache = anchors;
    return this.pocketAnchorsCache;
  }

  /** True while an attack+grant lease is still in flight — preserves the at-most-one-attack reentrancy guard. */
  private hasPendingAttack(): boolean {
    for (const kind of this.pendingLeases.values()) if (kind === "attack") return true;
    return false;
  }

  private acquireLease(kind: "attack" | "potion" | "town"): symbol {
    const token = Symbol(kind);
    this.pendingLeases.set(token, kind);
    return token;
  }

  private releaseLease(token: symbol): void {
    this.pendingLeases.delete(token);
    if (this.pendingStop && this.pendingLeases.size === 0) this.finalizeStop();
  }

  /** fire an attack (async grant) without blocking the sim tick; apply the outcome when it resolves. */
  private runAttack(target: Vec2): void {
    const lease = this.acquireLease("attack");
    void this.d.host
      .botAttack(this.d.actorId, target)
      .then((o) => {
        if (this.stopped) {
          // The authoritative economy call already committed against the real character. Include that result in
          // the report, then release authority; never dematerialize while an in-flight grant still owns state.
          this.recordAttack(o);
        } else {
          this.applyAttack(o);
        }
        // Drop the lease AFTER the outcome is recorded/applied; releaseLease drains a pending stop into the report.
        this.releaseLease(lease);
      })
      .catch((e: unknown) => {
        console.error(`[bot ${this.d.sessionRowId}] attack error: ${e instanceof Error ? e.message : String(e)}`);
        this.releaseLease(lease);
      });
  }

  private recordAttack(o: BotAttackOutcome): void {
    this.counters.killCount += o.killed;
    this.counters.goldEarned += Math.max(0, Math.round(o.gold));
    this.counters.expEarned += Math.max(0, Math.round(o.exp));
    for (const line of o.loot) {
      this.counters.drops[line.itemId] = (this.counters.drops[line.itemId] ?? 0) + line.quantity;
    }
  }

  /** Fold rewards into counters, notify for ordinary rare loot, then apply the Free obstacle baseline. */
  private applyAttack(o: BotAttackOutcome): void {
    this.recordAttack(o);
    // (EXP/gold/items already persisted inside host.botAttack via the identical economy path; level-up saved there.)

    // Ordinary rare loot is a plan event, never a universal stop (D-067). The current v1 plan keeps it,
    // surfaces an in-game alert, and continues; lock/deposit/explicit-stop actions belong to PR5+ plan rules.
    const rare = findRareDrop(o.loot.map((l) => l.itemId), this.d.rarityOf, this.d.config.rareNotifyMinRarity);
    if (rare) {
      const alert: BotAlertMessage = {
        profileId: this.d.profileId,
        kind: "rare",
        itemId: rare.itemId,
        message: "เก็บของแรร์แล้ว",
      };
      this.ownerSendMessage(MSG_BOT_ALERT, alert);
    }
    // PR6b: a Pro goal chain annotates a kill that yielded loot under a loot rule with a LOOTING beat (COMBAT→
    // LOOTING→WORKING). It issues no world command and never resets the attack cadence — only continuity revisions
    // change — so the ceiling (§6.2) is untouched. Gated to Pro+workflow, so Free/Plus stay byte-identical.
    this.maybeLootBeat(o);
    // Bag overflow is the town-trip trigger (D-069/D-070/D-071). Every tier now diverts: paid tiers WARP to town,
    // Free WALKS (D-071) — the mode is a config knob, not a capability gate. beginTownTrip refuses on cooldown /
    // active trip / stopped / no warp dep / tier-not-enabled, and the fallback stop keeps every refusal honest
    // (farming on with a full bag leaks loot — never acceptable). This runs in the attack continuation with the
    // attack lease still held; beginTownTrip only advances continuity + constructs the controller here — the trip's
    // first warp/walk step runs on a later tick, after releaseLease has drained this committed grant into the report.
    // M2a (D-073): an overflow means the bag is full — keep the pressure sample honest between reads.
    if (o.bagOverflowed && this.bagStat) this.bagStat = { ...this.bagStat, freeSlots: 0 };
    const bag = stopForInventoryOverflow(o.bagOverflowed ? 1 : 0);
    if (bag && !this.beginTownTrip("bag_full")) this.stop(bag);
  }

  /**
   * PR6b: annotate a loot-yielding kill with a LOOTING beat for a Pro goal chain (opens COMBAT→LOOTING→WORKING).
   * Purely a continuity marker — no world command, no cadence change. Only runs from COMBAT so the advance never
   * hits an invalid edge; a lost fence (takeover raced) simply skips the beat.
   */
  private maybeLootBeat(o: BotAttackOutcome): void {
    if (!this.workflowController) return; // Pro goal chain only — every other run stays byte-identical.
    if (this.continuity.state !== "COMBAT") return;
    if (o.loot.length === 0 || !this.d.rules.lootAll) return; // needs loot AND a loot rule.
    if (!this.advanceContinuity("LOOTING", "loot_pickup")) return;
    this.advanceContinuity("WORKING", "loot_done");
  }

  /** stop the bot for a reason (mandatory / manual / death / restart). Idempotent. */
  stop(reason: BotStopReason): void {
    if (this.stopped) return;
    // D-075 (F7): one diagnostic line per stop (prefix pattern shared with the other bot logs).
    console.info(`[bot ${this.d.sessionRowId}] stop: ${reason}`);
    // D-075 (F5): out_of_supplies parked the actor in the city-hub (ยา/เงินหมด) — alert the owner it is waiting for
    // them to top up. The stop itself settles wait_for_owner (policy default branch) → the chip shows "รอคุณจัดการ".
    if (reason === "out_of_supplies") {
      const alert: BotAlertMessage = {
        profileId: this.d.profileId,
        kind: "supplies",
        message: "ยา/เงินหมด บอทพักรอคุณที่เมืองหลัก เติมเงิน/ยาแล้วเริ่มบอทใหม่ได้เลย",
      };
      this.ownerSendMessage(MSG_BOT_ALERT, alert);
    }
    // PR6a (D-067): a graceful server_restart shutdown persists the freshest running snapshot BEFORE the run
    // settles, so a Pro resume lands on the last live state (not the last ~30s flush). Pro-only; runs while still
    // !stopped so the manager reads the live snapshot. No-op without the dep wired (in-process behavior unchanged).
    if (reason === "server_restart" && this.currentTier === "pro") this.d.persistRunningCheckpoint?.();
    const settlement = settlementForStoppedPlan(reason);
    const settled = applyBotContinuityTransition(this.continuity, {
      kind: settlement,
      expectedRevision: this.continuity.revision,
      at: this.d.now(),
      reasonCode: `stop_${reason}`,
    });
    if (settled.ok) {
      this.continuity = settled.snapshot;
    } else {
      console.error(
        `[bot ${this.d.sessionRowId}] stop settlement rejected: ${settled.error} ` +
          `${this.continuity.state}:${reason}`,
      );
    }
    this.stopped = true;
    this.pendingStop = { reason, requestedAt: this.d.now() };
    if (this.pendingLeases.size === 0) this.finalizeStop();
  }

  /**
   * Fence every future automation command and release the actor synchronously so the caller may apply the
   * same manual input in this event turn. The already-accepted async reward is allowed to drain into the
   * report; it can never issue another movement/attack after `stopped` is set.
   */
  takeover(checkpointId: string, requestedAt: number): BotContinuitySnapshotWire | null {
    if (this.stopped) return null;
    // Mid-trip takeover = finish-and-return-then-pause (D-069): DON'T pause/stop now (that would freeze the
    // controller's own drive home). Fence new transactions, drain the in-flight one, run the return warp, land at
    // the farm, THEN pause + checkpoint (or pause-in-place at city-hub on return failure). Report the current
    // (trip-state) snapshot so the manager can store the pending checkpoint; the settle updates it after landing.
    if (this.tripController) {
      this.tripController.abortForTakeover(checkpointId, requestedAt);
      return toBotContinuityWire(this.continuity);
    }
    return this.applyTakeoverPause(checkpointId, requestedAt);
  }

  /**
   * The synchronous pause + checkpoint settle shared by an immediate takeover (no trip) and the trip controller's
   * post-landing settle. Fences every future automation command, releases the actor, and drains the accepted async
   * reward into the report before authority release. Returns the paused snapshot, or null when the pause is fenced
   * out (a stop/settlement already won the race).
   */
  private applyTakeoverPause(checkpointId: string, requestedAt: number): BotContinuitySnapshotWire | null {
    const paused = applyBotContinuityTransition(this.continuity, {
      kind: "pause",
      expectedRevision: this.continuity.revision,
      at: requestedAt,
      reasonCode: "manual_takeover",
    });
    if (!paused.ok) return null;
    this.continuity = paused.snapshot;
    this.stopped = true;
    this.pendingStop = { reason: "manual", requestedAt };
    this.takeoverCheckpointId = checkpointId;
    this.tripController = null;
    this.releaseAuthorityOnce();
    if (this.pendingLeases.size === 0) this.finalizeStop();
    return toBotContinuityWire(this.continuity);
  }

  // ── PR5 Phase C town-trip wiring (D-069/D-070) ────────────────────────────────────────────────────────────

  /**
   * Begin a town trip: bring the real actor to the city-hub, run sell → deposit → restock, return and resume
   * farming. Paid tiers WARP (D-069); Free WALKS (D-071) — the mode is `townTrip.mode[tier]` (defaults to warp).
   * Guards: the tier is in `townTrip.enabledTiers`, past the trip cooldown and any short retry backoff, no trip
   * already active, not stopped, and the warp acquisition dep is wired. Advances the continuity to
   * RETURNING_TO_TOWN before constructing the controller. Returns true when the trip started.
   *
   * M1 `endAction` (default "return"): "stop_in_town" makes a Plus single-goal `town_stop` park in the city-hub
   * and settle `goal_complete` after services instead of returning home.
   */
  beginTownTrip(trigger: TownTripTrigger, endAction: TripEndAction = "return"): boolean {
    if (this.stopped || this.tripController) return false; // an active trip / stopped run is not a diagnosable refusal.
    if (!canIssueAutomationCommand(this.continuity)) return this.refuseTownTrip("continuity_locked");
    if (!this.d.config.townTrip.enabledTiers.includes(this.currentTier)) return this.refuseTownTrip("tier_not_enabled");
    if (!this.d.acquireHostForMap) return this.refuseTownTrip("no_acquire_dep");
    const now = this.d.now();
    if (now < this.townTripRetryUntil) return this.refuseTownTrip("retry_backoff", `${this.townTripRetryUntil - now}ms remaining`);
    // D-075 (F4): cooldownMs 0 (default) disables the gate entirely (ยาหมด → กลับไปซื้อทันที); a >0 knob still gates.
    const cooldownMs = this.d.config.townTrip.cooldownMs;
    if (cooldownMs > 0 && now - this.lastTownTripAt < cooldownMs) {
      return this.refuseTownTrip("cooldown", `${cooldownMs - (now - this.lastTownTripAt)}ms remaining`);
    }
    if (!this.advanceContinuity("RETURNING_TO_TOWN", TOWN_TRIP_REASON[trigger])) return this.refuseTownTrip("fence_lost");
    this.lastTownTripRefusal = null; // a successful begin ends the refusal episode.
    const mode = this.d.config.townTrip.mode?.[this.currentTier] ?? "warp";
    this.tripWalk = null; // fresh walk cursor per trip (D-071).
    // D-075 (F5): the trip parks `out_of_supplies` only when the plan relies on auto-potion (a positive threshold) —
    // resolve it once here so the controller need not re-read the rules.
    const parkWhenOutOfSupplies = botPotionThresholdEnabled(this.d.rules.potionThresholdPct);
    // D-071 M2b: the trigger tells the controller how to settle an unroutable FIRST hop — a proactive trigger stops
    // (wait_for_owner), a bag_full overflow keeps the retryable abort (the runtime's inventory_full fallback guards it).
    this.tripController = new TownTripController(
      this.makeTripFacade(),
      this.tripSeq,
      mode,
      trigger,
      endAction,
      parkWhenOutOfSupplies,
    );
    return true;
  }

  /**
   * D-075 (F7): log WHY a town trip was refused — one line per contiguous refusal episode (deduped on the gate name,
   * so a trigger firing every tick during a backoff/cooldown window does not spam). `detail` (e.g. remaining ms) is
   * logged but never keyed on, so the dedup holds even as the countdown changes. Always returns false (a refusal).
   */
  private refuseTownTrip(gate: string, detail = ""): false {
    if (this.lastTownTripRefusal !== gate) {
      this.lastTownTripRefusal = gate;
      console.info(`[bot ${this.d.sessionRowId}] town trip refused: ${gate}${detail ? ` (${detail})` : ""}`);
    }
    return false;
  }

  /** Swap the driven host (town-trip warp export→attach→rebind). tickRoom routing follows `rt.host` automatically. */
  rebindHost(next: BotHost): void {
    this.currentHost = next;
    // One rebind fires per successful transfer (town walk hop out/back, warp out/back, workflow cross-map) — the
    // ONE choke point every transfer routes through — so the owner-follow push here covers every mode without
    // scattering. An owner watching from the source room follows the actor to its new room (no client is notified
    // otherwise: self `players.onRemove` is a no-op). No owner connected → silent (headless / offline safe).
    this.notifyOwnerFollow(next);
  }

  /**
   * D-069/D-071/PR6b: tell the owner's watching client to follow the actor into its new room after a transfer.
   * Fanned across every host (the owner's transport may still sit in the source room). The landing is the actor's
   * live tile post-attach — a placeholder; onSelfSpawn adoption corrects the authoritative position on re-entry.
   */
  private notifyOwnerFollow(host: BotHost): void {
    const pos = host.botPos(this.d.actorId) ?? host.botSafeCampAnchor();
    const msg: BotActorMapMessage = { mapId: host.mapId, tx: pos.tx, ty: pos.ty };
    this.ownerSendMessage(MSG_BOT_ACTOR_MAP, msg);
  }

  /**
   * Plan an A* route from the actor's CURRENT tile (the farm safe-camp, post-return-warp) to `targetPocketId`'s
   * anchor and enter the recovery "returning" phase — WITHOUT re-advancing continuity (it is already
   * RETURNING_TO_WORK). The runtime's own recovery machinery then walks it home (follow_route → arrived → WORKING).
   * Returns false when no walkable anchor exists or the route is unreachable (the caller stops `stuck`).
   */
  private beginReturnRouteFromCurrent(targetPocketId: string): boolean {
    const anchor = this.pocketAnchors().get(targetPocketId) ?? this.currentHost.botPocketAnchor(targetPocketId);
    if (!anchor) return false;
    const route = this.currentHost.botPlanPath(this.d.actorId, anchor);
    if (route === null) return false;
    this.recoveryPhase = { kind: "returning", targetPocketId, waypoints: route, nextIndex: 0 };
    this.idleDecisions = 0;
    return true;
  }

  /**
   * D-071 M2b (multi-hop walk): the next portal hop toward `finalMapId` from the CURRENT host's map — BFS over the
   * real map graph picks the next map, then the host's OWN exit lookup (the same data a real player's MSG_MOVE reads)
   * yields the approach tile + landing spawn. Returns null when no portal chain connects here to `finalMapId`, or the
   * current map is `finalMapId` already (zero hops). Recomputed per leg so a mid-chain re-attach just re-plans.
   */
  private planNextHop(finalMapId: string): { approach: Vec2; landing: Vec2; nextMapId: string } | null {
    const nextMapId = nextHopToward(this.currentHost.mapId, finalMapId, MAP_ADJACENCY);
    if (nextMapId === null) return null;
    const exit = this.currentHost.botExitToward?.(nextMapId);
    if (!exit) return null;
    return { approach: exit.approach, landing: exit.landing, nextMapId };
  }

  /**
   * D-071 (walk town trip): step the driven actor toward an arbitrary tile `goal` on the current host, one node per
   * tick, planning A* lazily and replanning a blocked route on the recovery cooldown. Independent of the recovery
   * planner so it drives Free too. Returns "arrived" at/near the goal, "stuck" once the idle-decision limit is hit
   * (the controller settles the Free obstacle baseline), else "walking". Mirrors the recovery follow-route cadence:
   * normal-speed movement every tick, throttled idle sampling on a blocked step.
   */
  private walkTripToward(goal: Vec2, dtMs: number): "walking" | "arrived" | "stuck" {
    const host = this.currentHost;
    const pos = host.botPos(this.d.actorId);
    if (!pos) return "stuck"; // the member vanished mid-walk — an obstacle the controller settles.
    if (withinRange(pos, goal, this.d.config.recovery.pocketArriveRadiusTiles)) {
      this.tripWalk = null;
      this.idleDecisions = 0;
      this.decisionTimer = 0;
      return "arrived";
    }
    // (re)plan when there is no active route or the goal changed.
    if (!this.tripWalk || this.tripWalk.goal.tx !== goal.tx || this.tripWalk.goal.ty !== goal.ty) {
      const route = host.botPlanPath(this.d.actorId, goal);
      if (route === null) return this.countWalkStuck(dtMs); // unreachable this tick — count idle, maybe settle stuck.
      if (route.length === 0) {
        this.tripWalk = null;
        this.idleDecisions = 0;
        return "arrived";
      }
      this.tripWalk = { goal: { tx: goal.tx, ty: goal.ty }, waypoints: route, nextIndex: 0 };
    }
    const walk = this.tripWalk;
    const waypoint = walk.waypoints[walk.nextIndex];
    if (!waypoint) {
      this.tripWalk = null;
      this.idleDecisions = 0;
      return "arrived";
    }
    const progressed = host.botStepToward(this.d.actorId, waypoint, dtMs);
    if (progressed) {
      this.idleDecisions = 0;
      const now = host.botPos(this.d.actorId);
      if (now && withinRange(now, waypoint, RETURN_WAYPOINT_ARRIVE_TILES)) {
        walk.nextIndex += 1;
        this.decisionTimer = 0;
      }
      return "walking";
    }
    return this.countWalkStuck(dtMs); // blocked step.
  }

  /** Throttled idle sampling for a blocked walk step: replan once per cooldown, settle "stuck" at the limit. */
  private countWalkStuck(dtMs: number): "walking" | "stuck" {
    this.decisionTimer += dtMs;
    if (this.decisionTimer < this.throttleMs) return "walking";
    this.decisionTimer = 0;
    this.idleDecisions += 1;
    const now = this.d.now();
    if (this.tripWalk && now - this.lastRouteReplanMs >= this.d.config.recovery.routeReplanCooldownMs) {
      this.lastRouteReplanMs = now;
      const route = this.currentHost.botPlanPath(this.d.actorId, this.tripWalk.goal);
      if (route && route.length > 0) this.tripWalk = { goal: this.tripWalk.goal, waypoints: route, nextIndex: 0 };
    }
    return stopForStuck(this.idleDecisions, this.d.config.stuckTickLimit) ? "stuck" : "walking";
  }

  /** Record a completed trip: arm the cooldown from now and bump the idempotency-key trip sequence. */
  private markTripComplete(): void {
    this.lastTownTripAt = this.d.now();
    this.tripSeq += 1;
    this.stats.townTrips += 1; // M1 live stats: a full trip cycle reached its return leg (arm-cooldown point).
  }

  /** M1 live stats: add this tick's elapsed time to the bucket for the current continuity state. */
  private accrueStatsTime(dtMs: number): void {
    switch (statsTimeBucket(this.continuity.state)) {
      case "walking":
        this.stats.msWalking += dtMs;
        break;
      case "inTown":
        this.stats.msInTown += dtMs;
        break;
      default:
        this.stats.msFarming += dtMs;
    }
  }

  /** Build the narrow facade the controller drives the runtime through (keeps runtime internals private). */
  private makeTripFacade(): TownTripFacade {
    return {
      config: this.d.config,
      actorId: this.d.actorId,
      sessionRowId: this.d.sessionRowId,
      farmMapId: this.d.mapId,
      now: () => this.d.now(),
      isStopped: () => this.stopped,
      currentHost: () => this.currentHost,
      activePocketId: () => this.activePocketId,
      acquireHostForMap: (mapId) =>
        this.d.acquireHostForMap ? this.d.acquireHostForMap(mapId) : Promise.resolve(null),
      rebindHost: (next) => this.rebindHost(next),
      advance: (to, reasonCode) => this.advanceContinuity(to, reasonCode),
      acquireTownLease: () => this.acquireLease("town"),
      releaseTownLease: (token) => this.releaseLease(token),
      stop: (reason) => this.stop(reason),
      goldBalance: () => this.currentHost.botGoldBalance(this.d.actorId),
      bagItems: () => this.currentHost.botBagItems(this.d.actorId),
      ownerStatusPush: () => this.pushStatus(),
      beginReturnRouteFromCurrent: (pocketId) => this.beginReturnRouteFromCurrent(pocketId),
      currentMapId: () => this.currentHost.mapId,
      nextHopToward: (finalMapId) => this.planNextHop(finalMapId),
      walkToward: (goal, dtMs) => this.walkTripToward(goal, dtMs),
      markTripComplete: () => this.markTripComplete(),
      reportTownSkip: (reason) => {
        // `restock_done` clears the flag (a fresh successful top-up); any skip reason surfaces in the next status.
        this.lastTownSkip = reason === "restock_done" ? null : reason;
      },
      settleTakeover: (checkpointId, requestedAt) => void this.applyTakeoverPause(checkpointId, requestedAt),
      armRetryBackoff: () => {
        // D-075: a dedicated backoff knob (was cooldownMs/10) so the anti-spin guard survives cooldownMs = 0.
        this.townTripRetryUntil = this.d.now() + this.d.config.townTrip.retryBackoffMs;
      },
      onTripEnded: () => {
        this.tripController = null;
        this.tripWalk = null;
        this.markBagStatStale(); // the trip sold/deposited/restocked → re-sample before the next pressure check.
      },
    };
  }

  /** Build the narrow facade the goal-chain engine drives the runtime through (PR6b). */
  private makeWorkflowFacade(): WorkflowFacade {
    return {
      config: this.d.config,
      actorId: this.d.actorId,
      sessionRowId: this.d.sessionRowId,
      now: () => this.d.now(),
      runStartedAtMs: () => this.d.startedAtMs,
      isStopped: () => this.stopped,
      counters: () => ({
        killCount: this.counters.killCount,
        goldEarned: this.counters.goldEarned,
        expEarned: this.counters.expEarned,
      }),
      currentHost: () => this.currentHost,
      currentHostMapId: () => this.currentHost.mapId,
      setActivePocket: (pocketId) => {
        this.activePocketId = pocketId;
      },
      activePocketId: () => this.activePocketId,
      resetIdle: () => {
        this.idleDecisions = 0;
      },
      runFarmTick: (dtMs) => this.runRecoveryFarm(dtMs),
      advance: (to, reasonCode) => this.advanceContinuity(to, reasonCode),
      acquireHostForMap: (mapId) =>
        this.d.acquireHostForMap ? this.d.acquireHostForMap(mapId) : Promise.resolve(null),
      rebindHost: (next) => this.rebindHost(next),
      persistNow: () => this.currentHost.botPersistNow(this.d.actorId),
      beginReturnRouteFromCurrent: (pocketId) => this.beginReturnRouteFromCurrent(pocketId),
      acquireLease: () => this.acquireLease("town"),
      releaseLease: (token) => this.releaseLease(token),
      beginTownTrip: () => this.beginTownTrip("workflow"),
      hasActiveTrip: () => this.tripController !== null,
      stop: (reason) => this.stop(reason),
      ownerStatusPush: () => this.pushStatus(),
    };
  }

  private releaseAuthorityOnce(): void {
    if (this.authorityReleased) return;
    this.authorityReleased = true;
    this.currentHost.botReleaseAuthority(this.d.actorId);
  }

  private finalizeStop(): void {
    if (this.stopFinalized || !this.pendingStop || this.pendingLeases.size > 0) return;
    this.stopFinalized = true;
    const { reason, requestedAt } = this.pendingStop;
    const persisted = this.flush({ stoppedAt: requestedAt, stopReason: reason });
    this.releaseAuthorityOnce();
    const stopped: BotStoppedMessage = {
      profileId: this.d.profileId,
      sessionId: this.d.sessionRowId,
      reason,
      continuity: toBotContinuityWire(this.continuity),
      killCount: this.counters.killCount,
      goldEarned: this.counters.goldEarned,
      expEarned: this.counters.expEarned,
    };
    this.ownerSendMessage(MSG_BOT_STOPPED, stopped);
    this.d.onStopped(this.d.accountId, this.d.sessionRowId);
    const checkpointId = this.takeoverCheckpointId;
    if (checkpointId) {
      void persisted.then((saved) => this.d.onTakeoverSettled(this.d.accountId, checkpointId, saved));
    }
  }

  /**
   * Deliver an owner-directed message. Prefer the manager's cross-host fan-out (the owner's transport may sit in a
   * sibling room after a warp); fall back to the current host's own `botOwnerSend`. With no manager dep wired (the
   * Free/recovery suites) this is byte-identical to the pre-trip behavior: a single call on the current host.
   */
  private ownerSendMessage(type: string, message: unknown): boolean {
    if (this.d.ownerSend?.(this.d.accountId, type, message)) return true;
    return this.currentHost.botOwnerSend(this.d.accountId, type, message);
  }

  private pushStatus(): void {
    const pos = this.currentHost.botPos(this.d.actorId);
    const msg: BotStatusMessage = {
      profileId: this.d.profileId,
      sessionId: this.d.sessionRowId,
      // The map the actor currently stands on (rebinds across every hop / warp), not the fixed farm map — so the
      // hub/chip label tracks the actor through a town trip. No client consumer reads this field for routing.
      mapId: this.currentHost.mapId,
      pocketId: this.activePocketId,
      continuity: toBotContinuityWire(this.continuity),
      action: pos ? legacyBotActionForContinuity(this.continuity.state) : "searching",
      killCount: this.counters.killCount,
      goldEarned: this.counters.goldEarned,
      expEarned: this.counters.expEarned,
      hpFraction: this.currentHost.botHpFraction(this.d.actorId),
      uptimeMs: this.d.now() - this.d.startedAtMs,
      workflow: this.workflowStatusView(),
      // M1 live stats (every tier — data, not power) + Plus single-goal live progress (absent for a workflow /
      // goal-less run). `done` is the raw whole-run metric value (it may pass `target` between the goal being met
      // and the completion action taking effect / a notify_continue run farming on).
      stats: { ...this.stats },
      goal: this.goalStatusView(),
      lastTownSkip: this.lastTownSkip ?? undefined,
    };
    this.ownerSendMessage(MSG_BOT_STATUS, msg);
  }

  /** M1: the live single-goal progress projection for bot:status (undefined for a workflow / goal-less run). */
  private goalStatusView(): BotStatusMessage["goal"] {
    const goal = this.d.rules.goal;
    if (!goal || this.workflowController) return undefined;
    return {
      type: goal.type,
      target: goal.target,
      done: workflowMetricValue(goalProgress(this.counters, this.d.now() - this.d.startedAtMs), goal.type),
    };
  }

  /** PR6b: the goal-chain cursor for bot:status (undefined for a single-pocket run — the field is omitted). */
  private workflowStatusView(): BotWorkflowStatusCursor | undefined {
    return this.workflowController?.statusView();
  }

  private advanceContinuity(to: BotContinuityOperationalStateWire, reasonCode: string): boolean {
    const result = applyBotContinuityTransition(this.continuity, {
      kind: "advance",
      to,
      expectedRevision: this.continuity.revision,
      at: this.d.now(),
      reasonCode,
    });
    if (!result.ok) {
      console.error(
        `[bot ${this.d.sessionRowId}] continuity transition rejected: ${result.error} ` +
          `${this.continuity.state}->${to}`,
      );
      return false;
    }
    this.continuity = result.snapshot;
    return true;
  }

  /** best-effort DB flush of the live counters (+ optional stop). */
  private flush(stop: { stoppedAt: number; stopReason: BotStopReason } | null): Promise<boolean> {
    const counters = { ...this.counters, drops: { ...this.counters.drops } };
    const persisted = this.persistenceTail
      .then(() => this.d.sessionRepo.patch(this.d.sessionRowId, counters, stop))
      .then(() => true)
      .catch((e: unknown) => {
        console.error(`[bot ${this.d.sessionRowId}] flush error: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      });
    this.persistenceTail = persisted.then(() => undefined);
    return persisted;
  }
}
