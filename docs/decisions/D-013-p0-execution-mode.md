# D-013 — P0 execution mode
- Date: 2026-07-12 · Status: Locked · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **P0 execution mode (เฉพาะ batch นี้)**: branch เดียว `feat/p0-engine-foundation` · commit แยกทีละ issue (P0-02→P0-12) · **PR เดียว**เข้า develop ให้ owner review ทีเดียวตอนจบ · gate ภายใน: test+lint+build ต่อ commit, never-downgrade zone รีวิวไขว้ 2 มุมมอง · spec gap ฝั่ง game design = จดคำถามค้าง ไม่เดา

สถานะ: Locked

เหตุผล: owner เคาะ — ลด review overhead ระหว่าง P0
