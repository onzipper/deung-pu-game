# CODEMAP — orientation only: which module owns what.

> For symbol-level truth, grep `src/`, `server/`, `tests/` (see `AI.md` Search rules).
> Update on file add/move/delete (path-guard enforced). Full pre-restructure detail: `docs/history/2026-07-13-codemap-archive.md`.

## src/engine (foundation layer — TA §17, plain TS + PixiJS, no React/Next.js)

- `src/engine/config.ts` — barrel — Design Knobs/types (EngineConfig, DEFAULT_ENGINE_CONFIG); every tunable value lives in domain modules under `src/engine/config/` (scene, player, mob, combat, combat-feel, net, engine), re-exported here
- `src/engine/runtime/` — engine lifecycle: transition (map-crossing fade), resize, assets, debug-info
- `src/engine/runtime/app.ts` — createEngine(): mounts/tears down the per-map world (player+mobs+combat+net+input), master tick, F3/F4 wiring
- `src/engine/iso/` — iso projection + depth-sort math (**never-downgrade zone**)
- `src/engine/movement/` — mover (stepMovement), direction resolver, path-follower
- `src/engine/pathfinding/` — A* on the iso grid (click-to-move)
- `src/engine/player/` — local player pixi glue + correction-resume (server reconcile)
- `src/engine/net/` — colyseus client glue, interpolation buffer, reconnect store, remote player/attack, party
- `src/engine/net/net-client.ts` — createNetClient(): connect/join, reconnect (§59.1), self-adopt gating, cast/skill messages
- `src/engine/animation/` — animation manifest (5-dir+mirror), sprite animator, placeholder textures
- `src/engine/render/` — depth registry, camera, scene graph, object pool, screen shake, exit marker
- `src/engine/map/` — MapConfig schema/loader/registry + map1/city-hub/p0-test-field configs
- `src/engine/input/` — keyboard intent tracker (WASD + attack key)

## src/game (combat/entity logic on top of the engine)

- `src/game/mob/` — spawn/wander, AI (aggro/leash/LOD), authoritative simulation, view manager
- `src/game/skill/` — SkillDefinition (37 fields, GS §50.1) loader + server/client view split (TA §16.1)
- `src/game/skill/data/warrior-skills-server.ts` + `src/game/skill/data/warrior-skills-client.ts` — **SERVER-ONLY vs CLIENT-SAFE split**: server literals (baseMultiplier/bossModifier/etc.) must never reach the client bundle
- `src/game/combat/` — hit-test, cast-validation, damage-number/hit-stop/screen-shake juice, combat-stub, target-engage
- `src/game/combat/formula.ts` — **PURE + SERVER-ONLY** damage formula (§15.2/§50.1.1) — must never be imported into the client bundle

## src/ui + src/app (React overlay + Next.js shell)

- `src/app/` — root layout, landing page, globals.css
- `src/app/game/` — route /game: server shell → GameCanvas
- `src/app/game/boot-gate.ts` — **pure DI** entry gate (Storage §5): redirects to /hub when authenticated with no selected character, reads fresh character/map from the API before mount
- `src/app/hub/` — Game Hub route: auth/upgrade panels, character grid/create, enter-game wiring
- `src/app/api/` — auth endpoints (guest/register/login/upgrade/session/rt-token) + characters (list/create)
- `src/ui/` — GameCanvas (mount bridge), DebugOverlay (F3), debug-overlay-logic (pure reducer)
- `src/ui/store/` — Zustand vanilla store bridge (HUD state, engine→UI one-way, no React import in the vanilla file)
- `src/ui/panels/` — shared panel/window framework (P2-preface, DG spec §13): panel-stack (pure z-order reducer) + PanelContext (Provider/`usePanelManager`, blocks keydown from reaching the engine while a panel is open) + Panel (presentational window, desktop float / mobile bottom sheet) + use-media-query. `PanelProvider` mounted in `src/ui/GameCanvas.tsx` (first host).
- `src/ui/panels/inventory/` — inventory/equipment panel (P2-07): inventory-view (pure grid/label/reject-reason logic) + InventoryPanel (bag grid + equipment list + equip/unequip buttons, no drag-drop) + InventoryHudButton (HUD corner button + "I" hotkey). Reads HudState.inventory/inventoryRejection via the Zustand bridge; sends equip/unequip/move intents through EngineHandle.net directly (imperative, like setDepthDebug). Item name/icon still raw itemId — TODO tag points at the future client item-catalog (SVG-01).

## server (Colyseus realtime process, separate from Next — L4)

- `server/index.ts` — Colyseus Server entry: defines MapRoom + `.filterBy(['mapId','partyId'])`, listens ws://localhost:2567
- `server/rooms/` — MapRoom lifecycle glue (onCreate/onJoin/onMessage/onLeave/onDispose)
- `server/rooms/MapRoom.ts` — the room: movement validation, mob sim tick, combat authority, reconnect grace, map transition, safe-zone cap
- `server/schema/` — @colyseus/schema state (PlayerState/MobState/MapRoomState)
- `server/matchmaking/` — pure channel-number allocator (§59.3 auto-assign)
- `server/security/` — WS handshake (JWT+origin+rate limit), session takeover/lease (Bible 5.2)
- `server/characters/` — persistence decision (pure) + character-state load/upsert (best-effort — no DB = in-memory)
- `server/inventory/` — inventory best-effort DB glue for MapRoom (load snapshot on join; capacity + item catalog wiring; mutations strict)
- `server/db/` — Prisma client singleton (server-only) + ledger contract (getBalance/appendEntry)
- `server/config/` — P2-09 server-authoritative Design Knobs: economy (drop tables/EXP curve/milestone Gold/enhancement +0..+15) + reinforcement (boss pity/fragment/NO_REINFORCEMENT flag) + versioned loader (`config_versions` → DEFAULT fallback). Server-only, never bundled to client
- `prisma/migrations/` — 0001_init (13 tables) · 0002_shop_ledger_reasons (LedgerReason += shop_buy/shop_sell)

## src/shared + src/server (client↔server contracts + Next server-only)

- `src/shared/` — net-protocol (wire contract), reconnect/movement-validation (pure), character-name/-class validators
- `src/server/db.ts` — Prisma client singleton on the Next API side (**server-only**, must never enter the client bundle)
- `src/server/auth/` — token/session-cookie, password hash/policy, email normalize, auth service/upgrade state machine
- `src/server/characters/` — repository (memory/prisma) + service (slot cap, cross-account guard)
- `src/server/inventory/` — item catalog (server-authoritative Design Knob: slot + stat bonus) + equipment-stats (pure combat aggregation) + repository (memory/prisma: FOR UPDATE + optimistic `version`) + service (equip/unequip/move, swap, snapshot)

## scripts + tests

- `scripts/e2e/` — permanent E2E harness (Colyseus client, works local/prod): `scripts/e2e/lib.mjs` helpers, `scripts/e2e/smoke.mjs` 8-step scenario
- tests/ mirrors source module names — grep the test dir.
