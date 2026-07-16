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
  MSG_BOT_ALERT,
  MSG_BOT_STATUS,
  MSG_BOT_STOPPED,
  type BotAlertMessage,
  type BotStatusMessage,
  type BotStoppedMessage,
} from "../../src/shared/net-protocol";
import type {
  BotContinuityOperationalStateWire,
  BotContinuitySnapshotWire,
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
import { TownTripController, type TownTripFacade, type TownTripTrigger } from "./town-trip";
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
   * PR5 Phase C (D-069/D-070): the manager's proactive bag preflight found the bag already at/over the town
   * pressure threshold at start (free slots < townTrip.resumeMinFreeSlots). On the FIRST paid tick the runtime
   * opens a town trip BEFORE farming a single mob (never farm with a full bag → loot leaks). A refusal (cooldown
   * / no warp dep / tier not enabled) clears the flag and farms normally; the bag-full divert then catches the
   * next real overflow. Absent/false = the ordinary farm start. Free never sets this (no bag read at all).
   */
  initialTownTrip?: boolean;
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
  /** Last completed town trip (epoch ms) — the cooldown gate; NEGATIVE_INFINITY = never (first trip allowed). */
  private lastTownTripAt = Number.NEGATIVE_INFINITY;
  /** Short backoff after a trip that never moved the actor (target/seat unavailable) so it does not spin per tick. */
  private townTripRetryUntil = 0;
  /** Per-runtime trip sequence — fixes the idempotency-key namespace so a retried transaction reuses its key. */
  private tripSeq = 0;
  /** One-shot proactive preflight: the first paid tick opens a town trip before farming (D-069/D-070). */
  private initialTownTripPending = false;

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

  /** advance one host sim tick; may stop the bot. */
  tick(dtMs: number): void {
    if (this.stopped || !canIssueAutomationCommand(this.continuity)) return;

    // Free tier is byte-identical to PR4: the farm loop verbatim, no recovery planner, no tier recheck, no new
    // host calls. `activePocketId` never leaves the assigned pocket for Free, and the inline low-hp stop stays.
    if (this.currentTier === "free") {
      this.runFarmBody(dtMs, false);
      return;
    }

    this.tickPaid(dtMs);
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

    const target = pickTarget(pos, mobs, pocketId);
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
          if (stuck) return void this.stop(stuck);
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
        if (stuck) return void this.stop(stuck);
      }
    }

    this.sinceFlushMs += dtMs;
    if (this.sinceFlushMs >= config.sessionFlushIntervalMs) {
      this.sinceFlushMs = 0;
      void this.flush(null);
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
      this.tripController.tickTrip();
      return;
    }

    // (c) one deterministic recovery decision for this tick.
    const snapshot: RecoverySnapshot = {
      nowMs: this.d.now(),
      tier: this.currentTier,
      hpFraction: host.botHpFraction(this.d.actorId),
      position: host.botPos(this.d.actorId),
      assignedPocketId: this.d.pocketId,
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

    // (d) apply the single decision (state transition before side effect, revision-fenced).
    switch (decision.kind) {
      case "baseline":
        this.runFarmBody(dtMs, true);
        return;
      case "hold":
        return;
      case "use_potion":
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
   * Host reports the real actor died. Free stops immediately (`death`, PR4 behavior). A paid tier enters death
   * recovery — but only while under the per-session cap; once the cap is hit it settles as `death` like Free. The
   * gate lives HERE (the planner never re-gates on the count, so the two owners cannot disagree).
   */
  onActorDied(): void {
    if (this.stopped) return;
    if (this.currentTier === "free") return void this.stop("death");
    // A death during a town trip can only happen in the outbound window (the city-hub is a safe zone once the actor
    // lands), so there is no recovery to attempt — settle `death` like Free. The controller observes `stopped` and
    // unwinds on its next entry without transferring the actor.
    if (this.tripController) return void this.stop("death");
    if (this.deathRecoveryCount >= this.d.config.recovery.maxDeathRecoveriesPerSession) {
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
        if (tier === "free") {
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
      this.recoveryPhase = { kind: "none" };
      this.advanceContinuity("WORKING", "potion_heal_applied");
    } else {
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

  /** The bot's low-hp drink threshold as a fraction, or null when the profile has no potion rule (opt-in). */
  private potionThresholdFraction(): number | null {
    const pct = this.d.rules.potionThresholdPct;
    if (pct == null) return null;
    return Math.max(0, Math.min(100, pct)) / 100;
  }

  /** Allowed pockets for this map (config ∩ existing), lazily cached; falls back to the assigned pocket if empty. */
  private allowedPockets(): readonly string[] {
    if (this.allowedPocketsCache) return this.allowedPocketsCache;
    const configured = this.d.config.botAllowedPockets[this.d.mapId] ?? [];
    const existing = configured.filter((p) => this.currentHost.pocketExists(p));
    this.allowedPocketsCache = existing.length > 0 ? existing : [this.d.pocketId];
    return this.allowedPocketsCache;
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
    // Bag overflow is the town-trip trigger (D-069/D-070). Free stays byte-identical to PR4 — one area, one goal
    // → stop safely and report. A paid tier diverts to a town trip instead; beginTownTrip refuses on cooldown /
    // active trip / stopped / no warp dep, and the fallback stop keeps every refusal honest (farming on with a
    // full bag leaks loot — never acceptable). This runs in the attack continuation with the attack lease still
    // held; beginTownTrip only advances continuity + constructs the controller here — the trip's warp export runs
    // on a later tick, after releaseLease has drained this committed grant into the report.
    const bag = stopForInventoryOverflow(o.bagOverflowed ? 1 : 0);
    if (bag) {
      if (this.currentTier === "free" || !this.beginTownTrip("bag_full")) this.stop(bag);
    }
  }

  /** stop the bot for a reason (mandatory / manual / death / restart). Idempotent. */
  stop(reason: BotStopReason): void {
    if (this.stopped) return;
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
   * Begin a town trip (Plus/Pro): warp the real actor to the city-hub, run sell → deposit → restock, warp back and
   * resume farming. Guards: paid tier in `townTrip.enabledTiers`, past the trip cooldown and any short retry
   * backoff, no trip already active, not stopped, and the warp acquisition dep is wired. Advances the continuity to
   * RETURNING_TO_TOWN before constructing the controller. Returns true when the trip started. Called by the (next
   * task's) bag-pressure trigger and directly by the warp-handoff tests.
   */
  beginTownTrip(trigger: TownTripTrigger): boolean {
    if (this.stopped || this.tripController) return false;
    if (!canIssueAutomationCommand(this.continuity)) return false;
    if (this.currentTier === "free" || !this.d.config.townTrip.enabledTiers.includes(this.currentTier)) return false;
    if (!this.d.acquireHostForMap) return false;
    const now = this.d.now();
    if (now < this.townTripRetryUntil) return false;
    if (now - this.lastTownTripAt < this.d.config.townTrip.cooldownMs) return false;
    const reason = trigger === "bag_full" ? "bag_full_town_trip" : "preflight_town_trip";
    if (!this.advanceContinuity("RETURNING_TO_TOWN", reason)) return false; // fence lost (takeover/stop raced).
    this.tripController = new TownTripController(this.makeTripFacade(), this.tripSeq);
    return true;
  }

  /** Swap the driven host (town-trip warp export→attach→rebind). tickRoom routing follows `rt.host` automatically. */
  rebindHost(next: BotHost): void {
    this.currentHost = next;
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

  /** Record a completed trip: arm the cooldown from now and bump the idempotency-key trip sequence. */
  private markTripComplete(): void {
    this.lastTownTripAt = this.d.now();
    this.tripSeq += 1;
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
      markTripComplete: () => this.markTripComplete(),
      settleTakeover: (checkpointId, requestedAt) => void this.applyTakeoverPause(checkpointId, requestedAt),
      armRetryBackoff: () => {
        this.townTripRetryUntil = this.d.now() + Math.floor(this.d.config.townTrip.cooldownMs / 10);
      },
      onTripEnded: () => {
        this.tripController = null;
      },
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
      mapId: this.d.mapId,
      pocketId: this.activePocketId,
      continuity: toBotContinuityWire(this.continuity),
      action: pos ? legacyBotActionForContinuity(this.continuity.state) : "searching",
      killCount: this.counters.killCount,
      goldEarned: this.counters.goldEarned,
      expEarned: this.counters.expEarned,
      hpFraction: this.currentHost.botHpFraction(this.d.actorId),
      uptimeMs: this.d.now() - this.d.startedAtMs,
    };
    this.ownerSendMessage(MSG_BOT_STATUS, msg);
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
