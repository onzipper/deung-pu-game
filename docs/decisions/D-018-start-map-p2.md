# D-018 — Start point + map persistence deferred to P2
- Date: 2026-07-12 · Status: Locked · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **จุดเริ่มเกม + จำ map ตอน refresh = รอ P2 (persistence)**: ตอนนี้ boot เข้า P0 Test Field เสมอ (dev map, ทางเดียว → Map 1 ไม่มีย้อนกลับ — ตาม MAP_LAYOUT_BIBLE ที่มีแค่เมือง⇄Map 1); refresh ข้าม map แล้วเด้งกลับ map แรก = พฤติกรรมที่รับรู้แล้ว รอระบบ save P2 ค่อยทำ start-map จริง + จำ map ล่าสุด

สถานะ: Locked

เหตุผล: owner เคาะ ("รอทำตอน P2 ตามเดิม")
