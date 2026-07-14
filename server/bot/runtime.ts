// Batch 7b-server — BotRuntime: one running bot session. Driven by the host room's sim tick (no own interval).
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

/** Everything the runtime needs to spawn/host a virtual player. Implemented by MapRoom. */
export interface BotSpawnInput {
  sessionId: string;
  accountId: string;
  characterId: string;
  profileId: string;
  classId: string;
  level: number;
  exp: number;
  /** allowed skill-slot indices (validated against the class at spawn by the host). */
  allowedSlots: number[];
  /** the bot-safe pocket to farm — the host computes a walkable spawn inside it. */
  pocketId: string;
}

/** The room seam the bot drives. MapRoom implements this; tests use a fake. */
export interface BotHost {
  readonly mapId: string;
  /** spawn the virtual player (PlayerState isBot=true + tracker + stats). false = invalid spawn / no such skill. */
  botSpawn(input: BotSpawnInput): boolean;
  /** remove the virtual player + all its per-session state. */
  botRemove(sessionId: string): void;
  /** snapshot of live mobs for the agent. */
  botMobs(): AgentMob[];
  /** current bot tile position (null = member gone). */
  botPos(sessionId: string): Vec2 | null;
  /** current hp fraction 0..1. */
  botHpFraction(sessionId: string): number;
  /** the chosen basic-attack skill's range (tiles). */
  botAttackRange(sessionId: string): number;
  /** the chosen basic-attack skill's base cooldown (seconds) — throttled by the runtime. */
  botBaseCooldownSeconds(sessionId: string): number;
  /** step toward `target` at normal move speed, clamped to walkable tiles. */
  botStepToward(sessionId: string, target: Vec2, dtMs: number): void;
  /**
   * face `target`, cast the basic attack through the room combat+economy seams, resolve the aggregate outcome.
   * Async: the reward grant (EXP/gold/drops) runs through the same async economy path as a real player's kill.
   * Damage + the visual broadcast happen synchronously first; the promise resolves after the grants persist.
   */
  botAttack(sessionId: string, target: Vec2): Promise<BotAttackOutcome>;
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
  sessionId: string; // the virtual-player session id in the room
  mapId: string;
  pocketId: string;
  rules: BotRulesV1;
  /** base attack cooldown (seconds) of the chosen skill — throttled by efficiency. */
  baseCooldownSeconds: number;
  startedAtMs: number;
  /** called when the runtime stops (any reason) so the manager drops it. */
  onStopped: (accountId: string) => void;
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

  constructor(deps: BotRuntimeDeps) {
    this.d = deps;
    this.throttleMs = throttledAttackCooldownMs(deps.baseCooldownSeconds, deps.config.botEfficiencyTarget);
  }

  get sessionId(): string {
    return this.d.sessionId;
  }
  get accountId(): string {
    return this.d.accountId;
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

    const pos = host.botPos(this.d.sessionId);
    if (!pos) return void this.stop("map_unsafe"); // member vanished
    if (!host.pocketExists(pocketId)) return void this.stop("map_unsafe");

    // #2 low hp (potion-exhausted substitution). death arrives via the host contact path (onBotDied).
    const hpStop = stopForLowHp(host.botHpFraction(this.d.sessionId), config.lowHpStopFraction);
    if (hpStop) return void this.stop(hpStop);

    const mobs = host.botMobs();
    // #7 boss/event in range.
    const bossStop = stopForBossInRange(pos, mobs, (t) => host.isBossOrEventType(t), config.bossStopRadiusTiles);
    if (bossStop) return void this.stop(bossStop);

    const target = pickTarget(pos, mobs, pocketId);
    this.decisionTimer += dtMs;

    if (target) {
      const range = host.botAttackRange(this.d.sessionId) * config.attackRangeFactor;
      if (!withinRange(pos, target, range)) host.botStepToward(this.d.sessionId, target, dtMs);
      if (this.decisionTimer >= this.throttleMs && !this.attacking) {
        this.decisionTimer = 0;
        this.idleDecisions = 0;
        const p2 = host.botPos(this.d.sessionId) ?? pos;
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
      this.flush(null);
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
      .botAttack(this.d.sessionId, target)
      .then((o) => {
        this.attacking = false;
        if (!this.stopped) this.applyAttack(o);
      })
      .catch((e: unknown) => {
        this.attacking = false;
        console.error(`[bot ${this.d.sessionRowId}] attack error: ${e instanceof Error ? e.message : String(e)}`);
      });
  }

  /** fold one attack's rewards into the counters + evaluate the loot-driven mandatory stops (rare / bag full). */
  private applyAttack(o: BotAttackOutcome): void {
    this.counters.killCount += o.killed;
    this.counters.goldEarned += Math.max(0, Math.round(o.gold));
    this.counters.expEarned += Math.max(0, Math.round(o.exp));
    for (const line of o.loot) {
      this.counters.drops[line.itemId] = (this.counters.drops[line.itemId] ?? 0) + line.quantity;
    }
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
    this.flush({ stoppedAt: Date.now(), stopReason: reason });
    this.d.host.botRemove(this.d.sessionId);
    const stopped: BotStoppedMessage = {
      profileId: this.d.profileId,
      sessionId: this.d.sessionRowId,
      reason,
      killCount: this.counters.killCount,
      goldEarned: this.counters.goldEarned,
      expEarned: this.counters.expEarned,
    };
    this.d.host.botOwnerSend(this.d.accountId, MSG_BOT_STOPPED, stopped);
    this.d.onStopped(this.d.accountId);
  }

  private pushStatus(action: string): void {
    const pos = this.d.host.botPos(this.d.sessionId);
    const msg: BotStatusMessage = {
      profileId: this.d.profileId,
      sessionId: this.d.sessionRowId,
      mapId: this.d.mapId,
      pocketId: this.d.pocketId,
      action: pos ? action : "searching",
      killCount: this.counters.killCount,
      goldEarned: this.counters.goldEarned,
      expEarned: this.counters.expEarned,
      hpFraction: this.d.host.botHpFraction(this.d.sessionId),
      uptimeMs: Date.now() - this.d.startedAtMs,
    };
    this.d.host.botOwnerSend(this.d.accountId, MSG_BOT_STATUS, msg);
  }

  /** best-effort DB flush of the live counters (+ optional stop). */
  private flush(stop: { stoppedAt: number; stopReason: BotStopReason } | null): void {
    void this.d.sessionRepo
      .patch(this.d.sessionRowId, { ...this.counters, drops: { ...this.counters.drops } }, stop)
      .catch((e: unknown) => {
        console.error(`[bot ${this.d.sessionRowId}] flush error: ${e instanceof Error ? e.message : String(e)}`);
      });
  }
}
