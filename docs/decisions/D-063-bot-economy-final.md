# D-063 — Bot & economy final (ปิด L1 ทั้งชุด + พ่อค้าพเนจร dual-sink)
- Date: 2026-07-13 · Status: Locked · Source: owner แชท 2026-07-13 (เคาะรายข้อ) · supersedes [[D-060]]

> **SUPERSEDED บางส่วนโดย D-067 (2026-07-15):** universal Mandatory Stop 9 ข้อและ cap-first tier value ถูกแทนด้วย global safety stops + tier recovery/workflow; Free 24/7, duration pass/pricing, expiry/fallback และ merchant economy ยัง Locked

## Bot model (ทับ game spec §4 ชั่วโมง/ราคา + P2B §6.3 hoursPerDay + §6.6 monthly + canonical #11)

- **Free tier = ฟรีตลอดไป ไม่จำกัดชั่วโมง ปล่อย 24/7 ได้** — ทุก tier เวลาเท่ากัน ความต่าง = ความสามารถ (§6.3: profiles 1/3/10 · rules 3/10/25 · report 1/14/90 วัน · แจ้งเตือน · ตั้งเวลา 0/2/10 · analytics)
- **Paid = duration pass 1/10/30 วัน** นับอายุจริงจากวันซื้อ ไม่มี pause — **ราคา (canon ตัวเดียว): Plus 9/39/79฿ · Pro 15/69/149฿** · Supporter (cosmetic รายเดือน) พักไว้ ตัดสินหลัง beta
- Mandatory Stop 9 ข้อ (P2B §6.5 รวม captcha) ใช้เต็มชุด**ทุก tier** ปิดไม่ได้ · แกนขาย = ความสะดวก (ตั้งเวลา+แจ้งเตือนเป็นหน้าชูโรง) ห้ามแตะ power (§6.1/§8.3)

## Bot UI tier rules (L7 + addendum เคาะครบ)

pass หมดอายุ → fallback ลง Free อัตโนมัติ แผน/กฎส่วนเกินถูก "พัก" read-only ไม่ลบ · ซื้อข้าม tier = ทับทันทีพร้อมเตือนวันที่เหลือ · ต่ออายุ tier เดิม = บวกวันต่อท้าย ไม่มี cap · ฟีเจอร์ paid โชว์ locked ให้ Free เห็น · ป้ายหมดอายุ = วันที่เต็ม + นับถอยหลังเมื่อเหลือ <24 ชม. · market panel กว้างพิเศษได้ · กราฟราคา 14 วัน · เตือน "ยกเลิกไม่คืนค่าลงประกาศ" ก่อนยืนยัน

## พ่อค้าพเนจร = dual-sink (ต่อยอด game §11 sink #5 + LW Bible §6.2/§15)

- **M1 รับซื้อของล้นตลาด → ทำลายจริง** (ไม่ recycle) ราคารับซื้อ ~50% ของ NPC vendor floor (Design Knob) + **M2 ของแรร์ cosmetic เผา gold 100%** (soulbound) → เข้า **P2B** · M3 (แลก N→1) / M4 (โควตารับซื้อ declining) → P4 คู่ market
- เพดาน gold ที่พ่อค้าจ่าย/รอบ ผูก guardrail `maxEventGoldPerHourVsNormalFarm 0.25` (LW §15) · trigger จาก Item-flood/Gold-inflation alert (§11 Backoffice) ได้นอกรอบปฏิทิน

**Why:** เกมเล็ก ราคาเข้าถึงง่าย + "ฟรีก็ได้อยู่ แต่จ่ายแล้วสะดวกกว่ามาก" · Free 24/7 เพิ่มแรงกดเงินเฟ้อ → sink พ่อค้าพเนจรรับ — Related: [[D-040]] [[D-061]] [[D-064]]
