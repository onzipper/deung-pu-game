# Current state — ตอนนี้เท่านั้น

_2026-07-16 · อัพเดตเมื่อสถานะเปลี่ยนจริง_

- **Live:** server `https://deung-pu-game.onrender.com` (Render free + UptimeRobot `/healthz`) · client `https://deung-pu.softrock.space/game` (Hostinger) · DB Hostinger MariaDB (0001-0002 applied · 0003/0004_bot ยังไม่ apply)
- **Phase:** P2 wave 3 code-complete · OB push — คิวงาน: PR6 (Pro workflows/restart resume) → PR7 (Bot UX) → PR8-10 · งานแทรก: จอกระตุก / starter loadout / E2E
- **Art track:** เกมใช้ chr_crimson_knight v3 · intake ผ่าน `/sprite-intake` (contract: `scripts/art/templates/`) · owner ผลิต sheet ด้วย ChatGPT — v6 ตีกลับ รอรอบใหม่
- **ค้างกับ owner:** production smoke test เต็มรอบ (deploy-checklist §3) · L2 final-art order
- **ห้ามแตะ:** `docs/design/**` + `docs/tech/**` (spec อ้างอิง) · canonical IDs ล็อคแล้วเพราะมี save data
- Run local: T1 `npm run dev:server` · T2 `npm run dev` (ไม่มี server → `/game` เล่น solo offline) · Deploy: `docs/deploy-checklist.md`
