# Current state

_Last updated: 2026-07-13 · Status board only — history & detail: `docs/history/` (full pre-restructure snapshot: `docs/history/2026-07-13-current-state-archive.md`)_

## Now

- **Phase:** P2 wave 3 PR #1 (value loop) **done** on `feat/p2-wave3-value-loop` — P2-07/08/09/10/11 all committed (server+UI), shared `src/ui/panels/` framework (inventory/enhancement/shop). Gates green: vitest 1128, tsc, `npm run build`, e2e 8/8. Migration `0002` (shop ledger reasons) applied to prod DB. **Next:** open PR into develop for owner review → Part C (P2-12/13/17→15) as PR #2. Waves 1+2 merged (PR #9, #10); develop→main merged (PR #14).
- **SVG-01** pipeline done → **PR #15** open for review (`feat/svg-01-pipeline`); open point: rasterizer dep (sharp vs @resvg/resvg-js).
- **Live:** server `https://deung-pu-game.onrender.com` (Render free tier + UptimeRobot, `/healthz`, D-058) · client `https://deung-pu.softrock.space/game` (Hostinger). Guest login + realtime connect verified 2026-07-13.
- **Spec:** game v15.3 / tech v1.5.2 + Production Bible Set v1. Reinforcement → D-048..D-055. **P2B value-loop rulings all decided 2026-07-13 → D-063/064/065** (bot Free-forever+pass pricing, merchant dual-sink, event calendar, boss 3 tiers, Arc1 Ch1, audio=JS chiptune, art=filter+import; **Open Beta = full systems + Map 1 only**, maps 2–10 post-beta). Spec supersede marks pending (playbook run in progress).
- **DB:** Hostinger MariaDB is production (D-057), migrations `0001_init`+`0002` applied.

## Task board — P2 wave 3

| ID | Task | Status |
|---|---|---|
| P2-07 | Inventory/equipment UI | ✅ done |
| P2-08 | Currency ledger (never-downgrade) | ✅ done |
| P2-09 | Drop + EXP + reinforcement/fragment (config+runtime) | ✅ done |
| P2-10 | Guaranteed reinforcement (+15 cap) | ✅ done |
| P2-11 | Shop (buy/sell, city-hub) | ✅ done |
| P2-12 | DG lite + hint panel | not started |
| P2-13 | Tab policy (D-056: AFK stays) | not started |
| P2-15 | Mobile pass | not started |
| P2-17 | Storage/Delivery | not started |

## Follow-up (P2B, not blocking PR #1)

Ground-loot entity (full inventory → lootOverflow reported, not persisted) · party share (§10.2, waits for party system) · starter loadout §7.7 not yet granted · shop unlockCondition tutorial not enforced · config loader DB override not wired into MapRoom (uses DEFAULT).

## Open with owner (not blocking structure)

- Production smoke test full round (deploy-checklist §3) — 2-tab sync / combat / map-cross not yet.
- D-040 open items: only **L2** (final-art order) remains — owner will decide later; L1/L3–L7 closed via D-063..D-065.

## Do not touch

`docs/design/**` + `docs/tech/**` — owner-gated spec. Canonical IDs lock once save data exists.

## Pointers

- Rules: `docs/agent-rules.md` · Decisions: `docs/decision-index.md` · Map: `docs/CODEMAP.md` · Worklogs: `docs/history/`
- Run local realtime: T1 `npm run dev:server` · T2 `npm run dev` (no server → `/game` solo offline)
- Deploy: `docs/deploy-checklist.md`
