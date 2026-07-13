# Feature map — feature → entry files, spec §, tests

Navigation only; grep for symbol-level truth (AI.md Search rules). P0/P1 full detail: `docs/history/2026-07-13-feature-map-archive.md`.

| Feature | Spec | Entry | Tests |
|---|---|---|---|
| P0+P1 foundations (engine/world sync) — see archive + `docs/context/engine.md` | GS v15 · TA v1.5 | `src/engine/`, `src/game/`, `server/rooms/MapRoom.ts` | see archive |
| P2-02b Schema v2 (location model, append-only ledger, config-driven items) | TA §7–§8 · AJ §4.3/§20 | `prisma/schema.prisma`, `prisma/migrations/0001_init/migration.sql`, `server/db/client.ts` | `tests/db-schema.test.ts` |
| P2-03 Auth (custom lightweight, guest→email upgrade, 6 endpoints) | Bible 5.x · D-044 | `src/server/auth/service.ts`, `src/app/api/auth/`, `src/server/db.ts` | `tests/server-auth-service.test.ts` |
| P2-04 WS security (JWT handshake, origin allowlist, rate limit, session takeover) | Bible 5.2 · TA §6.2 | `server/security/handshake.ts`, `server/rooms/MapRoom.ts`, `src/engine/net/net-client.ts` | `tests/server-security.test.ts` |
| P2-05 Character save/load (join with real character, best-effort persistence) | Storage §5 | `server/characters/persistence-decision.ts`, `server/characters/character-state.ts`, `src/engine/net/character-session.ts` | `tests/server-characters-persistence.test.ts` |
| P2-06a Game Hub + character creation (5 slots, Thai name validator) | Storage §3–§9 · S4 | `src/app/hub/page.tsx`, `src/app/hub/HubShell.tsx`, `src/shared/character-name.ts` | `tests/shared-character-name.test.ts`, `tests/server-characters-service.test.ts` |
| /game entry gate (boot-gate — redirect to hub if authenticated with no selected character, fresh map from API) | Storage §5/§5.3 | `src/app/game/boot-gate.ts`, `src/ui/GameCanvas.tsx` | `tests/app-game-boot-gate.test.ts` |
| P2 wave 3+ (inventory/equipment, ledger, drop/EXP, enhancement, shop, DG lite, storage/delivery) | GS v15.2 · TA v1.5.2 | not started — see `docs/tech/deungpu_P2_ISSUE_BREAKDOWN_v1.md` | (planned) |
| Bot & report / Market / Audio | TA §9, §5, §22 · GS §4/§59.2, §5/§11, §22–§42 | not started | (planned) |
| Docs system (AI OS) | ClickUp: AI Operating System — Starter Kit | `docs/`, `AI.md`, `CLAUDE.md` | `tests/docs-guard.test.ts` |
