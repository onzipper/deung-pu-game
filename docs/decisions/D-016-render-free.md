# D-016 — Test deploy: Render free tier
- Date: 2026-07-12 · Status: Locked (ชั่วคราว) · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **Test deploy: Render free tier + UptimeRobot ping ไปก่อน** (`https://deung-pu-game.onrender.com`, service ผูก branch `develop`) — เบี่ยงจาก spec ชั่วคราว (tech กำหนด paid always-on): UptimeRobot กันหลับจาก idle ได้ แต่ free tier ยัง restart ได้เป็นระยะ = ห้อง/ตำแหน่งหาย (state in-memory, ยังไม่มี persistence) ยอมรับได้สำหรับช่วงทดสอบ · **ต้องกลับมา paid always-on ก่อนเปิดให้คนเล่นจริง** · client = Hostinger ตาม spec (`NEXT_PUBLIC_RT_URL=wss://deung-pu-game.onrender.com`)

สถานะ: Locked (ชั่วคราว)

เหตุผล: owner เคาะ 2026-07-12 — ประหยัดค่าใช้จ่ายช่วง test deploy
