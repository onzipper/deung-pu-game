# D-030 — Background tab (production)
- Date: 2026-07-12 · Status: Locked · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **Background tab (production, Bible 5.3 + Q5)**: hidden → หยุดส่ง input, ตัวละครยังเป็น entity · ไม่ combat 15s → countdown → 30s → **safe-disconnect + save ตำแหน่ง safe-valid** (login กลับ safe camp ถ้าตำแหน่งไม่ valid) · อยู่ combat = รับ damage ต่อ ไม่ auto-cast, disconnect หลัง combat จบ/ตาย · city/safe camp 60s · ตัวเลข 15/30/60 = draft knobs **PENDING tune** (Q5.3) · party member ได้ extended window ~120–180s knob (Q5.2 option ข) · **โหมด "ปักหลัก"** = toggle ชัดเจนเพื่อค้างออนไลน์โชว์ตัวโดยไม่มี automation (Q5.4) — backgrounding ≠ bot; farming ต้องกด Online Bot เท่านั้น · enforce ตอน P2 (ต้องมีระบบ save ก่อน)

สถานะ: Locked

เหตุผล: Bible 5.3 + Q5.1–5.4 2026-07-12 — supersede แถว "ค้างออนไลน์ตลอด" ด้านบน
