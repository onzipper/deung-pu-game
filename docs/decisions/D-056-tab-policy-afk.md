# D-056 — Tab policy: AFK ได้เต็มที่ (ยกเลิก forced disconnect)
- Date: 2026-07-13 · Status: Locked · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

ทิศหลัก (owner verbatim): "คือผมอยากให้มันมีการ AFK ได้ครับ ขอแค่เขาไม่ปิด tab หรือ ไม่ปิด บราวเซอร์ ไม่อยากให้มีการหยุดทำงานอะไรเลย"

Party share (owner verbatim): "หากเปิด BOT ช่วยไม่ตัด แต่ยืนเฉยๆ ตัดส่วนแบ่งครับ"

Decision: **AFK ค้างในโลกได้เต็มที่ตราบใดไม่ปิดแท็บ/เบราว์เซอร์ — ไม่มี forced disconnect ใด ๆ** (ยกเลิก safe-disconnect countdown ทั้งชุดของ §59.1.2). **Supersede §59.1.2 ข้อ 3 (field idle 15s→countdown→30s disconnect), ข้อ 5 (city 60s disconnect), ข้อ 6 (party extended 120–180s window), ข้อ 7 (โหมด "ปักหลัก" toggle — ตัดทิ้ง).** คงข้อ 1 (backgrounding ≠ bot), ข้อ 2 (hidden → หยุดส่ง input, server ถือ character เป็น entity ต่อ), และ **ข้อ 4 (ระหว่าง combat ยังรับ damage ตามปกติ ไม่ auto-cast)** ไว้ตามเดิมเพื่อกัน exploit หนีตายด้วยการ AFK

รายละเอียดที่เคาะ:
- **ตายคาสนาม = Option A** (ของ game-designer proposal 2026-07-13): **ไม่มี idle de-aggro** — มอนตีต่อ ตายได้ทุกโซน; AFK ในโซนอันตราย = ความเสี่ยงของผู้เล่นเอง (คง §59.1.2 ข้อ 4)
- `afkHardCapHours = null` ใน P2 — ไม่ cap connection ค้าง; เดินสาย knob ไว้ **inert** แล้วทบทวนก่อน open alpha เมื่อรู้ concurrency จริง (Render free tier)
- `idleIndicatorSec = 60` — no input ครบ 60s → ป้าย AFK อัตโนมัติให้ผู้เล่นอื่นเห็น (โปร่งใส, ไม่ต้องมี toggle "ปักหลัก")
- **มือถือ = best-effort** — iOS/Android OS freeze/kill แท็บพื้นหลังเอง (~30s–ไม่กี่นาที) คุมไม่ได้ทาง code; หลุดแล้วตกเข้า reconnect grace 30s ตามปกติ → ต้องมี **ข้อความอธิบายข้อจำกัด OS** ให้ผู้เล่นเข้าใจ ไม่รู้สึกว่าเกมพัง
- **reconnect grace 30s (§59.1) ไม่แตะ** — ปิดแท็บ/OS kill → ค้างในโลก ≤30s แล้วถูกเอาออก
- **Party share (P2B)**: ส่วนแบ่ง EXP/loot ผูกกับ contribution — ยืนนิ่งเกินเกณฑ์ป้าย AFK (`idleIndicatorSec`) = ไม่รับ share; ระบบช่วยเล่นที่สร้าง contribution จริง (เช่น Online Bot, อนาคต) = ไม่ตัด. บันทึกเป็นกติกาสำหรับระบบ party — enforce ตอน P2B

Knobs (config, §48 Design Knob):
- `afkHardCapHours` = `null` (inert ใน P2) · PENDING revisit ก่อน open alpha
- `idleIndicatorSec` = `60`
- `reconnectGraceSec` = `30` (คงเดิม §59.1)
- `fieldIdleDeAggroSec` = ไม่มี (Option A)

สถานะ: Locked

เหตุผล: owner เคาะ 2026-07-13 — ปรับทิศจาก §59.1.2 (v15.2 "safe-disconnect flow") เป็น "AFK ค้างเต็มที่" ตามคำเคาะ verbatim ข้างบน; game-designer proposal 2026-07-13 (Option A + knob set) เป็นฐาน
