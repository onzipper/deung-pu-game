// scripts/e2e/bot-smoke.mjs — standalone e2e smoke: full bot lifecycle against a REAL server + REAL DB
// (join → bot:profileCreate → bot:start → farm loop → proactive potion_low trigger → town trip →
//  bot:stop → bot:profileDelete → cleanup). Plain Node ESM — `node scripts/e2e/bot-smoke.mjs` (see README.md).
//
// WHY this exists (separate from smoke.mjs): bots require a DB-backed account+character (server/bot/manager.ts
// guardDb/`requires_db`, `bot:start` rejects `no_character` without one) — the old guest-join path smoke.mjs
// uses is NOT enough for bot ops. This script creates a throwaway Account+Character row directly via
// @prisma/client (mirrors prisma/schema.prisma — same DB the running server already uses, D-057 dev=prod),
// signs its OWN short-lived realtime JWT with the local JWT_SECRET (mirrors src/server/auth/signed-token.ts +
// realtime-token.ts — the same "join options the server already supports": `token` + `characterId` in
// joinOptions, verified by MapRoom.onAuth), then joins for real. **No server code was touched to make this
// possible** — every path exercised here is a path the server already accepts from a real logged-in client.
//
// ⚠️ DB dev=prod (D-057, current-state.md): every row this script creates is deleted in a `finally` block
// (best-effort, continues past individual failures) — see `cleanupDb()`. Uses a fresh random accountId/
// characterId per run so a mid-run crash never collides with a retry.

import { randomUUID, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { connect, finalizeReport, getRtUrl, report, waitFor } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

// ── .env loader (plain parse — no `dotenv` dependency in package.json; tsx auto-loads .env for the real
//    server process, plain `node` does not) — only sets keys not already present in process.env. ──────────
function loadDotEnv(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv(path.join(REPO_ROOT, ".env"));

if (!process.env.DATABASE_URL) {
  report("DATABASE_URL available (.env)", false, "not set — cannot create a DB-backed bot account, aborting");
  finalizeReport();
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  report("JWT_SECRET available (.env)", false, "not set — cannot sign a realtime token, aborting");
  finalizeReport();
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

// ── Protocol constants (mirror src/shared/net-protocol.ts — line numbers as of this script's authoring) ────
const MAP_ROOM_NAME = "map_room"; // net-protocol.ts:32 MAP_ROOM_NAME
const DEFAULT_PARTY_ID = ""; // net-protocol.ts:60 DEFAULT_PARTY_ID (solo)
const MSG_BOT_PROFILE_CREATE = "bot:profileCreate"; // net-protocol.ts:988
const MSG_BOT_PROFILE_DELETE = "bot:profileDelete"; // net-protocol.ts:1005
const MSG_BOT_START = "bot:start"; // net-protocol.ts:1010
const MSG_BOT_STOP = "bot:stop"; // net-protocol.ts:1015
const MSG_BOT_PROFILES = "bot:profiles"; // net-protocol.ts:1048
const MSG_BOT_STATUS = "bot:status"; // net-protocol.ts:1076
const MSG_BOT_STOPPED = "bot:stopped"; // net-protocol.ts:1106
const MSG_BOT_OP_RESULT = "bot:opResult"; // net-protocol.ts:1180

// ── Map/class knobs (mirror src/engine/map/map1.ts + src/shared/character-class.ts) ─────────────────────
const MAP1_ID = "map1"; // map1.ts:26 MAP1_ID
const MAP1_SPAWN = { tx: 20.5, ty: 5.5 }; // map1.ts:36 spawnPoint
const CLASS_ID = "swordsman"; // character-class.ts:11 CLASS_IDS[0]

// ── Bot config knobs (mirror server/config/bot.ts DEFAULT_BOT_CONFIG) ────────────────────────────────────
const POCKET_ID = "map1-slime-center"; // bot.ts botAllowedPockets.map1[0] (mob "slime")
const PRESSURE_CHECK_INTERVAL_MS = 15_000; // bot.ts townTrip.pressureCheckIntervalMs
// bot.ts townTrip.potionLowReserveDefault = 1 — a fresh potionCount(0) is always ≤ this, so the potion_low
// proactive trigger is armed from the very first bag sample (see createTestIdentity: no starter potions).
const MIN_GOLD_RESERVE = 50; // bot.ts townTrip.minGoldReserve
const POTION_PRICE_APPROX = 18; // bot.ts comment "potion costs 18 each" — purchase may be skipped, see §5 note

// ── Realtime JWT (mirror src/server/auth/signed-token.ts signToken/sign + realtime-token.ts issueRealtimeToken)
//    — same algorithm (HS256 compact JWS, node:crypto HMAC), same claim shape (sub/jti/aud=realtime/iat/exp).
//    MapRoom.onAuth (server/rooms/MapRoom.ts:686) verifies with the SAME JWT_SECRET this process just loaded —
//    this is the "join options the server already supports" path (token+characterId), not a new one. ──────
const REALTIME_TOKEN_TTL_SEC = 60; // realtime-token.ts:13 REALTIME_TOKEN_TTL_SEC
function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}
const JWT_HEADER_B64 = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
function signRealtimeToken(accountId, secret) {
  const nowSec = Math.floor(Date.now() / 1000);
  const claims = {
    sub: accountId,
    jti: randomUUID(),
    aud: "realtime",
    iat: nowSec,
    exp: nowSec + REALTIME_TOKEN_TTL_SEC,
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${JWT_HEADER_B64}.${payloadB64}`;
  const sig = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${sig}`;
}

const OVERALL_TIMEOUT_MS = 240_000; // ~180s scenario + safety margin for DB/town-trip walk latency
const FARM_LOOP_TIMEOUT_MS = 60_000; // brief §4
const TOWN_TRIP_WINDOW_MS = PRESSURE_CHECK_INTERVAL_MS + 90_000; // brief §5 "~15s + margin" — generous for a
// Free-tier WALK trip (D-071: Free walks to city-hub, does not warp) — portal walk + shop + walk back.
const MONITOR_TIMEOUT_MS = 130_000; // combined wait budget for both farm-loop + town-trip evidence

const FARM_STATES = new Set(["WORKING", "TRAVELING", "COMBAT", "LOOTING"]);

function describeError(err) {
  const msg = err?.message;
  const cause = err?.cause?.message ?? err?.cause?.code;
  if (msg && cause) return `${msg} (cause: ${cause})`;
  if (msg) return msg;
  if (cause) return String(cause);
  return String(err);
}

/**
 * subsequence scan: RETURNING_TO_TOWN → RETURNING_TO_WORK → any farm state, in order.
 *
 * Does NOT require literally observing SELLING/DEPOSITING/RESTOCKING in between: the continuity state machine
 * (server/bot/continuity.ts TRANSITIONS) only allows RETURNING_TO_TOWN -> SELLING -> DEPOSITING -> RESTOCKING ->
 * RETURNING_TO_WORK (no other edge reaches RETURNING_TO_WORK from RETURNING_TO_TOWN) — so observing
 * RETURNING_TO_WORK after RETURNING_TO_TOWN is itself proof those steps ran, even if the whole leg completed
 * faster than one bot:status push cadence (config.statusPushIntervalMs = 2000ms) and the client's dedup-on-change
 * history never captured the intermediate strings. `restockingSeen` is recorded separately as bonus diagnostic
 * evidence, never required — brief explicitly asks the assertion to tolerate skipped pushes.
 */
function findTownTripSequence(history) {
  const iReturn = history.findIndex((h) => h.state === "RETURNING_TO_TOWN");
  if (iReturn === -1) return { complete: false, reached: "none", restockingSeen: false };
  const restockingSeen = history.some((h, i) => i > iReturn && h.state === "RESTOCKING");
  const iReturnWork = history.findIndex((h, i) => i > iReturn && h.state === "RETURNING_TO_WORK");
  if (iReturnWork === -1) {
    return { complete: false, reached: "RETURNING_TO_TOWN", tripStartAt: history[iReturn].t, restockingSeen };
  }
  const iFarmAgain = history.findIndex((h, i) => i > iReturnWork && FARM_STATES.has(h.state));
  if (iFarmAgain === -1) {
    return { complete: false, reached: "RETURNING_TO_WORK", tripStartAt: history[iReturn].t, restockingSeen };
  }
  return {
    complete: true,
    reached: "farm_resumed",
    tripStartAt: history[iReturn].t,
    resumedAt: history[iFarmAgain].t,
    restockingSeen,
  };
}

// ── DB-backed test identity (P2-05 shape — mirrors prisma/schema.prisma Account/Character) ────────────────
async function createTestIdentity() {
  const accountId = randomUUID();
  const characterId = randomUUID();
  const suffix = accountId.slice(0, 8);
  await prisma.account.create({
    data: { id: accountId, isGuest: true, displayName: `e2e-bot-${suffix}` },
  });
  await prisma.character.create({
    data: {
      id: characterId,
      accountId,
      name: `e2ebot${suffix}`, // unique global — random suffix avoids collision (schema.prisma Character.name @unique)
      classId: CLASS_ID,
      level: 1,
      exp: 0n,
    },
  });
  return { accountId, characterId };
}

/** best-effort delete, scoped ONLY to this run's accountId/characterId — never touches real player rows. */
async function cleanupDb(accountId, characterId) {
  const steps = [
    ["botCheckpoint", () => prisma.botCheckpoint.deleteMany({ where: { accountId } })],
    ["botSession", () => prisma.botSession.deleteMany({ where: { accountId } })],
    ["botTierState", () => prisma.botTierState.deleteMany({ where: { accountId } })],
    ["botProfile (safety net)", () => prisma.botProfile.deleteMany({ where: { accountId } })],
    ["sessionLease", () => prisma.sessionLease.deleteMany({ where: { accountId } })],
    ["storageTransactionLog", () => prisma.storageTransactionLog.deleteMany({ where: { accountId } })],
    ["deliveryBoxEntry", () => prisma.deliveryBoxEntry.deleteMany({ where: { accountId } })],
    ["itemInstance", () => prisma.itemInstance.deleteMany({ where: { accountId } })],
    ["currencyLedger", () => prisma.currencyLedger.deleteMany({ where: { characterId } })],
    ["dropAudit", () => prisma.dropAudit.deleteMany({ where: { characterId } })],
    ["enhancementLog", () => prisma.enhancementLog.deleteMany({ where: { characterId } })],
    ["achievementProgress", () => prisma.achievementProgress.deleteMany({ where: { scopeKey: { in: [accountId, characterId] } } })],
    ["milestoneGrant", () => prisma.milestoneGrant.deleteMany({ where: { accountId } })],
    ["reinforcementPity", () => prisma.reinforcementPity.deleteMany({ where: { accountId } })],
    ["characterState", () => prisma.characterState.deleteMany({ where: { characterId } })],
    ["character", () => prisma.character.deleteMany({ where: { id: characterId } })],
    ["account", () => prisma.account.deleteMany({ where: { id: accountId } })],
  ];
  const failures = [];
  for (const [label, fn] of steps) {
    try {
      await fn();
    } catch (err) {
      failures.push(`${label}: ${describeError(err)}`);
    }
  }
  if (failures.length > 0) {
    console.log(`[e2e] cleanupDb best-effort failures (manual check may be needed): ${failures.join("; ")}`);
  } else {
    console.log("[e2e] cleanupDb: all rows removed cleanly");
  }
}

async function main() {
  const url = getRtUrl();
  console.log(`[e2e] target: ${url}`);

  const { accountId, characterId } = await createTestIdentity();
  report("create DB-backed test account+character", true, `accountId=${accountId} characterId=${characterId}`);

  let room = null;
  let profileId = null;
  const opResults = new Map(); // op -> latest BotOpResultMessage
  let latestProfiles = null;
  let latestStatus = null;
  let statusHistory = []; // [{t, state, killCount, townTrips}]
  let lastState = null;
  let firstKillAt = null; // ms since bot:start ack, when we first saw a farm state with killCount>0
  let startAckAtMs = null;
  let sawStopped = false;
  let stoppedReason = null;

  try {
    const token = signRealtimeToken(accountId, process.env.JWT_SECRET);
    const joinOptions = {
      mapId: MAP1_ID,
      partyId: DEFAULT_PARTY_ID,
      tx: MAP1_SPAWN.tx,
      ty: MAP1_SPAWN.ty,
      direction: "S",
      anim: "idle",
      token,
      characterId,
      classId: CLASS_ID,
    };

    try {
      ({ room } = await connect(url, MAP_ROOM_NAME, joinOptions));
    } catch (err) {
      report("join map1 with DB-backed identity", false, describeError(err));
      finalizeReport();
      return;
    }
    report("join map1 with DB-backed identity", true, `sessionId=${room.sessionId}`);

    const selfActorId = await waitFor(
      () => room.state?.controllers?.get(room.sessionId),
      10_000,
      "controller bound to stable character actor",
    );
    const self = await waitFor(
      () => room.state?.players?.get(selfActorId),
      10_000,
      "self player visible in ROOM_STATE",
    );
    report(
      "spawned in map1 (self visible in room state)",
      room.state.mapId === MAP1_ID,
      `mapId=${room.state.mapId} tx=${self.tx.toFixed(2)} ty=${self.ty.toFixed(2)}`,
    );

    room.onMessage(MSG_BOT_OP_RESULT, (msg) => {
      opResults.set(msg.op, msg);
      console.log(`[e2e] bot:opResult ${msg.op} ok=${msg.ok}${msg.reason ? ` reason=${msg.reason}` : ""}`);
    });
    room.onMessage(MSG_BOT_PROFILES, (msg) => {
      latestProfiles = msg.profiles;
    });
    room.onMessage(MSG_BOT_STOPPED, (msg) => {
      sawStopped = true;
      stoppedReason = msg.reason;
      console.log(`[e2e] bot:stopped reason=${msg.reason} kills=${msg.killCount}`);
    });
    room.onMessage(MSG_BOT_STATUS, (msg) => {
      latestStatus = msg;
      const now = Date.now();
      if (msg.continuity.state !== lastState) {
        lastState = msg.continuity.state;
        statusHistory.push({
          t: now,
          state: lastState,
          killCount: msg.killCount,
          townTrips: msg.stats?.townTrips ?? null,
        });
      }
      if (
        firstKillAt == null &&
        startAckAtMs != null &&
        FARM_STATES.has(msg.continuity.state) &&
        msg.killCount > 0
      ) {
        firstKillAt = now - startAckAtMs;
      }
    });

    // (2) bot:profileCreate — Free-tier profile within cap (skillSlots[0]+potionThresholdPct+lootAll = 3 rules = cap)
    room.send(MSG_BOT_PROFILE_CREATE, {
      name: `e2e-smoke-${accountId.slice(0, 8)}`,
      mapId: MAP1_ID,
      pocketId: POCKET_ID,
      rules: { skillSlots: [0], lootAll: true, potionThresholdPct: 30 },
    });
    await waitFor(() => opResults.has("profileCreate"), 15_000, "bot:opResult profileCreate");
    const createResult = opResults.get("profileCreate");
    report(
      "bot:profileCreate ok",
      createResult.ok === true,
      createResult.ok ? `refId=${createResult.refId}` : `reason=${createResult.reason}`,
    );
    if (!createResult.ok) {
      finalizeReport();
      return;
    }
    await waitFor(
      () => latestProfiles?.some((p) => p.id === createResult.refId),
      10_000,
      "bot:profiles contains created profile",
    );
    profileId = createResult.refId;
    report("bot:profiles contains created profile", true, `profileId=${profileId}`);

    // (3) bot:start
    room.send(MSG_BOT_START, { profileId });
    await waitFor(() => opResults.has("start"), 15_000, "bot:opResult start");
    const startResult = opResults.get("start");
    report(
      "bot:start ok",
      startResult.ok === true,
      startResult.ok ? `refId=${startResult.refId}` : `reason=${startResult.reason}`,
    );
    if (!startResult.ok) {
      finalizeReport();
      return;
    }
    startAckAtMs = Date.now();
    await waitFor(() => latestStatus != null, 10_000, "bot:status first push");
    report("bot:status began pushing", true, `continuity=${latestStatus.continuity.state}`);

    // (4)+(5) monitor concurrently — see comment above findTownTripSequence for why order isn't forced.
    try {
      await waitFor(
        () => firstKillAt != null && findTownTripSequence(statusHistory).complete,
        MONITOR_TIMEOUT_MS,
        "farm loop + full town-trip sequence observed",
        500,
      );
    } catch (err) {
      console.log(`[e2e] monitor window ended without both conditions: ${describeError(err)}`);
    }

    report(
      "farm loop: continuity in {WORKING,TRAVELING,COMBAT,LOOTING} + killCount>0 within 60s of start",
      firstKillAt != null && firstKillAt <= FARM_LOOP_TIMEOUT_MS,
      `firstKillAt=${firstKillAt}ms (budget ${FARM_LOOP_TIMEOUT_MS}ms)`,
    );

    const seq = findTownTripSequence(statusHistory);
    const tripStartRelMs = seq.tripStartAt != null ? seq.tripStartAt - startAckAtMs : null;
    report(
      "proactive trigger + town trip: RETURNING_TO_TOWN -> RETURNING_TO_WORK -> farm state",
      seq.complete && tripStartRelMs != null && tripStartRelMs <= TOWN_TRIP_WINDOW_MS,
      `reached=${seq.reached} restockingLiterallySeen=${seq.restockingSeen} tripStartRelMs=${tripStartRelMs} budget=${TOWN_TRIP_WINDOW_MS}ms ` +
        `history=${statusHistory.map((h) => `${h.state}@${h.t - startAckAtMs}ms`).join(" -> ")}`,
    );

    const townTripsCount = latestStatus?.stats?.townTrips ?? null;
    report(
      "bot:status.stats.townTrips >= 1",
      typeof townTripsCount === "number" && townTripsCount >= 1,
      `stats.townTrips=${townTripsCount} (purchase itself may be skipped if gold < ${MIN_GOLD_RESERVE + POTION_PRICE_APPROX} — not asserted)`,
    );

    // (6) bot:stop -> bot:profileDelete -> leave
    // The run may already have self-stopped (D-070 safe-stop, e.g. low_hp with zero starter potions/gold — this
    // throwaway test character starts with NEITHER, see createTestIdentity) before we get here — `sawStopped`
    // captured BEFORE we send bot:stop distinguishes "already stopped autonomously" (opResult "not_running" is
    // then the CORRECT rejection, not a bug) from "still running, our stop actually closed it".
    const alreadyStoppedBeforeManualStop = sawStopped;
    room.send(MSG_BOT_STOP, {});
    await waitFor(() => opResults.get("stop") != null, 15_000, "bot:opResult stop");
    const stopResult = opResults.get("stop");
    const stopOutcomeOk =
      stopResult.ok === true || (alreadyStoppedBeforeManualStop && stopResult.reason === "not_running");
    report(
      "bot:stop ok (or already self-stopped before manual stop — D-070 safe-stop)",
      stopOutcomeOk,
      stopResult.ok
        ? "acked"
        : `reason=${stopResult.reason} alreadyStoppedBeforeManualStop=${alreadyStoppedBeforeManualStop} autonomousStopReason=${stoppedReason}`,
    );
    try {
      await waitFor(() => sawStopped, 20_000, "bot:stopped settle");
      report("bot:stopped received (run settled)", true, "");
    } catch (err) {
      report("bot:stopped received (run settled)", false, describeError(err));
    }

    room.send(MSG_BOT_PROFILE_DELETE, { id: profileId });
    await waitFor(() => opResults.get("profileDelete") != null, 15_000, "bot:opResult profileDelete");
    const deleteResult = opResults.get("profileDelete");
    report(
      "bot:profileDelete ok",
      deleteResult.ok === true,
      deleteResult.ok ? "acked" : `reason=${deleteResult.reason}`,
    );
  } finally {
    if (room) {
      try {
        await room.leave(true);
      } catch {
        // best-effort
      }
    }
    await cleanupDb(accountId, characterId);
    await prisma.$disconnect();
  }

  finalizeReport();
}

const timeoutGuard = setTimeout(() => {
  console.log(`[e2e] OVERALL TIMEOUT after ${OVERALL_TIMEOUT_MS}ms — forcing exit`);
  report("overall run within timeout", false, `exceeded ${OVERALL_TIMEOUT_MS}ms`);
  finalizeReport();
  process.exit(process.exitCode ?? 1);
}, OVERALL_TIMEOUT_MS);
timeoutGuard.unref?.();

main()
  .catch((err) => {
    report("bot smoke run (uncaught)", false, err?.stack ?? String(err));
    finalizeReport();
  })
  .finally(() => {
    clearTimeout(timeoutGuard);
    process.exit(process.exitCode ?? 0);
  });
