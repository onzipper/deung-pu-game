# Deploy checklist — ทดสอบ deploy ครั้งแรก

> อ้างอิง: `docs/tech/deungpu_technical_architecture_v1_5_p0_scope_lock.md` (L4/L6/L7 · §Deploy: web/game server) — server = Render Singapore paid always-on, client = Hostinger Node.js standalone build. ไม่มีขั้นตอนอื่นนอกจากที่เขียนไว้ที่นี่ (ห้ามเดาเพิ่ม)

## 1) Render — realtime server (`colyseus-rt`)

1. Render dashboard → **New → Web Service**
2. เชื่อม repo `onzipper/deung-pu-game`, branch **`develop`**
3. Region: **Singapore**
4. Instance type: **paid (Starter หรือสูงกว่า) — ต้อง always-on** (free tier spin down หลัง idle ~15 นาที = server หลับ/state หาย ตาม spec L4)
   - **สถานะจริง 2026-07-12 (decision-index)**: ช่วงทดสอบ owner ใช้ **free tier + UptimeRobot ping** ไปก่อน (`https://deung-pu-game.onrender.com`) — ตั้ง UptimeRobot monitor ชี้ที่ **`https://deung-pu-game.onrender.com/healthz`** (ตอบ 200 "ok"; path อื่นตอบ 404, root ไม่ใช่ endpoint) · ข้อจำกัด: free tier ยัง restart เป็นระยะ = ห้อง/ตำแหน่งหาย (state in-memory) · **ก่อนเปิดผู้เล่นจริงต้องกลับมา paid always-on**
5. Build command: `npm install`
6. Start command: `npm run start:server`
7. Environment variables:
   - `PORT` — **ไม่ต้องตั้ง** Render inject ให้เอง (ดู `.env.example`)
   - **⛔ ถ้าต้องการให้ progression (level/exp) ผู้เล่นคงอยู่ ต้องตั้งบน Render service นี้:**
     - `DATABASE_URL` — ชี้ Hostinger MariaDB (durable store; ตั้ง DB ให้รับ connection จาก Render egress IP + เปิด TLS)
     - `JWT_SECRET` — **ต้องตรงกับ `JWT_SECRET` ฝั่ง Next/web** (ไม่ตรง = handshake token verify ไม่ผ่าน → account/character identity ไม่ผูก → carrier key = null → fallback lv1)
     - `NODE_ENV=production` — บังคับ realtime token เสมอ (ผูก accountId/characterId ที่ verify แล้วเข้า session)
   - **⚠️ ถ้าไม่ตั้ง 3 ตัวนี้:** character save/load จะ **no-op เงียบ ๆ (dev mode)** — server ยัง join ได้ปกติ แต่ไม่มี persistence → **level รีเซ็ตเป็น 1 ทุกครั้งที่ refresh** (carrier ใน-process ช่วยได้แค่ตอนข้าม map ใน process เดียว ไม่รอด server restart). นี่คือสาเหตุรากที่ level เด้งกลับ 1 บน live.
8. Deploy → ได้ URL รูปแบบ `https://<app>.onrender.com`
9. ws endpoint สำหรับ client = `wss://<app>.onrender.com` (https → wss)

## 2) Hostinger — web client (Next.js)

1. Hostinger hPanel → Node.js hosting (datacenter Jakarta ตาม spec L6, จับคู่ Render Singapore)
2. Node version ≥ 20 (ตรง `engines.node` ใน `package.json`)
3. ตั้ง environment variable **ตอน build** (ไม่ใช่ตอน runtime — `NEXT_PUBLIC_*` ถูก bundle เข้า client ตอน build เท่านั้น):
   - `NEXT_PUBLIC_RT_URL=wss://<app>.onrender.com` (URL จาก Render ขั้นตอนก่อนหน้า)
4. รัน `npm install && npm run build` (build ผลิต `.next/standalone/` ตาม `output: "standalone"` ใน `next.config.ts`)
5. เตรียมโฟลเดอร์รันจริงจาก standalone output (Next.js standalone convention ไม่รวม static assets อัตโนมัติ ต้อง copy เอง):
   - copy `.next/static` → `.next/standalone/.next/static`
   - copy `public/` → `.next/standalone/public`
6. Start command: `node .next/standalone/server.js`
7. ตั้ง `PORT` ตามที่ Hostinger กำหนดให้ (Hostinger inject/expect ค่าตามแพลตฟอร์ม — ตรวจใน hPanel ว่าใช้ชื่อ env ตัวไหน)

## 3) Smoke test หลัง deploy

1. เปิด `https://<hostinger-domain>/game` **2 เครื่อง/2 แท็บ**
2. กด **F3** เปิด debug overlay — เช็คสถานะ net ต้องเป็น **online** (ถ้าเป็น offline = ต่อ server ไม่ติด → กลับไปเช็ค `NEXT_PUBLIC_RT_URL` ว่าตั้งถูก `wss://` และตั้ง**ตอน build** จริง ไม่ใช่ตอน runtime)
3. เดินสองแท็บ → ต้องเห็นผู้เล่นอีกฝั่งขยับ sync กัน
4. ตีมอน (Space หรือแตะมอน) → เห็นเลขดาเมจ/มอนตาย
5. เดินข้าม map exit → เห็น fade transition ไป map ถัดไป

## 4) Known risks (จดไว้ ยังไม่พิสูจน์จริง — ตามที่พบระหว่าง deploy จริงค่อยอัปเดต)

- **Render proxy กับ websocket idle timeout**: ยังไม่เคยพิสูจน์ในการ deploy จริงว่า Render's edge proxy จะตัด connection websocket ที่ idle นานหรือไม่ — ถ้าเจอผู้เล่นหลุดบ่อยผิดปกติ ให้เก็บ log/เวลาที่หลุดมาดู เทียบกับ `reconnect` grace (§59.1)
- **CORS/origin ยังเปิดกว้าง**: server ยังไม่จำกัด origin ที่ต่อเข้ามา — จดเป็น TODO ทำใน P2 (ไม่ใช่ P1 scope)
- **MySQL Hostinger ยังไม่ใช้**: P1 ไม่มี persistence — DB setup (remote MySQL whitelist Render IP + TLS) ค่อยทำตอนขึ้น P2 ตาม tech spec §8/Appendix B
