# Token budget

Caps on what you read **before proposing a plan**. Search rules live in `AI.md`.

## Small (one label/knob value, one component, doc fix)

- Read: entry docs, current-state, 1 context pack, the files you touch.
- ≤5 files before proposing. Targeted grep OK; no blanket repo-wide reads.

## Medium (new panel / subsystem / behavior)

- Read: current-state, your feature-map row, layer pack (incl. Traps), the files + their tests, the spec § the row cites.
- Write a short plan before editing (systems touched, tests, deploy impact).

## Large (new system / core / schema / cross-layer refactor)

- Write a discovery note first (what exists, what changes, risks).
- Read the cited spec § + core packs. **Owner confirms before work starts** — and beyond-spec means spec updates first.

## Always

- `docs/history/**` is off-budget — read only when a live doc points there.
- Specs are huge (v15 has 62 §) — read ONLY the relevant §, never whole files.
- Cite paths; don't paste long file bodies into plans/briefs.

## Measured onboarding cost (2026-07-13, post agent-context-optimization)

| Read set | Bytes | ~Tokens |
|---|---:|---:|
| Auto-import chain (CLAUDE+AGENTS+AI+current-state) | TBD-C13 | TBD |
| Orchestrator start-here (chain + agent-rules + index + feature-map + 1 pack) | TBD-C13 | TBD |
| Subagent (agent-rules + 1 pack + brief) | TBD-C13 | TBD |

Caps are enforced by `tests/agent-context-guard.test.ts` — a red cap means trim or archive, never raise the cap without owner approval.
