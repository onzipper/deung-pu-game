# Context pack: game (src/game — combat/entity/skill on the engine)
Scope: `src/game/**` (uses `src/engine/**` via its public API) · Read this pack + engine.md + the files in your brief. Spec detail via the cited §.

## Contract
- `src/game/**` = gameplay logic on the engine: combat, skills, mob AI/spawn, combat juice.
- From P1+ the **server is authoritative** for damage/drop/RNG (TA §1/§7). The client only plays feedback (damage numbers, hit-stop, shake).
- Server-only combat truth (`src/game/combat/formula.ts`, server skill data) must **never** be reachable from a client import path — see Traps.
- Talk to the engine only through its public API; talk to UI only through the Zustand bridge (never React state for world data).

## Key files
- `src/game/combat/formula.ts` — **PURE + SERVER-ONLY** damage formula (TA §15.2 / GS §50.1.1); the client must never import it
- `src/game/combat/` — hit-test (geometry), cast-validation (server-only), damage-number/hit-stop/screen-shake juice, combat-stub, target-engage
- `src/game/skill/` — SkillDefinition (37 fields, GS §50.1) loader + server/client view split (TA §16.1)
- `src/game/skill/data/warrior-skills-server.ts` — full 37-field literals, **SERVER-ONLY**
- `src/game/skill/data/warrior-skills-client.ts` — ClientSkillView (28 fields), the only file the client imports
- `src/game/mob/` — spawn/wander, AI (aggro/leash/LOD), authoritative simulation, view manager

## Invariants
- Every balance value is a Design Knob (GS §48) → config only, never hardcode (including `hitTolerance`).
- Skill field names copied verbatim from GS §50.1 — never typed from memory, never renamed.
- Boss telegraph always clear, independent of the quality setting (GS §18.5).
- combat result calculation is a **never-downgrade zone** — don't guess, prove it with a test.

## Traps
- **Damage formula must not leak into the client bundle** (TA §7/§16.1) — Cause: `src/game/combat/` is shared code; importing formula.ts/cast-validation.ts from a client path, or adding a barrel index.ts, drags the formula into the browser JS. Rule: formula.ts = server-only (imported only from `server/rooms/**`); **no barrel** in the folder; the client (combat-stub/app.ts) may import only hit-test.ts + damage-number.ts. Enforced by convention + a SERVER-ONLY header + review.
  full story: docs/history/2026-07-13-known-traps-archive.md#the-combat-damage-formula-must-never-leak-into-the-client-bundle-p1-05-ta-7161
- **Server-only data literals leak too (clientView ≠ bundle removal)** — Symptom: the client statically imports a full `SkillDefinition` literal then calls `clientView()` to strip fields, but the literals (baseMultiplier 2.2, bossModifier, maxTargets, hitCount…) are still bundled. Cause: `clientView()` runs after load; the bundler can't tree-shake props off an object that is actually used. Rule: split at the file level — warrior-skills-server.ts (server-only) vs warrior-skills-client.ts (zero server literals); guard drift with `client == clientView(server)`. If a literal is balance/formula, the client must never import a file that contains it.
  full story: docs/history/2026-07-13-known-traps-archive.md#importing-server-only-data-leaks-just-as-much-as-importing-the-formula-clientview-at-runtime-doesnt-help-the-bundle
- **Melee arc misses at point-blank (interp lag)** — Symptom: the attack animation plays but no damage number appears, especially vs chasing mobs (hit rate ~23–52%). Cause: the client faces the mob's ~120ms-old interp image, but the server judges the arc from the mob's current position → median angle ~161°, an arc-miss within range. Rule: feed `hitTolerance` (CombatBalanceConfig, a Design Knob) into `findHits`/`resolveSkillHits` **server-side only** (`pointBlankRadiusTiles`, `rangePaddingTiles`, `arcPaddingDegrees`); a target inside radius and closer than point-blank always hits; padding must not inflate radius (a mob behind the cone still misses — guardrail test). The client offline dummy uses ZERO_HIT_TOLERANCE. Never hardcode. (also in server.md)
  full story: docs/history/2026-07-13-known-traps-archive.md#attacks-dont-land-on-mobs-interp-lag-makes-melee-arcs-meaningless-at-point-blank-range-p1-051

## Tests & commands
- `npm test` — combat formula / RNG / multi-hit rounding / pooling must have unit tests; expected values come from spec, not from the implementation.
