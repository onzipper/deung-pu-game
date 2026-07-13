# D-062 — Email ระบบใช้ SMTP ของ Hostinger ที่มีอยู่แล้ว
- Date: 2026-07-13 · Status: Locked · Source: owner แชท 2026-07-13

## มติ + เหตุผล (verbatim)

Decision: owner: **"SMTP มีอยู่แล้ว อันนี้ให้ tech team ตัดสินใจได้เลย หากต้องการอะไรแจ้ง"** → tech เลือก: ใช้ SMTP ที่มากับ Hostinger (สร้าง mailbox `no-reply@softrock.space`) + nodemailer ฝั่ง Next server — งบ 0

ใช้กับ: verify email link (อายุ 24 ชม., resend cooldown 60 วิ, จำกัด 5 ครั้ง/ชม. ตาม D-040) + password reset — บังคับ verify ก่อน closed alpha ภายนอก

Fallback ถ้าเจอ rate limit ของ Hostinger: ย้ายไป free tier ของ Brevo/Resend (แจ้ง owner ก่อน)

สิ่งที่ต้องขอจาก owner ตอน implement (P2B/ก่อน alpha): รหัส mailbox ที่สร้างใน hPanel ใส่ env `SMTP_HOST/SMTP_USER/SMTP_PASS`

Related: [[D-040]] [[D-044]]
