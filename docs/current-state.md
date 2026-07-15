# Current state

_Updated 2026-07-15 · History: `docs/history/` · archive: `docs/history/2026-07-13-current-state-archive.md`_

## Now

- **OB:** PR #21-23 + title splash merged. B4 = post-OB (D-064). Next: minimap/D.
- **Phase:** P2 wave 3 **code-complete**. P2-16 handoff remains (rename reinforcement ID, wipe test data, verify migrations).
- **SVG-01** merged; rasterizer = `@resvg/resvg-js`.
- **Live:** server `https://deung-pu-game.onrender.com` (Render free tier + UptimeRobot, `/healthz`, D-058) · client `https://deung-pu.softrock.space/game` (Hostinger). Guest login + realtime connect verified 2026-07-13.
- **Spec:** v15.5 / tech v1.5.3; D-063–066, D-067, D-068 locked. **PR1–4 aligned:** one stable real actor + atomic takeover/checkpoint; server-owned continuity runs the Free one-area/one-goal safe baseline and settles detected obstacles into WAITING_FOR_OWNER, explicit owner stop into COMPLETED, and invalid/forbidden world state into FAILED before reporting. Bag pressure includes Delivery Box fallback; proactive already-full preflight remains with PR5 inventory recovery. **PR5–10 pending:** Plus recovery, Pro workflows/restart resume, Bot UX, follower removal, searchable Help, and contextual Dung; recovery/town/workflow states remain contract-only and current Dung/Help remains noncanonical.
- **DB:** Hostinger MariaDB production (D-057); 0001-0002 applied · 0003/0004_bot hand-authored, unapplied.

## Task board — P2 wave 3 (code-complete)

| ID | Task | Status |
|---|---|---|
| P2-07 | Inventory/equipment UI | ✅ done |
| P2-08 | Currency ledger (never-downgrade) | ✅ done |
| P2-09 | Drop + EXP + reinforcement/fragment (config+runtime) | ✅ done |
| P2-10 | Guaranteed reinforcement (+15 cap) | ✅ done |
| P2-11 | Shop (buy/sell, city-hub) | ✅ done |
| P2-12 | DG lite + hint panel | ✅ done |
| P2-13 | Tab policy (D-056: AFK stays) | ✅ done |
| P2-15 | Mobile pass | ✅ done |
| P2-17 | Storage/Delivery | ✅ done |

## Follow-up (P2B, not blocking PR merge)

Ground-loot entity (full inventory → lootOverflow reported, not persisted) · party share (§10.2, waits for party system) · starter loadout §7.7 not yet granted · shop unlockCondition tutorial not enforced · config loader DB override not wired into MapRoom (uses DEFAULT) · Field Boss `boss_map1_boiling_boar`: E3 stats + boss loot rebinding = P2B prep (D-064).

## Open with owner (not blocking structure)

- Production smoke test full round (deploy-checklist §3) — 2-tab sync / combat / map-cross not yet.
- D-040 open items: only **L2** (final-art order) remains — owner will decide later; L1/L3–L7 closed via D-063..D-065.

## Do not touch

`docs/design/**` + `docs/tech/**` — owner-gated spec. Canonical IDs lock once save data exists.

## Pointers

- Rules: `docs/agent-rules.md` · Decisions: `docs/decision-index.md` · Map: `docs/CODEMAP.md` · Worklogs: `docs/history/`
- Run local realtime: T1 `npm run dev:server` · T2 `npm run dev` (no server → `/game` solo offline)
- Deploy: `docs/deploy-checklist.md`
