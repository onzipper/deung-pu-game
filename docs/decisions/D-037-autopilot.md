# D-037 — Companion local-only + Auto Pilot != bot
- Date: 2026-07-12 · Status: Locked · Source row: docs/decision-index.md (2026-07-13 extraction)

> **CONFIRMED โดย D-067/D-068 (2026-07-15):** Auto Pilot ยังเป็น confirmed auto-walk แยกจาก Character Autonomy; ดึ๋งๆ ยัง local-only ใน P2/P2B แต่ไม่เป็น persistent follower

## มติ + เหตุผล (verbatim)

Decision: **ดึ๋งๆ = local-only ใน P2/P2B (D4)**: เห็นเฉพาะของตัวเอง ไม่ sync network ไม่มี server tick — server เก็บแค่ unlock/cosmetic/preference · ให้คนอื่น/party เห็น = future feature แยก + มี setting ปิด · **Auto Pilot ≠ bot (D5)**: auto-walk ไปเป้าหมายที่ผู้เล่นยืนยันเองเท่านั้น — ห้ามโจมตี/สกิล/potion/เก็บของ/quest/ซื้อขาย/ตีบวก/เข้า PvP โดยไม่ confirm/**ทำงานต่อใน background tab** · stop conditions: ผู้เล่นสั่งเดิน/กดหยุด/เข้า combat/โดน damage/path ไม่ได้/เป้าหมายหมดอายุ/ต้องข้าม map-channel/แท็บ background/หลุด connection · ไม่กิน bot tier ไม่ข้ามเส้น "backgrounding ≠ bot"

สถานะ: Locked

เหตุผล: owner เคาะ D4/D5 2026-07-12
