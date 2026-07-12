# e2e proof harness (P2-00)

Permanent e2e smoke test สำหรับ realtime loop (join → move → attack) — local หรือ production ด้วยคำสั่งเดียว.

- **Local**: เปิด server ก่อน `npm run dev:server` แล้วรัน `node scripts/e2e/smoke.mjs` (คนละ terminal)
- **Production**: `E2E_RT_URL=wss://deung-pu-game.onrender.com node scripts/e2e/smoke.mjs`
- ผล: print แต่ละ assertion ทันที (`PASS`/`FAIL`) + สรุปท้าย run — exit code ≠ 0 ถ้ามี fail (ต่อ CI ได้)
- ข้อควรระวัง: Render free tier อาจ **cold start** (ห้องแรกตื่นช้า) — script retry การ join ให้เองครั้งเดียว (delay 5s) ก่อนรายงาน fail
- `lib.mjs` = helper กลาง (connect/waitFor/report) · `smoke.mjs` = scenario จริง — ค่าคงที่ (protocol/config/map) เป็น mirror จาก `src/shared/net-protocol.ts` + `src/engine/config.ts` + `src/engine/map/p0-test-field.ts` (คอมเมนต์อ้างที่มาไว้ในไฟล์ — ถ้าค่าต้นทางเปลี่ยน ต้องอัปเดตที่นี่ด้วย)
