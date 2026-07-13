<!-- ARCHIVE (2026-07-13): verbatim snapshot of docs/known-traps.md as of 2026-07-13. -->
<!-- Full war stories preserved verbatim below; each `## ` heading is a stable anchor. -->
<!-- The condensed, per-layer rules now live in docs/context/*.md + docs/agent-rules.md. -->

# Known traps

Bug classes that have actually cost real debugging time — read before touching code · add immediately when you hit a new bug (in the same commit as the fix)

## Next.js 16 is not what the model remembers

- Symptom: write code following old Next.js conventions, then the API/structure doesn't match
- Cause: Next.js 16 has breaking changes relative to training data
- Avoidance: read `node_modules/next/dist/docs/` before writing any framework code (see AGENTS.md)

## Spec drift between design and tech

- Symptom: a field/value in code doesn't match spec because of "remembering it as roughly this"
- Cause: the spec is long, didn't read the full § and guessed instead
- Avoidance: open the § that feature-map points to every time before implementing — field names must be copied directly from v15 §50.1, never typed from memory

## iso placement: duplicated +0.5 (sprite off by half a tile)

- Symptom: a sprite/entity floats low/offset from the cursor or camera by ~half a tile (16px @ 64×32); the player isn't centered on screen
- Cause: mixing `tileCenterToScreen` (adds +0.5) with coordinates that are "continuous/already centered" (e.g. a tile from `screenToTile(cursor)`) → +0.5 gets added twice; or an entity uses center basis while camera/depthKey use origin basis → mismatched frames, depth sort order flips
- Avoidance: **one single convention** — entity/prop APIs take a "continuous foot position" and render with `tileToScreen` only (`render/placement.ts` `entityFootToScreen`); centering is the author's responsibility (bake n+0.5 into the config coordinates). Never mix 2 bases within a layer that shares depth-sorting — locked in by `tests/engine-render-placement.test.ts`

## vitest fails only in some shells (TypeError reading 'config' at describe)

- Symptom: `npm test` fails on every file during collection in some subagents' shells, even though the code is correct; the owner's machine + the main PowerShell run passes (node 24.13 + vitest 4.1.10)
- Cause: not yet pinned down — the environment of the spawned shell (not the code itself)
- Avoidance: if you hit this, run a bare smoke test — if that also fails, it's an env problem, not the code; don't waste time debugging your own code. Confirm the real gate on the main PowerShell

## npm run <script> fails: `'"node"' is not recognized` (env of the spawned shell)

- Symptom: `npm test` / `npm run lint` / postinstall (e.g. tsx) fails with `'node' is not recognized as an internal or external command` even though `node --version` works fine in bash
- Cause: when npm spawns cmd.exe to run a script/bin shim, node isn't on that subprocess's PATH (env of the spawned shell — not the code; same class as the vitest trap above)
- Avoidance: run the tool directly through node from bash — `node node_modules/vitest/vitest.mjs run`, `node node_modules/eslint/bin/eslint.js`, `node node_modules/next/dist/bin/next build`, or `node_modules/.bin/<bin>`; install deps that have a postinstall with `npm install ... --ignore-scripts` (e.g. tsx/esbuild — the platform binary already ships with the optional package). Confirm the real gate on the owner's main PowerShell

## Colyseus: client (colyseus.js) and server (colyseus) have different version numbers — schema must be matched exactly

- Symptom: `colyseus` latest = 0.17.x but `colyseus.js` latest = 0.16.22 (depends on `@colyseus/schema ^3`); pairing server 0.17 (schema 4) with client 0.16 (schema 3) risks decode failures (a schema major version bump = a different wire format)
- Avoidance (used by P0-07): pin **the 0.16 line on schema 3 on both sides** — `colyseus@0.16.5` + `@colyseus/schema@^3` (server) + `colyseus.js@0.16.22` (client, schema ^3). Confirm at runtime with a 2-client proof before moving on
- The schema decorator (`@type`) is a legacy PropertyDecorator → the server needs `experimentalDecorators: true` + `useDefineForClassFields: false` (server/tsconfig.json). **Buffer against Next**: `server/` must be in the root tsconfig's `exclude` + eslint's `globalIgnores`, otherwise next build/lint trips over the decorator/node globals

## tsx: running a script outside the project dir → can't find node_modules

- Symptom: `Cannot find module 'colyseus.js'` when running a proof script placed in scratchpad (outside the repo)
- Avoidance: place integration/proof scripts **inside the project** (e.g. a temp file at root, then delete it) or set `NODE_PATH` pointing at the repo's node_modules — node resolves modules upward starting from the file's location

## The combat damage formula must never leak into the client bundle (P1-05, TA §7/§16.1)

- Risk symptom: the client has the damage formula/balance values in its bundle → players reverse-engineer / fabricate results → server-authority breaks down (§7 economy risk)
- Cause it would happen: `src/game/combat/` is shared code (client glue like combat-stub.ts sits in the same folder as formula.ts/cast-validation.ts) — accidentally importing formula.ts from a client path, or making a barrel `index.ts` that re-exports everything = the formula tags along into the client bundle
- Avoidance (used by P1-05): `src/game/combat/formula.ts` = **server-only** (imported only from `server/rooms/**`) · **no barrel/index** in `src/game/combat/` · the client (combat-stub.ts / app.ts) may only import `hit-test.ts` (geometry) + `damage-number.ts` — **must not** import formula.ts/cast-validation.ts. The P1 monorepo doesn't yet have an import-graph test to separate the bundle → enforced via convention + a comment header ("SERVER-ONLY") + review. If a barrel is ever added to this folder, it must keep formula out of any export the client touches

## Importing server-only "data" leaks just as much as importing the formula (clientView() at runtime doesn't help the bundle)

- Symptom: the client does a static import of a file containing a **full SkillDefinition literal** (e.g. the original `WARRIOR_SKILLS`) and then calls `clientView()` to strip fields at runtime — but **the literal values (baseMultiplier 2.2, bossModifier, maxTargets, hitCount, pvpModifier, crowdControl) still get bundled into the browser JS** starting from the import line → open devtools/source and you can reverse-engineer the full balance (violates TA §7/§16.1)
- Cause: `clientView()` runs **after** the module is already loaded — the bundler has no way to know which fields will be stripped, so it bundles the entire object literal (tree-shaking doesn't strip properties inside an object that's actually used). "Stripped at runtime" ≠ "not in the bundle"
- Avoidance (used by P1-05): **split the data into 2 files from the start** — `src/game/skill/data/warrior-skills-server.ts` (full 37 fields, SERVER-ONLY, imported only by `server/**`+tests) · `src/game/skill/data/warrior-skills-client.ts` (ClientSkillView 28 fields, **contains zero server-only literals**, the client imports this one). Guard against drift with a test asserting `client == clientView(server)` (tests/game-skill-loader.test.ts). **Principle:** if a literal is a balance value/formula, the client must never import a file containing that literal — verify by grepping the import graph, don't trust a runtime transform

## tsx running the server: must pass --tsconfig server/tsconfig.json (otherwise decorators break)

- Symptom: `node node_modules/tsx/dist/cli.mjs server/index.ts` → `TypeError: Cannot read properties of undefined (reading 'constructor')` at the @colyseus/schema annotations
- Cause: tsx defaults to esbuild's modern (TC39) decorators; @colyseus/schema's `@type` is a legacy PropertyDecorator that needs experimentalDecorators + useDefineForClassFields:false (which lives in server/tsconfig.json)
- Avoidance: always run with `--tsconfig server/tsconfig.json` (matches `npm run dev:server`); proof/integration scripts must also go through a server run this way

## Reconnect token in-memory + StrictMode double-mount = refresh turns you into a new player + 2 tabs can't see each other (P1-07-fix)

- Symptom (owner hit this on a real browser): opening `/game` in 2 tabs — "เห็นกันบ้างไม่เห็นบ้าง ต้อง refresh เรื่อย ๆ ถึงจะขึ้น" (sometimes we see each other, sometimes not, have to keep refreshing before it shows up); closing a tab and reopening within 30s doesn't return to the same position
- Cause, 3 layers stacked:
  1. `reconnectionToken` is stored only in the net-client's memory → refresh/reopen = the token is lost → the new page always joins as a new player (never reconnects)
  2. refresh/close = the ws drops **unconsented** (no `room.leave()` call) → the server's `allowReconnection` holds the seat + the PlayerState becomes a "ghost" for 30s → repeated refreshes pile up ghosts until the room fills up (`channelCapacity` dev=8) → the matchmaker routes the new tab into CH.2, a different room = 2 tabs in different rooms, can't see each other; once 30s passes the ghost expires and the room frees up → refreshing again shows them = "it'll show up eventually"
  3. **StrictMode (dev)**: createEngine is async + destroy runs on cleanup → engine1 joins+persists the token, then engine1 is destroyed (a consented leave + clears the token) before engine2 → after a refresh, engine1 reconnects then leaves, dropping the seat; engine2 does a fresh join = position lost + a join/leave race fighting over the seat with itself
- Avoidance (used by the fix): (a) persist the token to **sessionStorage per-tab** (`src/engine/net/reconnect-store.ts` — **must not use localStorage**, 2 tabs would fight over the token → kicking each other out) + re-persist the timestamp on `pagehide`/`beforeunload` (not leaving = letting the connection drop unconsented so it can be reclaimed); on boot, try `client.reconnect(token)` first (planRejoin: the token is fresh + matches server/map/party) = reclaim the ghost seat instead of adding a new player → **no ghost pile-up, no room splitting**; a consented leave (SPA nav/map transition) = clears the token (prevents being pulled back to the old map) (b) prevent StrictMode double-mount with `setTimeout(0)` in `GameCanvas.tsx` — StrictMode's cleanup runs (clearTimeout) before the timer fires → the engine really is only created once, no transient engine churn
- Semantics note: closing a tab and **not** reopening it means the ghost lingers, visible to others, for at most the grace period (30s, §59.1) per spec — unavoidable if reconnect is to work at all (the seat has to be held unconsented). Do not fix this with a consented-leave on unload (it would break reconnect entirely)

## Client doesn't adopt the authoritative position after join/reconnect = warp + exit doesn't fire (issue #1/#2)

- Symptom (owner hit this on a real browser): (1) after a refresh the character appears at the spawn point, but as soon as you start walking, "วาร์ปกลับจุดเดิม" (it warps back to the previous spot); (2) while online, walking onto the glowing exit marker — "ไม่มีอะไรเกิดขึ้น" (nothing happens) (no fade, no map crossing)
- Cause (one single root, 2 symptoms): after join/reconnect, `status.state="online"` fires immediately (at JOIN_ROOM) **before** ROOM_STATE arrives → the client doesn't yet know the real position the server is holding. `snapshotChanged(null, snap)` is always true → the first tick fires MSG_MOVE from **the client's spawn** (mountWorld places it at map.spawnPoint) while the server's tracker is still holding the old position (a reconnect within grace). Result: (1) the server sees it as a teleport/speed violation → MSG_POSITION_CORRECTION snaps the client back to the held position = a "warp"; (2) the server keeps holding that position → the client walks onto the exit (client-side) but **the server-side authoritative position never actually entered the exit area** → `checkExit`/MSG_MAP_TRANSITION never fires. **Everything on the server side is normal** (proof: walking for real with each step ≤ the speed cap → the server fires the transition + 0 corrections; reconnecting → state.players[self] = the held position) — the bug is that the client doesn't accept the server's position as its starting point
- Avoidance (used by the fix): (a) net-client adds an `onSelfSpawn` handler — it fires when self first enters the room state for a given connection (players.onAdd self branch, immediate=true covers both a fresh join and a reconnect) → the caller (`app.ts`) calls `player.applyCorrection(snap.tx,snap.ty)` to snap position+camera to the authoritative position before moving (fresh=spawn, idempotent · reconnect=the held position). (b) gate `sendMove` with `canSendLocalMove(state, selfAdopted)` (sync.ts, pure) — `selfAdopted` resets to false on every wire, becomes true on onSelfSpawn → **never send a move before adopting** (closes the sub-frame race where the first tick could fire before ROOM_STATE). **Principle:** the colyseus join promise resolves at JOIN_ROOM, not ROOM_STATE → don't assume state is ready the instant you're online; the local player's position — the server is the source of truth from frame one, not map.spawnPoint

## Attacks don't land on mobs: interp lag makes melee arcs meaningless at point-blank range (P1-05.1)

- Symptom (owner hit this on a real browser): pressing Space/tapping a mob plays the attack animation, but "ไม่มีเลขดาเมจ" (no damage number shows up) very often (especially for mobs that are chasing)
- Cause (measured for real with a proof script — hit rate ~23–52%, empty ~48–77%, **reject 0**): the client aims/faces (`faceToward`+aim) based on **the mob's image ~120ms behind in the interp buffer**, but the server judges the arc from the mob's **current** position. At point-blank range (dist ~1.2), a small movement by the mob translates into a huge swing in angle → the actual angle between facing and (current mob position − caster) has a **median of ~161°, p90 ~170°** (nearly opposite — the mob is running toward/past the player). All the empty hits are **arc misses within range** (rawDist ≤ radius but falls outside the 60° cone) — not out_of_range (the radius is wide enough). MSG_CAST_REJECTED stays silent → it just looks like "whiffing"
- Avoidance (used by the fix): `CombatBalanceConfig.hitTolerance` (a Design Knob, PENDING OWNER) is fed into `findHits`/`resolveSkillHits` (server only — the client's offline dummy uses ZERO_HIT_TOLERANCE = the true shape as displayed): (1) **`pointBlankRadiusTiles`** (1.4) — a target within the real radius **and** closer than this always hits without checking the arc (a mob stuck to you always connects, giving a melee feel); (2) `rangePaddingTiles` (0.35) added to the radius to account for the mob moving during lag; (3) `arcPaddingDegrees` (20) extra angle for the ring just beyond point-blank. **Principle to prevent hitting behind/through:** point-blank is small (~melee range) → a target farther than that must still be inside the arc (a mob 3 tiles behind the cone still does not get hit — a guardrail test enforces this); the padding doesn't inflate the radius unrealistically (beyond radius+padding still misses). **Never hardcode the damage/arc formula — every value must live in config**. After the fix, hit rate is ~98%
- Debug: `getNetDebugInfo().castRejectCount` (net-client counts MSG_CAST_REJECTED) is shown in the DebugOverlay (F3) on the "cast rejects" line — >0 means an attack was rejected by the server (distinct from an empty-hit, which isn't a reject)

## A proof/temp script placed at the repo root that imports server/** → `next build` type-check breaks (decorator)

- Symptom: `next build` (and a raw `tsc -p tsconfig.json`) fails with `TS1240 Unable to resolve signature of property decorator` at `server/schema/MapRoomState.ts` (the `@type` legacy decorator) even though you never touched any server file — the build says "Compiled successfully" but then fails at "Running TypeScript"
- Cause: the root `tsconfig.json`'s `include: ["**/*.ts"]` catches temp files at the root (e.g. `proof-hitbox.ts`); `exclude:["server"]` only protects root-level files **but doesn't protect files that get imported** — a temp script doing `import "./server/rooms/MapRoom"` pulls `server/**` (legacy-decorator schema) into the root tsconfig's program (which has no experimentalDecorators) → TS1240. (Verify with `tsc --explainFiles | grep -A2 MapRoomState`)
- Avoidance: a proof/integration script that imports server/** must **always be deleted before running the build/tsc gate** (it's temp-only and never committed anyway) — it's fine to place it at the root while running (tsx-resolve-trap #41) but it must not remain in place during typecheck. Confirm `git status` is clean of temp files before closing out the task

## The movement validation floor must be ≥ 1 send interval, otherwise a single full step gets rejected = walking jitters then stops (prod, 2026-07-12)

- Symptom (owner hit this on real **production** — Render free tier + a real network connection; normal on local): click-to-move, then "เดินกระตุก ๆ แล้วหยุด ไม่ถึงจุดที่คลิก" (walks jerkily, then stops, doesn't reach where I clicked)
- Cause (proven on prod): the client sends MSG_MOVE at 12Hz = each step is `speed/sendHz = 4/12 ≈ 0.333 tile`. On a real network/free-tier CPU, several messages hiccup and arrive at the server **bunched together** (arrival compression) → the `elapsedMs` the server measures between two bunched messages ≈ 0 → gets `clamp`ed up to the floor `minElapsedMs`. At the old floor of **50ms**: allowance = `4 × 0.05 × 1.5 = 0.30 < 0.333` → a single full step **gets rejected, reason=speed** → MSG_POSITION_CORRECTION → the client snaps + (previously) drops the path = jitters then stops. Proof: sending bunched pairs, even at a legal average speed → 8/15 get rejected; a clean cadence → 0
- Avoidance (used by the fix): **the `minElapsedMs` floor must be ≥ 1 send interval** (83ms @12Hz). Set it to **90** → allowance@floor = `4 × 0.09 × 1.5 = 0.54 ≥ 0.333` → a single full step arriving bunched still always passes. Anti-teleport is still enforced separately via `teleportThresholdTiles=3` (an absolute cap independent of elapsed) → raising the floor does **not** open a speed-hack window (a genuine delta-1.0 cheat still gets rejected). **Principle:** the speed-cap floor must never be lower than the send interval — otherwise burst arrival makes one normal step look like a teleport
- Second layer (done alongside): `applyCorrection` previously always dropped the path → a correction during click-to-move = the click gets lost. Fix: after a correction, **replan A* to the same goal** from the new position (`src/engine/player/correction-resume.ts` `planCorrectionResume`, reuses findPath) → walking continues on its own; no goal (WASD/fresh join) = no-op; unreachable = cancel as before
- Debug: `getNetDebugInfo().correctionCount` (F3 overlay) spiking during normal walking = a floor/interval mismatch (not an actual speed hack)

## Colyseus onAuth must be **static** + reconnect never calls onAuth (P2-04 WS handshake)

- Symptom that would occur if you guessed: writing `onAuth()` as an instance method on the Room → Colyseus **silently ignores it** (logs `❌ onAuth() defined at the instance level will be ignored`) → the token is never verified, security doesn't work at all, but the game still lets you join = looks like it's passing
- Cause (confirmed from `@colyseus/core/build/MatchMaker.js` 0.16): `callOnAuth` calls `roomClass["onAuth"]` (**static**) during **matchmaking**, before the seat is even created — `authContext = { token, headers, ip }` (the token comes from the `_authToken` query param/Bearer header; **not** directly from joinOptions). A truthy return value gets stored in `client.auth` (the instance's `onJoin(client, opts, client.auth)` can read it afterward); a falsy value/throwing ServerError rejects the join
- **reconnect (allowReconnection) never goes through onAuth** — it reuses the old seat + `previousClient.auth` → the token must only ever be attached on **fresh join** (net-client attaches it in `freshJoin`, not `beginReconnect`/`boot.reconnect`)
- Approach P2-04 uses: read the token from `options.token` (the brief specified attaching it in joinOptions), falling back to `context.token`; verify with `verifyRealtimeToken` (reusing `src/server/auth/**` directly — server/tsconfig can import across `../src/**`, the file is pure node:crypto with no Next dependency, **no shared module needed**). rate-limit/origin/decision = a pure module in `server/security/**` (has unit tests); the DB session lease is best-effort (DATABASE_URL not set → skipped, must never break the join — dev/e2e have no DB)

## Session takeover close code is terminal on the client side (must not auto-reconnect in a loop) (P2-04, Storage §4.2)

- Symptom that would occur if you guessed: the server kicks the old session with `client.leave(4001)` (SESSION_TAKEN_OVER), but the client sees code≠4000 → enters the auto-reconnect path (P1-07) → reconnect/fresh-join → **takes the new one over right back** → 2 tabs fighting over the seat in an endless loop
- Avoidance (used by the fix): (a) net-client's `onLeave`: `code === WS_CLOSE_SESSION_TAKEN_OVER` → **terminal** (clears the token+store, goes offline, `lastError="session_taken_over"`), must not reconnect. (b) server's `onLeave`: a sessionId that was taken over must be **deleted immediately, never entering grace** (an intentional kick ≠ a dropped connection) — mark it in a set before calling `client.leave`, because onLeave only ever receives `consented:boolean` (= code===4000) and never sees the real code (Colyseus's `_onLeave` converts code→consented). Releasing the lease/registry is done session-scoped (`deleteMany where sessionId`) → the kicked-out old session never deletes the new session's lease (takeover-wins)

<!-- Add new traps below as you encounter them for real -->

## P2-05: saving during a map transition must guard against onLeave overwriting it

checkExit (crossing a map) already saves the **destination** position, but the transition makes the client leave the old room as a consented leave → if onLeave saved normally, it would immediately overwrite the destination with the **old map's** position (the player refreshes and bounces back to the old map). So MapRoom marks `transitioningSessions` during checkExit, and onLeave skips the save for that session (cleared on removePlayer). Anyone touching the save cycle/transition must preserve this invariant — enforced by tests in `tests/server-characters-persistence.test.ts`.

## PowerShell writing files = BOM → migration SQL breaks + the real DB turns out to be MariaDB

- `Out-File -Encoding utf8` on PowerShell 5.1 writes **UTF-8 with a BOM** → MySQL/MariaDB can't read migration.sql (error 1064 right at `﻿-- CreateTable`) — for any file another tool will read, use the Bash/Write tool, or strip the BOM (`sed -i '1s/^\xEF\xBB\xBF//'`) · hit this for real on the first `prisma migrate deploy` (2026-07-12); fixed with `prisma migrate resolve --rolled-back` and redeployed
- **The real DB on Hostinger is MariaDB, not MySQL 8** (TA L3 says MySQL 8) — the Prisma provider `mysql` still works fine, and the collation `utf8mb4_unicode_ci` we use is supported; **do not use MySQL-8-only features** (e.g. the `utf8mb4_0900_*` collation family, some forms of CHECK constraint) — if you hit anything odd, check the MariaDB manual first

## Passing `fetch` as a DI property/callback = "Illegal invocation" in the browser (Node never catches this)

- Symptom: injecting `fetchFn: fetch` and having the receiving side call `deps.fetchFn(...)` → the browser throws `TypeError: Illegal invocation` (this=deps, not window) → if it's inside a best-effort try/catch, it gets silently swallowed; vitest (node/undici) **doesn't brand-check `this`**, so all tests pass → the bug only shows up in a real browser. Real case: the /game entry gate was completely paralyzed — logged in but not redirected to /hub, entering the game anonymously at the starting point (owner-report#6 round 3, 2026-07-12)
- Avoidance: never pass `fetch` directly as a property/callback — wrap it as `(input, init) => fetch(input, init)` (or `fetch.bind(globalThis)`); the receiving side should call it via a local binding (`const f = deps.fetchFn; f(...)`), not `deps.fetchFn(...)` — guard at both layers (both GameCanvas and boot-gate already do this)
- Tests have to simulate the brand-check themselves (`makeBrowserFetch` in `tests/app-game-boot-gate.test.ts`) because undici doesn't throw — a plain mock can't catch this class of regression

## router.refresh() doesn't reset a client component's useState = state carries over across login/logout

- Symptom: logging out then logging back in at /hub → the character list doesn't show up (empty) until you refresh the entire page (owner-report#7 round 3, 2026-07-12)
- Cause: the Server Component re-runs on `router.refresh()` and sends genuinely fresh props, but React **preserves the existing client component instance** (its type + position in the tree don't change) → the `useState(initialProps)` initializer never re-runs → state copied from props holds onto the value from the previous round (e.g. `[]` from before you were logged in)
- Avoidance: a component that seeds state from server props and straddles an auth boundary must bind its `key` to an identity (`key={session.accountId}` / `key="anon"` — see `src/app/hub/page.tsx`) so React remounts it when "the user changes" · don't fix this with a useEffect syncing props→state (runs into races/flicker)
