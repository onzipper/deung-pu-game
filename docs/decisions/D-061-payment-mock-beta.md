# D-061 — Payment เป็น mock ยาวถึง Open Beta (ปิดคำถาม L4)
- Date: 2026-07-13 · Status: Locked · Source: owner แชท 2026-07-13

## มติ + เหตุผล (verbatim)

Decision: **payment "mock ไปก่อน ยังไม่อยาก invest ส่วนนี้"** — ให้กลุ่มเป้าหมายเข้ามาเล่นก่อนในช่วง Open Beta โดยไม่มีการจ่ายเงินจริง · การเลือก payment gateway เลื่อนจาก "ตัดสิน P4" (D-040 §9) ออกไปจนกว่า owner สั่งเปิดรับเงินจริง

ผลต่อ tech: `PAYMENT_MOCK=true` ต่อไป · abstraction ตาม D-040 §9.2 (`createPayment/verifyWebhook/capture/refund/queryStatus`) ยังสร้างรอไว้ได้โดยไม่ผูก vendor · ฟีเจอร์ที่ต้องจ่ายเงิน (bot pass ฯลฯ) ช่วง beta = แจก/ทดลองผ่าน mock

Related: [[D-040]] [[D-060]]
