# ดึ๋งปุ๊ — Achievement & Adventurer Journal System Specification

**File:** `deungpu_ACHIEVEMENT_AND_ADVENTURE_JOURNAL_SPEC_v1.md`  
**Version:** 1.0  
**Status:** Design lock candidate / Ready for technical breakdown  
**Audience:** Game Design, Client, Server, UI, Data, QA, LiveOps, Analytics  
**Project:** ดึ๋งปุ๊  
**Last updated:** 2026-07-12

---

## 0. วัตถุประสงค์

เอกสารนี้กำหนดระบบ:

1. **Achievement**
2. **สมุดบันทึกนักผจญภัย**
3. **Discovery และ Collection**
4. **Achievement ลับ/เกรียน/งง/ตำนาน/Server First**
5. **Event tracking, rule evaluation, persistence และ UI**
6. **รูปแบบที่ทีม Tech ทำต่อได้แม้ไม่มี Figma**

ระบบนี้ไม่ควรเป็นเพียงรายการ “ฆ่ามอน 100 ตัว” แต่ต้องทำหน้าที่เป็น:

> บันทึกว่าผู้เล่นคนนี้ใช้ชีวิตในโลกดึ๋งปุ๊อย่างไร

---

# 1. Design Pillars

## 1.1 Achievement ต้องเล่าเรื่องผู้เล่น

Achievement แบ่งเป็น:

- ความก้าวหน้า
- ความชำนาญ
- การสำรวจ
- ความลับ
- ความสัมพันธ์
- เศรษฐกิจ
- ความผิดพลาดที่น่าจดจำ
- พฤติกรรมกาว
- ความสำเร็จระดับ Server
- สิ่งที่เกมแอบสังเกตเห็น

## 1.2 ไม่บังคับ Completionist

- ไม่ควรให้พลังหลักจำนวนมากจาก Achievement
- ห้ามทำให้ผู้เล่นรู้สึกว่าต้องเก็บครบทุกอัน
- Hidden achievement ไม่ควรจำเป็นต่อ progression
- Achievement ที่พลาดถาวรต้องมีน้อยมากและระบุหมวดพิเศษ
- ผู้เล่นปิด notification ได้

## 1.3 เคารพการค้นพบ

- Secret achievement ไม่แสดงเงื่อนไขก่อนปลด
- บางอันไม่แสดงแม้แต่จำนวนที่ยังขาด
- บางอันแสดงเพียง Hint
- Community ต้องสามารถค้นพบและเล่าต่อกันได้
- ห้ามให้ Wiki เปิดเผย secret โดย default

---

# 2. โครงสร้างสมุดนักผจญภัย

หน้าหลักแบ่งเป็น 7 แท็บ:

```text
1. วันนี้ของฉัน
2. Achievement
3. โลกที่ค้นพบ
4. มอนสเตอร์
5. ผู้คนและเรื่องเล่า
6. ของสะสม
7. สถิติส่วนตัว
```

## 2.1 วันนี้ของฉัน

แสดง:

- Achievement ล่าสุด
- สิ่งที่ใกล้สำเร็จ 3 รายการ
- Discovery ใหม่
- สถิติ session
- เป้าหมายที่ผู้เล่น pin เอง
- ข้อความสั้นจากดึ๋งๆ

ห้ามแสดงรายการยาวจนกดดัน

## 2.2 Achievement

ตัวกรอง:

- ทั้งหมด
- กำลังทำ
- ปลดแล้ว
- ซ่อนอยู่
- ธรรมดา
- ยาก
- ยากมาก
- ตำนาน
- กาว
- Server First
- Seasonal

## 2.3 โลกที่ค้นพบ

- Map
- Landmark
- Secret area
- Weather/event ที่เคยพบ
- Living World encounter
- จุดชมวิว
- บันทึกที่เก็บได้

## 2.4 มอนสเตอร์

- เคยพบ
- เคยกำจัด
- เคยถูกกำจัดโดยมัน
- Drop ที่ค้นพบแล้ว
- Variant
- Elite/Boss record

## 2.5 ผู้คนและเรื่องเล่า

- NPC ที่พบ
- ความสัมพันธ์
- บทสนทนาสำคัญ
- ข่าวลือ
- Quest memory
- Lore fragment

## 2.6 ของสะสม

- Equipment appearance
- Material
- Relic
- Card
- Cosmetic
- Title
- Emote
- ดึ๋งๆ memory

## 2.7 สถิติส่วนตัว

- เวลาเล่น
- ระยะทาง
- จำนวนครั้งที่ตาย
- ศัตรูที่ฆ่ามากที่สุด
- Map ที่อยู่นานที่สุด
- เงินที่หา/ใช้
- Potion ที่ใช้
- Critical สูงสุด
- ช่วงเวลาเล่นประจำ
- สถิติกาวบางรายการ

---

# 3. ระดับและประเภท Achievement

## 3.1 Difficulty Tier

```text
COMMON       ธรรมดา
UNCOMMON     ไม่ธรรมดา
HARD         ยาก
EXTREME      ยากมาก
LEGENDARY    ตำนาน
MYSTERY      ลี้ลับ
MEME         กาว
SERVER_FIRST Server First
SEASONAL     ประจำฤดูกาล
```

Tier ไม่เท่ากับ Reward โดยอัตโนมัติ

## 3.2 Visibility

```text
VISIBLE
HIDDEN_NAME
HIDDEN_CONDITION
FULLY_HIDDEN
REVEALED_AFTER_DISCOVERY
RETIRED
```

## 3.3 Scope

```text
CHARACTER
ACCOUNT
PARTY
GUILD
SERVER
SEASON
```

## 3.4 Progress Type

```text
BOOLEAN
COUNTER
MAX_VALUE
STREAK
DISTINCT_SET
TIME_ACCUMULATION
WINDOWED_COUNTER
SEQUENCE
COMPOSITE
SERVER_RANK
```

---

# 4. Data Model

## 4.1 Achievement Definition

```ts
type AchievementDefinition = {
  id: string
  version: number
  status: 'draft' | 'active' | 'retired'
  category: string
  subcategory?: string

  titleKey: string
  descriptionKey: string
  lockedTitleKey?: string
  lockedDescriptionKey?: string

  difficulty: AchievementDifficulty
  visibility: AchievementVisibility
  scope: AchievementScope
  progressType: AchievementProgressType

  rule: AchievementRule
  targetValue?: number
  distinctTargetCount?: number

  prerequisites?: string[]
  exclusions?: string[]
  repeatable: boolean
  seasonal?: boolean
  seasonId?: string

  rewardBundleId?: string
  titleRewardId?: string
  cosmeticRewardId?: string

  notificationPolicy: 'normal' | 'quiet' | 'silent' | 'world'
  retroactivePolicy: 'none' | 'safe' | 'full'
  shareable: boolean

  tags: string[]
  validFrom?: string
  validUntil?: string
}
```

## 4.2 Player Progress

```ts
type AchievementProgress = {
  characterId?: string
  accountId: string
  achievementId: string
  achievementVersion: number

  state: 'locked' | 'in_progress' | 'completed' | 'claimed' | 'retired'
  currentValue?: number
  maxValue?: number
  distinctKeys?: string[]
  streakValue?: number

  startedAt?: string
  updatedAt: string
  completedAt?: string
  claimedAt?: string

  completionContext?: Record<string, unknown>
  idempotencyKey?: string
}
```

## 4.3 Event Envelope

```ts
type GameEvent = {
  eventId: string
  eventType: string
  occurredAt: string
  serverId: string
  accountId: string
  characterId?: string
  sessionId?: string

  mapId?: string
  roomId?: string
  channelId?: string
  partyId?: string
  guildId?: string

  payload: Record<string, unknown>
  sourceVersion: number
}
```

กฎ:

- `eventId` ต้อง unique
- Consumer ต้อง idempotent
- Achievement completion ต้อง transaction-safe
- Server First ต้องใช้ atomic claim

---

# 5. Event Taxonomy

Events ขั้นต่ำ:

```text
player_created
player_level_changed
map_entered
landmark_discovered
secret_area_discovered
npc_met
npc_dialogue_completed
quest_started
quest_completed
monster_seen
monster_killed
player_killed
boss_encounter_started
boss_killed
damage_dealt
critical_hit
item_obtained
item_equipped
item_sold
item_bought
currency_changed
enhancement_attempted
enhancement_succeeded
enhancement_failed
party_created
party_joined
party_revive
guild_joined
chat_message_sent
emote_used
inventory_opened
inventory_closed
inventory_full
potion_used
player_idle_started
player_idle_ended
wall_collision
water_fall
map_loop_detected
dungdung_help_opened
dungdung_help_never_used_checkpoint
world_event_participated
weather_experienced
sunset_observed
merchant_met
caravan_escorted
login_streak_updated
season_closed
```

---

# 6. Rule Types

## 6.1 Counter

```json
{
  "type": "counter",
  "eventType": "monster_killed",
  "filter": { "monsterTag": "any" },
  "increment": 1,
  "target": 100
}
```

## 6.2 Distinct Set

```json
{
  "type": "distinct_set",
  "eventType": "map_entered",
  "key": "mapId",
  "allowed": ["map_01","map_02","map_03","map_04","map_05",
              "map_06","map_07","map_08","map_09","map_10"],
  "targetCount": 10
}
```

## 6.3 Streak

```json
{
  "type": "streak",
  "successEvent": "enhancement_succeeded",
  "resetEvent": "enhancement_failed",
  "target": 5
}
```

## 6.4 Windowed Counter

```json
{
  "type": "windowed_counter",
  "eventType": "player_killed",
  "groupBy": "killerMonsterId",
  "windowSeconds": 1800,
  "target": 5
}
```

## 6.5 Sequence

```json
{
  "type": "sequence",
  "steps": [
    {"eventType":"inventory_opened"},
    {"eventType":"inventory_closed"}
  ],
  "repeat": 10,
  "windowSeconds": 60
}
```

## 6.6 Composite

```json
{
  "type": "composite",
  "all": [
    {"eventType":"boss_killed","filter":{"partySize":1}},
    {"notOccurred":{"eventType":"potion_used","withinEncounter":true}},
    {"filter":{"bossTier":"raid"}}
  ]
}
```

---

# 7. Notification Policy

## 7.1 Normal

Toast 4–6 วินาที:

```text
┌───────────────────────────────┐
│ Achievement ปลดล็อก          │
│ “ก้าวแรก”                    │
│ ออกจากเมืองครั้งแรก          │
│ [เปิดสมุด]                    │
└───────────────────────────────┘
```

## 7.2 Quiet

- แสดง icon เล็ก
- ไม่เล่นเสียงดัง
- ใช้กับ achievement ถี่

## 7.3 Silent

- ไม่แจ้งทันที
- พบเมื่อเปิดสมุด
- ใช้กับ achievement สังเกตการณ์หรือบรรยากาศ

## 7.4 World

ใช้เฉพาะ:

- Server First
- World record
- Seasonal champion
- Legendary discovery ที่กำหนด

ต้องมี Rate limit และ Privacy option

---

# 8. UI Specification

## 8.1 Desktop Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ สมุดนักผจญภัย                                      [X]     │
├───────────────┬─────────────────────────────────────────────┤
│ วันนี้ของฉัน  │  Achievement                               │
│ Achievement   │  [ทั้งหมด] [กำลังทำ] [ปลดแล้ว] [ลับ]       │
│ โลกที่ค้นพบ   │                                             │
│ มอนสเตอร์     │  ┌──────────────────────────────────────┐   │
│ ผู้คน/เรื่อง  │  │ ★ ก้าวแรก                           │   │
│ ของสะสม       │  │ ออกจากเมืองครั้งแรก                │   │
│ สถิติ         │  │ สำเร็จ 12 ก.ค. 2026                │   │
│               │  └──────────────────────────────────────┘   │
└───────────────┴─────────────────────────────────────────────┘
```

ขนาด:

- Full-screen modal หรือ dedicated page
- Minimum width desktop 960 px
- Sidebar 180–220 px
- Content card height 84–120 px
- Grid 1–3 columnsตาม viewport

## 8.2 Mobile

- Tab bar แบบเลื่อนแนวนอนด้านบน
- List 1 column
- Filter เป็น bottom sheet
- Achievement detail เป็น full-screen sheet
- Touch target ≥48 px

## 8.3 Achievement Card

ต้องมี:

- Icon
- ชื่อ
- คำอธิบาย
- Difficulty badge
- Progress bar ถ้าเปิดเผยได้
- วันที่สำเร็จ
- Hidden treatment
- Pin button
- Share button ถ้าอนุญาต

## 8.4 Hidden Treatment

### HIDDEN_NAME

```text
???????
Hint: บางครั้งการยืนนิ่งก็มีความหมาย
```

### HIDDEN_CONDITION

```text
ผู้เฝ้ามอง
เงื่อนไขยังเป็นความลับ
```

### FULLY_HIDDEN

ไม่แสดงในรายการจนกว่าจะสำเร็จ

---

# 9. Pin และ Tracking

ผู้เล่น pin achievement ได้สูงสุด 3 อัน

HUD แสดงแบบย่อ:

```text
Achievement ที่ติดตาม
- นักล่า 63/100
- นักสำรวจ 7/10
```

กฎ:

- ไม่ pin hidden condition ที่ไม่เปิดเผย
- ปิด HUD ได้
- ไม่มีลูกศรบังคับ
- Progress update batch ได้ ไม่ต้องทุก event หากรบกวน

---

# 10. Reward Hook

ยังไม่กำหนด reward รายอันใน v1 แต่ระบบต้องรองรับ:

```text
NONE
TITLE
COSMETIC
EMOTE
DUNG_DUNG_COSMETIC
PROFILE_BADGE
JOURNAL_DECORATION
CURRENCY
ITEM
SEASON_POINT
```

กฎป้องกัน Pay-to-Win:

- Achievement กาว/ลับไม่ให้ stat
- Server First ให้เกียรติและ cosmetic เป็นหลัก
- Reward ที่มีมูลค่าเศรษฐกิจต้องผ่าน balance
- Claim ต้อง idempotent
- รองรับ auto-claim และ manual claim

---

# 11. Server First

## 11.1 กติกา

- Claim แบบ atomic
- ใช้เวลา server
- ผูก achievement version
- เก็บผู้ชนะอันดับ 1–N ได้
- ป้องกัน duplicate
- รองรับ invalidation โดย admin พร้อม audit log

## 11.2 Flow

```text
Event qualifies
→ evaluate rule
→ begin transaction
→ check server-first slot
→ reserve slot atomically
→ complete achievement
→ commit
→ publish announcement
```

## 11.3 Announcement

> “นักผจญภัย ‘ชื่อผู้เล่น’ คือคนแรกของเซิร์ฟเวอร์ที่โค่นบอสเงาจันทร์ได้!”

ต้องมี:

- mute world announcement setting
- profanity-safe display name
- rate limit
- admin revoke path

---

# 12. Retroactive Grant

Policy:

- `none` — ต้องทำหลังเปิดระบบ
- `safe` — ใช้ข้อมูลถาวรที่เชื่อถือได้ เช่น level, quest completed
- `full` — replay event history ถ้ามี

ห้ามเดาจากข้อมูลไม่ครบ

ตัวอย่าง:

- Level 10: safe
- เปิดกระเป๋า 500 ครั้ง: none ถ้าไม่เคยนับ
- เคยฆ่าบอส: safe หากมี kill record
- ยืนดูพระอาทิตย์ตก 10 ครั้ง: none หากไม่มี event

---

# 13. Anti-Exploit

- Event server-authoritative สำหรับ progression สำคัญ
- Client event ใช้ได้เฉพาะ cosmetic/meme ที่ไม่มีมูลค่าหนัก
- Rate limit event
- Deduplicate ด้วย eventId
- Validate time window
- ป้องกัน reconnect exploit
- ป้องกัน party leave/join abuse
- Server First ต้อง atomic
- Admin action ต้อง audit
- Suspicious completion flag ได้

---

# 14. Catalog ตัวอย่าง

ด้านล่างเป็นคลังไอเดียเริ่มต้น สามารถใช้เป็น seed data ได้

## 14.1 Progression — ธรรมดา

| ID | ชื่อ | เงื่อนไข | Tier |
|---|---|---|---|
| prog_first_step | ก้าวแรก | สร้างตัวละคร | Common |
| prog_leave_town | โลกข้างนอก | ออกจากเมืองครั้งแรก | Common |
| prog_first_kill | มือใหม่หัดล่า | กำจัดมอนตัวแรก | Common |
| prog_level_10 | เริ่มเข้าที่ | ถึงเลเวล 10 | Common |
| prog_level_30 | เดินมาไกล | ถึงเลเวล 30 | Uncommon |
| prog_level_50 | ครึ่งทางหรือยัง | ถึงเลเวล 50 | Hard |
| prog_map_2 | ทางยังอีกยาว | เข้า Map 2 | Common |
| prog_map_10 | ปลายขอบโลก | เข้า Map 10 | Hard |
| prog_main_arc_1 | เรื่องแรกจบลง | จบ Arc 1 | Hard |
| prog_all_systems | รู้จักทุกอย่างนิดหน่อย | ปลดระบบหลักครบ | Uncommon |

## 14.2 Combat

| ID | ชื่อ | เงื่อนไข | Tier |
|---|---|---|---|
| combat_crit_1 | ป๊าบเข้าให้ | Critical ครั้งแรก | Common |
| combat_crit_1000 | มือหนัก | Critical 1,000 ครั้ง | Hard |
| combat_one_hit | ทีเดียวจอด | ฆ่าศัตรูเต็ม HP ใน hit เดียว | Uncommon |
| combat_overkill | แรงไปไหม | Overkill >300% | Meme |
| combat_last_survivor | เหลือข้าคนเดียว | เป็นคนสุดท้ายรอดในปาร์ตี้ | Hard |
| combat_no_damage_boss | ไม่โดนเลย | ชนะบอสโดยไม่รับ damage | Extreme |
| combat_low_hp_win | เหลือเส้นเดียว | ชนะตอน HP ต่ำกว่า 1% | Hard |
| combat_chain_100 | มือไม่ตก | Combo 100 | Hard |
| combat_all_classes | รู้เขารู้เรา | ใช้อาชีพครบตามเงื่อนไขบัญชี | Legendary |
| combat_barehanded | มือเปล่าก็พอ | ฆ่า Elite โดยไม่ใส่อาวุธ | Meme/Hard |

## 14.3 Exploration

| ID | ชื่อ | เงื่อนไข | Tier |
|---|---|---|---|
| explore_landmark_1 | ตรงนี้สวยดี | พบ landmark แรก | Common |
| explore_all_map1 | รู้จักทุกซอก | สำรวจ Map 1 ครบ | Uncommon |
| explore_maps_1_10 | นักเดินทางตัวจริง | สำรวจ Map 1–10 | Hard |
| explore_sunset_10 | คนดูฟ้า | ชมพระอาทิตย์ตก 10 ครั้ง | Mystery |
| explore_rain_walk | เดินตากฝน | อยู่กลางฝน 30 นาทีสะสม | Uncommon |
| explore_wrong_way | ทางนี้ก็ไปได้เหรอ | เข้าพื้นที่ที่ไม่ใช่เส้นทางหลัก | Mystery |
| explore_loop_10 | เคยมาทางนี้ไหม | เดินวนจุดเดิม 10 รอบ | Meme |
| explore_water_10 | ว่ายน้ำไม่เป็น | ตกน้ำ 10 ครั้ง | Meme |
| explore_wall_500 | กำแพงชนะ | ชนกำแพง 500 ครั้ง | Meme |
| explore_hidden_caves | รูก็เข้า | พบถ้ำลับครบชุด | Legendary |

## 14.4 Secret / Mystery

| ID | ชื่อ | เงื่อนไข | Visibility |
|---|---|---|---|
| secret_found_one | มันอยู่ตรงนี้เอง | พบ Secret แรก | Hidden condition |
| secret_npc | ใครเป็นคนบอกเจ้า | พบ NPC ลับ | Fully hidden |
| secret_rumor_true | ข่าวลือมีจริง | ทำตามข่าวลือสำเร็จ | Fully hidden |
| secret_logo_click | ดึ๋งปุ๊ | กดโลโก้ 100 ครั้ง | Fully hidden |
| secret_same_place_year | ข้ารู้ว่าเจ้าจะมา | กลับจุดเดิมในวันครบรอบ | Fully hidden |
| secret_boss_observer | ผู้เฝ้ามอง | ยืนดูบอส 10 นาทีโดยไม่ตี | Hidden name |
| secret_midnight_bell | เสียงที่ไม่มีใครได้ยิน | อยู่จุดกำหนดตอนเวลาโลกเฉพาะ | Fully hidden |
| secret_all_fragments | เรื่องที่ถูกลืม | เก็บ lore fragment ลับครบ | Legendary |
| secret_dungdung_speaks | มันพูดได้?! | ได้ยินดึ๋งๆ พูดครั้งแรก | Hidden condition |
| secret_no_help_100h | ข้าพึ่งรู้ว่าเจ้าพูดได้ | เล่น 100 ชม. โดยไม่เปิดช่วยเหลือ | Fully hidden |

## 14.5 Social

| ID | ชื่อ | เงื่อนไข | Tier |
|---|---|---|---|
| social_friend_1 | เพื่อนคนแรก | เพิ่มเพื่อนคนแรก | Common |
| social_party_1 | ไปด้วยกัน | เข้าปาร์ตี้ครั้งแรก | Common |
| social_revive_10 | ลุกขึ้นมา | ชุบเพื่อน 10 ครั้ง | Uncommon |
| social_party_100h | ทีมเดิมนาน ๆ | เล่นกับ party เดิม 100 ชม. | Hard |
| social_guild_join | มีบ้านแล้ว | เข้ากิลด์ | Common |
| social_trade_1 | แลกกันไหม | ซื้อขายกับผู้เล่น | Common |
| social_help_newbie | รุ่นพี่ใจดี | ช่วยผู้เล่นใหม่ตามเงื่อนไข | Hard |
| social_emote_circle | เข้าใจตรงกัน | ผู้เล่น 5 คนใช้ emote พร้อมกัน | Meme |
| social_stranger_chat | สวัสดีคนแปลกหน้า | สนทนากับคนใหม่ | Uncommon |
| social_world_rescue | ฮีโร่ผ่านทาง | ช่วยคนที่ใกล้ตายจากมอน | Mystery |

## 14.6 Economy

| ID | ชื่อ | เงื่อนไข | Tier |
|---|---|---|---|
| eco_first_sale | เปิดร้านแล้ว | ขายของครั้งแรก | Common |
| eco_gold_100k | เริ่มมีเงิน | มีทอง 100,000 | Uncommon |
| eco_gold_1m | เศรษฐีหน้าใหม่ | มีทอง 1,000,000 | Hard |
| eco_spend_1m | เงินมีไว้ใช้ | ใช้ทองสะสม 1,000,000 | Hard |
| eco_market_100 | นักตลาด | ทำรายการตลาด 100 ครั้ง | Hard |
| eco_profit_streak | จังหวะดี | ขายกำไรติดกันตามเกณฑ์ | Mystery |
| eco_buy_high_sell_low | นักลงทุนมือใหม่ | ซื้อแพงขายถูกตาม threshold | Meme |
| eco_inventory_full_50 | เก็บไว้ก่อน | กระเป๋าเต็ม 50 ครั้ง | Meme |
| eco_merchant_all | ลูกค้าประจำ | พบพ่อค้าพเนจรครบ | Hard |
| eco_rare_sale | ปล่อยของรัก | ขายของ Legendary | Hard |

## 14.7 Enhancement / Craft

| ID | ชื่อ | เงื่อนไข | Tier |
|---|---|---|---|
| enh_first | ลองดูสักที | ตีบวกครั้งแรก | Common |
| enh_plus_5 | เริ่มเงา | ได้ +5 | Uncommon |
| enh_plus_10 | ของจริง | ได้ +10 | Hard |
| enh_plus_15 | ใจถึง | ได้ +15 | Extreme |
| enh_streak_5 | มือขึ้น | สำเร็จ 5 ครั้งติด | Hard |
| enh_fail_10 | วันนี้ไม่ใช่วันของเรา | ล้มเหลว 10 ครั้งติด | Meme |
| enh_use_strong | แกร่ง | ใช้ระบบแกร่งครั้งแรก | Common |
| enh_100 | ข้าไว้ใจเจ้า | ตีบวก 100 ครั้ง | Hard |
| craft_first_legend | ช่างในตำนาน | Craft Legendary ชิ้นแรก | Legendary |
| craft_all_materials | เก็บทุกอย่าง | ใช้วัตถุดิบครบทุกประเภท | Hard |

## 14.8 Boss / Raid

| ID | ชื่อ | เงื่อนไข | Tier |
|---|---|---|---|
| boss_first | ตัวใหญ่กว่าที่คิด | ร่วมฆ่าบอสครั้งแรก | Common |
| boss_last_hit | ปิดงาน | เป็นคนโจมตีสุดท้าย | Uncommon |
| boss_all_map1 | ผู้พิชิต Map 1 | ฆ่าบอส Map 1 ครบ | Hard |
| boss_solo | คนเดียวก็พอ | Solo boss ตาม tier | Extreme |
| boss_no_potion | ไม่ต้องพึ่งยา | ชนะโดยไม่ใช้ potion | Extreme |
| boss_party_no_death | กลับครบทุกคน | ชนะโดยไม่มีสมาชิกตาย | Hard |
| boss_server_first | คนแรกของโลก | Server First boss kill | Server First |
| boss_weekly_all | งานประจำ | ฆ่า weekly boss ครบสัปดาห์ | Hard |
| boss_observe | แค่มาดู | อยู่ใน encounter โดยไม่ตี | Meme/Mystery |
| boss_1hp | ยื้อไว้ได้ | ชนะตอนสมาชิกเหลือ HP ต่ำมาก | Legendary |

## 14.9 Dung-Dung

| ID | ชื่อ | เงื่อนไข | Tier |
|---|---|---|---|
| dung_rescue | เพื่อนตัวเล็ก | ช่วยดึ๋งๆ | Common |
| dung_first_help | ถามดึ๋งๆ ดู | เปิดช่วยเหลือครั้งแรก | Common |
| dung_no_help_10h | ขอลองเองก่อน | เล่น 10 ชม.ไม่เปิดไกด์ | Mystery |
| dung_no_help_100h | ข้าพึ่งรู้ว่าเจ้าพูดได้ | 100 ชม.ไม่เปิดไกด์ | Legendary/Meme |
| dung_open_100 | ถามเก่ง | เปิดดึ๋งๆ 100 ครั้ง | Meme |
| dung_ignore_20 | ไม่ต้องห่วง | ปฏิเสธคำแนะนำ 20 ครั้ง | Meme |
| dung_follow_secret | มองอะไรอยู่ | ตามท่าทางดึ๋งๆ จนพบ Secret | Mystery |
| dung_sleep_together | พักพร้อมกัน | Idle ใกล้ดึ๋งๆ ตอนมันหลับ | Mystery |
| dung_all_moods | รู้ใจกัน | เห็น animation mood ครบ | Hard |
| dung_anniversary | ยังอยู่ด้วยกัน | ครบรอบวันที่ช่วยดึ๋งๆ | Legendary |

## 14.10 Meme / เกรียน / งง

| ID | ชื่อ | เงื่อนไข |
|---|---|---|
| meme_die_before_kill | มือใหม่ของแท้ | ตายก่อนฆ่ามอนตัวแรก |
| meme_potion_full | กันไว้ก่อน | ใช้ potion ตอน HP เต็ม 100 ครั้ง |
| meme_menu_spam | หรือจะกลับบ้าน | เปิดปิดเมนู 100 ครั้ง |
| meme_inventory_500 | นักดูของ | เปิดกระเป๋า 500 ครั้ง |
| meme_afk_30 | ยืนเฉย ๆ | AFK 30 นาทีในที่ปลอดภัย |
| meme_afk_danger | ที่นี่เลยเหรอ | AFK ในพื้นที่อันตราย |
| meme_wrong_skill | กดผิดอีกแล้ว | ใช้สกิลผิดเงื่อนไขซ้ำ |
| meme_run_from_slime | วันนี้ขอไม่สู้ | หนีมอนระดับต่ำไกลตามเกณฑ์ |
| meme_return_town_1min | ลืมอะไรหรือเปล่า | ออกจากเมืองแล้วกลับใน 1 นาที |
| meme_same_npc_100 | เขาไม่มีอะไรเพิ่มแล้ว | คุย NPC เดิม 100 ครั้ง |
| meme_empty_chest | เผื่อมีรอบสอง | เปิดหีบว่างซ้ำหลายครั้ง |
| meme_jump_none | กระโดดไม่ได้ | กดคำสั่งที่ไม่มีในเกมซ้ำ |
| meme_map_open_combat | ขอเช็กทางก่อน | เปิดแผนที่ระหว่างสู้หลายครั้ง |
| meme_sell_buyback | คิดถึงของเก่า | ขายแล้วซื้อคืนทันที |
| meme_low_damage_boss | มีส่วนร่วม | ตีบอส damage รวมต่ำมากแต่รอด |
| meme_death_same_spot | จุดประจำ | ตายจุดเดิม 10 ครั้ง |
| meme_circle_party | ประชุมหรือเต้น | ปาร์ตี้เดินวนเป็นวง |
| meme_no_pants | ลมเย็นดี | เข้าเมืองโดยไม่ใส่เกราะบางช่อง |
| meme_overprepare | พร้อมเกินไป | พก potion เกิน threshold ในพื้นที่เริ่มต้น |
| meme_click_everything | เผื่อกดได้ | คลิก object ที่ไม่ interactive ครบเกณฑ์ |

## 14.11 Living World

| ID | ชื่อ | เงื่อนไข |
|---|---|---|
| world_first_rain | ฝนแรก | เจอฝนครั้งแรก |
| world_all_weather | ผ่านมาทุกฟ้า | พบสภาพอากาศครบ |
| world_caravan | ขบวนผ่านทาง | พบ caravan |
| world_caravan_guard | ไปส่งหน่อย | คุ้มกัน caravan สำเร็จ |
| world_merchant | คนนี้มาจากไหน | พบพ่อค้าพเนจร |
| world_npc_dayoff | วันนี้ร้านปิด | พบ NPC ใน routine พิเศษ |
| world_migration | ฝูงกำลังย้าย | พบมอนอพยพ |
| world_festival | คืนนี้ไม่เหมือนเดิม | ร่วมเทศกาล |
| world_rare_ambient | เห็นไหมเมื่อกี้ | พบ ambient event หายาก |
| world_condition_all | โลกเปลี่ยนไปทุกสัปดาห์ | พบ weekly condition ครบชุด |

## 14.12 Extreme / Legendary

| ID | ชื่อ | เงื่อนไข |
|---|---|---|
| extreme_no_death_100h | ไม่ล้มเลย | เล่น 100 ชม.โดยไม่ตายตาม scope |
| extreme_map1_10_nodeath | ทางไกลไร้รอยแผล | ผ่าน Map 1–10 ไม่ตาย |
| extreme_all_secrets | ไม่มีอะไรซ่อนพ้น | พบ Secret ทุกจุดใน Arc |
| extreme_all_boss_solo | กองทัพหนึ่งคน | Solo boss ครบชุด |
| extreme_no_potion_arc | ไม่แตะยา | จบ Arc โดยไม่ใช้ potion |
| legendary_journal_100 | นักจดจำ | สมุดครบ 100 หมุดสำคัญ |
| legendary_all_classes | ห้าหนทาง | Master อาชีพครบ |
| legendary_world_witness | ผู้เห็นทุกสิ่ง | พบ Living World event ครบ |
| legendary_server_chronicler | ผู้บันทึกยุคแรก | Achievement พิเศษยุคเปิดเซิร์ฟ |
| legendary_unknown | ??????? | เงื่อนไขไม่เปิดเผย |

---

# 15. Achievement Naming Guide

## 15.1 ธรรมดา

สั้น เข้าใจง่าย:

- ก้าวแรก
- เพื่อนคนแรก
- เปิดร้านแล้ว

## 15.2 ยาก

ฟังมีน้ำหนัก:

- เหลือข้าคนเดียว
- ทางไกลไร้รอยแผล
- ผู้พิชิตเงาจันทร์

## 15.3 กาว

ต้องอ่านแล้วเห็นภาพ:

- กำแพงชนะ
- วันนี้ไม่ใช่วันของเรา
- หรือจะกลับบ้าน
- เผื่อมีรอบสอง

## 15.4 ลับ

ใช้ชื่อชวนสงสัย:

- เสียงที่ไม่มีใครได้ยิน
- ผู้เฝ้ามอง
- ข้ารู้ว่าเจ้าจะมา
- มันอยู่ตรงนี้เอง

ข้อห้าม:

- Meme อ้างอิงบุคคลจริงที่เสี่ยงหมดอายุเร็ว
- ชื่อหยาบคาย
- Joke ที่ดูหมิ่นผู้เล่น
- ชื่อยาวเกิน 32 ตัวอักษรไทยโดยประมาณ

---

# 16. Adventure Journal Discovery Model

## 16.1 Discovery Definition

```ts
type DiscoveryDefinition = {
  id: string
  type: 'map' | 'landmark' | 'npc' | 'monster' | 'item' |
        'lore' | 'secret' | 'world_event' | 'weather'
  titleKey: string
  descriptionKey: string
  iconRef: string
  visibility: 'visible' | 'silhouette' | 'hidden'
  unlockRule: AchievementRule
  relatedAchievementIds?: string[]
  relatedDiscoveryIds?: string[]
}
```

## 16.2 Discovery State

```ts
type PlayerDiscovery = {
  accountId: string
  characterId?: string
  discoveryId: string
  state: 'unknown' | 'seen' | 'discovered' | 'completed'
  firstSeenAt?: string
  discoveredAt?: string
  timesSeen?: number
  notesUnlocked?: string[]
}
```

## 16.3 Monster Journal

ขั้นข้อมูล:

```text
Unknown
→ Seen
→ Defeated
→ Studied
→ Mastered
```

ตัวอย่าง:

- Seen: ชื่อ + silhouette
- Defeated: รูปเต็ม +พื้นที่พบ
- Studied: Drop บางส่วน +พฤติกรรม
- Mastered: Drop ที่ผู้เล่นค้นพบครบ +สถิติส่วนตัว

ห้ามเปิด Drop ทั้งหมดทันทีจาก Wiki ภายในเกม เว้นแต่ดีไซน์กำหนด

---

# 17. ดึ๋งๆ กับ Achievement

ดึ๋งๆ ใช้เป็น presentation layer เท่านั้น ไม่เป็น source of truth

ตัวอย่าง:

- Achievement ปลด → ดึ๋งๆ ดีใจ
- Hidden achievement → ดึ๋งๆ ทำท่าสงสัย
- ใกล้สำเร็จ → แสดงได้เมื่อผู้เล่นเปิดสมุด ไม่ proactive โดย default
- ไม่ควรเตือน “เหลืออีก 1 ครั้ง” สำหรับ achievement ลับ

Achievement พิเศษเกี่ยวกับดึ๋งๆ ต้องไม่มีผลพลัง

---

# 18. Admin / LiveOps Tools

ต้องรองรับ:

- เปิด/ปิด achievement
- กำหนด valid window
- ดู completion rate
- grant/revoke พร้อมเหตุผล
- retire achievement
- hide world announcement
- migrate version
- inspect player progress
- replay safe event
- export catalog
- localization status
- audit log

ห้ามแก้ requirement ของ achievement ที่ active แล้วโดยไม่เพิ่ม version

---

# 19. Versioning

ตัวอย่าง:

```text
achievement_id: combat_crit_1000
version 1 target 1000
version 2 target 1500
```

แนวทาง:

- ผู้ที่สำเร็จ v1 ไม่ถูกถอน
- Progress v1 migrate ได้ตาม policy
- UI แสดง legacy badge ได้
- Seasonal achievement lock ตาม season
- Definition ทุกตัวมี changelog

---

# 20. Persistence & Transactions

ตารางแนะนำเชิง logical:

```text
achievement_definitions
achievement_progress
achievement_completions
achievement_claims
achievement_server_first
achievement_event_dedup
journal_discoveries
journal_stats
journal_pins
```

Transaction boundary:

```text
consume event
→ dedup eventId
→ evaluate rules
→ update progress
→ if complete: insert completion
→ reserve server-first if applicable
→ enqueue notification/reward
→ commit
```

Reward อาจทำผ่าน outbox เพื่อ reliability

---

# 21. Telemetry

Events:

```text
achievement_progressed
achievement_completed
achievement_claimed
achievement_pinned
achievement_unpinned
achievement_shared
achievement_toast_clicked
achievement_filter_changed
journal_opened
journal_tab_opened
discovery_unlocked
hidden_achievement_revealed
server_first_claimed
reward_claim_failed
```

Metrics:

- Completion rate
- Time to completion
- Hidden discovery spread
- Pin-to-completion conversion
- Notification mute rate
- Achievement churn correlation
- Meme achievement engagement
- Server First fairness incidents
- Reward claim failure rate

---

# 22. Accessibility

- Progress bar มี text value
- Hidden icon มี aria label ที่ไม่ spoil
- Toast อ่านด้วย screen reader
- Animation ลดได้
- Sound ปิดได้
- Color badge มีข้อความ
- Keyboard navigation ครบ
- Mobile touch ≥48 px
- วันที่แสดงตาม locale

---

# 23. Performance

- Event-driven ห้าม scan ทุก achievement ทุก tick
- Index rule by `eventType`
- Batch non-critical progress writes
- Critical/Server First เขียนทันที
- Cache definitions
- Journal list paginate/virtualize
- Monster/item collection lazy-load
- Toast queue จำกัด 3
- Progress update UI throttle

---

# 24. Edge Cases

## 24.1 Event มาซ้ำ

- Dedup ด้วย eventId
- ไม่เพิ่ม progress ซ้ำ

## 24.2 ผู้เล่น disconnect ตอนปลด

- Completion ฝั่ง server
- Toast แสดงเมื่อ login ครั้งถัดไป
- Reward claim ตรวจ idempotency

## 24.3 Party kill

Achievement ต้องกำหนด credit policy:

```text
last_hit
damage_threshold
participation
party_presence
encounter_completion
```

## 24.4 Achievement ถูก retire

- ผู้ที่มีแล้วเก็บไว้
- ผู้ที่ยังไม่สำเร็จหยุด progress
- UI แสดง Legacy ถ้าต้องการ

## 24.5 Privacy

- ผู้เล่นซ่อน achievement บางอันจาก profile ได้
- Server First ชื่อต้องผ่าน display/privacy policy

## 24.6 Cheat rollback

- รองรับ revoke
- ย้อน reward ตาม policy
- เก็บ audit

---

# 25. Acceptance Criteria

1. Achievement definition เพิ่มใหม่แบบ data-driven
2. Event processing idempotent
3. Counter, set, streak, window, sequence, composite ใช้งานได้
4. Hidden achievement ไม่ spoil
5. Server First atomic
6. Journal แสดง Discovery/Monster/NPC/Collection ได้
7. Desktop/Mobile ใช้งานโดยไม่มี Figma เพิ่ม
8. Notification ปิดได้
9. Achievement pin ได้สูงสุด 3
10. Retroactive grant ทำตาม policy
11. Reward hook พร้อมแต่ไม่ผูก reward จริง
12. Admin มี versioning และ audit
13. ไม่มี achievement หลักที่บังคับใช้ดึ๋งๆ
14. ไม่มี reward พลังสูงจากหมวดกาว/ลับ
15. ระบบรองรับ localization

---

# 26. QA Matrix

| Case | Expected |
|---|---|
| event ซ้ำ | progress เพิ่มครั้งเดียว |
| counter ถึงเป้า | completed ครั้งเดียว |
| streak fail | reset ถูกต้อง |
| distinct set ซ้ำ key | ไม่นับเพิ่ม |
| hidden condition | ไม่แสดงเงื่อนไข |
| fully hidden | ไม่ปรากฏก่อนปลด |
| server first พร้อมกัน | มีผู้ชนะตาม slot เท่านั้น |
| disconnect ตอน complete | login กลับมาเห็นผล |
| reward claim ซ้ำ | ไม่ได้ reward ซ้ำ |
| retire definition | progress หยุด |
| version migrate | ไม่ถอน achievement เก่า |
| mobile filter | ใช้งานได้ |
| screen reader | อ่านชื่อ/สถานะได้ |
| muted toast | ไม่แสดงเสียง/ภาพตาม setting |
| secret achievement | ไม่ขึ้น “ใกล้สำเร็จ” |

---

# 27. Suggested Issue Breakdown

```text
AJ-01 Achievement definition schema
AJ-02 Event envelope & event bus integration
AJ-03 Rule evaluator: counter
AJ-04 Rule evaluator: distinct set
AJ-05 Rule evaluator: streak/window
AJ-06 Rule evaluator: sequence/composite
AJ-07 Progress persistence
AJ-08 Idempotency/dedup
AJ-09 Completion & reward outbox
AJ-10 Server First atomic claim
AJ-11 Achievement list UI
AJ-12 Achievement detail UI
AJ-13 Filters/search
AJ-14 Pin tracking HUD
AJ-15 Hidden presentation
AJ-16 Journal home
AJ-17 Discovery model
AJ-18 Monster journal
AJ-19 NPC/lore journal
AJ-20 Collection journal
AJ-21 Stats page
AJ-22 Notifications
AJ-23 Admin tools
AJ-24 Telemetry
AJ-25 Accessibility
AJ-26 QA automation
AJ-27 Seed catalog import
```

---

# 28. Definition of Done

ระบบ v1 ถือว่าเสร็จเมื่อ:

- มี Achievement อย่างน้อย 50 รายการจากหลายหมวด
- มีอย่างน้อย 5 Meme, 5 Hidden, 3 Hard, 1 Server First test definition
- Event pipeline idempotent
- Achievement ปลดและ persist ข้าม session
- Journal เปิดดูได้บน desktop/mobile
- Pin และ notification ทำงาน
- Secret ไม่ถูก spoil
- Reward hook พร้อม
- Admin ปิด/เปิด/version ได้
- QA ผ่านกรณี concurrency และ reconnect
- ทีม Content เพิ่ม achievement ผ่าน data/config ได้โดยไม่แก้ core code

---

# 29. Owner Lock Summary

1. Achievement เป็นบันทึกการผจญภัย ไม่ใช่ checklist บังคับ
2. รองรับธรรมดา ยาก ยากมาก ตำนาน ลับ กาว และ Server First
3. Hidden achievement ต้องไม่ spoil
4. Reward แยกตัดสินภายหลัง
5. Achievement ผูกเข้ากับสมุดนักผจญภัย
6. ดึ๋งๆ เป็นผู้แสดงปฏิกิริยา ไม่ใช่ตัวประมวลผล
7. ระบบต้อง data-driven, versioned, idempotent
8. ผู้เล่นปิด notification และซ่อน profile ได้
9. Achievement กาว/ลับไม่ให้พลังหลัก
10. Catalog ต้องขยายได้ระยะยาวและรองรับ LiveOps

---

**End of document**
