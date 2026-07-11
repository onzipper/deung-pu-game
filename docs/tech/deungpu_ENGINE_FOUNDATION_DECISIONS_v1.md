# ดึ๋งปุ๊ — ENGINE_FOUNDATION_DECISIONS.md v1

> สถานะ: **Tech Foundation Lock / ใช้ตอบทีม tech ก่อนเริ่ม engine foundation**  
> Scope: PixiJS 8 + Next.js + Pixel Art 2.5D Web MMORPG  
> จุดประสงค์: ล็อกคำตอบที่กระทบ map / movement / animation / depth sorting / room architecture ตั้งแต่ราก

---

# 1. Camera / Map Projection

## Decision

เลือก:

> **True 2D Isometric Pixel Art**

รายละเอียด:
- พื้นเป็น **diamond grid**
- มุมกล้อง fixed isometric
- ไม่มี camera rotation
- ไม่มีการหมุนฉาก
- เห็นด้านบนและด้านข้างแบบ isometric MMO classic
- ใช้ 2D projection + depth sorting
- ไม่ใช้ top-down square grid

## Why

เหตุผล:
- mockup pixel art ที่ผ่านแล้วไปทาง isometric ชัด
- ได้ identity MMORPG classic
- เมือง / map / farming pocket / boss arena ดูมีมิติกว่า
- เหมาะกับภาพจำของเกม “ดึ๋งปุ๊” มากกว่า top-down 3/4 ธรรมดา

## Tech Impact

Tech ต้องออกแบบ:
- isometric coordinate system
- diamond tile projection
- depth sorting ตามตำแหน่ง iso
- collision ที่สัมพันธ์กับ iso grid
- pathfinding ที่รองรับ iso tile/world coordinate
- object sorting สำหรับ character, monster, prop, building

## Constraint

เพื่อลด scope:
- fixed camera เท่านั้น
- ไม่มี rotation
- ไม่มี height 3D ซับซ้อน
- ใช้ pseudo-height ได้เฉพาะ visual/depth layer ถ้าจำเป็น
- อย่าใช้คำว่า “Isometric / Top-down 3/4” ปนกันในเอกสาร tech ต่อไป

---

# 2. Character / Monster Direction Count

## Decision

เลือก:

> **5 directions drawn + mirror**

วาดจริง:
- S
- SW
- W
- NW
- N

Mirror:
- SE จาก SW
- E จาก W
- NE จาก NW

## Why

เหตุผล:
- 8 ทิศวาดจริงคุณภาพดีที่สุด แต่ cost สูงเกินสำหรับ phase แรก
- 4 ทิศน้อยเกินสำหรับ isometric MMO
- 5 ทิศ + mirror เป็นจุดสมดุลของคุณภาพและ production cost
- เหมาะกับ frame-by-frame pixel sprite pipeline

## Tech Impact

Animation system ต้องรองรับ:
- direction resolver
- mirror flag
- per-animation frame list
- per-entity direction set
- optional override เป็น 8-dir สำหรับ boss/NPC/asset พิเศษในอนาคต
- data-driven animation config

## Art Guardrail

เพื่อลดปัญหาการ mirror:
- launch character design ไม่ควร asymmetry หนักเกิน
- weapon ข้างเดียว / shoulder pad / hair accessory ต้องคุมให้ mirror แล้วไม่หลุด
- boss หรือ character สำคัญที่ mirror แล้วแปลกมาก สามารถทำ 8-dir override ได้ในอนาคต

---

# 3. Map World Model

## Decision

เลือก:

> **Separated Map Instances / Rooms / Channels**

การข้าม map:
- ข้าม map = โหลดฉากใหม่
- ใช้ fade/loading สั้น ๆ ได้
- แต่ละ map เป็น room/channel ของตัวเอง
- ผู้เล่นเห็นกันเฉพาะคนที่อยู่ map/channel เดียวกัน

## Why

เหตุผล:
- เหมาะกับ browser + PixiJS + MMO density มากกว่า seamless open world
- คุม memory ได้ดีกว่า
- คุม spawn / bot / event / PvP / world boss ง่ายกว่า
- scale server ง่ายกว่า
- สอดคล้องกับ Map 1–10 ที่มี Exit/Warp ชัดเจน

## Tech Impact

Server architecture ต้องรองรับ:
- map room
- channel instance
- player transfer between maps
- party channel sync
- world boss / event special channel
- loading/fade handoff
- map state per room/channel
- spawn manager per room/channel

## Constraint

Phase แรก:
- ไม่ทำ seamless open world
- ไม่ทำ world streaming ไร้รอยต่อ
- ไม่ทำ map chunk streaming ขนาดใหญ่แบบ open world
- ให้ใช้ map instance/channel เป็น foundation

---

# 4. Weird Map Behavior / Minimap Distortion

## Decision

เลือกสำหรับ launch:

> **Level Design + Simple Scripted Triggers เท่านั้น**

ใช้ได้:
- ทางเดินวน
- ทางลับ
- one-way path บางจุด
- fog of war
- minimap ไม่แสดง secret
- clue บอกว่า “แผนที่จับตำแหน่งไม่ได้”
- scripted trigger ง่าย ๆ เฉพาะจุด

ยังไม่ทำใน launch:
- minimap บิด real-time
- UI เพี้ยน dynamic
- teleport หลอกผู้เล่นแบบระบบใหญ่
- geometry เปลี่ยนตามเงื่อนไขซับซ้อน
- map logic ที่ทำให้ pathfinding เปลี่ยนหลายชั้น

## Why

เหตุผล:
- ลดต้นทุน engine foundation
- รักษา flavor ของ Map 3 / Map 9 ได้ด้วย level design
- ไม่ผูกระบบแปลกเข้ากับ minimap/pathfinding ตั้งแต่แรก
- ถ้าอนาคตอยากทำ mind-bending map ค่อยเพิ่มเป็น feature แยก

## Tech Impact

Tech ทำแค่:
- hidden path flag
- secret marker hidden on minimap
- simple trigger volume
- optional one-way connector
- scripted teleport เฉพาะจุดถ้าจำเป็นและต้อง explicit
- minimap reveal/hide area ตาม state แบบง่าย

---

# 5. Server-wide Secret / First Player Milestone

## Decision

สำหรับ launch/prototype:

> **Server-milestone secrets = Future / Post-launch**

Launch ทำเฉพาะ:
- local/simple secret ต่อ character
- เดินวนหิน 3 รอบ
- คุย NPC ตามเงื่อนไข
- ใช้ item เปิด clue
- เข้า hidden route
- local lore/quest secret

ยังไม่ต้องทำใน launch:
- ห้องชื่อผู้เล่นคนแรกทั้ง server
- secret ที่เปลี่ยนถาวรทั้ง server
- global milestone trigger ซับซ้อน
- reward เฉพาะคนแรกทั้ง serverแบบ custom

## Future Direction

หลัง Hall of Fame / Eternal Record พร้อม ค่อยทำ:
- first Map 10 clear
- first +15 weapon
- first legendary awakening
- first secret route discovery
- first world boss clear

ระบบ future ควร reuse:
- Hall of Fame
- Eternal Record
- Announcement
- Audit log / global state

ไม่ควรสร้างระบบ global secret milestone แยกซ้ำซ้อน

---

# 6. Weekly World Condition

## Decision

Phase แรก:

> **เปลี่ยน spawn / event / ambience / VFX overlay บน layout เดิม**

เปลี่ยนได้:
- spawn table
- event wave
- drop modifier
- weather/tint overlay
- ambience
- music layer
- NPC/event availability
- resource node บางจุด

ยังไม่ทำ:
- เปลี่ยน tilemap จริงทั้ง map
- สลับ geometry ใหญ่
- pathfinding เปลี่ยนหนัก
- layout replacement runtime

## Tech Impact

Weekly condition system ควรเป็น:
- config-based modifier
- spawn/event modifier
- ambience/VFX modifier
- no tilemap rebuild required in phase แรก

---

# 7. Risk Zone / PvP Boundary

## Decision

Map 7+ ไม่เปิด PvP ทั้ง map

ใช้แบบ:

> **Sub-zone based Risk/PvP**

กฎ:
- Safe Camp ปิด PvP เสมอ
- risk pocket เปิด PvP/risk ตาม config
- boss/event zone เปิดตาม event rule
- ผู้เล่นต้องเห็น warning ก่อนเข้า risk pocket
- Bot เข้าได้เฉพาะ opt-in
- ตายไม่เสียของ / เงิน / EXP / material ตาม design เดิม

ตัวอย่าง Map 7:
- SW ชุมชนผลึก = safe camp
- C ทุ่งผลึกร้าว = farming/risk light
- E risk pocket = PvP/risk enabled
- S boss zone = ตาม event rule

---

# 8. Elite / Risk Pocket Spawn

## Decision

ใช้แบบผสม:

> **Fixed Pocket + Random Spawn Point inside Pocket**

กฎ:
- elite แต่ละตัวมี allowed spawn zone
- สุ่มจุดเกิดภายใน zone
- respawn window configurable
- บาง elite มี patrol path สั้น ๆ
- rare elite อาจมีหลาย possible pocket แต่ยังอยู่ใน zone ที่กำหนด

ไม่ควร:
- สุ่ม elite ทั่วทั้ง map แบบไร้ขอบเขต
- ทำให้ bot/route/debug/economy คุมยาก

---

# 9. Summary for Tech

สรุปสั้นสำหรับทีม tech:

```txt
1. Camera: True 2D Isometric Pixel Art, diamond grid, fixed camera, no rotation.
2. Character directions: 5 directions drawn + mirror. Engine should allow optional 8-dir override later.
3. Map model: separated map instances/rooms/channels with loading/fade between maps. No seamless open world in phase 1.
4. Weird map behavior: level design + simple scripted triggers only. No dynamic minimap distortion system in launch.
5. Server-first secret milestones: future/post-launch. Launch uses local/simple secrets only. Global milestone should later reuse Hall of Fame/Eternal Record system.
6. Weekly world condition changes spawn/event/ambience/VFX on same layout, not tilemap replacement.
7. Risk zone PvP is sub-zone based; safe camp always non-PvP.
8. Elite spawns in fixed pockets with random points inside the pocket.
```

