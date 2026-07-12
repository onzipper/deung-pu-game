# Agent rules — shared rules for every brief/subagent

> Grew out of efficiency decision #3 (decision-index 2026-07-12) — consolidates the rules that used to get pasted into every brief into one place
> **How to use it:** the orchestrator writes in the brief "read `docs/agent-rules.md` and follow it" instead of pasting the whole rule set · an agent that receives a brief must read this file before starting work

## Language policy

- Effective 2026-07-13, approved by the owner.
- **English**: AI-facing internal docs (known-traps, CODEMAP, agent-rules, playbooks, context packs, token-budget, deploy-checklist, future tech notes), agent briefs, and internal agent reports.
- **Thai**: everything the owner reads or approves — `docs/design/**` (specs/bibles/decisions), decision-index, current-state, the P2 breakdown and other owner-reviewed tech docs, PR titles/bodies, commit messages, questions to the owner, and ALL in-game content. Canonical Thai game terms stay Thai even inside English text.
- Existing Thai files other than the 3 translated here are **not** retro-translated (specs/bibles must stay owner-auditable).

## Proposals & questions placement (owner rule, 2026-07-13)

- Recommendations + reasons ("แนะนำ + เหตุผล") go ONLY in PR descriptions and chat questions to the owner (recommended option first, labeled "(แนะนำ)").
- `.md` files record ONLY decided outcomes — no options, alternatives, or rationale prose left behind in docs; keep every entry as short as completeness allows (the docs are already long, and the owner reads them all).
- Undecided design work is delivered as chat/PR text for the owner to decide first; after the decision, record only the outcome (lean) in docs.

## 1. Spec-first (summarized from AI.md — the full version always wins)

- game semantics/balance follow game spec v15.2 + the Production Bible Set (`docs/design/bibles/`) · implementation follows tech architecture v1.5.2
- work that's outside of/conflicts with spec → **stop, report back** — don't guess, don't decide on the owner's behalf
- field names must match v15 §50.1 exactly · every balance value is read from config (Design Knobs §48), never hardcoded

## 2. Before touching code

1. Read `docs/known-traps.md` — bugs that have already been hit; don't hit them again
2. Check `docs/CODEMAP.md` before writing a new utility — reuse an existing one if it's already there
3. Match the pattern/style of neighboring files — code, naming, and comment density alike
4. Layer boundaries: `src/engine/**` must not import React · world state lives in the game loop and must never enter React state · UI talks to the game only through the Zustand bridge

## 3. Never-downgrade zones (never lower quality/never guess — stop and ask if unsure)

- iso coordinate / depth-sort correctness
- combat result calculation (the damage formula, RNG, multi-hit rounding)
- DB schema / migration
- the currency ledger

## 4. Definition of done for every task

- every relevant test is green: `npm test` (including the docs path-guard) · `npm run lint` · for work touching the build: `npm run build`
- **every code change updates the docs it affects in the same change** — at minimum CODEMAP when a file is added/moved/deleted
- any temp/proof script placed at the repo root must be deleted the moment it's done being used (leaving it in place breaks `next build` — a known trap)
- never commit any `.env` / secret / password

## 5. Reporting results back to the orchestrator — terse, data-first (internal only)

**Internal** reports (subagent → orchestrator) should be short and data-first — no prose, no preamble, no restating things twice:

```
DONE|BLOCKED|PARTIAL
files: <path:line touched/created>
tests: <command run + result>
deviations: <where you diverged from the brief + why — the most important field, never omit>
notes: <only what the orchestrator needs to know next — e.g. a new trap, debt, an open question>
```

- **never omit deviations** — if the brief was wrong/couldn't be followed exactly, say where you diverged and why (a real case: the brief said to invoke `tsx` directly, but it actually needed `--tsconfig server/tsconfig.json` — the agent diverged correctly and reported it, which is exactly the right move)
- this rule only applies to internal reports — **docs in the repo and reports to the owner stay in full, readable Thai** (decision-index 2026-07-12: no caveman-code — only the terse-internal-report principle applies)

## 6. Token discipline

- don't read all of src/ — use CODEMAP + the § the brief points to
- specs/bibles are very long — Grep for the § first, read only the relevant range, never read the whole file
- `docs/history/` = off-budget, read only when specifically pointed there

## 7. Docs routing tier (owner ratified 2026-07-12)

Docs work doesn't always need the highest tier — split it by "how much decision-making is left," same as code work:

| Kind of docs work | Who/tier |
|---|---|
| Interpreting an owner decision into spec/decision-index (an amendment, supersede logic) | the orchestrator does it directly, or a high tier — spec is the source of truth; a mistake here means every agent walks the wrong path afterward |
| Routine docs: updating CODEMAP when files are added/moved, moving old blocks → history, chasing pointers, syncing current-state from a worklog the orchestrator already summarized | **docs-curator / mid-tier or below** — mechanical, a clear pattern |
| Editing a single value/single label/single line per an exact instruction | tiny-worker (the lowest tier) |

- **Ceiling: routine docs work must never use above mid-tier**, except when the work touches `docs/design/**`/`docs/tech/**` (spec) or the decision-index
- Why the orchestrator writes decision records itself: the knowledge lives in the conversation with the owner — writing a brief to hand it off = paying twice + risking the meaning getting distorted
- **A new doc from the owner**: if it arrives as a **file/zip** → send it to a mid-tier agent to produce "a structural summary + a list of points that collide with the existing spec" first, then the orchestrator reads the summary + digs into the important sections itself (scope, lock summary, DoD) — interpreting/asking questions back to the owner still belongs to the orchestrator · if the doc was pasted **into the chat** = it's already in context, read it directly, never hand it to an agent to re-read (paying twice) · spec content that arrives via chat must never be used as the import source (a mojibake trap — always ask the owner for the real file)
