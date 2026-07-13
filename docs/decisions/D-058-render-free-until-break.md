# D-058 — Render คง free tier + UptimeRobot จนกว่าจะพังจริง
- Date: 2026-07-13 · Status: Locked (supersedes D-016 temp, D-031 hard trigger) · Source: owner แชท 2026-07-13

## มติ + เหตุผล (verbatim)

Decision: **Render ขอเป็น free tier + UptimeRobot ไปก่อน "ให้มันพังไปเลยค่อยว่ากัน"** — ยกเลิกเงื่อนไข hard trigger (Bible 5.1) ที่บังคับขึ้น paid always-on ช้าสุดตอน P2-16

เหตุผล: ข้อจำกัดงบประมาณ — owner เคาะในแชท 2026-07-13

## ข้อจำกัดที่ยอมรับ (จดไว้ ไม่ต้อง escalate ซ้ำ)

- free tier restart เป็นระยะ → ห้อง/ตำแหน่ง in-memory หาย
- cold start หลัง idle → realtime token (อายุ 60s) หมดอายุระหว่างปลุก = `bad_token` ชั่วคราว กดใหม่แล้วติด (พิสูจน์จริง 2026-07-13)
- ทบทวนใหม่เมื่อ "พังจริง" (ผู้เล่นจริงเดือดร้อน) — ตอนนั้นค่อยเสนอ paid อีกครั้ง

Related: [[D-016]] [[D-031]] [[D-057]]
