# ดึ๋งปุ๊ — Project Checkpoint v15 P0 Scope Lock Ready

> สถานะเอกสาร: **P0 Scope Lock Ready / Current Source of Truth v15**  
> จุดประสงค์: ปิดงานการขึ้นโปรเจกต์รอบแรกให้ครบ ไม่มีงานค้างจากเฟส design setup  
> ใช้ต่อจาก: `deungpu_project_checkpoint_v8.md`  
> สถานะงาน: **Design Phase 1 + Phase 2 + Combat Juice Layer + Audio Direction + Tech Handoff Readiness + Map Scale/Spawn Density + Engine Foundation Decisions + Runtime/Bot/Channel/Schema Ownership + P0 Scope Lock ปิดครบแล้ว**

---

## 0.1 v10 Audio Update

Checkpoint v10 เพิ่ม **Audio Direction & Soundscape Layer** เป็นชั้นสุดท้ายของการปิด design setup โดยอิงหลักจาก music brief ที่เน้นความสมดุลระหว่างเพลงที่จำได้กับเพลงที่ฟังวนได้นาน ไม่ล้า

สิ่งที่เพิ่มใน v10:

- ดึ๋งปุ๊ Motif
- เสียงตัวตุย “ดึ๋ง…ปุ๊ววว~”
- เพลงเมืองหลัก / ตลาด / วิหาร / Hall of Fame
- เพลง Map 1–10
- เพลง Arc 2–4
- เพลง Boss / Event / Weekly World Condition
- Combat SFX แยกตามอาชีพ
- Enhancement / แกร่ง / Hall of Fame Audio
- Ambience ทุกพื้นที่
- Audio priority / mixing
- Focus / Bot Audio Mode
- NPC bark
- Cosmetic audio guardrails
- Audio asset baseline 72 รายการ


## 0.2 v11 Tech Handoff Update

Checkpoint v11 เพิ่มชั้น **Tech Handoff Readiness Layer** เพื่อให้ทีม tech / Claude Code ทำงานต่อได้โดยไม่ต้องเดาเองมากเกินไป

สิ่งที่เพิ่มใน v11:
- UI Art Direction & Visual Design System
- Color palette / rarity colors / system colors
- Screen-by-screen visual mood
- Design Knobs & Guardrails
- Punishment / Rollback / Abuse Policy Boundary
- Skill Data Model สำหรับส่งต่อ tech
- Deferred / P5+ Placeholder
- Docs-as-memory structure
- Claude Code execution rules
- สถานะปัจจุบันของ Map Layout Detail ว่ามีถึงระดับไหนและยังขาดอะไร

## 0. Final Closure Note

เอกสารนี้คือ checkpoint สำหรับปิดการขึ้นโปรเจกต์ **ดึ๋งปุ๊** รอบแรก

สิ่งที่เก็บเพิ่มใน v9:

- Combat Juice & Skill Impact Layer
- ฟีลสกิลแรง สะใจ มอนกลุ่มใหญ่
- Damage number เด้งจุใจ
- Hit impact / hit stop / screen shake / sound / loot explosion
- Ultimate / Awakening Skill เป็นโมเมนต์ที่อยากอัดคลิป
- Skill visual เชื่อมกับอาวุธตีบวก
- แกร่งเชื่อมกับ combat moment / Hall of Fame
- Horde Event / Wave Farming สำหรับโชว์ AoE
- Bot skill logic
- Performance guardrails
- Damage Number Cosmetic / Skill Effect Cosmetic
- Final suggestion ทั้งหมดก่อนปิดโปรเจกต์
- สรุปงานทั้งหมดที่ผ่านแล้ว
- ยืนยันว่าไม่มีงาน design setup ค้างในรอบนี้

---

# 1. Project Identity

ชื่อเกม: **ดึ๋งปุ๊**

ประเภทเกม:

> **2.5D Web MMORPG / Stylized Asian Fantasy / Bot-assisted Open World Farming MMORPG**

แกนหลัก:

> ผู้เล่นเป็นนักล่าในเมืองมนุษย์ที่ดูปลอดภัย มีตลาด มีผู้คน มีระบบฟาร์มและบอทช่วยเล่น แต่ยิ่งออกไปไกลยิ่งพบว่าปรากฏการณ์ “ดึ๋งปุ๊” คืออาการของผนึกและรอยแยกระดับโลก ก่อนจะขยายสู่ระดับเทพดาวและจักรวาล

จุดขายหลัก:

- 2.5D Web MMORPG
- เมืองหลักเป็น live hub
- Farming + Bot + Auto Pilot + Report
- Market / Auction / Player Shop / Trade
- Enhancement & Forge
- Hall of Fame / Weekly Glory
- Weekly World Condition
- Economy Backoffice / LiveOps
- Secret Quest Layer
- Risk Zone แบบไม่ลงโทษผู้แพ้
- Cosmic Arc Map 11–25
- Combat Juice: สกิลแรง สะใจ มอนกลุ่มใหญ่ ดาเมจเด้งจุใจ

---

# 2. Core Tone

แนวที่ล็อก:

> **Adventure Fantasy + ไทย/เอเชียแฟนตาซี + meme พอประมาณ → Dark Fantasy → Cosmic Fantasy**

โทนโดยรวม:

- ต้นเกม: สด สนุก เล่นง่าย มี meme flavor
- กลางเกม: ลึกลับ ป่า ศาล ผนึก ความทรงจำ
- ท้ายเกม: รอยแยก ต่างโลก ประตู เถ้า ผลึก
- Endgame: เทพดาว วงโคจร สงครามผนึก จักรวาล
- “ดึ๋งปุ๊” เป็นชื่อชาวบ้านของปรากฏการณ์ ไม่ใช่ภาษาหลักของ UI

กฎสำคัญ:

- UI/System message หลักไม่ใช้คำดึ๋ง/ปุ๊พร่ำเพรื่อ
- Meme ใช้ใน item, monster, side content, secret, flavor
- Legendary / Endgame ต้องขลังและจริงจัง
- เนื้อเรื่องมี hint เรื่อง loop/ความอยาก/การแข่งขัน แต่ไม่เทศนา

---

# 3. Final Locked Systems

## 3.1 Player Flow

เริ่มเกมที่เมืองหลัก ไม่ใช่ tutorial room

First 15 minutes:

> สร้างตัวละคร → เข้าเมืองหลัก → เห็นผู้เล่นอื่น → รับบทนักล่าฝึกใหม่ → ออก Map 1 → ตีมอน → เก็บของ → กลับเมือง → ขายของ → ได้ทอง → ปลดผู้ช่วยนักล่า

Returning Flow:

> Login → Report Summary → Claim/จัดของ → เลือกทำต่อ

Daily Loop:

> อ่าน Report → จัดของ → ตั้ง Bot → ทำ Daily/Event → เช็กตลาด → อัปเกรด → Dungeon/Party/Guild → ตั้งขายของ → Logout/ปล่อย Bot

Weekly Loop:

- Weekly World Condition เปลี่ยน
- Ranking reset บางหมวด
- Guild Boss refresh
- พ่อค้าพเนจรเปลี่ยนของ
- Market demand เปลี่ยน
- Hall of Fame reset
- Event เมืองหลักเปลี่ยน

---

## 3.2 Tutorial / Guide

Tutorial เป็นแบบ progressive:

> สอนตอนปลดระบบ ไม่ยัดทุกอย่างตั้งแต่แรก

มี:

- Skip
- Don’t show again
- Replay tutorial
- คู่มือนักล่า
- ครูฝึกในเมืองหลัก

---

## 3.3 Main City Live Hub

เมืองหลักล็อกชื่อ:

> **นครอรุณผนึก**

เมืองหลักเป็นเวทีของทั้ง server ไม่ใช่ lobby

เขตในเมือง:

- ลานกลางเมือง
- ตลาดกลาง
- ถนนร้านตีเหล็ก
- วิหารผนึก
- กิลด์นักล่า
- ลานเกียรติยศ
- เขต player shop
- ประตูเมือง
- หอจดหมายเหตุ
- มุมลุงดึ๋ง
- ร้านป้าปุ๊
- ลานคาราวาน
- จุดประกาศข่าวนักล่า
- ห้องฝึกนักล่า

NPC หลัก:

- เจ้าหน้าที่กิลด์นักล่า
- ช่างตีเหล็ก
- ผู้ดูแลคลัง
- นักจดหมายเหตุ
- ผู้เฝ้าวิหาร
- ครูฝึก
- พ่อค้าพเนจร
- ลุงดึ๋ง
- ป้าปุ๊
- ผู้ประกาศข่าวนักล่า

---

# 4. Hunter Assistant System

ระบบผู้ช่วยนักล่ารวม 3 อย่าง:

1. Bot Mode
2. Auto Pilot Mode
3. Report Mode

ไม่แยกขาย Bot กับ Auto Pilot  
ขายเป็น package เดียว

## Free

ถาวร:

- Bot พื้นฐาน
- Auto Pilot พื้นฐาน
- Report พื้นฐาน
- เล่น main content ได้ครบ

## Assistant Plus

ราคา baseline:

- 1 วัน: 19 บาท
- 7 วัน: 99 บาท
- 30 วัน: 299 บาท
- Hour Pack 24 ชม.: 79 บาท

ได้:

- Auto Restock
- Auto Sell
- Auto Resume Farm
- Event stage Auto Pilot
- Report ละเอียดขึ้น
- Profile 2–3 ช่อง
- Stop condition

## Assistant Pro

ราคา baseline:

- 1 วัน: 39 บาท
- 7 วัน: 199 บาท
- 30 วัน: 599 บาท
- Hour Pack 12 ชม.: 49 บาท
- Hour Pack 36 ชม.: 129 บาท
- Hour Pack 120 ชม.: 399 บาท

ได้:

- Bot 12 ชม. ต่อรอบ
- หลาย profile
- Goal Chain 3 ขั้น
- Daily/Event flow
- Dungeon repeat ทั่วไป
- Dashboard
- Risk setting
- Doctrine
- Skill usage logic

No Power Promise:

- ไม่เพิ่ม damage
- ไม่เพิ่ม rare drop rate
- ไม่เพิ่ม PvP stat
- ไม่เพิ่ม enhancement success
- ไม่เพิ่ม boss damage
- ไม่ใช้เพชรเอง

---

# 5. Market Helper

Market Helper เป็น paid-only feature  
ไม่ถาวร  
แยกจาก Bot / Auto Pilot  
เป็น helper สำหรับสายพ่อค้า ไม่ใช่ trade bot

ราคา baseline:

- 1 วัน: 15 บาท
- 7 วัน: 79 บาท
- 30 วัน: 199 บาท
- Hour Pack 24 ชม.: 59 บาท

ทำได้:

- วิเคราะห์ราคา
- Price history 7/14/30 วัน
- Watchlist
- แจ้งเตือนราคาขึ้น/ลง
- แนะนำราคาขาย
- สรุปกำไร
- จัดกลุ่มของควรขาย/ควรเก็บ
- ช่วยกรอก listing ตาม preset

ห้าม:

- Auto undercut ถี่
- Auto buy
- Auto flip
- ปั่นราคา
- ซื้อ legendary เอง
- ใช้เพชร
- Trade bot เต็มระบบ

Bundle:

- Plus + Market: 7 วัน 149 บาท / 30 วัน 399 บาท
- Pro + Market: 7 วัน 249 บาท / 30 วัน 699 บาท

---

# 6. Map Bible 1–10

## Arc 1: ผนึกโลกมนุษย์

Pacing:

- Map 1–2: เรียนระบบ / สดใส / meme เบา
- Map 3–4: mystery / secret
- Map 5–6: ผนึก / contested event
- Map 7–8: high reward / เขตสั่นพ้องรุนแรง
- Map 9–10: ต่างโลก / climax / เปิด cosmic arc

## Map 1 — ขอบเมืองมนุษย์

- Safe Type: Safe Field
- Boss: หมูป่าหม้อเดือด
- Material: เมือกดึ๋ง, หนังหมูพอง, ขนนกปุ๊
- Hook: ดึ๋งปุ๊เป็นเรื่องที่ชาวเมืองเห็นจนชิน

## Map 2 — ถนนชายไร่

- Safe Type: Safe Field
- Sub-zone: หมู่บ้านชายไร่
- Boss: หุ่นฟางผู้เฝ้าไร่
- Material: เห็ดสะดุ้ง, ฟางสั่นพ้อง, ดินไร่ชื้น
- Hook: พืชและสัตว์เริ่มผิดธรรมชาติ

## Map 3 — ทางป่าเก่า

- Safe Type: Safe Field
- Sub-zone: ค่ายพรานป่า
- Boss: ผู้เฝ้าทางที่ไม่มีชื่อ
- Material: หินไร้ตะไคร่, เศษรากเก่า, เปลือกไม้หม่น
- Hook: แผนที่ไม่ใช่ความจริงทั้งหมด

## Map 4 — ป่าจันทร์เงา

- Safe Type: Safe Field
- Sub-zone: ศาลาจันทร์หมอก
- Boss: นางไม้จันทร์ดับ
- Material: ผงจันทร์สะท้อน, น้ำค้างเงา, เห็ดฝันบาง
- Hook: เมืองหลักเคยมีเหตุการณ์ที่ถูกลบจากความทรงจำ

## Map 5 — ศาลร้าง

- Safe Type: Contested Event Zone
- Sub-zone: สำนักศาลร้าง
- Boss: ผู้เฝ้าศาลร้าว
- Event: ศาลร้างเปิดผนึก
- Material: เศษยันต์เก่า, น้ำตาผู้เฝ้าศาล, ด้ายผนึกขาด
- Hook: เมืองหลักถูกสร้างทับบางสิ่งไว้

## Map 6 — หุบรากลึก

- Safe Type: Contested Event Zone
- Sub-zone: ค่ายริมเหว
- Boss: รากแรกแห่งรอยแยก
- Event: รากลึกสั่นไหว
- Material: เลือดรากรอยแยก, เปลือกโพรงดำ, ฝุ่นใต้ผนึก
- Hook: ผนึกเหมือนสิ่งมีชีวิตที่กำลังเจ็บ

## Map 7 — เขตผลึกร้าว

- Safe Type: เขตสั่นพ้องรุนแรง
- Sub-zone: ชุมชนผลึก
- Boss: จ้าวผลึกบิดเบือน
- Event: ฝนผลึก
- Material: แกนผลึกบิดเบือน, เศษกระจกผนึก, ฝุ่นผลึกร้าว
- Hook: ผลึกคือเศษของระบบผนึกที่แตกออกมา

## Map 8 — ประตูเถ้าถ่าน

- Safe Type: เขตสั่นพ้องรุนแรง
- Sub-zone: ป้อมเถ้าถ่าน
- Boss: แม่ทัพเถ้าผนึก
- Event: ประตูเถ้าสั่นไหว
- Material: เถ้าประตูอสูร, โลหะไฟดำ, เศษธงไหม้
- Hook: มีคนเคยเปิดประตูนี้มาก่อน และอาจเป็นฝ่ายมนุษย์เอง

## Map 9 — ชายแดนต่างโลก

- Safe Type: เขตสั่นพ้องรุนแรง
- Sub-zone: จุดพักรอยแยก
- Boss: ผู้มาจากด้านที่ไม่มีชื่อ
- Event: คืนที่ไม่จบ
- Material: หัวใจรอยแยก, ผงเวลาขาด, เนื้อโลกบาง
- Hook: รอยแยกไม่ใช่ประตูไปที่อื่น แต่เป็นแผลของกฎโลก

## Map 10 — วิหารรอยแยก

- Safe Type: เขตสั่นพ้องรุนแรง + story instance
- Sub-zone: โถงวิหารไร้เสียง
- Boss: ผู้เฝ้าประตูสุดท้าย
- Event: ประตูสุดท้ายเปิด
- Material: เถ้าแห่งประตูสุดท้าย, เสี้ยววิหารไร้เสียง, แกนสุริยะร้าว
- Hook: ผนึกโลกมนุษย์เป็นแค่ชั้นแรก ฟ้ายังมีผนึกอีกชั้น

---

# 7. Boss / Monster / Raid

## Boss Design Rule

Boss ทุกตัวต้องมี:

1. รูปร่างจำง่าย
2. Mechanic ที่จำได้
3. Drop ที่มีค่า
4. Lore hook

Boss Tier:

- Field Boss
- Story Boss
- World Boss
- Guild Boss
- Raid Boss
- Secret Boss

World Boss ตัวแรกที่ควรใช้:

> **รากแรกแห่งรอยแยก**

Drop:
- เลือดรากรอยแยก
- เศษแกร่ง
- กล่องผนึก
- Legendary material
- โอกาสต่ำมากได้ **แกร่ง**

## Monster Family

ตระกูลหลัก 7 กลุ่ม:

1. ดึ๋งปุ๊ Mutant
2. Forest / Root Creature
3. Spirit / Shrine Entity
4. Crystal Corrupted
5. Ashen Army
6. Otherworld Entity
7. Celestial Entity

## Raid

Raid Type:

- 6-player Raid
- Guild Raid
- Celestial Raid

Raid Rule:

- First clear ต้องเล่นเอง
- Bot ไม่เล่นแทน
- Auto Pilot พาไป entrance/เตรียมของได้
- Mechanic สำคัญต้อง active

Raid Reward:

- ตราสั่นพ้อง
- Legendary material
- เศษแกร่ง
- โอกาสได้แกร่ง
- Cosmetic
- Hall of Fame record
- Weekly title

---

# 8. Class / Skill Tree / Legendary

## Class เริ่มต้น 5 อาชีพ

1. นักดาบ
2. นักหอก
3. นักธนู
4. นักเวท
5. นักอาคม / ผู้ผนึก

นินจาเก็บไว้ patch อนาคต

## Skill Tree Rule

ทุกอาชีพมี 3 branch:

1. Solo / Farming
2. Party / Boss
3. Utility / Unique Mechanic

## Legendary Rule

Legendary ทุกชิ้นมี 5 ขั้น:

1. เศษตำนาน
2. อาวุธหลับใหล
3. อาวุธตื่น
4. อาวุธสั่นพ้อง
5. อาวุธผนึกฟ้า / cosmic tier

Legendary ต่ออาชีพ:

- นักดาบ: ดาบผนึกฟ้า
- นักหอก: หอกมังกรร้าว
- นักธนู: ธนูจันทร์สั่นพ้อง
- นักเวท: คทาสุริยะร้าว
- นักอาคม: ยันต์ผนึกวิหาร

---

# 9. Main Story Chapter 1–10

1. **นักล่าฝึกใหม่** — ผู้เล่นเข้ากิลด์นักล่าและเห็นดึ๋งปุ๊เป็นงานเล็ก
2. **ไร่ที่หัวเราะไม่ออก** — เรื่องขำเริ่มเดือดร้อนชาวบ้าน
3. **ทางที่แผนที่ไม่รู้จัก** — secret layer เริ่มเปิด
4. **ความทรงจำใต้แสงจันทร์** — เมืองหลักมีอดีตที่ถูกลบ
5. **ศาลที่ไม่ควรถูกทิ้ง** — ผนึกถูกเปิดเผย
6. **รากใต้เมือง** — ผนึกเหมือนระบบมีชีวิต
7. **เศษระบบที่แตก** — ผลึกคือเศษผนึกและเริ่มเกิดการแย่งทรัพยากร
8. **ประตูที่มนุษย์เปิดเอง** — มนุษย์ไม่ใช่เหยื่อทั้งหมด
9. **โลกที่กฎเริ่มพัง** — เวลา ความทรงจำ และตัวตนเริ่มเพี้ยน
10. **ผู้เฝ้าประตูสุดท้าย** — จบ Arc 1 และเปิด Arc 2

---

# 10. Secret Quest Layer

Secret Quest ไม่ใช้ marker ตรงตั้งแต่ต้น  
เริ่มจาก clue, rumor, item, NPC, หรือพฤติกรรมแปลกของโลก

Source:

- ลุงดึ๋ง
- ป้าปุ๊
- Item แปลก
- ข่าวลือ
- NPC ที่ไม่เด่น
- พื้นที่ผิดธรรมชาติ
- คำอธิบาย item
- Weekly condition
- Hall of Fame announcement บางประโยค
- บันทึกวีรกรรมเก่า

ประเภท Secret:

1. Hidden Route
2. Hidden NPC
3. Hidden Boss
4. Hidden Recipe
5. Hidden Trade
6. Hidden Lore
7. Hidden Class Hint
8. Hidden Hall Record

Auto Pilot กับ Secret ใช้ข้อความเช่น:

> “ร่องรอยขาดหายก่อนถึงจุดหมาย เหลือเพียงข่าวลือจากคนในเมือง”

---

# 11. Economy / Currency / Backoffice

## Currency

มี 3 สกุลหลัก:

1. **ทอง** — เงินหลัก
2. **ตราสั่นพ้อง** — endgame currency
3. **เพชร** — premium currency

Bot / Auto Pilot / Market Helper ห้ามใช้เพชรเองเด็ดขาด

## Economy Loop

> ฟาร์ม → ขาย/ใช้ → ตีบวก/คราฟ → ลุ้น/ขิง → ใช้ material เพิ่ม → ตลาดหมุน

## Sink Priority

1. Enhancement
2. Craft/Repair
3. Market tax/listing
4. Guild donation
5. Wandering Merchant exchange
6. City contribution
7. Cosmetic/gold gacha

## Backoffice

Backoffice ต้องเป็น:

> Alert → Evidence → Trend → Recommendation → Staff Decision

หน้าหลัก:

- Economy Dashboard
- Item Monitor
- Bot Output Monitor
- Merchant/Event Control
- Enhancement Monitor
- Alert Center
- Audit Log

Alert สำคัญ:

- Gold inflation
- Item flood
- Value collapse
- Price manipulation
- Bot output spike
- Rare item concentration
- แกร่ง supply สูงผิดปกติ
- อุปกรณ์ + สูงเพิ่มเร็วผิดปกติ

---

# 12. Enhancement & Forge

## Core Rule

- อุปกรณ์ตีบวกได้
- อุปกรณ์ไม่แตก
- ช่วงต้นตีง่าย
- ช่วงสูงล้มเหลวมีโอกาส -1
- มีสถานะ **รอยร้าว** แทนของแตก
- รอยร้าวต้องซ่อมก่อนตีต่อ
- ใช้ทอง + material + item เฉพาะเป็น sink
- ตีสำเร็จระดับสูงมี announcement
- อุปกรณ์ + สูงเข้า Hall of Fame ได้

## Success Rate Draft

| ระดับเป้าหมาย | Success Rate |
|---|---:|
| +1 | 100% |
| +2 | 95% |
| +3 | 90% |
| +4 | 85% |
| +5 | 80% |
| +6 | 70% |
| +7 | 60% |
| +8 | 50% |
| +9 | 40% |
| +10 | 30% |
| +11 | 22% |
| +12 | 15% |
| +13 | 10% |
| +14 | 7% |
| +15 | 5% |

## Failure Result

| ช่วง | ผลล้มเหลว |
|---|---|
| +1 ถึง +5 | ไม่ลด ไม่ร้าว |
| +6 ถึง +9 | ไม่ลด แต่เสีย material |
| +10 ถึง +12 | มีโอกาส -1 หรือร้าว |
| +13 ถึง +15 | มีโอกาส -1 สูง และร้าวได้ |

## Item ตีบวก

### แกร่ง

Item ลับที่ทำให้อุปกรณ์ +1 แบบ 100%

กฎ:

- +1 แบบ 100%
- ไม่แตก
- ไม่ลดขั้น
- ไม่เกิดรอยร้าว
- ใช้กับอุปกรณ์ที่ตีบวกได้
- ต้อง confirm
- Bot/Auto Pilot ห้ามใช้เอง
- ไม่ขายตรงด้วยเพชร

แหล่งที่มา:

- World Boss
- Endgame Event
- Raid
- Rift Tower ชั้นสูง
- Celestial Raid
- Weekly Hall of Fame บางหมวด
- Server-wide contribution event

### เศษแกร่ง

> **เศษแกร่ง 5 ชิ้น → แกร่ง 1 ชิ้น**

### Item เสริมอื่น

- ผงคงรูป: กันลดขั้น
- น้ำยาประสานรอย: ซ่อมรอยร้าว
- หินเพิ่มโอกาส: เพิ่ม chance เล็กน้อย
- เศษเตาหลอม: ได้จากการตีล้มเหลว/ย่อยของ ใช้แลกของตีบวก

---

# 13. Hall of Fame

ระบบนี้ทำให้ผู้เล่นรู้สึกว่า:

> สิ่งที่กูทำสำเร็จ มันมีคนเห็น

## โครงระบบ

1. World Announcement
2. Announcement Feed / ข่าวนักล่า
3. Weekly Hall of Fame
4. Eternal Hall of Fame

## Weekly Category

สายหลัก:

- สายตีบวก
- สายบอส
- สายตลาด
- สายฟาร์ม
- สายกิลด์
- สาย Secret
- สาย Combat Juice

## Reward

ผู้ชนะ weekly ได้:

- ฉายา 7 วัน
- Buff utility เล็ก ๆ
- Cosmetic / aura / badge
- รูปปั้นหรือธงในเมือง 1 สัปดาห์
- Voucher / token / กล่องวัตถุดิบ

Reward Guardrail:

- ไม่ให้ damage แรง
- ไม่ให้ rare drop rate สูง
- ไม่ให้ PvP stat
- ไม่ให้ enhancement success rate ตรง ๆ
- ไม่ให้ buff snowball

## ตัวอย่างหมวด Combat Juice

- กวาดมอนมากสุดใน 1 สกิล
- Damage สูงสุดใน hit เดียว
- Critical สูงสุดประจำสัปดาห์
- Ultimate Kill Count สูงสุด
- Boss Break เร็วสุด
- Wave Clear เร็วสุด
- Solo Horde Clear
- Party Combo สูงสุด

---

# 14. PvP / Zone Rule

Zone มี 5 ประเภท:

1. Safe Zone
2. Safe Field
3. Contested Event Zone
4. เขตสั่นพ้องรุนแรง / Risk Zone
5. Arena / War Instance

## Safe Zone

เมือง / ค่าย / จุดพัก  
ปลอดภัย 100%

## Safe Field

ฟาร์มได้ ไม่มี PvP  
เช่น Map 1–4

## Contested Event Zone

ปกติปลอดภัย แต่ event บางช่วงแข่งขันได้  
เช่น Map 5–6

## เขตสั่นพ้องรุนแรง

High reward มีโอกาสปะทะ  
เช่น Map 7–10

ตายแล้ว:

- ไม่เสียของ
- ไม่เสียทอง
- ไม่เสีย material
- ไม่เสีย durability
- ไม่เสีย exp
- ไม่โดนปล้น

ผู้ชนะได้ reward จากระบบ ไม่ได้ปล้นจากผู้แพ้

## Arena / War

PvP สมัครใจเต็มรูปแบบ  
Bot ไม่เล่นแทน  
Auto Pilot พาไปลงทะเบียนได้เท่านั้น

---

# 15. Guild / Rift War

## Guild War Phase 1

- 12v12 หรือ 18v18
- Objective-based
- ยึดเสา
- ป้องกันธง
- ทำลายผนึก
- ไม่มีเสียของ
- ได้ guild point/ranking/cosmetic

## Rift War Phase 2

- หลาย guild แข่งกันปิด/เปิดรอยแยก
- PvPvE
- มีมอนจากรอยแยก
- Reward เป็น guild banner, title, material, access bonus

Guardrails:

- Bot ไม่เล่นแทน
- Auto Pilot พาไปลงทะเบียนได้เท่านั้น
- ผู้แพ้ไม่เสียทรัพย์สิน
- Reward ไม่ทำให้กิลด์ชนะแล้ว snowball เกินไป

---

# 16. Celestial Arc / Gods

## Arc 2 — วงโคจรเทพดารา / Map 11–15

- บันไดฟ้าสั่นพ้อง
- ทุ่งเศษดาวตก
- วิหารจันทราเงียบ
- สนามรบอังคารอส
- วงแหวนเสาร์นิล

## Arc 3 — สงครามเทพผู้คุมผนึก / Map 16–20

- สวนศุกริน
- มหาน้ำหนักพฤหัสบดีน
- ทะเลดาราวารุณเนป
- พายุฟ้ายูเรนอส
- ศาลพิพากษาสุริยันต์

## Arc 4 — ต้นกำเนิดดึ๋งปุ๊ / Map 21–25

- ห้องกำเนิดเสียงแรก
- เมืองที่ไม่เคยมีอยู่
- รังของผู้ไร้วงโคจร
- วิหารนอกเวลา
- ประตูที่ไม่มีด้านกลับ

## เทพดาว 8 องค์

1. สุริยันต์ — แสง / การพิพากษา / ความจริง
2. จันทรา — ความทรงจำ / เงา / อดีต
3. อังคารอส — สงคราม / เลือด / การเอาตัวรอด
4. ศุกริน — ความปรารถนา / เสน่ห์ / พันธนาการ
5. พฤหัสบดีน — แรงโน้มถ่วง / ภาระ / คำสัญญา
6. เสาร์นิล — วงแหวน / เวลา / การผูกมัด
7. วารุณเนป — ทะเลดารา / โลกที่หายไป / ความลึก
8. ยูเรนอสฟ้า — พายุ / การเปลี่ยนแปลง / ความปั่นป่วน

---

# 17. Combat Juice & Skill Impact Layer

หัวข้อนี้คือ final add-on ก่อนปิดการขึ้นโปรเจกต์

## 17.1 Core Feeling

ฟีลหลักของ combat:

> กดสกิลแล้วรู้สึกว่าแรงจริง มอนกลุ่มใหญ่โดนกวาด ดาเมจเด้งเต็มจอ แต่ยังอ่านเกมออก

เป้าหมาย:

- มอนมาเป็นฝูง
- สกิลกวาดเป็นกลุ่ม
- Damage number เด้งจุใจ
- Critical ใหญ่ชัด
- มอนกระเด็น/ชะงัก/แตก/ละลาย
- Loot เด้ง
- เสียง impact หนัก
- จบแล้วรู้สึกสะใจ

---

## 17.2 Mob Pack Size

Normal Farming Pack:

- ต้นเกม: 5–8 ตัว
- กลางเกม: 8–15 ตัว
- ท้ายเกม / เขตสั่นพ้องรุนแรง: 15–30 ตัว
- Event / Horde: 30–60 ตัวต่อ wave

แยกชัด:

- มอนปกติ: เยอะ ฆ่าสะใจ
- Elite: น้อยกว่า แต่มี mechanic
- Boss: ไม่เน้นจำนวน แต่เน้น pattern

---

## 17.3 Damage Number

Damage number มีระดับ:

- Normal Hit
- Critical Hit
- Multi-hit
- Overkill
- Boss Break

คำพิเศษที่ใช้ได้:

- แตก!
- ทะลวง!
- สลาย!
- ปิดฉาก!
- BREAK
- ผนึกแตก
- เกราะร้าว
- ช่องโหว่เปิดแล้ว

Setting ที่ต้องมี:

- Full
- Compact
- Critical Only
- Total Damage
- Off

---

## 17.4 Hit Impact

ทุกสกิลควรมี:

1. Anticipation — ท่าเตรียมสั้น ๆ
2. Impact — จังหวะโดนหนัก
3. Reaction — มอนชะงัก/กระเด็น/แตก/ถอย
4. Sound — เสียงแน่น
5. After-effect — รอยพื้น แสง ฝุ่น เศษผลึก เถ้า ควัน

---

## 17.5 Hit Stop / Screen Shake / Camera

Hit Stop ใช้กับ:

- Critical
- Ultimate
- Boss break
- ตีบวกสำเร็จ
- ใช้แกร่ง
- Kill boss

Screen Shake ใช้กับ:

- Ultimate
- Boss attack
- World boss death
- ตีบวก +12/+15 สำเร็จ
- แกร่งสำเร็จ
- Hall of Fame moment

ต้องมี setting ปิดได้

Camera Punch / Zoom:

- ใช้กับ ultimate
- สั้น
- ไม่ cinematic นานเกินไป

---

## 17.6 Skill Identity รายอาชีพ

### นักดาบ

ฟีล:

> หนัก แน่น ฟันกว้าง กวาดทั้งแถวด้วยดาบเดียว

ตัวอย่างสกิล:
- คลื่นดาบราชันย์
- ดาบกางอาณาเขต
- ดาบสุริยะผ่าเมือง

### นักหอก

ฟีล:

> ทะลวง ยาว กระแทกเป็นแนว เสียบทะลุทั้งฝูง

ตัวอย่างสกิล:
- แทงทะลุแนว
- หอกปักตรึง
- มังกรดินแหวกผนึก

### นักธนู

ฟีล:

> เร็ว ถี่ เลขเด้งรัว สะใจสายยิงเร็ว

ตัวอย่างสกิล:
- ฝนศรจันทร์
- ศรตราเป้า
- ยิงจุดตาย

### นักเวท

ฟีล:

> ระเบิดจอ ล้างฝูง กดทีเดียวมอนทั้งกองหาย

ตัวอย่างสกิล:
- พายุผลึก
- ระเบิดมนตรา
- เปิดฟ้ารอยแยก

### นักอาคม / ผู้ผนึก

ฟีล:

> คุมวง แตกเป็นจังหวะ คุมมอนทั้งกองแล้วระเบิดทีเดียว

ตัวอย่างสกิล:
- ยันต์ชะงัก
- ผนึกเงา
- วงอาคมไร้เสียง

---

## 17.7 Ultimate / Awakening Skill

ทุกอาชีพมีปุ่มใหญ่ที่เป็น moment

เงื่อนไข:
- ชาร์จจากการต่อสู้
- ใช้ไม่ถี่เกิน
- Effect ใหญ่
- Damage ใหญ่
- Sound เฉพาะ
- Animation สั้นแต่เท่
- ถ้า kill มอนเยอะขึ้น text พิเศษ

ตัวอย่าง Ultimate:

- นักดาบ: ดาบผนึกฟ้า — ฟันเปิดฟ้า
- นักหอก: มังกรร้าวทะลวงโลก
- นักธนู: ฝนศรดาราดับจันทร์
- นักเวท: สุริยะร้าวถล่มผนึก
- นักอาคม: วงผนึกวิหารไร้เสียง

Ultimate ต้องเป็นโมเมนต์ที่ผู้เล่นอยากอัดคลิป

---

## 17.8 Horde Event / Wave Farming

Event เพื่อโชว์สกิล AoE และมอนกลุ่มใหญ่:

### ปุ๊แตกทั่วหล้า

มอนดึ๋งปุ๊ออกเป็น wave  
เหมาะกับ AoE farming / ranking / material farm

### ฝนผลึก

Map 7 เกิดผลึกจำนวนมาก  
มอนผลึก spawn เป็นกลุ่มใหญ่

### คืนวิญญาณ

Map 4–5 วิญญาณออกเยอะ  
นักอาคม/นักเวทเด่น

### รากลึกสั่นไหว

Map 6 มอนรากขึ้นจากพื้นเป็น wave  
party ต้องกวาดและตี core

Reward:
- Material จำนวนมาก
- Ranking contribution
- Hall of Fame weekly category
- เศษแกร่งจาก wave boss
- Token event

---

## 17.9 Bot Skill Logic

Bot ใช้สกิลได้ แต่ต้องมี profile:

- ประหยัดมานา
- ล้างฝูงเร็ว
- เน้น elite
- เน้น rare
- หยุดใช้ ultimate ถ้าไม่มีมอนเกิน X ตัว
- ใช้ ultimate เมื่อเจอ elite/boss เท่านั้น
- ไม่ใช้ item สำคัญเอง

Pro Bot ควรตั้ง logic ได้ เช่น:

> ใช้ ultimate เมื่อมีมอนอย่างน้อย 12 ตัวในระยะ  
> ใช้สกิล AoE เมื่อมอนเกิน 6 ตัว  
> เก็บ single target skill ไว้ใช้กับ elite

---

## 17.10 Performance Guardrails

ต้องมี Effect Quality:

- Low
- Medium
- High
- Cinematic

Damage Number Mode:

- Full
- Compact
- Critical Only
- Total Damage
- Off

Mob Display Optimization:

- รวม damage number เป็นก้อนเมื่อมอนเยอะ
- ลด particle ที่ไกลจอ
- death animation แบบสั้น
- ลด effect ผู้เล่นคนอื่น
- boss telegraph ต้องชัดเสมอ

Rule:

> ความซะใจห้ามทำให้เกมอ่านไม่ออก

Boss telegraph, danger zone, HP, objective ต้องชัดกว่า effect เสมอ

---

## 17.11 Sound Design

เสียงต้องมี hierarchy:

- Hit ปกติ
- Critical
- Elite hit
- Boss break
- Ultimate
- World event
- Legendary/enhancement moment

เสียงที่ควรมี:

- เสียงฟันหนัก
- เสียงแทงทะลุ
- เสียงเวทระเบิด
- เสียง critical
- เสียง shield break
- เสียงมอนแตก
- เสียง loot drop
- เสียงตีบวกสำเร็จ
- เสียงใช้แกร่ง
- เสียง Hall of Fame announcement

---

## 17.12 Loot Explosion

หลังมอนกลุ่มใหญ่ตายต้องฟินต่อ:

- ของเด้งออกมา
- material stack รวมตัวเข้ากระเป๋า
- rare drop มีแสงแยก
- legendary/material สำคัญมีเสียงเฉพาะ
- bot/report สรุปว่ารอบนี้ได้อะไร

Rare Drop Moment:

- มีแสงเฉพาะ
- มี sound
- ขึ้น toast
- ระดับสูงขึ้น guild/server announcement
- เข้า report
- อาจเข้า Hall of Fame

---

## 17.13 Skill + Enhancement Visual Link

อาวุธตีบวกส่งผลกับ visual ของ skill:

### +7

- มีแสงบาง ๆ ที่ trail

### +10

- skill trail ชัดขึ้น
- critical effect สวยขึ้น

### +12

- สกิลบางอันมีประกายเฉพาะอาวุธ
- เข้า announcement ได้

### +15

- Ultimate มี visual พิเศษ
- Hall of Fame moment
- aura อาวุธชัดเจน

ใช้แกร่งกับของระดับสูง:

- Effect การตีบวกขลัง
- เสียงแตกต่าง
- แสงผนึกลอยขึ้น
- ประกาศในเมือง
- อาวุธมี aura พิเศษช่วงสั้น ๆ

---

## 17.14 Damage Number / Skill Cosmetic

ขายได้โดยไม่ P2W:

- สี/สไตล์ damage number
- Critical font effect
- Kill effect
- Skill trail skin
- Aura ตอนใช้ ultimate
- Recall/return effect
- Profile combat badge

Guardrail:

- ห้ามบัง telegraph
- ห้ามทำให้ PvP อ่านยาก
- ห้ามทำให้ damage ดูหลอกว่ามากขึ้น
- ห้ามรำคาญผู้เล่นอื่นเกิน

ใน PvP ควร normalize effect หรือให้คู่ต่อสู้เห็นแบบลดทอน

---

# 18. Final Suggestions Locked

## 18.1 Combat ต้องมี 3 ชั้นความมัน

### ชั้น 1: มือใหม่ก็สะใจ

สกิลต้นเกมต้องกวาดมอนได้  
ไม่ต้องรอ endgame ถึงสนุก

### ชั้น 2: คนเล่นเก่งยิ่งสะใจ

จัดตำแหน่งดี รวบมอนดี ใช้ combo ดี  
เห็น damage เยอะกว่า clear ไวกว่า

### ชั้น 3: Endgame ต้องอัดคลิปได้

Ultimate, +15 weapon, แกร่ง, world boss, raid break  
ต้องเป็นโมเมนต์ที่แชร์ได้

---

## 18.2 สกิลแรงแต่ combat ต้องไม่แบน

สกิลต้องแรง แต่ยังมี decision:

- ใช้ AoE ตอนไหน
- เก็บ ultimate ไว้เจอ elite ไหม
- รวมมอนก่อนค่อยกดไหม
- ใช้ single target กับ boss
- ใช้ cleanse/cc ตอน mechanic
- ใช้ bot profile แบบไหน

---

## 18.3 Endgame Build ต้องมีเป้าหมายเลขสวย

Build ที่ควรมี:

- Critical build
- AoE build
- Boss break build
- Farming build
- Rare hunt build
- Ultimate burst build

แต่ไม่ใช่ทุกอย่างไปทาง damage อย่างเดียว  
บาง build ขิงจาก clear speed / support / contribution / market / secret ได้ด้วย

---

## 18.4 Monster ต้องตายสวย

Death feedback:

- สไลม์แตกเป็นเมือก
- เห็ดสะดุ้งเด้งแล้วปุ๊
- ผลึกแตกเป็นเศษ
- เถ้าสลายเป็นควัน
- วิญญาณลอยหาย
- Otherworld บิดตัวแล้วหายไป

---

## 18.5 Boss Telegraph สำคัญกว่า Effect

Rule:

> Boss telegraph สำคัญกว่า effect ผู้เล่นเสมอ

สีพื้น danger zone / cast bar / icon ต้องชัด  
effect ผู้เล่นต้อง fade หรืออยู่ชั้นล่างกว่าในจังหวะ boss attack

---

## 18.6 Prototype ต้อง Test Combat Feel ตั้งแต่แรก

Prototype scene ควรมี:

- มอน 20 ตัว
- สกิล AoE 3 แบบ
- Damage number
- Hit stop
- Screen shake
- Loot drop
- Performance mode

เพราะ combat feel คือความมันหลักของเกม

---

# 19. Final Locked Decisions

1. เกมเป็น 2.5D Web MMORPG
2. มุมกล้องเป็น True 2D Isometric Pixel Art / diamond grid / fixed camera
3. Style เป็น Stylized Asian Fantasy with Thai touch
4. ผู้เล่นเริ่มเกมที่เมืองหลัก
5. เมืองหลักชื่อ **นครอรุณผนึก**
6. UI/System หลักไม่ใช้คำดึ๋ง/ปุ๊พร่ำเพรื่อ
7. ลุงดึ๋ง/ป้าปุ๊เป็น secret hint NPC
8. Bot + Auto Pilot + Report รวมเป็นระบบผู้ช่วยนักล่า
9. Free มี Bot/Auto Pilot/Report พื้นฐานถาวร
10. Paid Assistant ไม่ถาวร เป็น pass/hour pack
11. Pro Bot ทำงาน 12 ชั่วโมงต่อรอบ
12. Pro มี Goal Chain 3 ขั้น
13. Market Helper เป็น paid-only feature แยก ไม่ใช่ trade bot
14. Currency หลักมี ทอง / ตราสั่นพ้อง / เพชร
15. Bot/Auto Pilot/Market Helper ห้ามใช้เพชรเอง
16. Party size = 6
17. Class เริ่มต้น = 5 อาชีพ
18. นินจาเป็น patch อนาคต
19. Map 1–10 = Arc 1 ผนึกโลกมนุษย์
20. Map 11–25 = Cosmic / Celestial Arc
21. PvP / Risk Zone ไม่มีการทำโทษผู้เล่น
22. ตายจาก PvP ไม่เสียของ เงิน exp durability หรือ material
23. Reward ผู้ชนะมาจากระบบ ไม่ได้ปล้นจากผู้แพ้
24. Risk Zone ฝั่งผู้เล่นใช้คำว่า เขตสั่นพ้องรุนแรง / เขตพิพาท
25. Bot เข้าเขตสั่นพ้องรุนแรงได้เฉพาะ opt-in
26. Arena/War เป็น PvP สมัครใจเต็มรูปแบบ
27. ระบบตีบวกไม่ทำให้อุปกรณ์แตก
28. ช่วงสูงล้มเหลวมีโอกาส -1
29. มีรอยร้าวแทนของแตก
30. มี item ลับ **แกร่ง** สำหรับ +1 แบบ 100%
31. เศษแกร่ง 5 ชิ้นแลกแกร่ง 1 ชิ้น
32. แกร่งไม่ขายตรงด้วยเพชร
33. Hall of Fame เป็นระบบขิงหลักของเกม
34. Weekly Hall of Fame ให้ฉายา 7 วัน + buff utility เล็ก ๆ + cosmetic/showcase
35. Eternal Hall of Fame จารึกความสำเร็จถาวร
36. Combat ต้องแรง สะใจ เหมาะกับมอนกลุ่มใหญ่
37. Damage number ต้องเด้งจุใจ แต่มี setting ลดได้
38. Ultimate ต้องเป็นโมเมนต์ที่อยากอัดคลิป
39. อาวุธตีบวกสูงทำให้ skill visual เท่ขึ้น
40. Boss telegraph สำคัญกว่า effect ผู้เล่นเสมอ
41. Cosmetic skill/damage effect ขายได้แต่ห้าม P2W หรือทำให้เกมอ่านยาก

---

# 20. Work Closure Status

## งาน Design Setup ที่ปิดแล้ว

- High Concept
- Tone
- World / Lore Layer
- Main City
- Player Flow
- Tutorial
- UI Direction
- Hunter Assistant
- Bot / Auto Pilot / Report
- Pricing / Monetization
- Market Helper
- Economy Loop
- Economy Backoffice
- Wandering Merchant
- Map Bible 1–10
- Boss Bible
- Monster Family
- Class Bible
- Skill Tree Direction
- Legendary Path
- Main Story 1–10
- Secret Quest Layer
- PvP / Zone Rule
- Guild / Party / Social
- Guild War / Rift War
- Raid Design
- Celestial Arc
- Celestial Gods
- Enhancement & Forge
- แกร่ง / เศษแกร่ง
- Hall of Fame
- Combat Juice & Skill Impact
- Final Suggestions

## สถานะงานค้าง

> **ไม่มีงาน design setup ค้างในรอบนี้**

สิ่งที่เหลือหลังจากนี้ไม่ใช่งานค้าง แต่เป็นงานคนละ phase ได้แก่:

- Production planning
- Technical architecture
- Prototype
- Art direction board
- UI mockup
- Balance simulation
- Content writing ราย quest
- Implementation spec

---

# 21. Final Project Summary

ดึ๋งปุ๊ตอนนี้ถูกปิดเป็นโปรเจกต์ design รอบแรกด้วยภาพรวมชัดเจน:

> เกม 2.5D Web MMORPG ที่มีเมืองหลักเป็น live hub, มีบอทช่วยเล่นอย่างถูกระบบ, มี market/economy จริง, มีตีบวกและ Hall of Fame ให้ขิง, มีมอนกลุ่มใหญ่ให้กวาดด้วยสกิลแรงสะใจ, มี weekly liveops, มี secret/lore ให้ community ขุด, และมี roadmap ยาวไปถึง cosmic arc

แกนความสนุกครบ:

- Core gameplay loop
- Farming loop
- Bot loop
- Economy loop
- Market loop
- Enhancement loop
- Social flex loop
- Weekly loop
- Secret exploration loop
- Endgame raid loop
- Story/cosmic loop
- Monetization loop

คำจำกัดความสุดท้าย:

> **ดึ๋งปุ๊ = MMORPG ฟาร์มสะใจ บอทถูกระบบ ตลาดมีชีวิต ตีบวกมีเรื่องขิง โลกมีความลับ และท้ายเกมยกระดับจากมุกชาวบ้านไปถึงผนึกจักรวาล**
---

# 22. Audio Direction & Soundscape Layer

> สถานะ: **Final Audio Add-on ที่ผ่านแล้ว**  
> เป้าหมาย: ทำให้ดึ๋งปุ๊มีเสียงที่จำได้ ฟังวนได้นาน ไม่ล้า และรองรับทุก moment สำคัญของเกม

## 22.1 Audio Philosophy

เสียงของ **ดึ๋งปุ๊** ต้องทำ 4 อย่างพร้อมกัน:

1. ทำให้เมืองและโลกมีชีวิต
2. ทำให้ combat / skill / loot / enhancement สะใจ
3. ทำให้ boss / raid / celestial content ตื่นเต้นและขลัง
4. ทำให้ผู้เล่นจำ identity ของเกมได้โดยไม่รำคาญเมื่อต้องฟังวน

แนวทางจาก music brief:

- เพลงต้องมี **thematic identity** ไม่ใช่แค่ catchy แบบ pop hook
- ใช้ motif สั้น 2–4 note เพื่อให้จำได้
- เพลงฉากปกติต้อง loop-tolerant ฟังได้นาน
- อย่าย้ำ motif ถี่เกิน
- มี micro-variation ใน loop เช่น เปลี่ยน harmony / layer / rhythm เล็กน้อย
- dynamic ต้องไม่ดังแน่นตลอด
- boss / climax สามารถใช้ hook และ dynamic แรงขึ้นได้
- เพลงพื้นหลังระยะยาวต้องเน้นความสบายในการฟังซ้ำ

---

# 23. Signature Motif — ดึ๋งปุ๊ Motif

เกมควรมี motif หลักชื่อ:

> **ดึ๋งปุ๊ Motif**

รูปทรงเสียง:

> **ดึ๋ง** = note สั้น เด้งขึ้น  
> **ปุ๊วว** = note ยาว ไหลลง มีหางเสียง / reverb

ภาพเสียง:

> ติ๊ง↑ … ปุ๊ววว↓  
> หรือ  
> ดึ๋ง! … ปุ๊ววว~

การใช้งาน:

- เมืองหลัก: เล่นด้วยขลุ่ย / ระนาดเล็ก / pluck แบบอบอุ่น
- Map ต้นเกม: เล่นแบบเด้ง ๆ ขำเล็ก ๆ
- ป่า / ศาล: เล่นช้าลง เหมือนกระดิ่ง / ลม
- รอยแยก: เล่นกลับหลังหรือ pitch เพี้ยน
- Celestial Arc: เล่นเป็นระฆังใหญ่ / choir / cosmic pad
- Player death: ใช้เป็น stinger “ดึ๋ง…ปุ๊ววว~”

หลักสำคัญ:

> Motif ต้องจำได้ แต่ไม่ควรถูกย้ำถี่จนล้า

---

# 24. Player Death Audio — ดึ๋งปุ๊วว

เสียงตอนตัวละครตายให้ใช้ signature:

> **ดึ๋ง… ปุ๊ววว~**

## 24.1 Player Death ปกติ

ฟีล:

- ไม่โหด
- ไม่ทำร้ายใจ
- ตลกนิด ๆ
- จำง่าย
- สั้นประมาณ 1.0–1.4 วินาที

เครื่องเสียง:

- mallet / ระนาดแก้วนุ่ม ๆ สำหรับ “ดึ๋ง”
- low slide / woodwind / synth นุ่มสำหรับ “ปุ๊ววว”
- puff เบา ๆ ตอนท้าย

ใช้กับ:

- ตายจากมอนทั่วไป
- ตายใน Safe Field
- ตายใน event เบา ๆ

## 24.2 Death ในเขตสั่นพ้องรุนแรง

ใช้ motif เดิม แต่เข้มขึ้น:

> **ดึ๋ง… ปุ๊ววว…**

ฟีล:

- ไม่ล้อเลียนเกินไป
- มี reverb ต่ำ
- “ปุ๊วว” ยาวและมืดกว่า
- เหมือนถูกแรงรอยแยกดึงกลับ safe camp

## 24.3 Party Wipe / Raid Wipe

ใช้ version ขลัง:

> ระฆังต่ำ “ดึ๋ง” → ลมรอยแยก “ปุ๊ววว” → silence สั้น

ฟีล:

- serious กว่า death ปกติ
- ยังมี identity ดึ๋งปุ๊
- ไม่ทำให้ raid moment เสียความขลัง

## 24.4 Monster Death

มอนธรรมดาไม่ใช้ “ดึ๋งปุ๊วว” ทุกตัว เพราะจะรก

ใช้เฉพาะมอน meme / ต้นเกม:

- สไลม์ตาย: “ปุ๊!”
- เห็ดสะดุ้งตาย: “ดึ๋ง-ปุ๊!”
- หมูป่าพองแตก: “ปุ๊ฟ!”

Boss death:

- ไม่ใช้ version ตลกตรง ๆ
- ใช้ motif แบบซ่อนในระฆัง / choir / orchestration ช้า ๆ

---

# 25. Music System

เพลงของเกมใช้ระบบ layered / adaptive music

## 25.1 Layer หลัก

แต่ละ map ควรรองรับ:

1. **Explore Layer** — เดินปกติ
2. **Combat Layer** — เริ่มสู้มอน
3. **Danger Layer** — elite / risk / event
4. **Boss Layer** — boss เฉพาะ
5. **Victory / Clear Sting** — จบเหตุการณ์

## 25.2 Loop Rule

เพลง map ปกติควร:

- loop ได้ 3–5 นาทีต่อรอบ
- มี micro-variation 2–4 ช่วงก่อนกลับ loop
- ไม่ใช้ hook ถี่เกิน
- loop seam ต้องเนียน
- dynamic ไม่อัดแน่นตลอด
- ฟังได้ 10+ นาทีโดยไม่ล้า

เพลง boss / climax:

- ใช้ hook แรงขึ้นได้
- dynamic ใหญ่ขึ้นได้
- มี phase transition ได้
- final phase ต้องตื่นเต้น

---

# 26. Core Theme Tracks

## 26.1 Main Menu Theme — เสียงแรกแห่งดึ๋งปุ๊

ฟีล:

- อบอุ่น
- มีความลับ
- จำได้ใน 3 วินาที
- ไม่ epic เกินตั้งแต่หน้าแรก

เครื่องดนตรี:

- ขลุ่ย
- ระนาดแก้วเบา ๆ
- pad fantasy
- เครื่องสายเอเชีย
- ระฆังเล็ก

Motif:

- เปิดด้วยดึ๋งปุ๊ Motif แบบนุ่ม
- รอบท้ายแทรกเสียงต่ำของรอยแยกเบา ๆ

## 26.2 Character Select Theme — เส้นทางนักล่า

ฟีล:

- นักล่ากำลังเลือกเส้นทาง
- สว่างกว่า main menu
- มี pulse เบา ๆ

Layer ตามอาชีพ:

- นักดาบ: เครื่องสายต่ำ / กลองเบา
- นักหอก: กลองแนวเดินทัพ
- นักธนู: pluck เร็ว
- นักเวท: pad / ระยิบระยับ
- นักอาคม: กระดิ่ง / whisper

---

# 27. Main City Audio — นครอรุณผนึก

เมืองหลักต้องมี theme ที่จำได้ที่สุด เพราะผู้เล่นกลับมาบ่อย

## 27.1 Main City Theme — นครอรุณผนึก

ฟีล:

- อบอุ่น
- เป็นบ้าน
- มีชีวิต
- มีตลาด
- ไม่ล้า
- ฟังได้เป็นชั่วโมง

เครื่องดนตรี:

- ขลุ่ยไทย / เอเชีย
- พิณหรือเครื่องสาย pluck
- ระนาดเบา
- กลองมือเบา
- pad fantasy
- ambience ผู้คน / นก / ลม

Motif:

- ดึ๋งปุ๊ Motif แบบอ่อนโยน
- ไม่ย้ำทุก 4 bars
- โผล่มาเป็นช่วง ๆ เหมือน signature ของเมือง

## 27.2 ลานกลางเมือง

เพลง:

- version เต็มของ main city
- melody ชัดที่สุด
- รู้สึก “นี่คือบ้าน”

Ambience:

- คนเดิน
- NPC คุยเบา ๆ
- นก
- ลม
- เสียงค้อนตีเหล็กไกล ๆ

## 27.3 ตลาดกลาง / Player Shop

เพลง:

- เพิ่มจังหวะ
- เพิ่ม pluck
- สดใสขึ้น

เสียง:

- เหรียญ
- ผ้ากระพือ
- พ่อค้าเรียกเบา ๆ
- กล่องไม้
- เปิดร้าน

## 27.4 ถนนร้านตีเหล็ก

เพลง:

- ใช้ main city แต่ลด melody
- เพิ่ม rhythm จากค้อนตีเหล็ก

เสียง:

- ค้อน
- ไฟเตา
- โลหะร้อน
- น้ำชุบเหล็ก
- resonance ของอาวุธ

## 27.5 วิหารผนึก

เพลง:

- ช้าลง
- ขลัง
- ระฆัง
- drone ต่ำ
- choir เบามาก

เสียง:

- ลมหายใจของผนึก
- ระฆังไกล
- หินเก่า
- พลังสั่นพ้อง

## 27.6 ลานเกียรติยศ

เพลง:

- ยิ่งใหญ่แต่ไม่ดังตลอด
- brass / กลอง / choir เบา
- Hall motif เฉพาะ

เสียง:

- จารึกสลัก
- ธงกระพือ
- ผู้ประกาศข่าวนักล่า
- fanfare สั้นเมื่อมีคนติดอันดับ

---

# 28. Map Music Bible 1–10

## Map 1 — ขอบเมืองมนุษย์

ชื่อเพลง:

> **ก้าวแรกของนักล่า**

ฟีล:

- สดใส
- ออกผจญภัย
- ขำเล็ก ๆ
- ไม่อันตราย

Tempo:

- 95–105 BPM

เครื่องดนตรี:

- ขลุ่ย
- pluck strings
- percussion เบา
- mallet เด้ง ๆ

Ambience:

- นก
- หญ้า
- ลม
- เมืองไกล ๆ
- สไลม์เด้งเบา ๆ

Combat Layer:

- เพิ่มกลองเบา
- เพิ่ม bass pluck
- สู้แล้วสนุก ไม่เครียด

## Map 2 — ถนนชายไร่

ชื่อเพลง:

> **ฟางสั่นพ้อง**

ฟีล:

- ชนบท
- ไร่
- สบาย
- เริ่มมีอะไรแปลก ๆ

Tempo:

- 90–100 BPM

เครื่องดนตรี:

- เครื่องสาย pluck
- ขลุ่ย
- percussion ไม้
- ระนาดไม้

Ambience:

- แมลง
- ลมผ่านฟาง
- หุ่นฟางกรอบแกรบ
- เห็ดเด้ง “ปุ๊” เบา ๆ

จุดเด่น:

- มี note เพี้ยนเล็ก ๆ แทรกใน loop เพื่อบอกว่าโลกเริ่มผิดธรรมชาติ

## Map 3 — ทางป่าเก่า

ชื่อเพลง:

> **ทางที่แผนที่ไม่รู้จัก**

ฟีล:

- ป่าลึก
- ลับ
- เริ่มไม่ไว้ใจ
- secret เริ่มเปิด

Tempo:

- 75–90 BPM

เครื่องดนตรี:

- flute ห่าง ๆ
- low drum เบา
- wood percussion
- reverse chime เล็กน้อย

Ambience:

- ใบไม้
- กิ่งไม้หัก
- ลิงเงาไกล
- หินขยับ
- กระซิบแทบไม่ได้ยิน

Motif:

- ดึ๋งปุ๊ Motif เล่นห่างขึ้น
- note “ดึ๋ง” เบาลง
- “ปุ๊วว” ยาวขึ้น

## Map 4 — ป่าจันทร์เงา

ชื่อเพลง:

> **จันทร์ที่จำเราได้**

ฟีล:

- หมอก
- จันทร์
- วิญญาณ
- ความทรงจำ
- สวยแต่เศร้า

Tempo:

- 65–80 BPM

เครื่องดนตรี:

- ขลุ่ยลม
- bell
- pad
- เครื่องสายลากยาว
- water texture

Ambience:

- ลมกลางคืน
- กระดิ่งไกล
- น้ำ
- วิญญาณเบา ๆ
- reverb ยาว

Combat Layer:

- ไม่เร็วมาก
- เพิ่ม pulse และ low drum
- สู้แล้วรู้สึกหลอน ไม่ใช่ action สดใส

## Map 5 — ศาลร้าง

ชื่อเพลง:

> **ระฆังที่ไม่มีใครตี**

ฟีล:

- ขลัง
- อึดอัด
- ศาลเก่า
- ผนึกเริ่มเปิด

Tempo:

- 60–75 BPM

เครื่องดนตรี:

- ระฆัง
- low drone
- frame drum
- whisper choir เบา
- กระดาษยันต์ / ผ้า

Ambience:

- ยันต์ปลิว
- ไม้ลั่น
- ลมลอดเสา
- เสียงสวดไม่ชัด
- ผนึกสั่น

Combat Layer:

- เพิ่มกลองพิธีกรรม
- เพิ่มเสียงระฆังผิดจังหวะ
- เมื่อ event เปิดให้ danger layer เข้ามา

## Map 6 — หุบรากลึก

ชื่อเพลง:

> **หัวใจใต้ผนึก**

ฟีล:

- ใต้ดิน
- รากยักษ์
- เหมือนโลกกำลังหายใจ
- หนักและลึก

Tempo:

- 55–70 BPM

เครื่องดนตรี:

- bass drone
- low drum
- organic pulse
- deep strings
- stone percussion

Ambience:

- น้ำหยด
- รากขยับ
- เสียงโพรง
- heartbeat ต่ำ
- แผ่นดินคราง

Combat Layer:

- pulse เร็วขึ้น
- เสียงรากกระแทกพื้น
- boss/event ใช้ heartbeat เป็นจังหวะหลัก

## Map 7 — เขตผลึกร้าว

ชื่อเพลง:

> **ฝนผลึกในเขตสั่นพ้อง**

ฟีล:

- high reward
- tension
- ผลึก
- แข่งขัน
- อันตรายจริง

Tempo:

- 95–115 BPM

เครื่องดนตรี:

- crystal bell
- metallic percussion
- synth shimmer
- low pulse
- tense string

Ambience:

- ผลึกแตก
- resonance แหลมบาง
- แสงสะท้อน
- crack เล็ก ๆ
- hostile cue เบา ๆ เมื่อมีผู้เล่นเสี่ยงปะทะใกล้

Layer:

- Explore = ผลึกสวยแต่เสียว
- Combat = จังหวะชัด
- Risk/Danger = เพิ่ม pulse และเสียงเตือนต่ำ
- Boss = crystal break rhythm

## Map 8 — ประตูเถ้าถ่าน

ชื่อเพลง:

> **กลองสงครามใต้เถ้า**

ฟีล:

- สงครามเก่า
- เถ้า
- ไฟดำ
- กองทัพที่ตายแล้ว

Tempo:

- 80–100 BPM

เครื่องดนตรี:

- กลองใหญ่
- low brass / synth brass
- chain / metal hit
- ash wind
- male choir ต่ำเบามาก

Ambience:

- ไฟคุ
- เถ้าปลิว
- เกราะเก่า
- ธงไหม้
- กลองสงครามไกล

Combat Layer:

- กลองชัดขึ้น
- เหล็กกระทบเข้าจังหวะ
- boss phase เพิ่ม choir

## Map 9 — ชายแดนต่างโลก

ชื่อเพลง:

> **คืนที่ไม่จบ**

ฟีล:

- โลกผิดปกติ
- เวลาเพี้ยน
- ไม่สบายหูเล็กน้อย
- หลอนแบบ fantasy

Tempo:

- 60–85 BPM แบบไม่ตรงจังหวะเล็กน้อย

เครื่องดนตรี:

- reverse pad
- warped bell
- detuned string
- time pulse
- sub hum

Ambience:

- reverse wind
- delay ผิดจังหวะ
- เสียงเหมือนใต้น้ำ
- เสียงไกลแต่ใกล้
- NPC/mob echo แปลก

Motif:

- ดึ๋งปุ๊ Motif เล่นกลับหลังบางครั้ง
- “ปุ๊วว” มาก่อน “ดึ๋ง” เพื่อให้รู้สึกเวลาไหลผิดทาง

## Map 10 — วิหารรอยแยก

ชื่อเพลง:

> **วิหารที่ฟ้าไม่ยอมมอง**

ฟีล:

- climax
- ขลัง
- ใหญ่
- สิ่งที่ไม่ควรมีอยู่
- เปิดทางไปเทพดาว

Tempo:

- 65–90 BPM

เครื่องดนตรี:

- choir ต่ำ
- ระฆังใหญ่
- low brass
- deep drum
- cosmic pad
- stone resonance

Ambience:

- ประตูมหึมา
- รอยแยก
- ฟ้าไกล
- เศษหินลอย
- ผนึกหลายชั้น

Goal:

- เป็นธีมจบ Arc 1
- แทรก Celestial motif ครั้งแรก
- ฟังแล้วรู้ว่าโลกกำลังใหญ่ขึ้น

---

# 29. Arc 2–4 Music Direction

## Arc 2 — วงโคจรเทพดารา

เสียง:
- cosmic fantasy
- ระฆัง
- choir
- shimmer
- เครื่องสายลอย
- กลองน้อยลง แต่ขลังขึ้น

Tracks:
- Map 11: **บันไดเหนือเมฆ**
- Map 12: **ฝุ่นดาวบนพื้นดิน**
- Map 13: **ความทรงจำของจันทรา**
- Map 14: **เลือดบนวงโคจร**
- Map 15: **เวลาที่ไม่ยอมปล่อย**

## Arc 3 — สงครามเทพผู้คุมผนึก

เสียง:
- drama
- เทพไม่ใช่ดี/ชั่วตรง ๆ
- orchestra + Asian fantasy + cosmic

Tracks:
- Map 16: **สวนที่งดงามเกินจริง**
- Map 17: **คำสัญญาที่หนักเท่าโลก**
- Map 18: **ทะเลของโลกที่หายไป**
- Map 19: **ฟ้าที่เปลี่ยนใจทุกลมหายใจ**
- Map 20: **แสงที่ไม่มีเงาให้ซ่อน**

## Arc 4 — ต้นกำเนิดดึ๋งปุ๊

เสียง:
- cosmic dark fantasy
- ดึ๋งปุ๊ Motif กลายเป็น sacred / ominous
- น้อยแต่หลอน
- เหมือนเสียงแรกของจักรวาล

Tracks:
- **ก่อนคำว่าดึ๋งปุ๊**
- **นครที่ไม่มีใครเกิด**
- **สิ่งที่ไม่มีทางกลับ**
- **บทสวดที่ยังไม่เกิด**
- **ปุ๊ววสุดท้าย**

---

# 30. Boss Music Bible

## 30.1 Boss Tier Music

### Mini Boss

- loop 60–90 วินาที
- hook สั้น
- กลองเบา
- ไม่ epic เกิน

### Field Boss

- loop 2–3 นาที
- ดึง motif map นั้นมาเพิ่ม tension
- มี intro 3–5 วิ

### World Boss

- intro เฉพาะ
- phase music
- danger layer
- final 20% intensity
- victory sting
- announcement sting

### Story Boss

- เพลงเล่าเรื่อง
- บางตัวเศร้าหรือขลัง ไม่จำเป็นต้องเร็ว

### Raid / Celestial Boss

- หลาย phase
- choir / orchestra / cosmic layer
- final phase ต้องรู้สึก “เอาแล้ว”

## 30.2 Boss 1–10 Music

1. หมูป่าหม้อเดือด — **หม้อเดือดวิ่งชน**
2. หุ่นฟางผู้เฝ้าไร่ — **ไร่ที่ลุกขึ้นเดิน**
3. ผู้เฝ้าทางที่ไม่มีชื่อ — **ทางเดินที่เปลี่ยนใจ**
4. นางไม้จันทร์ดับ — **จันทร์ดับในหมอก**
5. ผู้เฝ้าศาลร้าว — **ยันต์ที่ไม่ยอมหลับ**
6. รากแรกแห่งรอยแยก — **หัวใจใต้ราก**
7. จ้าวผลึกบิดเบือน — **กระจกที่ฟันกลับ**
8. แม่ทัพเถ้าผนึก — **ธงไหม้ไม่ยอมล้ม**
9. ผู้มาจากด้านที่ไม่มีชื่อ — **เสียงของพรุ่งนี้**
10. ผู้เฝ้าประตูสุดท้าย — **ประตูสุดท้ายไม่ได้ปิด**

---

# 31. Event / Weekly World Condition Music

## หมอกจันทร์หนา

เพลง:
> **หมอกที่จำชื่อเราได้**

ฟีล:
- ป่าจันทร์
- secret
- visibility ต่ำ
- กระดิ่งไกล

## เทศกาลตีเหล็ก

เพลง:
> **ค้อนสะท้านนคร**

ฟีล:
- เมืองคึกคัก
- rhythm จากค้อน
- ลุ้นตีบวก

## ฝนผลึก

เพลง:
> **ผลึกตกจากฟ้า**

ฟีล:
- สวยแต่แข่งขัน
- shimmer + tension pulse

## รอยแยกสั่นไหว

เพลง:
> **โลกหายใจผิดจังหวะ**

ฟีล:
- danger
- low pulse
- map music ถูกบิด

## คาราวานเมืองหลวง

เพลง:
> **ทางไกลของพ่อค้า**

ฟีล:
- ตลาด
- เดินทาง
- สดใส
- economy event

## คืนวิญญาณ

เพลง:
> **คืนที่โคมไม่ดับ**

ฟีล:
- ghost festival
- วิญญาณ
- สวย/หลอน

## ปุ๊แตกทั่วหล้า

เพลง:
> **ปุ๊แตกทั่วหล้า**

ฟีล:
- horde
- สนุก
- กาวนิด ๆ
- มอนเยอะ
- AoE showcase

---

# 32. Combat SFX / Skill SFX

## นักดาบ

เสียงหลัก:
- เหล็กหนัก
- ลมฟัน
- impact แน่น
- คลื่นดาบกว้าง

Signature:
> ชว้งงง—ตึ้ง!

## นักหอก

เสียงหลัก:
- แทงทะลุ
- ปักพื้น
- เสียงแรงส่งเป็นแนวยาว

Signature:
> ฉึก—ครืด—ปัง!

## นักธนู

เสียงหลัก:
- สายธนู
- ลูกศรเฉือนลม
- multi-shot ถี่
- critical ปักชัด

Signature:
> ฟิ้วฟิ้วฟิ้ว—ปัก!

## นักเวท

เสียงหลัก:
- charge
- explosion
- crystal crack
- magic pulse

Signature:
> วูมม—แตก—ตูม!

## นักอาคม / ผู้ผนึก

เสียงหลัก:
- กระดาษยันต์
- กระดิ่ง
- whisper
- seal snap
- low pulse

Signature:
> แกร๊บ… กริ๊ง… ตึง!

---

# 33. Enhancement / แกร่ง / Hall of Fame Audio

## 33.1 ตีบวกปกติ

เสียง:
- ค้อนตีเหล็ก
- ไฟเตาหลอม
- โลหะสั่น
- เสียงลุ้นก่อนผลออก

## 33.2 สำเร็จตามระดับ

+1 ถึง +5:
- success chime เบา

+6 ถึง +9:
- metal shine
- sparkle

+10 ถึง +12:
- gong สั้น
- resonance
- guild/server hint

+13 ถึง +15:
- silence 0.3 วิ
- ค้อนหนัก 1 ที
- ระฆัง
- fanfare
- Hall of Fame sting

## 33.3 ล้มเหลว

เสียง:
- โลหะร้าว
- ไฟดับเบา
- low “ครืน”
- ไม่ใช้เสียงแตกพังแบบทำร้ายใจ

## 33.4 รอยร้าว

เสียง:
- crack เบา
- resonance เพี้ยน
- เหมือนของยังอยู่แต่ต้องซ่อม

## 33.5 แกร่ง

เสียง sequence:

1. วัตถุลึกลับวางบนแท่น
2. ผนึกหมุน
3. ลมหยุด
4. ค้อนเดียวหนัก
5. แสงพุ่ง
6. ระฆัง / คอรัสสั้น
7. Hall of Fame sting ถ้าเป็นระดับสูง

เสียงนี้ต้องจำได้ทันทีว่า:

> “นี่คือแกร่ง ไม่ใช่หินตีบวกธรรมดา”

---

# 34. Hall of Fame / Announcement Audio

## Personal Achievement

- chime สั้น
- นุ่ม
- ไม่บังเกม

## Guild / Map Achievement

- กลองสั้น
- notification ชัด
- มีธง/กิลด์ feel

## Server Announcement

- fanfare
- ระฆัง
- ผู้ประกาศข่าวนักล่า

## Eternal Hall of Fame

- ระฆังใหญ่
- choir เบา
- เสียงจารึกถูกสลัก

Moment ตัวอย่าง:

ตีบวก +15:
- music duck ลง
- ค้อนสุดท้าย
- silence 0.3 วิ
- ระฆัง
- fanfare
- announcement text

World Boss ตาย:
- boss roar
- music hit
- victory sting
- loot burst
- server announcement

---

# 35. UI Sound

เสียง UI ต้องสั้น เบา ไม่แหลม และกดซ้ำไม่รำคาญ

ต้องมีเสียงสำหรับ:

- เปิด inventory
- เปิด market
- ซื้อขายสำเร็จ
- listing สำเร็จ
- รับ reward
- bot start / stop
- report ready
- quest complete
- party invite
- guild notification
- whisper / message
- Hall of Fame opened
- enhancement window opened

Market sound:
- เหรียญเบา ๆ
- ไม่ casino เกิน

---

# 36. Ambience

## เมือง

- คนคุย
- เท้าเดิน
- เหรียญ
- ค้อนตีเหล็กไกล
- นก
- ลม

## ป่า

- ใบไม้
- แมลง
- กิ่งไม้
- สัตว์ไกล

## ศาล

- กระดิ่ง
- ไม้เก่า
- ยันต์ปลิว
- ลมลอดเสา

## หุบราก

- น้ำหยด
- รากขยับ
- เสียงโพรง
- heartbeat ต่ำ

## ผลึก

- เสียงแก้ว
- resonance
- sparkle
- crack

## เถ้า

- ไฟคุ
- เถ้าปลิว
- เกราะเก่า
- ธงไหม้

## ต่างโลก

- reverse wind
- hum แปลก
- delay
- เสียงใกล้/ไกลผิดธรรมชาติ

---

# 37. Audio Priority / Mixing

## Priority สูงสุด

1. Boss telegraph / danger sound
2. Player important skill / ultimate
3. Critical / break
4. UI warning สำคัญ
5. Announcement สำคัญ

## Priority กลาง

- combat hit ทั่วไป
- monster death
- loot
- party/guild notification

## Priority ต่ำ

- ambience
- distant NPC
- market crowd
- repeated small hit

Rule:

> เสียงอันตรายต้องชนะเสียงสะใจเสมอ

---

# 38. Audio Settings

Volume sliders:

- Master
- Music
- SFX
- UI
- Ambience
- Voice / Announcement
- Other Players’ Effects

Options:

- ลดเสียงสกิลผู้เล่นอื่น
- ลดเสียง damage ถี่ ๆ
- ปิดเสียงประกาศทั่วไป
- เปิดเฉพาะ guild / server announcement
- streamer mode
- mute ตอน minimized

## Focus / Bot Audio Mode

โหมดสำหรับเปิด bot / AFK

ทำงาน:
- ลดเพลง
- ลด SFX ซ้ำ
- เปิดเฉพาะ rare drop
- bot stop
- danger
- report ready
- market sold
- death
- disconnected

---

# 39. Voice / NPC Bark

ไม่ต้องพากย์เต็มตั้งแต่แรก แต่ควรมี bark สั้น ๆ

## ลุงดึ๋ง

- “ตีไม่ติดก็พักก่อน ดาบมันก็มีหัวใจ”
- “หินที่เงียบไป บางทีกำลังฟังเราอยู่”
- “เดินตรงไปก็ถึงทางตัน เดินงง ๆ บ้างก็ดี”

## ป้าปุ๊

- “ของถูกมีทุกวัน ยกเว้นวันที่เจ้าอยากซื้อ”
- “อย่าจ้องนาน ของมันเขิน”
- “บางอย่างขายไม่ได้ แต่แลกได้จ้ะ”

## ช่างตีเหล็ก

- “วางลงมา เดี๋ยวข้าดูให้”
- “คราวนี้เสียงดีนะ”
- “อันนี้ต้องใจเย็น เหล็กมันจำมือคนตีได้”

## ผู้ประกาศข่าวนักล่า

- “จารึกใหม่ถูกเพิ่มในหอเกียรติยศแล้ว”
- “นักล่าผู้หนึ่งได้สร้างชื่อไว้ทั่วนครอรุณผนึก”
- “เสียงสั่นพ้องครั้งใหม่ ถูกบันทึกแล้ว”

---

# 40. Cosmetic Audio

ขายได้ แต่ต้องไม่ P2W และไม่รำคาญ

ขายได้:
- เสียง recall / return
- เสียง victory emote
- เสียง pet
- เสียง mount
- เสียง skill skin บางชุด
- เสียง critical skin เฉพาะตัวเอง
- Hall of Fame entrance sound แบบ cosmetic

Guardrail:
- คนอื่นได้ยินแบบลดทอน
- ห้ามเสียงยาวเกิน
- ห้ามเสียงแหลม/กวน
- ห้ามทำให้ PvP สับสน
- ห้ามแทนที่ danger sound

---

# 41. Audio Asset Baseline

## Core Themes

1. Main Menu Theme — เสียงแรกแห่งดึ๋งปุ๊
2. Character Select Theme — เส้นทางนักล่า
3. Main City Theme — นครอรุณผนึก
4. Hall of Fame Theme — จารึกสั่นพ้อง
5. Forge Theme — ค้อนสะท้านนคร
6. Market Theme — ตลาดอรุณ
7. Temple Theme — วิหารผนึก
8. Guild Theme — ธงนักล่า
9. Secret Theme — ข่าวลือที่แผนที่ไม่รู้จัก

## Map Themes

10. Map 1 — ก้าวแรกของนักล่า
11. Map 2 — ฟางสั่นพ้อง
12. Map 3 — ทางที่แผนที่ไม่รู้จัก
13. Map 4 — จันทร์ที่จำเราได้
14. Map 5 — ระฆังที่ไม่มีใครตี
15. Map 6 — หัวใจใต้ผนึก
16. Map 7 — ฝนผลึกในเขตสั่นพ้อง
17. Map 8 — กลองสงครามใต้เถ้า
18. Map 9 — คืนที่ไม่จบ
19. Map 10 — วิหารที่ฟ้าไม่ยอมมอง

## Boss Themes

20. Mini Boss Theme
21. Field Boss Theme
22. World Boss Theme
23. Story Boss Theme
24. Raid Boss Theme
25. Celestial Boss Theme
26. Final Phase Theme
27. Victory Sting
28. Defeat Sting — ดึ๋งปุ๊วว

## Event Themes

29. หมอกจันทร์หนา
30. เทศกาลตีเหล็ก
31. ฝนผลึก
32. รอยแยกสั่นไหว
33. คาราวานเมืองหลวง
34. คืนวิญญาณ
35. ปุ๊แตกทั่วหล้า
36. Guild War Theme
37. Rift War Theme
38. Arena Theme

## Arc 2–4 Themes

39. บันไดเหนือเมฆ
40. ฝุ่นดาวบนพื้นดิน
41. ความทรงจำของจันทรา
42. เลือดบนวงโคจร
43. เวลาที่ไม่ยอมปล่อย
44. สวนที่งดงามเกินจริง
45. คำสัญญาที่หนักเท่าโลก
46. ทะเลของโลกที่หายไป
47. ฟ้าที่เปลี่ยนใจทุกลมหายใจ
48. แสงที่ไม่มีเงาให้ซ่อน
49. ก่อนคำว่าดึ๋งปุ๊
50. นครที่ไม่มีใครเกิด
51. สิ่งที่ไม่มีทางกลับ
52. บทสวดที่ยังไม่เกิด
53. ปุ๊ววสุดท้าย

## SFX Sets

54. Player Death — ดึ๋งปุ๊วว
55. Monster Death Set
56. Skill SFX 5 อาชีพ
57. Ultimate SFX 5 อาชีพ
58. Critical Hit
59. Boss Break
60. Loot Drop
61. Rare Drop
62. Enhancement Success
63. Enhancement Fail
64. รอยร้าว
65. แกร่ง
66. Hall of Fame Announcement
67. UI Pack
68. Market Pack
69. Bot / Report Pack
70. Secret Discovery
71. World Boss Spawn
72. World Boss Death

---

# 42. Final Audio Locked Decisions

1. ใช้ **ดึ๋งปุ๊ Motif** เป็น signature หลักของเกม
2. เสียงตัวตุยใช้ stinger **“ดึ๋ง…ปุ๊ววว~”**
3. เพลงต้องจำได้แต่ฟังวนได้นาน
4. เพลงฉากทั่วไปเน้น loop-tolerant
5. เพลง boss / climax ใช้ hook และ dynamic แรงขึ้นได้
6. เมืองหลักมี theme จำได้และมี sub-layer ตามพื้นที่
7. Map 1–10 มีเพลงเฉพาะตาม progression ของโลก
8. Arc 2–4 ใช้ cosmic / celestial / dark fantasy sound
9. Combat SFX ต้องสะใจแต่ไม่รก
10. แต่ละอาชีพมี sound identity
11. Enhancement / แกร่ง / Hall of Fame มีเสียงขลังเฉพาะ
12. มี adaptive music: explore / combat / danger / boss
13. มี ambience ทุก map
14. มี audio priority ให้ danger sound สำคัญที่สุด
15. มี Focus / Bot Audio Mode
16. มี NPC bark สั้น ๆ
17. Cosmetic audio ขายได้แต่ต้องไม่กวนและไม่ P2W
18. Audio asset list 72 รายการใช้เป็น baseline

---

# 43. Final Closure Update

หลังเพิ่ม Audio Direction & Soundscape Layer แล้ว โปรเจกต์ดึ๋งปุ๊มีครบทุกแกนสำคัญสำหรับการขึ้นโปรเจกต์รอบแรก:

- Game identity
- World / lore / story
- Map / boss / class / legendary
- Economy / market / liveops
- Hunter Assistant / bot / report
- PvP / risk / guild / raid
- Enhancement / แกร่ง
- Hall of Fame / social flex
- Combat juice / skill impact
- Audio direction / music / ambience / SFX

สถานะ:

> **ไม่มีงาน design setup ค้างในรอบนี้**

สิ่งต่อไปหลังจาก user เคาะผ่านทั้งหมด:

- ใช้ checkpoint version นี้เป็น final source
- ส่งต่อให้ Claude วิเคราะห์ tech architecture
- เริ่ม prototype / technical design phase

---

# 44. Tech Handoff Readiness Layer

เป้าหมายของชั้นนี้คือทำให้ทีม tech / Claude / Claude Code ไม่ต้องเดาเองว่า:

- UI หน้าตาควรไปทางไหน
- สีของระบบต่าง ๆ คืออะไร
- ค่า balance อะไรต้องเป็น config
- อะไรห้าม hardcode
- อะไรเป็น decision ของ game designer / owner
- skill data ควรเก็บแบบไหน
- งานไหนพักไว้ก่อนได้อย่างเป็นระบบ
- docs ไหนคือ source of truth

---

# 45. UI Art Direction & Visual Design System

## 45.1 Global UI Direction

แนวทางหลักของ UI:

> **Ancient Asian Fantasy UI + Modern Readability**

หลักคิด:
- มีกลิ่นอาย fantasy / asian / ไทย / ผนึก / หิน / ไม้ / โลหะ
- แต่ยังอ่านง่ายแบบเกม modern
- ไม่ทำให้รกจนเหมือนภาพประกอบล้วน
- ไม่ทำให้แบนจนเหมือนเว็บ dashboard ทั่วไป

## 45.2 UI Style Principles

- Panel หลัก: หิน / กระดาษ / โลหะ fantasy เบา ๆ
- Border: ทองหม่น / สำริด / หินแกะ
- Background panel: ดำอมเขียว / น้ำตาลเข้ม / หมึกเข้ม
- Highlight: ทองอุ่น / ฟ้าอาคม / ม่วงรอยแยก
- ปุ่ม: มีน้ำหนัก กดแล้วรู้สึกเป็นเกม ไม่ใช่เว็บ form ธรรมดา
- Icon: semi-painted / fantasy icon / silhouette ชัด
- Tooltip: อ่านง่ายก่อน สวยทีหลัง
- HUD: compact, readable, ไม่บัง combat

## 45.3 Typography Direction

หลัก:
- ตัวหนังสือไทยต้องอ่านง่ายก่อน
- หัวข้อสามารถมีความขลัง / fantasy เบา ๆ
- body text / UI label / stats ต้องชัดเจน
- ตัวเลข damage ต้องหนา อ่านออกเร็ว และแยก critical ได้ชัด
- item name ใช้การเน้นด้วยสี/กรอบ มากกว่าฟอนต์แปลก

แนวทาง:
- UI หลัก: readable sans / Thai-friendly
- หัวข้อหน้าจอใหญ่: semi-fantasy display แบบประหยัด
- Damage number: หนา, ชัด, แยก normal / crit / break / overkill

## 45.4 Icon Style

- อ่านออกชัดในขนาดเล็ก
- ใช้ silhouette ที่จำง่าย
- แยกหมวดด้วย shape language
- Equipment = คม ชัด หนักแน่น
- Consumable = กลม / ขวด / soft shape
- Currency = coin / seal / crystal
- Secret / lore = paper / eye / whisper / seal
- Bot / helper = tool / compass / route / glyph

## 45.5 Button / Panel / Modal Style

### Button
- Primary: ทองอุ่น / แสงนุ่ม
- Secondary: สำริด / น้ำตาลเข้ม / อ่านง่าย
- Danger: แดงหม่น ไม่แดงสดบาดตา
- Premium / special action: ฟ้าเงิน / ขาวทอง หรือม่วงผนึก

### Panel
- Panel ปกติ: dark ink + border สำริด
- Panel lore/quest: parchment / paper tone
- Panel market/report: clean + structured อ่านง่าย
- Panel Hall of Fame: หินอ่อน + ทอง + แสงขาว
- Panel enhancement: forge / heat / metal

### Modal
- Confirmation modal ต้องชัด
- market purchase / enhancement / rare item / use แกร่ง ต้องมี visual weight มากกว่าปกติ

## 45.6 HUD Direction

HUD หลักต้อง:
- อ่านง่ายที่สุดในเกม
- โปร่งบางพอให้เห็นฉากและ combat
- แยกส่วน HP/MP/EXP/skill bar/minimap/quest tracker ชัด
- Boss telegraph ต้องสำคัญกว่า HUD เสมอ
- danger zone / alert ห้ามถูก panel หรือ tooltip บัง

---

# 46. Color Palette & Visual Language

## 46.1 Global Palette

- **Deep Ink** — พื้นหลัง UI หลัก
- **Warm Parchment** — กล่องข้อความ / quest / lore
- **Bronze Gold** — border / reward / Hall of Fame
- **Jade Green** — ระบบผนึก / ฟื้นฟู / safe
- **Crimson Red** — danger / boss / warning
- **Moon Blue** — จันทร์ / เวท / ความทรงจำ
- **Rift Violet** — รอยแยก / secret / cosmic anomaly
- **Ash Black** — เถ้า / สงคราม / ประตูเถ้าถ่าน
- **Celestial Silver** — เทพดาว / Arc 2+ / cosmic

## 46.2 System Colors

- Bot / Auto Pilot: ฟ้าอมเขียว อ่านง่าย ดูเป็นผู้ช่วย
- Report: parchment card / clean neutral summary
- Market: น้ำตาลทอง / ledger / พ่อค้า
- Enhancement: เหล็กดำ + ทองแดง + ไฟส้ม
- Hall of Fame: ทอง + หินอ่อน + แสงขาว
- Secret: ม่วงหม่น + หมึกจาง + กระดาษเก่า
- Risk Zone / เขตสั่นพ้องรุนแรง: แดงหม่น + ม่วงรอยแยก
- PvP / Arena: แดง / ดำ / เหล็ก
- Celestial systems: เงิน / ฟ้า / ม่วงจักรวาล

## 46.3 Item Rarity Colors

- Common: เทาเงิน
- Uncommon: เขียว
- Rare: ฟ้า
- Epic: ม่วง
- Legendary: ทอง
- Mythic / Celestial: ทองขาว + ฟ้าเงิน
- แกร่ง: ทองเข้ม + แสงขาวผนึก + ขอบแดง/ม่วงบาง
- ตราสั่นพ้อง: ฟ้าม่วงเรือง
- เพชร: ฟ้าใส / crystal bright

## 46.4 Status / Signal Colors

- Safe / success / complete: เขียวหยก
- Warning / caution: ทองอุ่น / ส้มหม่น
- Danger / lethal / boss mechanic: แดงหม่น
- Secret / unknown / anomaly: ม่วงผนึก
- Premium / paid helper: ฟ้าเงิน

---

# 47. Screen-by-Screen Visual Mood

## 47.1 Main Gameplay HUD

ฟีล:
> อ่านง่ายที่สุด, โปร่ง, compact, ไม่บัง combat

หลัก:
- HP/MP/EXP อ่านชัด
- Skill bar มี cooldown clarity
- minimap ดูง่าย
- quest tracker ไม่กินพื้นที่เกิน
- damage number สำคัญกว่า UI สวย

## 47.2 Inventory

ฟีล:
> ช่อง item ชัด, rarity ชัด, tooltip อ่านง่าย

หลัก:
- item slot อ่านง่าย
- lock / bound / tradeable / equipable แยกชัด
- ของสำคัญมี glow
- gear comparison ทำให้ตัดสินใจเร็ว

## 47.3 Market

ฟีล:
> **สมุดบัญชีพ่อค้า + ตลาด fantasy**

หลัก:
- list / filter / sort อ่านง่าย
- price history ชัด
- fixed price / auction แยกชัด
- ของแพง / legendary / high risk ต้องมี confirm หนัก

## 47.4 Enhancement / Forge

ฟีล:
> **เตาหลอม / แท่นตีเหล็ก / พิธีกรรมตีบวก**

หลัก:
- อุปกรณ์อยู่กลาง
- material อยู่ฝั่งซ้าย
- chance / outcome อยู่ฝั่งขวา
- ใช้แกร่งต้องมี slot พิเศษ
- warning เรื่อง -1 / รอยร้าว / gold cost ชัดเจน
- ปุ่มตีบวกต้องให้ความรู้สึกลุ้น

## 47.5 Hall of Fame

ฟีล:
> **หอจารึก / ลานเกียรติยศ / ความขิง**

หลัก:
- ทอง / หิน / ธง / badge
- weekly กับ eternal แยก mood
- weekly ดูสดและมีการแข่งขัน
- eternal ดูขลังกว่า

## 47.6 Bot / Auto Pilot

ฟีล:
> **เครื่องมือผู้ช่วยนักล่า อ่านง่าย ใช้ทุกวัน**

หลัก:
- ไม่ fantasy หนักเกินไป
- card / toggle / rule / status ชัด
- start / stop เด่น
- risk warning ชัด
- Pro setting ต้องอ่านแล้วไม่รก

## 47.7 Report

ฟีล:
> **สรุปอ่านจบใน 10–20 วินาที**

หลัก:
- card summary
- เน้น bot / market / progress / recommendation
- ไม่เหมือน Excel
- ใช้ icon + number + short summary

## 47.8 Secret Quest / Clue UI

ฟีล:
> **ข่าวลือ / กระดาษเก่า / ข้อความไม่สมบูรณ์**

หลัก:
- ไม่ใช้ marker ชัดตั้งแต่แรก
- ใช้ข้อความคลุมเครือ
- สีหมึกจาง / ม่วงหม่น / แสงจันทร์

---

# 48. Design Knobs & Guardrails

หลักการ:

> Tech ไม่ต้องตัดสิน balance จริง  
> Tech ทำระบบให้ปรับค่าได้, วัดผลได้, rollback ได้  
> Design / Owner เป็นผู้ตัดสิน intent, default, range, และ business rule

## 48.1 Knob Template

แต่ละ knob ควรมีโครงดังนี้:

- Knob Name
- Category
- Design Intent
- Default Value
- Allowed Range
- Owner
- Tech Requirement
- Telemetry Required
- Guardrail
- Rollback Needed

## 48.2 Combat Knobs

- skill multiplier
- cooldown
- cast time
- AoE radius
- hit count
- crit modifier
- boss damage modifier
- PvP modifier
- ultimate charge rate

## 48.3 Monster / Spawn Knobs

- spawn rate
- pack size
- elite chance
- world boss spawn window
- event wave count
- respawn delay
- density per map

## 48.4 Drop / Reward Knobs

- gold drop
- material drop
- rare drop
- boss contribution reward
- world boss rare table
- เศษแกร่ง drop rate
- แกร่ง drop rate
- pity/progress rule ถ้ามี

## 48.5 Enhancement Knobs

- success rate
- fail outcome chance
- -1 chance
- รอยร้าว chance
- material cost
- gold cost
- ผงคงรูป effect
- แกร่ง usage rule

## 48.6 Economy Knobs

- market tax
- listing fee
- auction fee
- repair cost
- crafting cost
- merchant exchange rate
- gold faucet/sink ratio
- inflation alert threshold

## 48.7 Bot Knobs

- max runtime
- skill usage rules
- route limit
- auto restock limit
- sell filter
- risk zone behavior
- rare drop stop condition
- Pro profile count

## 48.8 Hall of Fame Knobs

- weekly reset
- category thresholds
- reward buff %
- title duration
- announcement threshold
- anti-spam cooldown

## 48.9 Guardrail Principles

- Farming skill ห้ามชนะ boss skill ทุกบริบท
- AoE ต้องสะใจ แต่ไม่ควร one-shot elite/boss ง่ายเกิน
- Paid helper ห้ามเพิ่มพลังตรง
- แกร่งห้ามเป็นของที่ซื้อเพชรตรง
- Hall of Fame reward ห้าม snowball เกมจนเกินไป
- Risk Zone ห้ามลงโทษผู้แพ้ด้วยการเสียของ

---

# 49. Punishment / Rollback / Abuse Policy Boundary

นโยบายหลัก:

- ไม่มี auto perma-ban โดยไม่มี human review
- ระบบต้องทำหน้าที่ flag / freeze / investigate
- GM / Owner เป็นผู้ตัดสินขั้นสุดท้าย
- ทุกอย่างต้องมี audit log
- ควรมี rollback tool สำหรับ item / gold / market / enhancement
- premium currency ต้อง strict ที่สุด
- trade / market / enhancement / แกร่ง ต้องมี transaction log

## 49.1 สิ่งที่ Tech ต้องเตรียม

- suspicious activity flag
- account / item / trade freeze
- transaction history
- audit log
- evidence export
- rollback candidate tools
- admin note
- manual review queue

## 49.2 สิ่งที่ระบบไม่ควรทำเอง

- auto perma-ban
- auto delete item แบบไม่มี audit
- auto rollback ทั้ง server โดยไม่มี owner confirm
- final market manipulation verdict โดยไม่มี review
- premium currency seizure โดยไม่มี review

---

# 50. Skill Data Model (Tech-facing Design)

หลักการ:
- เอกสารนี้ยังไม่ใช่ final balance table
- แต่เป็นโครงสร้างข้อมูลสำหรับส่งต่อทีม tech
- ทุกค่าที่เป็น balance knob ต้อง configurable

## 50.1 Skill Fields

- skillId
- skillName
- class
- branch
- tier
- unlockLevel
- role
- description
- targetType
- targetShape
- range
- radius
- angle
- maxTargets
- hitCount
- damageType
- baseMultiplier
- scalingStat
- cooldown
- castTime
- activeTime
- recoveryTime
- resourceCost
- statusEffects
- crowdControl
- bossModifier
- pvpModifier
- comboTags
- animationCue
- vfxCue
- sfxCue
- damageNumberProfile
- screenShakeLevel
- hitStopLevel
- botUsageRule
- serverAuthority
- performanceBudget

## 50.2 Skill Design Example — นักดาบ / คลื่นดาบราชันย์

- role: AoE farming / frontal clear
- targetShape: cone / wide line
- hitCount: 1
- feel: ฟันทีเดียวกวาดทั้งแถว
- botUsageRule: ใช้เมื่อมีมอน 5+ ตัวด้านหน้า
- guardrail: farming skill ไม่ควรชนะ single-target boss skill ตอนไปลุย boss

## 50.3 Skill Design Example — นักเวท / พายุผลึก

- role: AoE multi-hit
- targetShape: ground circle
- hitCount: multi-hit
- feel: ผลึกตกใส่มอนกลุ่มใหญ่
- damageNumberProfile: compact multi-hit
- performanceBudget: pooled particle / capped simultaneous effect

## 50.4 Skill Design Example — นักอาคม / วงอาคมไร้เสียง

- role: delayed AoE / control
- targetShape: ground circle
- statusEffect: slow / seal mark
- feel: คุมมอนทั้งกองแล้วระเบิด
- botUsageRule: ใช้ตอนมอนรวมตัวเกิน X

---

# 51. Deferred / P5+ Placeholder

เป้าหมาย:
> ระบบเหล่านี้ไม่ใช่งานค้าง แต่เป็นงานที่ยังไม่ควรลงลึกในรอบนี้

## 51.1 Deferred Modules

- Guild war schema เชิงลึก
- Raid phase data model เชิงลึก
- Weekly scheduler รายละเอียดเต็ม
- Secret quest condition graph
- Cosmetic entitlement schema เชิงลึก
- Guild territory
- Celestial raid full data model
- Shop entitlement backend เชิงลึก
- Full anti-cheat automation

## 51.2 Placeholder Format

แต่ละระบบ deferred ควรบันทึกแค่:
- Module
- Current Status
- Why Deferred
- Boundary
- Depends On
- Future Owner

## 51.3 Example

Module: Secret Quest Trigger Graph  
Current Status: Deferred P5+  
Why Deferred: ต้องรอ quest system, inventory, map trigger และ condition model ชัดก่อน  
Boundary: Phase นี้ล็อกแค่ clue/hint philosophy และประเภท secret  
Depends On: Quest, Inventory, Map Trigger, NPC Interaction  
Future Owner: Game Designer + Backend

---

# 52. Docs-as-Memory Structure

## 52.1 Recommended Repo Structure

/docs
  /design
    PROJECT_CHECKPOINT_FINAL.md
    UI_ART_DIRECTION.md
    AUDIO_DIRECTION.md
    COMBAT_FOUNDATION.md
    DESIGN_KNOBS_AND_GUARDRAILS.md
    SKILL_DATA_MODEL.md
    DEFERRED_DESIGN.md

  /tech
    TECH_ARCHITECTURE.md
    REALTIME_DESIGN.md
    DATA_MODEL_DRAFT.md
    BACKEND_BOUNDARIES.md

  /prompts
    CLAUDE_CODE_EXECUTION_PROMPT.md
    ISSUE_PO_PROMPT.md
    TECH_REVIEW_PROMPT.md

## 52.2 Working Rules

- Chat ไม่ใช่ source of truth
- Repo docs คือ source of truth
- Claude Code ต้องอ่าน docs ก่อนทำงาน
- ถ้า code เปลี่ยน design assumption ต้อง update docs หรือถามก่อน
- ถ้าเจอ gap ต้องถาม ไม่เดา
- ทุก issue ต้องอ้างอิง doc section

---

# 53. Claude Code Execution Rules

Claude Code ควรทำงานภายใต้กติกา:

- อ่าน docs ก่อน
- สรุปความเข้าใจก่อน
- เสนอ plan ก่อนแก้ code
- ทำทีละ issue
- ห้าม refactor กว้างโดยไม่ขออนุมัติ
- ห้ามเปลี่ยน design decision เอง
- ห้าม hardcode balance
- ห้ามแก้ architecture ใหญ่เอง
- ถ้าไม่แน่ใจให้ถาม
- หลังจบงาน update docs ที่เกี่ยวข้อง
- เขียน test เฉพาะ scope
- สรุปไฟล์ที่แก้และเหตุผล

Prompt แกนกลาง:

> You are Claude Code working on Deungpu.  
> Do not invent game design.  
> Do not make broad refactors.  
> Read /docs/design first.  
> If a value is a balance knob, keep it configurable.  
> If a decision affects economy, combat, punishment, monetization, or premium currency, stop and ask.  
> Implement only the current issue scope.

---

# 54. Map Layout Detail Status

## 54.1 สิ่งที่มีแล้ว

ปัจจุบันใน checkpoint มีรายละเอียดระดับ:
- map theme
- sub-zone / เมืองย่อย
- boss ประจำ map
- event สำคัญ
- material หลัก
- lore hook
- safe / contested / risk classification
- progression เชิงเนื้อเรื่อง

## 54.2 สิ่งที่ยังไม่มีแบบละเอียด

ยัง **ไม่มี** ในระดับ tactical blueprint เช่น:
- layout map แบบ top-down / chunk-by-chunk
- เมืองอยู่พิกัดไหน
- จุดวาปหลักอยู่ตรงไหน
- ทางออก map ซ้าย/ขวา/บน/ล่าง
- จุดมอนแต่ละกลุ่มอยู่ตรงไหน
- จุด elite / miniboss / harvesting node
- farming loop route
- secret route และ hidden trigger ตำแหน่งจริง
- จุด world event spawn
- จุด NPC service ภายในเมืองย่อย
- safe pocket / choke point / party zone / solo lane

## 54.3 ข้อสรุป

ดังนั้นคำตอบคือ:

> ตอนนี้มี **Map Bible ระดับ theme/progression/lore/gameplay purpose แล้ว**  
> แต่ยัง **ไม่มี Map Layout Bible ระดับตำแหน่งจริงของเมือง, วาป, spawn, route, resource, choke point**

## 54.4 เอกสารถัดไปที่ควรทำ

เอกสารถัดไปควรชื่อ:

> **MAP_LAYOUT_BIBLE.md**

สำหรับแต่ละ map ควรมี:
- เป้าหมายของ map
- overview layout
- เมือง/ค่าย/จุดพัก
- ทางเชื่อม map
- จุดวาป
- จุดมอนหลัก / มอนพิเศษ
- elite / boss area
- farming route แนะนำ
- secret spot
- event zone
- resource node
- party area / solo area
- risk pocket
- minimap note
- visual landmark

---

# 55. Final Tech-Handoff Summary

หลังเพิ่ม Tech Handoff Readiness Layer แล้ว โปรเจกต์ดึ๋งปุ๊มีครบทั้ง:

- World / lore / story
- Map / boss / class / legendary
- Economy / market / liveops
- Bot / auto pilot / report
- PvP / risk / guild / raid
- Enhancement / แกร่ง
- Hall of Fame / social flex
- Combat juice / skill impact
- Audio direction / music / ambience / SFX
- UI art direction / design system
- Design knobs / guardrails
- Skill data model
- Docs-as-memory rules
- Claude Code execution boundary
- Deferred/P5+ placeholder
- สถานะชัดเจนของ map detail ว่ายังขาด layer ใด

สถานะปัจจุบัน:

> **ไม่มีงาน design setup ค้างในรอบนี้**  
> แต่มีงาน “production/detailing phase” ถัดไปที่เริ่มได้ทันที ได้แก่:
> - Map Layout Bible
> - Screen mockup / concept screens
> - Skill table เชิงตัวเลข
> - Tech architecture / prototype planning

---

# 56. Map Scale, Spawn Density & AoE Combat Spec

> รายละเอียดฉบับเต็มแยกไฟล์อยู่ที่: `deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md`

## 56.1 ทำไมต้องมี section นี้

ก่อนหน้านี้เอกสารมี:
- Map Bible
- Map Layout Bible
- Combat Juice
- Skill Impact
- UI / Audio / Tech Handoff

แต่ยังขาดคำตอบเชิง production ว่า:

- แต่ละ map ใหญ่แค่ไหน
- ใช้เวลากี่นาทีเดินผ่าน
- มี farming pocket กี่จุด
- มอนเกิดกี่ตัวต่อ pack
- ต่อจอควรเห็นมอนกี่ตัว
- AoE ควรโดนมอนกี่ตัวถึงสะใจ
- Event wave ต้องมี density ระดับไหน
- Bot farming route ต้องรองรับยังไง
- Performance cap ควรคุมตรงไหน

section นี้จึงล็อกว่าเกมต้องรองรับฟีล:

> เดินเข้า pocket → มอนแน่นพอดี → กด AoE แล้วแตกเป็นชุด → damage number เด้งสะใจ → loot ระเบิด → bot ฟาร์มเป็น route ได้

## 56.2 Map Size Tier

| Tier | ใช้กับ | เวลาเดินต้นถึงท้าย | Farming Pocket |
|---|---|---:|---:|
| Small Field | tutorial / early field | 45–90 วิ | 3–4 |
| Medium Field | map ฟาร์มปกติ | 2–3 นาที | 5–7 |
| Large Field | mid/late map | 3–5 นาที | 7–10 |
| Endgame / Risk Field | Map 7–10 | 4–6 นาที | 8–12 |
| Final Arc Field | Map 10 | 3–5 นาที | 6–9 |

## 56.3 Screen Density Target

| Phase | Normal Screen | Combat Pocket | Event Peak |
|---|---:|---:|---:|
| Map 1–2 | 6–12 | 10–15 | 20–30 |
| Map 3–6 | 10–20 | 16–28 | 30–50 |
| Map 7–10 | 15–30 | 24–40 | 40–60 |

## 56.4 AoE Target

| Skill Type | Early | Mid | Late | Event |
|---|---:|---:|---:|---:|
| AoE ปกติ | 4–6 | 6–10 | 8–14 | 10–18 |
| Ultimate | 8–12 | 12–20 | 20–35 | 35–40+ |

Guardrail:
- AoE ต้องสะใจตอนฟาร์ม
- Boss / elite ต้องไม่ละลายเหมือนมอนทั่วไป
- damage number ต้อง aggregate ได้
- boss telegraph สำคัญกว่า effect เสมอ

## 56.5 Launch Scope Map Scale Summary

| Map | Size | Farming Pocket | Density Target |
|---|---|---:|---|
| 1 ขอบเมืองมนุษย์ | Small–Medium | 4 | 6–12/จอ |
| 2 ถนนชายไร่ | Medium | 5–6 | 10–15/จอ |
| 3 ทางป่าเก่า | Medium | 5–7 | 10–18/จอ |
| 4 ป่าจันทร์เงา | Medium–Large | 6–8 | 12–20/จอ |
| 5 ศาลร้าง | Large | 7–9 | 16–28/จอ |
| 6 หุบรากลึก | Large | 7–10 | 18–30/จอ |
| 7 เขตผลึกร้าว | Large/Risk | 8–11 | 20–35/จอ |
| 8 ประตูเถ้าถ่าน | Large/War | 8–12 | 20–35/จอ |
| 9 ชายแดนต่างโลก | Large/Weird | 7–10 | 15–28/จอ |
| 10 วิหารรอยแยก | Medium–Large/Final | 6–9 | 12–24/จอ |

## 56.6 Tech Requirements

Tech ต้องทำให้ config ได้:
- map size tier
- pocket list
- spawn pack min/max
- packs per pocket
- respawn delay
- active cap
- aggro radius
- leash radius
- pull cap
- event wave count
- bot route permission
- AoE target cap
- performance cap

## 56.7 Telemetry Required

ต้องเก็บ:
- average mobs on screen
- mobs killed/min
- gold/hour per map
- item/hour per map
- AoE average targets hit
- ultimate average targets hit
- bot output per route
- active players per pocket
- FPS during event wave
- server load during spawn peak

## 56.8 Current Status

สถานะหลัง v12:

> มี Map Bible + Map Layout Bible + Map Scale/Spawn Density Spec ครบสำหรับ Map 1–10 แล้ว

Map 11+ ยังเป็น future roadmap และไม่ลง spawn density จริงในรอบนี้

---

# 57. Engine Foundation Decisions

> รายละเอียดฉบับเต็มแยกไฟล์อยู่ที่: `deungpu_ENGINE_FOUNDATION_DECISIONS_v1.md`

section นี้ใช้ตอบทีม tech ก่อนเริ่มทำ engine foundation เพราะเป็น decision ที่กระทบตั้งแต่ราก:
- map projection
- grid
- movement
- depth sorting
- collision
- pathfinding
- animation state machine
- room/channel architecture
- minimap behavior
- global state

---

## 57.1 Camera / Projection

Decision:

> **True 2D Isometric Pixel Art**

รายละเอียด:
- พื้นเป็น diamond grid
- fixed camera
- ไม่มี camera rotation
- ไม่ใช้ top-down square grid
- ใช้ 2D isometric projection + depth sorting
- ไม่ใช้คำว่า “Isometric / Top-down 3/4” ปนกันอีกในเอกสาร tech

เหตุผล:
- ตรงกับ mockup pixel art ที่ผ่านแล้ว
- ได้ identity MMORPG classic
- เมือง / map / farming pocket / boss arena ดูมีมิติกว่า
- เหมาะกับ PixiJS 8 และ pixel-art 2.5D MMO มากกว่า top-down ธรรมดา

ข้อจำกัด:
- ไม่มี seamless 3D height ซับซ้อน
- ไม่มี camera rotation
- pseudo-height ใช้ได้เฉพาะ visual layer ถ้าจำเป็น

---

## 57.2 Character / Monster Sprite Directions

Decision:

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

เหตุผล:
- 8 ทิศวาดจริง cost สูงเกินสำหรับ phase แรก
- 4 ทิศน้อยเกินสำหรับ isometric MMO
- 5 ทิศ + mirror เป็นจุดสมดุลระหว่างคุณภาพและ production cost

Tech ต้องรองรับ:
- direction resolver
- mirror flag
- data-driven animation config
- optional 8-dir override สำหรับ boss / NPC / asset พิเศษในอนาคต

Art guardrail:
- launch character design ไม่ควร asymmetry หนักเกินไป
- boss สำคัญสามารถใช้ 8-dir override ได้ในอนาคต

---

## 57.3 Map World Model

Decision:

> **Separated Map Instances / Rooms / Channels**

การข้าม map:
- ข้าม map = โหลดฉากใหม่
- ใช้ fade/loading สั้นได้
- แต่ละ map เป็น room/channel แยก
- ผู้เล่นเห็นกันเฉพาะใน map/channel เดียวกัน

ไม่ทำใน phase แรก:
- seamless open world
- world streaming ไร้รอยต่อ
- map chunk streaming ขนาดใหญ่แบบ open world

Tech ต้องรองรับ:
- map room
- channel instance
- player transfer
- party channel sync
- world boss / event special channel
- spawn manager per room/channel

---

## 57.4 Weird Map Behavior

Decision สำหรับ launch:

> **Level Design + Simple Scripted Triggers เท่านั้น**

ใช้ได้:
- ทางเดินวน
- ทางลับ
- one-way path บางจุด
- fog of war
- minimap ไม่แสดง secret
- clue ว่า “แผนที่จับตำแหน่งไม่ได้”
- trigger volume เฉพาะจุด

ไม่ทำใน launch:
- minimap บิด real-time
- UI เพี้ยน dynamic
- teleport หลอกผู้เล่นแบบระบบใหญ่
- geometry เปลี่ยนตามเงื่อนไขซับซ้อน

---

## 57.5 Server-wide Secret Milestones

Decision:

> **Future / Post-launch**

Launch ทำเฉพาะ:
- local/simple secret ต่อ character
- เดินวนหิน 3 รอบ
- คุย NPC ตามเงื่อนไข
- ใช้ item เปิด clue
- hidden route
- local lore/quest secret

ยังไม่ทำใน launch:
- ห้องชื่อผู้เล่นคนแรกทั้ง server
- secret ที่เปลี่ยนถาวรทั้ง server
- global milestone trigger ซับซ้อน
- reward เฉพาะ first server player แบบ custom

Future:
- ให้ reuse Hall of Fame / Eternal Record / Announcement system

---

## 57.6 Weekly World Condition

Decision:

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

ไม่ทำ phase แรก:
- เปลี่ยน tilemap จริงทั้ง map
- สลับ geometry ใหญ่
- pathfinding เปลี่ยนหนัก

---

## 57.7 Risk Zone / PvP Boundary

Decision:

> **Sub-zone based Risk/PvP**

กฎ:
- safe camp ปิด PvP เสมอ
- risk pocket เปิด PvP/risk ตาม config
- boss/event zone เปิดตาม event rule
- warning ก่อนเข้า risk pocket
- Bot เข้าได้เฉพาะ opt-in
- ตายไม่เสียของ / เงิน / EXP / material

ตัวอย่าง Map 7:
- SW ชุมชนผลึก = safe camp
- C ทุ่งผลึกร้าว = farming/risk light
- E risk pocket = PvP/risk enabled
- S boss zone = ตาม event rule

---

## 57.8 Elite / Risk Pocket Spawn

Decision:

> **Fixed Pocket + Random Spawn Point inside Pocket**

กฎ:
- elite มี allowed spawn zone
- สุ่มตำแหน่งใน zone นั้น
- respawn window configurable
- บาง elite มี patrol path สั้น ๆ
- rare elite อาจมีหลาย possible pocket แต่ยังอยู่ใน map/zone ที่กำหนด

---

## 57.9 Final Tech Answer

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

---

# 58. Current Scope Lock After v13

หลัง v13 scope สำหรับ tech foundation ล็อกแล้วว่า:

- PixiJS 8 + Next.js
- True 2D Isometric Pixel Art
- frame-by-frame sprite
- 5-dir + mirror animation baseline
- separated map rooms/channels
- Map 1–10 launch scope
- local/simple secrets launch scope
- server-wide milestone secret เป็น future
- Weekly condition เปลี่ยนบน layout เดิม
- Risk/PvP เป็น sub-zone
- Elite spawn ใน fixed pocket แบบสุ่มจุดภายใน

สถานะ:

> ทีม tech สามารถเริ่มออกแบบ engine foundation ได้โดยไม่ต้องเดาเรื่องกล้อง, grid, room, animation direction, minimap behavior, secret milestone, risk boundary แล้ว

---

# 59. Runtime, Bot, Channel & Schema Ownership Decisions

> รายละเอียดฉบับเต็มแยกไฟล์อยู่ที่: `deungpu_RUNTIME_BOT_CHANNEL_AND_SCHEMA_OWNERSHIP_DECISIONS_v1.md`

section นี้เพิ่ม decision สำหรับ P1/P2 ที่ไม่ได้ block P0 แต่ควรล็อกก่อน map/movement/save/bot/channel implementation

ครอบคลุม:
- reconnect behavior
- offline bot materialization
- channel selection / party sync
- skill model / design knobs ownership

---

## 59.1 Reconnect Behavior

Decision:

> **30s Grace Reconnect → same room/channel/position if valid, otherwise map safe camp**

Behavior:

```txt
Reconnect <= 30s:
- พยายามกลับ room/channel เดิม
- กลับตำแหน่งเดิม
- party/channel เดิม
- restore state เท่าที่ server ยัง hold ได้

Reconnect > 30s:
- กลับ safe camp / จุดวาปของ map นั้น

Reconnect invalid / room closed / state corrupt:
- กลับ safe camp ของ map นั้น
- กรณี severe invalid เท่านั้นค่อย fallback เมืองหลัก
```

Guardrails:
- ไม่ guarantee ว่ามอนเดิมที่ตีอยู่ยังอยู่ครบ 100%
- server state ปัจจุบันถือเป็น source of truth
- reconnect ห้ามใช้เป็น exploit หนีตาย
- combat/PvP/boss critical state สามารถบังคับ safe camp ได้ถ้าจำเป็น
- ถ้าตำแหน่งเดิม invalid ให้ย้ายไป safe camp

Tech impact:
- Colyseus room session timeout
- player seat reservation
- short-lived state hold
- reconnection token
- position validation
- safe camp fallback
- anti-exploit checks

---

## 59.2 Offline Pro Bot Materialization

Decision:

> **Online bot = materialized in real map**  
> **Offline Pro bot = background worker simulation by default**

Behavior:

```txt
Online Bot:
- ผู้เล่นยัง online
- ตัวละครอยู่ใน map จริง
- ผู้เล่นอื่นเห็นได้
- ใช้ spawn จริง / แย่งมอนจริงตามปกติ

Offline Bot:
- เจ้าของ logout แล้ว
- bot รันเป็น worker/background simulation
- ตัวละครไม่ materialize ใน public map โดย default
- ไม่แย่ง spawn pocket กับผู้เล่นจริงโดยตรง
- output ถูกคุมด้วย route/density/economy config
```

เหตุผล:
- กัน public map เต็มไปด้วย offline bot
- ลด server/pathfinding/visual load
- ลดปัญหา bot แย่งมอนกับผู้เล่นจริง
- คุม economy output ง่ายกว่า
- เหมาะกับ Pro bot 12 ชั่วโมง

Ghost/private bot visualization:
- เป็น future optional
- ไม่ใช่ foundation ตอนนี้
- ถ้าทำภายหลัง ไม่ควรกิน spawn จริงของ public map

---

## 59.3 Channel Selection / Room Assignment

Decision:

> **Default Auto-assign + Party Sync. Manual Channel Selection = Later/Future UI**

Behavior:

```txt
Solo player เข้า map:
- auto-assign channel ตาม load / population / availability

Party player เข้า map:
- พยายามส่งสมาชิก party ไป channel เดียวกัน
- ถ้า channel เต็ม ให้หา channel ที่รองรับ party ทั้งกลุ่ม
- ถ้าสมาชิกอยู่คนละ channel ให้มี action/prompt “ย้ายไปหา party”

World boss / event:
- อาจมี event channel / priority channel แยก
```

Phase แรก:
- ไม่จำเป็นต้องมี full manual channel selector
- แสดง channel ปัจจุบัน เช่น `CH.1`
- engine ควรออกแบบให้เพิ่ม manual switch ภายหลังได้

Guardrails:
- party sync สำคัญกว่า solo auto-assign
- ไม่ควรย้าย channel ระหว่าง combat
- ไม่ควรใช้ channel switch เพื่อหนี PvP / หนี death / รีเซ็ตมอน exploit
- world boss/event อาจ lock channel ตาม event rule

---

## 59.4 Skill Model / Design Knobs Ownership

Problem:
- checkpoint §50 มี Skill Data Model
- checkpoint §48 มี Design Knobs
- tech doc มี skill implementation และ knobs table ที่ใกล้กัน
- ถ้าไม่ล็อก ownership อนาคต field อาจชื่อไม่ตรง เช่น `baseMultiplier` vs `damage_multiplier`

Decision:

> **checkpoint §50.1 = canonical Skill Data Model and field naming source of truth**  
> **checkpoint §48 = canonical Design Knobs source of truth**

Design owns:
- skill fields มีอะไรบ้าง
- meaning ของ field
- ค่า balance
- multiplier
- cooldown
- radius
- maxTargets
- targetShape
- damage type
- status effect intent
- botUsageRule intent
- guardrails
- design knobs
- balance ranges

Tech owns:
- implementation
- runtime behavior
- client rendering pipeline
- server validation
- server calculation
- persistence
- DB/cache
- schema validation
- serialization
- migration/versioning
- performance optimization
- network sync

Field naming rule:

```txt
Field names in code/JSON must follow checkpoint §50.1.
Tech docs should reference checkpoint §50.1 instead of redefining fields with new names.
```

Adding new fields:
1. เสนอ field ใหม่
2. design เคาะความหมาย
3. update canonical schema ใน design checkpoint
4. tech ค่อย implement
5. migration/versioning ต้องบันทึก

Final rule:

> **Design owns what the skill is and how it should behave.**  
> **Tech owns how the approved skill schema runs in code.**  
> **Field names must follow checkpoint §50.1 as the single source of truth.**

---

## 59.5 Final Tech Summary

```txt
1. Reconnect:
Use 30s grace reconnect. If valid, return to same map/channel/position. If invalid or expired, fallback to the map safe camp. City fallback only for severe invalid cases.

2. Offline Bot:
Online bot is materialized in the real map. Offline Pro bot runs as background worker simulation by default, does not appear in public map, and does not directly compete for real spawn pockets. Ghost/private bot visualization is future optional.

3. Channel:
Default is auto-assign. Party members must be synced into the same channel automatically where possible. Manual channel selection can be added later, but is not required for P1.

4. Skill/Knobs Ownership:
Checkpoint §50.1 is the canonical Skill Data Model and field naming source of truth.
Checkpoint §48 is the canonical Design Knobs source of truth.
Design owns fields, meanings, balance values, and guardrails.
Tech owns implementation, validation, persistence, runtime behavior, and performance.
Tech docs should reference checkpoint §50.1 instead of redefining fields with new names.
```

---

# 60. Current Scope Lock After v14

หลัง v14 scope สำหรับ tech/design handoff ล็อกเพิ่มเติมว่า:

- P0 engine foundation เริ่มได้จาก v13 decision แล้ว
- P1 reconnect ใช้ 30s grace reconnect กลับ room/channel/position เดิมถ้า valid
- P1 channel ใช้ auto-assign + party sync
- P1/P2 offline Pro bot ใช้ background worker simulation เป็น default
- public map ไม่ต้อง materialize offline bot
- manual channel selection เป็น later/future UI
- skill field naming ยึด checkpoint §50.1 เป็น source of truth
- design owns skill semantics/balance/knobs
- tech owns implementation/runtime/persistence/performance
- tech docs ต้อง reference schema เดิม ไม่ redefine field name ใหม่

สถานะ:

> v14 ปิด decision เพิ่มสำหรับ reconnect, offline bot, channel assignment และ skill/knob ownership แล้ว โดยไม่เปลี่ยน foundation หลักของ v13

---

# 61. P0 Scope Lock

> รายละเอียดฉบับเต็มแยกไฟล์อยู่ที่: `deungpu_P0_SCOPE_LOCK_v1.md`

P0 ถูกล็อกเป็น:

> **Engine Foundation Vertical Slice**

P0 ไม่ใช่เกมเต็ม  
P0 ไม่ใช่ alpha gameplay  
P0 ไม่ใช่ production Map 1–10

P0 มีไว้พิสูจน์ว่าแกน engine ของดึ๋งปุ๊ทำงานจริงบน browser

---

## 61.1 P0 Mission

P0 ต้องตอบคำถามนี้ให้ได้:

```txt
เรา render โลก True 2D Isometric Pixel Art ได้ไหม?
ผู้เล่นเดินใน map prototype ได้ไหม?
depth sorting ถูกไหม?
sprite 5-dir + mirror ทำงานไหม?
server room รับผู้เล่นหลายคนได้ไหม?
map/channel foundation พร้อมต่อ P1 ไหม?
```

---

## 61.2 P0 Prototype Map

P0 ใช้ map prototype:

> **P0 Test Field — ขอบเมืองมนุษย์ Prototype**

อิง Map 1: ขอบเมืองมนุษย์

ต้องมี:
- diamond tile grid
- safe spawn point
- collision ง่าย
- props สำหรับ depth sorting
- farming pocket จำลอง 2–3 จุด
- dummy mob 1–2 type

ไม่ต้องทำ Map 1 production จริง

---

## 61.3 P0 Deliverables

P0 ต้องส่งมอบ:
1. Next.js + PixiJS 8 runtime foundation
2. Isometric projection / diamond grid / fixed camera
3. Map config loader
4. Local player movement prototype
5. Sprite animation 5-dir + mirror
6. Multiplayer room skeleton
7. Channel stub
8. Dummy mob pocket spawn
9. Combat stub
10. Debug overlay

---

## 61.4 P0 Non-goals

ห้ามลากเข้ามาใน P0:
- account/login เต็มระบบ
- save/persistence
- inventory/equipment
- market/trade/auction
- bot จริง/offline Pro bot
- Auto Pilot/Report
- enhancement/แกร่ง
- guild/party เต็มระบบ
- PvP/risk zone จริง
- Hall of Fame
- world condition จริง
- Map 1–10 production ทั้งหมด
- boss mechanic จริง
- mobile polish เต็ม
- admin/backoffice
- monetization
- anti-cheat เต็มระบบ
- final art production

กฎ:

> ถ้า feature ไม่ช่วยพิสูจน์ renderer / movement prototype / room foundation ให้เลื่อนไป P1+

---

## 61.5 P0 Done Definition

P0 ถือว่าเสร็จเมื่อ:

```txt
1. เปิดเกมบน browser ได้
2. PixiJS scene render true isometric diamond grid ได้
3. player เดินใน prototype map ได้
4. depth sorting ผ่าน prop/object test
5. sprite 5-dir + mirror ทำงาน
6. map ถูกโหลดจาก config
7. 2 browser join room เดียวกันแล้วเห็นกัน
8. channelId/roomId/mapId มีใน state/debug
9. dummy mobs spawn ใน pocket
10. combat stub เล่น effect/damage dummy ได้
11. debug overlay ใช้งานได้
12. ไม่มีระบบใหญ่เกิน scope ถูกลากเข้ามา
```

---

## 61.6 P0 Issue Breakdown

```txt
P0-01 Project Runtime Setup
P0-02 Isometric Coordinate System
P0-03 P0 Test Map Config
P0-04 Renderer Scene Graph & Depth Sorting
P0-05 Local Player Movement Prototype
P0-06 Sprite Animation Prototype
P0-07 Realtime Room Skeleton
P0-08 Channel Stub
P0-09 Dummy Mob Pocket Spawn
P0-10 Combat Stub
P0-11 Debug Overlay
P0-12 P0 Handoff Check
```

---

## 61.7 P0 Claude Code Execution Prompt

```txt
You are Claude Code working on Deungpu P0.

Do not invent new game design.
Do not implement systems outside P0.

Read docs first:
- docs/design/PROJECT_CHECKPOINT_CURRENT.md
- docs/design/P0_SCOPE_LOCK.md
- docs/design/ENGINE_FOUNDATION_DECISIONS.md
- docs/design/MAP_SCALE_AND_SPAWN_DENSITY_SPEC.md

P0 goal:
Build the browser engine foundation vertical slice:
PixiJS 8 + Next.js, true 2D isometric diamond grid, fixed camera, map config loader, local movement prototype, 5-dir + mirror sprite animation, realtime room skeleton, channel stub, dummy mob pockets, combat stub, debug overlay.

Rules:
- Keep values configurable.
- Do not hardcode final balance.
- Do not build inventory, economy, bot, market, account, save, guild, PvP, or production Map 1–10.
- If a decision affects design, ask first.
- Keep changes scoped to one issue at a time.
- Summarize changed files and why.
```

---

# 62. Current Scope Lock After v15

หลัง v15 scope สำหรับทีม tech ล็อกว่า:

- P0 = Engine Foundation Vertical Slice
- P0 map = P0 Test Field — ขอบเมืองมนุษย์ Prototype
- P0 ทำ renderer/movement/animation/room/channel/mob/combat/debug foundation เท่านั้น
- P0 ไม่ทำ account/save/bot/market/economy/inventory/guild/PvP/production maps
- P1 ค่อยทำ production map/movement/reconnect/channel assignment/party sync
- P2 ค่อยทำ save/persistence/offline bot/inventory/economy foundation

สถานะ:

> ทีม tech สามารถเริ่ม P0 ได้ทันทีด้วย issue P0-01 ถึง P0-12
