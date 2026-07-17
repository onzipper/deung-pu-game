# e2e proof harness (P2-00)

Permanent e2e smoke test สำหรับ realtime loop (join → move → attack) — local หรือ production ด้วยคำสั่งเดียว.

- **Local**: เปิด server ก่อน `npm run dev:server` แล้วรัน `node scripts/e2e/smoke.mjs` (คนละ terminal)
- **Production**: `E2E_RT_URL=wss://deung-pu-game.onrender.com node scripts/e2e/smoke.mjs`
- ผล: print แต่ละ assertion ทันที (`PASS`/`FAIL`) + สรุปท้าย run — exit code ≠ 0 ถ้ามี fail (ต่อ CI ได้)
- ข้อควรระวัง: Render free tier อาจ **cold start** (ห้องแรกตื่นช้า) — script retry การ join ให้เองครั้งเดียว (delay 5s) ก่อนรายงาน fail
- `lib.mjs` = helper กลาง (connect/waitFor/report) · `smoke.mjs` = scenario จริง — ค่าคงที่ (protocol/config/map) เป็น mirror จาก `src/shared/net-protocol.ts` + `src/engine/config.ts` + `src/engine/map/p0-test-field.ts` (คอมเมนต์อ้างที่มาไว้ในไฟล์ — ถ้าค่าต้นทางเปลี่ยน ต้องอัปเดตที่นี่ด้วย)

## bot-smoke.mjs — full bot lifecycle (requires DB)

`node scripts/e2e/bot-smoke.mjs` — standalone (ไม่ผ่าน `npm run e2e`), พิสูจน์วงจรบอทครบวงกับ server + DB จริง
(join map1 → `bot:profileCreate` → `bot:start` → farm loop → proactive potion_low trigger → town trip →
`bot:stop` → `bot:profileDelete`). ต้องมี `DATABASE_URL` + `JWT_SECRET` ใน `.env` (สคริปต์โหลดเอง — plain parse,
ไม่มี `dotenv` dependency) เพราะบอทต้องมี DB-backed account+character จริง (guest join ใช้บอทไม่ได้ —
`server/bot/manager.ts` reject `requires_db`/`no_character`) — สคริปต์สร้าง Account+Character ผ่าน
`@prisma/client` ตรง ๆ (mirror `prisma/schema.prisma`) แล้วเซ็น realtime JWT เองด้วย `JWT_SECRET` เดียวกับ
server (mirror `src/server/auth/signed-token.ts`) — **ไม่แก้โค้ด server** ทุก path ที่ใช้เป็น path ที่ server
รองรับอยู่แล้ว. ⚠️ DB dev=prod (D-057, current-state.md) — ทุกแถวที่สร้างถูกลบใน `finally` (best-effort, ดู
`cleanupDb()`) แม้ scenario fail กลางทาง.
