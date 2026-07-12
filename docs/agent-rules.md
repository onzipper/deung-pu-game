# Agent rules — กติกากลางสำหรับ brief/subagent ทุกตัว

> เกิดจาก efficiency decision #3 (decision-index 2026-07-12) — รวมกติกาที่เคย paste ซ้ำในทุก brief ไว้ที่เดียว
> **วิธีใช้:** orchestrator เขียนใน brief ว่า "อ่าน `docs/agent-rules.md` แล้วทำตาม" แทนการ paste กติกาทั้งชุด · agent ที่ได้รับ brief ต้องอ่านไฟล์นี้ก่อนเริ่มงาน

## 1. Spec-first (สรุปจาก AI.md — ฉบับเต็มชนะเสมอ)

- game semantics/balance ยึด game spec v15.2 + Production Bible Set (`docs/design/bibles/`) · implementation ยึด tech architecture v1.5.2
- งานนอก/ขัด spec → **หยุด รายงานกลับ** ไม่เดา ไม่ตัดสินใจแทน owner
- field names ตรง v15 §50.1 เป๊ะ · ค่า balance ทุกตัวอ่านจาก config (Design Knobs §48) ห้าม hardcode

## 2. ก่อนแตะโค้ด

1. อ่าน `docs/known-traps.md` — บั๊กที่เคยเจอ ห้ามเจอซ้ำ
2. เช็ค `docs/CODEMAP.md` ก่อนเขียน utility ใหม่ — ถ้ามีของเดิม ให้ reuse
3. match pattern/สไตล์ของไฟล์ข้างเคียง — ทั้งโค้ด, ชื่อ, ความหนาแน่น comment
4. layer boundary: `src/engine/**` ห้าม import React · world state อยู่ game loop ห้ามเข้า React state · UI คุยกับ game ผ่าน Zustand bridge เท่านั้น

## 3. Never-downgrade zones (ห้ามลดคุณภาพ/ห้ามเดา — ถ้าไม่แน่ใจให้หยุดถาม)

- iso coordinate / depth-sort correctness
- combat result calculation (สูตร damage, RNG, multi-hit rounding)
- DB schema / migration
- currency ledger

## 4. Definition of done ของทุก task

- เทสต์ที่เกี่ยวเขียว: `npm test` (รวม docs path-guard) · `npm run lint` · งานที่แตะ build: `npm run build`
- **ทุก code change อัปเดต docs ที่กระทบใน change เดียวกัน** — อย่างน้อย CODEMAP เมื่อ add/move/delete ไฟล์
- temp/proof script ที่วางใน repo root ต้องลบทันทีที่ใช้เสร็จ (ค้างไว้ทำ `next build` พัง — known-trap)
- ห้าม commit `.env` / secret / password ใดๆ

## 5. รายงานผลกลับ orchestrator — terse data-first (internal เท่านั้น)

รายงาน **ภายใน** (subagent → orchestrator) ให้สั้นแบบ data-first — ไม่ต้องเขียนร้อยแก้ว ไม่ต้องเกริ่น ไม่ต้องสรุปซ้ำ:

```
DONE|BLOCKED|PARTIAL
files: <path:line ที่แตะ/สร้าง>
tests: <คำสั่งที่รัน + ผล>
deviations: <จุดที่ทำต่างจาก brief + เหตุผล — สำคัญที่สุด ห้ามละ>
notes: <เฉพาะสิ่งที่ orchestrator ต้องรู้ต่อ เช่น trap ใหม่, debt, open question>
```

- **deviations ห้ามละเว้น** — ถ้า brief ผิด/ทำตามไม่ได้ ต้องบอกว่าเบี่ยงตรงไหนเพราะอะไร (เคยมีเคสจริง: brief สั่งใช้ `tsx` ตรงๆ แต่ต้องใช้ `--tsconfig server/tsconfig.json` — agent เบี่ยงถูกและรายงาน = ดีมาก)
- กติกานี้ใช้เฉพาะรายงานภายใน — **เอกสารใน repo และรายงานถึง owner ยังเป็นภาษาไทยอ่านง่ายเต็มรูปแบบ** (decision-index 2026-07-12: caveman-code ไม่ใช้ เอาเฉพาะหลักการ terse internal report)

## 6. Token discipline

- อย่าอ่าน src/ ทั้งหมด — ใช้ CODEMAP + § ที่ brief ชี้
- spec/bible ยาวมาก — Grep หา § ก่อน อ่านเฉพาะช่วงที่เกี่ยว ห้ามอ่านทั้งไฟล์
- `docs/history/` = off-budget อ่านเฉพาะตอนถูกชี้

## 7. Docs routing tier (owner เคาะ 2026-07-12)

งาน docs ไม่ต้องใช้ tier สูงเสมอไป — แบ่งตาม "เหลือการตัดสินใจแค่ไหน" เหมือนงานโค้ด:

| ชนิดงาน docs | ใคร/tier |
|---|---|
| ตีความ decision ของ owner ลง spec/decision-index (amendment, supersede logic) | orchestrator ทำเอง หรือ tier สูง — spec = source of truth เขียนพลาด = agent ทุกตัวเดินผิดตาม |
| Docs ประจำรอบ: อัปเดต CODEMAP ตอน add/move ไฟล์, ย้าย block เก่า → history, ไล่ pointer, sync current-state ตาม worklog ที่ orchestrator สรุปให้ | **docs-curator / tier กลางลงมา** — mechanical, pattern ชัด |
| แก้ค่าเดียว/label เดียว/บรรทัดเดียวตามคำสั่งเป๊ะ | tiny-worker (tier ต่ำสุด) |

- **เพดาน: docs ประจำรอบห้ามใช้เกิน tier กลาง** ยกเว้นงานนั้นแตะ `docs/design/**`/`docs/tech/**` (spec) หรือ decision-index
- เหตุผลที่ orchestrator เขียน decision record เอง: ความรู้อยู่ในบทสนทนากับ owner — เขียน brief ส่งต่อ = จ่ายสองรอบ + เสี่ยงความหมายเพี้ยน
- **Doc ใหม่จาก owner**: ถ้ามาเป็น**ไฟล์/zip** → ส่ง tier กลางอ่านทำ "สรุปโครงสร้าง + รายการจุดชนกับ spec เดิม" ก่อน แล้ว orchestrator อ่านสรุป + เจาะเฉพาะหัวข้อสำคัญเอง (scope, lock summary, DoD) — การตีความ/ตั้งคำถามถึง owner ยังเป็นของ orchestrator · ถ้า doc ถูกแนบมา**ในแชท** = อยู่ใน context แล้ว อ่านเองเลย ห้ามส่งให้ agent อ่านซ้ำ (จ่ายสองต่อ) · เนื้อ spec ที่มาทางแชทห้ามใช้เป็นต้นฉบับ import (mojibake trap — ขอไฟล์จริงจาก owner เสมอ)
