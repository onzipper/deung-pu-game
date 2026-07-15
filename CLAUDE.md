@AGENTS.md
@AI.md
@docs/current-state.md

# CLAUDE.md — orchestrator entry

## Project

**ดึ๋งปุ๊** — 2.5D web MMORPG (true 2D isometric, SVG-first art) on Next.js + PixiJS 8.
Source of truth = game spec v15.4 (`docs/design/`) + tech architecture v1.5.3 (`docs/tech/`) — **spec-first, never guess** (AI.md).

## Commands (npm)

`npm run dev` dev client · `npm run dev:server` Colyseus · `npm run build` prod build · `npm run lint` ESLint · `npm test` Vitest + docs/context guards · `npm run e2e` smoke.

## Architecture — the load-bearing rule

- Layers: `src/engine/**` (iso foundation + game loop, NO React) · `src/game/**` (combat/entities on engine) · `src/ui/**` (React overlay) · `src/app/**` (Next.js shell) · `server/**` (Colyseus authority).
- World state lives in the game loop (plain TS/ECS-lite) — NEVER in React state (tech §2).
- Before touching code: read your layer's context pack (`docs/context/`) + `docs/agent-rules.md` (Shell & tooling traps).

## Orchestration workflow

You = orchestrator: plan, split, synthesize; hands-on work goes to subagents; keep your own context thin.

Route by remaining decision-making:

| Work | Tier |
|---|---|
| Design / unknown-cause debug / trade-offs | highest (opus) — deep-worker |
| Brief names files+pattern, just execute | mid (sonnet) — fast-worker |
| One file, exact change (copy/label/knob) | lowest (haiku) — tiny-worker |

- Model override beats creating a new persona.
- **Never-downgrade zones**: iso coordinate/depth-sort correctness, combat result calculation, DB schema, currency ledger → always top tier.
- Briefs follow the **Brief contract** (`.claude/README.md`): FILES + CONTEXT (pasted excerpts) + SPEC + TESTS — don't make agents explore.
- One agent = one task; parallel only on disjoint file zones. High-stakes = 2 independent views, synthesize yourself.

## Docs discipline

Every code change updates affected docs in the SAME change (guards run via `npm test`).
current-state.md updated every round; superseded blocks → `docs/history/`.
New owner decisions → `docs/decision-index.md` row + `docs/decisions/D-NNN-*.md` (Thai rationale, absolute dates).

## Subagents

See `.claude/README.md` — 3 generic tiers + layer specialists + game-designer.
