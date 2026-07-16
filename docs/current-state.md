# Current state — ตอนนี้เท่านั้น

_2026-07-16 · อัพเดตเมื่อสถานะเปลี่ยนจริง_

- **Live:** server `https://deung-pu-game.onrender.com` (Render free + UptimeRobot `/healthz`) · client `https://deung-pu.softrock.space/game` (Hostinger) · DB Hostinger MariaDB — **migrations applied ครบ 0001–0005** (0005 apply 2026-07-17)
- **Phase:** OB push — **bot track จบแล้ว (2026-07-16): PR6a/6b/6c/7/8/9/10 merge เข้า develop ครบ** (durable checkpoint+resume · Pro goal chain+cross-map · Free walk-to-town D-071 · Bot UX P3 · follower ถอด · Help search · ดึ๋งๆ contextual) · เทส 2215 ผ่าน · push develop+main แล้ว · DB ครบ · **ถัดไป: production smoke test เต็มรอบ** · งานแทรก: จอกระตุก / starter loadout / E2E
- **Art track: ⏸ พัก (owner สั่ง 2026-07-16 หลัง v8 ตีกลับ)** · เกมใช้ chr_crimson_knight v3 · v6-v8 ตีกลับด้วย defect โครงสร้างเดิม (ตัวเกินช่อง+เฟรมเกิน — ChatGPT แก้ไม่ได้สักรอบ) · ของพร้อมกลับมาต่อ: contract `scripts/art/templates/` + JSON engine-schema 576×1440 รอในตัว template · ตัวเลือกถัดไปที่เคาะคร่าวๆ: PixelLab.ai (ลอง free ก่อน)
- **ค้างกับ owner:** production smoke test เต็มรอบ (deploy-checklist §3) · L2 final-art order
- **ห้ามแตะ:** `docs/design/**` + `docs/tech/**` (spec อ้างอิง) · canonical IDs ล็อคแล้วเพราะมี save data
- Run local: T1 `npm run dev:server` · T2 `npm run dev` (ไม่มี server → `/game` เล่น solo offline) · Deploy: `docs/deploy-checklist.md`
