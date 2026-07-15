# D-068 — ดึ๋งๆ = Contextual Guide; Help แยกเป็น Static Knowledge Base
- Date: 2026-07-15 · Status: Locked · Source: owner แชท 2026-07-15

## มติ

- ดึ๋งๆ **ไม่ติดตามตัวละครตลอดเวลา**: มีตำแหน่งประจำในเมืองหรือ safe hub และถูกเรียกหรือปรากฏชั่วคราวเป็น portrait, bubble หรือ world presentation ในบริบทที่เกี่ยวข้องได้
- หน้าที่ของดึ๋งๆ คือ contextual next-best-action, อธิบายปัญหาปัจจุบัน, returning summary และ flavor/emotion/game identity โดยอิง context/state จริงเท่านั้น
- **Help** เป็น searchable, categorized static knowledge base สำหรับความหมายระบบ วิธีใช้ stat/rule/control/tier และกติกาทั่วไป; **ดึ๋งๆ ไม่ใช่ Help database** — deep-link ไป Help ได้แต่ไม่ duplicate หรือเป็นเจ้าของฐานความรู้นั้น
- ดึ๋งๆ ไม่ต่อสู้ ไม่เพิ่ม stat ไม่เก็บ loot ไม่ควบคุม Bot ไม่ทำงานแทนผู้เล่น ไม่เป็น quest list/mega-menu และไม่มี level, equipment, hunger, skill, reward track, daily task, gameplay progression system หรือ gacha
- ดึ๋งๆ ไม่ใช่ paid feature ไม่มี paid power และไม่ฉลาดขึ้นตาม Bot tier
- **ความสัมพันธ์ระหว่าง Bot กับดึ๋งๆ เป็น presentation เท่านั้น**: Bot เป็นระบบควบคุมตัวละคร; ดึ๋งๆ เล่าเฉพาะ facts เช่น แผนหยุดเพราะอะไร เป้าหมายสำเร็จหรือไม่ ได้ของสำคัญหรือแผนยังทำงานอยู่
- ไม่มี permanent Dung-Dung HUD button เพิ่มเมื่อ Help/Utility entry รองรับแล้ว; context chip แสดงเฉพาะเมื่อมีคำแนะนำ relevant จริง ไม่มี forced popup และผู้เล่นปิด guidance ได้
- D-037 เรื่อง local-only/no server tick สำหรับ P2/P2B ยัง Locked; shared/party visibility เป็น future decision แยก

## ผลต่อเอกสารเดิม

- **SUPERSEDES บางส่วนของ D-034 และ Companion spec:** follower identity, FOLLOW state machine, dedicated Dung HUD และ combined Help/Journal/Guidance mega-panel
- **KEEP:** voluntary/no-power principles, optional first encounter, personality/flavor, no stat/combat target/damage/collision, recommendation eligibility/reason/dismissal/cooldown และ authoritative-state validation
- D-035 ยัง Locked และชัดขึ้น: ดึ๋งๆ ไม่ใช่ Bot และเปิดบท Bot micro-tutorial ได้ในฐานะ presentation layer เท่านั้น
