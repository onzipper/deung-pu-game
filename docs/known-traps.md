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

<!-- เพิ่มกับดักใหม่ด้านล่างเมื่อเจอจริง -->
