# D-057 — DB เดียว: Hostinger MariaDB = production เลย (ไม่มี test DB แยก)
- Date: 2026-07-13 · Status: Locked · Source: owner แชท 2026-07-13

## มติ + เหตุผล (verbatim)

Decision: **Hostinger MariaDB ตัวปัจจุบันคือ production DB แล้ว** — งบตอนนี้มีพอสำหรับแค่ **local + prod** เท่านั้น (ไม่มีชั้น test/staging แยก) · ฝั่ง tech ปรับตามได้เลย

เหตุผล: ข้อจำกัดงบประมาณ — owner เคาะในแชท 2026-07-13

## ผลต่อ tech (สิ่งที่เปลี่ยนจากเดิม)

- ยกเลิกแนวคิด "production data stays EMPTY until P2-16 single apply" — DB ที่ apply migration แล้ว (`0001_init` + `0002`) คือ prod ตัวจริง
- **P2-16 เปลี่ยนความหมาย**: ไม่ใช่ "ต่อ prod ครั้งแรก" อีกต่อไป → เหลือเป็นรอบเก็บงาน DB ก่อนรับผู้เล่นจริง: ① rename `upg_kraeng` → `upg_reinforcement` ต้องลง**ก่อนมี save data จริง** (canonical ID lock) ② เคลียร์ข้อมูลทดสอบออกก่อนเปิดผู้เล่นภายนอก ③ ยืนยัน migration ทุกตัว apply ครบบน Hostinger
- dev local ยังใช้ MySQL/MariaDB local ตาม `.env.example` เหมือนเดิม — ห้าม dev ชี้ prod

Related: [[D-016]] [[D-031]] [[D-058]]
