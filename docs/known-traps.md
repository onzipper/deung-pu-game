# Known traps

บั๊ก class ที่เคยเสียเวลา debug จริง — อ่านก่อนแตะโค้ด · เติมทันทีเมื่อเจอบั๊กใหม่ (ใน commit เดียวกับ fix)

## Next.js 16 ไม่เหมือนที่โมเดลจำได้

- อาการ: เขียนโค้ดตาม convention Next.js เก่า แล้ว API/โครงสร้างไม่ตรง
- สาเหตุ: Next.js 16 มี breaking changes จาก training data
- วิธีเลี่ยง: อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด framework ทุกครั้ง (ดู AGENTS.md)

## Spec drift ระหว่าง design กับ tech

- อาการ: field/ค่าใน code ไม่ตรง spec เพราะ "จำได้ว่าประมาณนี้"
- สาเหตุ: spec ยาว อ่านไม่ครบ § แล้วเดา
- วิธีเลี่ยง: เปิด § ที่ feature-map ชี้ทุกครั้งก่อน implement — field names ต้อง copy จาก v14 §50.1 ตรง ๆ ห้ามพิมพ์จากความจำ

<!-- เพิ่มกับดักใหม่ด้านล่างเมื่อเจอจริง -->
