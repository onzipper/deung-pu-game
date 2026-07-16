# ดึ๋งปุ๊ — MAP_SCALE_AND_SPAWN_DENSITY_SPEC.md v1

> สถานะ: **Tech Handoff Spec / Launch Scope**
> Scope: **Map 1–10 เท่านั้น**
> จุดประสงค์: กำหนดขนาด map, ความหนาแน่นมอน, spawn pack, AoE target, event wave, bot farming route และ performance guardrail
>
> **CURRENT BOT SOURCE OF TRUTH (2026-07-15):** D-067 + canonical checkpoint §4.1–§4.2. §8.1 ที่เคยเปิด risk/secret/event และ §8.2 ที่ให้ Plus `stop on rare drop` หรือตีความว่า paid tier ได้ combat power เพิ่ม **SUPERSEDED**: automation ห้ามเข้าพื้นที่ต้องห้าม, ordinary rare เป็น plan-selected action, และทุก tier มี combat/reward ceiling เท่ากัน. เก็บ historical text ด้านล่างไว้เพื่อ traceability; ห้าม implement โดยไม่ผ่าน amendment นี้.
> ใช้คู่กับ:
> - `deungpu_MAP_LAYOUT_BIBLE_v1.md`
> - `deungpu_project_checkpoint_v11_tech_handoff_ready.md`
>
> หมายเหตุ: เอกสารนี้เป็น design spec สำหรับให้ tech ทำระบบ spawn/combat/map ต่อ ไม่ใช่ final numeric balance 100%

---

# 0. Core Intent

เกมนี้ต้องไม่ใช่ MMORPG ที่เดินไกลแล้วเจอมอนบาง ๆ ทีละตัว

แกนฟีลที่ต้องล็อก:

> เดินเข้า farming pocket → มอนแน่นพอดี → กด AoE แล้วแตกเป็นชุด → damage number เด้งสะใจ → loot เด้ง → bot มี route ฟาร์มที่อ่านง่าย

เป้าหมายของเอกสารนี้:

- บอกทีม tech ว่า map กว้างประมาณไหน
- บอกว่ามอนควรหนาแน่นแค่ไหน
- บอกว่า AoE ควรโดนมอนกี่ตัวถึงจะสะใจ
- บอกว่า event wave ต้องขึ้นระดับไหน
- บอกว่า bot farming route ต้องรองรับยังไง
- บอกว่า performance ต้องคุมยังไงเมื่อมอนเยอะ
- บอกว่าอะไรเป็น **Design Knob** ที่ต้อง config ได้

---

# 1. Map Size Tier

ใช้หน่วยออกแบบก่อน ไม่ลง pixel coordinate ในรอบนี้

| Tier | ใช้กับ | เวลาเดินต้นถึงท้ายโดยประมาณ | Farming Pocket | หมายเหตุ |
|---|---|---:|---:|---|
| Small Field | tutorial / early field | 45–90 วินาที | 3–4 | อ่านง่าย ไม่ซับซ้อน |
| Medium Field | map ฟาร์มปกติ | 2–3 นาที | 5–7 | เริ่มมี route หลายทาง |
| Large Field | mid/late map | 3–5 นาที | 7–10 | มี event, boss, secret, route ย่อย |
| Endgame / Risk Field | Map 7–10 / risk | 4–6 นาที | 8–12 | มี safe camp, risk pocket, density สูง |
| Final Arc Field | Map 10 | 3–5 นาที | 6–9 | ขลังกว่า หนาแน่นเฉพาะบางช่วง |

---

# 2. Screen Density Target

เป้าหมายจำนวนมอนที่ผู้เล่นควรเห็นในจอเดียว

| Phase | Normal Screen | Combat Pocket | Event Peak |
|---|---:|---:|---:|
| Early Game / Map 1–2 | 6–12 ตัว | 10–15 ตัว | 20–30 ตัว |
| Mid Game / Map 3–6 | 10–20 ตัว | 16–28 ตัว | 30–50 ตัว |
| Late / Risk / Map 7–10 | 15–30 ตัว | 24–40 ตัว | 40–60 ตัว |
| Horde Event | 20–35 ตัว | 35–50 ตัว | 60 ตัวแบบคุม performance |

หลัก:
- มอนปกติควรมาเป็นกลุ่ม
- Elite ไม่ต้องเยอะ แต่ต้องเด่น
- Boss ไม่เน้นจำนวนตลอด แต่มี add/wave ใน phase สำคัญ
- Event peak 40–60 ตัวทำได้ แต่ต้องมี damage number aggregation และ particle pooling

---

# 3. AoE Combat Target

## 3.1 AoE Skill ทั่วไป

| Phase | เป้าหมายมอนที่โดนต่อ 1 cast |
|---|---:|
| Early | 4–6 ตัว |
| Mid | 6–10 ตัว |
| Late | 8–14 ตัว |
| Risk / Event | 10–18 ตัว |

## 3.2 Skill ใหญ่ / Ultimate

| Phase | เป้าหมายมอนที่โดนต่อ 1 cast |
|---|---:|
| Early | 8–12 ตัว |
| Mid | 12–20 ตัว |
| Late | 20–35 ตัว |
| Horde Event | 35–40+ ตัว โดยใช้ aggregation |

## 3.3 Guardrails

- AoE ต้องสะใจตอนฟาร์ม
- AoE ห้ามชนะ single target skill ในการตี boss ทุกบริบท
- Elite / Boss ต้องมี resistance หรือ modifier แยก
- Damage number ต้องไม่บัง boss telegraph
- Ultimate ต้องเป็น moment ใหญ่ แต่ใช้ไม่ถี่จนเกมเละ
- ถ้า hit หลายสิบตัวพร้อมกัน ให้รวม damage number บางส่วนได้

---

# 4. Spawn Philosophy

## 4.1 Spawn เป็น Pack / Pocket ไม่ใช่กระจายสุ่ม

ระบบ spawn ควรจัดเป็น:

- Spawn Pack = กลุ่มมอน 4–24 ตัว
- Spawn Pocket = พื้นที่รวมหลาย pack มี theme เฉพาะ
- Event Wave = spawn burst ตามเวลาหรือ objective
- Elite Pocket = จุดเกิด elite / rare mob
- Boss Approach Pocket = pack ก่อนเข้า boss
- Bot-Safe Pocket = density ปานกลาง, route ชัด
- Risk Pocket = density สูง, reward สูง, เสี่ยงโดนขัดจังหวะ

## 4.2 Spawn Pack ตัวอย่าง

- สไลม์ 6 ตัวรอบบ่อน้ำ
- หุ่นฟาง 10 ตัวรอบกองฟาง
- กระดาษยันต์ 14 ตัวรอบเสาศาล
- ผลึกเดินได้ 18 ตัวรอบ crystal node
- ทหารเถ้า 20 ตัวเรียงแนวถนนสงคราม

## 4.3 Respawn Rule

| ประเภท | Respawn โดยประมาณ |
|---|---:|
| มอนทั่วไป | 15–35 วินาที |
| Pack ใหญ่ | 30–60 วินาที |
| Elite | 3–8 นาที |
| Field Boss | 15–60 นาที |
| World Boss | schedule / event-based |
| Event Wave | ตาม phase / objective |

## 4.4 Dynamic Refill

เมื่อผู้เล่นเยอะหรือ bot เยอะ ระบบควร scale แบบนุ่ม:

- เพิ่มจำนวน pack ใน pocket บางจุด
- ลด respawn delay เล็กน้อย
- เปิด channel / instance เพิ่ม
- เพิ่ม density แต่ไม่เพิ่ม gold/drop แบบไม่คุม
- log output เพื่อ economy backoffice

---

# 5. Map Scale Table 1–10

| Map | Size Tier | เวลาเดินหลัก | Farming Pocket | Safe Point | Event Zone | Density Target | AoE Target |
|---|---|---:|---:|---:|---:|---|---|
| 1 ขอบเมืองมนุษย์ | Small–Medium | 60–90 วิ | 4 | 1 | 1 light | 6–12/จอ | 4–6 |
| 2 ถนนชายไร่ | Medium | ~2 นาที | 5–6 | 1 | 1 | 10–15/จอ | 6–10 |
| 3 ทางป่าเก่า | Medium | 2–3 นาที | 5–7 | 1 | 0–1 | 10–18/จอ | 6–10 |
| 4 ป่าจันทร์เงา | Medium–Large | ~3 นาที loop | 6–8 | 1 | 1 | 12–20/จอ | 8–12 |
| 5 ศาลร้าง | Large | 3–4 นาที | 7–9 | 1 | 1 contested | 16–28/จอ | 10–15 |
| 6 หุบรากลึก | Large | 3–5 นาที | 7–10 | 1 | 1 core | 18–30/จอ | 10–18 |
| 7 เขตผลึกร้าว | Large/Risk | ~4 นาที | 8–11 | 1 | 1 risk | 20–35/จอ | 12–20 |
| 8 ประตูเถ้าถ่าน | Large/War | 4–5 นาที | 8–12 | 1 | 1 guild | 20–35/จอ | 12–22 |
| 9 ชายแดนต่างโลก | Large/Weird | 4–6 นาที | 7–10 | 1 | 1 weird | 15–28/จอ | 10–18 |
| 10 วิหารรอยแยก | Medium–Large/Final | 3–5 นาที | 6–9 | 1 | 1 final | 12–24/จอ | 10–18 |

---

# 6. Spawn Density Table 1–10

## Map 1 — ขอบเมืองมนุษย์

| Mob / Zone | Pack Size | Packs per Pocket | Respawn | Active Cap | Notes |
|---|---:|---:|---:|---:|---|
| สไลม์เมือกดึ๋ง / C | 5–8 | 2–3 | 15–25s | 18 | tutorial AoE target |
| นกจิกปุ๊ / E | 3–6 | 2 | 20–30s | 12 | เคลื่อนที่เป็นวง |
| หมูป่าพอง / SW | 4–7 | 2–3 | 25–35s | 18 | เริ่มมี charge เบา ๆ |
| Elite หมูป่าหนังหนา | 1 | 1 | 3–5m | 1 | ไม่ควรฆ่าง่ายเกิน |
| Boss ลูกน้อง | 6–10 | boss phase | phase-based | 10 | ใช้สอน add clear |

เป้าหมาย:
- มือใหม่กดสกิลแรกแล้วกวาด 4–6 ตัวได้
- ไม่ควรมี event wave หนาเกิน 30 ตัว

---

## Map 2 — ถนนชายไร่

| Mob / Zone | Pack Size | Packs per Pocket | Respawn | Active Cap | Notes |
|---|---:|---:|---:|---:|---|
| เห็ดสะดุ้ง / W | 6–10 | 2–3 | 20–30s | 24 | กอเห็ดรวมตัวดีต่อ AoE |
| หุ่นฟางเดินได้ / C | 8–12 | 2–4 | 25–35s | 36 | pack หลักของ map |
| หนูนาแสงเขียว / E | 5–8 | 2–3 | 20–30s | 20 | วิ่งเร็ว กระจายกว่า |
| Elite หุ่นฟางพันยันต์ | 1–2 | 1 | 4–6m | 2 | ใกล้ boss route |
| Event ทุ่งฟาง | 20–30/wave | 3–5 wave | event | 30 | early AoE showcase |

เป้าหมาย:
- ผู้เล่นเห็น 10–15 ตัวบนจอได้บ่อย
- event เป็นจุดแรกที่ AoE ดูมันจริง

---

## Map 3 — ทางป่าเก่า

| Mob / Zone | Pack Size | Packs per Pocket | Respawn | Active Cap | Notes |
|---|---:|---:|---:|---:|---|
| รากไม้กัดเท้า / C | 6–10 | 2–3 | 25–35s | 24 | slow / root เบา ๆ |
| ลิงเงา / C/E | 4–8 | 2–3 | 25–35s | 20 | เคลื่อนที่ไว กระโดด |
| หินเดินได้ / C/NE | 5–9 | 2 | 30–40s | 18 | ถึกกว่า |
| Hidden หินไร้ตะไคร่ / NE | 8–12 | 1–2 | 35–50s | 20 | secret route reward |
| Elite หินไร้ตะไคร่ | 1 | 1 | 5–8m | 1 | hidden elite |

เป้าหมาย:
- เริ่มมีจังหวะรวบมอนแล้วกวาด
- secret route ให้ density ดีกว่าทางหลักเล็กน้อย

---

## Map 4 — ป่าจันทร์เงา

| Mob / Zone | Pack Size | Packs per Pocket | Respawn | Active Cap | Notes |
|---|---:|---:|---:|---:|---|
| ผีแสงจันทร์ / W/C | 6–12 | 2–3 | 25–40s | 30 | มี fade/teleport เบา |
| เห็ดฝัน / C | 8–14 | 2–3 | 25–35s | 32 | รวมเป็นวง ดีต่อ AoE |
| กวางเงา / E | 4–8 | 2 | 30–45s | 18 | movement สูงกว่า |
| Elite กวางจันทร์แตก | 1–2 | 1 | 5–8m | 2 | E/NE |
| หมอก Event | 20–35/wave | 3–5 wave | event | 35 | นักเวท/อาคมเด่น |

เป้าหมาย:
- มอนรวมเป็นวงมากขึ้น
- combat ไม่เร็วจัด แต่ AoE ต้องสวยและชัด

---

## Map 5 — ศาลร้าง

| Mob / Zone | Pack Size | Packs per Pocket | Respawn | Active Cap | Notes |
|---|---:|---:|---:|---:|---|
| กระดาษยันต์ / W/C | 10–16 | 2–4 | 25–40s | 48 | AoE target หลัก |
| วิญญาณเครื่องราง / C/S | 8–14 | 2–3 | 30–45s | 36 | ลอย/ทะลุสิ่งกีดขวางบางส่วน |
| นักพรตเงา / E/S | 5–9 | 2 | 35–50s | 20 | ถึกและมี skill |
| Elite ยันต์แดงไร้เจ้าของ | 1–2 | 1–2 | 5–8m | 3 | objective point |
| ศาลเปิดผนึก Event | 30–45/wave | 3–6 wave | event | 45 | contested contribution |

เป้าหมาย:
- AoE ควรกวาด 10–15 ตัวได้ใน event
- objective รอบเสาต้องมีมอนให้เคลียร์เป็นวง

---

## Map 6 — หุบรากลึก

| Mob / Zone | Pack Size | Packs per Pocket | Respawn | Active Cap | Notes |
|---|---:|---:|---:|---:|---|
| แมลงโพรง / W | 10–18 | 2–4 | 25–35s | 50 | swarm feel |
| รากกลืนแสง / C/S | 8–14 | 3 | 30–45s | 42 | root/slow mechanic |
| เงาใต้ดิน / NE/E | 6–12 | 2–3 | 30–45s | 30 | ambush |
| Elite แมลงเปลือกผนึก | 1–3 | 1–2 | 5–8m | 4 | party target |
| Event Core | 30–50/wave | 4–6 wave | event | 50 | world boss seed |

เป้าหมาย:
- party AoE สนุกมาก
- solo/bot มี route ขอบ map density ปานกลาง
- center event density สูง

---

## Map 7 — เขตผลึกร้าว

| Mob / Zone | Pack Size | Packs per Pocket | Respawn | Active Cap | Notes |
|---|---:|---:|---:|---:|---|
| ผลึกเดินได้ / C | 12–20 | 3–4 | 25–40s | 60 | main late farm |
| นักล่าผลึกบ้า / E | 6–12 | 2–3 | 35–50s | 30 | อันตรายกว่า |
| เงาสะท้อน / C/NE | 8–16 | 2–3 | 30–45s | 40 | clone / mirror feel |
| Risk Pocket / E | 18–28 | 2–3 | 30–45s | 70 | reward สูง, เสี่ยง |
| ฝนผลึก Event | 40–60/wave | 4–8 wave | event | 60 | ต้องมี performance mode |

เป้าหมาย:
- AoE late game ต้องได้โชว์เต็ม
- ultimate กวาด 20+ ตัวได้ใน event
- damage number ต้อง aggregate

---

## Map 8 — ประตูเถ้าถ่าน

| Mob / Zone | Pack Size | Packs per Pocket | Respawn | Active Cap | Notes |
|---|---:|---:|---:|---:|---|
| ทหารไร้ชื่อ / W/C | 12–24 | 3–4 | 25–40s | 70 | เรียงเป็นแนว |
| อสูรเถ้า / C/E | 8–16 | 2–3 | 35–50s | 40 | tanky |
| สุนัขไฟดำ / E/S | 6–12 | 2–3 | 25–35s | 36 | fast mover |
| Elite อัศวินเถ้าร้าว | 1–3 | 1–2 | 5–8m | 4 | near objective |
| Guild/Event Objective | 40–60/wave | 4–8 wave | event | 60 | line/cone AoE showcase |

เป้าหมาย:
- นักหอก/นักดาบเด่น
- line/cone skill ต้องสะใจ
- war feel จากแถวทหาร

---

## Map 9 — ชายแดนต่างโลก

| Mob / Zone | Pack Size | Packs per Pocket | Respawn | Active Cap | Notes |
|---|---:|---:|---:|---:|---|
| สิ่งไร้รูป / C | 10–18 | 2–3 | 30–45s | 40 | unpredictable movement |
| เงาย้อนกลับ / W/E | 8–16 | 2–3 | 30–50s | 36 | reverse behavior |
| ผู้เดินผิดเวลา / E/NE | 5–10 | 2 | 40–60s | 24 | mechanic หนักกว่า |
| Elite เงาของวันพรุ่งนี้ | 1–2 | 1 | 6–10m | 2 | weird elite |
| คืนที่ไม่จบ Event | 30–50/wave | 3–6 wave | event | 50 | เกิดเป็นจังหวะเพี้ยน |

เป้าหมาย:
- density ไม่ต้องหนาตลอด
- ใช้ burst wave เป็นจังหวะผิดธรรมชาติ
- AoE มีช่วงฟินแต่ยังคงความหลอน

---

## Map 10 — วิหารรอยแยก

| Mob / Zone | Pack Size | Packs per Pocket | Respawn | Active Cap | Notes |
|---|---:|---:|---:|---:|---|
| ผู้พิทักษ์วิหาร / C/N | 8–14 | 2–3 | 35–50s | 36 | guard pacing |
| เงาผนึก / W/N | 10–18 | 2–3 | 35–50s | 45 | AoE pocket |
| อวตารรอยแยก / E/Final | 6–12 | 2 | 45–60s | 30 | ถึกกว่า |
| Elite ผู้ถือกุญแจไร้ชื่อ | 1–2 | 1–2 | 6–10m | 3 | key holder |
| Final Event Wave | 30–60/wave | phase-based | event | 60 | ก่อน boss / phase transition |

เป้าหมาย:
- ไม่ให้ทุกจุดเป็นฟาร์มหนา
- มีช่วงเดินขลังและช่วง wave ระเบิด
- ultimate ต้องเป็น moment ใหญ่ก่อนเข้า boss

---

# 7. Aggro / Leash / Pull Rule

## 7.1 Aggro Range

| ประเภทมอน | Aggro Range |
|---|---:|
| Passive / early | ต่ำ |
| Normal farm | กลาง |
| Aggressive | กลาง-สูง |
| Elite | สูง |
| Boss add | ตาม phase |

## 7.2 Pull Cap

ควรมี cap เพื่อกันลากทั้ง map:

| Phase | Pull Cap ต่อผู้เล่น |
|---|---:|
| Map 1–2 | 8–12 ตัว |
| Map 3–4 | 12–18 ตัว |
| Map 5–6 | 18–24 ตัว |
| Map 7–10 | 24–35 ตัว |
| Event / Horde | 40+ เฉพาะ event rule |

## 7.3 Leash Rule

มอนควรกลับจุดเกิดเมื่อ:
- ผู้เล่นออกจาก pocket เกินระยะ
- ผู้เล่นเข้าพื้นที่ safe boundary
- มอนถูกลากนานเกิน limit
- pathfinding ตัน
- event phase จบ

## 7.4 Pull Design

- เกมควรสนับสนุนการรวบมอนในระดับหนึ่ง
- แต่ไม่ควรให้ลากข้ามหลาย pocket แบบทำลาย spawn
- Bot ควรรวบได้แค่ตาม rule/profile
- Elite อาจลาก pack ขนาดเล็กตามมาได้
- Boss add ไม่ควรถูกลากออกจาก arena

---

# 8. Bot Farming Density Rule

## 8.1 Bot-Safe Route

แต่ละ map ควรมี route ที่:
- density ปานกลาง
- respawn พอดี
- ไม่ต้องใช้การตัดสินใจซับซ้อน
- safe กลับเมืองชัด
- ไม่เข้า risk/secret/event โดยไม่ได้ตั้งค่า

## 8.2 Bot Plus / Pro

Plus:
- เลือก route
- auto sell/store/restock
- ใช้ AoE เมื่อมอนถึง threshold
- stop on rare drop

Pro:
- route หลายจุด
- goal chain
- doctrine
- ultimate usage rule
- risk setting
- density-aware farming

## 8.3 Bot Skill Usage Target

ตัวอย่าง:
- ใช้ AoE เมื่อมอนในระยะ >= 6
- ใช้ Ultimate เมื่อมอนในระยะ >= 12
- ใช้ single target กับ elite
- หยุดใช้ ultimate ถ้ามอนน้อยกว่า threshold
- ไม่ใช้ item สำคัญ เช่น แกร่ง

## 8.4 Bot Output Guardrail

Tech ต้อง log:
- gold/hour
- item/hour
- mob kill/hour
- route used
- skill usage
- potion usage
- death/stop reason
- rare drop trigger
- map density ที่ bot เจอจริง

---

# 9. Event Wave Density

## 9.1 Wave Tier

| Tier | จำนวนมอนต่อ wave | ใช้กับ |
|---|---:|---|
| Light Wave | 15–25 | Map 1–2 / tutorial event |
| Medium Wave | 25–40 | Map 3–6 |
| Heavy Wave | 40–60 | Map 7–10 / risk / guild |
| Boss Add Wave | 8–25 | boss phase |
| Horde Showcase | 50–60 | special event only |

## 9.2 Event Rule

- Wave ต้องมี telegraph / warning
- ไม่ spawn ทับตัวผู้เล่นแบบ unfair
- ต้องมี max active cap
- ถ้า cap เต็ม ให้ delay wave ถัดไป
- ถ้า server lag ให้ลด visual density ก่อนลด combat clarity
- loot explosion ต้อง aggregate ได้

---

# 10. Performance Guardrails

## 10.1 Client Visual Cap

แนะนำ:
- แสดง full animation เฉพาะมอนใกล้ผู้เล่น
- มอนไกลใช้ simplified animation
- damage number รวมเป็นก้อนเมื่อ hit เกิน threshold
- particle pooling
- loot pooling
- SFX throttling
- other-player effect reduction

## 10.2 Damage Number Rule

| สถานการณ์ | วิธีแสดง |
|---|---|
| Hit ปกติไม่ถี่ | แสดงเลขปกติ |
| Multi-hit 10+ ครั้ง | compact / stacked |
| AoE hit 20+ ตัว | aggregate บางส่วน |
| Critical | แสดงเด่น |
| Boss break | override priority |
| Event wave หนา | ลดเลขซ้ำ / แสดง total บางจุด |

## 10.3 Network / Realtime Rule

- Server authoritative สำหรับ damage/drop
- Client render damage number จาก server result
- Sync เฉพาะ entity ใน interest radius
- Event wave ใช้ spawn batch message
- ไม่ส่ง effect particle state ผ่าน network
- ส่ง skill result / hit target / damage result เท่าที่จำเป็น

---

# 11. Tech Config Requirements

ค่าที่ต้อง config ได้:

## Map Config
- map size tier
- pocket list
- safe point
- route group
- event zone
- risk zone

## Spawn Config
- mob type
- pack size min/max
- packs per pocket
- respawn delay
- active cap
- elite chance
- leash radius
- aggro radius
- event wave table

## Combat Density Config
- pull cap
- AoE target cap
- skill max targets
- ultimate max targets
- damage number display mode
- performance cap

## Bot Config
- allowed route
- allowed pocket
- density threshold
- AoE usage threshold
- ultimate usage threshold
- stop condition
- risk opt-in

---

# 12. Telemetry Required

ต้องเก็บ data เพื่อตรวจว่า map สนุกและ economy ไม่พัง:

- average mobs on screen
- average mobs killed/min
- mobs killed/hour per map
- gold/hour per map
- item/hour per map
- bot output per route
- active players per pocket
- average time from safe point to boss
- average death rate
- event wave completion rate
- AoE average targets hit
- ultimate average targets hit
- client FPS in high-density events
- server tick/load during event wave
- drop output by event

---

# 13. Success Criteria

Map/spawn/AoE ถือว่าผ่านเมื่อ:

- ผู้เล่น Map 1 กดสกิลแรกแล้วรู้สึก “กวาดมอนเป็นกลุ่ม”
- Map 2–4 มี farming loop ที่ไม่ต้องยืนรอมอนนาน
- Map 5–6 event ทำให้ AoE/party รู้สึกมีประโยชน์
- Map 7–8 risk/event ให้ฟีลมอนแน่น สกิลระเบิดจอ แต่ยังอ่านออก
- Map 9 มีจังหวะ density แปลก ไม่ใช่แค่หนาเท่ากันทั้ง map
- Map 10 มีจังหวะขลังและ wave burst ก่อน climax
- Bot สามารถฟาร์ม route ได้โดยไม่ลากมอนทั้ง map
- Economy output จากมอนไม่หลุดจนคุมไม่ได้
- FPS ยังอยู่ในเกณฑ์ที่เล่นได้ใน event peak
- Boss telegraph ไม่ถูก damage number/effect กลบ

---

# 14. Scope Reminder

Map 1–10 คือ launch scope / Arc 1  
Map 11+ เป็น future roadmap และยังไม่ควรลง spawn density จริงในรอบนี้

Map 11+ ค่อยทำหลังจาก:
- combat foundation ผ่าน
- spawn density Map 1–10 stable
- economy output stable
- bot output stable
- performance test ผ่าน
