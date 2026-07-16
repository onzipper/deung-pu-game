# CODEMAP — module ownership

> Use targeted grep for symbol truth (`AI.md`). Update for added/moved/deleted files. Archive: `docs/history/2026-07-13-codemap-archive.md`.

## src/engine (foundation layer — TA §17, plain TS + PixiJS, no React/Next.js)

- `src/engine/config.ts` — barrel — Design Knobs/types (EngineConfig, DEFAULT_ENGINE_CONFIG); domain modules under `src/engine/config/` (scene/player/auto-pilot/companion/input/mob/combat/combat-feel/net/engine/world)
- `src/engine/runtime/` — engine lifecycle: transition (map fade), resize, assets, debug-info · LW0: world-clock (§3) + weather-overlay (§4)
- `src/engine/runtime/app.ts` — per-map world + master tick; PR2 buffers one manual intent until schema+ack return actor authority
- `src/engine/iso/` — iso projection + depth-sort math (**never-downgrade zone**)
- `src/engine/movement/` — mover (stepMovement), direction resolver, path-follower
- `src/engine/pathfinding/` — A* on the iso grid (click-to-move)
- `src/engine/player/` — local player/correction + autonomy lock/takeover intent + auto-pilot (D-037, ≠ bot) + companion.ts (entity creation, disabled by default, D-068)
- `src/engine/net/` — Colyseus glue, stable controller→actor self binding, reconnect/interpolation, party, visibility
- `src/engine/net/net-client.ts` — connect/reconnect, stable self actor, cast + Bot takeover/checkpoint/resume messages
- `src/engine/animation/` — animation manifest (5-dir+mirror), sprite animator, placeholder textures, texture-set (non-owning handles)
- `src/engine/assets/` — runtime atlas loader/registry (engine-scope, fail-soft → placeholder)
- `src/engine/config/render.ts` — pixelate knob (on/scale/nearest-filter/CSS)
- `src/engine/render/` — depth registry, camera, scene graph, pool, screen shake, exit marker, afk-label, name-label, nameplate-layer (full-res world-label overlay, Thai crisp above D-065 0.5x) · `src/engine/audio/` SFX
- `src/engine/map/` — MapConfig schema/loader/registry + map1/map2/map3/map4/city-hub/p0-test-field configs
- `src/engine/input/` — keyboard (WASD+attack) + joystick→8-dir intent + target-assist (per-mode click radius, Combat Bible §3, P2-15)

## src/game (combat/entity logic on top of the engine)

- `src/game/mob/` — mob sim, AI, views, nameplate LOD/fade · damage-contribution.ts = pure reward-eligibility tracker (§10.2/§10.3) + boss-break party size
- `src/game/mob/name-catalog.ts` — mobType → Thai nameplate name + rank (undefined = no nameplate)
- `src/game/npc/` — LW0 static NPC bark: catalog + nearest-click test + view manager (placeholder+label)
- `src/game/item/icon-catalog.ts` — itemId → icon URL map (null = show raw id)
- `src/game/skill/` — SkillDefinition (37 fields, GS §50.1) loader + server/client view split (TA §16.1)
- `src/game/skill/data/warrior-skills-server.ts` (+archer+client views) — SERVER-ONLY vs CLIENT-SAFE; MapRoom loads skills per class
- `src/game/combat/` — hit-test, cast-validation, damage-number/hit-stop/screen-shake juice, combat-stub, target-engage
- `src/game/combat/skill-vfx.ts` — F4 skill VFX playback (client-only)
- `src/game/combat/formula.ts` — **PURE + SERVER-ONLY** damage formula (§15.2/§50.1.1) — never in the client bundle

## src/ui + src/app (React overlay + Next.js shell)

- `src/app/` — root layout, landing page, globals.css
- `src/app/game/` — route /game: server shell → GameCanvas; `src/app/game/boot-gate.ts` = DI entry gate (Storage §5)
- `src/app/hub/` — Game Hub route: auth/upgrade panels, character grid/create, enter-game
- `src/app/api/` — auth (guest/register/login/upgrade/session/rt-token) + characters (list/create)
- `src/ui/` — GameCanvas (mount bridge), DebugOverlay (F3), debug-overlay-logic (pure reducer)
- `src/ui/store/` — Zustand vanilla store bridge (HUD state, engine→UI one-way, no React import)
- `src/ui/theme/rarity.ts` — rarity color tokens (D-043)
- `src/ui/components/` — token kit §4: PanelFrame, Button, TextInput, ItemSlot, Tooltip, ConfirmDialog(+hold-to-confirm), Toast
- `src/ui/panels/` — panel framework (float/sheet, z-order, keydown; DG §13) + hud-layout/hud-icon-catalog.ts, provider in `src/ui/GameCanvas.tsx`
- `src/ui/panels/` subdirs — inventory/enhancement/shop/storage/help/mobile/settings · skillbar/status/minimap/auto-pilot(D-037)/world-status/dialogue(LW0 bark)/journal(C3 log+Achievement) · bot(7b-UI, 4 tabs: status/profiles/reports/packages)

## server (Colyseus realtime process, separate from Next — L4)

- `server/index.ts` — Colyseus Server entry: defines MapRoom + `.filterBy(['mapId','partyId'])`, listens ws://localhost:2567
- `server/rooms/` — MapRoom lifecycle glue (onCreate/onJoin/onMessage/onLeave/onDispose)
- `server/rooms/MapRoom.ts` — stable real-actor authority/controller attach, movement/combat/mob sim, reconnect, transition, capacity
- `server/schema/` — room state + controller session→stable actor binding
- `server/matchmaking/` — pure channel-number allocator (§59.3 auto-assign)
- `server/security/` — WS handshake + ordered per-account takeover/lease
- `server/characters/` — stable actor ownership/controller mode (`server/characters/authority.ts`) + state/progress persistence
- `server/inventory/` — best-effort DB glue for MapRoom (snapshot on join; capacity + item catalog; mutations strict) + P2-10 reinforcement knobs
- `server/economy/` — kill-reward wiring: mobType→monsterId + Prisma seams (ledger/inventory/drop-audit); EXP always, gold/drops/audit w/ DB · shop-state · milestones (C1) · achievements (C2b) · reinforcement-pity (B4 §4.2/§3.5)
- `server/bot/` — real-actor controller; `server/bot/continuity.ts` = PR3 reducer/revision fence; `server/bot/policy.ts` + runtime = PR4 Free one-area/one-goal safe-stop settlement into WAITING_FOR_OWNER/COMPLETED/FAILED; `server/bot/recovery.ts` = PR5 recovery planner; `server/bot/town-trip.ts` = PR5 town-trip warp (D-069/D-070). PR5–7 workflow/UX pending
- `server/db/` — Prisma client singleton (server-only) + ledger contract (getBalance/appendEntry)
- `server/config/` — Design Knobs: economy + reinforcement + loader + storage + achievements + bot (7b: caps/prices/pockets/efficiency)
- `prisma/migrations/` — 0001_init (13 tables) · 0002_shop_ledger_reasons · 0003_progression · 0004_bot (tier_state/profiles/sessions)

## src/shared + src/server (client↔server contracts + Next server-only)

- `src/shared/` — net-protocol + bot-continuity wire contracts, reconnect/movement-validation, character validators, afk (pure)
- `src/server/db.ts` — Prisma client singleton on the Next API side (**server-only**, must never enter the client bundle)
- `src/server/auth/` — token/session-cookie, password hash/policy, email normalize, auth service/upgrade state machine
- `src/server/characters/` — repository (memory/prisma) + service (slot cap, cross-account guard)
- `src/server/inventory/` — item catalog (slot/stat bonus; + reinf/fragment materials) + equipment-stats (+N curve §16.3.1) + repository (memory/prisma; optimistic `version`; commit{Enhancement,FragmentExchange}/grantItems) + service (equip/move/snapshot) + enhancement/fragment-exchange(B4 5→1)/storage services
- `src/server/economy/` — pure P2-09 resolvers: exp · drop-roll (pools+guaranteed+audit+guard) · kill-reward (injected seams) · reinforcement-pity (B4) · shop · milestone (C1) · achievement-engine (C2b)

## scripts + tests

- `scripts/e2e/` — Colyseus local/prod harness; smoke covers stable actor binding
- `scripts/svg/` — SVG-first pipeline (SVG-01, D-042/D-043): sanitizer + palette lint (32-color/rarity) + manifest gen (engine 5-dir+mirror + Asset Bible sec19) + `scripts/svg/raster-resvg.ts` (@resvg/resvg-js backend, builds PNG atlases + icons); svg:lint/svg:build CLIs
- `svg/` — SVG source tree + `svg/README.md` contract; entity folders carry entity.json; `_`-prefixed folders = WIP, skipped by build; build output mirrors to `public/assets/` (manifests/atlases/icons, committed)
- tests/ mirrors source names; `tests/server-character-authority.test.ts` guards stable actor/no-clone + takeover races.
