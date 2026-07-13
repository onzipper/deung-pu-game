# Context pack: engine (src/engine — iso foundation + game loop)
Scope: `src/engine/**` (+ `src/game/**` combat mechanics that sit on it) · Read this pack + the files in your brief. Spec detail via the cited §.

## Contract
- `src/engine/**` = foundation layer: **never import React / Next.js** — plain TS + PixiJS only.
- `src/game/**` = game logic on the engine (combat/entity/spawn), uses the engine via its public API.
- UI reads/commands the game only through the Zustand bridge (TA §2) — world state must never enter React state.
- Client = juice only; truth (damage/drop/RNG) belongs to the server from P1+ (TA §1). P0 may compute locally but calc must stay separable from render.

## Locked decisions (don't relitigate — TA §17, GS §57)
- True 2D isometric pixel art · diamond grid ~64×32 · fixed camera · no rotation.
- Two coordinate systems: world/logical grid (logic/collision/pathfinding) ↔ screen (iso projection). The converter is the heart of the foundation.
- Depth sort by iso position — sort only dirty entities per frame.
- Directions: 5 drawn (S/SW/W/NW/N) + mirror (SE/E/NE); 8-dir override allowed (data-driven).
- Object-pool everything that spawns/dies often (mobs, damage numbers, particles, loot) — never `new` in a hot loop. Damage number = `BitmapText` + pool (TA §11).

## Key files
- `src/engine/iso/` — iso projection + depth-sort math (**never-downgrade zone**)
- `src/engine/render/placement.ts` — `entityFootToScreen`: the single foot-position convention (see Traps)
- `src/engine/render/` — depth registry, camera, scene graph, object pool, screen shake, exit marker
- `src/engine/runtime/app.ts` — createEngine(): per-map world mount + master tick
- `src/engine/movement/` — mover (stepMovement), direction resolver, path-follower
- `src/engine/pathfinding/` — A* on the iso grid (click-to-move)
- `src/engine/config.ts` — barrel re-exporting every tunable engine value (Design Knobs) from domain modules under `src/engine/config/`

## Invariants
- Every balance value is a Design Knob (GS §48) → read from config, never hardcode.
- Skill fields match GS §50.1 exactly (`baseMultiplier`, `cooldown`, `maxTargets`, ...) — never rename.
- Boss telegraph must always be clear, never scaled by the quality setting (GS §18.5, TA §16.5).
- Damage formula = multiplicative diminishing (TA §15.2); it lives on the calc side and must not ship in the client bundle from P1 (see game.md).
- Perf budget (P0 success): desktop 60fps @ 40 mobs + 300 damage numbers/s + 3 stacked AoE; mobile 30fps @ 30 mobs, quality Low.

## Traps
- **iso placement: duplicated +0.5** — Symptom: a sprite floats ~half a tile (16px @ 64×32) off the cursor/camera, or the depth-sort order flips. Cause: mixing `tileCenterToScreen` (adds +0.5) with already-centered coords, or an entity on center basis while camera/depthKey use origin basis. Rule: one convention only — entity/prop APIs take a continuous foot position and render via `entityFootToScreen`; bake n+0.5 into the config coords. Never mix two bases inside a depth-sorted layer. Locked by `tests/engine-render-placement.test.ts`.
  full story: docs/history/2026-07-13-known-traps-archive.md#iso-placement-duplicated-05-sprite-off-by-half-a-tile

## Tests & commands
- `npm test` (Vitest + docs path-guard) · combat formula / RNG / pooling need unit tests.
- If the npm shim fails (`'node' is not recognized`), run `node node_modules/vitest/vitest.mjs run` — see agent-rules "Shell & tooling traps".
