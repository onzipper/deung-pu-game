# .claude/ — agent persona index

Routing = grade by how much decision-making is left, not by domain (see CLAUDE.md).

## Brief contract (orchestrator MUST provide, subagent MUST verify)

Every brief contains:
1. **FILES** — exact paths in scope (+ paths explicitly out of scope)
2. **CONTEXT** — the context pack to read (ONE of docs/context/*.md) + pasted excerpts of anything else needed
3. **SPEC** — spec § / decision D-NNN IDs / trap names this work relies on (Thai spec text quoted verbatim in backticks)
4. **TESTS** — commands to run + expected result

Subagents NEVER read on their own: `docs/CODEMAP.md`, `docs/decision-index.md` —
those are orchestrator maps; the brief carries what's needed. Targeted Grep in
src/server/tests IS allowed, but if the brief was insufficient and you had to
explore, you MUST report what was missing in the `deviations` field
(agent-rules §5) — that feedback loop is how briefs improve.

## Generic workers (by tier)

| Persona | Model | Use when | Reading rule |
|---|---|---|---|
| `deep-worker` | opus | System design / debugging with an unknown root cause / trade-off analysis outside a specialist's zone | `docs/agent-rules.md` + the context pack named in the brief |
| `fast-worker` | sonnet | Brief already names the files + the pattern — only the doing is left | `docs/agent-rules.md` + the context pack named in the brief |
| `tiny-worker` | haiku | Single file, spelled out exactly (copy/label/knob) | nothing — the brief is self-contained |

## Specialists (owns a file zone)

| Persona | Model | Zone | Note |
|---|---|---|---|
| `engine-specialist` | opus | `src/engine/**` | never-downgrade: iso coordinate/depth-sort correctness |
| `game-specialist` | sonnet | `src/game/**` | combat formula/RNG correctness → orchestrator overrides to opus |
| `ui-specialist` | sonnet | `src/ui/**`, `src/app/**` | read `AGENTS.md` first (Next.js 16 traps) |
| `qa-specialist` | sonnet | `tests/**`, `*.test.ts` | expected values come from spec, never from the implementation |
| `docs-curator` | sonnet | `docs/**` (except design/tech) | never edits spec — spec changes are owner-only |
| `game-designer` | opus | `docs/design/**` + all design drafting work | every output = PROPOSAL + questions to decide — never decides on the owner's behalf; paired with the `/game-design` skill for chat sessions |
| `art-inspector` | sonnet | `public/assets/**` intake QA (read/run only) | ตรวจรับ sprite sheet จาก AI ภายนอกด้วย `scripts/art/**` + vision; paired with the `/sprite-intake` skill; never commits/edits art |

## Deferred (don't create yet — wait for a real file zone)

- `realtime-specialist` — Colyseus rooms/netcode → create when P1 starts (tech §6, §16.2)
- `worker-specialist` — BullMQ bot sim/report/rollup → create when P3 starts (tech §9)
- `data-specialist` — Prisma/MySQL schema, ledger, transactions → create when P2 starts (tech §8) · never-downgrade
- `audio-specialist` — Howler/Tone → create when audio work starts (tech §22)

## Rules

- A model override beats creating a new persona — never spin up a duplicate persona just to get a different tier
- Never-downgrade zones: iso coordinate/depth-sort correctness, combat calculation, DB schema, currency ledger → always opus
- spec (`docs/design/**`, `docs/tech/**`) = reference — work from the § quoted in the brief; missing info = report back, never guess
