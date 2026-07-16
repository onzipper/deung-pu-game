# docs/ — index

Entry order: `CLAUDE.md` (root) → `current-state.md` → `decision-index.md` → the context pack matching your work.

## Live state + guardrails

| File | Role |
|---|---|
| `current-state.md` | Status board (EN, ≤3KB) — updated every round |
| `decision-index.md` | Locked decisions table (EN) — never re-propose, rationale inline (one line per decision) |
| `context/` | Per-layer packs, each ends with **Traps** · shell/tooling traps: `agent-rules.md` |
| `agent-rules.md` | Shared subagent rules (spec-first, never-downgrade, DoD, report format, language policy, tooling traps) |
| `deploy-checklist.md` | Real deploy steps — Render (server) + Hostinger (client) + smoke test |

## Routing maps

| File | Role |
|---|---|
| `CODEMAP.md` | Orientation: which module owns what (grep for symbol-level truth) |

## Context packs

`context/engine.md` (PixiJS/iso/game loop) · `context/game.md` (combat/skill/mob on engine) · `context/ui.md` (React overlay/Next shell) · `context/server.md` (Colyseus/DB/auth).

## Spec — source of truth (owner-gated, Thai — read ONLY the cited §)

### design/ (owns semantics / balance / knobs / schema)

| File | Role |
|---|---|
| `design/deungpu_project_checkpoint_v15_p0_scope_lock_ready.md` | **Game spec v15.5** (in-place amendments, log §0.0.x) — §4.1 Autonomy · §4.2 continuity states · §48 knobs · §50.1 skill schema · §57/§59 runtime |
| `design/bibles/` | **Production Bible Set v1** (10 books; start: `deungpu_OWNER_DECISIONS_v1.md`; precedence: INDEX §2 — Bible wins behavior/meaning, tech architecture wins implementation) |
| `design/deungpu_ACCOUNT_CHARACTER_STORAGE_FLOW_SPEC_v1.md` | Account/character/storage flow (locked) — hub, sessions/takeover, item locations |
| `design/deungpu_OWNER_PRODUCTION_DECISIONS_P2B_TO_LAUNCH_v1.md` | P2B→launch baseline (bots, market, monetization, legal, gates) |
| `design/deungpu_P2_UI_VISUAL_IMPLEMENTATION_SPEC_v1.md` | UI/visual P2 (LOCKED) — tokens, components, all P2 screens |
| `design/deungpu_P2_MAP_1_ECONOMY_AND_LOOT_SPEC_v1.md` | Economy & loot Map 1 (locked baseline) — ⚠ enhancement §§ superseded by Reinforcement doc |
| `design/deungpu_REINFORCEMENT_SYSTEM_DECISION_v1.md` | **Reinforcement system (LOCKED)** — guaranteed +1, cap +15, boss drop+pity, fragments §3.5, R1–R10 closed |
| `design/deungpu_TECH_TEAM_DECISIONS_SVG_FIRST_NO_FIGMA_v1.md` | SVG-first art direction (locked) — contracts, naming, UI standards |
| `design/deungpu_DUNG_DUNG_COMPANION_GUIDE_SYSTEM_SPEC_v1.md` | ดึ๋งๆ contextual guide/presentation (D-068; no persistent follower) · Help = separate searchable static KB |
| `design/deungpu_P3_BOT_AND_REPORT_UI_IMPLEMENTATION_SPEC_v1.md` | Character Autonomy plan/takeover/report UI (D-067 + v1.2 continuity contract; historical text may be superseded) |
| `design/deungpu_ACHIEVEMENT_AND_ADVENTURE_JOURNAL_SPEC_v1.md` | Achievements + journal (locked; v1 at P2B, GameEvent log from P2) |
| `design/deungpu_P0_SCOPE_LOCK_v1.md` · `design/deungpu_MAP_LAYOUT_BIBLE_v1.md` · `design/deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md` | P0 scope · map layouts · scale/density |
| `design/proposals/deungpu_P1_BALANCE_PROPOSAL_v1.md` | Balance baseline (APPROVED) — values live in config, never hardcoded |
| `design/art-reference/` | Owner visual north star (11 images) — compare all UI/scene/effect work against it |

### tech/ (owns implementation / runtime / persistence / performance)

| File | Role |
|---|---|
| `tech/deungpu_technical_architecture_v1_5_p0_scope_lock.md` | **Tech architecture v1.5.3** — stack, locked L1–L18 (§0.1), Character Autonomy boundary §0.0, plans §12, engine §17 |
| `tech/deungpu_ENGINE_FOUNDATION_DECISIONS_v1.md` | Engine foundation lock (iso/diamond/5-dir+mirror/rooms) |
| `tech/deungpu_RUNTIME_BOT_CHANNEL_AND_SCHEMA_OWNERSHIP_DECISIONS_v1.md` | Runtime lock v1.2 (real-character autonomy + continuity reducer; §3 worker model superseded) |
| `tech/deungpu_P2_ISSUE_BREAKDOWN_v1.md` | P2 breakdown (tech DRAFT — editable per work) |

**Ownership (v15 §59.4):** design owns WHAT a skill is; tech owns HOW it runs. Field names: v15 §50.1 only.
