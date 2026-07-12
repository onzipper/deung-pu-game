# ดึ๋งปุ๊ — Account, Character, Continue, Personal Storage & Delivery Flow Specification

> **ไฟล์:** `deungpu_ACCOUNT_CHARACTER_STORAGE_FLOW_SPEC_v1.md`  
> **Revision:** `v1.1 — No-Figma Implementation Blueprint`  
> **สถานะ:** `APPROVED OWNER BASELINE — READY FOR TECH BREAKDOWN`  
> **วันที่:** 2026-07-12  
> **ขอบเขต:** Game Hub, Guest/Login routing, 5 Character Slots, Continue-first, Character Creation/Management, Active Session, Personal Storage, Item Sharing Policy, Delivery Box และ Trade Boundary  
> **เป้าหมาย:** ให้ทีม Frontend, Backend, Game Design และ QA สามารถ implement ได้โดยไม่ต้องมี Figma และไม่ต้องเดา State, Flow, Layout, Item Ownership หรือ Failure Recovery

---

# 0. Source of Truth และขอบเขต

อ่านร่วมกับ:

- Owner Production Decisions
- P2 UI Visual Implementation Spec
- Player Experience Bible
- Game Design Principles
- Visual Language Bible
- Asset Production Bible
- Technical Architecture

เอกสารนี้เป็นเจ้าของ:

- Account/Character/Storage semantics
- End-to-end flow
- Screen contracts เฉพาะระบบนี้
- Item sharing categories
- Transaction states
- Responsive layout
- Error/recovery
- Acceptance criteria

เอกสารนี้ไม่เป็นเจ้าของ:

- Item stats/drop rate
- Enhancement balance
- Market tax
- Payment pricing
- Final art asset
- Auth library implementation detail

---

# 1. Product Model

## 1.1 Core statement

```txt
Account = ตัวตนและความคืบหน้าระยะยาวของผู้เล่น
Character = Build/อาชีพที่ผู้เล่นนำเข้าโลก
Inventory = ของที่ตัวละครพก
Personal Storage = ทรัพย์สินกลางของบัญชี
Delivery Box = ของที่ระบบส่งและยังไม่ได้รับ
```

## 1.2 Baseline

```yaml
account:
  characterSlots: 5
  simultaneousGameSessions: 1

character:
  duplicateClassAllowed: true
  uniqueNameRequired: true

inventory:
  slotsPerCharacter: 40

personalStorage:
  baseSlots: 200
  sharedAcrossCharacters: true

deliveryBox:
  maxEntries: 50
```

## 1.3 Design goals

1. ผู้เล่นเก่ากด Continue แล้วเข้าเกมได้เร็ว
2. ผู้เล่นทดลองหลายอาชีพได้โดยไม่สร้างหลายบัญชี
3. การแชร์ของต้องตั้งใจผ่านคลัง ไม่แชร์ inventory อัตโนมัติ
4. ของระบบต้องไม่หายเพราะ inventory เต็ม
5. Character Select เป็นเมนูรอง
6. Website และ Game เป็น Game Hub เดียวกัน
7. ทุก mutation ต้อง server-authoritative
8. ระบบต้องรองรับ 5 ตัวโดยไม่เปิด alt exploit ที่ชัดเจน

## 1.4 Non-goals P2/P2B

- Direct Player Trade
- Guild Storage
- Mail Attachment
- Web-based item mutation
- Paid storage expansion
- Character rename
- Character deletion
- Multiple simultaneous characters
- Shared Gold wallet
- Cross-account storage

---

# 2. Data Ownership Matrix

| Data | Account | Character | Storage | Notes |
|---|---:|---:|---:|---|
| Email/Auth | ✓ |  |  | Account |
| Character slots | ✓ |  |  | 5 |
| Name/Class |  | ✓ |  | Character |
| Level/EXP |  | ✓ |  | แยก |
| Skills |  | ✓ |  | แยก |
| Quest state |  | ✓ |  | แยก |
| World position |  | ✓ |  | แยก |
| Gold |  | ✓ |  | P2 ไม่ฝากคลัง |
| Character inventory |  | ✓ |  | 40 slots |
| Equipment |  | ✓ | conditional | ฝากได้เมื่อถอด |
| Materials |  | item owner | ✓ | ฝากได้ |
| Upgrade materials |  | item owner | ✓ | ฝากได้ |
| Achievements | ✓ |  |  | ไม่ต้องฝาก |
| Journal/Lore | ✓ |  |  | ไม่ต้องฝาก |
| Discoveries | ✓ |  |  | ไม่ต้องฝาก |
| Cosmetics | ✓ |  |  | Entitlement |
| Titles/Nameplates | ✓ |  |  | Entitlement |
| Help progress | ✓ |  |  | Account |
| Bot presets | ✓ |  |  | P3 |
| Settings | mixed | mixed |  | Device/account ตาม setting |
| Delivery Box | ✓ |  |  | Account |
| Premium currency | ✓ |  |  | Future |
| Market listing | ✓ | item lock |  | P4 |

---

# 3. Character Slots

## 3.1 Slot rules

```yaml
slots:
  count: 5
  allAvailableAtStart: true
  paidUnlock: false
  duplicateClass: true
```

Slot states:

```txt
EMPTY
CREATING
READY
ACTIVE
OFFLINE
LOCKED_TRANSACTION
PENDING_DELETION (FUTURE)
ERROR_RECOVERY
```

P2 ใช้:

- EMPTY
- CREATING
- READY
- ACTIVE
- OFFLINE
- ERROR_RECOVERY

## 3.2 Duplicate rules

- อาชีพซ้ำได้
- ชื่อซ้ำไม่ได้
- Build/Equipment ซ้ำได้
- Character ID ไม่เปลี่ยนเมื่อ class data update
- Cosmetic entitlement ใช้ได้ทุกตัว แต่ equip state แยกตัวละคร

## 3.3 Naming

```yaml
name:
  minVisibleCharacters: 3
  maxVisibleCharacters: 16
  unicodeNormalization: NFC
  scripts: Thai-Latin-Digits
  internalSingleSpace: allowed
  emoji: blocked
  controlCharacters: blocked
  uniqueScope: global
  caseInsensitive: true
```

Errors:

- `NAME_TOO_SHORT`
- `NAME_TOO_LONG`
- `NAME_INVALID_CHARACTER`
- `NAME_RESERVED`
- `NAME_TAKEN`
- `NAME_RATE_LIMITED`

## 3.4 Character creation limit

เมื่อครบ 5:

- ปุ่ม Create ถูก disabled
- แสดง `ใช้ครบ 5/5 ช่องแล้ว`
- ไม่เสนอซื้อ slot ใน P2
- ไม่แสดง Delete ถ้ายังไม่เปิด
- Help ระบุว่า Character Management เพิ่มภายหลัง

---

# 4. Account and Session State Machine

```txt
UNAUTHENTICATED
├── PLAY_AS_GUEST
└── LOGIN
      ↓
AUTHENTICATED
├── NO_CHARACTER → CHARACTER_CREATION
├── HAS_CHARACTER → CONTINUE_READY
└── ACCOUNT_BLOCKED → ACCOUNT_RECOVERY

CONTINUE_READY
├── ENTER_GAME
├── CHANGE_CHARACTER
├── ACCOUNT_SETTINGS
└── LOGOUT

ENTER_GAME
→ SESSION_RESERVING
→ ROOM_JOINING
→ PLAYING
↘ RECONNECTING
↘ SESSION_CONFLICT
↘ ERROR_RECOVERY
```

## 4.1 One active gameplay session

- Account มี active character ได้หนึ่งตัว
- Session ใหม่ตรวจ existing lease
- ถ้าเป็น reconnect token เดิม: reclaim
- ถ้าเป็น device/tab ใหม่: แสดง Take Over
- Take Over มี confirm
- Session เก่าได้รับ disconnect reason `SESSION_TAKEN_OVER`
- Storage transaction ที่กำลัง commit ต้องจบก่อน takeover

## 4.2 Take Over modal

```txt
มีเกมเปิดอยู่ในอุปกรณ์หรือแท็บอื่น

ตัวละคร: Jom
สถานที่: ขอบเมืองมนุษย์
สถานะ: กำลังเล่น

[กลับไปใช้เซสชันเดิม] [เข้าเล่นที่นี่]
```

- Default focus = กลับ
- Take Over เป็น destructive-to-session action แต่ไม่ทำข้อมูลหาย
- หาก session เดิมอยู่ combat ให้ safe-disconnect policy ทำงาน

---

# 5. Entry Flow

## 5.1 First-time guest

```txt
Landing
→ Play Now
→ Play as Guest
→ Guest warning
→ Character Creation
→ Intro
→ Tutorial
→ Town
→ Continue-ready state saved
```

Target:

- ถึง Character Creation ภายใน 30 วินาที
- ถึง gameplay ภายใน 5 นาที

## 5.2 First-time email account

```txt
Landing
→ Login/Register
→ Account created
→ Character Creation
→ Intro
→ Tutorial
→ Town
```

## 5.3 Returning

```txt
Landing
→ Auth restored
→ Continue Card
→ Continue
→ Loading
→ Game
```

Target: คลิกหลักหนึ่งครั้งหลัง auth restored

## 5.4 Returning after long break

Continue Card เพิ่ม:

- `มีอะไรเปลี่ยนไป`
- summary สูงสุด 3 รายการ
- ไม่ block Continue
- ไม่มี modal stack

---

# 6. Game Hub Shell

## 6.1 Desktop layout

```txt
┌──────────────────────────────────────────────────────────────────────┐
│ LOGO                  News  Patch  Community          Account Avatar │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────┐   ┌─────────────┐ │
│  │ CONTINUE ADVENTURE                           │   │ NEWS/EVENT  │ │
│  │ Portrait  Name  Class  Lv                    │   │ cards       │ │
│  │ Last location · Last played                  │   │             │ │
│  │                                              │   │             │ │
│  │ [ CONTINUE ]       [Change Character]        │   │             │ │
│  └──────────────────────────────────────────────┘   └─────────────┘ │
│                                                                      │
│  Journal · Achievements · Characters · Account · Settings            │
└──────────────────────────────────────────────────────────────────────┘
```

Dimensions baseline:

- max content width: 1280px
- page padding: 32px desktop
- Continue area: 2/3 width
- News rail: 1/3 width
- gap: 24px
- primary CTA height: 48px

## 6.2 Mobile layout

```txt
┌───────────────────────────────┐
│ LOGO                    Menu  │
├───────────────────────────────┤
│ CONTINUE ADVENTURE            │
│ [Portrait] Name · Lv          │
│ Last location                 │
│ Last played                   │
│                               │
│ [       CONTINUE       ]      │
│ [ Change Character ]          │
├───────────────────────────────┤
│ News / Event carousel         │
├───────────────────────────────┤
│ Journal · Achievements        │
└───────────────────────────────┘
```

- CTA เต็มความกว้าง
- Continue อยู่เหนือข่าว
- touch target >=48px
- menu ใช้ drawer

## 6.3 Visual language

- Background: Deep Ink / world backdrop
- Panel: Warm Ink
- Primary CTA: Resonance Teal
- Text: Parchment/Highlight
- Gold ห้ามใช้กับ Continue
- Last location ใช้ muted Sand
- Server error ใช้ Danger Red + icon

---

# 7. Continue Card Screen Contract

## 7.1 Purpose

พาผู้เล่นกลับเข้าตัวล่าสุดด้วย friction ต่ำสุด

## 7.2 Entry conditions

- authenticated
- มีอย่างน้อย 1 READY/OFFLINE character
- lastPlayedCharacterId valid

## 7.3 Content

Required:

- portrait 96×96 desktop / 72×72 mobile
- name
- class
- level
- last map
- last played relative + absolute tooltip
- server status
- Continue
- Change Character

Optional:

- current quest short line
- unread delivery count
- long-break summary

## 7.4 Interaction

Continue:

1. disable button
2. show `กำลังเตรียมโลก...`
3. reserve session
4. fetch authoritative character
5. join room
6. transition to game

Change Character:

- เปิด Character Management
- ไม่ discard current session เพราะยังไม่ได้เข้า game

## 7.5 States

### Loading

- skeleton card
- Continue disabled

### Character data unavailable

- Show account shell
- Retry
- Character Management
- Error detail code

### Server offline

- Continue disabled
- status strip
- Retry server status
- News/Hub ยังใช้ได้

### Character locked transaction

- message `กำลังตรวจสอบข้อมูลตัวละคร`
- poll transaction
- ห้ามสร้าง character ซ้ำ

## 7.6 Motion

- Card enter: fade/translate 160ms
- Continue press: button scale 0.97, 80ms
- Game transition: overlay fade 240–360ms
- Reduced Motion: opacity 100ms

## 7.7 Acceptance

- returning user เข้าเกมได้ด้วย primary click เดียว
- keyboard Enter ใช้ Continue
- Change Character ไม่เด่นเท่า Continue
- no popup before Continue
- mobile keyboard/safe area ไม่ชน

---

# 8. Character Creation Screen Contract

## 8.1 Desktop

```txt
┌──────────────────────────────────────────────────────────────────┐
│ [Back]                    สร้างนักผจญภัย                         │
├────────────────┬────────────────────────────┬────────────────────┤
│ CLASS LIST     │ CHARACTER PREVIEW          │ CHARACTER DETAILS  │
│ [Class A]      │                            │ Name               │
│ [Class B]      │ animated isometric idle    │ [______________]   │
│ [Locked]       │                            │ 0/16                │
│                │                            │ Class summary       │
│ Slots: 2/5     │                            │ [Create Character]  │
└────────────────┴────────────────────────────┴────────────────────┘
```

Baseline:

- max width 1180px
- left 240px
- center min 420px
- right 320px
- height max 720px

## 8.2 Mobile landscape

- Preview upper/center
- horizontal class selector
- name + summary lower
- Create right/bottom thumb reach
- slot count visible

## 8.3 Class repeat

เมื่อเลือก class ที่มีอยู่แล้ว:

- ไม่เตือนเป็น error
- อาจแสดง `คุณมีนักดาบอยู่แล้ว 1 ตัว`
- Create ยังใช้ได้
- จุดประสงค์คือช่วยให้ทราบ ไม่ block

## 8.4 Create transaction

```txt
EDITING
→ LOCAL_VALID
→ SERVER_VALIDATING_NAME
→ CREATING
→ CREATED
→ INTRO_OR_HUB
```

- idempotency key
- name reserve ขณะ commit
- duplicate conflict focus input
- item/starter grant transaction เดียวกับ character create หรือ compensating rollback ที่ชัด

## 8.5 Success routing

ตัวแรก:

```txt
Create → Intro → Tutorial
```

ตัวที่ 2–5:

```txt
Create → Character Management
→ Continue new character
```

Tutorial behavior ของ alt:

- core tutorial skippable หลัง account เคยจบ
- class-specific tutorial ยังแนะนำ
- starter rewards ห้าม exploit แบบ account-repeat หากเป็น account-once

---

# 9. Character Management Screen Contract

## 9.1 Purpose

จัดการ 5 slots และเลือกตัวที่จะ Continue

## 9.2 Desktop layout

```txt
┌──────────────────────────────────────────────────────────────────┐
│ ตัวละครของฉัน                                      3 / 5 slots  │
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────┐ ┌────────────┐ ┌────────────┐                     │
│ │ Portrait   │ │ Portrait   │ │ Portrait   │                     │
│ │ Name Lv    │ │ Name Lv    │ │ Name Lv    │                     │
│ │ Class      │ │ Class      │ │ Class      │                     │
│ │ Map        │ │ Map        │ │ Map        │                     │
│ │ Last play  │ │ Last play  │ │ Last play  │                     │
│ │ [Continue] │ │ [Continue] │ │ [Continue] │                     │
│ │ [Details]  │ │ [Details]  │ │ [Details]  │                     │
│ └────────────┘ └────────────┘ └────────────┘                     │
│ ┌────────────┐ ┌────────────┐                                    │
│ │ Empty Slot │ │ Empty Slot │                                    │
│ │ [Create]   │ │ [Create]   │                                    │
│ └────────────┘ └────────────┘                                    │
└──────────────────────────────────────────────────────────────────┘
```

- 3 columns desktop
- 2 columns tablet
- 1 column mobile
- card min 280×300 desktop
- selected/last-played card border teal

## 9.3 Card content

- portrait
- name
- class
- level
- map
- last played
- inventory usage `28/40`
- equipment summary score (informational only)
- unread delivery indicator account-level ไม่ต้องซ้ำทุก card
- Continue
- Details
- Storage shortcut opens storage with character context

## 9.4 Actions P2

- Continue
- Details
- Create
- Open Storage
- Back to Hub

Not shown:

- Delete
- Rename
- Reorder
- Buy slot

## 9.5 Character details

Tabs:

- Overview
- Equipment
- Inventory (read-only from web, editable in-game)
- Stats
- Progress

Game Hub mode:

- read-only inventory/equipment
- no move/deposit/withdraw
- no use/equip
- prevents cross-session mutation

---

# 10. Personal Storage Semantics

## 10.1 Baseline

```yaml
personalStorage:
  accountShared: true
  baseSlots: 200
  expansionP2: disabled
  access:
    inGameNpc: readWrite
    gameHub: readOnly
```

200 slots เป็น account capacity รวม ไม่แยก per tab

Category tabs เป็น filters ไม่ใช่ inventories แยก

## 10.2 Why 200

- รองรับ 5 characters
- ลด mule-character behavior
- ยังมี capacity management
- ไม่สร้าง pain เพื่อขาย slot
- query/pagination manageable

Future expansion เพิ่มทีละ 40 slots แต่ต้อง review economy/monetization

## 10.3 Access conditions

Read/write storage ได้เมื่อ:

- อยู่ safe town/storage NPC
- alive
- not in combat
- not transitioning map
- not reconnecting
- no market/trade lock
- no pending inventory transaction

Read-only Hub ได้ทุกเวลาเมื่อ account authenticated แต่ต้อง label freshness

## 10.4 Storage NPC

Interaction:

```txt
Approach NPC
→ Interact
→ Storage greeting
→ Open Storage
```

NPC ไม่บังคับ dialogue ยาวทุกครั้ง

ครั้งแรก:

- อธิบาย shared account storage
- tutorial highlight Deposit/Withdraw
- แสดง bind icons

ครั้งถัดไป:

- เปิดหน้าคลังโดยตรง
- optional short bark

---

# 11. Storage UI Screen Contract

## 11.1 Desktop two-pane layout

```txt
┌────────────────────────────────────────────────────────────────────┐
│ คลังส่วนตัว                    142 / 200                     [X]    │
├──────────────────────────────┬─────────────────────────────────────┤
│ CHARACTER INVENTORY  28/40   │ PERSONAL STORAGE 142/200            │
│ [All][Equip][Mat][Use]       │ [All][Equip][Mat][Use][Event]       │
│ [Search____________]         │ [Search___________________] [Sort]  │
│                              │                                     │
│ [ ][ ][ ][ ][ ][ ][ ][ ]    │ [ ][ ][ ][ ][ ][ ][ ][ ][ ][ ]    │
│ [ ][ ][ ][ ][ ][ ][ ][ ]    │ [ ][ ][ ][ ][ ][ ][ ][ ][ ][ ]    │
│ [ ][ ][ ][ ][ ][ ][ ][ ]    │ [ ][ ][ ][ ][ ][ ][ ][ ][ ][ ]    │
│                              │                                     │
│ Selected item detail         │ Selected item detail                │
├──────────────────────────────┴─────────────────────────────────────┤
│ Gold: Character-bound     [Deposit] [Withdraw] [Close]             │
└────────────────────────────────────────────────────────────────────┘
```

Dimensions:

- max width 1240px
- max height 760px
- inventory pane 40%
- storage pane 60%
- panel padding 24px
- slot 52–56px
- gap 6–8px

## 11.2 Mobile fullscreen layout

```txt
[ Inventory ] [ Storage ] [ Delivery ]

Search / Filter
Grid 5 columns

Selected Item Bottom Sheet

[Deposit / Withdraw]
```

- tab switching preserves selection
- no drag between hidden tabs
- deposit/withdraw uses explicit CTA
- long press opens details
- grid scroll vertical

## 11.3 Colors

Use shared tokens:

- panel `#2B2230`
- darkest background `#171820`
- border `#68483A`
- text `#F2D6A0`
- highlight `#FFF0C5`
- selected/focus `#35C6B0`
- blocked/error `#D84848`
- warning `#F4B852`

Rarity border follows UI Visual Spec

## 11.4 Search

Search by:

- display name
- item type
- material category
- rarity keyword
- tag

Rules:

- debounce 150ms
- case-insensitive
- Thai/English token match
- empty query shows all
- search does not mutate order

## 11.5 Sort

Options:

- Type
- Rarity
- Level
- Name
- Recently Added
- Quantity

Sort applies view only; server slot order may persist separately

## 11.6 Filter

- All
- Equipment
- Materials
- Consumables
- Upgrade
- Event
- Quest/Blocked (visibility only)
- Favorites

Blocked item may be visible in inventory but disabled for deposit

---

# 12. Item Sharing Policy

## 12.1 Required schema fields

```yaml
itemOwnership:
  bindType:
    - UNBOUND
    - ACCOUNT_BOUND
    - CHARACTER_BOUND
  storagePolicy:
    - ALLOWED
    - CONDITIONAL
    - BLOCKED
  tradePolicy:
    - NONE
    - MARKET
    - DIRECT_FUTURE
  uniqueEquipGroup: optional
  expiresAt: optional
```

## 12.2 Category A — Shareable through Storage

Default `ALLOWED`

- common materials
- crafting materials
- ore/herbs
- upgrade materials
- unused skill books
- consumables
- normal event currency item
- unbound equipment
- account-bound equipment
- cosmetic token before redemption

Rules:

- Account-bound ฝากได้ แต่ market/direct trade ไม่ได้
- Consumable stack merges up to max stack
- Expired item blocked/removedตาม item policy

## 12.3 Category B — Conditional

- equipped equipment
- favorite/locked item
- loadout-linked item
- recently acquired anti-fraud item
- time-limited item
- character-use-restricted item

Conditions:

- equipped ต้องถอดก่อน
- favorite ต้อง confirm หรือปลด favorite
- market-listed ต้อง cancel listing ก่อน
- transaction-locked ฝากไม่ได้
- class-restricted ฝากได้ถ้า bind policy อนุญาต แม้ character ปัจจุบันใช้ไม่ได้
- cracked item ฝากได้ถ้า account-bound/unbound และไม่อยู่ repair transaction

## 12.4 Category C — Character-bound / Blocked

- story key items
- character quest items
- temporary quest tokens
- character-specific reward
- active buff object
- tutorial-only item
- death/recovery token
- item with `CHARACTER_BOUND`

UI:

- lock icon
- label `ผูกกับตัวละคร`
- tooltip reason
- Deposit disabled
- สีไม่ใช่ indicator เดี่ยว

## 12.5 Category D — Account unlocks

ไม่อยู่ใน storage grid:

- achievement
- cosmetic entitlement
- title
- nameplate
- journal
- discovery
- companion unlock
- supporter entitlement

เปิดใช้ทุกตัวทันทีตาม eligibility

## 12.6 Currency

P2:

- Gold = character-bound
- Premium currency = account-level Future
- แกร่งเป็น item/material ตาม Economy Spec และฝากคลังได้
- Event currency ถ้าเป็น item ฝากได้; ถ้าเป็น account counter ไม่อยู่คลัง

---

# 13. Deposit Flow

## 13.1 Interaction

Desktop:

- select item → Deposit
- double-click optional shortcut
- drag inventory → storage
- right-click `ฝาก`

Mobile:

- tap → detail sheet → Deposit
- long press → context action
- no hidden drag dependency

## 13.2 Transaction

```txt
SELECTED
→ CLIENT_PRECHECK
→ DEPOSIT_REQUESTED
→ SERVER_LOCK_ITEM
→ VALIDATE_POLICY
→ FIND/MERGE_STORAGE_STACK
→ COMMIT
→ SUCCESS
```

Failure:

- STORAGE_FULL
- ITEM_BOUND
- ITEM_EQUIPPED
- ITEM_LOCKED
- ITEM_CHANGED
- SESSION_INVALID
- TRANSACTION_CONFLICT
- UNKNOWN

## 13.3 Stack behavior

- Merge existing compatible stack first
- Overflow creates new stack
- If insufficient slots, transaction fails atomically
- No partial deposit unless user explicitly split quantity
- Stack identity/metadata must match merge rules

## 13.4 Quantity

Stack item:

- default full stack
- quantity stepper
- quick 1 / half / max
- min 1
- confirm only high-value/event item per policy

Equipment:

- quantity 1
- instance ID preserved

## 13.5 Success feedback

- item animates/fades to target pane 160ms
- capacity updates authoritative
- success sound soft
- recent item highlight 1.5s
- no blocking modal

---

# 14. Withdraw Flow

Mirror deposit:

```txt
SELECT STORAGE ITEM
→ CHECK INVENTORY SPACE
→ SERVER LOCK
→ VALIDATE CHARACTER ELIGIBILITY
→ MOVE/MERGE
→ COMMIT
→ SUCCESS
```

Rules:

- class restriction does not block carrying unless item spec says
- Character-bound-to-other-character item cannot exist in shared storage; migration error routes support
- Inventory full: remain storage
- partial stack allowed
- equipment instance preserved
- withdrawing does not auto-equip

---

# 15. Storage Full

## 15.1 Warning thresholds

- 80%: neutral capacity
- 90%: warning Fire Light
- 100%: Danger Red + icon + text

## 15.2 Full behavior

- Deposit disabled for items needing new slot
- Stack merge still allowed if destination stack has room
- Message: `คลังเต็ม — รวมกองหรือย้ายของออกก่อน`
- No item loss
- Delivery Box does not auto-overflow into storage
- No paid expansion CTA in P2

## 15.3 Empty state

```txt
คลังยังว่างอยู่
ฝากของที่อยากใช้ร่วมกับตัวละครอื่นได้ที่นี่
```

CTA ไม่จำเป็น เพราะ inventory pane visible

---

# 16. Delivery Box

## 16.1 Purpose

เก็บ reward ที่ระบบส่ง โดยไม่เสี่ยงหายจาก inventory full

## 16.2 Sources

- compensation
- GM gift
- event reward
- achievement reward
- market purchase P4
- paid item
- campaign gift
- migrated item recovery

## 16.3 Capacity

```yaml
deliveryBox:
  maxEntries: 50
  claimAll: true
  claimSelected: true
```

หนึ่ง entry อาจมีหลาย item แต่ transaction claim ต้องระบุ item list

## 16.4 Expiration

| Source | Expiry |
|---|---|
| Paid item | Never |
| Compensation | 90 days |
| GM critical recovery | Never |
| Event reward | 90 days |
| Achievement reward | Never |
| Market purchase | 30 days minimum / final P4 spec |
| Promotional gift | 30–90 days ระบุชัด |

- แสดงวันหมดอายุ absolute
- แจ้งเตือน 7 วัน / 1 วัน
- ห้ามหมดอายุเงียบ

## 16.5 Claim destinations

### To current inventory

- ใช้ได้ทุกที่จาก Delivery UI หาก gameplay policy อนุญาต
- item-bound eligibility ตรวจ current character
- inventory full → item remain

### To Personal Storage

- ใช้ได้เมื่อ storage capacity พอ
- Account-bound/shareable item
- Character-bound itemต้องฝาก current inventory เท่านั้น
- Paid entitlement ที่ไม่ใช่ item apply account โดยตรง

## 16.6 Delivery screen desktop

```txt
┌──────────────────────────────────────────────────────────────┐
│ กล่องรับของ                         12 / 50         [X]       │
├────────────────────────────┬─────────────────────────────────┤
│ ENTRY LIST                 │ ENTRY DETAIL                    │
│ [Compensation] New         │ Title / Sender / Date           │
│ [Event Reward] 7d          │ Message                         │
│ [Achievement]              │ [item][item][currency]          │
│                            │ Expiry                           │
│                            │ [Claim to Bag] [Claim to Storage]│
├────────────────────────────┴─────────────────────────────────┤
│ [Claim All Eligible]                                           │
└──────────────────────────────────────────────────────────────┘
```

## 16.7 Mobile

- entry list full screen
- detail opens sheet/page
- sticky claim CTA
- expiration visible before claim
- Claim All has confirm summary

## 16.8 Claim All

- only eligible items
- preview destination and excluded reasons
- atomic per delivery entry, not necessarily all entries globally
- failed items remain
- summary after action

## 16.9 States

- Empty: `ยังไม่มีของส่งมาถึง`
- New: teal dot
- Expiring: warning icon
- Paid: purchase badge, no gold color abuse
- Error: retry + claim status verification
- Unknown: server reconciliation

---

# 17. Personal Storage and Delivery Navigation

In-game:

```txt
Town NPC
→ Storage
├── Inventory / Personal Storage
└── Delivery Box
```

Game Hub:

```txt
Characters
├── View Inventory (read-only)
├── View Equipment (read-only)
└── View Storage/Delivery (read-only)
```

Mutation from Game Hub is `FUTURE`

เหตุผล:

- ป้องกัน race กับ active game
- ลด exploit surface
- ลด session ownership complexity
- รักษาโลก/NPC relevance

---

# 18. Trade Boundary

## 18.1 P2/P2B

- No direct player trade
- No guild storage
- No mail attachment
- Personal Storage is same-account only

## 18.2 P4

- Market launches
- Item trade policy controlled by item schema
- Market-delivered item goes Delivery Box
- Listed item locked from inventory/storage

## 18.3 Direct Trade Future

ก่อนเปิดต้องออกแบบ:

- trade window
- two-step confirm
- item/gold lock
- cancellation
- disconnect recovery
- scam prevention
- audit
- bind rules
- tax/sink
- account verification
- bot/mule abuse

ห้าม assume ว่า Market = Direct Trade

---

# 19. Loading, Error and Recovery

## 19.1 Loading

- Skeleton for lists
- Spinner for transaction
- >2s show status text
- >8s show Retry when safe
- Transaction button disabled after submit

## 19.2 Error card format

```txt
[Icon] เกิดปัญหาขณะย้ายของ
ข้อมูลของคุณยังไม่ถูกลบ
[ลองใหม่] [ดูรายละเอียด]
Error: STORAGE_TX_104
```

ห้ามแสดง stack trace

## 19.3 Unknown transaction

```txt
REQUEST_SENT
→ CONNECTION_LOST
→ QUERY_TRANSACTION
├── COMMITTED → apply authoritative result
├── ROLLED_BACK → restore UI
└── STILL_PENDING → keep locked, retry
```

ห้าม optimistic rollback โดยไม่ query server

## 19.4 Item mismatch

หาก client item version เก่า:

- reject
- refresh item
- preserve selection if possible
- message `ข้อมูลไอเทมมีการเปลี่ยนแปลง กรุณาลองใหม่`

---

# 20. Accessibility

- Keyboard complete flow
- Focus visible 3px
- Touch >=48px
- Color not sole indicator
- Bind/blocked state has icon + text
- Screen reader label for slot/item/action
- Reduced Motion
- Text size support
- Tooltips accessible by focus/tap
- Drag has click/tap alternative
- Capacity and expiry read as text
- Modal default focus safe action

Keyboard baseline:

- Tab: focus
- Enter/Space: activate
- Arrow keys: grid navigation
- Escape: close
- Shift+Enter or explicit shortcut ห้ามใช้เป็น only path

---

# 21. Telemetry

## 21.1 Events

```txt
hub_open
continue_click
continue_success
continue_fail
character_management_open
character_create_start
character_create_success
character_create_fail
character_switch
session_takeover_prompt
session_takeover_success
storage_open
storage_search
storage_deposit_start
storage_deposit_success
storage_deposit_fail
storage_withdraw_start
storage_withdraw_success
storage_withdraw_fail
storage_full
delivery_open
delivery_claim_start
delivery_claim_success
delivery_claim_fail
delivery_expiry_warning
```

## 21.2 Fields

- account id hashed/internal
- character id
- device class
- input mode
- viewport
- item id/type/rarity
- quantity
- source/destination
- capacity before/after
- error category
- latency bucket
- config version
- UI spec version
- transaction id

ห้ามส่งชื่อผู้เล่นหรือข้อความส่วนตัวเกินจำเป็น

---

# 22. Security and Anti-exploit

- Server owns item location
- Item instance อยู่ได้ที่ location เดียว
- Deposit/withdraw uses row/version lock or equivalent
- Idempotency required
- Account session checked
- Rate limit item movement
- Audit rare/high-value moves
- Market/listed lock
- No client-provided ownership truth
- Detect rapid transfer loops
- Storage never accepts foreign account item
- Delivery claims signed/server-generated
- Paid item claim audit

Invariant:

```txt
item.location ∈ {
  CHARACTER_INVENTORY(characterId),
  CHARACTER_EQUIPMENT(characterId),
  ACCOUNT_STORAGE(accountId),
  DELIVERY_BOX(accountId),
  MARKET_ESCROW(listingId),
  WORLD_LOOT(entityId),
  DESTROYED
}
```

หนึ่ง item instance มี location เดียวเท่านั้น

---

# 23. API/Command Contract (Semantic)

ชื่อจริงให้ Tech กำหนด แต่ semantic ต้องมี:

```txt
getAccountHub()
listCharacters()
createCharacter()
getContinueCharacter()
selectCharacter()
reserveGameSession()
takeOverGameSession()

getStorage()
depositItem()
withdrawItem()
getStorageTransaction()

getDeliveryEntries()
claimDeliveryItem()
claimDeliveryEntry()
claimEligibleDeliveries()
getDeliveryClaimStatus()
```

ทุก mutation response ต้องมี:

- transactionId
- authoritative inventory/storage snapshot delta
- capacity
- item versions
- error code
- config version

---

# 24. Persistence Model Requirements

Account:

- active/last character
- slot usage
- entitlements
- storage capacity
- help/journal/achievement
- delivery entries

Character:

- inventory
- equipment
- gold
- level/EXP
- quest/world
- last played

Item instance:

- item definition ID
- instance ID
- owner account
- bind type
- location
- quantity
- upgrade state
- cracked state
- lock state
- version
- created/updated
- expiry

Storage:

- account ID
- slot/index or virtual order
- capacity
- version

---

# 25. QA Test Matrix

## 25.1 Character

- create 1–5
- sixth blocked
- duplicate class allowed
- duplicate name blocked
- Unicode Thai names
- network disconnect during create
- double submit
- last character routing
- no character routing

## 25.2 Continue

- single character
- multiple characters
- server offline
- character locked
- reconnect
- take over
- stale last character
- mobile/desktop

## 25.3 Storage

- deposit equipment/material/consumable
- bound blocked
- equipped blocked
- stack merge
- stack overflow
- storage full
- inventory full withdraw
- concurrent tabs
- reconnect during transaction
- high latency
- item version mismatch
- search/sort/filter
- keyboard/touch

## 25.4 Delivery

- empty
- 50 entries
- paid no expiry
- event expiry
- claim inventory
- claim storage
- full destinations
- partial eligibility
- claim all
- disconnect
- retry/idempotency

## 25.5 Security

- forged item ID
- foreign account item
- replay transaction
- rapid duplicate clicks
- market-locked item
- session takeover during movement
- rollback/reconcile

---

# 26. Acceptance Criteria

## Account/Hub

- Continue primary and reachable in one click
- Character Select is secondary
- Hub works when game server unavailable where possible
- 5 slots visible and understandable

## Character

- duplicate class works
- unique name enforced
- sixth character impossible
- create transaction cannot duplicate starter items
- alt tutorial skip respects account-once rewards

## Storage

- all five characters access same 200 slots
- shareable categories move correctly
- character-bound never deposits
- equipped item never moves silently
- no item lost on full/error
- transaction recovers after disconnect
- Game Hub is read-only

## Delivery

- reward never destroyed by inventory full
- paid/critical entries do not expire
- expiry visible
- Claim All explains excluded items
- unknown state reconciles

## UX/UI

- Desktop 1280×720 pass
- Mobile landscape 640×360 minimum pass
- keyboard pass
- touch pass
- reduced motion pass
- Thai text +30% length pass
- no Figma required to reproduce layout and states

---

# 27. Implementation Sequence

## Wave A — Foundation

1. Account/character schema
2. 5 slots
3. last/active character
4. Continue routing
5. one active session

## Wave B — Hub/Management

1. Continue Card
2. Character Management
3. read-only character details
4. create alt flow

## Wave C — Storage

1. item ownership fields
2. account storage 200
3. NPC access
4. deposit/withdraw transaction
5. UI desktop/mobile
6. telemetry/security

## Wave D — Delivery

1. delivery schema
2. source API
3. claim transaction
4. UI
5. expiry/notification
6. future market/payment hooks

---

# 28. Definition of Done

- [ ] Account vs Character data ownership implemented
- [ ] Five slots enforced server-side
- [ ] Duplicate class allowed
- [ ] Names normalized/unique
- [ ] Continue-first routing complete
- [ ] One active session enforced
- [ ] Storage 200 shared slots works
- [ ] Item sharing policy data-driven
- [ ] Deposit/withdraw atomic/idempotent
- [ ] Delivery Box prevents reward loss
- [ ] Hub read-only boundaries enforced
- [ ] Desktop/mobile screens match contracts
- [ ] Loading/empty/error/unknown states complete
- [ ] Accessibility complete
- [ ] Telemetry and audit complete
- [ ] QA matrix passes
- [ ] Specs/decision-index updated
