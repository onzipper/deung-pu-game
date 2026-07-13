# Current state

_Last updated: 2026-07-13 · Status board only — history & detail: `docs/history/` (full pre-restructure snapshot: `docs/history/2026-07-13-current-state-archive.md`)_

## Now

- **Phase:** **wave 3 in progress** on `feat/p2-wave3-value-loop` — P2-07/P2-08/P2-09 + P2-10 server done (committed); P2-10 enhancement panel UI mid-flight (uncommitted). Waves 1+2 merged (PR #9, #10); develop → main merged (PR #14).
- **Live:** server `https://deung-pu-game.onrender.com` (Render free tier + UptimeRobot, `/healthz` — stays free until it actually breaks, D-058) · client `https://deung-pu.softrock.space/game` (Hostinger). Production guest login + realtime connect verified 2026-07-13 (env fix: Hostinger runtime needs DATABASE_URL/SESSION_SECRET/JWT_SECRET; JWT_SECRET must match Render; NEXT_PUBLIC_RT_URL at build time).
- **Spec:** game v15.3 / tech v1.5.2 + Production Bible Set v1 (`docs/design/bibles/`). Reinforcement fully decided (R1–R10) → D-048..D-055 (Gold milestone, curve +6..+15, E3 monster stats all closed).
- **DB:** Hostinger **MariaDB** (not MySQL 8) **is production** (single DB, no separate test tier — D-057), migration `0001_init` applied. P2-16 re-scoped: rename `upg_kraeng` → `upg_reinforcement` before real save data + wipe test data before external players + verify `0002` applied.
- **Infra:** agent-context-optimization merged (PR #13; MapRoom split deferred to a future PR).

## Task board — P2 wave 3 (in progress)

| ID | Task | Status |
|---|---|---|
| P2-07 | Inventory/equipment UI | ✅ done (server + UI committed) |
| P2-08 | Currency ledger (never-downgrade) | ✅ done |
| P2-09 | Drop + EXP + reinforcement/fragment config | ✅ done (config/loader; live drops arrive P2B) |
| P2-10 | Guaranteed reinforcement (+15 cap) | 🔨 server done; enhancement panel UI mid-flight (uncommitted) |
| P2-11 | Shop | not started |
| P2-12 | DG lite + hint panel ("ของหายากมากับบอส") | not started |
| P2-13 | Tab policy (D-056: AFK stays, no forced disconnect) | not started |
| P2-15 | Mobile pass | not started |
| P2-17 | Storage/Delivery | not started |
| SVG-01 | SVG pipeline foundation (content track C0/C1 pairs) | not started |

## Open with owner (not blocking structure)

- Production smoke test full round (deploy-checklist §3) still owed — guest login + connect verified 2026-07-13; 2-tab sync / combat / map-cross not yet.
- D-040 open items L1–L7 (bot hours, final-art order, P4/P5 calendar, payment gateway, audio budget, Arc 1 writer, bot/market UI spec) — decide at their phases, none blocks wave 3.

## Do not touch

`docs/design/**` + `docs/tech/**` — owner-gated spec (tech DRAFTs editable per work). Canonical IDs lock once save data exists.

## Pointers

- Rules: `docs/agent-rules.md` · Decisions: `docs/decision-index.md` · Map: `docs/CODEMAP.md` · Worklogs: `docs/history/`
- Run local realtime: T1 `npm run dev:server` · T2 `npm run dev` (no server → `/game` solo offline)
- Deploy: `docs/deploy-checklist.md`
