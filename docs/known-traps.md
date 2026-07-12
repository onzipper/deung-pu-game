# Known traps

บั๊ก class ที่เคยเสียเวลา debug จริง — อ่านก่อนแตะโค้ด · เติมทันทีเมื่อเจอบั๊กใหม่ (ใน commit เดียวกับ fix)

## Next.js 16 ไม่เหมือนที่โมเดลจำได้

- อาการ: เขียนโค้ดตาม convention Next.js เก่า แล้ว API/โครงสร้างไม่ตรง
- สาเหตุ: Next.js 16 มี breaking changes จาก training data
- วิธีเลี่ยง: อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด framework ทุกครั้ง (ดู AGENTS.md)

## Spec drift ระหว่าง design กับ tech

- อาการ: field/ค่าใน code ไม่ตรง spec เพราะ "จำได้ว่าประมาณนี้"
- สาเหตุ: spec ยาว อ่านไม่ครบ § แล้วเดา
- วิธีเลี่ยง: เปิด § ที่ feature-map ชี้ทุกครั้งก่อน implement — field names ต้อง copy จาก v15 §50.1 ตรง ๆ ห้ามพิมพ์จากความจำ

## iso placement: +0.5 ซ้ำซ้อน (sprite เพี้ยนครึ่ง tile)

- อาการ: sprite/entity ลอยต่ำ/เยื้องจาก cursor หรือกล้อง ~ครึ่ง tile (16px @ 64×32); player ไม่อยู่กลางจอ
- สาเหตุ: ผสม `tileCenterToScreen` (บวก +0.5) กับพิกัดที่ "ต่อเนื่อง/เป็น center อยู่แล้ว" (เช่น tile จาก `screenToTile(cursor)`) → บวก +0.5 ซ้ำ; หรือ entity ใช้ center basis แต่ camera/depthKey ใช้ origin basis → คนละ frame, depth sort สลับผิด
- วิธีเลี่ยง: **convention เดียว** — entity/prop API รับ "foot position ต่อเนื่อง" แล้ว render ด้วย `tileToScreen` เท่านั้น (`render/placement.ts` `entityFootToScreen`); centering เป็นหน้าที่ผู้ author (ใส่ n+0.5 ในพิกัด config). ห้ามผสม 2 basis ในเลเยอร์ที่ depth-sort ร่วมกัน — locked ด้วย `tests/engine-render-placement.test.ts`

## vitest พังเฉพาะบาง shell (TypeError reading 'config' ที่ describe)

- อาการ: `npm test` fail ทุกไฟล์ตอน collection ใน shell ของ subagent บางตัว ทั้งที่โค้ดถูก; เครื่อง owner + PowerShell หลักรันผ่าน (node 24.13 + vitest 4.1.10)
- สาเหตุ: ยังไม่ชี้ชัด — env ของ shell ที่ spawn (ไม่ใช่ตัวโค้ด)
- วิธีเลี่ยง: ถ้าเจอ ให้รัน smoke test เปล่า ๆ — ถ้าพังด้วย = ปัญหา env ไม่ใช่โค้ด อย่าเสียเวลา debug โค้ดตัวเอง; ยืนยัน gate จริงที่ PowerShell หลัก

## npm run <script> ล้ม: `'"node"' is not recognized` (env ของ shell ที่ spawn)

- อาการ: `npm test` / `npm run lint` / postinstall (เช่น tsx) พังด้วย `'node' is not recognized as an internal or external command` แม้ `node --version` ใน bash ทำงานปกติ
- สาเหตุ: ตอน npm spawn cmd.exe เพื่อรัน script/bin shim, node ไม่อยู่บน PATH ของ subprocess นั้น (env ของ shell ที่ spawn — ไม่ใช่โค้ด; ตรงกลุ่มเดียวกับ trap vitest ด้านบน)
- วิธีเลี่ยง: รัน tool ตรง ๆ ผ่าน node จาก bash — `node node_modules/vitest/vitest.mjs run`, `node node_modules/eslint/bin/eslint.js`, `node node_modules/next/dist/bin/next build`, หรือ `node_modules/.bin/<bin>`; ติดตั้ง dep ที่มี postinstall ด้วย `npm install ... --ignore-scripts` (เช่น tsx/esbuild — platform binary มากับ optional package อยู่แล้ว). ยืนยัน gate จริงบน PowerShell หลักของ owner

## Colyseus: client (colyseus.js) กับ server (colyseus) คนละเลข version — ต้องจับคู่ schema ให้ตรง

- อาการ: `colyseus` latest = 0.17.x แต่ `colyseus.js` latest = 0.16.22 (depends `@colyseus/schema ^3`); ถ้าจับ server 0.17 (schema 4) กับ client 0.16 (schema 3) เสี่ยง decode พัง (schema major = wire format ต่าง)
- วิธีเลี่ยง (P0-07 ใช้): pin **0.16 line ที่ schema 3 ทั้งสองฝั่ง** — `colyseus@0.16.5` + `@colyseus/schema@^3` (server) + `colyseus.js@0.16.22` (client, schema ^3). ยืนยัน runtime ด้วย 2-client proof ก่อนไปต่อ
- schema decorator (`@type`) = legacy PropertyDecorator → server ต้องมี `experimentalDecorators: true` + `useDefineForClassFields: false` (server/tsconfig.json). **กันชน Next**: `server/` ต้องอยู่ใน `exclude` ของ root tsconfig + `globalIgnores` ของ eslint ไม่งั้น next build/lint สะดุด decorator/node globals

## tsx: รัน script นอก project dir → หา node_modules ไม่เจอ

- อาการ: `Cannot find module 'colyseus.js'` เมื่อรัน proof script ที่วางใน scratchpad (นอก repo)
- วิธีเลี่ยง: วาง integration/proof script ไว้ **ใน project** (เช่น temp file ที่ root แล้วลบ) หรือ set `NODE_PATH` ชี้ node_modules ของ repo — node resolve module จากตำแหน่งไฟล์ขึ้นไป

<!-- เพิ่มกับดักใหม่ด้านล่างเมื่อเจอจริง -->
