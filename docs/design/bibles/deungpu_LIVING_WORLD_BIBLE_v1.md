# ดึ๋งปุ๊ — Living World Bible

> ไฟล์: `deungpu_LIVING_WORLD_BIBLE_v1.md`  
> สถานะ: **v1.0 — Owner-delegated production baseline**  
> โปรเจกต์: **ดึ๋งปุ๊ — True 2D Isometric Web MMORPG**  
> Canonical references: `deungpu_project_checkpoint_v15_p0_scope_lock_ready.md`, `deungpu_technical_architecture_v1_5_p0_scope_lock.md`, `deungpu_ENGINE_FOUNDATION_DECISIONS_v1.md`, `deungpu_MAP_LAYOUT_BIBLE_v1.md`, `deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md`  
> วัตถุประสงค์: กำหนด logic ของโลกที่มีชีวิตให้ Design/Tech/Art/Sound ใช้ร่วมกัน โดย Tech เลือกวิธี implement แต่ห้ามเปลี่ยน semantics

---

## 0. Core Statement

โลกของดึ๋งปุ๊ต้องรู้สึกว่า “ยังหายใจอยู่แม้ผู้เล่นยืนนิ่ง” แต่ระบบ Living World **ห้ามแย่งความสำคัญจากการเล่นหลัก ห้ามสร้าง FOMO รุนแรง และห้ามกิน server budget แบบจำลองทุกชีวิตตลอดเวลา**

Living World มีหน้าที่ 5 อย่าง:
1. ทำให้แต่ละ map มีจังหวะและบุคลิก
2. ให้ผู้เล่นพบเรื่องเล็ก ๆ ที่เล่าต่อกันได้
3. สร้างข้อมูลนำทางสู่ farm/event โดยไม่บังคับอ่าน wiki
4. เชื่อม lore, economy และ weekly condition
5. ทำให้การกลับมา map เดิมไม่เหมือนเดิม 100%

---

# 1. Design Pillars

## 1.1 Visible, not intrusive
- ผู้เล่นเห็นผลผ่านแสง เสียง NPC สัตว์ อากาศ และกิจกรรมสั้น ๆ
- หลีกเลี่ยง popup ต่อเนื่อง
- event ambient ต้องเดินผ่านได้ ไม่ล็อก progression

## 1.2 Authored randomness
- ทุกเหตุการณ์มี authored template
- random เฉพาะเวลา จุด ตัวแปร และชุดบทพูด
- ห้าม procedural randomness ที่ทำให้ lore ขัดกัน

## 1.3 Shared truth
- เวลา อากาศ event หลัก และ merchant เป็น server truth ต่อ channel/map group
- visual noise เล็ก ๆ เช่นใบไม้ นก แมลง เป็น client-local seeded ambience ได้

## 1.4 Graceful absence
- ผู้เล่นพลาด event แล้วไม่เสีย power ถาวร
- reward เป็น bonus, cosmetic, material ปริมาณเล็ก หรือ clue
- event สำคัญต้องวนกลับหรือมีช่องทางอื่น

## 1.5 Performance is a design rule
- offscreen NPC ไม่ต้องเดินจริงทีละก้าว
- simulation ใช้ state transition + schedule
- client แสดงเฉพาะสิ่งใน AOI

---

# 2. Simulation Layers

| Layer | ตัวอย่าง | Authority | Tick/Update |
|---|---|---|---|
| L0 World Calendar | world time, day, weekly condition | Server | 1–10s |
| L1 Regional State | weather, crowd level, map mood | Server | 5–30s/event-driven |
| L2 Scheduled Actors | merchant, caravan, patrol, quest NPC | Server state; client render | 1s near player, transition offscreen |
| L3 Ambient Actors | birds, cats, butterflies, villagers | Client seeded + server caps | frame/local |
| L4 Reactive Details | rain splash, footprints, leaves | Client | frame/local |

Rule: L0–L2 ต้อง deterministic/auditable; L3–L4 ไม่กระทบ loot, quest หรือ economy

---

# 3. World Time

## 3.1 Time scale

**หนึ่งวันในเกม = 4 ชั่วโมงจริง**

```yaml
realMinutesPerGameDay: 240
phases:
  dawn: 05:00-07:00
  day: 07:00-17:00
  dusk: 17:00-19:00
  night: 19:00-05:00
```

เหตุผล:
- session 30–90 นาทีมีโอกาสเห็น phase เปลี่ยน
- ไม่เร็วจนแสงกระพริบรบกวน
- event สามารถวนได้หลายครั้งต่อวันจริง

## 3.2 Server calculation

```ts
worldMinute = floor((serverNowMs - worldEpochMs) / realMsPerGameMinute) % 1440
worldDayIndex = floor((serverNowMs - worldEpochMs) / realMsPerGameDay)
```

- ห้ามอิงเวลาจาก client
- `worldEpochMs` เป็น config versioned
- restart server แล้วเวลาต้องต่อเนื่อง

## 3.3 Visual transitions
- blend phase 60–120 วินาทีจริง
- ห้ามเปลี่ยน tint แบบทันที ยกเว้น scripted event
- collision/spawn ห้ามเปลี่ยนเพียงเพราะแสงเปลี่ยนโดยไม่มี server event

---

# 4. Weather System

## 4.1 Weather catalog

| Weather | ใช้ได้ใน | Gameplay influence |
|---|---|---|
| Clear | ทุก map ที่เปิดโล่ง | ไม่มีผล power |
| Cloudy | Map 1–4, city | ลดแสงเล็กน้อย |
| Drizzle | Map 1–4 | ambience, NPC routine variation |
| Rain | Map 1–4, 6 | rare ambient spawn/clue เล็กน้อย |
| Fog | Map 3–4, 6, 9 | ลด visual range เฉพาะ ambience; telegraph ยังชัด |
| Strong Wind | Map 2, 7–9 | particles/props, caravan route flag |
| Ashfall | Map 8 | map identity, event cue |
| Resonance Storm | Map 7, 9–10 | weekly/event-only, warning ชัด |

## 4.2 Weather state machine

```txt
Stable → Warning → Active → Easing → Cooldown → Stable
```

Defaults:
```yaml
minStableMinutesReal: 12
maxStableMinutesReal: 35
warningSeconds: 20
minActiveMinutesReal: 8
maxActiveMinutesReal: 22
sameWeatherCooldownMinutesReal: 30
maxSevereWeatherConcurrentPerRegion: 1
```

## 4.3 Selection logic

```pseudo
on weather decision:
  candidates = region.weatherTable
  remove disallowed by worldPhase
  remove same weather if cooldown active
  apply weeklyCondition weights
  apply recent-history anti-repeat
  choose deterministicWeighted(seed = worldDay + region + decisionIndex)
  schedule Warning → Active → Easing
```

## 4.4 Weather gameplay rule
- weather ปกติไม่เพิ่ม/ลด damage, accuracy หรือ drop แบบซ่อน
- ถ้ามี reward modifier ต้องแสดงใน World Status UI
- boss telegraph และ danger sound ต้องไม่ถูกหมอก/ฝนบดบัง
- low quality ลด particle ได้ แต่ต้องรักษา silhouette และ warning

---

# 5. NPC Routine System

## 5.1 NPC categories

| Category | Simulation | Persistence |
|---|---|---|
| Quest Critical | full scheduled state | server persistent flags |
| Merchant | schedule + inventory state | server |
| Service NPC | open/closed schedule | server |
| Story NPC | authored triggers | server |
| Ambient Named | schedule simplified | server state per channel/day |
| Crowd NPC | client-local population template | none |

## 5.2 Routine block schema

```ts
interface NpcRoutineBlock {
  startWorldMinute: number
  endWorldMinute: number
  state: 'SLEEP'|'TRAVEL'|'WORK'|'BREAK'|'SOCIAL'|'EVENT'|'SHELTER'
  locationId: string
  routeId?: string
  animation?: string
  dialogueSetId?: string
  conditions?: ConditionExpr[]
  priority: number
}
```

## 5.3 Offscreen simulation
- ถ้าไม่มีผู้เล่นใน AOI: NPC เปลี่ยน state/location แบบ logical transition
- เมื่อผู้เล่นเข้า AOI: spawn ที่ตำแหน่งตาม progress ของ route หรือจุด entry ที่สมเหตุผล
- ห้ามวิ่ง teleport ต่อหน้าผู้เล่น
- ถ้าต้องเปลี่ยน location ข้าม map ให้ despawn หลังพ้นมุม/ประตูแล้ว spawn ปลายทาง

## 5.4 Routine priority

```txt
1. Safety / server correction
2. Main quest critical
3. Live event assignment
4. Weekly condition override
5. Weather shelter response
6. Merchant/service schedule
7. Social routine
8. Ambient wandering
```

## 5.5 Example: Merchant routine

```yaml
npcId: merchant_map1_01
routine:
  - 05:30-06:30 PREPARE at home
  - 06:30-07:00 TRAVEL route_home_market
  - 07:00-12:00 WORK at stall
  - 12:00-13:00 BREAK at tea_spot
  - 13:00-18:30 WORK at stall
  - 18:30-19:00 TRAVEL route_market_home
  - 19:00-05:30 SLEEP at home
weatherOverrides:
  rain: stay_under_awning
  resonanceStorm: close_shop_and_shelter
```

Edge cases:
- ผู้เล่นเปิดหน้าร้านตอน NPC ต้องปิด: session ขายของคงอยู่ไม่เกิน 60 วินาที แล้วปิดสุภาพ
- NPC ที่เป็น quest blocker ต้องมี substitute interaction marker เมื่อร้านปิด

---

# 6. Merchant & Wandering Merchant

## 6.1 Fixed merchant
- stock พื้นฐานคงที่ตาม progression
- visual open/closed ตาม routine
- service สำคัญมี fallback kiosk/assistant เพื่อไม่ block ผู้เล่น

## 6.2 Wandering merchant state machine

```txt
DORMANT → ANNOUNCED → TRAVELING → ARRIVED → TRADING → DEPARTING → COOLDOWN
```

Defaults:
```yaml
appearancesPerRealDay: 2-4
announcementLeadMinutes: 10
tradingDurationMinutes: 25
sameLocationCooldownHours: 8
maxExclusivePowerItems: 0
```

Rules:
- location เลือกจาก approved nodes เท่านั้น
- ไม่ขาย item ที่จำเป็นต่อ progression แบบ exclusive
- stock เป็น versioned config, quantity server-authoritative
- player-facing hint มาจาก NPC/notice board ไม่จำเป็นต้อง popup

---

# 7. Caravan System

## 7.1 Purpose
- ทำให้ถนนมีเรื่องเกิดขึ้น
- เชื่อมเมืองกับ field map
- เป็น micro-event แบบเข้าร่วมหรือเดินผ่านได้

## 7.2 State machine

```txt
SCHEDULED → ASSEMBLING → MOVING → PAUSED → THREATENED → RESOLVED → ARRIVED / FAILED → COOLDOWN
```

## 7.3 Logic
- route เป็น waypoint graph ที่ author ไว้
- caravan เคลื่อนเมื่อมีผู้เล่นใน AOI; offscreen ใช้ estimated progress
- encounter trigger จาก approved pockets ไม่ spawn ทับผู้เล่น
- failure ไม่ทำให้ merchant/progression หายถาวร
- reward จำกัด: gold/material/temporary discount/clue

```pseudo
if caravan active and playerNear:
  materialize caravan actors
  advance along route
  if encounterNode and cooldownReady:
    spawn authored encounter
else:
  advance logicalProgress by elapsedTime * routeSpeed
```

---

# 8. Patrol & Guards

- guard routes ป้องกัน safe camp และเล่า boundary ของอันตราย
- guards ไม่ farm loot ให้ผู้เล่น
- ถ้า guard ฆ่ามอน: ไม่มี player drop หรือให้ reduced/no reward
- patrol state: Patrol → Investigate → Warn → Engage → Return
- leash ป้องกันลาก guard ออกจากพื้นที่
- risk zone ใช้ guard เป็น visual warning ไม่ใช่ invincible wall

---

# 9. Wildlife & Ambient Creatures

## 9.1 Categories
- harmless wildlife: นก, แมว, กบ, ผีเสื้อ
- reactive wildlife: หนีเมื่อเข้าใกล้
- lore wildlife: ปรากฏเฉพาะ phase/weather
- harvestable wildlife: **ยังไม่อยู่ใน v1**

## 9.2 Client-local rules
- deterministic seed จาก `(mapId, channelId, worldDay, ambienceCell)`
- ไม่ให้ item/XP/quest credit
- max 8–16 ตัวใน viewport ตาม quality
- despawn เมื่อออกนอก margin

## 9.3 Behavior
```txt
Idle → Wander → React/Flee → Hide → Respawn Cooldown
```

---

# 10. Ambient Event Catalog

## 10.1 Micro events (10–60 วินาที)
- ลมพัดใบไม้เป็นวง
- ฝูงนกบินหนีบางสิ่ง
- NPC วิ่งหลบฝน
- รถเข็นติดหล่ม
- เสียงระฆังจากเมือง
- รอยสั่นพ้องวาบบนหิน

## 10.2 Meso events (3–15 นาที)
- caravan encounter
- wandering merchant arrival
- local monster migration
- shrine resonance
- village gathering
- fog pocket reveals a clue

## 10.3 Macro events (30–120 นาที / weekly)
- resonance storm
- world boss window
- regional festival
- weekly world condition

Concurrency caps:
```yaml
maxMicroEventsPerViewport: 2
maxMesoEventsPerMapChannel: 1
maxMacroEventsPerRegion: 1
minimumQuietWindowMinutes: 4
```

---

# 11. Event Scheduler

## 11.1 Event definition

```ts
interface LivingWorldEventDef {
  eventId: string
  scope: 'LOCAL'|'MAP'|'REGION'|'WORLD'
  priority: number
  eligibleMaps: string[]
  timeWindows?: TimeWindow[]
  weatherRequirements?: string[]
  cooldownMinutes: number
  maxConcurrent: number
  durationSeconds: number
  weight: number
  startPolicy: 'SCHEDULED'|'RANDOM_WEIGHTED'|'TRIGGERED'
  rewards?: RewardTableRef
  actorSetId?: string
  routeId?: string
  announcementPolicy: 'NONE'|'LOCAL'|'REGION'|'WORLD'
  failurePolicy: 'CANCEL'|'RESCHEDULE'|'RESOLVE_OFFSCREEN'
}
```

## 11.2 Arbitration

```pseudo
candidates = all eligible events
filter time/weather/map/weekly/locks
sort by priority then fairnessDebt then deterministicRoll
for each candidate:
  if concurrencyBudget allows and quietWindow satisfied:
    reserve actors/zones
    start event
```

`fairnessDebt`: event ที่ไม่ได้เกิดนานจะได้ weight เพิ่ม เพื่อกัน RNG ลืม event

## 11.3 Conflict matrix
- boss event ล็อก zone > caravan reroute
- quest-critical cutscene > ambient crowd
- weekly severe weather > normal weather
- merchant arrival ห้ามทับ boss arena
- event ที่จบไม่ได้เมื่อ room ว่างใช้ `RESOLVE_OFFSCREEN` หรือ pause ตาม def

---

# 12. Dynamic Spawn & Migration

Living World ไม่เปลี่ยน spawn แบบไร้ขอบเขต

- base spawn pocket มาจาก canonical map/spawn spec
- living modifier เปลี่ยน weight, family mix, elite chance หรือ ambience เท่านั้น
- ห้าม spawn นอก approved pocket
- migration event ย้าย active weight ระหว่าง pocket A→B พร้อม visual clue
- reward modifier ต้องมี cap และ telemetry

```yaml
migrationModifier:
  sourcePocketWeightMultiplier: 0.5
  destinationPocketWeightMultiplier: 1.5
  durationMinutes: 12
  maxEliteChanceBonus: 0.02
```

---

# 13. Weekly World Condition

Weekly condition ใช้ **layout เดิม** แต่เปลี่ยน:
- spawn mix/elite weight
- event table
- ambience/weather tint
- VFX/audio layer
- reward modifier แบบประกาศชัด
- NPC availability บางรายที่ไม่ block progression

ห้าม:
- เปลี่ยน collision หลักทุกสัปดาห์
- ซ่อนตัวคูณ economy
- ทำให้ผู้เล่นที่ไม่เข้า event เสีย progression ถาวร

Example:
```yaml
conditionId: roots_are_listening
maps: [map3, map6]
spawnTagsAdd: [root_awakened]
weatherWeightMods: { fog: 1.4 }
ambientAudioLayer: whisper_roots
rewardMods: { rootMaterial: 1.15 }
```

---

# 14. World Memory

## 14.1 Memory levels
- Character memory: เคยเห็น event, เคยช่วย NPC, dialogue variation
- Channel memory: event ล่าสุด, damage to temporary object
- Global memory: weekly/seasonal flags, world first, sealed event

## 14.2 Rules
- permanent global change ต้องผ่าน LiveOps versioned config
- ambient memory มี TTL
- secret clue flag server-only
- client ได้เฉพาะสิ่งที่ unlock แล้ว

---

# 15. Economy Influence

Living World แตะ economy ได้เฉพาะผ่าน approved knobs:
- merchant stock
- temporary discount
- material weight small modifier
- event reward table
- sink opportunity

Guardrails:
```yaml
maxRegionalDropBonus: 0.15
maxMerchantDiscount: 0.10
maxEventGoldPerHourVsNormalFarm: 0.25
noPremiumCurrencyRewards: true
noLegendaryGuaranteedFromAmbientEvent: true
```

---

# 16. Seasonal & Festival Layer

Seasonal content เป็น skin/config layer ไม่ fork map logic

- decoration set
- ambient actors
- music layer
- event catalog override
- merchant stock
- cosmetic reward

Festival ต้องมี:
- start/end timestamp
- fallback when event service fails
- cleanup job
- version rollback
- no hard dependency for core progression

---

# 17. Secret Living Events

- trigger อยู่ server
- clue มาก่อน reward
- ไม่ประกาศ world popup
- event ปรากฏได้หลายครั้งแต่ personal reward lock ตาม design
- bot ไม่ตัดสินใจ secret/rare/legendary แทนผู้เล่น
- offline bot report อาจบอก “พบร่องรอยผิดปกติ” แต่ไม่ auto-resolve

---

# 18. Client Presentation

Layer priority:
```txt
Boss danger / interaction critical
Quest critical actor
Living event actor
Weather foreground
Ambient actors
Decorative particles
```

UI:
- World Status chip: phase, weather, weekly condition
- local event hint แบบ subtle
- map icon เฉพาะ event ที่ตั้งใจ public
- accessibility: ลด flash, weather opacity, ambient crowd

---

# 19. Audio Rules

- day/night ใช้ layered ambience ไม่เปลี่ยนเพลงกระทันหัน
- weather เพิ่ม loop + one-shot ตาม density
- NPC crowd ใช้ bed loop ไม่เล่นเสียงทุกคน
- danger cue priority สูงสุด
- resonance event มี sonic motif เดียวกันทุก map เพื่อสร้างภาษาของโลก

---

# 20. Performance Budgets

Server per active room:
```yaml
livingWorldSchedulerHz: 1
maxMaterializedScheduledNPCs: 24
maxActiveLivingEvents: 2
maxRouteActors: 12
maxWeatherStateTransitionsPerMinute: 1
```

Client medium quality:
```yaml
maxAmbientActorsViewport: 12
maxWeatherParticles: 180
maxAmbientOneShotsPer10s: 4
maxLivingWorldDrawCallsTarget: 8
```

LOD:
- LOD0 visible: full animation/path
- LOD1 nearby offscreen: simplified path at 2–5Hz
- LOD2 same room far: logical state only
- LOD3 room empty: scheduler transitions only

---

# 21. Admin Knobs

Backoffice controls:
- pause living events per map
- force weather with TTL
- enable/disable event definition
- set weight/cooldown/concurrency
- inspect active reservations
- cancel event safely
- preview next 24h schedule
- rollback config version

ทุก write ต้อง audit actor, before/after, reason, expiry

---

# 22. Failure & Edge Cases

- server restart: reconstruct world phase and scheduled state from epoch/config; active low-value events may cancel, high-value events resume from persisted checkpoint
- room empty: event policy determines pause/resolve/cancel
- player joins mid-event: receive current snapshot, not replay full intro unless required
- map version changes: active events pin old version until finish or safe cancel
- duplicate scheduler: distributed lock/event idempotency key
- clock drift: server UTC only
- client low FPS: weather/ambience degrade first, telegraph never degrade
- NPC blocked: repath once, then snap only when offscreen

---

# 23. Rollout Plan

LW0 (P2): world time, phase tint, one weather/map, fixed NPC schedule
LW1 (P2B/P3): merchant, patrol, wildlife, micro events
LW2 (P4/P5): caravan, weekly condition modifiers, meso events
LW3 (P6): backoffice scheduler, seasonal layer, world memory analytics

---

# 24. Definition of Done

Living World v1 ถือว่าพร้อมเมื่อ:
- server time/phase ต่อเนื่องข้าม restart
- weather deterministic และไม่ repeat เกิน guardrail
- NPC routine เปลี่ยน state โดยไม่ teleport ต่อหน้าผู้เล่น
- room ว่างแล้วไม่มี full simulation
- event conflict arbitration ผ่าน test
- boss telegraph อ่านออกในทุก weather/quality
- admin ปิด event และ rollback config ได้
- economy modifier ไม่เกิน caps
- telemetry แยก event start/join/complete/reward/cancel
