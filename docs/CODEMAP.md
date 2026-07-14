# CODEMAP — module ownership

> Use targeted grep for symbol truth (`AI.md`). Update for added/moved/deleted files. Archive: `docs/history/2026-07-13-codemap-archive.md`.

## src/engine (foundation layer — TA §17, plain TS + PixiJS, no React/Next.js)

- `src/engine/config.ts` — barrel — Design Knobs/types (EngineConfig, DEFAULT_ENGINE_CONFIG); domain modules under `src/engine/config/` (scene, player, input, mob, combat, combat-feel, net, engine, world), re-exported
- `src/engine/runtime/` — engine lifecycle: transition (map fade), resize, assets, debug-info · LW0: world-clock (§3) + weather-overlay (§4)
- `src/engine/runtime/app.ts` — createEngine(): per-map world (player+mobs+combat+net+input), master tick, F3/F4, pressAttack/effect-quality knobs (P2-15)
- `src/engine/iso/` — iso projection + depth-sort math (**never-downgrade zone**)
- `src/engine/movement/` — mover (stepMovement), direction resolver, path-follower
- `src/engine/pathfinding/` — A* on the iso grid (click-to-move)
- `src/engine/player/` — local player pixi glue + correction-resume (server reconcile)
- `src/engine/net/` — colyseus glue, interp buffer, reconnect store, remote player/attack, party, visibility (P2-13)
- `src/engine/net/net-client.ts` — createNetClient(): connect/join, reconnect (§59.1), self-adopt gating, cast/skill messages
- `src/engine/animation/` — animation manifest (5-dir+mirror), sprite animator, placeholder textures, texture-set (non-owning handles)
- `src/engine/assets/` — runtime atlas loader/registry (engine-scope, fail-soft → placeholder)
- `src/engine/config/render.ts` — pixelate knob (on/scale/nearest-filter/CSS)
- `src/engine/render/` — depth registry, camera, scene graph, pool, screen shake, exit marker, afk-label, name-label, nameplate-layer (full-res world-label overlay, keeps Thai glyphs crisp above the D-065 0.5x world pass) · `src/engine/audio/` SFX
- `src/engine/map/` — MapConfig schema/loader/registry + map1/city-hub/p0-test-field configs
- `src/engine/input/` — keyboard (WASD+attack) + joystick→8-dir intent + target-assist (per-mode click radius, Combat Bible §3, P2-15)

## src/game (combat/entity logic on top of the engine)

- `src/game/mob/` — mob sim, AI, views, and nameplate LOD/fade
- `src/game/mob/name-catalog.ts` — mobType → Thai nameplate name + rank (undefined = no nameplate)
- `src/game/npc/` — LW0 static NPC bark: catalog + nearest-click test + view manager (placeholder+label)
- `src/game/item/icon-catalog.ts` — itemId → icon URL map (null = show raw id)
- `src/game/skill/` — SkillDefinition (37 fields, GS §50.1) loader + server/client view split (TA §16.1)
- `src/game/skill/data/warrior-skills-server.ts` (+ client sibling) — **SERVER-ONLY vs CLIENT-SAFE split**: server literals must never reach the client bundle
- `src/game/combat/` — hit-test, cast-validation, damage-number/hit-stop/screen-shake juice, combat-stub, target-engage
- `src/game/combat/formula.ts` — **PURE + SERVER-ONLY** damage formula (§15.2/§50.1.1) — never in the client bundle

## src/ui + src/app (React overlay + Next.js shell)

- `src/app/` — root layout, landing page, globals.css
- `src/app/game/` — route /game: server shell → GameCanvas
- `src/app/game/boot-gate.ts` — **pure DI** entry gate (Storage §5): redirects to /hub when authed with no character; reads fresh character/map before mount
- `src/app/hub/` — Game Hub route: auth/upgrade panels, character grid/create, enter-game
- `src/app/api/` — auth endpoints (guest/register/login/upgrade/session/rt-token) + characters (list/create)
- `src/ui/` — GameCanvas (mount bridge), DebugOverlay (F3), debug-overlay-logic (pure reducer)
- `src/ui/store/` — Zustand vanilla store bridge (HUD state, engine→UI one-way, no React import in the vanilla file)
- `src/ui/theme/rarity.ts` — rarity color tokens (D-043)
- `src/ui/components/` — token-driven presentational kit (P2 UI spec §4): PanelFrame, Button, TextInput, ItemSlot, Tooltip, ConfirmDialog(+hold-to-confirm), Toast
- `src/ui/panels/` — shared panel framework (desktop float / mobile sheet, z-order, keydown block; DG §13) + hud-layout (P2-15). Provider in `src/ui/GameCanvas.tsx`
- `src/ui/panels/` subdirs (inventory/enhancement/shop/storage/help/mobile/settings/skillbar/status/minimap/world-status/dialogue) — per-feature: bag/equip · reinforcement · shop · storage+delivery · help · mobile/settings · skillbar (§8.3) · status (§8.2) · minimap (§8.4) · world-status LW0 chip (§18) · dialogue LW0 bark

## server (Colyseus realtime process, separate from Next — L4)

- `server/index.ts` — Colyseus Server entry: defines MapRoom + `.filterBy(['mapId','partyId'])`, listens ws://localhost:2567
- `server/rooms/` — MapRoom lifecycle glue (onCreate/onJoin/onMessage/onLeave/onDispose)
- `server/rooms/MapRoom.ts` — the room: movement validation, mob sim tick, combat authority, reconnect grace, map transition, safe-zone cap
- `server/schema/` — @colyseus/schema state (PlayerState/MobState/MapRoomState)
- `server/matchmaking/` — pure channel-number allocator (§59.3 auto-assign)
- `server/security/` — WS handshake (JWT+origin+rate limit), session takeover/lease (Bible 5.2)
- `server/characters/` — persistence-decision (pure) + character-state load/upsert (best-effort, no DB = in-memory) + `server/characters/progress-carrier.ts` (cross-room + refresh/takeover level/exp carrier)
- `server/inventory/` — inventory best-effort DB glue for MapRoom (snapshot on join; capacity + item catalog; mutations strict) + P2-10 reinforcement knobs
- `server/economy/` — kill-reward wiring: mobType→monsterId map + Prisma seams (ledger/inventory/drop-audit); EXP always, gold/drops/audit only with DB + shop-state (P2-11 config + map availability)
- `server/db/` — Prisma client singleton (server-only) + ledger contract (getBalance/appendEntry)
- `server/config/` — P2-09 server-authoritative Design Knobs: economy (drop/EXP/Gold/enhancement) + reinforcement (pity/fragment/NO_REINFORCEMENT) + versioned loader + storage (P2-17)
- `prisma/migrations/` — 0001_init (13 tables) · 0002_shop_ledger_reasons (LedgerReason += shop_buy/shop_sell)

## src/shared + src/server (client↔server contracts + Next server-only)

- `src/shared/` — net-protocol (wire contract), reconnect/movement-validation (pure), character-name/-class validators, afk (P2-13)
- `src/server/db.ts` — Prisma client singleton on the Next API side (**server-only**, must never enter the client bundle)
- `src/server/auth/` — token/session-cookie, password hash/policy, email normalize, auth service/upgrade state machine
- `src/server/characters/` — repository (memory/prisma) + service (slot cap, cross-account guard)
- `src/server/inventory/` — item catalog (server-authoritative Design Knob: slot + stat bonus) + equipment-stats (pure combat aggregation, folds enhancement +N curve §16.3.1) + repository (memory/prisma: FOR UPDATE + optimistic `version`, `commitEnhancement`/`grantItems` loot→bag) + service (equip/unequip/move/swap/snapshot) + enhancement-service (P2-10) + storage-service (P2-17)
- `src/server/economy/` — pure P2-09 resolvers: exp (level-diff/party/level-up/baseline D-055) · drop-roll (weighted pools + guaranteed + audit + reinforcement guard) · kill-reward (injected seams, no DB) · shop (P2-11 buy/sell, compensating refund)

## scripts + tests

- `scripts/e2e/` — permanent E2E harness (Colyseus client, works local/prod): `scripts/e2e/lib.mjs` helpers, `scripts/e2e/smoke.mjs` 8-step scenario
- `scripts/svg/` — SVG-first pipeline (SVG-01, D-042/D-043): sanitizer + palette lint (32-color/rarity) + manifest gen (engine 5-dir+mirror + Asset Bible sec19) + `scripts/svg/raster-resvg.ts` (@resvg/resvg-js backend, builds PNG atlases + icons); svg:lint/svg:build CLIs
- `svg/` — SVG source tree + `svg/README.md` contract; entity folders carry entity.json; `_`-prefixed folders = WIP, skipped by build; build output mirrors to `public/assets/` (manifests/atlases/icons, committed)
- tests/ mirrors source module names — grep the test dir.
