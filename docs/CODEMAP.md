# CODEMAP — orientation only: which module owns what.

> For symbol-level truth, grep `src/`, `server/`, `tests/` (see `AI.md` Search rules).
> Update on file add/move/delete (path-guard enforced). Full pre-restructure detail: `docs/history/2026-07-13-codemap-archive.md`.

## src/engine (foundation layer — TA §17, plain TS + PixiJS, no React/Next.js)

- `src/engine/config.ts` — barrel — Design Knobs/types (EngineConfig, DEFAULT_ENGINE_CONFIG); domain modules under `src/engine/config/` (scene, player, input, mob, combat, combat-feel, net, engine), re-exported here
- `src/engine/runtime/` — engine lifecycle: transition (map fade), resize, assets, debug-info
- `src/engine/runtime/app.ts` — createEngine(): per-map world (player+mobs+combat+net+input), master tick, F3/F4, pressAttack/effect-quality knobs (P2-15)
- `src/engine/iso/` — iso projection + depth-sort math (**never-downgrade zone**)
- `src/engine/movement/` — mover (stepMovement), direction resolver, path-follower
- `src/engine/pathfinding/` — A* on the iso grid (click-to-move)
- `src/engine/player/` — local player pixi glue + correction-resume (server reconcile)
- `src/engine/net/` — colyseus glue, interp buffer, reconnect store, remote player/attack, party, visibility (P2-13)
- `src/engine/net/net-client.ts` — createNetClient(): connect/join, reconnect (§59.1), self-adopt gating, cast/skill messages
- `src/engine/animation/` — animation manifest (5-dir+mirror), sprite animator, placeholder textures, `src/engine/animation/texture-set.ts` (non-owning texture handles)
- `src/engine/assets/` — runtime atlas loader/registry (engine-scope, fail-soft: missing asset → placeholder, never crash): atlas-format, collect, atlas-loader, registry
- `src/engine/config/render.ts` — pixelate knob (on/scale/nearest-filter/CSS)
- `src/engine/render/` — depth registry, camera, scene graph, object pool, screen shake, exit marker, afk-label (P2-13)
- `src/engine/map/` — MapConfig schema/loader/registry + map1/city-hub/p0-test-field configs
- `src/engine/input/` — keyboard (WASD+attack) + joystick→8-dir intent + target-assist (per-mode click radius, Combat Bible §3, P2-15)

## src/game (combat/entity logic on top of the engine)

- `src/game/mob/` — spawn/wander, AI (aggro/leash/LOD), authoritative sim, view manager
- `src/game/item/icon-catalog.ts` — itemId → icon URL map (null = show raw id)
- `src/game/skill/` — SkillDefinition (37 fields, GS §50.1) loader + server/client view split (TA §16.1)
- `src/game/skill/data/warrior-skills-server.ts` (+ client sibling) — **SERVER-ONLY vs CLIENT-SAFE split**: server literals must never reach the client bundle
- `src/game/combat/` — hit-test, cast-validation, damage-number/hit-stop/screen-shake juice, combat-stub, target-engage
- `src/game/combat/formula.ts` — **PURE + SERVER-ONLY** damage formula (§15.2/§50.1.1) — must never be imported into the client bundle

## src/ui + src/app (React overlay + Next.js shell)

- `src/app/` — root layout, landing page, globals.css
- `src/app/game/` — route /game: server shell → GameCanvas
- `src/app/game/boot-gate.ts` — **pure DI** entry gate (Storage §5): redirects to /hub when authed with no character; reads fresh character/map before mount
- `src/app/hub/` — Game Hub route: auth/upgrade panels, character grid/create, enter-game
- `src/app/api/` — auth endpoints (guest/register/login/upgrade/session/rt-token) + characters (list/create)
- `src/ui/` — GameCanvas (mount bridge), DebugOverlay (F3), debug-overlay-logic (pure reducer)
- `src/ui/store/` — Zustand vanilla store bridge (HUD state, engine→UI one-way, no React import in the vanilla file)
- `src/ui/theme/rarity.ts` — rarity color tokens (D-043)
- `src/ui/panels/` — shared panel/window framework (P2-preface, DG spec §13): panel-stack (z-order reducer) + PanelContext (`usePanelManager`, blocks keydown while open) + Panel (desktop float / mobile sheet) + use-media-query + hud-layout (responsive HUD slots, P2-15). `PanelProvider` in `src/ui/GameCanvas.tsx`.
- `src/ui/panels/inventory/` — inventory/equipment (P2-07): inventory-view (pure) + InventoryPanel (bag grid, equip/unequip) + InventoryHudButton ("I"). Hosts "เสริมแกร่ง" button.
- `src/ui/panels/enhancement/` — guaranteed reinforcement (P2-10, §2.4): enhancement-view (8-state, R8 hint) + EnhancementPanel/HudButton + enhancement-target-context. **P2: always `NO_REINFORCEMENT` (R8/D-052) — inert.**
- `src/ui/panels/shop/` — NPC shop (P2-11): shop-view (pure) + ShopPanel (buy/sell) + ShopHudButton (available-only). HudState shop/gold.
- `src/ui/panels/storage/` — storage + delivery box (P2-17): storage-view (pure) + StoragePanel (คลัง deposit/withdraw, กล่องส่งของ claim) + StorageHudButton (available-only). HudState storage/delivery.
- `src/ui/panels/help/` — Guidance "DG lite" (P2-12, client-only): help-articles + guidance-rules (§7/§9) + tutorial-checklist + guidance-preferences + HelpPanel/HudButton/ContextHelpButton + help-focus-context.
- `src/ui/panels/mobile/` — mobile controls (P2-15): VirtualJoystick + AttackButton (mobile-only) + MobileOsNotice show-once.
- `src/ui/panels/settings/` — effect quality / screen shake toggle (P2-15): SettingsPanel/SettingsHudButton + effect-quality-preference (localStorage).

## server (Colyseus realtime process, separate from Next — L4)

- `server/index.ts` — Colyseus Server entry: defines MapRoom + `.filterBy(['mapId','partyId'])`, listens ws://localhost:2567
- `server/rooms/` — MapRoom lifecycle glue (onCreate/onJoin/onMessage/onLeave/onDispose)
- `server/rooms/MapRoom.ts` — the room: movement validation, mob sim tick, combat authority, reconnect grace, map transition, safe-zone cap
- `server/schema/` — @colyseus/schema state (PlayerState/MobState/MapRoomState)
- `server/matchmaking/` — pure channel-number allocator (§59.3 auto-assign)
- `server/security/` — WS handshake (JWT+origin+rate limit), session takeover/lease (Bible 5.2)
- `server/characters/` — persistence decision (pure) + character-state load/upsert (best-effort — no DB = in-memory)
- `server/inventory/` — inventory best-effort DB glue for MapRoom (load snapshot on join; capacity + item catalog wiring; mutations strict) + P2-10 reinforcement knobs (enhancement curve + `noReinforcement` rules from DEFAULT config)
- `server/economy/` — kill-reward wiring for MapRoom: mobType→monsterId map + Prisma seams (ledger/inventory/drop-audit); EXP always, gold/drops/audit only with DB + shop-state (P2-11 config + map availability)
- `server/db/` — Prisma client singleton (server-only) + ledger contract (getBalance/appendEntry)
- `server/config/` — P2-09 server-authoritative Design Knobs: economy (drop tables/EXP curve/milestone Gold/enhancement +0..+15) + reinforcement (boss pity/fragment/NO_REINFORCEMENT flag) + versioned loader (`config_versions` → DEFAULT fallback). Server-only, never bundled to client + storage (P2-17)
- `prisma/migrations/` — 0001_init (13 tables) · 0002_shop_ledger_reasons (LedgerReason += shop_buy/shop_sell)

## src/shared + src/server (client↔server contracts + Next server-only)

- `src/shared/` — net-protocol (wire contract), reconnect/movement-validation (pure), character-name/-class validators, afk (P2-13)
- `src/server/db.ts` — Prisma client singleton on the Next API side (**server-only**, must never enter the client bundle)
- `src/server/auth/` — token/session-cookie, password hash/policy, email normalize, auth service/upgrade state machine
- `src/server/characters/` — repository (memory/prisma) + service (slot cap, cross-account guard)
- `src/server/inventory/` — item catalog (server-authoritative Design Knob: slot + stat bonus) + equipment-stats (pure combat aggregation, folds enhancement +N curve §16.3.1) + repository (memory/prisma: FOR UPDATE + optimistic `version`, incl. `commitEnhancement` + `grantItems` loot→bag stacking/overflow) + service (equip/unequip/move, swap, snapshot) + enhancement-service (P2-10 guaranteed +1) + storage-service (P2-17)
- `src/server/economy/` — pure P2-09 resolvers: exp (level-diff/party/level-up/baseline D-055) · drop-roll (weighted pools + guaranteed + audit + reinforcement guard) · kill-reward (orchestrator via injected seams, no DB) · shop (P2-11 buy/sell, compensating refund)

## scripts + tests

- `scripts/e2e/` — permanent E2E harness (Colyseus client, works local/prod): `scripts/e2e/lib.mjs` helpers, `scripts/e2e/smoke.mjs` 8-step scenario
- `scripts/svg/` — SVG-first pipeline (SVG-01, D-042/D-043): sanitizer + palette lint (32-color/rarity) + manifest gen (engine 5-dir+mirror + Asset Bible sec19) + `scripts/svg/raster-resvg.ts` (@resvg/resvg-js backend, builds PNG atlases + icons); svg:lint/svg:build CLIs
- `svg/` — SVG source tree + `svg/README.md` contract; entity folders carry entity.json; `_`-prefixed folders = WIP, skipped by build; build output mirrors to `public/assets/` (manifests/atlases/icons, committed)
- tests/ mirrors source module names — grep the test dir.
