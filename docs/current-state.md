# Current state

> กติกา: อัปเดตไฟล์นี้ทุกรอบ · block ที่ถูก supersede → `docs/history/` · สั้นพออ่านได้ทุก session

_Last updated: 2026-07-11_

## Where we are

Project bootstrap เสร็จ: repo ใหม่ (`onzipper/deung-pu-game`) มี Next.js 16 shell เปล่า + spec ครบใน `docs/design` + `docs/tech` + ระบบ docs-for-AI ตาม AI Operating System Starter Kit — **ยังไม่เริ่มเขียนโค้ดเกม** phase ถัดไปคือ **P0 Combat Feel** (tech §12)

## Latest work

- 2026-07-11: สร้าง Next.js project + push ขึ้น GitHub
- 2026-07-11: นำ spec 6 ไฟล์เข้า repo (game spec v14 canonical + map bibles + tech architecture v1.4 + decision locks)
- 2026-07-11: ตั้งระบบ docs-for-AI (AI.md, CODEMAP, feature-map, context packs, decision-index, known-traps, path-guard test, agent personas)

## Blockers / owed

1. ยังไม่มีโค้ดเกม — P0 ต้องเริ่มจาก iso foundation (tech §17) — รอ owner สั่งเริ่ม
2. Branch model ผมตั้ง default: feature branch → PR → owner อนุมัติ merge เข้า `main` — **รอ owner ยืนยันหรือปรับ**
3. PixiJS 8 ยังไม่ได้ติดตั้ง (จะติดตั้งตอนเริ่ม P0)

## Owner decisions affecting immediate work

- Spec-first rule: ห้ามเดา ห้ามคิดเอง — เกิน spec ต้องอัปเดต spec ก่อน (decision-index #1)
- Locked decisions ทั้งหมด: tech architecture §0.1 (L1–L17) — server-authoritative, MySQL, Render, iso, 5 อาชีพ, ฯลฯ

## Do not touch right now

- `docs/design/**` + `docs/tech/**` — spec แก้ได้เฉพาะ owner เคาะ

## Next recommended work

- เริ่ม P0 issue แรก: iso foundation (`src/engine/`) — projection converter + depth sort + fixed-timestep loop ตาม tech §17, Appendix B
