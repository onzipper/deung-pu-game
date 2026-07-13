# Art Reference — ภาพอ้างอิงจาก owner (2026-07-11)

> **Visual north star ของโปรเจกต์** — เวลา implement UI/ฉาก/effect ให้เทียบกับภาพชุดนี้เพื่อไม่หลุดทางที่ owner ต้องการ
> ค่าตัวเลขในภาพ (ดาเมจ, ราคา, stat) เป็นภาพประกอบ ไม่ใช่ spec — spec ตัวเลขยึด game spec v15

## ⭐ กลุ่ม A: Canonical style + layout (01–03) — pixel art ตรง locked decision

ภาพชุดนี้คือ **ทั้ง style และ layout target** — ตรง L14/GS §57.1 (True 2D Isometric Pixel Art)

| ไฟล์ | คืออะไร | ใช้เทียบกับ spec |
|---|---|---|
| `01-game-overview-sheet.png` | ภาพรวมเกมทั้งหมด: HUD, inventory, ตีบวก, HoF, skill effects frame-by-frame, world preview, bot UI, **character sprite 6 action** | GS §45–§47, §17 |
| `02-map1-design-sheet.png` | Map 1 ขอบเมืองมนุษย์: layout, minimap, มอนสเตอร์+ดรอป (เมือกดึ๋ง/ขนนกปุ๊/หมูป่า/หมูป่าหม้อเดือด), เควสเริ่มต้น, environment, sprite actions | Map Layout Bible — Map 1, GS §6 |
| `03-main-city-sheet.png` | เมืองหลักนครอรุณผนึก: ผังเมือง, ฟังก์ชัน 8 โซน, NPC 9 ตัว, โซนสำคัญ | GS §3.3, Map Layout Bible |

## ⚠️ กลุ่ม B: Layout/UX reference เท่านั้น (04–11) — **สไตล์ภาพไม่ใช่ target**

> **คำเตือน (owner แจ้ง 2026-07-11):** ภาพ 04–11 เป็นสไตล์ painterly/HD **ไม่ใช่ pixel art** — ขัดกับ locked decision L14
> ใช้ได้เฉพาะ: โครงหน้าจอ, ตำแหน่งองค์ประกอบ, flow, ข้อมูลที่แต่ละหน้าจอต้องแสดง
> **ห้ามใช้เป็น style target เด็ดขาด** — style จริงยึดกลุ่ม A (pixel art) · owner อาจ gen ชุดใหม่เป็น pixel art มาแทนภายหลัง

| ไฟล์ | Layout ของ | ใช้เทียบกับ spec |
|---|---|---|
| `04-combat-hud-ingame.png` | หน้าจอต่อสู้: HUD, quest tracker, damage numbers, chat, minimap, ปุ่มออโต้/บอท | GS §47.1 |
| `05-inventory-equipment.png` | กระเป๋า + อุปกรณ์: item grid, rarity border, tooltip, stat รวม | GS §47.2, §46.3 |
| `06-market.png` | ตลาดกลาง: listing, filter, กราฟราคา 14 วัน, ประวัติซื้อขาย, ผู้ช่วยตลาด | GS §5, §47.3 |
| `07-enhancement-forge.png` | ตีบวก/เสริมพลัง: วัตถุดิบ, โอกาสสำเร็จ, ผลลัพธ์ -1, ช่องแกร่ง | GS §12, §47.4 |
| `08-hall-of-fame.png` | หอเกียรติยศนักล่า: podium top 3, หมวดจัดอันดับ, ประกาศ, รางวัลรายสัปดาห์ | GS §13, §47.5 |
| `09-bot-auto-pilot.png` | ผู้ช่วยนักล่า: ลำดับงานอัตโนมัติ 6 ขั้น, เงื่อนไขหยุด, โหมด PRO | GS §4, §47.6 |
| `10-daily-report.png` | รายงานประจำวัน: การ์ดบอท/ตลาด/ความก้าวหน้า/คำแนะนำ | GS §47.7 |
| `11-secret-clue.png` | UI เบาะแสลับ: กระดาษ parchment, ผนึกม่วง, ตัวนับเบาะแส | GS §10, §47.8 |

**GS** = game spec v15 (`docs/design/deungpu_project_checkpoint_v15_p0_scope_lock_ready.md`)

## จุดที่ engine/ui ต้อง match (จากกลุ่ม A)

- โทนสี: Deep Ink + Bronze Gold border + ม่วงผนึก (Rift Violet) ตรง GS §46.1
- ตัวละคร chibi proportion pixel art, effect สีม่วงเป็นเอกลักษณ์ตัวเอก
- Damage number: ปกติขาว, critical ส้ม/ทองใหญ่+คำว่า "Critical!", EXP เขียว
- Sprite actions ขั้นต่ำ: idle / walk / attack / skill / hit / dead (+jump, crit)
- HUD: มุมซ้ายบน status, ขวาบนแถบเมนูไอคอน, ล่าง skill bar 1–6 + potion + AUTO
