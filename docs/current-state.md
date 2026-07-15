# Current state

_Last updated: 2026-07-15 · Status board only — history & detail: `docs/history/` (full pre-restructure snapshot: `docs/history/2026-07-13-current-state-archive.md`)_

## Now

- **OB push:** PR #21-23 merged → develop (combat two-way + boss depth + UI foundation + A3 hotbar + E3 HP/EXP/level cluster + E4 death toast). **Title splash** (§6 → /hub, แทน Next default) = `feat/title-screen`→develop. B4 = post-OB (D-064). Next: minimap/D.
- **Phase:** P2 wave 3 **code-complete** (P2-07..17 ✅, merged). Post-merge todo: **P2-16** handoff (rename `upg_kraeng`→`upg_reinforcement`, wipe test data, verify migrations).
- **SVG-01** merged (PR #15); rasterizer = `@resvg/resvg-js`.
- **Live:** server `https://deung-pu-game.onrender.com` (Render free tier + UptimeRobot, `/healthz`, D-058) · client `https://deung-pu.softrock.space/game` (Hostinger). Guest login + realtime connect verified 2026-07-13.
- **Spec:** game v15.4 / tech v1.5.3 + Bibles; D-063–066 remain locked. D-067 locks Bot = real-character autonomy (no clone/worker entity; tiers = continuity/recovery/workflow; instant takeover). D-068 locks Dung = hub/context guide and Help separate. **Implementation still uses clone/follower semantics and is not aligned.**
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
