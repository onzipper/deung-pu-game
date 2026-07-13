# AI.md — universal agent entry point

สำหรับ AI agent ทุกตัว กติกา orchestration เฉพาะตัวหลักอยู่ใน CLAUDE.md; ทุกอย่างในนี้ใช้กับทุกตัว

## กฎเหล็กข้อ 1: Spec-first (ห้ามเดา ห้ามมั่ว ห้ามคิดเอง)

- **เชื่อ spec เป็นหลัก** — game semantics/balance ยึด game spec v15, implementation ยึด tech architecture v1.5
- ถ้างานที่ทำ **นอกเหนือ/ขัดกับ spec** → **หยุด** เสนอ owner ให้อัปเดต spec ก่อน แล้วค่อย implement — ไม่มีข้อยกเว้น
- ถ้า spec ไม่ครอบคลุมเรื่องที่ทำ → ถาม owner ไม่ใช่เดา
- Field names ใน code/JSON ต้องตรง v15 §50.1 เป๊ะ — ห้าม rename/duplicate semantic field
- ค่า balance ทุกตัวเป็น Design Knob (v15 §48) — อ่านจาก config ห้าม hardcode

## Roles

- **Owner/Director** (onzipper): ตัดสินทิศทาง, เคาะ spec, อนุมัติ merge/deploy, สั่งเริ่มงาน
- **Orchestrator AI**: วางแผน, แตกงานให้ subagent, แก้โค้ด/เทสต์/docs, หยุดที่ด่านอนุมัติ
- ข้อเท็จจริงข้ามรอบที่สำคัญ → ต้องลง repo docs; อย่าให้เจ้าของอธิบายซ้ำ

## Start here (ตามลำดับ)

1. `README.md` — โปรเจกต์คืออะไร, stack, คำสั่ง
2. `docs/current-state.md` — ตอนนี้อยู่ไหน/ติด/ค้าง/ห้ามแตะ
3. `docs/decision-index.md` — decision ที่ล็อกแล้ว อย่า re-propose
4. `docs/feature-map.md` — เฉพาะ feature ของงานตัวเอง

จากนั้นอ่าน **เฉพาะ context pack ที่ตรงงาน** แล้วค่อยอ่านไฟล์ที่แตะ

## Context routing

| ชนิดงาน | อ่าน |
|---|---|
| Game engine / PixiJS / iso / combat | `docs/context/engine.md` |
| UI / React overlay / HUD | `docs/context/ui.md` |
| Game semantics / balance / skill | game spec v15 **เฉพาะ § ที่เกี่ยว** (ดู docs/README.md) |
| Backend / realtime / DB (P1+) | tech architecture § ที่เกี่ยว |
| **จะแก้/อัปเดต spec** (owner เคาะแล้วเท่านั้น) | `docs/spec-update-playbook.md` |
| อะไรก็ตามที่แตะโค้ด | context pack ของ layer (`docs/context/`) — Traps section + `docs/agent-rules.md` (Shell & tooling traps) |

File → หน้าที่: `docs/CODEMAP.md` (แทนการ grep src/)

## Token rules

- อย่าอ่าน src/ ทั้งหมดก่อนวางแผน — ใช้ CODEMAP + feature-map
- อย่าอ่าน `docs/history/` นอกจาก current-state ชี้ไป
- งานเล็ก: ไม่เกิน 5 ไฟล์ก่อนเสนอแผน (รายละเอียด: `docs/token-budget.md`)
- **spec ยาวมาก — อ่านเฉพาะ § ที่เกี่ยวกับงาน ห้ามอ่านทั้งไฟล์**

## Required behavior

- วางแผนก่อนแก้ (ระบุระบบที่แตะ)
- ระบุคำสั่งเทสต์ที่จะรัน
- ทุก code change อัปเดต docs ที่กระทบใน change เดียวกัน (อย่างน้อย CODEMAP เมื่อ add/move/delete — test-enforced)
- match pattern เดิม; reuse utility เดิม (เช็ค CODEMAP ก่อนเขียนใหม่)
- ทำทีละ issue ตาม scope — ห้าม refactor กว้างโดยไม่ได้รับอนุมัติ

## Never change without owner confirmation

- **อะไรก็ตามที่ spec ไม่ครอบคลุม หรือขัดกับ spec** → spec ต้องถูกอัปเดต/เคาะก่อนเสมอ
- Merge `develop` → `main` (ยืนยันทุกครั้ง) — งานประจำ: แตก branch จาก `develop` → PR กลับเข้า `develop` ให้ owner review
- Schema ฐานข้อมูล / migration บน production
- Skill schema field names (v15 §50.1) — เพิ่ม field ใหม่ต้องผ่าน process v15 §59.4
- Design Knobs semantics (v15 §48) — tech ทำระบบให้ปรับค่าได้ แต่ไม่ตัดสิน balance เอง
- อะไรที่มาร์ก Locked ใน `docs/decision-index.md` และ tech architecture §0.1
- Production deploy (owner-triggered เสมอ)
- เรื่องที่กระทบ economy / combat / punishment / monetization / premium currency → หยุดถามก่อน (v15 §53)
