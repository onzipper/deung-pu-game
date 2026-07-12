# D-022 — Balance baseline for P2
- Date: 2026-07-12 · Status: Locked (baseline) · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **Balance baseline P2 เคาะแล้ว** (Bible 1.1–1.9): k=**50** · ตารางนักดาบ lv1–10 + mob Map 1 รับรอง draft ใน `docs/design/proposals/deungpu_P1_BALANCE_PROPOSAL_v1.md` เป็น baseline (นก/หมูป่าต้องมี row แยกก่อน P2 content freeze) · hit tolerance ยืนยัน 1.40/0.35/20° · juice floor ยืนยัน level 1 (ผู้เล่นอื่นเห็นเบากว่า 1 ระดับ) · **resource = cooldown-only** (`resourceCost` คงไว้ default 0, ไม่มี mana/rage ใน P2) · **multi-hit rounding = ปัดยอดรวมครั้งเดียวแล้วกระจาย deterministic** (⚠ implementation debt: `src/game/combat/` ยังปัดต่อ sub-hit — ต้องแก้ก่อน/พร้อมงานนักธนู, never-downgrade zone) · **DEF เดียวใน P2** (`damageType` คงไว้เพื่อ VFX/อนาคต) · ทุกเลขยังเป็น Design Knob tune ได้ (k ขยับ 40–60 ไม่ถือว่าเปลี่ยนสูตร)

สถานะ: Locked (baseline)

เหตุผล: Bible 1.1–1.9 — เลิกสถานะ PENDING OWNER ของ proposal
