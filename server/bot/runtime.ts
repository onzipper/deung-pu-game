// Character Autonomy runtime: one server controller attached to an existing character actor. Driven by the
// actor's host-room sim tick (no client clock and no separate worker/entity).
//
// Reuses the room's EXISTING seams via the BotHost interface (MapRoom implements it): movement on the collision
// grid, attacks through the SAME server combat resolution + the IDENTICAL economy entry (grantKillRewardsForMob),
// so guardrails/audit apply exactly as for a real player. The 9 Mandatory Stops are evaluated here each tick
// (death is delivered by the host contact path → BotManager.onBotDied → this.stop("death")).
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
import type { BotConfig, BotStopReason } from "../config/bot";
import {
  pickTarget,
  stopForBossInRange,
  stopForInventoryOverflow,
  stopForLowHp,
  stopForRareDrop,
  stopForStuck,
  throttledAttackCooldownMs,
  withinRange,
  type AgentMob,
  type Vec2,
} from "./agent";
import type { SessionRepo } from "./store";
import type { BotRulesV1, BotSessionCounters } from "./types";

/** One attack's aggregated result from the host (may kill several mobs in the arc). */
export interface BotAttackOutcome {
  killed: number;
  gold: number;
  exp: number;
  loot: { itemId: string; quantity: number }[];
  /** loot that could not be banked (bag full / no delivery) — drives the inventory_full stop. */
  overflow: { itemId: string; quantity: number }[];
  leveledUp: boolean;
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

/** The room seam the bot drives. MapRoom implements this; tests use a fake. */
export interface BotHost {
  readonly mapId: string;
  readonly roomId: string;
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
  /** step toward `target` at normal move speed, clamped to walkable tiles. */
  botStepToward(actorId: string, target: Vec2, dtMs: number): void;
  /**
   * face `target`, cast the basic attack through the room combat+economy seams, resolve the aggregate outcome.
   * Async: the reward grant (EXP/gold/drops) runs through the same async economy path as a real player's kill.
   * Damage + the visual broadcast happen synchronously first; the promise resolves after the grants persist.
   */
  botAttack(actorId: string, target: Vec2): Promise<BotAttackOutcome>;
  /** send a message to the owner IF they are connected in this room (offline owner → false, no push). */
  botOwnerSend(accountId: string, type: string, msg: unknown): boolean;
  /** true when a mobType is a boss/event entity (bots must stop, §6.5). */
  isBossOrEventType(mobType: string): boolean;
  /** true when the pocket still exists + is bot-safe (map_unsafe guard). */
  pocketExists(pocketId: string): boolean;
}

export interface BotRuntimeDeps {
  host: BotHost;
  config: BotConfig;
  sessionRepo: SessionRepo;
  /** rarity lookup for the rare-drop stop (itemId → rarity band). */
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
  /** base attack cooldown (seconds) of the chosen skill — throttled by efficiency. */
  baseCooldownSeconds: number;
  startedAtMs: number;
  /** called when the runtime stops (any reason) so the manager drops it. */
  onStopped: (accountId: string, sessionRowId: string) => void;
  /** takeover checkpoint becomes resumable only after the accepted reward/report write has drained. */
  onTakeoverSettled: (accountId: string, checkpointId: string, saved: boolean) => void;
}

export class BotRuntime {
  private readonly d: BotRuntimeDeps;
  private readonly throttleMs: number;
  private readonly counters: BotSessionCounters = { killCount: 0, goldEarned: 0, expEarned: 0, drops: {} };
  private decisionTimer = 0;
  private idleDecisions = 0;
  private sinceFlushMs = 0;
  private sinceStatusMs = 0;
  private stopped = false;
  private attacking = false; // an async attack+grant is in flight → don't start another
  private pendingStop: { reason: BotStopReason; requestedAt: number } | null = null;
  private stopFinalized = false;
  private authorityReleased = false;
  private takeoverCheckpointId: string | null = null;
  /** Serialize periodic/final report patches so an older flush can never land after the checkpoint close. */
  private persistenceTail: Promise<void> = Promise.resolve();

  constructor(deps: BotRuntimeDeps) {
    this.d = deps;
    this.throttleMs = throttledAttackCooldownMs(deps.baseCooldownSeconds, deps.config.botEfficiencyTarget);
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
    return this.d.host;
  }
  get isStopped(): boolean {
    return this.stopped;
  }

  /** advance one host sim tick; may stop the bot. */
  tick(dtMs: number): void {
    if (this.stopped) return;
    const { host, config, pocketId } = this.d;

    const pos = host.botPos(this.d.actorId);
    if (!pos) return void this.stop("map_unsafe"); // member vanished
    if (!host.pocketExists(pocketId)) return void this.stop("map_unsafe");

    // #2 low hp (potion-exhausted substitution). death arrives via the host contact path (onBotDied).
    const hpStop = stopForLowHp(host.botHpFraction(this.d.actorId), config.lowHpStopFraction);
    if (hpStop) return void this.stop(hpStop);

    const mobs = host.botMobs();
    // #7 boss/event in range.
    const bossStop = stopForBossInRange(pos, mobs, (t) => host.isBossOrEventType(t), config.bossStopRadiusTiles);
    if (bossStop) return void this.stop(bossStop);

    const target = pickTarget(pos, mobs, pocketId);
    this.decisionTimer += dtMs;

    if (target) {
      const range = host.botAttackRange(this.d.actorId) * config.attackRangeFactor;
      if (!withinRange(pos, target, range)) host.botStepToward(this.d.actorId, target, dtMs);
      if (this.decisionTimer >= this.throttleMs && !this.attacking) {
        this.decisionTimer = 0;
        this.idleDecisions = 0;
        const p2 = host.botPos(this.d.actorId) ?? pos;
        if (withinRange(p2, target, range)) this.runAttack(target);
      }
    } else if (this.decisionTimer >= this.throttleMs) {
      // #5 map unsafe — pocket empty/unreachable for too many decisions → stuck.
      this.decisionTimer = 0;
      this.idleDecisions += 1;
      const stuck = stopForStuck(this.idleDecisions, config.stuckTickLimit);
      if (stuck) return void this.stop(stuck);
    }

    this.sinceFlushMs += dtMs;
    if (this.sinceFlushMs >= config.sessionFlushIntervalMs) {
      this.sinceFlushMs = 0;
      void this.flush(null);
    }
    this.sinceStatusMs += dtMs;
    if (this.sinceStatusMs >= config.statusPushIntervalMs) {
      this.sinceStatusMs = 0;
      this.pushStatus(target ? "attacking" : "searching");
    }
  }

  /** fire an attack (async grant) without blocking the sim tick; apply the outcome when it resolves. */
  private runAttack(target: Vec2): void {
    this.attacking = true;
    void this.d.host
      .botAttack(this.d.actorId, target)
      .then((o) => {
        this.attacking = false;
        if (this.stopped) {
          // The authoritative economy call already committed against the real character. Include that result in
          // the report, then release authority; never dematerialize while an in-flight grant still owns state.
          this.recordAttack(o);
          this.finalizeStop();
        } else {
          this.applyAttack(o);
        }
      })
      .catch((e: unknown) => {
        this.attacking = false;
        console.error(`[bot ${this.d.sessionRowId}] attack error: ${e instanceof Error ? e.message : String(e)}`);
        if (this.stopped) this.finalizeStop();
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

  /** fold one attack's rewards into the counters + evaluate the loot-driven mandatory stops (rare / bag full). */
  private applyAttack(o: BotAttackOutcome): void {
    this.recordAttack(o);
    // (EXP/gold/items already persisted inside host.botAttack via the identical economy path; level-up saved there.)

    // #6 rare/high-value drop → alert + stop (checked before the bag-full stop — surface the item).
    const rare = stopForRareDrop(o.loot.map((l) => l.itemId), this.d.rarityOf, this.d.config.rareStopMinRarity);
    if (rare) {
      const alert: BotAlertMessage = {
        profileId: this.d.profileId,
        kind: "rare",
        itemId: rare.itemId,
        message: "เจอของแรร์! บอทหยุดรอคุณ",
      };
      this.d.host.botOwnerSend(this.d.accountId, MSG_BOT_ALERT, alert);
      return void this.stop(rare.reason);
    }
    // #1 inventory full → stop.
    const bag = stopForInventoryOverflow(o.overflow.length);
    if (bag) return void this.stop(bag);
  }

  /** stop the bot for a reason (mandatory / manual / death / restart). Idempotent. */
  stop(reason: BotStopReason): void {
    if (this.stopped) return;
    this.stopped = true;
    this.pendingStop = { reason, requestedAt: Date.now() };
    if (!this.attacking) this.finalizeStop();
  }

  /**
   * Fence every future automation command and release the actor synchronously so the caller may apply the
   * same manual input in this event turn. The already-accepted async reward is allowed to drain into the
   * report; it can never issue another movement/attack after `stopped` is set.
   */
  takeover(checkpointId: string, requestedAt: number): boolean {
    if (this.stopped) return false;
    this.stopped = true;
    this.pendingStop = { reason: "manual", requestedAt };
    this.takeoverCheckpointId = checkpointId;
    this.releaseAuthorityOnce();
    if (!this.attacking) this.finalizeStop();
    return true;
  }

  private releaseAuthorityOnce(): void {
    if (this.authorityReleased) return;
    this.authorityReleased = true;
    this.d.host.botReleaseAuthority(this.d.actorId);
  }

  private finalizeStop(): void {
    if (this.stopFinalized || !this.pendingStop || this.attacking) return;
    this.stopFinalized = true;
    const { reason, requestedAt } = this.pendingStop;
    const persisted = this.flush({ stoppedAt: requestedAt, stopReason: reason });
    this.releaseAuthorityOnce();
    const stopped: BotStoppedMessage = {
      profileId: this.d.profileId,
      sessionId: this.d.sessionRowId,
      reason,
      killCount: this.counters.killCount,
      goldEarned: this.counters.goldEarned,
      expEarned: this.counters.expEarned,
    };
    this.d.host.botOwnerSend(this.d.accountId, MSG_BOT_STOPPED, stopped);
    this.d.onStopped(this.d.accountId, this.d.sessionRowId);
    const checkpointId = this.takeoverCheckpointId;
    if (checkpointId) {
      void persisted.then((saved) => this.d.onTakeoverSettled(this.d.accountId, checkpointId, saved));
    }
  }

  private pushStatus(action: string): void {
    const pos = this.d.host.botPos(this.d.actorId);
    const msg: BotStatusMessage = {
      profileId: this.d.profileId,
      sessionId: this.d.sessionRowId,
      mapId: this.d.mapId,
      pocketId: this.d.pocketId,
      action: pos ? action : "searching",
      killCount: this.counters.killCount,
      goldEarned: this.counters.goldEarned,
      expEarned: this.counters.expEarned,
      hpFraction: this.d.host.botHpFraction(this.d.actorId),
      uptimeMs: Date.now() - this.d.startedAtMs,
    };
    this.d.host.botOwnerSend(this.d.accountId, MSG_BOT_STATUS, msg);
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
