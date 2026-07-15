# AI.md — universal agent entry point

Applies to EVERY AI agent. Orchestrator-specific rules live in CLAUDE.md.

## Iron rule #1: Spec-first (never guess, never improvise)

- **The spec is the truth** — game semantics/balance follow game spec v15.5; implementation follows tech architecture v1.5.3.
- Work outside of / conflicting with spec → **STOP**, propose a spec update to the owner first, implement after. No exceptions.
- Spec doesn't cover it → ask the owner, don't guess.
- Field names in code/JSON must match v15 §50.1 exactly — never rename/duplicate a semantic field.
- Every balance value is a Design Knob (v15 §48) — read from config, never hardcode.

## Roles

- **Owner/Director** (onzipper): sets direction, locks spec, approves merge/deploy, orders work to start.
- **Orchestrator AI**: plans, splits work to subagents, ships code/tests/docs, stops at approval gates.
- Important cross-session facts go into repo docs — never make the owner repeat himself.

## Start here (in order)

1. `README.md` — what the project is, stack, commands
2. `docs/current-state.md` — status board: where we are, what's blocked, what not to touch
3. `docs/decision-index.md` — locked decisions, do NOT re-propose (rationale: `docs/decisions/`, Thai)
4. `docs/feature-map.md` — only the row(s) for your feature

Then read ONLY the context pack matching your layer, then the files you touch.

## Context routing

| Work type | Read |
|---|---|
| Engine / PixiJS / iso / game loop | `docs/context/engine.md` |
| Combat / entities / skills (gameplay) | `docs/context/game.md` |
| UI / React overlay / Next.js pages | `docs/context/ui.md` |
| Server / Colyseus / DB / auth | `docs/context/server.md` |
| Game semantics / balance | game spec v15 — ONLY the cited § (see docs/README.md) |
| Spec edits (owner-approved only) | `docs/spec-update-playbook.md` |
| Anything touching code | your layer's pack **Traps** section + `docs/agent-rules.md` (Shell & tooling traps) |

## Search rules

- Targeted `Grep`/`Glob` over `src/**`, `server/**`, `tests/**` is **allowed and preferred** for symbol-level questions — cheaper and always fresh.
- `docs/CODEMAP.md` = orientation only (which module owns what). Read it when you don't know which layer owns the code — not as an exhaustive lookup.
- FORBIDDEN always: reading/grepping `node_modules/**`, `.next/**`; reading `docs/history/**` unless a live doc points you there; blanket patterns over the whole repo (e.g. grep `.` or `export` repo-wide); bulk-reading directories.
- Specs are huge — read ONLY the cited §, never the whole file.

## Cite before code

Before changing behavior, your plan/report must cite the sources it stands on:
- files read (paths), the spec § / decision D-NNN relied on, and the existing pattern followed (`path` example).
- Can't cite it → don't guess. STOP and ask the owner. "Not enough context" must become a precise question, never a silent guess.

## Required behavior

- Plan before editing (name the systems touched) · name the test commands you'll run.
- Every code change updates the docs it affects in the SAME change (at minimum CODEMAP on add/move/delete — test-enforced).
- Match existing patterns; reuse existing utilities (grep first).
- One issue at a time, in scope — no broad refactors without approval.

## Subagent note

Subagents work from briefs (see `.claude/README.md` Brief contract). `docs/CODEMAP.md`, `docs/decision-index.md`, `docs/feature-map.md`, `docs/history/**` are orchestrator maps — subagents don't read them; the brief carries what's needed.

## Never change without owner confirmation

- Anything the spec doesn't cover or conflicts with → spec must be updated/locked first.
- Merge `develop` → `main` (confirm every time). Routine work: branch from `develop` → PR back to `develop` for owner review.
- DB schema / production migration.
- Skill schema field names (v15 §50.1) — new fields go through v15 §59.4.
- Design Knob semantics (v15 §48) — tech builds the dials, never decides balance.
- Anything marked Locked in `docs/decision-index.md` or tech architecture §0.1.
- Production deploy (always owner-triggered).
- Anything touching economy / combat / punishment / monetization / premium currency → stop and ask first (v15 §53).
