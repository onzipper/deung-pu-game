# Spec Update Playbook

> วิธีอัปเดต game spec (`docs/design/`) + tech spec (`docs/tech/`) — ใช้ทุกครั้งที่จะแตะ spec
> กติกาแม่: **spec แก้ได้เฉพาะเมื่อ owner เคาะแล้วเท่านั้น** (spec files เป็นของ owner — แก้ได้เฉพาะ owner เคาะ) — ห้ามแก้ล่วงหน้า ห้ามแก้ "ไปพลางๆ"

## เลือกโหมดก่อน

| สถานการณ์ | โหมด |
|---|---|
| owner เคาะ decision เพิ่ม/ปรับพฤติกรรม ไม่กี่เรื่อง | **A: Amendment** (in-place) |
| owner ยกเครื่อง spec แล้ววางไฟล์เวอร์ชันใหม่เอง | **B: Major version** (ไฟล์ใหม่) |

## โหมด A: Amendment (in-place) — ค่า default

ตัวอย่างจริง: v15 → v15.1 (2026-07-12, commit บน `feat/p1-world-sync`)

1. **ห้าม rename ไฟล์ / ห้ามสร้างไฟล์เวอร์ชันใหม่** — reference "v15 §50.1" ฝังอยู่ทั้งใน docs *และ comment ในโค้ด* (grep ดูก่อนถ้าไม่เชื่อ) rename = พังทั้ง repo
2. Bump version เฉพาะ **ใน header ของไฟล์** (เช่น v15 → v15.1, v1.5 → v1.5.1)
3. เพิ่ม/ต่อท้าย **"Amendment Log"** ใกล้ต้นไฟล์ (game spec ใช้ §0.0): วันที่ absolute + delta เป็นข้อๆ ชี้ § ที่แตะ + อ้าง decision-index แถวที่เกี่ยว
4. เนื้อ delta ลงเป็น **amendment subsection ใหม่** ใต้ § เดิม (เช่น §59.1.1, §57.3.1, §6.1, §15.7) — **additive เท่านั้น ห้ามลบ/เขียนทับเนื้อเดิม**; ถ้าเนื้อเดิมผิดจากของจริง ให้เขียนใน subsection ว่าย่อหน้าไหน supersede
5. สไตล์ภาษา: กลมกลืนกับ spec เดิม (ไทยปนศัพท์เทคนิค)

## โหมด B: Major version (owner วางไฟล์เอง)

ตัวอย่างจริง: v14 → v15 (2026-07-12)

1. Owner เซฟไฟล์จริงเอง — **ห้ามรับเนื้อ spec ผ่านการ paste ในแชท** (เคยเจอ mojibake ภาษาไทยเพี้ยน) · ตำแหน่งที่ถูก: game spec → `docs/design/` · tech → `docs/tech/`
2. ทับไฟล์เดิมได้เลย (git เก็บเวอร์ชันเก่าให้)
3. ไล่อัปเดต **pointer ทุกจุด** (checklist):
   - `docs/decision-index.md` — แถว canonical (supersede แถวเก่า อย่าลบ)
   - `docs/README.md` — ตาราง index
   - `CLAUDE.md` — เลขเวอร์ชันใน rule
   - `docs/context/engine.md` / `ui.md` — ถ้าอ้างเลขเวอร์ชัน
   - `docs/current-state.md` — บันทึกการย้าย
   - grep เลขเวอร์ชันเก่าทั่ว `docs/` + `src/` + `server/` เก็บตก (comment ในโค้ดอ้าง § ได้ แต่ต้องยังชี้ถูกไฟล์)
4. อ่าน delta ระหว่างเวอร์ชัน**เฉพาะ § ที่กระทบงานค้าง** แล้วอัปเดต current-state ถ้ามีผล

## กติกาที่ใช้ทั้งสองโหมด

- **เส้นแบ่ง "เคาะแล้ว vs PENDING"**: กลไกที่ owner เคาะ/ยืนยันจาก retest = เขียนเป็นของจริงได้ · **ตัวเลข balance ทุกตัว** (ค่า k, ตาราง skill, tolerance ฯลฯ) เข้า spec ผ่าน process **§59.4 เท่านั้น** — จนกว่าเคาะ ต้อง mark **PENDING OWNER** ชัดๆ ในข้อความ ห้ามเขียนเหมือนตัดสินแล้ว · คำถามที่ยังไม่เคาะ = เขียนเป็น open question
- **วันที่ absolute เสมอ** (2026-07-12 ไม่ใช่ "วันนี้")
- **Token discipline**: spec ยาวมาก — Grep หา § ก่อน อ่าน/แก้เฉพาะช่วงที่เกี่ยว **ห้ามอ่านทั้งไฟล์**
- **หลังแก้ทุกครั้ง**: (1) decision ใหม่ → ลงแถว `docs/decision-index.md` (2) bullet ใน `docs/current-state.md` (3) รัน `npm test` (docs path-guard ต้องเขียว) (4) commit เข้า branch งานปัจจุบัน — spec change นั่งไปกับ PR ให้ owner review
- ระหว่างที่ไม่มีคำสั่งแก้ spec: `docs/design/**` + `docs/tech/**` = **Do not touch** ตาม current-state
