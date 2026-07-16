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

/** What kicked off a trip. `bag_full` = a real overflow; `preflight` = an already-full proactive check. */
export type TownTripTrigger = "bag_full" | "preflight";

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
  /** arm the trip cooldown + bump the idempotency-key trip sequence. */
  markTripComplete(): void;
  /** run the takeover pause + checkpoint settle (after landing at farm, or in place at city-hub on return failure). */
  settleTakeover(checkpointId: string, requestedAt: number): void;
  /** short retry backoff after a trip that never moved the actor, so an auto-trigger does not spin every tick. */
  armRetryBackoff(): void;
  /** detach the controller from the runtime (the trip is over). */
  onTripEnded(): void;
}

/** Internal trip phase. `route_home` reuses the runtime's recovery "returning" machinery to walk back to the pocket. */
type TripPhase = "warp_out" | "selling" | "depositing" | "restocking" | "warp_back" | "route_home" | "done";

/** Outcome of one synchronous actor transfer (reserve → export → attach → rebind). */
type TransferResult = "ok" | "reserve_fail" | "export_null" | "attach_recovered" | "attach_fatal";

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
  private readonly sellRarities: ReadonlySet<string>;
  private readonly keepItemIds: ReadonlySet<string>;
  private readonly capacity = DEFAULT_INVENTORY_CAPACITY;

  private phase: TripPhase = "warp_out";
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

  constructor(facade: TownTripFacade, tripSeq: number) {
    this.f = facade;
    this.cfg = facade.config.townTrip;
    this.tripSeq = tripSeq;
    this.sellRarities = raritiesUpTo(this.cfg.sellRarityMax);
    this.keepItemIds = new Set(this.cfg.keepItemIds);
  }

  private get actorId(): string {
    return this.f.actorId;
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

  /** One trip step. The runtime calls this from tickPaid while the trip is active (instead of the recovery planner). */
  tickTrip(): void {
    if (this.f.isStopped()) return; // an external stop (death / server_restart / profile_deleted) — halt.
    if (this.busy) return; // an async host op is in flight.
    switch (this.phase) {
      case "warp_out":
        return this.tickWarpOut();
      case "selling":
        return this.tickSelling();
      case "depositing":
        return this.tickDepositing();
      case "restocking":
        return this.tickRestocking();
      case "warp_back":
        return this.tickWarpBack();
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
    this.f.advance("RETURNING_TO_WORK", reason);
    this.phase = "warp_back";
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

  private tickRouteHome(): void {
    this.pump(async () => {
      // Trip success criterion (D-070): free bag slots must reach the resume threshold, else report inventory_full.
      const bag = await this.f.bagItems();
      const used = bag.filter((i) => !i.equipped).length;
      const free = this.capacity - used;
      if (free < this.cfg.resumeMinFreeSlots) return this.stopEnd("inventory_full");
      // Hand control back to the recovery machinery: plan A* from the safe camp to the active pocket and let the
      // runtime walk it home (follow_route → arrived → WORKING while continuity is RETURNING_TO_WORK).
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
    if (!target.botReserveWarpSeat(this.actorId)) return "reserve_fail";
    const exported = source.botExportActor(this.actorId);
    if (!exported) {
      target.botReleaseWarpSeat(this.actorId);
      return "export_null";
    }
    if (!target.botAttachWarpedActor(exported, anchor)) {
      const reattached = source.botAttachWarpedActor(exported, source.botSafeCampAnchor());
      target.botReleaseWarpSeat(this.actorId);
      return reattached ? "attach_recovered" : "attach_fatal";
    }
    target.botReleaseWarpSeat(this.actorId); // attach counted the actor into players — release the reservation.
    this.f.rebindHost(target);
    return "ok";
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
   * settlement). An abort (takeover/expiry) skips the remaining transactions and jumps straight to the return warp.
   */
  private interrupted(): boolean {
    if (this.f.isStopped()) return true;
    if (this.abortMode !== "none") {
      this.phase = "warp_back";
      return true;
    }
    return false;
  }

  /** Outbound abort — the actor never left the farm (or was re-attached there): resume farming, retry after backoff. */
  private abortOutbound(reasonCode: string): void {
    if (!this.f.isStopped()) this.f.advance("WORKING", reasonCode); // WORKING = outbound abort (actor never moved).
    this.f.armRetryBackoff(); // cooldown NOT consumed; a short backoff keeps an auto-trigger from spinning.
    this.end();
  }

  /** The return warp could not complete — the actor is parked safely in the city-hub. */
  private landFailed(): void {
    if (this.abortMode === "takeover") return this.settleTakeoverEnd(); // pause in place (checkpoint = city-hub).
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
    if (this.transferred) this.phase = "warp_back";
    else this.abortOutbound("town_trip_error");
  }
}
