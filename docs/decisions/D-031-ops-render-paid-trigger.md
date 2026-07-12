# D-031 — Ops: Render paid upgrade trigger
- Date: 2026-07-12 · Status: Locked · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **Ops**: Render paid always-on อัปเกรดเมื่อชน hard trigger ใดก่อน — เชิญคนนอก >5 / scheduled test >60 นาที / เก็บ persistence data จริง / เริ่ม P2 integration environment (UptimeRobot ≠ production reliability) · origin restriction + JWT handshake = ทำใน P2 พร้อม auth

สถานะ: Locked

เหตุผล: Bible 5.1–5.2
