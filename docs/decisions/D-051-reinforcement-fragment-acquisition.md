# D-051 — Reinforcement fragment acquisition
- Date: 2026-07-13 · Status: Locked · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **เศษเสริมแกร่ง — การได้มา (LOCKED)**: แหล่ง = Map Boss เท่านั้น (independent roll แยกจากตัวเต็ม, `fragmentDropChancePercent: 10.7`, ไม่แตะ pity ตัวเต็ม) · ไม่มี fragment pity ใน v1 · exchange 5→1 คงเดิม · item `upg_reinforcement_fragment` stack 999, tradable/sellable/craftable true, purchasable ด้วย Gold/เงินจริง = false · phase **P2B** ทั้งชุด (P2 = config/flag เท่านั้น) · เป้า supply รวม (ตัวเต็ม+เศษ) ง่ายขึ้น ~15% (×0.85, เส้นทางตรง 8.24→เป้ารวม ≈7.0 clears/ชิ้น) · ปิด R3+R7

สถานะ: Locked

เหตุผล: owner เคาะ 2026-07-13 — ดู `docs/design/deungpu_REINFORCEMENT_SYSTEM_DECISION_v1.md` §3.5
