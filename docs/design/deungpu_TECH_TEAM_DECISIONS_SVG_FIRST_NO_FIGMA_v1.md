# ดึ๋งปุ๊ — Tech Team Decisions & No-Figma Implementation Blueprint

> **ไฟล์:** `deungpu_TECH_TEAM_DECISIONS_SVG_FIRST_NO_FIGMA_v1.md`  
> **Revision:** `v1.0`  
> **สถานะ:** `OWNER-APPROVED BASELINE`  
> **วันที่:** 2026-07-12  
> **ขอบเขต:** U1–U4, Economy & Loot dependency, L1–L7, SVG-first art direction, No-Figma implementation contract  
> **วัตถุประสงค์:** ปิดคำถามจาก Tech Team และกำหนดรายละเอียดเพียงพอให้ UX, Frontend, Backend, Game Design, QA และ Content สามารถเริ่มงานได้โดยไม่ต้องมี Figma

---

# 0. Executive Decision Summary

## 0.1 Art Direction

`LOCKED`

- โปรเจกต์ใช้ **SVG-first** เป็นแนวทางหลัก
- งาน Pixel Art ถูกเลื่อนออกไป **แบบไม่กำหนดเวลา**
- Pixel Art ไม่ใช่ dependency ของ P2, P2B, Closed Alpha, Beta หรือ Launch ในปัจจุบัน
- เอกสารใดที่ระบุว่า Final Pixel Art เป็น Gate ให้ถือว่าส่วนดังกล่าวถูก supersede โดยเอกสารนี้
- หากอนาคตต้องการกลับมาใช้ Pixel Art ต้องมี Owner Decision ใหม่

## 0.2 No-Figma Rule

ทุก Feature UI ใหม่ต้องส่งมอบอย่างน้อย:

1. Purpose
2. Entry / Exit Conditions
3. ASCII Layout
4. Component Hierarchy
5. Interaction Rules
6. States
7. Responsive Rules
8. Motion
9. Accessibility
10. Telemetry
11. Error / Recovery
12. Acceptance Criteria

ทีมต้องสามารถสร้างหน้าจอจากเอกสารได้โดยไม่ต้องเปิด Figma

---

# 1. Source of Truth

| เรื่อง | เอกสารเจ้าของ |
|---|---|
| Owner decision | Owner Production Decisions / เอกสารนี้ |
| Player experience | Player Experience Bible |
| Account / Character / Storage | Account Character Storage Flow Spec |
| Visual tokens | UI Visual Implementation Spec |
| Economy / Loot | Economy & Loot Spec |
| Runtime / API / DB | Technical Architecture |
| Feature UI flow | No-Figma Screen Contract ของ Feature นั้น |
| Asset source | SVG Asset Manifest |

หากขัดกัน ให้ใช้ลำดับ:

```txt
Current Owner Decision
→ Specialized Feature Spec
→ Technical Architecture
→ UI Implementation Spec
→ Issue
→ Code
```

---

# 2. SVG-First Production Direction

## 2.1 Scope

SVG เป็น source format หลักสำหรับ:

- Character body parts
- Equipment overlays
- Monsters
- NPCs
- ดึ๋งๆ
- Item icons
- UI icons
- Decorative UI frames
- Map props
- Environmental decals
- Combat VFX shapes
- Telegraphs
- Logos
- Emblems
- Achievement badges

## 2.2 Runtime strategy

SVG source ไม่ได้แปลว่าต้อง render SVG DOM ทุกชิ้นตลอดเวลา

Allowed runtime paths:

```txt
SVG Source
├── Direct SVG component
├── Canvas draw from parsed SVG
├── Build-time raster export
├── Texture atlas
└── Cached bitmap
```

Tech Team เลือก runtime path ตาม performance แต่ source of truth ยังเป็น SVG

## 2.3 Recommended usage

| Asset Type | Recommended Runtime |
|---|---|
| UI icon | Inline SVG / SVG component |
| HUD frame | SVG / CSS background |
| Item icon | SVG source → cached bitmap หรือ atlas |
| Character/Monster | SVG parts → raster cache / canvas |
| Large map prop | SVG source → build-time raster |
| Telegraph | Vector/canvas shape |
| Repeated particle | Raster atlas |
| Logo / Emblem | Direct SVG |

## 2.4 SVG asset contract

ทุก SVG ต้องมี:

```yaml
assetId: string
category: string
viewBox: "0 0 W H"
pivot:
  x: number
  y: number
anchor:
  type: center-bottom | center | custom
safeBounds:
  x: number
  y: number
  width: number
  height: number
colorMode:
  fixed | tokenized | recolorable
outlineMode:
  none | fixed | tokenized
animationParts: []
qualityTier:
  source | optimized | runtime
```

## 2.5 File requirements

- ต้องมี `viewBox`
- ห้ามใช้ embedded raster image เว้นแต่ได้รับอนุมัติ
- ห้ามมี font dependency ภายใน SVG
- Text ต้อง convert เป็น path หรือ render ผ่าน UI layer
- ห้ามใช้ filter หนักโดยไม่ผ่าน performance review
- ห้ามมี metadata จาก editor ที่ไม่จำเป็น
- ต้องผ่าน SVG sanitizer
- ID ภายใน SVG ต้อง unique เมื่อ inline หลายไฟล์
- สีที่ต้องเปลี่ยนตาม theme ต้องใช้ token mapping
- Stroke ต้อง scale อย่างคาดเดาได้

## 2.6 Naming

```txt
svg/
├── characters/
│   └── class_sword/
├── monsters/
├── npc/
├── companion/
├── items/
├── ui/
├── vfx/
├── environment/
└── achievements/
```

ตัวอย่าง:

```txt
chr_sword_body_idle_v01.svg
mon_slime_leaf_idle_v02.svg
itm_mat_kraeng_common_v01.svg
ui_icon_storage_v01.svg
vfx_telegraph_circle_danger_v01.svg
```

## 2.7 Performance baseline

```yaml
svgPerformance:
  maxDirectInlineComplexUiIconsPerScreen: 100
  maxPathCountPerUiIcon: 40
  maxPathCountPerCharacterSource: 250
  maxRuntimeFilterLayers: 2
  cacheRepeatedAssets: true
  mobileRasterFallback: true
```

Tech Team สามารถเปลี่ยนตัวเลขหลัง profiling แต่ห้ามเปลี่ยน SVG-first direction

## 2.8 Animation

SVG animation source ใช้ได้ผ่าน:

- transform
- opacity
- path morph เฉพาะที่จำเป็น
- part swapping
- skeletal/part-based animation
- canvas timeline

ห้ามพึ่ง SMIL เป็น runtime baseline

## 2.9 Responsive asset behavior

- Asset ต้องอ่านได้ที่ 24px, 32px, 48px ตามประเภท
- Character/monster ต้องมี silhouette pass
- Item icon ต้องอ่าน category ได้ที่ 32px
- Telegraph ต้องไม่พึ่ง texture detail
- Mobile ลด detail ได้ แต่ semantic ต้องเหมือน Desktop

## 2.10 Pixel Art status

```yaml
pixelArt:
  status: deferred-indefinitely
  blocksCurrentPhases: false
  activeProduction: false
  revisitRequiresOwnerDecision: true
```

---

# 3. U1 — Equipment, Stack, Skill Bar, Settings, Enhancement Chance

## 3.1 Equipment Slots

`LOCKED: 5 slots`

| Slot | Key | Description |
|---|---|---|
| อาวุธ | `WEAPON` | อาวุธหลัก |
| ศีรษะ | `HEAD` | หมวก/เครื่องป้องกันศีรษะ |
| ชุด | `BODY` | เสื้อเกราะ/ชุด |
| เครื่องประดับ | `ACCESSORY` | เครื่องประดับหลัก |
| เครื่องราง | `TALISMAN` | Build modifier / utility |

Rules:

- หนึ่งชิ้นต่อช่อง
- Equipment stack = 1
- ต้องถอดก่อนฝากคลัง
- Cosmetic เป็น Appearance Layer แยก
- Slot validation อยู่ฝั่ง Server
- Class restriction ตรวจตอน Equip
- Character สามารถพกของต่างอาชีพได้ถ้า bind policy อนุญาต

### Equipment panel ASCII

```txt
┌──────────────────────────────┐
│ อุปกรณ์                      │
├──────────────┬───────────────┤
│ [ HEAD ]     │ Character     │
│ [ WEAPON ]   │ Preview       │
│ [ BODY ]     │               │
│ [ ACCESSORY ]│               │
│ [ TALISMAN ] │               │
└──────────────┴───────────────┘
```

Mobile:

```txt
[Character Preview]
[Weapon] [Head] [Body] [Accessory] [Talisman]
```

## 3.2 Stack Size

`CONFIG-DRIVEN`

| Category | Default Max Stack |
|---|---:|
| Equipment | 1 |
| Consumable | 99 |
| Skill Book | 99 |
| Ticket | 99 |
| Material | 999 |
| Upgrade Material | 999 |
| แกร่ง | 999 |
| Event Item | 999 |
| Quest Item | 1–99 ตาม definition |

Schema:

```yaml
item:
  maxStack: integer
  mergeKey:
    - itemDefinitionId
    - bindType
    - expiryBucket
    - enhancementState
    - customMetadataHash
```

UI rules:

- รองรับอย่างน้อย 4 หลักใน data model
- 999 แสดงเต็ม
- มากกว่า 999 ในอนาคตใช้ compact format เฉพาะ display เช่น `1.2K`
- Tooltip แสดงจำนวนจริง
- ห้าม hardcode 99/999 ใน component

## 3.3 Skill Bar

`LOCKED: 4 active skill slots`

แยกจาก:

- Basic Attack
- Dodge
- Potion
- Interact

Desktop baseline:

```txt
[Basic] [1] [2] [3] [4] [Dodge] [Potion] [Interact]
```

Mobile landscape:

```txt
                    [Skill 3] [Skill 4]
            [Skill 1] [Skill 2]
[Joystick]                       [Basic]
                       [Dodge] [Potion]
```

Rules:

- Active skill 4 ช่อง
- Drag reorder บน Desktop
- Tap select + assign บน Mobile
- Cooldown แสดง radial/overlay
- Disabled แสดง reason
- Skill unavailable ไม่หายจาก slot แต่เป็น disabled
- Server ตรวจ skill ownership และ cooldown

## 3.4 Settings Defaults

| Setting | Default |
|---|---:|
| Master Volume | 100% |
| Music | 70% |
| Combat SFX | 80% |
| UI SFX | 80% |
| Companion SFX | 75% |
| Screen Shake | 60% |
| Party VFX | 75% |
| Stranger VFX | 50% |
| Damage Numbers | On |
| Player Names | Self + Party |
| Reduce Motion | Follow OS |
| Mobile Vibration | On |
| Language | Account/Browser |
| Auto Loot | On for common baseline |
| Show Enhancement Chance | Always On |

Settings hierarchy:

```txt
Account Settings
├── Language
├── Accessibility
└── Shared Preferences

Device Settings
├── Volume
├── Graphics
├── Vibration
└── Input
```

## 3.5 Enhancement Chance

`LOCKED: SHOW REAL SERVER CHANCE`

ต้องแสดง:

- Current level
- Next level
- Current stats
- Next stats
- Success chance
- Cost
- Materials
- Failure consequence
- Protection
- Config version

API semantic:

```yaml
enhancementPreview:
  itemInstanceId
  currentLevel
  nextLevel
  successChancePercent
  costGold
  materials
  successResult
  failureResult
  configVersion
  previewToken
```

Enhancement request ต้องใช้ `previewToken`

หาก config เปลี่ยน:

- Server reject
- UI refresh preview
- ห้ามใช้ chance เก่า

---

# 4. U2 — Help Panel

## 4.1 Ownership

| Part | Owner |
|---|---|
| Voice / wording | ดึ๋งๆ Content |
| Timing | Player Experience |
| Layout | UI Spec |
| Unlock logic | Feature/Game Spec |
| Registry | Content Data |
| Search/index | Tech |

## 4.2 Entry

- ปุ่ม `?` บน Header ของหน้าระบบ
- Desktop shortcut: `F1`
- Context-aware
- ไม่ auto-open กลาง combat
- Tutorial hint สามารถ point ไปปุ่ม `?`

## 4.3 Desktop layout

```txt
┌────────────────────────────────────────────┐
│ ช่วยเหลือ                            [X]   │
├────────────────────────────────────────────┤
│ [ค้นหาหัวข้อ___________________________]  │
│                                            │
│ แนะนำสำหรับหน้านี้                        │
│ • วิธีตีบวก                               │
│ • สถานะร้าว                               │
│                                            │
│ หมวด                                      │
│ • การต่อสู้                               │
│ • อุปกรณ์                                 │
│ • คลัง                                    │
│ • ตัวละคร                                 │
│                                            │
│ ดึ๋งๆ: “สงสัยเรื่องไหนอยู่?”             │
└────────────────────────────────────────────┘
```

## 4.4 Mobile

```txt
Full-screen panel
[Back] ช่วยเหลือ
[Search]
Context topics
Categories
Article
```

## 4.5 States

- Empty search
- No result
- Loading
- Offline cached
- Content outdated
- Context unavailable
- Article locked
- Error

## 4.6 Article contract

```yaml
helpArticle:
  id
  title
  summary
  body
  category
  contextKeys
  unlockCondition
  relatedArticles
  companionLine
  contentVersion
```

## 4.7 Acceptance

- เปิดหัวข้อของหน้าปัจจุบันได้ไม่เกิน 2 actions
- Search ไทย/อังกฤษได้
- อ่านได้บน Mobile
- Keyboard complete
- ไม่ block combat
- Content version track ได้

---

# 5. U3 — Enhancement Screen Replacement

## 5.1 Decision

`LOCKED: USE NEW DEDICATED SCREEN`

GS เดิมถูก supersede

## 5.2 Desktop layout

```txt
┌───────────────────────────────────────────────────────────────┐
│ ตีบวกอุปกรณ์                                           [?][X] │
├───────────────────┬────────────────────┬──────────────────────┤
│ อุปกรณ์           │ ผลลัพธ์            │ วัตถุดิบและค่าใช้จ่าย │
│                   │                    │                      │
│ [Item Icon]       │ +4 → +5            │ แกร่ง       3 / 3   │
│ ชื่อไอเทม +4      │ ATK 42 → 48        │ Gold    1,200 / ... │
│ Rarity / Bind     │ สำเร็จ 65%         │ Protection: ไม่ใช้  │
│ สถานะ: ปกติ      │                    │                      │
├───────────────────┴────────────────────┴──────────────────────┤
│ เมื่อล้มเหลว: อุปกรณ์เข้าสู่สถานะร้าว                       │
│                                                               │
│                         [ ยืนยันการตีบวก ]                    │
└───────────────────────────────────────────────────────────────┘
```

## 5.3 Mobile layout

```txt
[Header]
[Item]
[Current → Next]
[Success Chance]
[Materials]
[Failure Result]
[Protection]
[Confirm]
```

## 5.4 States

```txt
NO_ITEM
READY
INSUFFICIENT_GOLD
INSUFFICIENT_MATERIAL
ITEM_LOCKED
PROCESSING
SUCCESS
FAILED
CRACKED
UNKNOWN_RECONCILING
```

## 5.5 Interaction

1. เลือก Item
2. Fetch preview
3. แสดง chance/cost
4. ผู้เล่น confirm
5. Lock UI
6. Server roll
7. Return authoritative result
8. Play result animation
9. Refresh inventory/equipment

## 5.6 Motion

- Preview update: 120–180ms
- Confirm press: 80ms
- Processing loop: 600–1200ms
- Success result: 700–1000ms
- Failure result: 500–800ms
- Reduced Motion: no shake/no burst

## 5.7 Error recovery

Network loss:

```txt
PROCESSING
→ CONNECTION_LOST
→ QUERY_TRANSACTION
├── SUCCESS
├── FAILURE
└── PENDING
```

ห้าม roll ซ้ำ

## 5.8 Acceptance

- Chance ตรง Server
- Failure consequence visible before confirm
- Mobile one-column readable
- No duplicate roll
- Config version mismatch handled
- Help accessible

---

# 6. U4 — Common Rarity Color

`LOCKED: MUTED SAND`

Semantic tokens:

```yaml
rarity:
  common:
    name: Muted Sand
    glow: none
    particle: none
  uncommon:
    name: Field Green
  rare:
    name: Cool Blue
  epic:
    name: Violet
  legendary:
    name: Warm Gold
```

Common ใช้กับ:

- border
- rarity text
- small marker
- icon accent

Common ไม่ใช้:

- full card background
- glow
- pulse
- particle
- special sound

SVG rule:

- rarity accent แยก layer
- icon base ไม่ bake rarity color
- runtime map rarity token ลง SVG layer

---

# 7. Economy & Loot Specification Dependency

## 7.1 Timing

`BLOCKS: P2-09 / P2-11 LATE WAVE 2`

Tech เริ่มได้:

- schema
- config loader
- drop table interface
- item definition
- telemetry

Tech ยังไม่ควรล็อก:

- drop rate
- EXP curve
- sell price
- monster gold
- upgrade cost
- แหล่งแกร่ง
- rarity stat budget

## 7.2 Required chapters

1. Item taxonomy
2. Rarity rules
3. Equipment stat budget
4. Map 1 drop matrix
5. Elite/Boss drops
6. EXP curve
7. Gold sources/sinks
8. Shop buy/sell
9. Upgrade economy
10. แกร่ง sources/sinks
11. Inventory fill timing
12. Simulation profiles
13. Anti-inflation
14. Telemetry
15. Acceptance criteria

## 7.3 Baseline simulation targets

- First upgrade: 20–40 minutes
- Inventory fill: 20–45 minutes
- Boss kill guaranteed meaningful reward
- No mandatory grind before tutorial enhancement
- Common item remains useful as sell/material source
- แกร่ง neither starves nor floods in first session

---

# 8. L1 — Bot Duration

`LOCKED BASELINE`

```yaml
bot:
  freeHoursPerDay: 1
  plusHoursPerDay: 4
  proHoursPerDay: 8
  twelveHourTier: deferred
```

12 ชั่วโมงเปิดพิจารณาได้เมื่อ:

- Economy stable
- Bot efficiency measured
- No market inflation
- No manual-player displacement
- Owner approves experiment

---

# 9. L2 — Final Art Order Under SVG-First

Pixel Art ถูกตัดออกจากแผน

## 9.1 P2B SVG priority

1. Main playable class
2. ดึ๋งๆ
3. Map 1 monsters
4. Map 1 boss
5. Combat telegraphs
6. Core VFX
7. HUD icons
8. Item icons
9. City landmarks
10. Storage/Enhancement UI assets

## 9.2 Expanded Alpha

- Class 2
- New monster families
- Additional equipment overlays
- Companion cosmetics

## 9.3 Beta

- Class 3
- Class 4
- Full visual consistency pass
- SVG optimization/raster cache audit

## 9.4 Rule

ทำทีละอาชีพให้ครบ:

- silhouette
- idle
- movement
- attack
- skill
- hit
- death
- equipment overlay
- mobile readability
- runtime performance

---

# 10. L3 — Weekly Calendar

```txt
P4 = Build infrastructure
P5 = Activate weekly world rotation
```

P4 technical hooks:

```yaml
weeklyEvent:
  id
  startAt
  endAt
  modifiers
  announcement
  featureFlags
  rewardConfig
  telemetryKey
```

---

# 11. L4 — Payment Gateway

เลือก Vendor ตอนเริ่ม P4

Required abstraction:

```txt
PaymentProvider
├── createPayment
├── getPaymentStatus
├── verifyWebhook
├── refund
├── reconcile
└── getSettlementReport
```

Shortlist criteria:

- PromptPay
- Card
- Sandbox
- Refund
- Webhook
- Thai merchant
- Settlement
- Fraud tooling
- Documentation
- Support
- Cost

---

# 12. L5 — Audio Budget

Planning cap:

```yaml
audioBudgetTHB:
  p2bPlanningCap: 50000
```

Suggested allocation:

| Work | Budget |
|---|---:|
| Map 1 + Boss + Motif | 25,000 |
| SFX licensing | 7,000 |
| Editing/layering | 6,000 |
| Mix/master/loop QA | 5,000 |
| Revision/contingency | 7,000 |

SVG-first ไม่มีผลต่อ audio scope

---

# 13. L6 — Arc 1 Narrative Ownership

## 13.1 Roles

| Role | Responsibility |
|---|---|
| Owner / Creative Director | Canon, tone, ending |
| Narrative Writer | Arc, character, dialogue |
| Quest Designer | Quest flow |
| Game Designer | Progression/reward |
| Tech | Feasibility |
| Editor | Language consistency |

## 13.2 Required before quest implementation

- Arc 1 beat sheet
- Main characters
- Locations
- Start/end
- Quest dependency
- Required scenes
- Supported branches
- Reward hooks

Tech Team ห้ามเติม canon เองจากช่องว่าง

---

# 14. L7 — Bot / Market UI Spec Ownership

## 14.1 Bot

Primary:

- UX/Product Designer
- Bot Systems Designer

Review:

- Tech Lead
- Economy
- Owner
- QA

## 14.2 Market

Primary:

- UX/Product Designer
- Economy Designer

Review:

- Backend
- Security/Anti-abuse
- Owner
- QA

## 14.3 Required no-Figma template

ทุกหน้าต้องมี:

```txt
Screen ID
Purpose
Entry Conditions
Exit Conditions
ASCII Layout
Component Tree
Primary Action
Secondary Actions
States
Validation
Responsive Rules
Motion
Accessibility
Telemetry
API Semantic
Acceptance Criteria
```

---

# 15. Global No-Figma UI Standards

## 15.1 Layout tokens

```yaml
spacing:
  4: 4px
  8: 8px
  12: 12px
  16: 16px
  24: 24px
  32: 32px
  48: 48px

radius:
  small: 6px
  medium: 10px
  large: 16px

touchTarget:
  minimum: 48px

desktop:
  contentMaxWidth: 1280px
  pagePadding: 32px

mobile:
  pagePadding: 16px
```

## 15.2 Component states

ทุก Interactive Component ต้องมี:

- Default
- Hover
- Focus
- Active
- Disabled
- Loading
- Error
- Success
- Selected

## 15.3 Button hierarchy

```txt
Primary = Resonance Teal
Secondary = Warm Ink + border
Destructive = Danger Red
Legendary Gold = rarity/reward only
```

## 15.4 Typography

- หัวข้อ: 24–32px Desktop
- Section: 18–24px
- Body: 16px
- Caption: 13–14px
- Mobile minimum body: 15px
- รองรับ Thai line-height 1.5–1.7

## 15.5 Responsive breakpoints

```yaml
breakpoints:
  mobile: "<768"
  tablet: "768-1023"
  desktop: ">=1024"
```

Game HUD ใช้ Mobile Landscape contract แยก ไม่ใช้ web portrait layout โดยตรง

## 15.6 Loading

- Skeleton สำหรับ content
- Spinner สำหรับ transaction
- >2 วินาทีมีข้อความ
- >8 วินาทีมี retry เมื่อ safe

## 15.7 Error

Error message ต้องมี:

- What happened
- Data safety statement
- Next action
- Error code

ตัวอย่าง:

```txt
เกิดปัญหาขณะตีบวก
ยังไม่มีการหักวัตถุดิบซ้ำ
[ตรวจสอบผลลัพธ์]
Error: ENH_TX_104
```

## 15.8 Accessibility

- Keyboard complete
- Focus visible
- Touch >=48px
- Color not sole indicator
- Reduced Motion
- Text scaling
- Screen reader labels
- Drag alternative
- Thai text expansion +30%

---

# 16. SVG UI Component Contract

ทุก SVG UI component ต้องรองรับ:

```yaml
svgComponent:
  size:
    - 16
    - 20
    - 24
    - 32
    - 48
  colorToken: optional
  ariaLabel: requiredIfMeaningful
  decorative: boolean
  interactive: false
  preserveAspectRatio: true
```

Interactive behavior อยู่ที่ Button/Control wrapper ไม่อยู่ใน SVG โดยตรง

ตัวอย่าง:

```txt
<Button aria-label="เปิดคลัง">
  <StorageIcon size=24 />
</Button>
```

---

# 17. Asset Review Checklist

- [ ] SVG sanitized
- [ ] viewBox correct
- [ ] pivot/anchor documented
- [ ] no embedded font
- [ ] no hidden raster
- [ ] path count acceptable
- [ ] token colors separated
- [ ] mobile readable
- [ ] silhouette pass
- [ ] reduced-detail export possible
- [ ] filename follows convention
- [ ] manifest updated
- [ ] rights/source archived

---

# 18. QA Acceptance Matrix

## U1

- 5 equipment slots
- duplicate class unaffected
- stack 1/99/999
- skill bar 4
- settings defaults
- chance from server

## U2

- contextual Help
- F1
- mobile panel
- no combat interruption
- search works

## U3

- new enhancement screen
- all states
- disconnect recovery
- no duplicate roll
- chance/cost exact

## U4

- Common sand token
- no glow
- SVG rarity layer works

## SVG

- direct SVG UI performance pass
- cached gameplay asset pass
- mobile fallback pass
- no pixel art dependency
- no Figma dependency

## No-Figma

- Dev reproduces layout from ASCII
- QA tests states from document
- Product can review without design file
- Responsive behavior unambiguous

---

# 19. Final Decisions Table

| Topic | Decision |
|---|---|
| Art direction | SVG-first |
| Pixel Art | Deferred indefinitely |
| Figma dependency | None |
| Equipment | 5 slots |
| Stack | 1 / 99 / 999 by category |
| Skill Bar | 4 active skills |
| Settings | Config-driven defaults |
| Enhancement % | Show real server chance |
| Help | Contextual panel + `?` + F1 |
| Enhancement UI | New dedicated layout |
| Common rarity | Muted Sand |
| Economy & Loot | Must complete before late Wave 2 drop/economy work |
| Bot | Pro 8 hours |
| Art order | Main class → companion → Map 1 monsters → Boss |
| Weekly | Infrastructure P4, active P5 |
| Payment | Vendor decision P4 |
| Audio | Planning cap 50,000 THB |
| Arc 1 | One Narrative Owner under Owner canon |
| Bot/Market UI | UX owns spec, Tech reviews |
| Runtime art | SVG source, cache/raster allowed |
| Implementation | Screen Contract required |

---

# 20. Definition of Done

เอกสารนี้ถือว่าถูกนำไปใช้ครบเมื่อ:

- [ ] Pixel Art dependency ถูกถอดจาก issue/roadmap ปัจจุบัน
- [ ] SVG asset manifest ถูกสร้าง
- [ ] SVG sanitizer/optimizer อยู่ใน pipeline
- [ ] Runtime strategy ผ่าน mobile profiling
- [ ] U1–U4 ถูกเพิ่มใน UI/Game Specs
- [ ] Enhancement screen issue อ้าง layout นี้
- [ ] Help panel issue อ้าง contract นี้
- [ ] Economy & Loot owner assigned
- [ ] Bot/Market UI owners assigned
- [ ] No-Figma template ใช้กับทุก feature ใหม่
- [ ] QA matrix ถูกแตกเป็น test cases
- [ ] Decision index อัปเดต
