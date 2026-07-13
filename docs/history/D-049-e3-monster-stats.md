# D-049 — E3 open: monster combat stat table
- Date: 2026-07-12 · Status: **Closed 2026-07-13 → ปิดโดย D-055** (ตารางค่า production + player baseline lock) · Source row: docs/decision-index.md (2026-07-13 extraction)

> ⚠ ปิดแล้ว: ค่า production ทั้งหมดอยู่ที่ `docs/decisions/D-055-e3-monster-stats-player-baseline.md` + Reinforcement doc §9. เนื้อด้านล่างคงไว้เป็นประวัติ (สถานะ OPEN เดิม)

## มติ + เหตุผล (verbatim)

Decision: **E3 = OPEN — DESIGN REQUIRED**: Pending Design Item **"Map 1 Monster Combat Stat Table"** (`status: pending-owner-balance` · **blocks:** production monster tuning + final combat QA · **doesNotBlock:** schema/loader/placeholder/test env) · ตัวเลข hp/atk/def/moveSpeed/range/cooldown/anticipation/active/recovery/aggro/leash/breakPower/tierReduction ยังไม่มี production value · identity+EXP/Gold/Respawn เคาะแล้ว (5 มอน) · formula: `DMG = ATK × baseMultiplier × [50/(50+effectiveDEF)]`

สถานะ: **Open**

เหตุผล: owner 2026-07-12 — ทำ schema/placeholder ได้เลย, ห้าม hardcode/ถือ placeholder เป็น production
