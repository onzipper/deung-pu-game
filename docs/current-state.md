# Current state

_Updated 2026-07-16 · History: `docs/history/`_

## Now

- **OB:** PR #21-23 + title splash merged. B4 post-OB (D-064).
- **Phase:** P2 wave 3 **code-complete**. P2-16 handoff remains (rename reinforcement ID, wipe test data, verify migrations).
- **Live:** server `https://deung-pu-game.onrender.com` (Render free tier + UptimeRobot, `/healthz`, D-058) · client `https://deung-pu.softrock.space/game` (Hostinger). Guest login + realtime connect verified 2026-07-13.
- **Spec:** v15.5 / tech v1.5.3; D-063–070 locked (D-067 autonomy, D-068 Dung, D-069 town warp, D-070 town policy). **PR1–5 aligned:** one real actor + takeover/checkpoint; Free one-area/one-goal safe baseline (obstacle → WAITING_FOR_OWNER, owner stop → COMPLETED, invalid/forbidden → FAILED). PR5 live: Plus same-map recovery (opt-in potion via shared MSG_USE_ITEM, death revive-return, pocket fallback), live tier recheck (expired_readonly), server-owned town warp — Plus/Pro วาป city-hub ขาย/ฝาก/ซื้อคืน (D-070) แล้ววาปกลับ (finish-and-return takeover; bag preflight; town_trip_failed → รอเจ้าของ). **PR6–10 pending:** Pro workflows/restart resume, Bot UX, follower removal, searchable Help, contextual Dung; goal-chain/schedule states contract-only; Dung/Help noncanonical.
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

Ground-loot entity (lootOverflow reported, not persisted) · party share (§10.2, waits for party system) · starter loadout §7.7 not yet granted · shop unlockCondition tutorial not enforced · config loader DB override not wired into MapRoom (uses DEFAULT) · Field Boss `boss_map1_boiling_boar`: E3 stats + boss loot rebinding = P2B prep (D-064).

## Open with owner (not blocking structure)

- Production smoke test full round (deploy-checklist §3) — 2-tab sync / combat / map-cross not yet.
- D-040 open items: only **L2** (final-art order) remains — owner will decide later; L1/L3–L7 closed via D-063..D-065.

## Do not touch

`docs/design/**` + `docs/tech/**` — owner-gated spec. Canonical IDs lock once save data exists.

## Pointers

- Rules: `docs/agent-rules.md` · Decisions: `docs/decision-index.md` · Map: `docs/CODEMAP.md` · Worklogs: `docs/history/`
- Run local realtime: T1 `npm run dev:server` · T2 `npm run dev` (no server → `/game` solo offline)
- Deploy: `docs/deploy-checklist.md`
