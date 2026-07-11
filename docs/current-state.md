# Current state

> กติกา: อัปเดตไฟล์นี้ทุกรอบ · block ที่ถูก supersede → `docs/history/` · สั้นพออ่านได้ทุก session

_Last updated: 2026-07-12_

## Where we are

Project bootstrap เสร็จ: repo ใหม่ (`onzipper/deung-pu-game`) มี Next.js 16 shell เปล่า + spec ครบใน `docs/design` + `docs/tech` + ระบบ docs-for-AI ตาม AI Operating System Starter Kit — **ยังไม่เริ่มเขียนโค้ดเกม** phase ถัดไปคือ **P0 = Engine Foundation Vertical Slice** (tech §19 · `docs/design/deungpu_P0_SCOPE_LOCK_v1.md`)

## Latest work

- 2026-07-11: สร้าง Next.js project + push ขึ้น GitHub
- 2026-07-11: นำ spec 6 ไฟล์เข้า repo (game spec v14 canonical + map bibles + tech architecture v1.4 + decision locks)
- 2026-07-11: ตั้งระบบ docs-for-AI (AI.md, CODEMAP, feature-map, context packs, decision-index, known-traps, path-guard test, agent personas)
- 2026-07-11: เพิ่ม specialist personas (engine/game/ui/qa/docs-curator) — realtime/worker/data/audio จดเป็น deferred รอ phase จริง (`.claude/README.md`)
- 2026-07-11: owner เคาะ 3 decisions: branch model (develop), ClickUp tracking, tech ตั้งเลข balance + update spec (ดู decision-index)
- 2026-07-11: นำภาพ ref 11 ภาพเข้า `docs/design/art-reference/` — กลุ่ม A (pixel art) = style target, กลุ่ม B = layout เท่านั้น
- 2026-07-12: owner สั่ง**เลิกใช้ ClickUp** — track งานใน repo ที่เดียว (docs); ไม่ลบข้อมูลใน ClickUp (decision-index #13/#16 superseded)
- 2026-07-12: import **spec v15 + tech v1.5 + P0_SCOPE_LOCK_v1**; ย้าย v14/v1.4 → `docs/history/`; อัปเดต reference ทุก index doc (canonical ชี้ v15/v1.5) — delta หลัก = P0 Scope Lock

## Blockers / owed

1. ยังไม่มีโค้ดเกม — **owner สั่ง "ยังไม่แก้โค้ด อยู่ช่วง tune docs"** — P0 เริ่มเมื่อ owner เคาะ
2. ค้าง: tech ร่างตัวเลข balance P0 (ค่า k, ตาราง skill 5 อาชีพ) เสนอเป็น spec update ให้ owner เคาะ (decision-index)
3. ~~ClickUp skill~~ — **ปิดแล้ว 2026-07-12** (เลิกใช้ ClickUp)
4. PixiJS 8 ยังไม่ได้ติดตั้ง (จะติดตั้งตอนเริ่ม P0)
5. ภาพ ref กลุ่ม B (04–11) เป็น painterly — owner อาจ gen ใหม่เป็น pixel art มาแทน

## Owner decisions affecting immediate work

- Spec-first rule: ห้ามเดา ห้ามคิดเอง — เกิน spec ต้องอัปเดต spec ก่อน (decision-index #1)
- Locked decisions ทั้งหมด: tech architecture §0.1 (L1–L17) — server-authoritative, MySQL, Render, iso, 5 อาชีพ, ฯลฯ

## Do not touch right now

- `docs/design/**` + `docs/tech/**` — spec แก้ได้เฉพาะ owner เคาะ

## Next recommended work

- **P0 ยัง hold** (owner ยังไม่สั่งเริ่มโค้ด — อยู่ช่วง tune docs) — เมื่อ GO: เริ่ม P0-01 Project Runtime Setup → P0-02 iso foundation (`src/engine/`: projection converter + depth sort + fixed-timestep loop) ตาม tech §17/§19 + `docs/design/deungpu_P0_SCOPE_LOCK_v1.md`, Appendix B
