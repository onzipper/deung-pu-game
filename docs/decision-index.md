# Decision index

decision ที่ล็อกแล้ว — **อย่า re-propose** · เพิ่มแถวเมื่อเจ้าของเคาะ (วันที่ absolute เสมอ)

| วันที่ | Decision | สถานะ | เหตุผล |
|---|---|---|---|
| 2026-07-11 | **Spec-first rule**: เชื่อ spec เป็นหลัก ห้ามเดา ห้ามมั่ว ห้ามคิดเอง — งานที่นอกเหนือ/ขัด spec ต้องให้ owner อัปเดต spec ก่อนทุกครั้ง | Locked | owner กำหนดเป็น rule หลักของโปรเจกต์ตอน bootstrap |
| 2026-07-11 | Game spec canonical = **checkpoint v14** (`docs/design/deungpu_project_checkpoint_v14_...md`) · Tech spec = **architecture v1.4** (`docs/tech/deungpu_technical_architecture_v1.md`) | Locked | ไฟล์เก่ากว่า (v10–v13) ถูก merge เข้า v14 แล้ว ไม่นำเข้า repo |
| 2026-07-11 | Skill schema ownership: field names ตาม v14 §50.1 · Design Knobs ตาม v14 §48 · Design owns semantics/balance, Tech owns implementation (v14 §59.4) | Locked | ตัดปัญหา field ชื่อไม่ตรงระหว่าง design/tech |
| 2026-07-11 | Locked tech decisions L1–L17 (server-authoritative, MySQL 8 Hostinger, Render SG always-on, 5 อาชีพ, guest+email login, payment mock, 30 CCU, WASD+เมาส์+touch, true isometric, 5-dir+mirror, separated map rooms, reconnect 30s, Howler+Tone) | Locked | ดูรายละเอียด+เหตุผลที่ tech architecture §0.1 — single source, ไม่ copy มาซ้ำ |
| 2026-07-11 | ใช้ระบบ docs-for-AI ตาม ClickUp doc "AI Operating System — Starter Kit" (entry docs → current-state → routing maps → context packs → guardrails + path-guard test) | Locked | owner สั่ง setup ตาม starter kit ตอน bootstrap |
| 2026-07-11 | Branch model: feature branch → PR → owner อนุมัติ merge เข้า `main` ทุกครั้ง | Default (รอ owner ยืนยัน) | ตั้ง default ตาม starter kit หน้า 2 (owner gates) |
