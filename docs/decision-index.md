# Decision index

decision ที่ล็อกแล้ว — **อย่า re-propose** · เพิ่มแถวเมื่อเจ้าของเคาะ (วันที่ absolute เสมอ)

| วันที่ | Decision | สถานะ | เหตุผล |
|---|---|---|---|
| 2026-07-11 | **Spec-first rule**: เชื่อ spec เป็นหลัก ห้ามเดา ห้ามมั่ว ห้ามคิดเอง — งานที่นอกเหนือ/ขัด spec ต้องให้ owner อัปเดต spec ก่อนทุกครั้ง | Locked | owner กำหนดเป็น rule หลักของโปรเจกต์ตอน bootstrap |
| 2026-07-11 | Game spec canonical = **checkpoint v14** (`docs/design/deungpu_project_checkpoint_v14_...md`) · Tech spec = **architecture v1.4** (`docs/tech/deungpu_technical_architecture_v1.md`) | Locked | ไฟล์เก่ากว่า (v10–v13) ถูก merge เข้า v14 แล้ว ไม่นำเข้า repo |
| 2026-07-11 | Skill schema ownership: field names ตาม v14 §50.1 · Design Knobs ตาม v14 §48 · Design owns semantics/balance, Tech owns implementation (v14 §59.4) | Locked | ตัดปัญหา field ชื่อไม่ตรงระหว่าง design/tech |
| 2026-07-11 | Locked tech decisions L1–L17 (server-authoritative, MySQL 8 Hostinger, Render SG always-on, 5 อาชีพ, guest+email login, payment mock, 30 CCU, WASD+เมาส์+touch, true isometric, 5-dir+mirror, separated map rooms, reconnect 30s, Howler+Tone) | Locked | ดูรายละเอียด+เหตุผลที่ tech architecture §0.1 — single source, ไม่ copy มาซ้ำ |
| 2026-07-11 | ใช้ระบบ docs-for-AI ตาม ClickUp doc "AI Operating System — Starter Kit" (entry docs → current-state → routing maps → context packs → guardrails + path-guard test) | Locked | owner สั่ง setup ตาม starter kit ตอน bootstrap |
| 2026-07-11 | Branch model: `develop` = integration branch — งานแตก branch จาก develop → เปิด PR กลับเข้า develop (owner review บน GitHub) · develop → `main` = owner gate ยืนยันทุกครั้ง | Locked | owner เคาะ |
| 2026-07-11 | Task tracking ใช้ **ClickUp** · GitHub ใช้รีวิวโค้ด (PR) | Locked | owner เคาะ |
| 2026-07-11 | ค่า balance ที่ spec ยังไม่กำหนด (เช่น ค่า k, ตาราง skill): **tech เป็นคนตั้งเลขเสนอ + อัปเดต spec** ให้ owner เคาะ ก่อน implement | Locked | owner เคาะ — สอดคล้อง spec-first rule (spec ถูกอัปเดตก่อนเสมอ) |
| 2026-07-11 | ภาพ ref `docs/design/art-reference/`: กลุ่ม A (01–03, pixel art) = style+layout target · กลุ่ม B (04–11, painterly) = **layout เท่านั้น ห้ามใช้เป็น style target** | Locked | owner แจ้งว่า 04–11 ไม่ใช่ pixel art — ขัด L14 ถ้าใช้เป็น style |
| 2026-07-11 | ClickUp token optimization: ใช้แนว (a) ID cache + (b) filter เข้ม/ห้ามดึง list ทั้งใบ + (c) โยนงาน ClickUp ให้ subagent สรุปสั้น — ทำเป็น skill `clickup` | Locked แนวทาง — **ยังไม่ implement, รอ owner สั่ง** | owner เคาะแนวทางแล้ว แต่สั่ง hold; ยังไม่สร้าง list ใน ClickUp |
