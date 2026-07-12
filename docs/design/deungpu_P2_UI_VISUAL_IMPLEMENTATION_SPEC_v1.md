# ดึ๋งปุ๊ — P2 UI Visual Implementation Specification

> **ไฟล์:** `deungpu_P2_UI_VISUAL_IMPLEMENTATION_SPEC_v1.md`  
> **สถานะ:** `DRAFT — OWNER REVIEW REQUIRED`  
> **ขอบเขต:** Login / Guest / Character Creation / HUD / Inventory / Equipment / NPC Shop / Upgrade / Death / Settings  
> **เป้าหมาย:** ให้ทีมพัฒนา UI ได้ใกล้เคียงกันโดยไม่ต้องมี Figma และไม่ต้องเดาพฤติกรรม สี ขนาด ระยะ หรือ State  
> **Source of truth ที่ต้องอ่านร่วม:**  
> - `deungpu_VISUAL_LANGUAGE_BIBLE_v1.md`
> - `deungpu_ASSET_PRODUCTION_BIBLE_v1.md`
> - `deungpu_GAME_DESIGN_PRINCIPLES_v1.md`
> - `deungpu_COMBAT_BIBLE_v1.md`
> - Canonical game spec v15.2
> - Technical architecture v1.5.2

---

# 0. Decision Status และกติกาการใช้เอกสาร

ค่าทุกค่าต้องมีสถานะหนึ่งในรายการนี้:

| สถานะ | ความหมาย |
|---|---|
| `LOCKED` | มาจาก Canonical Spec หรือ Production Bible ห้ามเปลี่ยนโดยไม่ผ่าน Owner |
| `PROPOSED BASELINE` | ค่าเริ่มต้นที่เสนอให้ทีมใช้ทำงานและส่ง Owner Review |
| `TUNABLE` | ปรับได้จาก token/config โดยไม่เปลี่ยน semantics |
| `PENDING OWNER` | ห้าม implement logic ที่ผูกกับคำตอบจนกว่า Owner จะเคาะ |
| `FUTURE` | รองรับโครงสร้างไว้ได้ แต่ไม่อยู่ใน P2 |

กติกา:

1. UI ต้องใช้ Design Token ห้าม hardcode สีและ spacing กระจายตาม component
2. Desktop และ Mobile ต้องใช้ semantics เดียวกัน แม้ layout ต่างกัน
3. สีห้ามเป็นตัวสื่อสถานะเพียงอย่างเดียว ต้องมี icon, shape, label หรือ motion ร่วม
4. Gameplay truth เช่น HP, cooldown, cost, success rate และ item state ต้องอ่านได้ชัด
5. Gold ห้ามใช้เป็น generic CTA เพราะสงวนความหมายให้ Legendary / Achievement / sacred climax
6. UI ทุกจอต้องมี Loading, Empty, Error, Disabled และ Recovery State
7. Animation ห้าม block input เกินความจำเป็น
8. ทุก destructive action ต้องมี Undo หรือ Confirm ตามระดับความเสียหาย
9. P2 ใช้ responsive layout ไม่ทำ UI Desktop แล้วย่อทั้งชุดลงมือถือ
10. หาก implementation จำเป็นต้องต่างจากเอกสาร ให้แก้ Spec หรือทำ decision record ก่อน

---

# 1. Visual Thesis

`LOCKED`

> Pixel-fantasy interface with modern readability

อารมณ์รวม:

- โลกมนุษย์อบอุ่นและคุ้นเคย
- ระบบผนึกและพลังที่ไว้ใจได้ใช้ Teal
- สิ่งผิดธรรมชาติและรอยแยกใช้ Magenta
- อันตรายเร่งด่วนใช้ Red
- Legendary และ Achievement สำคัญใช้ Gold อย่างประหยัด
- Panel มีน้ำหนักแบบไม้ หนัง ผ้า และกระดาษ ไม่ใช่กระจก Sci-fi
- มุมโค้งเล็กน้อยและดูเหมือนแกะด้วยมือ
- UI ต้องอ่านเร็วกว่า “สวยแบบตกแต่งหนัก”

สัดส่วนอารมณ์ภาพ:

```txt
60% warm grounded world
25% mysterious resonance
10% playful oddity
5% cosmic dread / rare spectacle
```

---

# 2. Master Design Tokens

## 2.1 Color Tokens

สีทั้งหมดด้านล่างมาจาก Master Palette ของ Asset Production Bible เว้นแต่ระบุว่าเป็น Alpha Composition

### Foundation

| Token | Hex | ใช้กับ |
|---|---:|---|
| `--dp-deep-ink` | `#171820` | ฉากหลังเข้มที่สุด, overlay, shadow |
| `--dp-warm-ink` | `#2B2230` | panel หลัก |
| `--dp-deep-brown` | `#4A332E` | border เข้ม, wood frame |
| `--dp-soil-brown` | `#68483A` | border ปกติ |
| `--dp-clay` | `#8E6046` | secondary surface |
| `--dp-warm-wood` | `#B47E52` | frame highlight |
| `--dp-sand` | `#D8AE70` | muted text, divider |
| `--dp-parchment` | `#F2D6A0` | surface สว่าง, primary text บนพื้นเข้ม |
| `--dp-highlight` | `#FFF0C5` | text emphasis / hover highlight |

### Resonance / Focus

| Token | Hex | ใช้กับ |
|---|---:|---|
| `--dp-resonance-dark` | `#167C78` | pressed/active dark |
| `--dp-resonance-teal` | `#35C6B0` | focus, primary action, selected |
| `--dp-resonance-light` | `#7CE9D0` | hover, glow ขนาดเล็ก |

### Danger / Error

| Token | Hex | ใช้กับ |
|---|---:|---|
| `--dp-fire-deep` | `#9E3C32` | destructive pressed |
| `--dp-fire` | `#DD6840` | warning |
| `--dp-fire-light` | `#F4B852` | caution / attention |
| `--dp-danger-red` | `#D84848` | immediate danger, invalid, delete |

### Mystery / Corruption

| Token | Hex | ใช้กับ |
|---|---:|---|
| `--dp-corruption-deep` | `#6E315F` | corruption surface |
| `--dp-corruption` | `#A84683` | rupture state |
| `--dp-corruption-light` | `#DA73B0` | rare corruption accent |

### Memory / Night

| Token | Hex | ใช้กับ |
|---|---:|---|
| `--dp-moon-deep` | `#4B568E` | spirit panel |
| `--dp-moon-blue` | `#7786C8` | memory / lore |
| `--dp-moon-light` | `#B0B9EC` | soft highlight |

### Success / Nature

| Token | Hex | ใช้กับ |
|---|---:|---|
| `--dp-deep-leaf` | `#284536` | success dark |
| `--dp-leaf` | `#3F6845` | success |
| `--dp-fresh-leaf` | `#6F9658` | positive state |
| `--dp-pale-moss` | `#C8D691` | success text / healing |

### Rarity

| Rarity | Main Color | Border | Motion |
|---|---|---|---|
| Common | `#D8AE70` | `#68483A` | none |
| Uncommon | `#6F9658` | `#3F6845` | subtle pulse optional |
| Rare | `#7786C8` | `#4B568E` | small spark |
| Epic | `#A84683` | `#6E315F` | controlled inner glow |
| Legendary | `#E8BF4F` | `#8E6046` | authored motif |
| Mythic/Celestial | `#E8BF4F` + cosmic accent | authored | authored sequence only |

### Alpha Composition

`PROPOSED BASELINE`

```css
--dp-overlay-soft: rgba(23, 24, 32, 0.56);
--dp-overlay-modal: rgba(23, 24, 32, 0.76);
--dp-panel-bg: rgba(43, 34, 48, 0.96);
--dp-panel-bg-soft: rgba(74, 51, 46, 0.92);
--dp-focus-ring: rgba(53, 198, 176, 0.46);
--dp-disabled-overlay: rgba(23, 24, 32, 0.52);
--dp-shadow: rgba(10, 10, 14, 0.42);
```

---

## 2.2 Typography

`PROPOSED BASELINE`

แนวทาง:

- Font UI หลักต้องอ่านภาษาไทยได้ดี
- Pixel font ใช้เฉพาะหัวข้อสั้น ตัวเลขเด่น หรือ branding
- Body text ไม่ควรใช้ pixel font ที่อ่านยาก
- ห้ามใช้ตัวพิมพ์ใหญ่ทั้งหมดกับภาษาอังกฤษยาวเกิน 12 ตัวอักษร
- ตัวเลข combat และ stat ใช้ tabular numerals

### Font Roles

| Role | Font Style | Weight |
|---|---|---:|
| Display / Logo | Pixel fantasy display | 700 |
| Screen Title | Thai-readable display sans | 700 |
| Heading | Thai-readable sans | 600 |
| Body | Thai-readable sans | 400 |
| Label | Thai-readable sans | 500 |
| Numeric / Stat | Tabular sans | 600–700 |

### Type Scale

| Token | Desktop | Mobile | Line Height |
|---|---:|---:|---:|
| `display-xl` | 40px | 32px | 1.15 |
| `title-lg` | 28px | 24px | 1.25 |
| `title-md` | 22px | 20px | 1.3 |
| `heading` | 18px | 18px | 1.35 |
| `body` | 16px | 16px | 1.5 |
| `body-sm` | 14px | 14px | 1.45 |
| `caption` | 12px | 12px | 1.4 |
| `combat-number` | 20–32px | 18–28px | 1 |

ขั้นต่ำ:

- Body บนมือถือห้ามต่ำกว่า 14px
- ปุ่มหลักห้ามต่ำกว่า 16px
- Tooltip ห้ามต่ำกว่า 13px
- Text contrast ต้องอ่านได้ในระดับ practical AA-like

---

## 2.3 Spacing

`PROPOSED BASELINE`

ใช้ 4px base grid:

```txt
space-0 = 0
space-1 = 4
space-2 = 8
space-3 = 12
space-4 = 16
space-5 = 20
space-6 = 24
space-8 = 32
space-10 = 40
space-12 = 48
space-16 = 64
```

กติกา:

- Panel padding Desktop: 24px
- Panel padding Mobile: 16px
- Card gap: 12px
- Section gap: 24px
- Form control vertical gap: 12px
- ปุ่มคู่กัน: 8px
- Safe-area padding Mobile: `max(16px, env(safe-area-inset-*)))`

---

## 2.4 Radius / Border / Shadow

`PROPOSED BASELINE`

```txt
radius-sm = 4px
radius-md = 8px
radius-lg = 12px
radius-pill = 999px

border-thin = 1px
border-strong = 2px
focus-ring = 3px
```

Shape language:

- Panel: `radius-md`
- Modal: `radius-lg`
- Button: `radius-sm` ถึง `radius-md`
- Item slot: `radius-sm`
- HP/EXP bar: `radius-sm`
- หลีกเลี่ยง capsule shape กับทุกอย่าง
- Frame ใช้ 2 ชั้น: outer dark + inner warm highlight

Shadow:

```css
box-shadow:
  0 2px 0 rgba(255, 240, 197, 0.06) inset,
  0 10px 24px rgba(10, 10, 14, 0.42);
```

ห้ามใช้ blur หนักหรือ glassmorphism

---

## 2.5 Z-Index

`PROPOSED BASELINE`

| Layer | z-index |
|---|---:|
| Game canvas | 0 |
| World labels | 100 |
| HUD | 200 |
| Floating toast | 300 |
| Drawer / Sheet | 400 |
| Modal backdrop | 500 |
| Modal | 510 |
| Tooltip | 600 |
| Critical system alert | 700 |
| Debug overlay | 900 |

---

## 2.6 Motion

`PROPOSED BASELINE`

### Durations

```txt
instant = 0ms
fast = 100ms
normal = 160ms
slow = 240ms
emphasis = 360ms
```

### Easing

```css
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
--ease-enter: cubic-bezier(0, 0, 0, 1);
--ease-exit: cubic-bezier(0.3, 0, 1, 1);
--ease-bounce-soft: cubic-bezier(0.2, 1.2, 0.4, 1);
```

### Standard Motion

- Panel open: opacity 0→1 + scale 0.98→1, 160ms
- Drawer open: translate 12px→0 + opacity, 180ms
- Button press: scale 1→0.97, 80ms
- Selected slot: border color + 1px inner glow, 120ms
- Error shake: 4px left/right 2 cycles, 180ms
- Success: one controlled teal pulse, 240ms
- Reduced Motion: ปิด scale/shake เหลือ opacity 100ms

Animation ห้าม:

- ปิดบัง boss telegraph
- ทำให้ผู้เล่นรอ animation ก่อนกดต่อ
- ใช้ loop glow กับทุก element
- ใช้ screen flash ขาวเต็มจอบ่อย

---

# 3. Responsive Breakpoints และ Canvas

`PROPOSED BASELINE`

```txt
mobile-small: 320–479
mobile-large: 480–767
tablet: 768–1023
desktop: 1024–1599
desktop-wide: 1600+
```

Reference:

- Game art reference: 1920×1080
- UI acceptance: 1280×720 Desktop
- Mobile acceptance: 720p landscape
- Minimum supported gameplay viewport proposed: 640×360 landscape

กติกา:

1. HUD ใช้ anchor ตามขอบ viewport ไม่ใช้ absolute จาก center ทั้งหมด
2. Modal Desktop มี max-width
3. Mobile ใช้ Bottom Sheet / Fullscreen Panel แทน modal กลางจอหลายชั้น
4. ห้ามมี horizontal scroll ใน gameplay UI
5. Touch target ขั้นต่ำ 44×44px และแนะนำ 48×48px
6. Hover ต้องไม่เป็น interaction ที่จำเป็น
7. ทุกจอต้องรองรับ keyboard focus

---

# 4. Core Component Library

## 4.1 Panel

### Visual

- Background: `--dp-panel-bg`
- Border outer: 2px `--dp-deep-ink`
- Border inner: 1px `--dp-soil-brown`
- Header divider: 1px `--dp-deep-brown`
- Title: `--dp-highlight`
- Body text: `--dp-parchment`

### Sizes

| Type | Width | Padding |
|---|---:|---:|
| Compact | 320px | 16px |
| Standard | 480–720px | 24px |
| Large | 880–1120px | 24px |
| Mobile | viewport - 24px | 16px |

### Header

- Height: 48px Desktop / 44px Mobile
- Title left
- Close button right
- Decorative motif ไม่เกิน 20% ของพื้นที่ header

---

## 4.2 Button

### Variants

#### Primary

- BG: `--dp-resonance-dark`
- Border: `--dp-resonance-teal`
- Text: `--dp-highlight`
- Hover: BG `--dp-resonance-teal`, text `--dp-deep-ink`
- Pressed: BG `--dp-resonance-dark`, translateY 1px
- Focus: 3px focus ring
- Disabled: 45% opacity + lock/not-available icon optional

#### Secondary

- BG: `--dp-deep-brown`
- Border: `--dp-warm-wood`
- Text: `--dp-parchment`

#### Destructive

- BG: `--dp-fire-deep`
- Border: `--dp-danger-red`
- Text: `--dp-highlight`

#### Ghost

- Transparent
- Text: `--dp-parchment`
- Hover BG: alpha parchment 8%

### Sizes

| Size | Height | Horizontal Padding |
|---|---:|---:|
| Small | 32px | 12px |
| Medium | 40px | 16px |
| Large | 48px | 20px |
| Touch | 48px minimum | 16px |

---

## 4.3 Text Input

- Height Desktop: 40px
- Height Mobile: 48px
- BG: `--dp-deep-ink`
- Border: `--dp-soil-brown`
- Text: `--dp-highlight`
- Placeholder: `--dp-sand`
- Focus: border teal + focus ring
- Error: border danger red + icon + message
- Success validation: leaf icon, ไม่ใช้ green border ตลอดเวลา
- Character counter: มุมขวาล่างหรือใต้ field

---

## 4.4 Item Slot

### Sizes

| Context | Desktop | Mobile |
|---|---:|---:|
| Inventory | 56×56 | 52×52 |
| Equipment | 64×64 | 60×60 |
| HUD consumable | 48×48 | 56×56 |
| Tooltip preview | 72×72 | 64×64 |

### Anatomy

```txt
┌──────────────────┐
│ rarity border    │
│      icon        │
│                  │
│ stack        lock│
└──────────────────┘
```

- Icon source: 64×64
- Visible object target: 44–54px
- Stack count bottom-right
- Lock/Favorite icon top-right
- Broken/Cracked mark top-left
- New item dot top-leftถ้าไม่ชน cracked
- Selected: teal border + inner highlight
- Equipped: small `E`/equipment icon + label in tooltip
- Invalid target: red overlay + forbidden icon

---

## 4.5 Tooltip

- Max width Desktop: 360px
- Max width Mobile: 88vw
- BG: Deep Ink 98%
- Border ตาม rarity แต่ไม่ glow หนัก
- Item name ใช้ rarity color
- Body text parchment
- Positive stat: pale moss
- Negative stat: danger red
- Special lore: moon light
- Compare mode: column ปัจจุบัน / ใหม่
- Mobile เปิดด้วย tap/long press และต้องปิดได้ชัด

---

## 4.6 Modal / Confirmation

### Standard Confirm

- Title
- Consequence summary
- Primary/Secondary action
- Default focus อยู่ Cancel สำหรับ destructive action
- Escape ปิดได้ ยกเว้น server transaction กำลัง commit

### High-Risk Confirm

ใช้เมื่อ:

- ขาย Rare ขึ้นไป
- ทิ้ง Item สำคัญ
- ตีบวกมีโอกาสร้าว
- ใช้วัตถุดิบระดับสูง
- ลบข้อมูล
- Guest upgrade conflict

ต้องแสดง:

- Item icon + ชื่อ
- ผลที่อาจเกิด
- ค่าใช้จ่าย
- Checkbox หรือ hold-to-confirm เฉพาะ irreversible action

---

## 4.7 Toast

ตำแหน่ง:

- Desktop: ขวาบน ใต้ minimap
- Mobile: กลางบน ใต้ safe area

ประเภท:

| Type | Accent | Duration |
|---|---|---:|
| Info | Teal | 3s |
| Success | Fresh Leaf | 2.5s |
| Warning | Fire Light | 4s |
| Error | Danger Red | 5s |
| Loot | Rarity color | 2.5s |

Critical error ต้องมี recovery action เช่น Retry

---

# 5. Global Screen Shell

## 5.1 Desktop

```txt
┌──────────────────────────────────────────────────────────────┐
│                        GAME / BACKDROP                       │
│                                                              │
│   [Left HUD]                                  [Right HUD]     │
│                                                              │
│                 [Context Panel / Modal]                       │
│                                                              │
│                                                              │
│                  [Skill Bar Bottom Center]                    │
└──────────────────────────────────────────────────────────────┘
```

- UI ไม่ควรปิดพื้นที่ combat center เกิน 30%
- Panel ใหญ่เปิดแล้ว game อาจ dim แต่ยังเห็นโลก
- Inventory/Shop ใช้ 2-panel layout Desktop

## 5.2 Mobile Landscape

```txt
┌──────────────────────────────────────────────────────────────┐
│ [HP]                                            [Mini Map]    │
│                                                              │
│                                                              │
│ [Move]                                     [Skills/Attack]   │
│                    [Context]                                 │
└──────────────────────────────────────────────────────────────┘
```

- Controls อยู่ thumb reach
- Center 45% ของจอสงวนให้สนามต่อสู้
- Panel ระบบใช้ fullscreen sheet
- ปุ่มรองอยู่ expandable menu

---

# 6. Login / Guest Entry

## 6.1 Purpose

ให้ผู้เล่นเข้าเกมเร็วที่สุดโดยยังสื่อความเสี่ยงของ Guest Account อย่างซื่อสัตย์

## 6.2 Desktop Layout

```txt
┌────────────────────────────────────────────────────────────┐
│                    WORLD BACKDROP                           │
│                                                            │
│                 [ดึ๋งปุ๊ LOGO]                              │
│                                                            │
│             ┌────────────────────────┐                     │
│             │ เล่นต่อจากครั้งก่อน    │                     │
│             │ [เล่นแบบ Guest]        │                     │
│             │ [เข้าสู่ระบบด้วย Email]│                     │
│             │                        │                     │
│             │ สถานะ Server / Version │                     │
│             └────────────────────────┘                     │
└────────────────────────────────────────────────────────────┘
```

Panel:

- Width 420px
- Centered
- Logo ห่าง panel 24px
- Backdrop ใช้เมืองอุ่น + teal seal light
- Overlay 44–56% เพื่ออ่านข้อความ

## 6.3 Mobile

- Fullscreen backdrop
- Logo upper third
- Actions lower third
- Buttons width 100%, height 48px
- Server status เป็น caption

## 6.4 Visual States

### Default

- Primary: เล่นต่อ / เล่นแบบ Guest
- Secondary: Email
- Guest warning เป็นข้อความสั้น ไม่ใช้ modal ก่อนเริ่มครั้งแรก

### Returning Guest

แสดง badge:

```txt
Guest Account
ข้อมูลผูกกับอุปกรณ์นี้
[เชื่อม Email]
```

### Server Offline

- Logo ลด saturation
- Panel แสดง danger strip
- CTA: Retry
- Help link: สถานะระบบ

### Loading

- ปุ่ม disabled
- Spinner แบบ seal rotation 16–20px
- ข้อความ `กำลังเชื่อมต่อ...`

## 6.5 Errors

| Error | Message | Action |
|---|---|---|
| Session expired | เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง | Login |
| Network | เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่ | Retry |
| Server full | โลกนี้กำลังแน่น ลองอีกครั้งในอีกสักครู่ | Retry |
| Guest conflict | พบข้อมูล Guest อีกชุดบนบัญชีนี้ | Resolve flow |
| Maintenance | ปิดปรับปรุงชั่วคราว | Details |

---

# 7. Character Creation

## 7.1 PENDING OWNER Decisions

- จำนวนตัวละครต่อบัญชี
- ความยาวชื่อขั้นต่ำ/สูงสุด
- ตัวอักษรที่อนุญาต
- ชื่อซ้ำข้าม server/channel หรือไม่
- ลบตัวละครได้หรือไม่
- Class ที่เปิดใน P2

Baseline ที่เสนอ:

```txt
charactersPerAccount: 1
nameLength: 3–16
allowed: Thai, English, numbers
trimOuterSpaces: true
emoji: false
reservedWords: Admin, GM, System และรายการ config
caseInsensitiveUnique: true
deleteCharacter: false in P2
```

## 7.2 Desktop Layout

```txt
┌──────────────────────────────────────────────────────────────┐
│ [Back]             สร้างนักผจญภัย                           │
├────────────────┬──────────────────────────┬──────────────────┤
│ CLASS LIST     │ CHARACTER PREVIEW        │ CHARACTER INFO   │
│                │                          │                  │
│ [นักดาบ]       │                          │ ชื่อตัวละคร      │
│ [นักธนู]       │       animated idle      │ [____________]   │
│ [locked...]    │                          │ 0 / 16           │
│                │                          │ จุดเด่นอาชีพ      │
│                │                          │ [สร้างตัวละคร]   │
└────────────────┴──────────────────────────┴──────────────────┘
```

Dimensions:

- Max width: 1180px
- Height: min(720px, viewport - 64px)
- Left: 240px
- Center: flexible, min 420px
- Right: 320px
- Gap: 16px

## 7.3 Mobile Landscape

```txt
┌──────────────────────────────────────────────────────────────┐
│ [Back]      สร้างนักผจญภัย                                  │
│                                                              │
│        <     CHARACTER PREVIEW      >                        │
│         [นักดาบ] [นักธนู] ... horizontal                    │
│                                                              │
│ ชื่อตัวละคร [________________________]                       │
│ จุดเด่น: แนวหน้า / กวาดฝูง / Break          [สร้าง]          │
└──────────────────────────────────────────────────────────────┘
```

## 7.4 Class Card

- Icon 48×48
- ชื่อ 18px
- Role tag 12px
- Selected: teal frame
- Locked: deep ink overlay + lock icon + `เร็ว ๆ นี้`
- ห้ามใช้ grayscale อย่างเดียว ต้องมี label

## 7.5 Preview

- Background gradient ห้ามเป็น neon
- Base warm dark + subtle teal seal motif
- Character idle loop
- เปลี่ยน class: crossfade 160ms
- ห้ามหมุน 3D เพราะเกมเป็น True 2D
- แสดงอาวุธและ stance ให้ class อ่านออกก่อน costume detail

## 7.6 Validation

- Local validate ขณะพิมพ์
- Server validate ตอน submit
- Error message ใต้ field
- Create disabled จน local valid
- Duplicate name focus กลับ input และ select text

## 7.7 Create Success

1. ปุ่มเข้าสถานะ loading
2. Server ยืนยัน
3. Teal seal pulse 240ms
4. Character step-forward animation
5. Fade to city/game 360ms

---

# 8. Main HUD

## 8.1 Desktop Layout

```txt
┌──────────────────────────────────────────────────────────────┐
│ [Portrait Name Lv]                            [Minimap]       │
│ [HP================]                          [Channel]       │
│ [EXP---------------]                          [Help][Menu]    │
│                                                              │
│                                                              │
│                                                              │
│            [1][2][3][4] [Attack] [Potion]                    │
│                                            [Bag][Char][Book]  │
└──────────────────────────────────────────────────────────────┘
```

## 8.2 Player Status Cluster

Position: top-left, 16px safe margin

- Portrait: 48×48
- Name: 16px semibold
- Level badge: 28×24
- HP bar: 240×18
- EXP bar: 240×6
- HP text mode configurable: current/max หรือ percent
- Low HP <20%: red edge pulse 1Hz
- Reduced Flash: ใช้ static red border แทน pulse

HP Colors:

- Fill normal: Fresh Leaf → Pale Moss
- Damage trailing bar: Fire Light
- Low: Danger Red
- Background: Deep Ink
- Border: Deep Brown

## 8.3 Skill Bar

Position: bottom-center, 20px from safe bottom

- Slot size: 56×56
- Gap: 8px
- Primary attack: 64×64
- Potion: 52×52
- Cooldown: clockwise dark radial + numeric seconds
- Unavailable: desaturate 60% + reason icon
- Key label: top-left
- Charges: bottom-right
- Global lock: subtle shared sweep, ไม่ปิด icon ทั้งหมด

## 8.4 Minimap

- Desktop: 180×180
- Compact: 144×144
- Frame: warm dark neutral
- Player: teal arrow
- Party: moon blue
- NPC/interactable: pale moss
- Danger/Boss: danger red
- Quest/important: gold ใช้เฉพาะ objective สำคัญ
- North indicator
- Click opens map panel
- Collapse supported

## 8.5 Help Button

- อยู่ใกล้ Minimap
- Icon `?` + small companion motif
- เมื่อมี hint ใหม่: teal dot ไม่กระพริบรุนแรง
- ห้าม popup เองระหว่าง combat danger

## 8.6 Connection State

- Connected: ไม่ต้องโชว์ตลอด
- Reconnecting: amber strip `กำลังเชื่อมต่อใหม่...`
- Offline solo: moon-blue label
- Disconnected: modal เฉพาะเมื่อ action ต่อไม่ได้

---

# 9. Mobile HUD

## 9.1 Layout A — Standard Landscape

- HP cluster: top-left
- Minimap: top-right 128×128
- Movement joystick: left-bottom 120px interaction zone
- Attack: right-bottom 72×72
- Skills: 56×56 รอบ Attack
- Potion: 52×52 ใกล้นิ้วโป้งขวา
- Menu: top-right ใต้ minimap
- Context interaction: center-bottom 56×56

## 9.2 Layout B — Compact

ใช้เมื่อ viewport height <420px:

- Minimap 96×96
- HP width 180px
- แสดง 3 skill slots + expand
- Secondary menu รวมใน radial menu
- EXP bar ซ่อนจาก HUD แต่ดูได้ใน Character
- Damage numbers default Compact

## 9.3 Touch Rules

- Touch target >=48×48
- Visual icon อาจเล็ก 32px แต่ hitbox 48px
- Joystick deadzone configurable
- Skill drag aiming ต้องมี cancel zone
- Long press 350–450ms
- Haptic เป็น optional setting
- ไม่วางปุ่มชิดขอบน้อยกว่า safe-area + 8px

---

# 10. Inventory & Equipment

## 10.1 PENDING OWNER Decisions

- Capacity
- Equipment slots
- Stack limits
- Item overflow behavior
- Loot recovery
- Sort rules
- Split stack availability
- Favorite/lock behavior

Proposed baseline:

```txt
capacity: 40
desktopGrid: 8×5
mobileGrid: 5 columns
equipmentSlots:
  - weapon
  - armor
  - boots
  - accessory1
  - accessory2
stack:
  potion: 99
  material: 999
  upgradeMaterial: 999
  equipment: 1
```

## 10.2 Desktop Layout

```txt
┌──────────────────────────────────────────────────────────────┐
│ กระเป๋า                                              [X]     │
├──────────────────────────┬───────────────────────────────────┤
│ CHARACTER / EQUIPMENT    │ BAG                               │
│                          │ [ ][ ][ ][ ][ ][ ][ ][ ]          │
│        [portrait]        │ [ ][ ][ ][ ][ ][ ][ ][ ]          │
│                          │ [ ][ ][ ][ ][ ][ ][ ][ ]          │
│ [weapon] [armor]         │ [ ][ ][ ][ ][ ][ ][ ][ ]          │
│ [boots] [acc1] [acc2]    │ [ ][ ][ ][ ][ ][ ][ ][ ]          │
│                          │                                   │
│ Stats summary            │ [Sort] [Filter]      31/40        │
├──────────────────────────┴───────────────────────────────────┤
│ Gold: 1,240                         [Close]                   │
└──────────────────────────────────────────────────────────────┘
```

- Width: 1040px
- Equipment: 360px
- Bag: flexible
- Height max: 720px

## 10.3 Mobile

Fullscreen panel with tabs:

```txt
[กระเป๋า] [สวมใส่] [ค่าสถานะ]
```

- Grid 5 columns
- Slot 52×52, gap 6px
- Bottom action bar fixed
- Item detail opens bottom sheet
- Equipment visual ไม่วางทับ character จนแตะยาก

## 10.4 Interactions

Desktop:

- Single click: select
- Double click: use/equip
- Right click: context menu
- Drag: move/equip
- Shift click: split stack
- Ctrl click: compare/favorite ตาม final mapping

Mobile:

- Tap: select
- Double tap: use/equip
- Long press: context menu
- Drag threshold 10px
- Scroll ต้องชนะ drag จน long-press หรือเริ่มจาก handle

## 10.5 Empty State

- Empty slot ไม่ต้องมีข้อความซ้ำ
- กระเป๋าว่างทั้งหมด: illustration เล็ก + `ยังไม่มีของ ลองออกไปสำรวจดู`
- ห้าม popup แนะนำร้านทันที

## 10.6 Full State

- Capacity counter เปลี่ยนเป็น Fire Light ที่ 90%
- Full: Danger Red + bag icon
- Loot ไม่หายเงียบ
- Toast: `กระเป๋าเต็ม — เคลียร์ช่องเพื่อเก็บของ`
- Item บนพื้นมี timer/ownership ตาม economy spec
- หากไม่มี recovery system ต้องแจ้ง timeout ชัด

## 10.7 Item Detail

Sections:

1. Icon + Name + Rarity
2. Type / Level Requirement
3. Main Stats
4. Secondary Stats
5. Compare Change
6. Description / Lore
7. Source hint
8. Actions

Stat comparison:

- เพิ่ม: `+12` pale moss + up arrow
- ลด: `-4` danger red + down arrow
- เท่าเดิม: muted
- ห้ามใช้สีอย่างเดียว

---

# 11. NPC Shop

## 11.1 Desktop Layout

```txt
┌──────────────────────────────────────────────────────────────┐
│ ร้านของลุง...                                      [X]      │
├────────────────────────────┬─────────────────────────────────┤
│ SHOP                       │ YOUR BAG                        │
│ [Consumable][Equipment]    │ [ ][ ][ ][ ][ ][ ][ ][ ]       │
│                            │                                 │
│ item list / grid           │                                 │
│                            │                                 │
├────────────────────────────┴─────────────────────────────────┤
│ Gold 1,240        Qty [-] 1 [+]        [Buy / Sell]          │
└──────────────────────────────────────────────────────────────┘
```

- Width: 1120px
- Shop: 48%
- Inventory: 52%
- Tab Buy / Sell
- Buyback FUTURE

## 11.2 Item Row

- Icon 48×48
- Name
- Price
- Stock if limited
- Requirement
- Affordability state
- Selected border teal
- Cannot afford: muted + gold shortfall text

## 11.3 Buy Flow

1. Select item
2. Detail shown
3. Quantity stepper
4. Total price live update
5. Buy button
6. Confirm only when:
   - quantity high
   - consumes > configurable % of gold
   - rare/special
7. Transaction loading
8. Success toast + inventory highlight

## 11.4 Sell Flow

- Common material: direct sell optional
- Equipment: confirm if equipped/favorite/new
- Rare+: always confirm
- Quest/Lore: disabled with reason
- Sell price displayed before action

## 11.5 Mobile

- Fullscreen
- Tabs: Buy / Sell
- Item list top
- Detail bottom sheet
- Gold sticky header
- Buy CTA sticky bottom

---

# 12. Upgrade / “แกร่ง”

## 12.1 Screen Layout Desktop

```txt
┌──────────────────────────────────────────────────────────────┐
│ เสริมแกร่ง                                            [X]   │
├───────────────────────┬──────────────────────────────────────┤
│ SELECT ITEM           │ UPGRADE PREVIEW                      │
│ [eligible item list]  │ [Item icon] Sword +3                 │
│                       │                                      │
│                       │ ATK 24 → 28                           │
│                       │ Success 70%                           │
│                       │ Fail: ไม่เปลี่ยน / ร้าว               │
│                       │ Cost: 1,200 Gold + 3 แกร่ง           │
│                       │                                      │
│                       │ [เสริมแกร่ง]                         │
└───────────────────────┴──────────────────────────────────────┘
```

## 12.2 Visual Semantics

- Current item frame ตาม rarity
- Preview arrow teal
- Success probability text explicit
- Risk warning Fire Light
- Crack risk Danger Red + crack icon
- Guaranteed ไม่ใช้ Gold CTA; ใช้ teal + `สำเร็จแน่นอน`
- Server result เป็น truth

## 12.3 Probability Display

`PROPOSED BASELINE: SHOW EXACT PERCENT`

เหตุผล:

- Failure อ่านออก
- ลดความรู้สึกระบบโกง
- รองรับการตัดสินใจ
- telemetry เปรียบเทียบ perceived fairness ได้

หาก Owner เลือกไม่โชว์ exact ต้องใช้ bucket ที่นิยามชัด เช่น สูง/กลาง/ต่ำ และบันทึก decision

## 12.4 Two-Step Confirmation

ขั้น 1: Screen preview  
ขั้น 2: Confirm modal เมื่อมีความเสี่ยง

Modal แสดง:

- Item
- ระดับปัจจุบัน → เป้าหมาย
- Success %
- ผลล้มเหลว
- Cost
- `ฉันเข้าใจว่าไอเทมอาจร้าว` checkbox เฉพาะ high-risk

## 12.5 Result States

### Success

- Teal ring pulse
- Stat delta count-up 240ms
- Success sound
- ไม่ใช้ full-screen flash

### Fail — No Change

- Warm orange pulse
- Text: `ยังไม่สำเร็จ`
- แสดงสิ่งที่เสีย
- เสนอ Retry แต่ไม่ auto-select purchase

### Cracked

- Crack overlay บน icon
- Danger border
- Label `ร้าว`
- Tooltip ผลกระทบ
- Next action options: repair / stop / details ตาม spec

### Network Unknown

- ห้ามเดาผล
- Modal `กำลังตรวจสอบผลกับเซิร์ฟเวอร์`
- Retry transaction status
- ปิด modalไม่ได้จนรู้ final state หรือมี safe recovery

---

# 13. Death / Respawn

## 13.1 Overlay

- World remains visible
- Desaturate 35–45%
- Deep Ink overlay 52%
- Center panel width 460px
- No item loss in initial PvE baseline

```txt
คุณล้มลงแล้ว

สาเหตุ: ถูก หมูป่าพอง กระแทก
ความเสียหายสุดท้าย: 42

[เกิดที่ค่ายปลอดภัย]
[ดูสรุปการต่อสู้]
```

## 13.2 Countdown

- 2–3 seconds before primary CTA active proposed
- Prevent accidental tap
- Not punitive long timer
- Progress ring around button optional

## 13.3 Combat Summary

Compact:

- Last 5 damage events
- Damage source
- Avoidable cue hint if known
- No blame language
- Help link contextual

## 13.4 Reconnect

Reconnect must not bypass death. On reconnect:

- Re-enter death overlay
- Fetch authoritative state
- Same respawn choice

---

# 14. Settings

## 14.1 Desktop Layout

- Panel 760×640 max
- Left navigation 200px
- Content right
- Apply immediately for reversible settings
- Reset section button

Categories:

1. Graphics
2. Audio
3. Gameplay
4. Controls
5. Accessibility
6. Account

## 14.2 Graphics

| Setting | Control | Default Proposed |
|---|---|---|
| Effect Quality | Segmented Low/Medium/High | Medium |
| Damage Numbers | Full/Compact/Crit Only/Off | Compact mobile, Full desktop |
| Screen Shake | Slider / Off | 60% |
| Hit Flash | On/Reduced/Off | On |
| Weather Opacity | Slider | 100% |
| UI Scale | 80–120% | 100% |

Boss danger cue ห้ามปิดทั้งหมด

## 14.3 Audio

- Master
- Music
- SFX
- UI
- Ambient

Slider 0–100, step 5  
Mute icon per row

## 14.4 Gameplay

- Target Assist
- Auto Pickup
- Help Suggestions
- Companion Toggle
- Damage Number Mode
- Auto-face target
- Hold/Toggle options

## 14.5 Accessibility

- Text size
- High contrast
- Reduce motion
- Reduce flash
- Reduce shake
- Color support preset
- Weather opacity
- Combat outline strength

## 14.6 Mobile

- Fullscreen page
- Accordion sections
- Sticky Back
- Controls height 48px
- Slider track 8px, thumb 28px

---

# 15. Loading / Empty / Error Pattern

ทุก screen ต้องระบุครบ:

## Loading

- Skeleton สำหรับ list/grid
- Spinner สำหรับ transaction
- ห้าม skeleton item rarity ปลอม
- Loading >2s แสดงข้อความสถานะ
- Loading >8s แสดง Retry/Cancel เมื่อปลอดภัย

## Empty

ต้องตอบ 3 คำถาม:

1. ตอนนี้ไม่มีอะไร
2. ทำไมถึงไม่มี
3. ทำอะไรต่อได้

## Error

ต้องมี:

- Human-readable title
- สาเหตุโดยย่อ
- Recovery action
- Error code แบบ copy ได้ใน Details
- ไม่แสดง stack trace

## Transaction Unknown

ใช้กับ Buy/Sell/Upgrade/Create:

- ไม่สรุป success/fail เอง
- Query authoritative state
- Disable duplicate submit
- เก็บ idempotency key

---

# 16. Accessibility Requirements

`LOCKED + PROPOSED IMPLEMENTATION`

1. Color never sole indicator
2. Focus visible 3px
3. Keyboard navigation logical
4. Escape closes non-critical modal
5. Screen reader labels สำหรับ control สำคัญ
6. Reduced Motion
7. Reduced Flash
8. Reduced Shake
9. Text contrast practical AA-like
10. Touch targets >=44px
11. Tooltip content accessible ผ่าน keyboard/tap
12. Damage Number Off ต้องยังมี hit feedback ทางอื่น
13. Boss telegraph มี shape + border + motion
14. Dangerous action มี explicit text

---

# 17. Sound UI Language

`PROPOSED BASELINE`

| Event | Character |
|---|---|
| Hover | soft wood tick |
| Select | short teal chime |
| Confirm | warm seal stamp |
| Error | short muted knock |
| Warning | low double tap |
| Item Common | soft cloth/wood |
| Rare | distinct light chime |
| Legendary | signature authored sting |
| Upgrade Success | rising seal resonance |
| Upgrade Fail | dull release, not humiliating |
| Cracked | controlled fracture cue |

เสียง UI:

- ยาวไม่เกิน 500ms ทั่วไป
- หลีกเลี่ยงเสียงแหลมซ้ำ
- Respect UI volume
- Legendary sound ห้าม reuse กับ CTA ทั่วไป

---

# 18. Icon Language

`PROPOSED BASELINE`

- Source 64×64
- Display 24/32/48
- Crisp edges
- 2–3 tone silhouette
- Stroke ไม่หนาเท่ากันทุก icon
- Action icon ใช้ shape ก่อน detail
- Destructive ใช้ red + trash/break symbol
- Locked ใช้ lock shape
- Favorite ใช้ knot/star motif แต่ไม่ใช้ Legendary Gold เต็ม
- Help ใช้ `?` + companion identity
- Currency icon ต้องแยกชัด

ห้าม:

- emoji เป็น production icon
- mixing outline icon กับ glossy icon
- icon ที่อ่านได้เฉพาะสี

---

# 19. Telemetry Events

ขั้นต่ำ:

```txt
ui_screen_open
ui_screen_close
ui_action_click
ui_action_blocked
ui_validation_error
ui_transaction_start
ui_transaction_success
ui_transaction_fail
ui_transaction_unknown
inventory_full
inventory_item_equip
inventory_item_use
shop_buy
shop_sell
upgrade_attempt
upgrade_result
settings_changed
death_overlay_open
respawn_selected
help_opened
```

Fields:

- screen
- device class
- input mode
- viewport
- session id
- action id
- item id/type/tier เมื่อเกี่ยวข้อง
- error category
- latency bucket
- config version
- UI spec version

ห้ามส่งข้อความชื่อผู้เล่นหรือข้อมูลส่วนตัวโดยไม่จำเป็น

---

# 20. Acceptance Criteria by Screen

## Login

- Desktop 1280×720 ไม่ตัด
- Mobile 640×360 ใช้งานได้
- Server error recovery ชัด
- Guest risk อ่านได้โดยไม่ block first play
- Keyboard complete flow

## Character Creation

- Class อ่านออกจาก weapon/stance
- Validation local + server
- Loading ป้องกัน submit ซ้ำ
- Mobile keyboard ไม่บัง CTA
- Locked class ไม่สับสนว่าเลือกได้

## HUD

- Player, target, danger อ่านได้ใน 1 วินาที
- Center combat area ไม่ถูก UI ปิด
- Cooldown อ่านได้
- Low HP ไม่ใช้สีอย่างเดียว
- Mobile thumb reach test ผ่าน

## Inventory

- 40 slots baseline แสดงครบ
- Full state ชัด
- Equip/use ไม่สับสน
- Rare sell confirmation
- Compare stat อ่านง่าย
- Touch scroll/drag ไม่ชนกัน

## Shop

- Buy/Sell mode แยกชัด
- Gold before/after อ่านได้
- Cannot afford มีเหตุผล
- Transaction duplicate safe
- Rare sale recovery/confirm

## Upgrade

- Success rate และ consequence อ่านก่อน confirm
- Crack state มี icon + label
- Unknown transaction ไม่เดาผล
- Reduced motion ยังสื่อ result ได้
- Gold ไม่ถูกใช้เป็น generic CTA

## Death

- Cause visible
- No item-loss messaging ambiguous
- Respawn CTA reachable
- Reconnect preserves death
- Summary optional, not blocking

## Settings

- Every setting has current value
- Reset supported
- Critical cues cannot be fully disabled
- Mobile layout readable
- Changes persistตาม account/device policy

---

# 21. Owner Decision Checklist

ต้องเคาะก่อน implementation เต็ม:

## Account / Character

- [ ] ตัวละครต่อบัญชี
- [ ] กติกาชื่อ
- [ ] ลบตัวละคร
- [ ] เปลี่ยนชื่อ
- [ ] Class เปิดใน P2

## Inventory

- [ ] Capacity
- [ ] Equipment slots
- [ ] Stack limit
- [ ] Overflow / loot timeout
- [ ] Favorite / lock
- [ ] Sort behavior

## Upgrade

- [ ] แสดง exact %
- [ ] Fail outcomes
- [ ] Crack effects
- [ ] Repair path
- [ ] Two-step threshold
- [ ] แหล่งได้มาของแกร่ง

## HUD

- [ ] Skill slot count
- [ ] Minimap scope
- [ ] HP numeric display default
- [ ] Mobile compact default
- [ ] Help button placement

## Settings

- [ ] Default quality
- [ ] Damage number defaults
- [ ] Target assist defaults
- [ ] Account vs device persistence

---

# 22. Implementation Token Example

```css
:root {
  --dp-deep-ink: #171820;
  --dp-warm-ink: #2B2230;
  --dp-deep-brown: #4A332E;
  --dp-soil-brown: #68483A;
  --dp-clay: #8E6046;
  --dp-warm-wood: #B47E52;
  --dp-sand: #D8AE70;
  --dp-parchment: #F2D6A0;
  --dp-highlight: #FFF0C5;

  --dp-resonance-dark: #167C78;
  --dp-resonance-teal: #35C6B0;
  --dp-resonance-light: #7CE9D0;

  --dp-danger-red: #D84848;
  --dp-fire-deep: #9E3C32;
  --dp-fire: #DD6840;
  --dp-fire-light: #F4B852;

  --dp-corruption-deep: #6E315F;
  --dp-corruption: #A84683;
  --dp-corruption-light: #DA73B0;

  --dp-moon-deep: #4B568E;
  --dp-moon-blue: #7786C8;
  --dp-moon-light: #B0B9EC;

  --dp-legendary-gold: #E8BF4F;

  --dp-space-1: 4px;
  --dp-space-2: 8px;
  --dp-space-3: 12px;
  --dp-space-4: 16px;
  --dp-space-6: 24px;
  --dp-space-8: 32px;

  --dp-radius-sm: 4px;
  --dp-radius-md: 8px;
  --dp-radius-lg: 12px;

  --dp-motion-fast: 100ms;
  --dp-motion-normal: 160ms;
  --dp-motion-slow: 240ms;

  --dp-ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

---

# 23. Definition of Done

UI feature ถือว่าเสร็จเมื่อ:

- [ ] ใช้ token ไม่มี hardcoded semantic color กระจาย
- [ ] Desktop และ Mobile ผ่าน layout acceptance
- [ ] Loading / Empty / Error / Disabled ครบ
- [ ] Keyboard และ Touch ใช้ได้
- [ ] Focus state ชัด
- [ ] Color ไม่ใช่ indicator เดี่ยว
- [ ] Reduced Motion / Flash / Shake ทำงาน
- [ ] Transaction ป้องกัน duplicate
- [ ] Telemetry event ครบ
- [ ] Screenshot ผ่าน Visual Review Questions
- [ ] ไม่มี UI บดบัง combat telegraph
- [ ] Owner decision ที่เกี่ยวข้องถูกเคาะ
- [ ] Spec และ config version ถูกอ้างใน implementation
- [ ] QA ทดสอบที่ 1280×720 และ mobile landscape 720p
- [ ] UI ยังอ่านได้เมื่อ text ภาษาไทยยาวกว่าค่าเฉลี่ย 30%

---

# 24. Non-Goals ของเอกสารฉบับนี้

- ไม่กำหนด Final Illustration หรือ Final Pixel Art รายชิ้น
- ไม่กำหนด Item/Drop/Economy balance
- ไม่แทน Combat Bible
- ไม่กำหนด Companion final silhouette
- ไม่กำหนด Boss Map 1 kit
- ไม่เปิดระบบ FUTURE เช่น Auction, Mailbox, Guild UI, PvP UI
- ไม่อนุญาตให้ข้าม Owner decision ที่ระบุ `PENDING OWNER`

---

# 25. Recommended Next Documents

1. `deungpu_MAP_1_ITEM_DROP_ECONOMY_SPEC_v1.md`
2. `deungpu_UI_COMPONENT_STATE_CATALOG_v1.md`
3. `deungpu_TUTORIAL_AND_HELP_CONTENT_PACK_v1.md`
4. `deungpu_COMPANION_VISUAL_CONCEPT_BRIEF_v1.md`
5. `deungpu_MAP_1_BOSS_DESIGN_SPEC_v1.md`

เอกสาร Component State Catalog สามารถแยกจากเล่มนี้เมื่อจำนวน component มากขึ้น แต่ P2 สามารถเริ่มจากรายละเอียดในเล่มนี้ได้ทันทีหลัง Owner เคาะรายการใน §21
