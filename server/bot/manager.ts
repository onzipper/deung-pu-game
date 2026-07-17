// Character Autonomy manager: process singleton that owns tier/profile/report persistence and server controllers
// attached to real character actors. Rooms register on create and tick their attached controllers in the room sim.
// Controllers run only while the process lives (Render free, D-058); on boot every still-open
// session is closed as `server_restart` and NOT auto-resumed (owner restarts manually — simplest correct v1).
//
// ⛔ SERVER-ONLY. Bots require a DB (they mutate the audited economy) — every op rejects `requires_db` with none.

import { randomUUID } from "node:crypto";
import { matchMaker } from "colyseus";
import {
  MAP_ROOM_NAME,
  MSG_BOT_CHECKPOINT,
  MSG_BOT_OP_RESULT,
  MSG_BOT_PROFILES,
  MSG_BOT_REPORT,
  MSG_BOT_REPORTS,
  MSG_BOT_TIER_STATE,
  type BotCheckpointMessage,
  type BotCheckpointWire,
  type BotMockPurchaseMessage,
  type BotOpResultMessage,
  type BotProfileCreateMessage,
  type BotProfileDeleteMessage,
  type BotProfilesMessage,
  type BotProfileUpdateMessage,
  type BotReportFetchMessage,
  type BotReportMessage,
  type BotReportsMessage,
  type BotResumeMessage,
  type BotStartMessage,
  type BotStopMessage,
  type BotTakeoverMessage,
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
import { BotRuntime, type BotBagItemView, type BotHost } from "./runtime";
import { DEFAULT_INVENTORY_CAPACITY } from "../../src/server/inventory/item-catalog";
import {
  botPersistenceAvailable,
  prismaCheckpointRepo,
  prismaProfileRepo,
  prismaSessionRepo,
  prismaTierRepo,
  type CheckpointRepo,
  type SessionRepo,
  type TierRepo,
} from "./store";
import { applyMockPurchase, buildBotTierPlans, capsFor, resolveTier } from "./tier";
import type { ResolveRuleTargetCtx } from "./profiles";
import { getMap } from "../../src/engine/map/registry";
import { mobClassForMobType } from "../economy/kill-rewards";
import {
  applyBotContinuityTransition,
  createBotContinuity,
  toBotContinuityWire,
  type BotContinuitySnapshot,
} from "./continuity";

type Send = (type: string, msg: unknown) => void;

/**
 * Free bag slots for the proactive town-trip preflight = capacity − occupied (non-equipped) bag instances.
 * Mirrors the trip controller's route-home success math (town-trip.ts: capacity − bag.filter(!equipped).length)
 * so the proactive preflight and the trip's own resume criterion agree on what "full" means. Pure — unit-tested.
 */
export function freeBagSlots(bag: readonly BotBagItemView[], capacity: number): number {
  let occupied = 0;
  for (const item of bag) if (!item.equipped) occupied += 1;
  return capacity - occupied;
}

interface StoredCheckpoint extends BotCheckpointWire {
  accountId: string;
  characterId: string;
  /**
   * The live host at capture time (a takeover checkpoint only). Absent on a checkpoint hydrated from the durable
   * store after a restart — that fresh process has no live host, and a hydrated checkpoint is never settled.
   */
  host?: BotHost;
  /**
   * The live runtime whose actor this checkpoint captured (a running-bot takeover only; absent for a pending-start
   * takeover, which never moved the actor). Read at settle time to reconcile `mapId` with where the actor really
   * paused: a mid-trip takeover whose return warp failed lands PAUSED in place at the city-hub, so the checkpoint
   * must tell the truth about the current host rather than the profile's farm map (D-069).
   */
  runtime?: BotRuntime;
  /** PR6b: the Pro goal-chain cursor captured at checkpoint time; resume restarts at this step (counters reset). */
  workflow?: { stepIndex: number };
}

interface StartingActorPresence {
  actorId: string;
  characterId: string;
  roomId: string;
  host: BotHost;
  profileId: string;
  sourceSessionId: string;
  mapId: string;
  pocketId: string;
  continuity: BotContinuitySnapshot;
}

export interface BotManagerDeps {
  config: BotConfig;
  tierRepo: TierRepo;
  profileRepo: ProfileRepo;
  sessionRepo: SessionRepo;
  /**
   * PR6a (D-067): durable checkpoint store for restart resume. Optional — absent = no durable persistence (the
   * in-process Map stays the sole authority, every tier's behavior byte-identical to pre-PR6a). The recovery/warp
   * unit suites omit it; the process singleton wires the Prisma repo.
   */
  checkpointRepo?: CheckpointRepo;
  /** Rarity lookup for ordinary-rare notification and future plan-selected actions. */
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
  /** Accounts whose accepted reward/report close is still draining after manual takeover. */
  private readonly drainingAccounts = new Set<string>();
  /** In-process only in PR2; durable restart resume remains explicitly owned by PR6. */
  private readonly checkpoints = new Map<string, StoredCheckpoint>();
  private readonly actorToAccount = new Map<string, string>(); // stable character actorId → accountId
  /** Synchronous reservation closes the async start TOCTOU before tier/profile/DB awaits. */
  private readonly startingAccounts = new Set<string>();
  /** Requested profile id exists before actor claim, so deleting another profile cannot cancel this start. */
  private readonly startingProfileIds = new Map<string, string>();
  /** Claimed actors awaiting the bot-session insert still need reconnect routing and duplicate protection. */
  private readonly startingActors = new Map<string, StartingActorPresence>();
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
    // PR6a (D-067): every durable running snapshot that survived into this fresh process crossed the restart →
    // becomes a `restart` resume candidate (Pro-only, re-gated at surface time). Takeover rows stay as-is; they are
    // re-stamped `restart` in memory when hydrated (a hydrated checkpoint always crossed a restart).
    if (this.d.checkpointRepo) {
      try {
        const swept = await this.d.checkpointRepo.markRunningAsRestart();
        if (swept > 0) console.log(`[bot] boot: marked ${swept} running checkpoint(s) as restart`);
      } catch (e) {
        console.error(`[bot] boot checkpoint sweep error: ${e instanceof Error ? e.message : String(e)}`);
      }
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

  /** Host reports actor death; the running runtime settles it per tier (Free stops, paid may recover — PR5). */
  onBotDied(actorId: string): void {
    const accountId = this.actorToAccount.get(actorId);
    if (accountId) {
      this.bots.get(accountId)?.onActorDied();
      return;
    }
    for (const [startingAccountId, presence] of this.startingActors) {
      if (presence.actorId === actorId) {
        this.cancelPendingStart(startingAccountId, "death");
        return;
      }
    }
  }

  /** called by a runtime when it stops (any reason) → drop only that generation. */
  private dropRuntime(accountId: string, sessionRowId: string): void {
    const rt = this.bots.get(accountId);
    if (!rt || rt.sessionRowId !== sessionRowId) return;
    this.actorToAccount.delete(rt.actorId);
    this.bots.delete(accountId);
  }

  private checkpointMessage(checkpoint: StoredCheckpoint | null): BotCheckpointMessage {
    if (!checkpoint) return { checkpoint: null };
    const { id, profileId, sourceSessionId, mapId, pocketId, savedAt, state, continuity, kind, workflow } =
      checkpoint;
    return {
      checkpoint: { id, profileId, sourceSessionId, mapId, pocketId, savedAt, state, continuity, kind, workflow },
    };
  }

  private settleTakeoverCheckpoint(accountId: string, checkpointId: string, saved: boolean): void {
    this.drainingAccounts.delete(accountId);
    const checkpoint = this.checkpoints.get(accountId);
    if (!checkpoint || checkpoint.id !== checkpointId) return;
    // Reconcile the checkpoint's map with where the actor actually paused (D-069). The profile's farm map was
    // stamped at takeover time; a mid-trip takeover whose return warp failed pauses in place at the city-hub, so
    // read the runtime's CURRENT host and tell the truth. The normal farm-landing path leaves this identical (the
    // runtime's host is already the farm map), and pocketId stays the plan's assigned pocket (unchanged by a trip).
    if (saved && checkpoint.runtime) checkpoint.mapId = checkpoint.runtime.host.mapId;
    checkpoint.state = saved ? "ready" : "failed";
    // PR6a (D-067): a ready takeover checkpoint is persisted durably so a Pro owner can resume it across a restart
    // (Pro-only — the persist re-resolves the tier and drops the write for any other tier). Write-behind: the
    // in-process Map above stays authority; a persist failure never affects the in-process settle.
    if (saved) this.persistTakeoverCheckpoint(checkpoint);
    // Fan out across every registered host: after a warp the owner's transport may sit in a sibling room, not
    // checkpoint.host. Fall back to the stored host when the fan-out reaches nobody (owner offline, or the host
    // was never registered) so the last-known channel still gets the update.
    const message = this.checkpointMessage(checkpoint);
    if (!this.ownerSend(accountId, MSG_BOT_CHECKPOINT, message)) {
      checkpoint.host?.botOwnerSend(accountId, MSG_BOT_CHECKPOINT, message);
    }
  }

  // ── PR6a durable checkpoint persistence (D-067) ───────────────────────────────────────────────────────────
  // Write-behind, best-effort: the in-process `checkpoints` Map is authority while the process lives; these rows
  // exist ONLY to cross a server restart. A DB failure logs and is swallowed — it never breaks the in-process flow.

  private checkpointError(op: string, e: unknown): void {
    console.error(`[bot] checkpoint ${op} error: ${e instanceof Error ? e.message : String(e)}`);
  }

  /** Persist a ready takeover checkpoint (Pro-only). Fire-and-forget: resolves the tier, then upserts kind='takeover'. */
  private persistTakeoverCheckpoint(checkpoint: StoredCheckpoint): void {
    const repo = this.d.checkpointRepo;
    if (!repo) return;
    void (async () => {
      try {
        if ((await this.resolveTierFor(checkpoint.accountId)) !== "pro") return;
        await repo.upsert({
          accountId: checkpoint.accountId,
          id: checkpoint.id,
          characterId: checkpoint.characterId,
          profileId: checkpoint.profileId,
          sourceSessionId: checkpoint.sourceSessionId,
          mapId: checkpoint.mapId,
          pocketId: checkpoint.pocketId,
          kind: "takeover",
          state: "ready",
          continuity: checkpoint.continuity,
          workflow: checkpoint.workflow,
          savedAt: checkpoint.savedAt,
        });
      } catch (e) {
        this.checkpointError("persist takeover", e);
      }
    })();
  }

  /**
   * Persist a live Pro run's durable snapshot (kind='running'). The runtime pre-gates on the live Pro tier, so no
   * tier re-resolve here — reads the runtime's current farm map + active pocket + continuity. Fire-and-forget.
   */
  private persistRunningCheckpoint(accountId: string): void {
    const repo = this.d.checkpointRepo;
    if (!repo) return;
    const rt = this.bots.get(accountId);
    if (!rt || rt.isStopped) return;
    const snap = rt.runningCheckpoint;
    void repo
      .upsert({
        accountId,
        id: rt.sessionRowId, // stable per-run id (also the sourceSessionId) — a new run re-upserts fresh
        characterId: rt.characterId,
        profileId: rt.profileId,
        sourceSessionId: rt.sessionRowId,
        mapId: snap.mapId,
        pocketId: snap.pocketId,
        kind: "running",
        state: "ready",
        continuity: snap.continuity,
        workflow: snap.workflow,
        savedAt: this.d.now(),
      })
      .catch((e: unknown) => this.checkpointError("persist running", e));
  }

  /** Best-effort delete of the durable checkpoint row (start/resume supersedes it; a non-Pro hydrate drops it). */
  private async deleteCheckpointRow(accountId: string): Promise<void> {
    if (!this.d.checkpointRepo) return;
    try {
      await this.d.checkpointRepo.remove(accountId);
    } catch (e) {
      this.checkpointError("delete", e);
    }
  }

  /** Drop both the in-memory checkpoint and the durable row (no wire push — the caller sends the null itself). */
  private async dropCheckpoint(accountId: string): Promise<void> {
    this.checkpoints.delete(accountId);
    await this.deleteCheckpointRow(accountId);
  }

  /**
   * Read the durable checkpoint row into the in-memory Map (no tier gate here — the Pro gate + row delete live at
   * each surface: {@link sendCheckpoint} and {@link onResume}). Stamps kind='restart' because a row present with no
   * in-memory entry means this process restarted since it was written. Returns null on miss/error.
   */
  private async hydrateCheckpoint(accountId: string): Promise<StoredCheckpoint | null> {
    const repo = this.d.checkpointRepo;
    if (!repo) return null;
    let row;
    try {
      row = await repo.get(accountId);
    } catch (e) {
      this.checkpointError("hydrate", e);
      return null;
    }
    if (!row) return null;
    const hydrated: StoredCheckpoint = {
      id: row.id,
      accountId: row.accountId,
      characterId: row.characterId,
      profileId: row.profileId,
      sourceSessionId: row.sourceSessionId,
      mapId: row.mapId,
      pocketId: row.pocketId,
      savedAt: row.savedAt,
      state: row.state,
      continuity: row.continuity,
      kind: "restart",
      workflow: row.workflow,
    };
    this.checkpoints.set(accountId, hydrated);
    return hydrated;
  }

  /**
   * The checkpoint to surface for this account: the in-memory one, or a durable row hydrated ONLY when nothing is
   * live. A running/starting bot means the process never restarted, so its periodic running-row is a diagnostic
   * snapshot, never a resume candidate — surfacing it while the bot runs would offer a bogus resume.
   */
  private async surfaceCheckpoint(accountId: string): Promise<StoredCheckpoint | null> {
    const inMemory = this.checkpoints.get(accountId);
    if (inMemory) return inMemory;
    if (this.bots.has(accountId) || this.startingAccounts.has(accountId)) return null;
    return this.hydrateCheckpoint(accountId);
  }

  /**
   * PR5 Phase B (D-069): deliver an owner-directed message across every registered host. The owner's transport can
   * be attached to a sibling room after a server-owned warp, so a single stored host is no longer authoritative.
   * Returns true once any host delivers it (each host sends only to its own connected owner clients).
   */
  ownerSend(accountId: string, type: string, message: unknown): boolean {
    for (const hosts of this.roomsByMap.values()) {
      for (const host of hosts) {
        if (host.botOwnerSend(accountId, type, message)) return true;
      }
    }
    return false;
  }

  /**
   * PR5 Phase B (D-069): find (or create) a SOLO host MapRoom for `mapId` to receive a warped actor. Party channels
   * are never warp targets. Does NOT reserve a seat — the trip controller reserves inside its own synchronous
   * export→attach block. Returns null when no solo host exists and creation fails.
   */
  async acquireHostForMap(mapId: string): Promise<BotHost | null> {
    const existing = this.firstSoloHostForMap(mapId);
    if (existing) return existing;
    try {
      // registerRoom runs synchronously inside MapRoom.onCreate, so the new host is in roomsByMap once this resolves.
      const created = await matchMaker.createRoom(MAP_ROOM_NAME, { mapId, partyId: "" });
      for (const host of this.roomsByMap.get(mapId) ?? []) {
        if (host.roomId === created.roomId) return host;
      }
      return this.firstSoloHostForMap(mapId);
    } catch (e) {
      console.error(`[bot] acquireHostForMap(${mapId}) failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  /** First registered solo (partyId === "") host for a map, or null. Party channels are excluded as warp targets. */
  private firstSoloHostForMap(mapId: string): BotHost | null {
    for (const host of this.roomsByMap.get(mapId) ?? []) {
      if (host.partyId === "") return host;
    }
    return null;
  }

  private clearCheckpoint(accountId: string, send: Send): void {
    const had = this.checkpoints.delete(accountId);
    void this.deleteCheckpointRow(accountId); // PR6a: a start/resume/reject supersedes any durable row too.
    if (had) send(MSG_BOT_CHECKPOINT, this.checkpointMessage(null));
  }

  private async sendCheckpoint(accountId: string, send: Send): Promise<void> {
    let checkpoint = await this.surfaceCheckpoint(accountId);
    // PR6a (D-067): a checkpoint that crossed a restart (kind='restart') surfaces for Pro only; any other tier
    // safe-stops → drop the durable row and show nothing to resume.
    if (checkpoint?.kind === "restart" && (await this.resolveTierFor(accountId)) !== "pro") {
      await this.dropCheckpoint(accountId);
      checkpoint = null;
    }
    send(MSG_BOT_CHECKPOINT, this.checkpointMessage(checkpoint));
  }

  /** Authenticated reconnect routing. Never returns another account's actor. */
  activeActorForAccount(accountId: string): {
    actorId: string;
    characterId: string;
    roomId: string;
    host: BotHost;
  } | null {
    const rt = this.bots.get(accountId);
    if (rt && !rt.isStopped) {
      return { actorId: rt.actorId, characterId: rt.characterId, roomId: rt.host.roomId, host: rt.host };
    }
    const pending = this.startingActors.get(accountId);
    return pending
      ? { actorId: pending.actorId, characterId: pending.characterId, roomId: pending.roomId, host: pending.host }
      : null;
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

  /** Manual input may arrive while the accepted session insert is still in flight. Own PAUSED/checkpoint first. */
  private takeoverPendingStart(
    accountId: string,
    presence: StartingActorPresence,
    send: Send,
    m: BotTakeoverMessage,
  ): boolean {
    const savedAt = this.d.now();
    const paused = applyBotContinuityTransition(presence.continuity, {
      kind: "pause",
      expectedRevision: presence.continuity.revision,
      at: savedAt,
      reasonCode: "manual_takeover",
    });
    if (!paused.ok) {
      this.reject(send, "takeover", "checkpoint_saving", m?.requestId);
      return false;
    }
    presence.continuity = paused.snapshot;

    const checkpoint: StoredCheckpoint = {
      id: randomUUID(),
      accountId,
      characterId: presence.characterId,
      host: presence.host,
      kind: "takeover",
      profileId: presence.profileId,
      sourceSessionId: presence.sourceSessionId,
      mapId: presence.mapId,
      pocketId: presence.pocketId,
      savedAt,
      state: "saving",
      continuity: toBotContinuityWire(paused.snapshot),
    };
    this.checkpoints.set(accountId, checkpoint);
    this.drainingAccounts.add(accountId);
    this.cancelledStarts.set(accountId, "manual");
    this.startingActors.delete(accountId);
    presence.host.botReleaseAuthority(presence.actorId);
    send(MSG_BOT_CHECKPOINT, this.checkpointMessage(checkpoint));
    this.ack(send, "takeover", m?.requestId);
    return true;
  }

  private settlePendingTakeover(accountId: string, sessionRowId: string, saved: boolean): void {
    const checkpoint = this.checkpoints.get(accountId);
    if (!checkpoint || checkpoint.sourceSessionId !== sessionRowId || checkpoint.state !== "saving") return;
    this.settleTakeoverCheckpoint(accountId, checkpoint.id, saved);
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
      // M1: caps/prices for every tier come straight from config — the client stops hard-coding them.
      plans: buildBotTierPlans(this.d.config),
    };
    send(MSG_BOT_TIER_STATE, msg);
  }

  /**
   * M1: build the SELECTED_TYPES validation context from LIVE map data — the mob types in the assigned pocket
   * (each bot pocket holds one mob type) + the milestone class lookup. Passed to createProfile/updateProfile so a
   * Plus/Pro selected-types filter is checked against the real pocket, never a hard-coded list.
   */
  private readonly resolveTargetCtx: ResolveRuleTargetCtx = (mapId, pocketId) => {
    const pocket = getMap(mapId)?.mobPockets.find((p) => p.pocketId === pocketId);
    return {
      mobTypesInPocket: pocket ? [pocket.mobType] : null,
      mobClassOf: (mobType) => mobClassForMobType(mobType),
    };
  };

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
    await this.sendCheckpoint(accountId, send);
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
      this.resolveTargetCtx,
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
      this.resolveTargetCtx,
    );
    if (!res.ok) return this.reject(send, "profileUpdate", res.reason, m?.id);
    this.ack(send, "profileUpdate", res.profile.id);
    await this.sendProfiles(accountId, send);
  }

  async onProfileDelete(accountId: string | null, send: Send, m: BotProfileDeleteMessage): Promise<void> {
    if (!accountId || !this.guardDb(send, "profileDelete")) return;
    const res = await deleteProfile(this.d.profileRepo, accountId, m?.id);
    if (!res.ok) return this.reject(send, "profileDelete", res.reason, m?.id);

    // The profile is now definitively gone. Abort only the run/start that references this exact plan; deleting an
    // unrelated plan must never seize authority from the real actor. A deleted active plan fails, not completes.
    if (this.startingProfileIds.get(accountId) === res.profile.id) {
      this.cancelPendingStart(accountId, "profile_deleted");
    }
    const running = this.bots.get(accountId);
    if (running?.profileId === res.profile.id) running.stop("profile_deleted");

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
    await this.start(requestHost, controllerSessionId, accountId, characterId, send, m, "start");
  }

  async onResume(
    requestHost: BotHost,
    controllerSessionId: string,
    accountId: string | null,
    characterId: string | null,
    send: Send,
    m: BotResumeMessage,
  ): Promise<void> {
    if (!accountId || !this.guardDb(send, "resume")) return;
    if (!characterId) return this.reject(send, "resume", "no_character");
    // Surface the in-memory checkpoint, or hydrate a durable one after a restart (only when nothing is live).
    const checkpoint = await this.surfaceCheckpoint(accountId);
    if (!checkpoint || checkpoint.id !== m?.checkpointId) {
      return this.reject(send, "resume", "checkpoint_not_found", m?.checkpointId);
    }
    if (checkpoint.state === "saving") {
      return this.reject(send, "resume", "checkpoint_saving", checkpoint.id);
    }
    if (checkpoint.state === "failed") {
      return this.reject(send, "resume", "checkpoint_failed", checkpoint.id);
    }
    if (checkpoint.characterId !== characterId) {
      return this.reject(send, "resume", "checkpoint_character_mismatch", checkpoint.id);
    }
    // PR6a (D-067): a checkpoint that crossed a server restart (kind='restart') resumes for Pro only — Free/Plus
    // safe-stop across a restart. Clear it (memory + durable row) and reject. In-process takeover checkpoints
    // (kind='takeover') resume for every tier exactly as before. Resume itself is a NEW run via `startReserved`,
    // which re-validates live HP/inventory/position/pocket/profile — the interrupted continuity is never replayed.
    if (checkpoint.kind === "restart" && (await this.resolveTierFor(accountId)) !== "pro") {
      this.clearCheckpoint(accountId, send);
      return this.reject(send, "resume", "checkpoint_requires_pro", checkpoint.id);
    }
    await this.start(
      requestHost,
      controllerSessionId,
      accountId,
      characterId,
      send,
      { profileId: checkpoint.profileId },
      "resume",
      checkpoint.workflow?.stepIndex, // PR6b: resume a goal chain at the captured step (ignored without a workflow)
    );
  }

  private async start(
    requestHost: BotHost,
    controllerSessionId: string,
    accountId: string | null,
    characterId: string | null,
    send: Send,
    m: BotStartMessage,
    op: "start" | "resume",
    workflowStartStepIndex?: number,
  ): Promise<void> {
    if (!accountId || !this.guardDb(send, op)) return;
    if (!characterId) return this.reject(send, op, "no_character");
    if (this.bots.has(accountId) || this.startingAccounts.has(accountId) || this.drainingAccounts.has(accountId)) {
      return this.reject(send, op, this.drainingAccounts.has(accountId) ? "checkpoint_saving" : "already_running");
    }
    if (this.bots.size + this.startingAccounts.size >= this.d.config.maxConcurrentBots) {
      return this.reject(send, op, "at_capacity");
    }
    this.startingAccounts.add(accountId);
    this.startingProfileIds.set(accountId, String(m?.profileId ?? ""));

    try {
      await this.startReserved(
        requestHost,
        controllerSessionId,
        accountId,
        characterId,
        send,
        m,
        op,
        workflowStartStepIndex,
      );
    } finally {
      this.startingAccounts.delete(accountId);
      this.startingProfileIds.delete(accountId);
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
    op: "start" | "resume",
    workflowStartStepIndex?: number,
  ): Promise<void> {

    const tier = await this.resolveTierFor(accountId);
    if (this.cancelledStarts.has(accountId)) return this.reject(send, op, "cancelled", m?.profileId);
    const profile = await this.d.profileRepo.getById(accountId, m?.profileId);
    if (!profile) return this.reject(send, op, "not_found", m?.profileId);

    const all = await this.d.profileRepo.listByAccount(accountId);
    if (this.cancelledStarts.has(accountId)) return this.reject(send, op, "cancelled", profile.id);
    const view = markReadOnlyExcess(all, tier, this.d.config).find((v) => v.id === profile.id);
    if (view?.readOnly) return this.reject(send, op, "profile_readonly", profile.id);
    if (!isBotAllowedPocket(profile.mapId, profile.pocketId, this.d.config)) {
      return this.reject(send, op, "pocket_not_allowed", profile.id);
    }

    // Character Autonomy controls the actor where it actually stands. A profile can never teleport it into a
    // different room/map or choose an unrelated host.
    if (profile.mapId !== requestHost.mapId) {
      return this.reject(send, op, "character_not_in_profile_map", profile.id);
    }
    if (this.cancelledStarts.has(accountId)) return this.reject(send, op, "cancelled", profile.id);

    const now = this.d.now();
    const sessionRowId = randomUUID();
    const continuity = createBotContinuity(now);
    const actorId = requestHost.botClaimAuthority({
      controllerSessionId,
      accountId,
      characterId,
      profileId: profile.id,
      allowedSlots: profile.rules.skillSlots,
      pocketId: profile.pocketId,
    });
    if (!actorId) return this.reject(send, op, "actor_not_available", profile.id);
    this.startingActors.set(accountId, {
      actorId,
      characterId,
      roomId: requestHost.roomId,
      host: requestHost,
      profileId: profile.id,
      sourceSessionId: sessionRowId,
      mapId: profile.mapId,
      pocketId: profile.pocketId,
      continuity,
    });

    // PR5 Phase C (D-069/D-070) · D-073 proactive bag preflight — every enabled tier (D-073 added Free, walk mode).
    // Read the actor's live bag through the SAME best-effort seam the trip controller uses (botBagItems → [] on any
    // load failure) and, if free bag slots already sit below the town-trip resume threshold, open the run with a
    // town trip before it farms a single mob (never farm with a full bag → loot leaks). Best-effort: a load
    // failure/[] yields a full slot count → no preflight, so it never blocks a start. Placed before the cancelled
    // re-check so a cancel during the read is caught below (which releases authority).
    let initialTownTrip = false;
    if (this.d.config.townTrip.enabledTiers.includes(tier)) {
      try {
        const bag = await requestHost.botBagItems(actorId);
        initialTownTrip =
          freeBagSlots(bag, DEFAULT_INVENTORY_CAPACITY) < this.d.config.townTrip.resumeMinFreeSlots;
      } catch {
        initialTownTrip = false; // never block a start on a bag-read failure.
      }
    }

    if (this.cancelledStarts.has(accountId)) {
      this.startingActors.delete(accountId);
      requestHost.botReleaseAuthority(actorId);
      return this.reject(send, op, "cancelled", profile.id);
    }

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
      const cancelledReason = this.cancelledStarts.get(accountId);
      if (this.startingActors.delete(accountId)) requestHost.botReleaseAuthority(actorId);
      this.settlePendingTakeover(accountId, sessionRowId, false);
      return this.reject(send, op, cancelledReason ? "cancelled" : "db_error", profile.id);
    }

    const cancelledReason = this.cancelledStarts.get(accountId);
    if (cancelledReason) {
      if (this.startingActors.delete(accountId)) requestHost.botReleaseAuthority(actorId);
      let saved = false;
      try {
        await this.d.sessionRepo.patch(
          sessionRowId,
          { killCount: 0, goldEarned: 0, expEarned: 0, drops: {} },
          { stoppedAt: this.d.now(), stopReason: cancelledReason },
        );
        saved = true;
      } catch {
        // The session row exists; boot cleanup remains a final safety net if this best-effort close fails.
      }
      this.settlePendingTakeover(accountId, sessionRowId, saved);
      return this.reject(send, op, "cancelled", profile.id);
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
      tier,
      resolveTier: () => this.resolveTierFor(accountId),
      baseCooldownSeconds: requestHost.botBaseCooldownSeconds(actorId),
      startedAtMs: now,
      initialContinuity: continuity,
      now: () => this.d.now(),
      onStopped: (acc, stoppedSessionRowId) => this.dropRuntime(acc, stoppedSessionRowId),
      onTakeoverSettled: (acc, checkpointId, saved) => this.settleTakeoverCheckpoint(acc, checkpointId, saved),
      // PR5 Phase C (D-069): the town-trip warp needs a solo host for a target map, and owner pushes must fan out
      // across every registered host (the owner's transport can sit in a sibling room after a warp).
      acquireHostForMap: (mapId) => this.acquireHostForMap(mapId),
      ownerSend: (acc, type, message) => this.ownerSend(acc, type, message),
      // PR5 Phase C (D-069/D-070) · D-073: a start whose bag is already at/over town pressure opens with a town trip
      // before farming (paid warps, Free walks — first tick). Computed for every enabled tier above.
      initialTownTrip,
      // PR6a (D-067): the runtime piggybacks a Pro-only durable running checkpoint on its flush cadence + graceful
      // server_restart. The manager reads the runtime's live snapshot here (no-op without a checkpoint repo wired).
      persistRunningCheckpoint: () => this.persistRunningCheckpoint(accountId),
      // PR6b: resume a Pro goal chain at the checkpoint's step (ignored when the profile carries no workflow).
      workflowStartStepIndex,
    });
    this.bots.set(accountId, runtime);
    this.actorToAccount.set(actorId, accountId);
    this.startingActors.delete(accountId);
    this.clearCheckpoint(accountId, send);
    this.ack(send, op, profile.id);
  }

  /**
   * Synchronous authority transition used by both the explicit CTA and the first manual move/skill. Returning
   * true means automation is fenced and `botReleaseAuthority` has completed, so MapRoom may apply that input.
   */
  onTakeover(
    accountId: string | null,
    actorId: string | null,
    send: Send,
    m: BotTakeoverMessage,
  ): boolean {
    if (!accountId) return false;
    const runtime = this.bots.get(accountId);
    // A null/undefined actorId means the caller has no local actor for this account (e.g. it warped to a sibling
    // room, so the source room's actorIdOf returns null). Fall back to the account's running runtime / pending
    // start so an explicit owner takeover still routes to the correct actor.
    const resolvedActorId = actorId ?? runtime?.actorId ?? this.startingActors.get(accountId)?.actorId ?? null;
    if (!resolvedActorId) return false;
    if (!runtime) {
      const pending = this.startingActors.get(accountId);
      if (pending?.actorId === resolvedActorId) return this.takeoverPendingStart(accountId, pending, send, m);
      this.reject(send, "takeover", "not_running", m?.requestId);
      return false;
    }
    if (runtime.actorId !== resolvedActorId || runtime.isStopped) {
      this.reject(send, "takeover", runtime.isStopped ? "checkpoint_saving" : "actor_mismatch", m?.requestId);
      return false;
    }

    const checkpoint: StoredCheckpoint = {
      id: randomUUID(),
      accountId,
      characterId: runtime.characterId,
      host: runtime.host,
      runtime, // settle-time map reconciliation reads runtime.host (return-warp failure → city-hub, D-069)
      kind: "takeover",
      profileId: runtime.profileId,
      sourceSessionId: runtime.sessionRowId,
      mapId: runtime.mapId,
      pocketId: runtime.pocketId,
      savedAt: this.d.now(),
      state: "saving",
      continuity: runtime.continuitySnapshot,
      workflow: runtime.workflowCheckpoint, // PR6b: the goal-chain cursor (undefined for a single-pocket run)
    };
    this.checkpoints.set(accountId, checkpoint);
    this.drainingAccounts.add(accountId);
    const paused = runtime.takeover(checkpoint.id, checkpoint.savedAt);
    if (!paused) {
      this.checkpoints.delete(accountId);
      this.drainingAccounts.delete(accountId);
      this.reject(send, "takeover", "checkpoint_saving", m?.requestId);
      return false;
    }
    checkpoint.continuity = paused;
    send(MSG_BOT_CHECKPOINT, this.checkpointMessage(checkpoint));
    this.ack(send, "takeover", m?.requestId);
    return true;
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
  checkpointRepo: prismaCheckpointRepo,
  rarityOf: (itemId) => rarityLookup(itemId),
  dbAvailable: botPersistenceAvailable,
  now: () => Date.now(),
});

/** Rarity lookup resolved from the item catalog (server-only) for rare notification/policy. */
function rarityLookup(itemId: string): string | undefined {
  return ITEM_CATALOG.get(itemId)?.rarity;
}
