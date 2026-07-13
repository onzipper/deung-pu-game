# D-059 — DB backup เลื่อนไปคุยหลัง Open Beta
- Date: 2026-07-13 · Status: Locked · Source: owner แชท 2026-07-13

## มติ + เหตุผล (verbatim)

Decision: **backup DB "หลัง Open Beta ไปก่อนค่อยเอามาคุย"** — ยังไม่ตั้ง backup schedule ตาม baseline D-040 (daily/14d/8wk) ในตอนนี้

เหตุผล: ข้อจำกัดงบ/ลำดับความสำคัญ — ช่วงก่อน Open Beta ข้อมูลใน DB ยังเป็นข้อมูลทดสอบที่ยอมเสียได้

ความเสี่ยงที่รับไว้: DB เดียว = prod ([[D-057]]) — ถ้าพังก่อน Open Beta ข้อมูลหายทั้งหมด (ยอมรับแล้ว)

Related: [[D-057]] [[D-040]]
