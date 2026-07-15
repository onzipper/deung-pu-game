# D-069 — Bot town warp: Plus/Pro วาปเข้าเมืองทำธุระแล้ววาปกลับ (PR5)
- Date: 2026-07-16 · Status: Proposed (รอ owner lock ก่อนเริ่ม implement) · Source: owner แชท 2026-07-16 (PR5 decision gate)

## มติ (เคาะแล้วในแชท)

- **PR5 รวม town trip:** บอท tier เสียเงิน (Plus/Pro) ที่ต้องใช้บริการในเมือง (ขาย/ฝาก/ซื้อของที่ city-hub) **วาป**ไป city-hub ด้วยตัวละครจริง ทำธุรกรรมที่ตำแหน่งจริงในเมือง เสร็จแล้ววาปกลับ pocket เดิมและทำงานต่อ — ยกงาน town flow ที่เคยวางไว้ PR6 มาอยู่ PR5
- **Warp ฟรีสำหรับ Plus+Pro** (จ่าย pass แล้ว ไม่เก็บ gold เพิ่ม) มี **cooldown/trip cap เป็น Design Knobs** · **Free ไม่ไปเมือง** — เจออุปสรรคที่ต้องใช้เมืองยังหยุดรอเจ้าของ (WAITING_FOR_OWNER) เหมือนเดิมทุกกรณี
- **Warp = server-owned actor transfer** ระหว่าง MapRoom: จองที่ปลายทาง → ถอดตัวจากห้องเดิม → ใส่**ตัวเดิม identity เดิม**ที่ปลายทาง → ล้มเหลวขั้นไหน rollback แบบ fail-closed; actor อยู่ห้องเดียวเสมอ **ห้ามมี duplicate actor**; ไม่มี remote transaction เพราะตัวละครอยู่เมืองจริง
- **ไม่ใช่ paid power:** warp ไม่แตะ damage/attack speed/EXP/drop/loot luck — เป็น continuity/recovery convenience ตามกรอบ D-067 (paid value = continuity/recovery/workflow)

## รอเคาะก่อนเริ่ม implement Phase B (ค่าเสนอใน PR5 plan)

- Takeover กลาง trip: เสนอ **finish-and-return-then-pause** (fence ทันที ไม่ออกคำสั่งใหม่ → ธุรกรรมที่ค้าง drain → วาปกลับ farm → PAUSED + checkpoint); วาปกลับไม่ได้ → PAUSED ที่ city-hub และ checkpoint บอกตำแหน่งจริง
- Stop reason ใหม่ `town_trip_failed` → WAITING_FOR_OWNER (ตาราง settlement 13 → 14 ตัว — เกิน mapping ที่เคาะรอบแรกตอน scope ยังเป็น same-map)
- ค่า cooldown ระหว่าง trip และ trip cap ต่อชั่วโมง/ต่อ session

## ผลต่อเอกสารเดิม

- หลัง lock จะเพิ่ม **additive amendment** ใน checkpoint §4.1–§4.2 (ข้อความ "Plus = same-map fallback" และ "cross-map = Pro/PR6" ส่วน town trip) และ Runtime Bot §0.0.1 — ไม่ลบ historical text ตามแนว additive supersession เดิม
- D-067 ยัง Locked ทุกส่วน — D-069 เป็นการเติม mechanic ใต้กรอบเดิม ไม่เปลี่ยน tier ceiling/economy
