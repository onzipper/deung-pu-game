# D-025 — System decisions: skill fields, click radius, Map 1
- Date: 2026-07-12 · Status: Locked · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **System decisions** (Bible 2.3–2.5): skill field grouping — `skillName`/`description` = client/shared, `statusEffects` แยก 2 ชั้น (client presentation / server-only magnitude+rules), client ห้ามมี authoritative formula · **click radius แยกตาม input mode** desktop 0.60 / touch 0.80 / assist 0.65 tile (คลิกพื้น priority movement เมื่อพ้น radius) · Map 1 รับรอง 40×40 + zone placement + respawn midpoint (bounds ±15% ได้, zone coords อยู่ใน config)

สถานะ: Locked

เหตุผล: Bible 2.3–2.5
