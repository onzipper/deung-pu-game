// Character Autonomy manager: process singleton that owns tier/profile/report persistence and server controllers
// attached to real character actors. Rooms register on create and tick their attached controllers in the room sim.
// Controllers run only while the process lives (Render free, D-058); on boot every still-open
// session is closed as `server_restart` and NOT auto-resumed (owner restarts manually — simplest correct v1).
//
// ⛔ SERVER-ONLY. Bots require a DB (they mutate the audited economy) — every op rejects `requires_db` with none.

import { randomUUID } from "node:crypto";
import {
  MSG_BOT_OP_RESULT,
  MSG_BOT_PROFILES,
  MSG_BOT_REPORT,
  MSG_BOT_REPORTS,
  MSG_BOT_TIER_STATE,
  type BotMockPurchaseMessage,
  type BotOpResultMessage,
  type BotProfileCreateMessage,
  type BotProfileDeleteMessage,
  type BotProfilesMessage,
  type BotProfileUpdateMessage,
  type BotReportFetchMessage,
  type BotReportMessage,
  type BotReportsMessage,
  type BotStartMessage,
  type BotStopMessage,
  type BotTierStateMessage,
  type BotTierWire,
} from "../../src/shared/net-protocol";
import { DEFAULT_BOT_CONFIG, type BotConfig, type BotStopReason } from "../config/bot";
import { ITEM_CATALOG } from "../inventory/inventory-state";
import {
  createProfile,
  deleteProfile,
  isBotAllowedPocket,
  listProfiles,
  markReadOnlyExcess,
  updateProfile,
  type ProfileRepo,
} from "./profiles";
import { fetchReport, listReports } from "./reports";
import { BotRuntime, type BotHost } from "./runtime";
import {
  botPersistenceAvailable,
  prismaProfileRepo,
  prismaSessionRepo,
  prismaTierRepo,
  type SessionRepo,
  type TierRepo,
} from "./store";
import { applyMockPurchase, capsFor, resolveTier } from "./tier";

type Send = (type: string, msg: unknown) => void;

export interface BotManagerDeps {
  config: BotConfig;
  tierRepo: TierRepo;
  profileRepo: ProfileRepo;
  sessionRepo: SessionRepo;
  /** rarity lookup for the rare-drop stop (itemId → rarity band). */
  rarityOf: (itemId: string) => string | undefined;
  /** best-effort DB gate — every op rejects when false. */
  dbAvailable: () => boolean;
  /** clock (DI for tests). */
  now: () => number;
}

export class BotManager {
  private readonly d: BotManagerDeps;
  private readonly roomsByMap = new Map<string, Set<BotHost>>();
  private readonly bots = new Map<string, BotRuntime>(); // accountId → runtime (one running bot per account)
  private readonly actorToAccount = new Map<string, string>(); // stable character actorId → accountId
  /** Synchronous reservation closes the async start TOCTOU before tier/profile/DB awaits. */
  private readonly startingAccounts = new Set<string>();
  /** Claimed actors awaiting the bot-session insert still need reconnect routing and duplicate protection. */
  private readonly startingActors = new Map<
    string,
    { actorId: string; characterId: string; roomId: string; host: BotHost }
  >();
  private readonly cancelledStarts = new Map<string, BotStopReason>();
  private booted = false;

  constructor(deps: BotManagerDeps) {
    this.d = deps;
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  /** on process boot: close orphaned sessions (server_restart) — do NOT auto-resume (v1). Idempotent. */
  async onBoot(): Promise<void> {
    if (this.booted || !this.d.dbAvailable()) return;
    this.booted = true;
    try {
      const closed = await this.d.sessionRepo.markOpenAsRestart(this.d.now());
      if (closed > 0) console.log(`[bot] boot: closed ${closed} orphaned session(s) as server_restart`);
    } catch (e) {
      console.error(`[bot] boot cleanup error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  registerRoom(host: BotHost): void {
    let set = this.roomsByMap.get(host.mapId);
    if (!set) this.roomsByMap.set(host.mapId, (set = new Set()));
    set.add(host);
  }

  unregisterRoom(host: BotHost): void {
    // stop every bot hosted by this disposing room (safe stop — sessions row keeps the truth).
    for (const rt of [...this.bots.values()]) {
      if (rt.host === host) rt.stop("server_restart");
    }
    this.roomsByMap.get(host.mapId)?.delete(host);
  }

  /** called from the host room's sim tick — advance every bot this room hosts. */
  tickRoom(host: BotHost, dtMs: number): void {
    for (const rt of this.bots.values()) {
      if (rt.host === host && !rt.isStopped) rt.tick(dtMs);
    }
  }

  /** the host contact path reports a bot death → stop it (mandatory stop #3). */
  onBotDied(actorId: string): void {
    const accountId = this.actorToAccount.get(actorId);
    if (accountId) {
      this.bots.get(accountId)?.stop("death");
      return;
    }
    for (const [startingAccountId, presence] of this.startingActors) {
      if (presence.actorId === actorId) {
        this.cancelPendingStart(startingAccountId, "death");
        return;
      }
    }
  }

  /** called by a runtime when it stops (any reason) → drop it. */
  private dropRuntime(accountId: string): void {
    const rt = this.bots.get(accountId);
    if (rt) this.actorToAccount.delete(rt.actorId);
    this.bots.delete(accountId);
  }

  /** Authenticated reconnect routing. Never returns another account's actor. */
  activeActorForAccount(accountId: string): {
    actorId: string;
    characterId: string;
    roomId: string;
    host: BotHost;
  } | null {
    const rt = this.bots.get(accountId);
    if (rt) {
      return { actorId: rt.actorId, characterId: rt.characterId, roomId: rt.host.roomId, host: rt.host };
    }
    return this.startingActors.get(accountId) ?? null;
  }

  private cancelPendingStart(accountId: string, reason: BotStopReason): boolean {
    if (!this.startingAccounts.has(accountId)) return false;
    this.cancelledStarts.set(accountId, reason);
    const presence = this.startingActors.get(accountId);
    if (presence) {
      this.startingActors.delete(accountId);
      presence.host.botReleaseAuthority(presence.actorId);
    }
    return true;
  }

  // ── shared reply helpers ─────────────────────────────────────────────────────

  private reject(send: Send, op: string, reason: string, refId?: string): void {
    const msg: BotOpResultMessage = { op, ok: false, reason, refId };
    send(MSG_BOT_OP_RESULT, msg);
  }
  private ack(send: Send, op: string, refId?: string): void {
    const msg: BotOpResultMessage = { op, ok: true, refId };
    send(MSG_BOT_OP_RESULT, msg);
  }

  private async resolveTierFor(accountId: string): Promise<BotTierWire> {
    const row = await this.d.tierRepo.get(accountId);
    return resolveTier(row, this.d.now()).tier;
  }

  private async sendTierState(accountId: string, send: Send): Promise<void> {
    const row = await this.d.tierRepo.get(accountId);
    const resolved = resolveTier(row, this.d.now());
    const caps = capsFor(resolved.tier, this.d.config);
    const all = await this.d.profileRepo.listByAccount(accountId);
    const views = markReadOnlyExcess(all, resolved.tier, this.d.config);
    const msg: BotTierStateMessage = {
      tier: resolved.tier,
      passExpiresAt: resolved.passExpiresAt,
      caps: {
        profiles: caps.profiles,
        rules: caps.rules,
        reportRetentionDays: caps.reportRetentionDays,
        notifications: caps.notifications,
        schedules: caps.schedules,
        analytics: caps.analytics,
      },
      pausedProfileIds: views.filter((v) => v.readOnly).map((v) => v.id),
    };
    send(MSG_BOT_TIER_STATE, msg);
  }

  private async sendProfiles(accountId: string, send: Send): Promise<void> {
    const tier = await this.resolveTierFor(accountId);
    const views = await listProfiles(this.d.profileRepo, accountId, tier, this.d.config);
    const msg: BotProfilesMessage = {
      profiles: views.map((v) => ({
        id: v.id,
        name: v.name,
        mapId: v.mapId,
        pocketId: v.pocketId,
        rules: v.rules,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
        readOnly: v.readOnly,
      })),
    };
    send(MSG_BOT_PROFILES, msg);
  }

  private guardDb(send: Send, op: string): boolean {
    if (!this.d.dbAvailable()) {
      this.reject(send, op, "requires_db");
      return false;
    }
    return true;
  }

  // ── profile CRUD ─────────────────────────────────────────────────────────────

  async onProfileList(accountId: string | null, send: Send): Promise<void> {
    if (!accountId || !this.guardDb(send, "profileList")) return;
    await this.sendTierState(accountId, send);
    await this.sendProfiles(accountId, send);
  }

  async onProfileCreate(accountId: string | null, send: Send, m: BotProfileCreateMessage): Promise<void> {
    if (!accountId || !this.guardDb(send, "profileCreate")) return;
    const tier = await this.resolveTierFor(accountId);
    const res = await createProfile(
      this.d.profileRepo,
      tier,
      { accountId, name: m?.name, mapId: m?.mapId, pocketId: m?.pocketId, rawRules: m?.rules },
      this.d.now(),
      this.d.config,
    );
    if (!res.ok) return this.reject(send, "profileCreate", res.reason);
    this.ack(send, "profileCreate", res.profile.id);
    await this.sendProfiles(accountId, send);
  }

  async onProfileUpdate(accountId: string | null, send: Send, m: BotProfileUpdateMessage): Promise<void> {
    if (!accountId || !this.guardDb(send, "profileUpdate")) return;
    const tier = await this.resolveTierFor(accountId);
    const res = await updateProfile(
      this.d.profileRepo,
      tier,
      { accountId, id: m?.id, name: m?.name, mapId: m?.mapId, pocketId: m?.pocketId, rawRules: m?.rules },
      this.d.now(),
      this.d.config,
    );
    if (!res.ok) return this.reject(send, "profileUpdate", res.reason, m?.id);
    this.ack(send, "profileUpdate", res.profile.id);
    await this.sendProfiles(accountId, send);
  }

  async onProfileDelete(accountId: string | null, send: Send, m: BotProfileDeleteMessage): Promise<void> {
    if (!accountId || !this.guardDb(send, "profileDelete")) return;
    this.cancelPendingStart(accountId, "manual");
    // stop a running bot on this profile first (frees the slot cleanly).
    const running = this.bots.get(accountId);
    if (running) running.stop("manual");
    const res = await deleteProfile(this.d.profileRepo, accountId, m?.id);
    if (!res.ok) return this.reject(send, "profileDelete", res.reason, m?.id);
    this.ack(send, "profileDelete", m?.id);
    await this.sendProfiles(accountId, send);
  }

  // ── MOCK purchase (D-061) ────────────────────────────────────────────────────

  async onMockPurchase(accountId: string | null, send: Send, m: BotMockPurchaseMessage): Promise<void> {
    if (!accountId || !this.guardDb(send, "mockPurchase")) return;
    const current = await this.d.tierRepo.get(accountId);
    const res = applyMockPurchase(current, { tier: m?.tier, days: m?.days }, this.d.now(), this.d.config);
    if (!res.ok) return this.reject(send, "mockPurchase", res.reason);
    await this.d.tierRepo.upsert({ accountId, ...res.row });
    this.ack(send, "mockPurchase");
    await this.sendTierState(accountId, send);
    await this.sendProfiles(accountId, send); // read-only flags may change (upgrade un-pauses excess)
  }

  // ── start / stop ─────────────────────────────────────────────────────────────

  async onStart(
    requestHost: BotHost,
    controllerSessionId: string,
    accountId: string | null,
    characterId: string | null,
    send: Send,
    m: BotStartMessage,
  ): Promise<void> {
    if (!accountId || !this.guardDb(send, "start")) return;
    if (!characterId) return this.reject(send, "start", "no_character");
    if (this.bots.has(accountId) || this.startingAccounts.has(accountId)) {
      return this.reject(send, "start", "already_running");
    }
    if (this.bots.size + this.startingAccounts.size >= this.d.config.maxConcurrentBots) {
      return this.reject(send, "start", "at_capacity");
    }
    this.startingAccounts.add(accountId);

    try {
      await this.startReserved(requestHost, controllerSessionId, accountId, characterId, send, m);
    } finally {
      this.startingAccounts.delete(accountId);
      this.startingActors.delete(accountId);
      this.cancelledStarts.delete(accountId);
    }
  }

  private async startReserved(
    requestHost: BotHost,
    controllerSessionId: string,
    accountId: string,
    characterId: string,
    send: Send,
    m: BotStartMessage,
  ): Promise<void> {

    const tier = await this.resolveTierFor(accountId);
    if (this.cancelledStarts.has(accountId)) return this.reject(send, "start", "cancelled", m?.profileId);
    const profile = await this.d.profileRepo.getById(accountId, m?.profileId);
    if (!profile) return this.reject(send, "start", "not_found", m?.profileId);

    const all = await this.d.profileRepo.listByAccount(accountId);
    if (this.cancelledStarts.has(accountId)) return this.reject(send, "start", "cancelled", profile.id);
    const view = markReadOnlyExcess(all, tier, this.d.config).find((v) => v.id === profile.id);
    if (view?.readOnly) return this.reject(send, "start", "profile_readonly", profile.id);
    if (!isBotAllowedPocket(profile.mapId, profile.pocketId, this.d.config)) {
      return this.reject(send, "start", "pocket_not_allowed", profile.id);
    }

    // Character Autonomy controls the actor where it actually stands. A profile can never teleport it into a
    // different room/map or choose an unrelated host.
    if (profile.mapId !== requestHost.mapId) {
      return this.reject(send, "start", "character_not_in_profile_map", profile.id);
    }
    if (this.cancelledStarts.has(accountId)) return this.reject(send, "start", "cancelled", profile.id);

    const actorId = requestHost.botClaimAuthority({
      controllerSessionId,
      accountId,
      characterId,
      profileId: profile.id,
      allowedSlots: profile.rules.skillSlots,
      pocketId: profile.pocketId,
    });
    if (!actorId) return this.reject(send, "start", "actor_not_available", profile.id);
    this.startingActors.set(accountId, {
      actorId,
      characterId,
      roomId: requestHost.roomId,
      host: requestHost,
    });
    if (this.cancelledStarts.has(accountId)) {
      this.startingActors.delete(accountId);
      requestHost.botReleaseAuthority(actorId);
      return this.reject(send, "start", "cancelled", profile.id);
    }

    const now = this.d.now();
    const sessionRowId = randomUUID();

    try {
      await this.d.sessionRepo.insert({
        id: sessionRowId,
        accountId,
        characterId,
        profileId: profile.id,
        mapId: profile.mapId,
        startedAt: now,
        stoppedAt: null,
        stopReason: null,
        killCount: 0,
        goldEarned: 0,
        expEarned: 0,
        drops: {},
        updatedAt: now,
      });
    } catch {
      if (this.startingActors.delete(accountId)) requestHost.botReleaseAuthority(actorId);
      return this.reject(send, "start", "db_error", profile.id);
    }

    const cancelledReason = this.cancelledStarts.get(accountId);
    if (cancelledReason) {
      if (this.startingActors.delete(accountId)) requestHost.botReleaseAuthority(actorId);
      try {
        await this.d.sessionRepo.patch(
          sessionRowId,
          { killCount: 0, goldEarned: 0, expEarned: 0, drops: {} },
          { stoppedAt: this.d.now(), stopReason: cancelledReason },
        );
      } catch {
        // The session row exists; boot cleanup remains a final safety net if this best-effort close fails.
      }
      return this.reject(send, "start", "cancelled", profile.id);
    }

    const runtime = new BotRuntime({
      host: requestHost,
      config: this.d.config,
      sessionRepo: this.d.sessionRepo,
      rarityOf: this.d.rarityOf,
      sessionRowId,
      accountId,
      characterId,
      profileId: profile.id,
      actorId,
      mapId: profile.mapId,
      pocketId: profile.pocketId,
      rules: profile.rules,
      baseCooldownSeconds: requestHost.botBaseCooldownSeconds(actorId),
      startedAtMs: now,
      onStopped: (acc) => this.dropRuntime(acc),
    });
    this.bots.set(accountId, runtime);
    this.actorToAccount.set(actorId, accountId);
    this.startingActors.delete(accountId);
    this.ack(send, "start", profile.id);
  }

  onStop(accountId: string | null, send: Send, _m: BotStopMessage): void {
    if (!accountId) return;
    const rt = this.bots.get(accountId);
    if (!rt) {
      if (this.cancelPendingStart(accountId, "manual")) return this.ack(send, "stop");
      return this.reject(send, "stop", "not_running");
    }
    rt.stop("manual");
    this.ack(send, "stop");
  }

  // ── reports ──────────────────────────────────────────────────────────────────

  async onReportList(accountId: string | null, send: Send): Promise<void> {
    if (!accountId || !this.guardDb(send, "reportList")) return;
    const tier = await this.resolveTierFor(accountId);
    const rows = await this.d.sessionRepo.listByAccount(accountId);
    const reports = listReports(rows, tier, this.d.now(), this.d.config);
    const msg: BotReportsMessage = { reports };
    send(MSG_BOT_REPORTS, msg);
  }

  async onReportFetch(accountId: string | null, send: Send, m: BotReportFetchMessage): Promise<void> {
    if (!accountId || !this.guardDb(send, "reportFetch")) return;
    const tier = await this.resolveTierFor(accountId);
    const row = await this.d.sessionRepo.getById(accountId, m?.id);
    const detail = fetchReport(row, tier, this.d.now(), this.d.config);
    const msg: BotReportMessage = { report: detail };
    send(MSG_BOT_REPORT, msg);
  }
}

/**
 * The process singleton (mirrors channelRegistry). Wired to the Prisma repos + the item-catalog rarity lookup.
 * The rarity lookup is injected lazily to avoid a static import cycle (item-catalog ← inventory ← economy).
 */
export const botManager = new BotManager({
  config: DEFAULT_BOT_CONFIG,
  tierRepo: prismaTierRepo,
  profileRepo: prismaProfileRepo,
  sessionRepo: prismaSessionRepo,
  rarityOf: (itemId) => rarityLookup(itemId),
  dbAvailable: botPersistenceAvailable,
  now: () => Date.now(),
});

/** rarity lookup resolved from the item catalog (server-only) for the rare-drop stop. */
function rarityLookup(itemId: string): string | undefined {
  return ITEM_CATALOG.get(itemId)?.rarity;
}
