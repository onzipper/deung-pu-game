# Current state — ตอนนี้เท่านั้น

_2026-07-17 · อัพเดตเมื่อสถานะเปลี่ยนจริง_

- **Live:** server `https://deung-pu-game.onrender.com` (Render free + UptimeRobot `/healthz`) · client `https://deung-pu.softrock.space/game` (Hostinger) · DB Hostinger MariaDB — **migrations applied ครบ 0001–0005** (0005 apply 2026-07-17)
- **Phase:** OB push — **bot redesign D-073 merge เข้า develop+main แล้ว (owner สั่ง 2026-07-17)** — bot runtime 3 tier (Free auto-potion+เดินเข้าเมือง multi-hop D-073, Plus SELECTED_TYPES+single goal+completion action, Pro workflow เดิม) · Bot Hub เป็น workspace panel CTA เดียว "เริ่มบอท"/"หยุดบอท" · HUD ใหม่ทั้งชุด (HudRoot 7 slot/UtilityDock/BotStatusChip) แทนปุ่ม fixed กระจายเดิม · แก้จอกระตุกตอนบอทเดิน (self-authority.ts) · verified: เทส 2440 + e2e 8/8 + `scripts/e2e/bot-smoke.mjs` 13/13 กับ server+DB จริง · **ถัดไป: production smoke test เต็มรอบ** (Render/Hostinger rebuild จาก main) · งานแทรก: starter loadout / E2E · follow-up ต้องขออนุมัติ: migration `bot_sessions.statsJson` (stats รายงานย้อนหลัง)
- **Art track: ⏸ พัก (owner สั่ง 2026-07-16 หลัง v8 ตีกลับ)** · เกมใช้ chr_crimson_knight v3 · v6-v8 ตีกลับด้วย defect โครงสร้างเดิม (ตัวเกินช่อง+เฟรมเกิน — ChatGPT แก้ไม่ได้สักรอบ) · ของพร้อมกลับมาต่อ: contract `scripts/art/templates/` + JSON engine-schema 576×1440 รอในตัว template · ตัวเลือกถัดไปที่เคาะคร่าวๆ: PixelLab.ai (ลอง free ก่อน)
- **ค้างกับ owner:** production smoke test เต็มรอบ (deploy-checklist §3) · L2 final-art order
- **ห้ามแตะ:** `docs/design/**` + `docs/tech/**` (spec อ้างอิง) · canonical IDs ล็อคแล้วเพราะมี save data
- Run local: T1 `npm run dev:server` · T2 `npm run dev` (ไม่มี server → `/game` เล่น solo offline) · Deploy: `docs/deploy-checklist.md`
