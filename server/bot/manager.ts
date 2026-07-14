// Batch 7b-server — BotManager: process singleton that owns tier/profile/report persistence, the running bot
// sessions, the concurrency cap, and the wire ops. Rooms register on create (hosts by mapId) and are ticked by
// their own sim loop. Bots run only while the process lives (Render free, D-058); on boot every still-open
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
import { loadCharacterClass, loadCharacterProgress } from "../characters/character-state";
import { DEFAULT_BOT_CONFIG, type BotConfig } from "../config/bot";
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
  loadProgress: (characterId: string) => Promise<{ level: number; exp: number } | null>;
  loadClass: (characterId: string) => Promise<string | null>;
}

export class BotManager {
  private readonly d: BotManagerDeps;
  private readonly roomsByMap = new Map<string, Set<BotHost>>();
  private readonly bots = new Map<string, BotRuntime>(); // accountId → runtime (one running bot per account)
  private readonly sessionToAccount = new Map<string, string>(); // virtual sessionId → accountId
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
  onBotDied(sessionId: string): void {
    const accountId = this.sessionToAccount.get(sessionId);
    if (accountId) this.bots.get(accountId)?.stop("death");
  }

  /** called by a runtime when it stops (any reason) → drop it. */
  private dropRuntime(accountId: string): void {
    const rt = this.bots.get(accountId);
    if (rt) this.sessionToAccount.delete(rt.sessionId);
    this.bots.delete(accountId);
  }

  private pickHost(mapId: string): BotHost | null {
    const set = this.roomsByMap.get(mapId);
    if (!set || set.size === 0) return null;
    return set.values().next().value ?? null;
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
    accountId: string | null,
    characterId: string | null,
    send: Send,
    m: BotStartMessage,
  ): Promise<void> {
    if (!accountId || !this.guardDb(send, "start")) return;
    if (!characterId) return this.reject(send, "start", "no_character");
    if (this.bots.has(accountId)) return this.reject(send, "start", "already_running");
    if (this.bots.size >= this.d.config.maxConcurrentBots) return this.reject(send, "start", "at_capacity");

    const tier = await this.resolveTierFor(accountId);
    const profile = await this.d.profileRepo.getById(accountId, m?.profileId);
    if (!profile) return this.reject(send, "start", "not_found", m?.profileId);

    const all = await this.d.profileRepo.listByAccount(accountId);
    const view = markReadOnlyExcess(all, tier, this.d.config).find((v) => v.id === profile.id);
    if (view?.readOnly) return this.reject(send, "start", "profile_readonly", profile.id);
    if (!isBotAllowedPocket(profile.mapId, profile.pocketId, this.d.config)) {
      return this.reject(send, "start", "pocket_not_allowed", profile.id);
    }

    const host = profile.mapId === requestHost.mapId ? requestHost : this.pickHost(profile.mapId);
    if (!host) return this.reject(send, "start", "no_room", profile.id);

    const progress = (await this.d.loadProgress(characterId)) ?? { level: 1, exp: 0 };
    const classId = (await this.d.loadClass(characterId)) ?? "swordsman";
    const now = this.d.now();
    const sessionRowId = randomUUID();
    const sessionId = `bot#${sessionRowId}`;

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
      return this.reject(send, "start", "db_error", profile.id);
    }

    const spawned = host.botSpawn({
      sessionId,
      accountId,
      characterId,
      profileId: profile.id,
      classId,
      level: progress.level,
      exp: progress.exp,
      allowedSlots: profile.rules.skillSlots,
      pocketId: profile.pocketId,
    });
    if (!spawned) {
      await this.d.sessionRepo
        .patch(sessionRowId, { killCount: 0, goldEarned: 0, expEarned: 0, drops: {} }, { stoppedAt: now, stopReason: "map_unsafe" })
        .catch(() => {});
      return this.reject(send, "start", "spawn_failed", profile.id);
    }

    const runtime = new BotRuntime({
      host,
      config: this.d.config,
      sessionRepo: this.d.sessionRepo,
      rarityOf: this.d.rarityOf,
      sessionRowId,
      accountId,
      characterId,
      profileId: profile.id,
      sessionId,
      mapId: profile.mapId,
      pocketId: profile.pocketId,
      rules: profile.rules,
      baseCooldownSeconds: host.botBaseCooldownSeconds(sessionId),
      startedAtMs: now,
      onStopped: (acc) => this.dropRuntime(acc),
    });
    this.bots.set(accountId, runtime);
    this.sessionToAccount.set(sessionId, accountId);
    this.ack(send, "start", profile.id);
  }

  onStop(accountId: string | null, send: Send, _m: BotStopMessage): void {
    if (!accountId) return;
    const rt = this.bots.get(accountId);
    if (!rt) return this.reject(send, "stop", "not_running");
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
  loadProgress: (characterId) => loadCharacterProgress(characterId),
  loadClass: (characterId) => loadCharacterClass(characterId),
});

/** rarity lookup resolved from the item catalog (server-only) for the rare-drop stop. */
function rarityLookup(itemId: string): string | undefined {
  return ITEM_CATALOG.get(itemId)?.rarity;
}
