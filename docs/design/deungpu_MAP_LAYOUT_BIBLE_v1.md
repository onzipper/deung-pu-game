# ดึ๋งปุ๊ — MAP_LAYOUT_BIBLE.md v1

> สถานะ: Map Layout Bible ระยะ Launch Scope  
> Scope: **Map 1–10 เท่านั้น**  
> จุดประสงค์: ลงรายละเอียดตำแหน่งจริงเชิง design สำหรับเมือง, จุดวาป, spawn, farming route, boss, event, secret, resource node  
> หมายเหตุ: เอกสารนี้เป็น layout design guide ไม่ใช่ final tilemap / coordinate spec

---

## 0. Layout Legend

ใช้ทิศทางแบบ top-down:

- N = เหนือ / ด้านบน
- S = ใต้ / ด้านล่าง
- W = ตะวันตก / ซ้าย
- E = ตะวันออก / ขวา
- C = กลาง map

ประเภทจุด:
- **Safe Point** = จุดปลอดภัย / camp / sub city
- **Warp Gate** = จุดวาปหลัก
- **Exit** = ทางออกไป map ถัดไป/ก่อนหน้า
- **Mob Zone** = พื้นที่มอนหลัก
- **Elite Pocket** = จุดเกิด elite / rare mob
- **Boss Arena** = พื้นที่ boss
- **Resource Node** = จุดเก็บ resource
- **Secret Spot** = จุด secret / hidden trigger
- **Event Zone** = พื้นที่ event รายสัปดาห์หรือ dynamic event
- **Route** = เส้นทาง farming loop

---

# Map 1 — ขอบเมืองมนุษย์

## Layout Goal

สอนผู้เล่นให้เดิน, ตีมอน, เก็บของ, กลับเมือง, ใช้ผู้ช่วยนักล่า  
ต้องอ่านง่าย ปลอดภัย และไม่ซับซ้อน

## High-level Layout

```text
[N] ประตูเมืองหลัก / Warp Gate
 |
 |  ลานหญ้ากว้าง / Tutorial Lane
 |
[C] ทุ่งสไลม์เมือกดึ๋ง ---- [E] รังนกจิกปุ๊
 |
 |  เนินหมูป่าพอง
 |
[S] Boss Clearing: หมูป่าหม้อเดือด
```

## Key Locations

- N: ประตูเมืองหลัก / จุดวาปกลับนครอรุณผนึก
- NW: ครูฝึกยืนสอน combat
- C: ทุ่งสไลม์เมือกดึ๋ง
- E: รังนกจิกปุ๊
- SW: เนินหมูป่าพอง
- S: ลาน boss หมูป่าหม้อเดือด

## Mob Placement

- สไลม์เมือกดึ๋ง: C, ใกล้เส้นทางหลัก
- นกจิกปุ๊: E, ใกล้พุ่มไม้และก้อนหิน
- หมูป่าพอง: SW/S, pack ใหญ่กว่าเล็กน้อย
- Elite หมูป่าหนังหนา: ระหว่าง SW กับ S

## Resource Nodes

- เมือกดึ๋ง: C
- หนังหมูพอง: SW/S จากหมูป่า
- ขนนกปุ๊: E

## Farming Route

Route แนะนำ:
N → C สไลม์ → E นก → SW หมูป่า → กลับ C → กลับเมือง

เหมาะกับ:
- ผู้เล่นใหม่
- Bot Free
- Tutorial quest

## Secret Spot

- ก้อนหินเด้งบริเวณ SE ของทุ่งสไลม์
- Trigger: เดินวนรอบหิน 3 รอบ
- Reward: flavor item / clue เบา ๆ

## Design Notes

- ไม่ควรมีทางแยกเยอะ
- มอนต้องเห็นง่าย
- จุดวาปต้องมองเห็นจากทางเข้า
- Safe feeling สูง

---

# Map 2 — ถนนชายไร่

## Layout Goal

สอน daily / material farm / หมู่บ้านย่อย / farming loop ที่เริ่มมี route หลายทาง

## High-level Layout

```text
[NW] Exit Map 1 ---- [N] ถนนหลัก ---- [NE] หมู่บ้านชายไร่ / Safe Point
                         |
[W] แปลงเห็ดสะดุ้ง -- [C] ทุ่งฟาง / หุ่นฟาง -- [E] คันนา / หนูนาแสงเขียว
                         |
                       [S] หุ่นฟางผู้เฝ้าไร่ Boss Field
```

## Key Locations

- NW: ทางกลับ Map 1
- NE: หมู่บ้านชายไร่ / จุดวาป / NPC หมอยา
- C: ทุ่งฟางหลัก
- W: แปลงเห็ดสะดุ้ง
- E: คันนา / หนูนา
- S: Boss field

## Mob Placement

- เห็ดสะดุ้ง: W, spawn เป็นกอเล็ก ๆ
- หุ่นฟางเดินได้: C, pack 6–10 ตัว
- หนูนาแสงเขียว: E, วิ่งเร็วกว่า
- Elite หุ่นฟางพันยันต์: C/S border
- Boss หุ่นฟางผู้เฝ้าไร่: S

## Resource Nodes

- เห็ดสะดุ้ง: W
- ฟางสั่นพ้อง: C
- ดินไร่ชื้น: E / ริมคันนา

## Farming Route

Route 1 สำหรับ bot:
NE Safe Point → C หุ่นฟาง → W เห็ด → C → E หนูนา → กลับ NE

Route 2 สำหรับ material:
NE → W เห็ด → E ดินไร่ → กลับ

## Secret Spot

- ตะกร้าเด็กส่งของอยู่หลังบ่อน้ำใน NE
- Trigger: เฉพาะคืนจันทร์เว้า / weekly condition บางแบบ
- Clue จากป้าปุ๊

## Event Zone

- C ทุ่งฟางสามารถเปลี่ยนเป็น mini-event “ฟางสั่นพ้อง”
- มอนหุ่นฟางเกิดเป็น wave

---

# Map 3 — ทางป่าเก่า

## Layout Goal

เปิด secret layer และทางลับที่ไม่ตรงตาม minimap  
มีเส้นทางหลักและเส้นทางรองหลอกตา

## High-level Layout

```text
[W] Exit Map 2
 |
[SW] ค่ายพรานป่า / Safe Point
 |
[C] ทางป่าเก่า / หินเดินได้
 |          |          [NE] ทางลับหินไร้ตะไคร่
 |
[E] สะพานไม้เก่า ---- [SE] Boss: ผู้เฝ้าทางที่ไม่มีชื่อ
```

## Key Locations

- W: ทางกลับ Map 2
- SW: ค่ายพรานป่า / จุดวาป
- C: ทางป่าเก่า
- NE: ทางลับหินไร้ตะไคร่
- E: สะพานไม้เก่า
- SE: Boss arena

## Mob Placement

- รากไม้กัดเท้า: C/SW
- ลิงเงา: ต้นไม้รอบ C/E
- หินเดินได้: C/NE
- Elite หินไร้ตะไคร่: NE hidden pocket
- Boss ผู้เฝ้าทางที่ไม่มีชื่อ: SE

## Resource Nodes

- หินไร้ตะไคร่: NE
- เศษรากเก่า: C/SW
- เปลือกไม้หม่น: รอบต้นไม้ E

## Farming Route

Normal route:
SW → C → E → C → SW

Secret farming route:
SW → C → NE hidden pocket → E → SE boss edge → SW

## Secret Spot

- NE: หินที่ไม่มีตะไคร่
- Trigger: ไม่เดินตามทางหลัก / เดินออกนอก path หลังรับ clue จากลุงดึ๋ง
- Reward: hidden route / secret clue / material พิเศษ

## Design Notes

- Minimap แสดงทางหลักเท่านั้นในช่วงแรก
- Auto Pilot บอกว่า “ร่องรอยไม่ชัด”
- เหมาะสำหรับ community discovery

---

# Map 4 — ป่าจันทร์เงา

## Layout Goal

สร้าง mood หมอก / จันทร์ / ความทรงจำ  
พื้นที่ควรเป็นวงวนมากกว่าเส้นตรง

## High-level Layout

```text
[SW] Exit Map 3 / Safe Pavilion
       [W] บ่อน้ำจันทร์ ---- [C] ป่าหมอก / เห็ดฝัน ---- [E] ทุ่งกวางเงา
             \                |
              \             [NE] กระจกน้ำ Secret
                               [S] Boss Grove: นางไม้จันทร์ดับ
```

## Key Locations

- SW: ศาลาจันทร์หมอก / จุดวาป
- W: บ่อน้ำจันทร์
- C: ป่าหมอก
- E: ทุ่งกวางเงา
- NE: กระจกน้ำ secret
- S: Boss grove

## Mob Placement

- ผีแสงจันทร์: W/C
- เห็ดฝัน: C
- กวางเงา: E
- Elite กวางจันทร์แตก: E/NE
- Boss นางไม้จันทร์ดับ: S

## Resource Nodes

- ผงจันทร์สะท้อน: W/NE
- น้ำค้างเงา: C/S
- เห็ดฝันบาง: C

## Farming Route

Loop:
SW → W → C → E → NE → C → SW

Boss prep route:
SW → W cleanse buff → C → S

## Secret Spot

- NE กระจกน้ำสะท้อนเมืองหลักในอดีต
- Trigger: ยืนเฉย ๆ ช่วงหมอกลง / หลังฟัง NPC เด็กที่จำอดีตได้
- Reward: lore memory / hidden quest

## Design Notes

- ambience สำคัญมาก
- visibility ลดลงเล็กน้อย แต่ไม่ทำให้เล่นยาก
- เป็น map แรกที่ควรมี visual mood เปลี่ยนชัด

---

# Map 5 — ศาลร้าง

## Layout Goal

เปิดเรื่องผนึกและ contested event แรก  
map มีลานศาลหลายชั้นและ objective point

## High-level Layout

```text
[NW] Exit Map 4 / สำนักศาลร้าง Safe Point
 |
[W] ทางเดินยันต์ ---- [C] ลานศาลกลาง / Event Zone ---- [E] กุฏิเก่า
                          |
                       [S] เสาศาล 3 จุด
                          |
                       [SE] Boss: ผู้เฝ้าศาลร้าว
```

## Key Locations

- NW: สำนักศาลร้าง / จุดวาป
- W: ทางเดินยันต์
- C: ลานศาลกลาง / contested event zone
- E: กุฏิเก่า
- S: เสาศาล 3 จุด
- SE: Boss arena

## Mob Placement

- กระดาษยันต์มีชีวิต: W/C
- วิญญาณเครื่องราง: C/S
- นักพรตเงา: E/S
- Elite ยันต์แดงไร้เจ้าของ: S objective points
- Boss ผู้เฝ้าศาลร้าว: SE

## Resource Nodes

- เศษยันต์เก่า: W/C
- น้ำตาผู้เฝ้าศาล: boss/event
- ด้ายผนึกขาด: S/E

## Farming Route

Safe farm:
NW → W → C edge → E → NW

Event route:
NW → C ลานศาล → S เสาศาล → SE boss

## Secret Spot

- ระฆังที่ดังตอน “ไม่มีใครมอง”
- ตำแหน่ง: หลังศาลด้าน E/S
- Trigger: หันกล้อง/ตัวละครออกจากระฆังช่วงเวลาหนึ่ง
- Reward: hidden clue / secret route

## Event Zone

- C/S เป็น event “ศาลร้างเปิดผนึก”
- ผู้เล่นแข่งขัน contribution ได้
- อาจมี limited PvP เฉพาะช่วง event ตาม rule

---

# Map 6 — หุบรากลึก

## Layout Goal

party positioning / vertical ravine / root system  
ควรมีสะพาน ทางต่ำ และ core event

## High-level Layout

```text
[N] Exit Map 5
 |
[NW] ค่ายริมเหว / Safe Point ---- [NE] สะพานแขวน
      |                               |
[W] โพรงแมลง ---- [C] รากกลางหุบ / Event Core ---- [E] ทางใต้สะพาน Secret
                                      |
                                    [S] Boss: รากแรกแห่งรอยแยก
```

## Key Locations

- NW: ค่ายริมเหว / จุดวาป
- NE: สะพานแขวน
- W: โพรงแมลง
- C: รากกลางหุบ / event core
- E: ทางใต้สะพาน secret
- S: Boss arena

## Mob Placement

- แมลงโพรง: W
- รากกลืนแสง: C/S
- เงาใต้ดิน: NE/E
- Elite แมลงเปลือกผนึก: W/C
- Boss รากแรกแห่งรอยแยก: S

## Resource Nodes

- เลือดรากรอยแยก: C/S/boss
- เปลือกโพรงดำ: W
- ฝุ่นใต้ผนึก: E/NE

## Farming Route

Solo:
NW → W → C edge → NW

Party:
NW → NE → C event core → S boss → NW

Secret:
หลัง event จบ → E ทางใต้สะพาน → hidden node

## Event Zone

- C: รากลึกสั่นไหว
- wave มอนจากรากกลาง
- party contribution
- มีโอกาสเป็น World Boss version ของรากแรก

## Secret Spot

- E ทางใต้สะพาน
- เปิดเฉพาะหลัง event core ถูกทำให้สงบ
- Clue จากลุงดึ๋งเรื่อง “ของใต้สะพานไม่ได้อยู่ใต้เสมอ”

---

# Map 7 — เขตผลึกร้าว

## Layout Goal

high reward / risk zone แรก  
ต้องมี safe camp, contested pockets, resource-rich dangerous areas

## High-level Layout

```text
[W] Exit Map 6
 |
[SW] ชุมชนผลึก / Safe Camp / Warp
 |
[C] ทุ่งผลึกร้าว ---- [NE] กระจกสะท้อน / Secret
 |            |            [E] Risk Pocket / นักล่าผลึกบ้า
 |
[S] Boss: จ้าวผลึกบิดเบือน
```

## Key Locations

- SW: ชุมชนผลึก / safe camp / จุดวาป
- C: ทุ่งผลึกร้าว
- E: risk pocket
- NE: กระจกสะท้อน secret
- S: Boss arena
- W: ทางกลับ Map 6

## Mob Placement

- ผลึกเดินได้: C
- นักล่าผลึกบ้า: E
- เงาสะท้อน: C/NE
- Elite เงาสะท้อนของผู้เล่น: NE/E
- Boss จ้าวผลึกบิดเบือน: S

## Resource Nodes

- แกนผลึกบิดเบือน: C/S/boss
- เศษกระจกผนึก: NE
- ฝุ่นผลึกร้าว: C/E

## Farming Route

Low risk:
SW safe camp → C edge → SW

High reward:
SW → C → E risk pocket → NE secret mirror → S boss edge → SW

## Risk Design

- SW เป็น safe camp ชัดเจน
- E เป็นพื้นที่ resource ดีแต่เสี่ยง
- Auto Pilot ต้องเตือนก่อนเข้า E/S
- Bot เข้าได้เฉพาะ opt-in

## Event Zone

- C/E: ฝนผลึก
- spawn เป็น wave
- resource node เพิ่ม
- Hall of Fame หมวดฟาร์ม/rare drop

## Secret Spot

- NE กระจกที่สะท้อนชื่อผู้เล่นอื่น
- Trigger: เห็นชื่อตัวเองผิด / interaction หลังมี item เศษกระจกผนึก
- Reward: secret clue / echo fight

---

# Map 8 — ประตูเถ้าถ่าน

## Layout Goal

war zone / ash fortress / guild content seed  
ควรมีเส้นทางตีฝ่าแนว, choke points, objective flags

## High-level Layout

```text
[W] Exit Map 7
 |
[SW] ป้อมเถ้าถ่าน / Safe Camp
 |
[W] ค่ายทหารเถ้า ---- [C] ถนนเถ้ากลาง ---- [E] ประตูไฟดำ
                              |
                           [NE] ธงไหม้ / Guild Objective
                              |
                            [S] Boss: แม่ทัพเถ้าผนึก
```

## Key Locations

- SW: ป้อมเถ้าถ่าน / safe camp / จุดวาป
- W: ค่ายทหารเถ้า
- C: ถนนเถ้ากลาง
- E: ประตูไฟดำ
- NE: ธงไหม้ / guild objective
- S: Boss arena

## Mob Placement

- อสูรเถ้า: C/E
- ทหารไร้ชื่อ: W/C
- สุนัขไฟดำ: E/S
- Elite อัศวินเถ้าร้าว: NE/S
- Boss แม่ทัพเถ้าผนึก: S

## Resource Nodes

- เถ้าประตูอสูร: E/S
- โลหะไฟดำ: W/NE
- เศษธงไหม้: NE

## Farming Route

Solo safer:
SW → W → C edge → SW

Guild/party:
SW → C → NE objective → E gate → S boss

## Event Zone

- E/NE: ประตูเถ้าสั่นไหว
- guild contribution
- wave ทหารเถ้า
- objective ปักธง/ป้องกันธง

## Secret Spot

- E ประตูที่เปิดจากด้านที่ไม่มีอยู่
- Trigger: interaction หลัง event / มีเศษธงไหม้
- Reward: lore ว่ามนุษย์เคยเปิดประตูเอง

---

# Map 9 — ชายแดนต่างโลก

## Layout Goal

กฎโลกพัง / path ไม่เสถียร / time loop  
layout ควรหลอกทิศทางบางส่วน แต่ยังเล่นได้

## High-level Layout

```text
[SW] Exit Map 8 / จุดพักรอยแยก Safe Camp
 |
[W] โซนเวลาแตก ---- [C] พื้นที่ไร้รูป ---- [E] ทางเดินย้อนกลับ
                          |
                       [NE] NPC ที่ยังไม่เกิด / Secret
                          |
                        [S] Boss: ผู้มาจากด้านที่ไม่มีชื่อ
```

## Key Locations

- SW: จุดพักรอยแยก / safe camp / จุดวาป
- W: โซนเวลาแตก
- C: พื้นที่ไร้รูป
- E: ทางเดินย้อนกลับ
- NE: NPC ที่ยังไม่เกิด
- S: Boss arena

## Mob Placement

- สิ่งไร้รูป: C
- เงาย้อนกลับ: W/E
- ผู้เดินผิดเวลา: E/NE
- Elite เงาของวันพรุ่งนี้: NE/S
- Boss ผู้มาจากด้านที่ไม่มีชื่อ: S

## Resource Nodes

- หัวใจรอยแยก: C/S/boss
- ผงเวลาขาด: W/E
- เนื้อโลกบาง: C/NE

## Farming Route

Normal:
SW → W → C → SW

High reward:
SW → W → C → E → NE → S edge → SW

## Special Layout Rule

- บางทางพาผู้เล่นวนกลับจุดเดิม
- minimap อาจ delay หรือบิดเล็กน้อย
- Auto Pilot แจ้งว่าพื้นที่ไม่เสถียร

## Secret Spot

- NE NPC ที่ต้องคุยก่อนเจอเขา
- Trigger: รับ clue ในอนาคต / คุยกับ NPC ก่อนเขาปรากฏ
- Reward: hidden lore / time-related quest

## Event Zone

- C/E: คืนที่ไม่จบ
- wave เกิดแบบผิดจังหวะ
- clock / timer UI อาจมี effect เพี้ยนเล็กน้อย

---

# Map 10 — วิหารรอยแยก

## Layout Goal

climax Arc 1  
ต้องเป็น map ที่รู้สึกเหมือนเดินเข้าสู่ final temple และเปิดทางไป Arc 2

## High-level Layout

```text
[S] Exit Map 9 / จุดพักก่อนวิหาร
 |
[SW] Safe Camp / Last Camp
 |
[C] ลานวิหารไร้เสียง
 |        |        [W] ห้องจารึก / Lore
 |
[N] โถงผนึกหลายชั้น ---- [NE] ห้องชื่อผู้เล่นคนแรก / Secret
 |
[E] ประตูรอยแยก
 |
[Final] Boss: ผู้เฝ้าประตูสุดท้าย
```

## Key Locations

- S: ทางเข้า Map 10 จาก Map 9
- SW: Last Safe Camp / จุดวาป
- C: ลานวิหารไร้เสียง
- W: ห้องจารึก
- N: โถงผนึกหลายชั้น
- NE: ห้อง secret
- E: ประตูรอยแยก
- Final: Boss arena

## Mob Placement

- ผู้พิทักษ์วิหาร: C/N
- เงาผนึก: W/N
- อวตารรอยแยก: E/Final
- Elite ผู้ถือกุญแจไร้ชื่อ: N/E
- Boss ผู้เฝ้าประตูสุดท้าย: Final arena

## Resource Nodes

- เถ้าแห่งประตูสุดท้าย: E/Final
- เสี้ยววิหารไร้เสียง: W/N
- แกนสุริยะร้าว: boss / rare node

## Farming Route

Endgame material:
SW → C → W → N → SW

Boss prep:
SW → C → N → E → Final

## Secret Spot

- NE ห้องที่มีชื่อผู้เล่นคนแรกที่เข้าไป
- Trigger: server milestone / first clear / Hall of Fame record
- Reward: Eternal Hall lore / cosmic teaser

## Event Zone

- E/Final: ประตูสุดท้ายเปิด
- server-wide event / story climax
- world announcement / Hall of Fame moment

## Arc 2 Teaser

Map 10 ต้องมี:
- เสียงจากฟ้า
- visual ของวงโคจร
- item/fragment ที่ชื่อโยง Celestial
- portal ที่ยังไม่เปิดจริง
- NPC หรือจารึกที่พูดถึงเทพดาว

---

# Layout Production Notes

## สิ่งที่ต้องทำต่อใน phase ถัดไป

- วาด top-down map sketch จริง
- กำหนด chunk size
- กำหนด coordinate
- กำหนด spawn table รายจุด
- กำหนด pathfinding/nav mesh
- กำหนด safe boundary
- กำหนด event trigger
- กำหนด resource respawn
- กำหนด camera/minimap behavior
- กำหนด secret trigger condition เชิง data

## Scope Reminder

Map 1–10 คือ launch scope / Arc 1  
Map 11+ เป็น future roadmap และไม่ควรลง layout จริงตอนนี้
