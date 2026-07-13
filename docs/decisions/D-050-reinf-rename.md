# D-050 — Rename to reinforcement, tradeable, static config
- Date: 2026-07-12 · Status: Locked (+ policy pending) · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **rename แกร่ง→เสริมแกร่ง + ขาย/trade ได้ + Static Versioned Config**: `แกร่ง`(`upg_kraeng`)→**เสริมแกร่ง**(`upg_reinforcement`), `เศษแกร่ง`→**เศษเสริมแกร่ง** (สูตร 5→1 สืบทอด v15 pillar 31 ไม่เคาะใหม่) · ทั้งสองไอเทม **ขาย+trade ได้** (supersede tradable/sellable/craftable:false) · ค่าใหม่ทั้งหมด = **Static Versioned Config** (ยังไม่ทำ Admin UI/Remote Config/Live Rate) · pillar "ตีบวกมีเรื่องขิง" นิยามใหม่: ขิง = การล่า (drop+pity) ไม่ใช่การกด (RNG)

สถานะ: Locked (+ policy pending)

เหตุผล: owner เคาะ 2026-07-12 — **ค้างเคาะ R1 bindType (account-bound ขัด trade) · R2 ขาย NPC? · R3 เศษ drop/id · R4 คณิต +15 flat vs escalate · R5 milestone grant · R6 audio · R7 fragment phase · R8 P2 source gap · R9 +6..+15 multiplier · R10 rename window** (ดู Reinforcement doc §11)
