# Current state

_Last updated: 2026-07-13 · Status board only — history & detail: `docs/history/` (full pre-restructure snapshot: `docs/history/2026-07-13-current-state-archive.md`)_

## Now

- **Phase:** P2 waves 1+2 merged to `develop` (PR #9, #10). Next: **wave 3** — starts on owner's order.
- **Live:** server `https://deung-pu-game.onrender.com` (Render free tier + UptimeRobot, `/healthz`) · client `https://deung-pu.softrock.space/game` (Hostinger).
- **Spec:** game v15.3 / tech v1.5.2 + Production Bible Set v1 (`docs/design/bibles/`). Reinforcement system fully decided (R1–R10 closed) → `docs/design/deungpu_REINFORCEMENT_SYSTEM_DECISION_v1.md`, D-048..D-052.
- **DB:** test DB = Hostinger **MariaDB** (not MySQL 8), migration `0001_init` applied (13 tables). Production data stays EMPTY until P2-16 single apply. Rename `upg_kraeng` → `upg_reinforcement` must land before P2-16.
- **Infra:** agent-context-optimization PR pending owner review (docs restructure + config split; onboarding ~42K → ~9K tokens; MapRoom split deferred to a future PR).

## Task board — P2 wave 3 (awaiting owner start order)

| ID | Task | Note |
|---|---|---|
| P2-07 | Inventory/equipment UI | first up |
| P2-08 | Currency ledger | never-downgrade zone |
| P2-09 | Drop + EXP + reinforcement/fragment config | config/loader only; live drops arrive P2B |
| P2-10 | Guaranteed reinforcement (+15 cap) | UI ships inert in P2 (`NO_REINFORCEMENT`) |
| P2-11 | Shop | — |
| P2-12 | DG lite + hint panel | hint copy: "ของหายากมากับบอส" |
| P2-13 | Tab policy | — |
| P2-15 | Mobile pass | — |
| P2-17 | Storage/Delivery | — |
| SVG-01 | SVG pipeline foundation | content track C0/C1 pairs with it |

## Open with owner (not blocking structure)

- Balance numbers batched for P2B: Gold amounts replacing old grants (D-052) · enhancement stat curve +6..+15 · E3 "Map 1 Monster Combat Stat Table" (blocks production tuning + final combat QA only).
- Render free-tier upgrade when Bible 5.1 hard triggers hit (latest at P2-16).
- Production smoke test round (deploy-checklist §3) still owed — does not block P2.

## Do not touch

`docs/design/**` + `docs/tech/**` — owner-gated spec (tech DRAFTs editable per work). Canonical IDs lock once save data exists.

## Pointers

- Rules: `docs/agent-rules.md` · Decisions: `docs/decision-index.md` · Map: `docs/CODEMAP.md` · Worklogs: `docs/history/`
- Run local realtime: T1 `npm run dev:server` · T2 `npm run dev` (no server → `/game` solo offline)
- Deploy: `docs/deploy-checklist.md`
