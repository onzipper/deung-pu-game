# D-064 — Content & LiveOps: ปฏิทิน event + โครงบอส 3 ชั้น + Arc 1 Ch1
- Date: 2026-07-13 · Status: Locked · Source: owner แชท 2026-07-13 (เคาะรายข้อ)

## ปฏิทิน event รายสัปดาห์ (ปิด L3)

- Slot: **เที่ยง 12:00–12:45 · เย็น 18:00–18:45 · ค่ำ 20:00–23:00** — ทุกวันมี event (จ/พ = 2 slot, อ/พฤ/ศ = 3, ส–อา = Festival ยาว 12:00–23:00 ยาวกว่าวันธรรมดา) · ใช้ 6 template หมุน (Lunch Rush=After-School Skirmish คนละเวลา, Recovery Bounty, Break Trial, Fragment Frenzy, Merchant Day พฤ, Festival)
- HoF: จันทร์ 00:00 reset · อาทิตย์ **23:30** settlement · Break Trial **แยกขาด**จาก HoF (event ให้ participation credit, HoF ให้ ranking)
- เพดานรางวัลตาม LW §15 ทั้ง closed + open beta · ซ้อนบน 8-week World Condition (P2B §11.3) · พลาดแล้วไม่เสีย power

## โครงบอส 3 ชั้น (เปิดใช้ tier จาก game §7: Field/Story/World — Guild/Raid/Secret ไว้เฟสหลัง)

| ชั้น | ตัว | กติกา | เฟส |
|---|---|---|---|
| Field (ประจำแมพ 1 ตัว/แมพ) | **หมูป่าหม้อเดือด** = Field Boss ตัวจริง Map 1 (เลื่อนจาก legacy placeholder ใน D-047) · monster id owner-approved 2026-07-13: `boss_map1_boiling_boar` (ผูก pity/fragment ใน reinforcement config) · E3 stats ของตัวนี้ = P2B prep | open-world respawn ~3–5 นาที (knob) เดี่ยว/ปาร์ตี้เล็ก · แหล่ง**เศษ**เสริมแกร่ง 10.7% (D-051) | P2B |
| Story | **ผู้พิทักษ์เสียงสะท้อน** lv8 (D-047) = กลไกผนึกที่ตื่น | instanced ผูกเควส · รางวัลเนื้อเรื่อง ไม่ใช่แหล่งเศษ | P2B |
| World | "รากแรกแห่งรอยแยก" (game §7) | spawn slot ค่ำ 20:00–23:00 · open-tap นับ contribution (D-038) ~10–20 คน (knob) · โอกาส**เสริมแกร่งตัวเต็ม 20–25%** | P3+ |

## Arc 1 Chapter 1 (ปิด L6 — ฉบับ align spec §9/§10/Arc1 pacing)

โทน**สดใส/meme** ตาม spec (dread รอ Map 3–4) · beats: กิลด์นักล่า+ครูฝึก tutorial → ตีบวกกับช่างตีเหล็ก → Map 1 ล่าดึ๋งปุ๊ "งานธรรมดาที่ชาวเมืองเห็นจนชิน" → ลุงดึ๋ง/ป้าปุ๊ = secret hint NPC (ตามบทที่ล็อก §39) → เบาะแสม่วงจาง ๆ 1 ใบ → Story Boss → hook ไป Ch2 "ไร่ที่หัวเราะไม่ออก" · **NPC IDs อนุมัติ (lock เมื่อมี save จริง):** `npc_city_guild_officer` `npc_city_trainer` `npc_city_blacksmith` `npc_city_lung_dung` `npc_city_pa_pu` `npc_city_temple_warden` · ทุก beat ปูทางเส้นเรื่องยาวตาม spec §9/§16 (ผู้เฝ้าวิหาร→Ch5–6, "ต้นเสียง"→Arc 4)

Related: [[D-047]] [[D-051]] [[D-038]] [[D-063]]
