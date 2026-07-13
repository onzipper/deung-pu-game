# Context pack: server (Colyseus realtime + Next server-only + DB)
Scope: `server/**`, `src/server/**`, `src/shared/**` · Read this pack + the files in your brief. Spec detail via the cited §.

## Contract
- `server/**` = the Colyseus process (separate from Next, L4): rooms, schema, matchmaking, security, persistence. The **server is authoritative** for movement/combat/drops (TA §1/§6.2).
- `src/server/**` = the Next API side (server-only): auth token/session, Prisma client — must **never** enter the client bundle.
- `src/shared/**` = pure client↔server contracts (net-protocol, reconnect/movement-validation, name/class validators).
- Reuse `src/server/auth/` from `server/**` directly (server/tsconfig imports `../src/**`; pure `node:crypto`, no Next dep) — no shared module needed.

## Key files
- `server/rooms/MapRoom.ts` — movement validation, mob sim, combat authority, reconnect grace, map transition, safe-zone cap
- `server/index.ts` — Colyseus Server + `.filterBy(['mapId','partyId'])`, ws://localhost:2567
- `server/schema/` — @colyseus/schema state (PlayerState/MobState/MapRoomState)
- `server/security/` — WS handshake (JWT+origin+rate limit), session takeover/lease (Bible 5.2)
- `server/characters/` — persistence decision (pure) + character-state load/upsert (best-effort; no DB = in-memory)
- `src/engine/net/net-client.ts` — client glue: connect/join, reconnect, self-adopt gating, cast/skill msgs
- `src/server/db.ts` + `server/db/` — Prisma singletons (server-only) + ledger contract

## Invariants
- DB schema/migration + the currency ledger are **never-downgrade zones** — no guessing.
- Every balance value from config (Design Knobs §48). Field names per GS §50.1.
- Best-effort DB: no `DATABASE_URL` / can't connect → skip + warn once, **never break join** (dev/e2e have no DB).
- Run the server with `--tsconfig server/tsconfig.json`; keep `server/` in the root tsconfig `exclude` + eslint `globalIgnores`.

## Traps
- **Colyseus version pinning + schema decorators** — Pin the 0.16 line on schema 3 on both sides: colyseus@0.16.5 + @colyseus/schema@^3 (server) + colyseus.js@0.16.22 (client). A schema major bump = a different wire format → decode failures. `@type` is a legacy PropertyDecorator → the server needs `experimentalDecorators:true` + `useDefineForClassFields:false`.
  full story: docs/history/2026-07-13-known-traps-archive.md#colyseus-client-colyseusjs-and-server-colyseus-have-different-version-numbers--schema-must-be-matched-exactly
- **tsx must pass `--tsconfig server/tsconfig.json`** — Symptom: `Cannot read properties of undefined (reading 'constructor')` at `@type`. Cause: tsx defaults to TC39 decorators; schema needs legacy ones. Rule: always run through that tsconfig (matches `npm run dev:server`). (also in agent-rules "Shell & tooling traps")
  full story: docs/history/2026-07-13-known-traps-archive.md#tsx-running-the-server-must-pass---tsconfig-servertsconfigjson-otherwise-decorators-break
- **Reconnect token in-memory + StrictMode = new-player + split tabs** — Symptom: refresh/reopen rejoins as a new player; 2 tabs land in different rooms (ghost pile-up fills channels). Cause: token stored only in net-client memory; unconsented ws drop holds a ghost seat 30s; StrictMode churn. Rule: persist the token to **sessionStorage per-tab** (reconnect-store.ts, never localStorage — 2 tabs would fight); re-persist on `pagehide`; on boot try `client.reconnect(token)` first to reclaim the ghost seat; a consented leave (SPA nav/transition) clears the token. StrictMode half = the `setTimeout(0)` guard (see ui.md).
  full story: docs/history/2026-07-13-known-traps-archive.md#reconnect-token-in-memory--strictmode-double-mount--refresh-turns-you-into-a-new-player--2-tabs-cant-see-each-other-p1-07-fix
- **Client must adopt the authoritative position** — Symptom: after a refresh walking warps back; walking onto the exit does nothing. Cause: `status`.online fires at JOIN_ROOM before ROOM_STATE → the first tick sends MSG_MOVE from the client spawn while the server holds the real position → correction warp; the server position never enters the exit area. Rule: `onSelfSpawn` → `applyCorrection(snap.tx,snap.ty)` before moving; gate `sendMove` with `canSendLocalMove(state, selfAdopted)` (never send before adopting). The colyseus join promise resolves at JOIN_ROOM, not ROOM_STATE.
  full story: docs/history/2026-07-13-known-traps-archive.md#client-doesnt-adopt-the-authoritative-position-after-joinreconnect--warp--exit-doesnt-fire-issue-12
- **Movement validation floor ≥ 1 send interval** — Symptom (prod): click-to-move walks jerkily then stops short. Cause: 12Hz steps (0.333 tile) arrive bunched → measured `elapsedMs`≈0 → clamped to `minElapsedMs`; at 50ms the allowance 0.30 < 0.333 → the step is rejected → correction. Rule: floor ≥ send interval → set `minElapsedMs=90` (allowance 0.54); anti-teleport stays separate (`teleportThresholdTiles=3`). After a correction, replan A* to the same goal (correction-resume.ts).
  full story: docs/history/2026-07-13-known-traps-archive.md#the-movement-validation-floor-must-be--1-send-interval-otherwise-a-single-full-step-gets-rejected--walking-jitters-then-stops-prod-2026-07-12
- **Colyseus `onAuth` must be static; reconnect skips onAuth** — Symptom: an instance-method `onAuth` is silently ignored (token never verified, join still works = looks fine). Cause: MatchMaker calls `roomClass["onAuth"]` (static) during matchmaking; `authContext={token,headers,ip}` (token from the `_authToken` query/Bearer, not joinOptions). Rule: static `onAuth`, verify with `verifyRealtimeToken`; attach the token only on **fresh join** (reconnect reuses `previousClient`.auth and never calls onAuth).
  full story: docs/history/2026-07-13-known-traps-archive.md#colyseus-onauth-must-be-static--reconnect-never-calls-onauth-p2-04-ws-handshake
- **Session-takeover close code is terminal** — Symptom: the server kicks the old session with `leave(4001)` but the client (code≠4000) auto-reconnects → 2 tabs fight forever. Rule: the client `onLeave` treats `WS_CLOSE_SESSION_TAKEN_OVER` as terminal (clear token/store, go offline, no reconnect); the server marks the taken-over sessionId in a set before `client`.leave and deletes it immediately (never enters grace; onLeave only sees `consented:boolean`). Release the lease/registry session-scoped (takeover-wins).
  full story: docs/history/2026-07-13-known-traps-archive.md#session-takeover-close-code-is-terminal-on-the-client-side-must-not-auto-reconnect-in-a-loop-p2-04-storage-42
- **P2-05 transition-save vs onLeave overwrite** — checkExit saves the **destination** position, but the map transition triggers a consented leave whose onLeave save would overwrite it with the **old map's** position (the player bounces back). Rule: MapRoom marks `transitioningSessions` in checkExit and onLeave skips the save for that session (cleared on removePlayer). Enforced by `tests/server-characters-persistence.test.ts`.
  full story: docs/history/2026-07-13-known-traps-archive.md#p2-05-saving-during-a-map-transition-must-guard-against-onleave-overwriting-it
- **Real DB is MariaDB, not MySQL 8** — TA L3 says MySQL 8 but Hostinger runs MariaDB. The Prisma `mysql` provider + `utf8mb4_unicode_ci` work fine; **avoid MySQL-8-only features** (`utf8mb4_0900_*` collations, some CHECK forms). The PowerShell-BOM half of this trap lives in agent-rules "Shell & tooling traps".
  full story: docs/history/2026-07-13-known-traps-archive.md#powershell-writing-files--bom--migration-sql-breaks--the-real-db-turns-out-to-be-mariadb
- **Melee arc/hitTolerance is server-side** (dup from game.md) — the server judges the arc from the mob's current position; feed `hitTolerance` (config) into `findHits`/`resolveSkillHits` server-side only (client offline dummy uses ZERO_HIT_TOLERANCE).
  full story: docs/history/2026-07-13-known-traps-archive.md#attacks-dont-land-on-mobs-interp-lag-makes-melee-arcs-meaningless-at-point-blank-range-p1-051

## Tests & commands
- `npm test` · `tsc -p server/tsconfig.json` · server smoke via `scripts/e2e/smoke.mjs`.
