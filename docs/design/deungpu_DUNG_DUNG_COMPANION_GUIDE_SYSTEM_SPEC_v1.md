# ดึ๋งปุ๊ — Dung-Dung Companion & Voluntary Guidance System Specification

**File:** `deungpu_DUNG_DUNG_COMPANION_GUIDE_SYSTEM_SPEC_v1.md`  
**Version:** 1.0  
**Status:** Owner-approved design direction / Ready for technical breakdown  
**Audience:** Game Design, Client, Server, UI, QA, Content, Analytics  
**Project:** ดึ๋งปุ๊  
**Last updated:** 2026-07-12

---

## 0. วัตถุประสงค์

เอกสารนี้เป็น Source of Truth สำหรับระบบ **“ดึ๋งๆ”** สิ่งมีชีวิตตัวเล็กที่ติดตามผู้เล่น และทำหน้าที่เป็นทางเข้าหลักของระบบช่วยเหลือแบบสมัครใจ

เป้าหมายคือให้ทีม Tech นำไป implement ได้โดยไม่ต้องเดาเรื่อง:

- ระบบช่วยเหลือควรทำงานเมื่อใด
- เมื่อใดห้ามแทรกแซงผู้เล่น
- วิธีตอบคำถาม “เล่นยังไง”
- วิธีตอบคำถาม “ทำอะไรต่อดี”
- วิธีแสดงคำแนะนำโดยไม่บังคับ
- สถานะและพฤติกรรมของดึ๋งๆ
- หน้าจอและองค์ประกอบ UI แม้ไม่มี Figma
- Data model, rule engine, priority, cooldown และ telemetry
- Edge case และ acceptance criteria

เอกสารนี้กำหนด **Design Logic** และพฤติกรรมที่ต้องได้ ส่วน Tech เลือกวิธี implement ภายในได้ตามสถาปัตยกรรมของโปรเจกต์

---

# 1. Design Pillars

## 1.1 หลักสูงสุด

> เกมจะไม่ยื่นมือไปลากผู้เล่น แต่จะมีมือวางอยู่ตรงนั้น เมื่อผู้เล่นต้องการจึงค่อยจับ

ระบบต้องรองรับผู้เล่น 3 กลุ่มพร้อมกัน:

1. **ผู้เล่นที่อยากได้คำแนะนำ**
   - เข้าถึงความช่วยเหลือได้ง่าย
   - ได้คำตอบตามสถานะจริงของตัวเอง
   - ไม่ต้องอ่านคู่มือยาว

2. **ผู้เล่นที่พอเล่นได้แต่ติดบางจุด**
   - ขอ Hint เฉพาะเรื่องได้
   - เห็นเหตุผลของคำแนะนำ
   - ปิดระบบได้ทันที

3. **ผู้เล่นสายทดลอง สายวิจัย สายค้นเอง**
   - เล่นได้โดยไม่ถูก Tutorial, Arrow, Popup หรือ Forced Path รบกวน
   - ไม่มีระบบลงโทษเพราะไม่ใช้ดึ๋งๆ
   - ไม่มี Content สำคัญที่ถูกล็อกหลังการเปิดไกด์

## 1.2 กฎที่ห้ามละเมิด

- ห้ามเปิดหน้าต่างช่วยเหลือเองโดยไม่มีการกระทำจากผู้เล่น
- ห้ามยึดกล้อง ห้ามบังคับเดิน ห้ามบังคับกดปุ่ม
- ห้ามบังคับให้ผู้เล่นผ่าน Tutorial เพื่อออกสำรวจ
- ห้ามเสนอคำแนะนำซ้ำหลังผู้เล่นปฏิเสธในช่วง cooldown
- ห้ามแสดง Marker ของความลับโดยอัตโนมัติ
- ห้ามให้คำแนะนำที่ไม่สามารถทำได้จริง
- ห้ามใช้ข้อมูลที่ Server ยังไม่ยืนยัน
- ห้ามใช้คำแนะนำเพื่อผลักดันการซื้อของหรือ Paid Feature
- ห้ามทำให้การไม่ใช้ระบบช่วยเหลือเสียเปรียบด้านพลังหรือรางวัลหลัก

---

# 2. ตัวตนของ “ดึ๋งๆ”

## 2.1 บทบาทในโลก

ดึ๋งๆ คือสิ่งมีชีวิตลึกลับขนาดเล็กที่ผู้เล่นช่วยไว้ในช่วงต้นเกม จากนั้นมันเลือกติดตามผู้เล่นเอง

ดึ๋งๆ ไม่ใช่:

- Pet ต่อสู้
- Mount
- Item
- ระบบ Auto-play
- AI ที่ตัดสินใจแทนผู้เล่น
- Quest Marker ที่มีชีวิต

ดึ๋งๆ คือ:

- เพื่อนร่วมทาง
- Mascot ส่วนตัว
- ทางเข้าระบบช่วยเหลือ
- ผู้สังเกตการณ์ที่ “กระซิบ” มากกว่า “สั่ง”
- ตัวแทนของเกมที่เคารพเสรีภาพผู้เล่น

## 2.2 บุคลิกหลัก

- พูดน้อย
- ตอบสั้น
- ขี้สงสัย
- ขี้เล่น
- ไม่ตัดสินผู้เล่น
- ไม่ดุ
- ไม่เร่ง
- ไม่ขายของ
- ไม่แสดงความฉลาดเกินโลกของเกม
- แสดงอารมณ์ด้วยท่าทางมากกว่าข้อความ

## 2.3 รูปแบบภาษา

ดึ๋งๆ ใช้ประโยคสั้น 1–2 บรรทัดต่อครั้ง

ตัวอย่างที่ใช้ได้:

- “ดึ๋ง... จะไปไหนต่อดีนะ”
- “ตรงนี้ดูแรงไปนิด”
- “ของในกระเป๋าน่าจะช่วยได้”
- “เหมือนมีคนรอเราอยู่นะ”
- “พักก่อนก็ได้”
- “จะให้ดึ๋งๆ ใบ้ไหม”

รูปแบบที่ห้าม:

- “ตามลูกศรเพื่อไปยัง NPC เป้าหมาย”
- “คุณต้องทำภารกิจหลักต่อ”
- “กรุณาอัปเกรดอาวุธ”
- “แนะนำให้ซื้อแพ็กเกจ Pro”
- ข้อความยาวเกิน 160 ตัวอักษรใน bubble ปกติ

---

# 3. การได้พบดึ๋งๆ

## 3.1 Encounter แรก

ช่วงต้นเกมผู้เล่นพบดึ๋งๆ อยู่ในสถานการณ์ที่ต้องการความช่วยเหลือ เช่น:

- ถูกมอนสเตอร์ระดับต่ำล้อม
- ติดอยู่หลังสิ่งกีดขวาง
- หลบอยู่ใต้พุ่มไม้
- กำลังปกป้องของชิ้นเล็ก ๆ ที่ไม่เปิดเผยความหมายทันที

ผู้เล่นสามารถ:

- เข้าไปช่วย
- เดินผ่าน
- กลับมาช่วยภายหลัง

### กฎสำคัญ

- ห้ามล็อกทางหลักจนกว่าจะช่วย
- ห้ามขึ้น Popup “ช่วยดึ๋งๆ”
- ใช้เพียง animation, sound cue เบา และ world staging
- หากผู้เล่นไม่ช่วย ดึ๋งๆ จะยังไม่ติดตาม แต่เมนู Help พื้นฐานยังเข้าถึงได้จากระบบ
- เมื่อผู้เล่นช่วยสำเร็จ ดึ๋งๆ จะตามมาเองโดยไม่มีหน้าต่างยืนยันยาว

## 3.2 การผูกกับผู้เล่น

หลัง Encounter:

- ดึ๋งๆ เป็น companion เชิง cosmetic และ UX
- ไม่มี stat
- ไม่มี combat target
- ไม่โดน damage
- ไม่ block collision
- ไม่จำเป็นต้อง sync แบบ entity เต็มกับผู้เล่นคนอื่น
- ฝั่งอื่นอาจเห็นหรือไม่เห็นตาม budget และ setting

---

# 4. โหมดการช่วยเหลือ

## 4.1 ค่าเริ่มต้น

```text
Guidance Mode: Quiet
Hint Detail: Light
Navigation: Off
Auto Popups: Off
```

## 4.2 Guidance Mode

### A. `OFF`

- ดึ๋งๆ ยังคงเป็นเพื่อนร่วมทาง
- ไม่มี hint
- ไม่มี suggestion chip
- ไม่มี stuck detection prompt
- ผู้เล่นยังเปิดสมุดหรือถามเองได้

### B. `QUIET` — ค่าเริ่มต้น

- ไม่มี Popup อัตโนมัติ
- ดึ๋งๆ อาจแสดงท่าทางเงียบ ๆ
- เมื่อผู้เล่นกดเรียก จึงแสดงคำแนะนำ
- stuck detection แสดงได้เพียง icon เล็ก ไม่เปิดข้อความเอง

### C. `AVAILABLE`

- อนุญาตให้ดึ๋งๆ แสดง bubble สั้นมากเมื่อพบปัญหาชัดเจน
- มี global cooldown
- ผู้เล่นต้องกดเพื่อดูรายละเอียด
- ห้ามเกิน 1 proactive hint ต่อ 15 นาที

### D. `ACTIVE`

- สำหรับผู้เล่นที่ต้องการความช่วยเหลือมาก
- แนะนำได้บ่อยขึ้น แต่ยังห้าม takeover
- ห้ามเกิน 1 proactive hint ต่อ 5 นาที
- ไม่เปิด Auto Pilot โดยอัตโนมัติ

> โหมดต้องเปลี่ยนได้ทันที และมี Preview ว่าแต่ละระดับทำอะไร

## 4.3 Hint Detail Level

- `RIDDLE` — ใบ้เชิงโลก ไม่บอกตำแหน่งตรง
- `LIGHT` — บอกหมวดพื้นที่หรือวิธีคิด
- `DIRECT` — บอกเป้าหมายและวิธีทำชัดเจน
- `NAVIGATE` — แสดงเส้นทางหรือเป้าหมายบนแผนที่เมื่อผู้เล่นกดยืนยัน

ระดับนี้ใช้เฉพาะเมื่อผู้เล่นร้องขอ ห้ามระบบเลื่อนระดับเอง

---

# 5. จุดเข้าถึงระบบ

ระบบต้องมีทางเข้าหลัก 4 จุด

## 5.1 กดที่ดึ๋งๆ

```text
┌─────────────────────────────┐
│ ดึ๋งๆ                        │
│ วันนี้อยากรู้อะไร?           │
├─────────────────────────────┤
│ [ ทำอะไรต่อดี ]             │
│ [ เล่นระบบนี้ยังไง ]         │
│ [ อยากเก่งขึ้น ]             │
│ [ อยากหาเงิน/ของ ]           │
│ [ อยากสำรวจ ]               │
│ [ เปิดสมุดนักเดินทาง ]       │
└─────────────────────────────┘
```

Desktop:

- เปิดเป็น panel ขนาดประมาณ 360–420 px ด้านขวา
- ไม่บังกลางจอ
- ปิดด้วย Esc หรือกดนอก panel

Mobile:

- เปิดเป็น bottom sheet สูงไม่เกิน 70% ของหน้าจอ
- สามารถลากลงเพื่อปิด

## 5.2 ปุ่ม HUD

- ใช้ไอคอนรูปดึ๋งๆ ขนาดชัดเจนแต่ไม่เด่นเกิน Action HUD
- Desktop: มุมขวาบนหรือขวาล่าง ห่างจาก skill bar
- Mobile: อยู่ใน utility cluster
- มี unread dot เฉพาะเมื่อมีคำแนะนำใหม่ที่ผู้เล่นเคยขอไว้
- ห้าม badge กระพริบ

## 5.3 สมุดนักเดินทาง

เปิดหน้ารวม:

- คำแนะนำปัจจุบัน
- วิธีเล่นระบบต่าง ๆ
- เส้นทางที่ผู้เล่นเลือกไว้
- บันทึกที่ค้นพบ
- Achievement
- ดัชนีโลก

## 5.4 Context Help

หน้าระบบสำคัญ เช่น Inventory, Skill, Equipment, Market มีไอคอน `?` เล็ก

เมื่อกด:

- เปิดคำอธิบายเฉพาะหน้าปัจจุบัน
- ใช้ข้อมูลจาก Help Article Registry
- ไม่เปลี่ยนหน้าผู้เล่นโดยอัตโนมัติ

---

# 6. คำถาม “เล่นยังไง”

## 6.1 Intent หลัก

ระบบต้องรองรับหมวด:

- การควบคุม
- ต่อสู้
- สกิล
- อุปกรณ์
- กระเป๋า
- Quest
- Party
- Map และ Channel
- Bot/ผู้ช่วยนักล่า
- Market
- Enhancement
- Social
- Settings
- Mobile controls

## 6.2 รูปแบบคำตอบ

แต่ละคำตอบแบ่ง 3 ชั้น:

### ชั้น 1 — One-line answer

ไม่เกิน 120 ตัวอักษร

### ชั้น 2 — Steps

ไม่เกิน 4 ขั้นตอนต่อหน้า

### ชั้น 3 — More detail

เปิดได้เมื่อกด “ดูเพิ่ม”

ตัวอย่าง:

```text
ใส่อุปกรณ์ยังไง

1. เปิดกระเป๋า
2. เลือกอุปกรณ์
3. กด “สวมใส่”

[เปิดกระเป๋า] [ดูรายละเอียด]
```

## 6.3 Action Button

Action button อนุญาตเฉพาะ:

- เปิดหน้าระบบ
- ปักหมุดตำแหน่ง
- เปิดแผนที่
- เลือก Quest
- แสดง tutorial overlay แบบผู้เล่นกดยืนยัน

ห้าม:

- ซื้อของ
- ใช้เงิน
- ตีบวก
- ทิ้งของ
- ย้ายของ
- เปลี่ยน build
- เริ่ม Auto Pilot
- เข้า PvP
- ยืนยัน action ที่มีความเสี่ยง

---

# 7. คำถาม “ทำอะไรต่อดี”

## 7.1 หลักการ

ระบบไม่ตอบเป็น Objective เดียวเสมอ แต่เสนอ **ทางเลือก 2–4 แบบ** ตามแรงจูงใจ

หมวดคำแนะนำ:

- Story
- Power
- Explore
- Economy
- Social
- Short Session
- Long Session
- Collection
- Event
- Recovery

## 7.2 Input ที่ระบบใช้

```text
Player Identity
- playerId
- characterId
- classId
- level
- playtime

Progression
- mainQuestState
- sideQuestState
- unlockedMaps
- unlockedSystems
- skillPoints
- equipmentScore
- currentMap

Inventory
- freeSlots
- consumables
- upgradeMaterials
- betterEquipmentCandidates

Session
- sessionDuration
- recentDeaths
- recentDamageEfficiency
- repeatedPathing
- idleDuration
- currentPartyState

World
- activeEvents
- bossAvailability
- merchantAvailability
- weather/worldCondition
- channelStatus

Preference
- guidanceMode
- hintDetail
- selectedPlayIntent
- dismissedSuggestionTags
```

## 7.3 Recommendation Output

```ts
type Recommendation = {
  id: string
  category: 'story' | 'power' | 'explore' | 'economy' | 'social' |
            'short_session' | 'long_session' | 'collection' | 'event' | 'recovery'
  title: string
  summary: string
  reason: string
  estimatedMinutes?: number
  requirements: Requirement[]
  destination?: DestinationRef
  actionType: 'open_ui' | 'pin_map' | 'select_quest' | 'show_steps' | 'none'
  priorityScore: number
  confidence: number
  expiresAt?: string
  sourceRuleId: string
  riskLevel: 'none' | 'low' | 'medium' | 'high'
}
```

## 7.4 การจัดอันดับ

```text
priorityScore =
  relevance
+ feasibility
+ playerIntentMatch
+ urgency
+ novelty
- repetitionPenalty
- dismissalPenalty
- riskPenalty
```

กฎ:

- สิ่งที่ทำไม่ได้ต้องถูกตัดออกก่อนจัดอันดับ
- ห้ามแนะนำ Content ที่ยังล็อก
- ห้ามแนะนำพื้นที่ที่ระดับอันตรายเกิน threshold โดยไม่เตือน
- ห้ามแนะนำซ้ำจากครั้งก่อนเกิน 2 ครั้งติด
- ต้องมีอย่างน้อย 1 ตัวเลือกที่ใช้เวลาไม่เกิน 10 นาทีเมื่อเป็นไปได้
- ต้องมี “ไม่เอาตอนนี้” เสมอ

## 7.5 ตัวอย่างผลลัพธ์

```text
ดึ๋งๆ คิดว่าตอนนี้มี 3 ทาง

[เนื้อเรื่อง]
ไปพบป้าปุ๊ที่เมืองมนุษย์
เหตุผล: ภารกิจหลักพร้อมส่ง
ประมาณ 3 นาที

[เพิ่มพลัง]
ลองสวมดาบที่เพิ่งได้
เหตุผล: พลังโจมตีสูงกว่าของเดิม 18%

[เล่นสั้น ๆ]
ล่าหมูพองอีก 6 ตัว
เหตุผล: ใกล้ครบภารกิจรายวัน
ประมาณ 7 นาที
```

---

# 8. Player Intent

ผู้เล่นเลือกเจตนาการเล่นได้จากสมุด:

- “อยากตามเนื้อเรื่อง”
- “อยากเก่งขึ้น”
- “อยากหาเงิน”
- “อยากหาไอเทม”
- “อยากสำรวจ”
- “อยากเล่นกับเพื่อน”
- “มีเวลาแป๊บเดียว”
- “วันนี้ปล่อยไหล”

กฎ:

- มีอายุเฉพาะ session หรือจนกว่าผู้เล่นจะเปลี่ยน
- ไม่ล็อก Content
- ไม่เปลี่ยน Quest อัตโนมัติ
- ใช้เป็นเพียงน้ำหนักใน recommendation

---

# 9. Stuck Detection แบบไม่รบกวน

## 9.1 เหตุการณ์ที่ตรวจจับได้

- ตายจากศัตรูชนิดเดิม 3 ครั้งใน 15 นาที
- ทำ damage ต่ำกว่า baseline ต่อเนื่อง
- เดินวนในพื้นที่เดิม
- Quest สำเร็จแต่ไม่ส่งเป็นเวลานาน
- กระเป๋าเต็มหลายครั้ง
- มีอุปกรณ์ดีกว่าแต่ยังไม่สวม
- Skill point ค้าง
- อยู่ในพื้นที่สูงกว่าระดับมาก
- พยายามใช้ action ที่ล็อกซ้ำหลายครั้ง
- เปิดเมนูเดิมหลายรอบแล้วออกโดยไม่ทำอะไร
- ยืนนิ่งนานในพื้นที่อันตราย

## 9.2 ระดับการตอบสนอง

### Level 0 — Observe

บันทึก telemetry เท่านั้น

### Level 1 — Body language

ดึ๋งๆ มอง, กระโดด, เอียงหัว โดยไม่มีข้อความ

### Level 2 — Tiny icon

มีไอคอน `...` เหนือดึ๋งๆ ไม่เกิน 10 วินาที

### Level 3 — Short bubble

อนุญาตเฉพาะ Guidance Mode AVAILABLE/ACTIVE

> “ตรงนี้ดูหนักไปนิด จะให้ดึ๋งๆ ช่วยดูไหม”

### Level 4 — Requested help

เกิดเมื่อผู้เล่นกดเท่านั้น

## 9.3 Cooldown

```text
globalProactiveCooldown:
- QUIET: disabled
- AVAILABLE: 15 minutes
- ACTIVE: 5 minutes

sameRuleCooldown: 30 minutes
dismissedTagCooldown: 24 hours
deathHintCooldown: 20 minutes
secretHintCooldown: disabled by default
```

## 9.4 การปฏิเสธ

ทุก proactive hint ต้องมี:

- “ดูคำแนะนำ”
- “ไม่เอาตอนนี้”
- “ไม่ต้องเตือนเรื่องนี้อีก”

ระบบต้องจำ dismissal ต่อ tag และต่อ character

---

# 10. Secret และ Exploration Hint

ดึ๋งๆ ห้ามบอก Secret โดยอัตโนมัติ

อนุญาตเฉพาะ:

- animation มองทิศ
- หยุดชั่วคราว
- สนใจ object
- เสียงเบามาก
- ผู้เล่นเปิดโหมด `RIDDLE` และกดถามเอง

ระดับคำใบ้:

```text
RIDDLE:
“ตรงที่ลมไม่พัด มักมีอะไรซ่อนอยู่”

LIGHT:
“ลองดูแถวหน้าผาด้านตะวันตกของ Map 2”

DIRECT:
“ตรวจสอบก้อนหินรูปจันทร์ใกล้หน้าผา”

NAVIGATE:
ปักหมุดวงกว้าง ไม่แสดงจุด exact สำหรับ Secret เว้นแต่ดีไซน์กำหนด
```

---

# 11. Navigation

## 11.1 ประเภท

- Map pin
- Region highlight
- Breadcrumb path
- World map route
- Auto Pilot — แยกจากระบบนี้และต้องยืนยัน

## 11.2 กฎ

- ค่าเริ่มต้นปิด
- Navigation เปิดเฉพาะคำขอของผู้เล่น
- ห้ามเปิดเข้าพื้นที่ PvP โดยไม่เตือน
- ห้ามข้าม requirement
- ห้าม teleport
- ห้ามการันตีว่าเส้นทางปลอดภัย
- เมื่อเป้าหมายเปลี่ยนหรือหมดอายุ ต้อง clear marker

---

# 12. State Machine ของดึ๋งๆ

```text
FOLLOW
 ├─> IDLE_PLAY
 ├─> OBSERVE_OBJECT
 ├─> SLEEP
 ├─> REACT_COMBAT
 ├─> REACT_LOOT
 ├─> REACT_PLAYER_DOWN
 ├─> OFFER_HELP_INDICATOR
 ├─> HELP_PANEL_OPEN
 └─> HIDDEN
```

## 12.1 State Priority

```text
1. HIDDEN_BY_SYSTEM
2. CUTSCENE
3. COMBAT_SAFETY
4. HELP_PANEL_OPEN
5. PLAYER_DOWN
6. IMPORTANT_WORLD_REACTION
7. FOLLOW
8. IDLE_PLAY
9. SLEEP
```

## 12.2 Follow Behavior

- อยู่ห่างผู้เล่นประมาณ 0.6–1.2 tile
- ไม่บังตัวละคร
- ไม่บังศัตรู
- เลือกด้านตรงข้ามกับ cursor target เมื่อเป็นไปได้
- teleport catch-up เมื่อห่างเกิน threshold
- ไม่มี collision
- depth sorting ตาม world position
- ในพื้นที่แออัดลด animation

## 12.3 Visibility

ดึ๋งๆ ถูกซ่อนเมื่อ:

- Competitive PvP ที่ต้องการความชัด
- Cutscene
- Boss mechanic ที่ screen clutter สูง
- ผู้เล่นปิด companion visibility
- low performance mode ตาม config

---

# 13. UI Specification

## 13.1 Minimum Visual Rules

- Panel พื้นหลังทึบ 92–96%
- ขอบมน 8–12 px
- เส้นขอบ 1 px
- หัวข้อ 18–20 px
- เนื้อหา 14–16 px
- ปุ่มสูงอย่างน้อย 40 px desktop / 48 px mobile
- ระยะห่างองค์ประกอบ 8/12/16 px
- ห้ามใช้สีแดงกับ action ปกติ
- Recommendation card ใช้ icon หมวด ไม่พึ่งสีอย่างเดียว

## 13.2 Panel หลัก Desktop

```text
┌────────────────────────────────────────┐
│ ดึ๋งๆ                         [—] [X]  │
│ “จะให้ช่วยเรื่องไหนดี”                │
├────────────────────────────────────────┤
│ [ทำอะไรต่อดี]                          │
│ [เล่นระบบนี้ยังไง]                     │
│ [อยากเก่งขึ้น]  [อยากหาเงิน]           │
│ [อยากสำรวจ]    [เล่นกับเพื่อน]         │
├────────────────────────────────────────┤
│ คำแนะนำล่าสุด                          │
│ ┌────────────────────────────────────┐ │
│ │ ไปพบป้าปุ๊                         │ │
│ │ เพราะภารกิจพร้อมส่ง                │ │
│ │ [นำทาง] [ดูเหตุผล] [ไม่เอา]        │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

## 13.3 Recommendation Card

ต้องมี:

- category icon
- title
- summary
- reason expandable
- estimated time ถ้ามี
- risk badge ถ้ามี
- primary action
- dismiss action

ห้ามมีเกิน 4 cards ในครั้งเดียว

## 13.4 Empty State

> ตอนนี้ดึ๋งๆ ยังไม่มีอะไรเร่งด่วน ลองสำรวจต่อ หรือเลือกสิ่งที่อยากทำจากด้านบน

## 13.5 Error State

ห้ามแสดง error เชิงเทคนิค

> “ดึ๋งๆ ยังนึกไม่ออก ลองใหม่อีกครั้งนะ”

พร้อม retry และ fallback articles

---

# 14. Content Registry

## 14.1 Help Article

```ts
type HelpArticle = {
  id: string
  version: number
  title: string
  category: string
  summary: string
  steps: HelpStep[]
  relatedArticles: string[]
  unlockRequirement?: Requirement[]
  applicableScreens?: string[]
  action?: SafeAction
  localizationKeyPrefix: string
  status: 'draft' | 'published' | 'retired'
}
```

## 14.2 Recommendation Rule

```ts
type RecommendationRule = {
  id: string
  version: number
  enabled: boolean
  category: string
  conditions: ConditionGroup
  exclusions?: ConditionGroup
  score: ScoreDefinition
  recommendationTemplateId: string
  cooldownSeconds: number
  maxTimesPerDay?: number
  tags: string[]
  validFrom?: string
  validUntil?: string
}
```

---

# 15. Server / Client Ownership

## 15.1 Server authoritative

- player progression
- quest state
- inventory truth
- equipment truth
- world event availability
- unlocks
- recommendation requirement validation
- persistent dismissals
- analytics identifiers
- risk flags

## 15.2 Client-side

- panel state
- animation
- companion follow movement
- presentation order after server eligibility
- local help article rendering
- temporary session intent
- non-authoritative stuck signals
- UI target highlight

## 15.3 Hybrid

- client detects candidate stuck event
- server confirms state where needed
- recommendation service returns eligible results
- client renders no more than configured count

---

# 16. API Contract ตัวอย่าง

## 16.1 Request Recommendations

```json
POST /guidance/recommendations
{
  "characterId": "char_123",
  "intent": "power",
  "context": {
    "screen": "world",
    "currentMapId": "map_01",
    "sessionMinutes": 24
  }
}
```

## 16.2 Response

```json
{
  "generatedAt": "2026-07-12T10:00:00Z",
  "expiresAt": "2026-07-12T10:05:00Z",
  "items": [
    {
      "id": "rec_equip_better_sword",
      "category": "power",
      "title": "ลองสวมดาบที่เพิ่งได้",
      "summary": "ดาบในกระเป๋าแรงกว่าของเดิม",
      "reason": "พลังโจมตีพื้นฐานสูงกว่า 18%",
      "estimatedMinutes": 1,
      "actionType": "open_ui",
      "priorityScore": 82,
      "confidence": 0.97,
      "riskLevel": "none"
    }
  ]
}
```

## 16.3 Dismiss

```json
POST /guidance/dismiss
{
  "characterId": "char_123",
  "recommendationId": "rec_equip_better_sword",
  "dismissType": "not_now"
}
```

---

# 17. Telemetry

Events ขั้นต่ำ:

```text
dungdung_opened
guidance_mode_changed
guidance_intent_selected
recommendation_generated
recommendation_viewed
recommendation_reason_opened
recommendation_accepted
recommendation_dismissed
recommendation_completed
help_article_opened
help_action_clicked
stuck_signal_detected
proactive_hint_shown
proactive_hint_ignored
proactive_hint_disabled
```

Metric ที่ควรดู:

- Recommendation acceptance rate
- Completion after acceptance
- Dismiss rate by rule
- Guidance disabled rate
- Time-to-next-objective
- New player drop-off ก่อน/หลังระบบ
- Percentage ผู้เล่นที่ไม่เคยใช้ระบบและยังเล่นต่อได้ดี

---

# 18. Accessibility

- ทุก animation ปิดหรือลดได้
- รองรับ reduced motion
- Bubble text อ่านด้วย screen reader ได้
- ไม่ใช้สีอย่างเดียวสื่อความหมาย
- Touch target ≥ 48 px
- ตัวอักษร scale ได้
- Companion voice/sound ปิดแยกได้
- Navigation ต้องไม่พึ่งเสียงอย่างเดียว
- UI focus order ชัดเจน

---

# 19. Performance Budget

```text
Companion:
- 1 local entity
- no combat hitbox
- no server tick requirement
- animation update may throttle off-screen
- max 1 particle emitter active

Guidance:
- recommendation fetch only on request or validated trigger
- cache 60–300 sec
- no per-frame rule evaluation
- stuck evaluation batch every 5–10 sec client-side
- server rule evaluation event-driven
```

Low mode:

- ซ่อน idle particles
- ลด frame rate animation
- ปิด companion ของผู้เล่นอื่น
- ใช้ simple shadow

---

# 20. Edge Cases

## 20.1 ผู้เล่นยังไม่ได้ดึ๋งๆ

- Help menu ยังใช้ได้จาก system menu
- Recommendation UI ใช้ชื่อกลาง “คำแนะนำ”
- หลังได้ดึ๋งๆ จึงเปลี่ยน branding

## 20.2 ผู้เล่นไม่เคยใช้ระบบ

- ห้ามลงโทษ
- Achievement บางอย่างอาจบันทึกได้ แต่ไม่มี reward ด้านพลัง

## 20.3 ผู้เล่นตายขณะ Panel เปิด

- ปิด panel
- แสดง death UI ก่อน
- ไม่ยิง proactive hint ซ้ำทันที

## 20.4 เป้าหมายหมดอายุ

- card แสดง “เหตุการณ์นี้จบแล้ว”
- เสนอ refresh
- clear marker

## 20.5 Offline/connection issue

- Help article ใช้ cache ได้
- Recommendation ที่ต้องข้อมูลสดแสดง unavailable
- ห้ามเดา state

---

# 21. Acceptance Criteria

## 21.1 Freedom

- ผู้เล่นเริ่มเกมและเล่นต่อได้โดยไม่เปิดดึ๋งๆ
- ไม่มี popup ช่วยเหลือบังคับ
- ไม่มี forced navigation
- ปิด guidance ได้ครบทุกชนิด

## 21.2 Help

- ผู้เล่นเปิด “เล่นยังไง” ได้ไม่เกิน 2 interaction จาก HUD
- ผู้เล่นเปิด “ทำอะไรต่อดี” ได้ไม่เกิน 2 interaction
- Recommendation ทุกอันมี reason
- Recommendation ไม่เสนอสิ่งที่ล็อกหรือหมดเวลา

## 21.3 Dismissal

- “ไม่เอาตอนนี้” ทำงานตาม cooldown
- “ไม่ต้องเตือนเรื่องนี้อีก” persistent
- ไม่มี hint ซ้ำทันทีหลัง dismiss

## 21.4 Safety

- ระบบไม่ใช้เงินหรือไอเทมแทนผู้เล่น
- ไม่เปิด Auto Pilot โดยอัตโนมัติ
- ไม่เข้าสู่ PvP โดยไม่มี confirm

---

# 22. QA Matrix

| Case | Expected |
|---|---|
| Guidance OFF | ไม่มี proactive hint |
| Quiet mode + stuck | มีได้เพียงท่าทาง/ไอคอน |
| ผู้เล่นกดทำอะไรต่อดี | ได้ 2–4 ตัวเลือกที่ทำได้จริง |
| Quest พร้อมส่ง | Story recommendation ถูกจัดอันดับสูง |
| กระเป๋าเต็ม | Recovery/Economy recommendation ปรากฏเมื่อถาม |
| Event หมดเวลา | Recommendation ถูกตัดออก |
| ผู้เล่น dismiss tag | ไม่แสดงซ้ำก่อน cooldown |
| Secret area | ไม่ปัก exact marker อัตโนมัติ |
| PvP destination | มี risk warning |
| Offline cache | อ่าน help article ได้ |
| Screen reader | อ่านหัวข้อ ปุ่ม และเหตุผลได้ |
| Mobile | ปุ่ม ≥48 px และไม่บัง controls |

---

# 23. Suggested Issue Breakdown

```text
DG-01 Companion local entity
DG-02 Companion state machine
DG-03 Help entry points
DG-04 Help article registry
DG-05 Guidance preferences
DG-06 Recommendation contract
DG-07 Rule engine v1
DG-08 Recommendation panel desktop
DG-09 Recommendation bottom sheet mobile
DG-10 Dismissal & cooldown
DG-11 Stuck signal collector
DG-12 Navigation integration
DG-13 Telemetry
DG-14 Accessibility
DG-15 QA automation
DG-16 Content authoring template
```

---

# 24. Definition of Done

ระบบ v1 ถือว่าเสร็จเมื่อ:

1. ผู้เล่นได้พบดึ๋งๆ ผ่าน Encounter ที่ไม่บังคับ
2. ดึ๋งๆ ติดตามได้โดยไม่กระทบ combat
3. เปิด “เล่นยังไง” และ “ทำอะไรต่อดี” ได้
4. Recommendation ใช้ state จริงและบอกเหตุผล
5. มี Guidance Mode 4 ระดับ
6. มี dismissal และ cooldown
7. ไม่มี forced popup หรือ forced path
8. Desktop และ Mobile ใช้งานได้
9. มี telemetry และ QA coverage
10. Tech/Content เพิ่ม rule และ help article ใหม่ได้โดยไม่แก้ UI logic หลัก

---

# 25. Future Extensions

- บุคลิกดึ๋งๆ หลายแบบโดยไม่มีผลต่อพลัง
- Cosmetic skin
- Voice chirp
- Contextual emote กับ NPC/สัตว์
- AI text layer ที่ตอบจากข้อมูล canonical
- Party-level recommendations
- Mentor mode
- Community hint board
- ดึ๋งๆ จดบันทึกความทรงจำผู้เล่น
- Achievement interaction
- Living World reaction

> Future AI ต้องอยู่หลัง deterministic data layer เสมอ ห้ามสร้างคำตอบจากการเดาเมื่อไม่มีข้อมูลในเกม

---

# 26. Owner Lock Summary

1. ดึ๋งๆ เป็นสิ่งมีชีวิตตัวเล็กที่ผู้เล่นช่วยและติดตามผู้เล่น
2. ระบบช่วยเหลือเป็นแบบสมัครใจ
3. ค่าเริ่มต้นไม่รบกวน
4. ผู้เล่นสายค้นเองเล่นได้เต็มเกมโดยไม่เปิดระบบ
5. ผู้เล่นที่ต้องการคำแนะนำเข้าถึงได้ง่าย
6. “เล่นยังไง” และ “ทำอะไรต่อดี” ใช้ logic แยกกัน
7. ดึ๋งๆ กระซิบ ไม่สั่ง
8. Navigation และ Auto Pilot ต้องเกิดจากคำสั่งผู้เล่น
9. Secret ไม่ถูกเปิดเผยอัตโนมัติ
10. ทุก recommendation ต้องตรวจ eligibility และมีเหตุผล

---

**End of document**
