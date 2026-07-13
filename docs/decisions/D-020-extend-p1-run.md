# D-020 — Extend run into P1
- Date: 2026-07-12 · Status: Locked · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **ขยาย run ยาวถึง P1** (World Sync): จบ P0 เปิด PR แล้ว**ไม่รอ merge** — แตก branch ซ้อน (`feat/p1-world-sync` ต่อจากหัว P0) ลุยต่อ → จบ P1 เปิด PR ที่สอง = **2 PR ซ้อนกัน** review ตามลำดับ · P1 issue breakdown = tech ร่างลง docs ก่อนเริ่ม (owner ดูตอน review) · **ตัวเลข balance (ค่า k, ตาราง skill 5 อาชีพ) ใช้ค่า draft ใน config ที่ mark `PENDING OWNER` + ร่างเป็น spec-update proposal ให้ owner เคาะตอน review** — เลขยังไม่เป็น spec จนกว่าเคาะ · พัฒนา local ทั้งหมด (ยังไม่แตะ Render/MySQL)

สถานะ: Locked

เหตุผล: owner เคาะ 2026-07-12 — run ต่อเนื่องไม่สะดุดด่าน balance โดยอำนาจเคาะยังอยู่ที่ owner (สอดคล้อง spec-first + knob rule)
