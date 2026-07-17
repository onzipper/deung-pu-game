// Character Autonomy town trip (D-069/D-070, PR5 Phase C): the Plus/Pro service run. When a paid bot needs the
// city-hub (bag pressure), the runtime warps the ONE real actor to the town MapRoom, sells → deposits → restocks
// at the real shop/storage NPCs, warps back to the farm, and hands control back to the recovery machinery to walk
// home. The whole flow is a continuity/convenience capability — it never touches damage/EXP/drop/loot (D-067).
//
// ⛔ SERVER-ONLY, but imports NOTHING room/schema (BotHost/BotWarpExport are type-only from runtime.ts) so the
//    client/test tsc program never pulls the legacy-decorator schema in. Every economy mutation runs through the
//    runtime lease so a stop drains the committed transaction into the report before authority release.
//
// Invariants (D-069/D-070):
//   • The actor is in exactly ONE room at every observable instant. reserve → export → attach → rebind is ONE
//     synchronous block (doTransfer) with no await between the steps.
//   • Every economy transaction is idempotency-keyed and retried at most maxTxRetries, then skipped — a per-item
//     failure never fails the trip.
//   • The gold reserve (minGoldReserve) is checked against a freshly RE-READ ledger balance (goldBalance seam),
//     never a summed goldDelta — a duplicate-replay edge makes deltas unreliable.

import type { BotConfig, BotStopReason } from "../config/bot";
import type { Vec2 } from "./agent";
import type { BotBagItemView, BotHost, BotTownTxResult } from "./runtime";
import type { BotContinuityOperationalStateWire } from "../../src/shared/bot-continuity";
import { DEFAULT_INVENTORY_CAPACITY } from "../../src/server/inventory/item-catalog";
import { transferActor, type TransferResult } from "./warp";

/**
 * What kicked off a trip. `bag_full` = a real overflow; `preflight` = an already-full proactive check;
 * `workflow` = a Pro goal-chain town_service step (PR6b) — an explicit service run, not bag pressure.
 * M2a (D-073) proactive pressure triggers: `potion_low` (potions running low), `bag_pressure` (bag nearly full),
 * `hp_no_potion` (low hp with no potion to drink). M1: `goal` = a Plus single-goal town_stop / town_continue
 * completion action. Only the continuity reason code differs — the trip itself is identical (Free walks, paid warps).
 */
export type TownTripTrigger =
  | "bag_full"
  | "preflight"
  | "workflow"
  | "potion_low"
  | "bag_pressure"
  | "hp_no_potion"
  | "goal";

/**
 * The narrow runtime surface the controller drives. The runtime builds this from private closures (keeping its own
 * internals private); tests exercise the controller through a real BotRuntime wired to a FakeWorld.
 */
export interface TownTripFacade {
  readonly config: BotConfig;
  readonly actorId: string;
  readonly sessionRowId: string;
  /** the farm map the trip returns to. */
  readonly farmMapId: string;
  now(): number;
  isStopped(): boolean;
  /** the host the runtime currently drives (rebinds across the warp). */
  currentHost(): BotHost;
  /** the pocket the run farms — the return target after the trip. */
  activePocketId(): string;
  /** acquire (or create) a solo host for a target map; null when none exists and creation fails. */
  acquireHostForMap(mapId: string): Promise<BotHost | null>;
  rebindHost(next: BotHost): void;
  advance(to: BotContinuityOperationalStateWire, reasonCode: string): boolean;
  /** take/drop a town lease so a stop drains the committed transaction into the report before authority release. */
  acquireTownLease(): symbol;
  releaseTownLease(token: symbol): void;
  stop(reason: BotStopReason): void;
  goldBalance(): Promise<number | null>;
  bagItems(): Promise<BotBagItemView[]>;
  ownerStatusPush(): void;
  /** plan A* home from the current (safe-camp) tile and enter the recovery "returning" phase; false = unroutable. */
  beginReturnRouteFromCurrent(targetPocketId: string): boolean;
  /** the map the actor currently stands on (rebinds across every hop transfer) — the per-leg recompute anchor. */
  currentMapId(): string;
  /**
   * D-071 M2b (walk mode, multi-hop): the NEXT portal hop toward `finalMapId` from the current host's map — a
   * walkable `approach` tile inside that hop's exit area (walk here before the transfer, as a player would), the
   * `landing` spawn on the next map, and that `nextMapId` (the acquire target). BFS over the real map graph, so a
   * multi-map chain is crossed one hop at a time. null when no portal chain connects here to `finalMapId`, or the
   * current map IS `finalMapId` already (zero hops — the caller checks currentMapId first).
   */
  nextHopToward(finalMapId: string): { approach: Vec2; landing: Vec2; nextMapId: string } | null;
  /**
   * D-071 (walk mode): step the actor toward `goal` one node this tick (A* planned lazily). "arrived" at/near the
   * goal, "stuck" once the idle-decision limit is hit (the caller settles the Free obstacle baseline), else
   * "walking". Independent of the recovery planner so it drives Free (whose tick never enters recovery).
   */
  walkToward(goal: Vec2, dtMs: number): "walking" | "arrived" | "stuck";
  /** arm the trip cooldown + bump the idempotency-key trip sequence. */
  markTripComplete(): void;
  /**
   * Record the restock outcome for the owner's live status (`restock_done` clears it; a skip reason
   * `gold_reserve` / `restock_skipped` surfaces "why the bot did not buy potions"). Diagnostic only.
   */
  reportTownSkip(reason: string): void;
  /** run the takeover pause + checkpoint settle (after landing at farm, or in place at city-hub on return failure). */
  settleTakeover(checkpointId: string, requestedAt: number): void;
  /** short retry backoff after a trip that never moved the actor, so an auto-trigger does not spin every tick. */
  armRetryBackoff(): void;
  /** detach the controller from the runtime (the trip is over). */
  onTripEnded(): void;
}

/**
 * Internal trip phase. `warp_out`/`warp_back` are the D-069 instant transfers (Plus/Pro). D-071 adds the Free walk
 * legs: `walk_out` (A* to THIS hop's portal, transfer, LOOP until the town map is reached — D-071 M2b multi-hop),
 * `walk_to_service` (walk from the town portal landing to the town shop before SELLING), `walk_return` (the same
 * hop-by-hop loop back to the farm map). `route_home` returns to farming — via the recovery "returning" machinery
 * (warp/paid) or the ordinary farm loop (walk/Free).
 */
type TripPhase =
  | "warp_out"
  | "walk_out"
  | "walk_to_service"
  | "selling"
  | "depositing"
  | "restocking"
  | "warp_back"
  | "walk_return"
  | "route_home"
  | "done";

/** How a trip reaches the city-hub (D-069 warp vs D-071 walk). */
export type TownTripMode = "walk" | "warp";

/**
 * M1: what the trip does once services finish (after restock). `return` (default) = the D-069/D-071 return leg
 * back to farming. `stop_in_town` = a Plus single-goal `town_stop` completion: park in the city-hub and settle
 * `goal_complete` WITHOUT returning (no return warp/walk). A takeover/expiry still preempts either (safety wins).
 */
export type TripEndAction = "return" | "stop_in_town";

/** Rarity ladder (Economy §5.1: common/uncommon/rare). Unknown rarities fall outside every "up to max" band. */
const RARITY_LADDER: readonly string[] = ["common", "uncommon", "rare"];

function raritiesUpTo(max: string): ReadonlySet<string> {
  const idx = RARITY_LADDER.indexOf(max);
  return new Set(idx < 0 ? [] : RARITY_LADDER.slice(0, idx + 1));
}

export class TownTripController {
  private readonly f: TownTripFacade;
  private readonly cfg: BotConfig["townTrip"];
  private readonly tripSeq: number;
  private readonly mode: TownTripMode;
  /** M1: `stop_in_town` parks in the city-hub + settles `goal_complete` after services (a Plus goal `town_stop`). */
  private readonly endAction: TripEndAction;
  /** D-071 M2b: an unroutable FIRST hop STOPS (wait_for_owner) for a proactive trigger; a bag_full overflow aborts (retryable). */
  private readonly noRouteStops: boolean;
  private readonly sellRarities: ReadonlySet<string>;
  private readonly keepItemIds: ReadonlySet<string>;
  private readonly capacity = DEFAULT_INVENTORY_CAPACITY;

  private phase: TripPhase;
  /** true while an async step is in flight — tickTrip is a no-op until it resolves (one host op per tick). */
  private busy = false;
  private transferred = false; // the actor has reached the town host (a return warp is now required for safety)

  private abortMode: "none" | "takeover" | "expiry" = "none";
  private takeoverInfo: { checkpointId: string; requestedAt: number } | null = null;

  // per-phase working state
  private sellPlan: BotBagItemView[] | null = null;
  private sellIndex = 0;
  private soldAny = false;
  private depositPlan: BotBagItemView[] | null = null;
  private depositIndex = 0;
  private restockNeed = -1;
  private restockBought = 0;
  private restockUnitCost = 0;

  constructor(
    facade: TownTripFacade,
    tripSeq: number,
    mode: TownTripMode = "warp",
    trigger: TownTripTrigger = "bag_full",
    endAction: TripEndAction = "return",
  ) {
    this.f = facade;
    this.cfg = facade.config.townTrip;
    this.tripSeq = tripSeq;
    this.mode = mode;
    this.endAction = endAction;
    // D-071 M2b: only a bag_full overflow keeps the retryable abort on an unroutable first hop — every proactive
    // trigger (potion_low / bag_pressure / hp_no_potion / preflight) surfaces the routing failure to the owner.
    this.noRouteStops = trigger !== "bag_full";
    // D-071: the outbound leg differs by mode; the whole service cycle is shared. Warp is byte-identical to D-069.
    this.phase = mode === "walk" ? "walk_out" : "warp_out";
    this.sellRarities = raritiesUpTo(this.cfg.sellRarityMax);
    this.keepItemIds = new Set(this.cfg.keepItemIds);
  }

  private get actorId(): string {
    return this.f.actorId;
  }

  /** The return leg for this mode: walk back to the farm portal (D-071 walk) or the instant return warp (D-069). */
  private returnPhase(): TripPhase {
    return this.mode === "walk" ? "walk_return" : "warp_back";
  }

  /** Fence new transactions immediately; drain the in-flight one; then return-warp home and pause + checkpoint. */
  abortForTakeover(checkpointId: string, requestedAt: number): void {
    if (this.abortMode === "takeover") return;
    this.abortMode = "takeover";
    this.takeoverInfo = { checkpointId, requestedAt };
  }

  /** Skip the remaining paid transactions; the return warp still runs before settling expired_readonly. */
  abortForTierExpiry(): void {
    if (this.abortMode !== "none") return; // a takeover already in progress wins.
    this.abortMode = "expiry";
  }

  /** One trip step. The runtime calls this while the trip is active (instead of the recovery planner / farm loop). */
  tickTrip(dtMs: number): void {
    if (this.f.isStopped()) return; // an external stop (death / server_restart / profile_deleted) — halt.
    if (this.busy) return; // an async host op is in flight.
    switch (this.phase) {
      case "warp_out":
        return this.tickWarpOut();
      case "walk_out":
        return this.tickWalkOut(dtMs);
      case "walk_to_service":
        return this.tickWalkToService(dtMs);
      case "selling":
        return this.tickSelling();
      case "depositing":
        return this.tickDepositing();
      case "restocking":
        return this.tickRestocking();
      case "warp_back":
        return this.tickWarpBack();
      case "walk_return":
        return this.tickWalkReturn(dtMs);
      case "route_home":
        return this.tickRouteHome();
      case "done":
        return;
    }
  }

  // ── phases ────────────────────────────────────────────────────────────────────────────────────────────────

  private tickWarpOut(): void {
    this.pump(async () => {
      const target = await this.f.acquireHostForMap(this.cfg.townMapId);
      if (this.f.isStopped()) return; // death/stop raced during the acquire — halt, do not transfer.
      // Abort before the actor moved: nothing to return, settle where the actor already stands (the farm).
      if (this.abortMode === "takeover") return this.settleTakeoverEnd();
      if (this.abortMode === "expiry") return this.stopEnd("expired_readonly");
      if (!target) return this.abortOutbound("town_trip_target_unavailable");

      const source = this.f.currentHost();
      const anchor = this.cfg.townAnchor ?? target.botSafeCampAnchor();
      const result = this.doTransfer(source, target, anchor);
      switch (result) {
        case "reserve_fail":
          return this.abortOutbound("town_trip_seat_unavailable");
        case "export_null":
          // The actor is not exportable (death raced) — the seat is already released. The runtime death path owns
          // continuity when stopped; otherwise the actor never left, so resume farming.
          if (this.f.isStopped()) return this.end();
          return this.abortOutbound("town_trip_export_null");
        case "attach_recovered":
          // Attach at the town failed; the actor was re-attached to the farm — resume farming, retry after backoff.
          return this.abortOutbound("town_trip_attach_recovered");
        case "attach_fatal":
          // The actor could not be attached anywhere — the only safe settlement is a wait-for-owner stop.
          return this.stopEnd("town_trip_failed");
        case "ok":
          this.transferred = true;
          source.botPersistNow(this.actorId);
          target.botPersistNow(this.actorId);
          this.f.ownerStatusPush();
          if (!this.f.advance("SELLING", "arrived_town")) return; // fence lost (shouldn't happen — no await gap).
          this.phase = "selling";
          this.sellPlan = null;
          return;
      }
    });
  }

  /**
   * D-071 M2b walk outbound (multi-hop): A* to THIS map's portal toward the town, transfer at the gate to the next
   * map (landing at the portal entry, NOT a warp anchor), then LOOP — the next tick re-plans the next hop from the
   * new map, so the whole city-hub↔map1↔…↔map4 chain is crossed one hop at a time. Continuity stays
   * RETURNING_TO_TOWN across the entire chain (SELLING starts only at the town service anchor). A takeover/expiry
   * mid-walk settles in place at the actor's real position (D-071 M2b — NOT the D-069 finish-and-return). Death/stuck
   * en route are the runtime's job. No mob combat: the controller only walks (Free must never farm with a full bag).
   */
  private tickWalkOut(dtMs: number): void {
    // A takeover/expiry mid-walk settles where the actor really stands (any hop's map), not the warp finish-and-return.
    if (this.settleWalkAbort()) return;
    // Reached the town map (last hop landed here, or a re-attach put us here): walk to the shop.
    if (this.f.currentMapId() === this.cfg.townMapId) {
      this.phase = "walk_to_service";
      return;
    }
    const hop = this.f.nextHopToward(this.cfg.townMapId);
    if (!hop) return this.outboundNoRoute(); // no portal chain from here to the city-hub.
    const status = this.f.walkToward(hop.approach, dtMs);
    if (status === "stuck") return this.stopEnd("stuck"); // an owner-visible obstacle (Free waits for the owner).
    if (status === "walking") return;
    // Arrived at this hop's gate → transfer to the next map, landing at its portal entry, then loop for the next hop.
    this.pump(async () => {
      const target = await this.f.acquireHostForMap(hop.nextMapId);
      if (this.f.isStopped()) return;
      if (this.settleWalkAbort()) return;
      if (!target) return this.hopFailedOutbound("town_trip_target_unavailable");
      const source = this.f.currentHost();
      const result = this.doTransfer(source, target, hop.landing);
      switch (result) {
        case "reserve_fail":
          return this.hopFailedOutbound("town_trip_seat_unavailable");
        case "export_null":
          if (this.f.isStopped()) return this.end();
          return this.hopFailedOutbound("town_trip_export_null");
        case "attach_recovered":
          return this.hopFailedOutbound("town_trip_attach_recovered");
        case "attach_fatal":
          return this.stopEnd("town_trip_failed");
        case "ok":
          this.transferred = true;
          source.botPersistNow(this.actorId);
          target.botPersistNow(this.actorId);
          this.f.ownerStatusPush();
          // Reached the town → walk to the shop. Otherwise stay in walk_out; the next tick plans the next hop.
          if (this.f.currentMapId() === this.cfg.townMapId) this.phase = "walk_to_service";
          return;
      }
    });
  }

  /**
   * D-071 walk outbound: from the town portal entry, walk to the service anchor (the central plaza safe camp, next
   * to the shop + storage) before the D-070 service cycle. A takeover/expiry settles in place in town (D-071 M2b —
   * the actor already arrived). The town seams are gated by map, not tile — the walk is for fidelity, not a
   * transaction precondition.
   */
  private tickWalkToService(dtMs: number): void {
    if (this.settleWalkAbort()) return; // takeover/expiry → settle in place in town (D-071 M2b, walk-only phase).
    const anchor = this.f.currentHost().botSafeCampAnchor();
    const status = this.f.walkToward(anchor, dtMs);
    if (status === "stuck") return this.stopEnd("stuck"); // cannot reach the shop — parked safely in town.
    if (status === "walking") return;
    if (!this.f.advance("SELLING", "arrived_town")) return; // fence lost.
    this.phase = "selling";
    this.sellPlan = null;
  }

  private tickSelling(): void {
    this.pump(async () => {
      if (this.interrupted()) return;
      if (this.sellPlan === null) {
        const bag = await this.f.bagItems();
        this.sellPlan = bag.filter(
          (i) =>
            !i.equipped &&
            i.sellPrice != null &&
            this.sellRarities.has(i.rarity) &&
            !this.keepItemIds.has(i.itemId),
        );
        this.sellIndex = 0;
        return; // sell one instance per subsequent tick.
      }
      if (this.interrupted()) return;
      if (this.sellIndex >= this.sellPlan.length) {
        this.f.advance("DEPOSITING", this.soldAny ? "sell_done" : "sell_empty");
        this.phase = "depositing";
        this.depositPlan = null;
        return;
      }
      const item = this.sellPlan[this.sellIndex];
      this.sellIndex += 1; // advance before the await so a skip (failed retry) never re-sells the same instance.
      const key = `bot:${this.f.sessionRowId}:t${this.tripSeq}:sell:${item.instanceId}`;
      const res = await this.txWithRetry(() =>
        this.f.currentHost().botTownSell(this.actorId, item.instanceId, item.version, item.quantity, key),
      );
      if (res.ok) this.soldAny = true;
    });
  }

  private tickDepositing(): void {
    this.pump(async () => {
      if (this.interrupted()) return;
      if (this.depositPlan === null) {
        const bag = await this.f.bagItems(); // re-list: selling changed the bag.
        this.depositPlan = bag.filter((i) => !i.equipped && i.deliverable && !this.keepItemIds.has(i.itemId));
        this.depositIndex = 0;
        return;
      }
      if (this.interrupted()) return;
      if (this.depositIndex >= this.depositPlan.length) {
        this.f.advance("RESTOCKING", this.depositPlan.length > 0 ? "deposit_done" : "deposit_skipped");
        this.phase = "restocking";
        this.restockNeed = -1;
        return;
      }
      const item = this.depositPlan[this.depositIndex];
      this.depositIndex += 1;
      const key = `bot:${this.f.sessionRowId}:t${this.tripSeq}:deposit:${item.instanceId}`;
      // STORAGE_FULL / ITEM_BOUND / any reject → skip (never fatal): report truthfully, keep the item in the bag.
      await this.txWithRetry(() =>
        this.f.currentHost().botTownDeposit(this.actorId, item.instanceId, item.version, key),
      );
    });
  }

  private tickRestocking(): void {
    this.pump(async () => {
      if (this.interrupted()) return;
      const potionId = this.cfg.potionItemId;
      if (this.restockNeed < 0) {
        const bag = await this.f.bagItems();
        const held = bag
          .filter((i) => !i.equipped && i.itemId === potionId)
          .reduce((n, i) => n + i.quantity, 0);
        this.restockNeed = Math.max(0, this.cfg.potionRestockTarget - held);
        this.restockBought = 0;
        if (this.restockNeed === 0) return this.finishRestock("restock_skipped");
        return; // buy one unit per subsequent tick.
      }
      if (this.interrupted()) return;
      if (this.restockBought >= this.restockNeed) return this.finishRestock("restock_done");

      // Re-read the authoritative balance before every unit (a summed goldDelta is unreliable under a replay).
      const balance = await this.f.goldBalance();
      if (balance === null) return this.finishRestock("restock_skipped"); // persistence unavailable → skip restock.
      const margin = balance - this.cfg.minGoldReserve;
      // First unit: the price is unknown, so buy only while strictly above the reserve. After the first buy the
      // per-unit cost is known, so every later unit strictly holds the reserve (D-070: never buy below it).
      const affordable = this.restockBought === 0 ? margin > 0 : margin >= this.restockUnitCost;
      if (!affordable) return this.finishRestock("gold_reserve");

      const key = `bot:${this.f.sessionRowId}:t${this.tripSeq}:buy:${potionId}:${this.restockBought}`;
      const res = await this.txWithRetry(() => this.f.currentHost().botTownBuy(this.actorId, potionId, 1, key));
      if (!res.ok) return this.finishRestock("restock_skipped"); // buy failed after retries → stop restocking.
      const unit = Math.abs(res.goldDelta ?? 0);
      if (unit > 0) this.restockUnitCost = unit;
      this.restockBought += 1;
    });
  }

  private finishRestock(reason: string): void {
    // Surface the restock outcome to the owner's live status (a skip = gold_reserve / restock_skipped; restock_done
    // clears it) so "the bot did not buy potions" is visible without changing the economy gate (the shop unlock is
    // not server-gated — see the report). The reason ALSO rides continuity below; this makes it durably observable.
    this.f.reportTownSkip(reason);
    // M1 `town_stop`: services done → park in the city-hub and settle `goal_complete` (no return leg). Reached only
    // with abortMode === "none" (interrupted() short-circuits restock to the return phase for a takeover/expiry, so
    // safety still preempts this). The actor stays materialized in the safe city-hub for the owner to reclaim.
    if (this.endAction === "stop_in_town") return this.stopEnd("goal_complete");
    this.f.advance("RETURNING_TO_WORK", reason);
    this.phase = this.returnPhase(); // walk_return (D-071) or warp_back (D-069).
  }

  private tickWarpBack(): void {
    this.pump(async () => {
      const target = await this.f.acquireHostForMap(this.f.farmMapId);
      if (this.f.isStopped()) return;
      if (!target) return this.landFailed(); // cannot get home — the actor stays safe in the city-hub.
      const source = this.f.currentHost();
      const anchor = target.botSafeCampAnchor();
      const result = this.doTransfer(source, target, anchor);
      if (result !== "ok") return this.landFailed();

      target.botPersistNow(this.actorId);
      this.f.ownerStatusPush();
      if (this.abortMode === "takeover") return this.settleTakeoverEnd(); // pause + checkpoint at the farm.
      if (this.abortMode === "expiry") return this.stopEnd("expired_readonly");
      this.f.markTripComplete();
      this.phase = "route_home";
    });
  }

  /**
   * D-071 M2b walk return (multi-hop): the mirror of walk_out — A* to THIS map's portal toward the farm, transfer at
   * the gate to the next map, then LOOP until the farm map is reached (continuity stays RETURNING_TO_WORK the whole
   * way). A takeover/expiry mid-return settles in place at the actor's real position (D-071 M2b). A stuck walk /
   * failed transfer / dead-end route parks the actor safely on whatever map it stands on (wait for owner). On
   * reaching the farm, hand off to `route_home` exactly like the warp path.
   */
  private tickWalkReturn(dtMs: number): void {
    if (this.settleWalkAbort()) return; // takeover/expiry mid-return settles in place (not the D-069 finish-and-return).
    if (this.f.currentMapId() === this.f.farmMapId) return this.finishReturn(); // already home (re-attach / zero hop).
    const hop = this.f.nextHopToward(this.f.farmMapId);
    if (!hop) return this.landFailed(); // no portal chain back to the farm — parked safely where it stands.
    const status = this.f.walkToward(hop.approach, dtMs);
    if (status === "stuck") return this.stopEnd("stuck"); // owner-visible obstacle (abort already handled above).
    if (status === "walking") return;
    this.pump(async () => {
      const target = await this.f.acquireHostForMap(hop.nextMapId);
      if (this.f.isStopped()) return;
      if (this.settleWalkAbort()) return;
      if (!target) return this.landFailed();
      const source = this.f.currentHost();
      const result = this.doTransfer(source, target, hop.landing);
      if (result !== "ok") return this.landFailed();
      target.botPersistNow(this.actorId);
      this.f.ownerStatusPush();
      // Reached the farm → finish the trip. Otherwise stay in walk_return; the next tick plans the next hop.
      if (this.f.currentMapId() === this.f.farmMapId) return this.finishReturn();
    });
  }

  /** Arrived home on the walk return: arm the cooldown and hand off to the resume-farming phase (route_home). */
  private finishReturn(): void {
    this.f.markTripComplete();
    this.phase = "route_home";
  }

  private tickRouteHome(): void {
    this.pump(async () => {
      // Trip success criterion (D-070): free bag slots must reach the resume threshold, else report inventory_full
      // (this is the shared anti-loop guard — a still-full bag would immediately re-trigger a trip).
      const bag = await this.f.bagItems();
      const used = bag.filter((i) => !i.equipped).length;
      const free = this.capacity - used;
      if (free < this.cfg.resumeMinFreeSlots) return this.stopEnd("inventory_full");
      if (this.mode === "walk") {
        // D-071: Free has no recovery planner (its tick never enters runRecoveryFarm), so it simply resumes the
        // ordinary farm loop from the portal landing — that loop walks back into the pocket and re-checks stuck
        // itself. Advance RETURNING_TO_WORK → WORKING so the loop's first TRAVELING/COMBAT edge is valid.
        if (!this.f.advance("WORKING", "trip_home_walk")) return;
        return this.end();
      }
      // Warp (paid): hand control back to the recovery machinery — plan A* from the safe camp to the active pocket
      // and let the runtime walk it home (follow_route → arrived → WORKING while continuity is RETURNING_TO_WORK).
      if (!this.f.beginReturnRouteFromCurrent(this.f.activePocketId())) return this.stopEnd("stuck");
      this.end();
    });
  }

  // ── transfer + settlement helpers ───────────────────────────────────────────────────────────────────────────

  /**
   * The ONE synchronous actor transfer: reserve a seat at `target`, export from `source`, attach at `target`,
   * rebind the runtime's host, then release the reservation (the actor is now counted by players). No await
   * between the steps, so the actor is never observable in zero or two rooms at a tick boundary. On attach failure
   * the actor is re-attached to `source` (recovered) or, if that also fails, is unrecoverable (fatal).
   */
  private doTransfer(source: BotHost, target: BotHost, anchor: Vec2): TransferResult {
    return transferActor(this.actorId, source, target, anchor, (next) => this.f.rebindHost(next));
  }

  private async txWithRetry(fn: () => Promise<BotTownTxResult>): Promise<BotTownTxResult> {
    let res = await fn();
    let attempts = 0;
    while (!res.ok && attempts < this.cfg.maxTxRetries) {
      attempts += 1;
      res = await fn(); // same idempotency key → a committed-but-reported-failed op is a safe no-op replay.
    }
    return res;
  }

  /**
   * Between transactions, observe the stop / abort flags. A stop halts silently (the runtime death/stop path owns
   * settlement). An abort skips the remaining transactions: a WARP trip finish-and-returns home (D-069); a WALK trip
   * settles in place in town (D-071 M2b — the owner reclaims mid-service), after the in-flight tx has drained.
   */
  private interrupted(): boolean {
    if (this.f.isStopped()) return true;
    if (this.abortMode !== "none") {
      if (this.mode === "walk") this.settleWalkAbort(); // takeover → pause in town; expiry → stop in place.
      else this.phase = this.returnPhase(); // D-069 warp: finish-and-return home.
      return true;
    }
    return false;
  }

  /**
   * D-071 M2b: a takeover/expiry during ANY walk phase settles IN PLACE at the actor's real position (owner reclaim
   * mid-walk) — never the D-069 warp finish-and-return. Returns true when it handled the abort (the caller stops
   * stepping). The in-flight transaction has already drained (the pump lease defers finalize) by the time a service
   * tick re-observes the flag. Warp mode never calls this (it keeps finish-and-return).
   */
  private settleWalkAbort(): boolean {
    if (this.abortMode === "takeover") {
      this.settleTakeoverEnd();
      return true;
    }
    if (this.abortMode === "expiry") {
      this.stopEnd("expired_readonly");
      return true;
    }
    return false;
  }

  /**
   * D-071 M2b outbound routing failure (no portal chain to the town from here). A proactive trigger, OR any failure
   * once the chain has already begun (≥1 hop transferred — the actor is stranded mid-chain), STOPS visibly
   * (wait_for_owner) with the actor parked on its real map. Only a bag_full overflow on the very first hop keeps the
   * retryable abort (the runtime's inventory_full fallback still guards a truly stuck bag).
   */
  private outboundNoRoute(): void {
    if (this.transferred || this.noRouteStops) return this.stopEnd("town_trip_no_route");
    this.abortOutbound("town_trip_no_route");
  }

  /**
   * D-071 M2b: an outbound hop's transfer failed (host acquire / seat / export / re-attach). Mid-chain (≥1 hop
   * already done) the actor is stranded on an intermediate map → a visible town_trip_failed stop parks it there. On
   * the FIRST hop the actor never left the farm (or was re-attached to it) → the retryable abort resumes farming.
   */
  private hopFailedOutbound(reasonCode: string): void {
    if (this.transferred) return this.stopEnd("town_trip_failed");
    this.abortOutbound(reasonCode);
  }

  /** Outbound abort — the actor never left the farm (or was re-attached there): resume farming, retry after backoff. */
  private abortOutbound(reasonCode: string): void {
    if (!this.f.isStopped()) this.f.advance("WORKING", reasonCode); // WORKING = outbound abort (actor never moved).
    this.f.armRetryBackoff(); // cooldown NOT consumed; a short backoff keeps an auto-trigger from spinning.
    this.end();
  }

  /**
   * The return leg could not complete — the actor is parked safely on whatever map it stands on (the city-hub for a
   * warp trip, or any intermediate map on a walk trip whose next hop is unroutable / un-transferable). A pending
   * takeover pauses in place there (the manager stamps the checkpoint mapId from the live host); otherwise a stop.
   */
  private landFailed(): void {
    if (this.abortMode === "takeover") return this.settleTakeoverEnd(); // pause in place (checkpoint = live host map).
    this.stopEnd(this.abortMode === "expiry" ? "expired_readonly" : "town_trip_failed");
  }

  private settleTakeoverEnd(): void {
    const info = this.takeoverInfo;
    if (info) this.f.settleTakeover(info.checkpointId, info.requestedAt); // clears the controller on the runtime.
    this.phase = "done";
  }

  private stopEnd(reason: BotStopReason): void {
    this.f.stop(reason);
    this.end();
  }

  private end(): void {
    this.phase = "done";
    this.f.onTripEnded();
  }

  /**
   * Run one async host op under a town lease with the busy guard. The lease defers finalizeStop so a committed
   * economy transaction always drains into the report before authority release. `busy` blocks re-entry until the
   * op resolves (one host op per tick — the actor stays in exactly one room across the whole call).
   */
  private pump(work: () => Promise<void>): void {
    this.busy = true;
    const lease = this.f.acquireTownLease();
    void (async () => {
      try {
        await work();
      } catch (e) {
        this.onError(e);
      } finally {
        this.busy = false;
        this.f.releaseTownLease(lease);
      }
    })();
  }

  /** Fail-closed: get a transferred actor home; otherwise abort the outbound leg. */
  private onError(e: unknown): void {
    console.error(
      `[bot ${this.f.sessionRowId}] town trip error (${this.phase}): ${e instanceof Error ? e.message : String(e)}`,
    );
    if (this.f.isStopped()) return void this.end();
    if (this.transferred) this.phase = this.returnPhase(); // get a transferred actor home (walk or warp).
    else this.abortOutbound("town_trip_error");
  }
}
