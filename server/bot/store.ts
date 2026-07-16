// Batch 7b-server — DB store (Prisma repos for bot_tier_state / bot_profiles / bot_sessions, migration 0004).
//
// Bots mutate the PERSISTENT economy (no in-memory pretend) → every bot op requires a DB. `botPersistenceAvailable`
// gates the whole subsystem; with no DATABASE_URL the manager rejects start with "requires_db" (documented).
//
// ⛔ SERVER-ONLY. Maps the plain-TS row types (epoch-ms numbers, camelCase) ↔ Prisma rows (DateTime, JSON).

import { getPrisma } from "../../src/server/db";
import type { BotTier, BotStopReason } from "../config/bot";
import type { ProfileRepo } from "./profiles";
import type { BotProfileRow, BotRulesV1, BotSessionRow, BotTierStateRow } from "./types";

/** Bots require a real DB (they touch the audited economy). Mirrors the best-effort gate used elsewhere. */
export function botPersistenceAvailable(): boolean {
  return !!process.env.DATABASE_URL;
}

const toMs = (d: Date | null | undefined): number | null => (d ? d.getTime() : null);
const reqMs = (d: Date): number => d.getTime();

// ── tier_state ───────────────────────────────────────────────────────────────

export interface TierRepo {
  get(accountId: string): Promise<BotTierStateRow | null>;
  upsert(row: BotTierStateRow): Promise<void>;
}

export const prismaTierRepo: TierRepo = {
  async get(accountId) {
    const r = await getPrisma().botTierState.findUnique({ where: { accountId } });
    if (!r) return null;
    return {
      accountId: r.accountId,
      tier: r.tier as BotTier,
      passExpiresAt: toMs(r.passExpiresAt),
      updatedAt: reqMs(r.updatedAt),
    };
  },
  async upsert(row) {
    const passExpiresAt = row.passExpiresAt != null ? new Date(row.passExpiresAt) : null;
    await getPrisma().botTierState.upsert({
      where: { accountId: row.accountId },
      create: { accountId: row.accountId, tier: row.tier, passExpiresAt },
      update: { tier: row.tier, passExpiresAt },
    });
  },
};

// ── profiles ───────────────────────────────────────────────────────────────

function toProfileRow(r: {
  id: string;
  accountId: string;
  name: string;
  mapId: string;
  pocketId: string;
  rulesJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}): BotProfileRow {
  return {
    id: r.id,
    accountId: r.accountId,
    name: r.name,
    mapId: r.mapId,
    pocketId: r.pocketId,
    rules: r.rulesJson as BotRulesV1,
    createdAt: reqMs(r.createdAt),
    updatedAt: reqMs(r.updatedAt),
  };
}

export const prismaProfileRepo: ProfileRepo = {
  async listByAccount(accountId) {
    const rows = await getPrisma().botProfile.findMany({ where: { accountId }, orderBy: { createdAt: "asc" } });
    return rows.map(toProfileRow);
  },
  async getById(accountId, id) {
    const r = await getPrisma().botProfile.findFirst({ where: { id, accountId } });
    return r ? toProfileRow(r) : null;
  },
  async insert(row) {
    // createdAt/updatedAt are DB-managed (@default(now()) / @updatedAt) — don't override them here.
    await getPrisma().botProfile.create({
      data: {
        id: row.id,
        accountId: row.accountId,
        name: row.name,
        mapId: row.mapId,
        pocketId: row.pocketId,
        rulesJson: row.rules as unknown as object,
      },
    });
  },
  async update(row) {
    await getPrisma().botProfile.update({
      where: { id: row.id },
      data: {
        name: row.name,
        mapId: row.mapId,
        pocketId: row.pocketId,
        rulesJson: row.rules as unknown as object,
      },
    });
  },
  async remove(accountId, id) {
    await getPrisma().botProfile.deleteMany({ where: { id, accountId } });
  },
};

// ── sessions (= reports) ───────────────────────────────────────────────────

function toSessionRow(r: {
  id: string;
  accountId: string;
  characterId: string;
  profileId: string;
  mapId: string;
  startedAt: Date;
  stoppedAt: Date | null;
  stopReason: string | null;
  killCount: number;
  goldEarned: number;
  expEarned: number;
  dropsJson: unknown;
  updatedAt: Date;
}): BotSessionRow {
  return {
    id: r.id,
    accountId: r.accountId,
    characterId: r.characterId,
    profileId: r.profileId,
    mapId: r.mapId,
    startedAt: reqMs(r.startedAt),
    stoppedAt: toMs(r.stoppedAt),
    stopReason: (r.stopReason as BotStopReason | null) ?? null,
    killCount: r.killCount,
    goldEarned: r.goldEarned,
    expEarned: r.expEarned,
    drops: (r.dropsJson as Record<string, number> | null) ?? {},
    updatedAt: reqMs(r.updatedAt),
  };
}

export interface SessionRepo {
  insert(row: BotSessionRow): Promise<void>;
  /** flush live counters (+ optional stop) for a running session. */
  patch(
    id: string,
    counters: { killCount: number; goldEarned: number; expEarned: number; drops: Record<string, number> },
    stop: { stoppedAt: number; stopReason: BotStopReason } | null,
  ): Promise<void>;
  listByAccount(accountId: string): Promise<BotSessionRow[]>;
  getById(accountId: string, id: string): Promise<BotSessionRow | null>;
  /** on boot: mark every still-open session (stoppedAt IS NULL) as server_restart (NOT auto-resumed). */
  markOpenAsRestart(nowMs: number): Promise<number>;
}

export const prismaSessionRepo: SessionRepo = {
  async insert(row) {
    await getPrisma().botSession.create({
      data: {
        id: row.id,
        accountId: row.accountId,
        characterId: row.characterId,
        profileId: row.profileId,
        mapId: row.mapId,
        startedAt: new Date(row.startedAt),
        stoppedAt: row.stoppedAt != null ? new Date(row.stoppedAt) : null,
        stopReason: row.stopReason,
        killCount: row.killCount,
        goldEarned: row.goldEarned,
        expEarned: row.expEarned,
        dropsJson: row.drops as unknown as object,
      },
    });
  },
  async patch(id, counters, stop) {
    await getPrisma().botSession.update({
      where: { id },
      data: {
        killCount: counters.killCount,
        goldEarned: counters.goldEarned,
        expEarned: counters.expEarned,
        dropsJson: counters.drops as unknown as object,
        ...(stop ? { stoppedAt: new Date(stop.stoppedAt), stopReason: stop.stopReason } : {}),
      },
    });
  },
  async listByAccount(accountId) {
    const rows = await getPrisma().botSession.findMany({
      where: { accountId },
      orderBy: { startedAt: "desc" },
      take: 500,
    });
    return rows.map(toSessionRow);
  },
  async getById(accountId, id) {
    const r = await getPrisma().botSession.findFirst({ where: { id, accountId } });
    return r ? toSessionRow(r) : null;
  },
  async markOpenAsRestart(nowMs) {
    // only PRE-boot orphans (started_at < boot time): a session started after boot is a live one, never swept.
    const res = await getPrisma().botSession.updateMany({
      where: { stoppedAt: null, startedAt: { lt: new Date(nowMs) } },
      data: { stoppedAt: new Date(nowMs), stopReason: "server_restart" },
    });
    return res.count;
  },
};
