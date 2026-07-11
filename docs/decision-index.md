# Decision index

decision ที่ล็อกแล้ว — **อย่า re-propose** · เพิ่มแถวเมื่อเจ้าของเคาะ (วันที่ absolute เสมอ)

| วันที่ | Decision | สถานะ | เหตุผล |
|---|---|---|---|
| 2026-07-11 | **Spec-first rule**: เชื่อ spec เป็นหลัก ห้ามเดา ห้ามมั่ว ห้ามคิดเอง — งานที่นอกเหนือ/ขัด spec ต้องให้ owner อัปเดต spec ก่อนทุกครั้ง | Locked | owner กำหนดเป็น rule หลักของโปรเจกต์ตอน bootstrap |
| 2026-07-11 | ~~Game spec canonical = checkpoint v14 · Tech spec = architecture v1.4~~ **Superseded 2026-07-12 → v15 / v1.5** (ดูแถวล่างสุด) | ~~Superseded~~ | ไฟล์เก่ากว่า (v10–v13) merge เข้า v14 แล้ว |
| 2026-07-11 | Skill schema ownership: field names ตาม v15 §50.1 · Design Knobs ตาม v15 §48 · Design owns semantics/balance, Tech owns implementation (v15 §59.4) | Locked | ตัดปัญหา field ชื่อไม่ตรงระหว่าง design/tech |
| 2026-07-11 | Locked tech decisions L1–L17 (server-authoritative, MySQL 8 Hostinger, Render SG always-on, 5 อาชีพ, guest+email login, payment mock, 30 CCU, WASD+เมาส์+touch, true isometric, 5-dir+mirror, separated map rooms, reconnect 30s, Howler+Tone) | Locked | ดูรายละเอียด+เหตุผลที่ tech architecture §0.1 — single source, ไม่ copy มาซ้ำ |
| 2026-07-11 | ใช้ระบบ docs-for-AI ตาม ClickUp doc "AI Operating System — Starter Kit" (entry docs → current-state → routing maps → context packs → guardrails + path-guard test) | Locked | owner สั่ง setup ตาม starter kit ตอน bootstrap |
| 2026-07-11 | Branch model: `develop` = integration branch — งานแตก branch จาก develop → เปิด PR กลับเข้า develop (owner review บน GitHub) · develop → `main` = owner gate ยืนยันทุกครั้ง | Locked | owner เคาะ |
| 2026-07-11 | Task tracking ใช้ **ClickUp** · GitHub ใช้รีวิวโค้ด (PR) | ~~Superseded 2026-07-12~~ (ดูแถวล่างสุด) | owner เคาะ |
| 2026-07-11 | ค่า balance ที่ spec ยังไม่กำหนด (เช่น ค่า k, ตาราง skill): **tech เป็นคนตั้งเลขเสนอ + อัปเดต spec** ให้ owner เคาะ ก่อน implement | Locked | owner เคาะ — สอดคล้อง spec-first rule (spec ถูกอัปเดตก่อนเสมอ) |
| 2026-07-11 | ภาพ ref `docs/design/art-reference/`: กลุ่ม A (01–03, pixel art) = style+layout target · กลุ่ม B (04–11, painterly) = **layout เท่านั้น ห้ามใช้เป็น style target** | Locked | owner แจ้งว่า 04–11 ไม่ใช่ pixel art — ขัด L14 ถ้าใช้เป็น style |
| 2026-07-11 | ClickUp token optimization: ใช้แนว (a) ID cache + (b) filter เข้ม/ห้ามดึง list ทั้งใบ + (c) โยนงาน ClickUp ให้ subagent สรุปสั้น — ทำเป็น skill `clickup` | ~~Superseded 2026-07-12~~ (ยกเลิกทั้งแนวทาง — ดูแถวล่างสุด) | owner เคาะแนวทางแล้ว แต่สั่ง hold; ยังไม่สร้าง list ใน ClickUp |
| 2026-07-12 | **ยกเลิก ClickUp** — track งานในเรปโอผ่าน docs (`current-state.md` = task board · `feature-map.md` · `decision-index.md`) · **ไม่ลบข้อมูลเดิมใน ClickUp** ปล่อยค้างไว้เฉยๆ | Locked | owner สั่งเลิกใช้ ClickUp มาลุยใน repo ที่เดียว — supersede #13, #16 |
| 2026-07-12 | Game spec canonical = **checkpoint v15** (`docs/design/deungpu_project_checkpoint_v15_p0_scope_lock_ready.md`) · Tech spec = **architecture v1.5** (`docs/tech/deungpu_technical_architecture_v1_5_p0_scope_lock.md`) · เพิ่ม **P0_SCOPE_LOCK_v1** (`docs/design/`) · v14/v1.4 → `docs/history/` | Locked | owner นำ spec v15/v1.5 เข้า repo — supersede แถว canonical เดิม; delta หลัก = P0 Scope Lock (§60–62 / §19) |
| 2026-07-12 | **P0 execution mode (เฉพาะ batch นี้)**: branch เดียว `feat/p0-engine-foundation` · commit แยกทีละ issue (P0-02→P0-12) · **PR เดียว**เข้า develop ให้ owner review ทีเดียวตอนจบ · gate ภายใน: test+lint+build ต่อ commit, never-downgrade zone รีวิวไขว้ 2 มุมมอง · spec gap ฝั่ง game design = จดคำถามค้าง ไม่เดา · จบ P0 กลับ per-issue PR ตามเดิม | Locked | owner เคาะ — ลด review overhead ระหว่าง P0 |
