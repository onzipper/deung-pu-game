# Context: engine (game engine / PixiJS / iso / combat)

สำหรับงานชนิด: iso foundation, game loop, rendering, combat mechanics, spawn
อ่าน pack นี้ + ไฟล์ที่แตะ พอ — รายละเอียดเต็มอยู่ใน spec § ที่อ้าง

## Contract

- `src/engine/**` = foundation layer: **ห้าม import React / Next.js** — plain TS + PixiJS เท่านั้น
- `src/game/**` = game logic บน engine (combat, entity, spawn) — ใช้ engine ผ่าน public API
- UI คุยกับ game ผ่าน Zustand bridge เท่านั้น (tech §2) — world state **ห้าม**อยู่ใน React state
- Client = juice เท่านั้น; truth (damage/drop/RNG) เป็นของ server เมื่อถึง P1+ (tech §1) — P0 local คำนวณ local ได้แต่โครงต้องแยก calc ออกจาก render ไว้

## Locked engine decisions (ห้ามเถียง — tech §17, GS §57)

- **True 2D Isometric Pixel Art · diamond grid ~64×32 · fixed camera · no rotation**
- Coordinate 2 ระบบ: world/logical grid (logic/collision/pathfinding) ↔ screen (iso projection) — converter คือหัวใจ foundation
- Depth sort ตามตำแหน่ง iso — sort เฉพาะ dirty entity ต่อ frame
- Direction: **5 ทิศวาดจริง (S/SW/W/NW/N) + mirror (SE/E/NE)** + 8-dir override ได้ (data-driven)
- Object pooling ทุกอย่างที่เกิด-ตายถี่ (mob, damage number, particle, loot) — ห้าม `new` ใน hot loop
- Damage number = `BitmapText` + pool (tech §11)

## Performance budget (นิยาม success ของ P0 — tech §11)

- Desktop กลาง: 60fps @ 40 mobs + 300 damage numbers/วิ + 3 AoE ต่อกัน
- มือถือกลาง: 30fps @ 30 mobs, quality Low
- Effect Quality: Low/Med/High/Cinematic map เป็นตัวเลขจริง (max particles, shake, resolution scale)

## กติกาเฉพาะ / invariants

- ค่า balance ทุกตัว = Design Knob (GS §48) → อ่านจาก config, ห้าม hardcode
- Skill fields ตาม GS §50.1 เป๊ะ (`baseMultiplier`, `cooldown`, `maxTargets`, ...) — ห้าม rename
- Boss telegraph ต้องชัดเสมอ ไม่แปรตาม quality setting (GS §18.5, tech §16.5)
- Damage formula: multiplicative diminishing (tech §15.2) — สูตรอยู่ฝั่ง calc ไม่ ship ลง client bundle เมื่อถึง P1

## Test

- คำสั่ง: `npm test`
- combat formula / RNG / pooling ต้องมี unit test (Vitest)
