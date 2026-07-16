# D-067 — Bot Mode = Character Autonomy ของตัวละครจริง
- Date: 2026-07-15 · Status: Locked · Source: owner แชท 2026-07-15

## มติ

- **Bot Mode / Character Autonomy** คือการให้ระบบควบคุมตัวละครจริงของผู้เล่นชั่วคราวตามแผน เงื่อนไข และข้อจำกัดที่ผู้เล่นกำหนด — ใช้ตัวละครจริงเพียงตัวเดียว **ไม่มี clone, bot avatar, worker entity หรือ offline reward simulation**
- ตัวละครใช้ equipment, skill, HP, inventory, position, progression และ world/channel จริง ผู้เล่นอื่นเห็นตัวละครจริงพร้อมสถานะ automation แบบไม่รบกวน ตัวละครถูกโจมตี ตาย ได้ EXP/loot และเสียทรัพยากรตามกติกาปกติ
- ลำดับ authority คือ **Manual → Assisted → Character Autonomy**; **Report เป็นผลลัพธ์ ไม่ใช่ mode**. Auto Pilot ตาม D-037 ยังเป็น confirmed auto-walk แยกจาก Bot tier
- เมื่อเจ้าของปิด client server ควบคุม actor เดิมต่อได้ เมื่อกลับมาต้อง attach ไป state/position ล่าสุดของ actor เดิม
- manual movement หรือ manual skill input คืน authority ให้ผู้เล่นทันทีโดยไม่ต้องเปิดเมนู: automation หยุดออกคำสั่ง บันทึก checkpoint และกัน input race ก่อนรับ manual intent
- ทุก tier ใช้ combat/reward ceiling เดียวกัน: damage, attack-speed rules, EXP rate, drop rate, loot luck และ combat efficiency ceiling เท่ากัน ไม่มี paid power หรือ paid reward multiplier; manual expert ทำได้ดีกว่า automation
- **continuity คือ paid value หลัก**; tier แตกต่างด้วย continuity, recovery และ workflow complexity. จำนวน profile/rule เป็น technical cap เท่านั้น ไม่ใช่คุณค่าหลักใน UX/marketing
- **Free:** ทำงานพื้นฐานในพื้นที่เดียวจนพบอุปสรรคทั่วไป; inventory/resource/death/stuck หลัง basic recovery/server restart → หยุด; มี report ล่าสุด
- **Plus:** แก้ปัญหาประจำตาม rule/resources แล้วทำต่อ เช่น potion/rest, sell/deposit/lock, repair/refill, **revive แล้ว return area หลังตาย**, change target, same-map fallback, schedule/notification/history; ทำต่อได้เมื่อแผนและทรัพยากรอนุญาต แต่ server restart → หยุดอย่างปลอดภัย
- **Pro:** สืบทอด death recovery ของ Plus และทำ workflow หลายขั้น, branching/fallback, เปลี่ยน pocket/map/target, checkpoint, multiple schedules และ safe resume หลัง server restart เมื่อ validation ผ่าน
- ห้าม automation เข้า boss, elite, event, secret หรือพื้นที่ที่ไม่อนุญาต ต้องนับ channel capacity และ bot population ต่อ farming pocket
- ordinary rare drop เป็น plan policy: เก็บและทำต่อ, แจ้งเตือน, lock, ฝาก หรือหยุดได้; legendary/unique/item สำคัญมากอาจเป็น global safe-stop ตาม canonical item policy
- CAPTCHA, account conflict, invalid state, unsafe map และ economic inconsistency เป็น global stop ทุก tier
- Player-facing copy ใช้ภาษาของตัวละคร/แผน เช่น “เริ่มแผนงานอัตโนมัติ”, “มอบการควบคุม”, “หยุดแผน”, “รับช่วงต่อ”, “แผนงาน/แผนฟาร์ม”; `Bot session` และ identifier เดิมคงเป็น internal term ชั่วคราวได้

## ผลต่อเอกสารเดิม

- **SUPERSEDES บางส่วนของ D-063:** “Mandatory Stop 9 ข้อเหมือนกันทุก tier” และการวาง profile/rule counts เป็นคุณค่าหลัก; D-063 เรื่อง Free 24/7, duration pass, ราคา, expiry/fallback และ merchant economy ยัง Locked
- **SUPERSEDES** checkpoint §4/§19 ที่รวม Bot + Auto Pilot + Report เป็น mode/package เดียว, runtime worker/coarse simulation และข้อความที่อนุญาต event/boss/risk automation
- **SUPERSEDES** P2B §6.3–§6.5 และ P3 Bot UI sections ที่ใช้ cap-first tier framing, disconnect/ordinary rare/death/inventory เป็น universal mandatory stop
- D-035/D-037/D-056 ยัง Locked ในส่วนที่ไม่ขัด: ดึ๋งๆ ไม่ใช่ Bot, Auto Pilot แยกจาก Bot และ background tab ไม่เท่ากับ automation
