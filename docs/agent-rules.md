# Agent rules — shared rules for every brief/subagent

> Briefs say "read `docs/agent-rules.md` and follow it" instead of pasting rules. Every briefed agent reads this file before starting work.

## Language policy

- Effective 2026-07-13, approved by the owner.
- **English**: AI-facing internal docs (CODEMAP, agent-rules, playbooks, context packs, token-budget, deploy-checklist, tech notes), agent briefs, internal reports, decision-index, current-state, CLAUDE.md/AI.md/AGENTS.md.
- **Thai**: everything the owner reads or approves — `docs/design/**`, `docs/decisions/` (rationale, verbatim), the P2 breakdown, PR titles/bodies, commit messages, questions to the owner, and ALL in-game content. Canonical Thai game terms stay Thai even inside English text.
- Other existing Thai files are **not** retro-translated (specs/bibles stay owner-auditable).

## Proposals & questions placement (owner rule, 2026-07-13)

- Recommendations + reasons ("แนะนำ + เหตุผล") go ONLY in PR descriptions and chat questions to the owner (recommended option first, labeled "(แนะนำ)").
- `.md` files record ONLY decided outcomes — no options, alternatives, or rationale prose left behind in docs; keep every entry as short as completeness allows (the docs are already long, and the owner reads them all).
- Undecided design work is delivered as chat/PR text for the owner to decide first; after the decision, record only the outcome (lean) in docs.

## 1. Spec-first (summarized from AI.md — the full version always wins)

- game semantics/balance follow game spec v15.3 + the Production Bible Set (`docs/design/bibles/`) · implementation follows tech architecture v1.5.2
- work that's outside of/conflicts with spec → **stop, report back** — don't guess, don't decide on the owner's behalf
- field names must match v15 §50.1 exactly · every balance value is read from config (Design Knobs §48), never hardcoded
- **Spec drift (design↔tech)**: never type a field/value from memory because "it's roughly this" — open the § feature-map points to and copy field names directly from v15 §50.1 every time. full story: docs/history/2026-07-13-known-traps-archive.md#spec-drift-between-design-and-tech

## 2. Before touching code

1. Read the context pack for the layer you're touching (`docs/context/engine.md` · `game.md` · `ui.md` · `server.md`) — each ends with a **Traps** section of bugs already hit; also read "Shell & tooling traps" below
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

- **never omit deviations** — if the brief was wrong/couldn't be followed exactly, say where you diverged and why. Diverging correctly + reporting it is the right move.
- terse style applies to internal reports only — **reports to the owner stay in full, readable Thai** (D-046: no caveman-code toward the owner)

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

## Shell & tooling traps

Environment/tooling bugs that have already cost real time — read before running gates or writing files. Layer-specific bugs live in the context pack's **Traps** section; these are cross-cutting.

- **vitest fails only in some shells** (`TypeError` reading 'config' at describe) — Symptom: `npm test` fails on every file during collection in some spawned shells even though the code is correct; the owner's main PowerShell passes. Cause: the spawned shell's environment, not the code. Rule: run a bare smoke test — if it also fails it's an env problem, not your code; confirm the real gate on the main PowerShell.
  full story: docs/history/2026-07-13-known-traps-archive.md#vitest-fails-only-in-some-shells-typeerror-reading-config-at-describe
- **npm shim: `'node' is not recognized`** — Symptom: `npm test`/`npm run lint`/postinstall fails with `'node' is not recognized` even though `node --version` works in bash. Cause: when npm spawns cmd.exe for a script/bin shim, node isn't on that subprocess's PATH. Rule: run the tool directly through node — `node node_modules/vitest/vitest.mjs run`, `node node_modules/eslint/bin/eslint.js`, `node node_modules/next/dist/bin/next build`, or `node_modules/.bin/<bin>`; install postinstall deps with `--ignore-scripts`.
  full story: docs/history/2026-07-13-known-traps-archive.md#npm-run-script-fails-node-is-not-recognized-env-of-the-spawned-shell
- **tsx outside the project dir → can't find node_modules** — Symptom: `Cannot find module 'colyseus.js'` when running a proof script placed in scratchpad. Rule: place integration/proof scripts **inside the project** (a temp file at root, then delete it) or set `NODE_PATH` to the repo's node_modules — node resolves upward from the file's location. (server runs also need `--tsconfig server/tsconfig.json` — see server.md.)
  full story: docs/history/2026-07-13-known-traps-archive.md#tsx-running-a-script-outside-the-project-dir--cant-find-node_modules
- **A temp script at the repo root breaks `next build`** — Symptom: `next build`/`tsc -p tsconfig.json` fails `TS1240 Unable to resolve signature of property decorator` at `server/schema/*` even though you touched no server file. Cause: the root tsconfig `include:["**/*.ts"]` catches a root temp file; if it imports `server/**` it pulls the legacy-decorator schema into a program with no experimentalDecorators. Rule: any proof/temp script that imports `server/**` must be **deleted before** the build/tsc gate; confirm `git status` is clean of temp files.
  full story: docs/history/2026-07-13-known-traps-archive.md#a-prooftemp-script-placed-at-the-repo-root-that-imports-server--next-build-type-check-breaks-decorator
- **PowerShell writes files with a BOM** — Symptom: `Out-File -Encoding utf8` on PowerShell 5.1 writes UTF-8 **with a BOM** → MySQL/MariaDB can't read migration.sql (error 1064 at `﻿-- CreateTable`). Rule: for any file another tool will read, use the Write/Edit tool (no BOM) or strip it (`sed -i '1s/^\xEF\xBB\xBF//'`). The MariaDB-not-MySQL8 half of this trap lives in server.md.
  full story: docs/history/2026-07-13-known-traps-archive.md#powershell-writing-files--bom--migration-sql-breaks--the-real-db-turns-out-to-be-mariadb
