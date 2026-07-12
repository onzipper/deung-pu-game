# ดึ๋งปุ๊ — P2 Map 1 Economy & Loot Specification

> **ไฟล์:** `deungpu_P2_MAP_1_ECONOMY_AND_LOOT_SPEC_v1.md`  
> **Revision:** `v1.0 — Default Config Baseline / No-Figma Implementation`  
> **สถานะ:** `OWNER BASELINE — READY FOR WAVE 2 IMPLEMENTATION`  
> **วันที่:** 2026-07-12  
> **ขอบเขต:** P2 Map 1 Item, Loot, Gold, EXP, Starter Shop, แกร่ง, Enhancement Economy, Loot Presentation, Config Contract, Telemetry และ QA  
> **วัตถุประสงค์:** ปิดช่องว่างสุดท้ายของ P2 ด้วยค่าเริ่มต้นที่นำไป Implement ได้ทันที โดยทุกตัวเลขแก้ไขภายหลังผ่านไฟล์ Config ได้ แต่ **ยังไม่สร้าง Admin UI, Remote Config, Live Rate, Event Multiplier หรือระบบปรับ Rate ระหว่าง Runtime**

---

# 0. Executive Decisions

## 0.1 สิ่งที่ล็อกในเอกสารนี้

1. P2 ใช้ Level 1–10 สำหรับ Map 1
2. Item Categories, Rarity และ Bind semantics
3. Equipment 5 ช่องตาม Decision ล่าสุด
4. Item Master เริ่มต้นของ Map 1
5. Monster EXP, Gold และ Drop Tables
6. Starter Shop และราคาซื้อ/ขาย
7. EXP Curve Level 1–10
8. แหล่งและ Sink ของ `แกร่ง`
9. Enhancement +0 ถึง +5
10. Loot Ownership, Auto Loot และ Ground Timeout
11. Default Rate Config
12. No-Figma Screen Contracts
13. Telemetry, Validation และ Acceptance Criteria

## 0.2 สิ่งที่ตั้งใจไม่ทำใน P2

- Admin Economy Dashboard
- ปรับ Rate ผ่านหน้าเว็บ
- Remote Config
- Scheduled Event Rate
- Hot Reload Economy
- Dynamic Pricing
- Player-to-Player Trade
- Market
- Crafting
- Salvage/Dismantle
- Mail/Lost Loot Recovery
- Loot Box
- Daily Reward Economy
- Premium Currency
- Paid Enhancement Protection
- Pity สำหรับ Normal Drop
- Equipment durability ทั่วไป
- Weight system
- Item identification
- Random affix
- Procedural stat roll

## 0.3 Rate adjustment philosophy

ตัวเลขทั้งหมดในเอกสารนี้เป็น **Default Config Baseline**

การปรับใน P2 ทำผ่าน:

```txt
แก้ไฟล์ Config
→ Review Diff
→ เพิ่ม economyVersion
→ Deploy / Restart Server
→ ตรวจ Telemetry
```

ยังไม่มี:

```txt
Admin UI
Remote Toggle
Live Rate
Per-player Rate
Timed Multiplier
```

---

# 1. Source of Truth และ Conflict Resolution

อ่านร่วมกับ:

- `deungpu_OWNER_PRODUCTION_DECISIONS_P2B_TO_LAUNCH_v1.md`
- `deungpu_OWNER_DECISION_RESPONSE_P2_UI_ECONOMY_v1.md`
- `deungpu_ACCOUNT_CHARACTER_STORAGE_FLOW_SPEC_v1.md`
- `deungpu_TECH_TEAM_DECISIONS_SVG_FIRST_NO_FIGMA_v1.md`
- `deungpu_P2_UI_VISUAL_IMPLEMENTATION_SPEC_v1.md`
- Combat Bible / Technical Architecture

## 1.1 Equipment Slot Supersede

Decision ล่าสุดกำหนด:

```yaml
equipmentSlots:
  - weapon
  - head
  - body
  - accessory
  - talisman
```

ชุดนี้ **Supersede** ชุดเก่าที่เคยระบุ:

```yaml
- weapon
- armor
- boots
- accessory1
- accessory2
```

ระบบใหม่ห้ามสร้าง Drop Table หรือ Item Definition สำหรับช่อง `boots`, `accessory1`, `accessory2` ใน P2

## 1.2 Other inherited decisions

```yaml
inventory:
  capacity: 40

stack:
  equipment: 1
  consumable: 99
  skillBook: 99
  material: 999
  upgradeMaterial: 999
  eventItem: 999

currency:
  goldOwnership: character
  kraengOwnership: account-bound-item
  kraengStorage: allowed

rarity:
  common: Muted Sand
  uncommon: Fresh Leaf
  rare: Moon Blue
  epic: Moon Deep
  legendary: Legendary Gold
```

P2 Map 1 ใช้จริงเฉพาะ:

- Common
- Uncommon
- Rare

Epic และ Legendary ไม่อยู่ใน Normal Map 1 Drop Table

---

# 2. Config-First Architecture

## 2.1 Config files

ชื่อไฟล์แนะนำ:

```txt
config/economy/p2-map1/
├── economy-meta.yaml
├── rate-multipliers.yaml
├── item-definitions.yaml
├── equipment-stats.yaml
├── monster-rewards.yaml
├── drop-tables.yaml
├── exp-curve.yaml
├── starter-shop.yaml
├── enhancement.yaml
├── quest-rewards.yaml
└── loot-presentation.yaml
```

JSON ใช้แทน YAML ได้ หาก Tech Stack ต้องการ

## 2.2 Economy version

```yaml
economyVersion: p2-map1-v1
effectiveFrom: 2026-07-12
runtimeReload: false
requiresServerRestart: true
```

ทุก Transaction ที่เกี่ยวกับ:

- Drop
- Shop
- Enhancement
- Reward
- EXP
- Gold

ต้อง Log `economyVersion`

## 2.3 Global default multipliers

```yaml
multipliers:
  exp: 1.0
  goldDrop: 1.0
  itemDrop: 1.0
  equipmentDrop: 1.0
  consumableDrop: 1.0
  materialDrop: 1.0
  kraengDrop: 1.0
  questExp: 1.0
  questGold: 1.0
  vendorBuyPrice: 1.0
  vendorSellPrice: 1.0
  enhancementGoldCost: 1.0
  enhancementMaterialCost: 1.0
```

กติกา:

- P2 ใช้ `1.0` ทุกค่า
- ยังไม่มี UI แก้ค่า
- ยังไม่มีเวลาหรือเงื่อนไขเปิด multiplier
- `enhancement success chance` ไม่ใช้ Global Multiplier
- Success Chance แก้ที่ตาราง Enhancement รายระดับเท่านั้น
- Final value ต้อง clamp ตาม schema

## 2.4 Rate application order

```txt
Base Definition
→ Category Multiplier
→ Global Multiplier
→ Integer Rounding
→ Clamp
→ Authoritative Result
```

Probability:

```txt
Base Drop %
× Item Category Multiplier
× Global Item Drop Multiplier
→ Clamp 0–100%
```

Gold/EXP:

```txt
Base Value
× Relevant Multiplier
→ round down
→ minimum 1 เมื่อ reward เดิม > 0
```

---

# 3. Economy Goals

## 3.1 P2 player loop

```txt
ออกล่า
→ ได้ EXP / Gold / Item
→ ใช้ Potion / จัดกระเป๋า
→ ขายของ
→ ได้แกร่ง
→ ตีบวก
→ แข็งแกร่งขึ้น
→ ออกล่าพื้นที่ยากขึ้น
```

## 3.2 Target bands inherited from approved documents

| Metric | P2 Target |
|---|---:|
| First Enhancement | 20–40 นาที |
| Inventory Pressure / 90% Capacity | 20–45 นาทีสำหรับ Efficient Farm |
| Level 1 → 10 Casual | 170–240 นาที |
| Level 1 → 10 Efficient | 120–170 นาที |
| Rare Equipment Before Boss | 0–1 ชิ้นต่อ 30 นาที |
| Potion Meaningful | ต้องใช้ แต่ไม่กิน Gold Income ส่วนใหญ่ |
| Gold Starvation | ต้องไม่เกิดใน First Session |
| Kraeng Income after One-time Rewards | 2–4 ชิ้นต่อชั่วโมงโดยเฉลี่ย |
| Common Equipment | เป็น Vendor Loot ที่ยังมีความหมาย |
| Item Loss from Full Inventory | 0 silent loss |

ค่าพวกนี้เป็น **Validation Bands** ไม่ใช่ Guaranteed Reward

---

# 4. Item Taxonomy

## 4.1 Types

```yaml
itemTypes:
  - EQUIPMENT
  - CONSUMABLE
  - MATERIAL
  - UPGRADE_MATERIAL
  - QUEST
  - EVENT
  - COSMETIC_TOKEN
```

P2 ใช้:

- EQUIPMENT
- CONSUMABLE
- MATERIAL
- UPGRADE_MATERIAL
- QUEST

## 4.2 Equipment subtypes

```yaml
equipmentSubtypes:
  - WEAPON
  - HEAD
  - BODY
  - ACCESSORY
  - TALISMAN
```

## 4.3 Bind rules

```yaml
bindRules:
  - UNBOUND
  - ACCOUNT_BOUND
  - CHARACTER_BOUND
```

P2 defaults:

| Category | Bind |
|---|---|
| Normal Equipment | UNBOUND |
| Materials | UNBOUND |
| Potion | UNBOUND |
| แกร่ง | ACCOUNT_BOUND |
| Quest Item | CHARACTER_BOUND |
| Boss Material P2B | ACCOUNT_BOUND |

แม้ Item จะ `UNBOUND` แต่ P2 ยังไม่มี Player Trade

## 4.4 Trade rules

```yaml
tradeRules:
  - NONE
  - MARKET_FUTURE
  - DIRECT_FUTURE
```

P2 ทุก Item ใช้ `NONE`

## 4.5 Storage rules

| Category | Personal Storage |
|---|---|
| Equipment ที่ถอดแล้ว | Allowed |
| Consumable | Allowed |
| Material | Allowed |
| แกร่ง | Allowed |
| Quest Item | Blocked |
| Equipped Item | Blocked |
| Transaction-locked Item | Blocked |

---

# 5. Rarity Rules

## 5.1 Semantic mapping

| Rarity | Semantic Token | Presentation |
|---|---|---|
| Common | `rarity.common` → Muted Sand | No glow / no particle |
| Uncommon | `rarity.uncommon` → Fresh Leaf | Stronger border |
| Rare | `rarity.rare` → Moon Blue | Border motif + pickup sting |
| Epic | `rarity.epic` → Moon Deep | Not dropped in P2 |
| Legendary | `rarity.legendary` → Legendary Gold | Not dropped in P2 |

## 5.2 Stat budget

| Rarity | Budget Multiplier |
|---|---:|
| Common | 1.00 |
| Uncommon | 1.20 |
| Rare | 1.45 |

ใช้เป็น Design Validation ไม่จำเป็นต้องคำนวณ Runtime

## 5.3 P2 rules

- Common หาได้บ่อย
- Uncommon เริ่มจาก Boar/Elite
- Rare มาจาก Elite และ Boss เป็นหลัก
- Normal Monster ไม่มี Epic/Legendary
- Common ต้องไม่ดูเหมือน Disabled
- Rarity ไม่พึ่งสีอย่างเดียว
- ทุก Item Card มีชื่อ Rarity และ Border Motif

---

# 6. Equipment Stat Model

## 6.1 Player-facing stats used by P2 equipment

```yaml
equipmentStats:
  - attack
  - defense
  - maxHp
  - criticalChancePercent
  - breakPower
  - moveSpeedPercent
```

## 6.2 Enhancement-scaled stats

Enhancement เพิ่มเฉพาะ:

- Attack
- Defense
- Max HP
- Break Power

ไม่เพิ่ม:

- Critical Chance
- Move Speed

## 6.3 Equipment instance

Equipment ทุกชิ้นมี Instance ID เพราะ:

- Enhancement level
- Cracked state
- Bind
- Audit
- Storage location
- Future market lock

```yaml
equipmentInstance:
  instanceId: uuid
  itemDefinitionId: string
  enhancementLevel: 0
  cracked: false
  bindType: UNBOUND
  ownerAccountId: string
  location: string
  version: integer
```

---

# 7. Map 1 Item Master

> ราคา `vendorBuy` ว่าง หมายถึง NPC ไม่ขาย  
> ราคา `vendorSell` เป็น Gold ที่ผู้เล่นได้รับ  
> P2 ไม่มี Random Stat Roll

## 7.1 Consumable and materials

| itemId | ชื่อ | Type | Rarity | Req. Lv | Stack | Bind | Buy | Sell | Effect / Notes |
|---|---|---|---|---:|---:|---|---:|---:|---|
| `con_small_potion` | ยาฟื้นกำลังขนาดเล็ก | CONSUMABLE | Common | 1 | 99 | UNBOUND | 18 | 4 | ฟื้น 35% Max HP, CD 12s |
| `mat_slime_gel` | เมือกดึ๋ง | MATERIAL | Common | 1 | 999 | UNBOUND | — | 2 | Vendor material |
| `mat_soft_feather` | ขนนุ่มจิกปุ๊ | MATERIAL | Common | 1 | 999 | UNBOUND | — | 3 | Vendor material |
| `mat_coarse_hide` | หนังหยาบพอง | MATERIAL | Common | 1 | 999 | UNBOUND | — | 5 | Vendor material |
| `mat_sharp_tusk` | เขี้ยวแข็ง | MATERIAL | Uncommon | 1 | 999 | UNBOUND | — | 8 | Elite/Boar material |
| `mat_resonance_dust` | ผงสะท้อน | MATERIAL | Uncommon | 1 | 999 | UNBOUND | — | 12 | Elite material |
| `upg_kraeng` | แกร่ง | UPGRADE_MATERIAL | Common | 1 | 999 | ACCOUNT_BOUND | — | — | ใช้ตีบวก, ฝากคลังได้ |
| `mat_boss_resonance_core` | แกนสะท้อนแห่งป่า | MATERIAL | Uncommon | 1 | 999 | ACCOUNT_BOUND | — | 20 | P2B Boss material |

## 7.2 Weapons

| itemId | ชื่อ | Rarity | Req. Lv | ATK | Crit | Break | Buy | Sell | Upgrade |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| `eq_weapon_training_blade` | ดาบฝึกหัด | Common | 1 | 8 | 0% | 0 | 120 | 24 | Yes |
| `eq_weapon_reed_edge` | ดาบคมกก | Common | 3 | 12 | 0% | 0 | — | 36 | Yes |
| `eq_weapon_boar_tusk_saber` | ดาบเขี้ยวพอง | Uncommon | 5 | 17 | 0% | 2 | — | 72 | Yes |
| `eq_weapon_resonant_edge` | ดาบคมสะท้อน | Rare | 8 | 24 | 2% | 3 | — | 180 | Yes |

## 7.3 Head

| itemId | ชื่อ | Rarity | Req. Lv | DEF | HP | Crit | Buy | Sell | Upgrade |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| `eq_head_cloth_band` | ผ้าคาดศีรษะเดินทาง | Common | 1 | 1 | 5 | 0% | 80 | 16 | Yes |
| `eq_head_leaf_wrap` | ผ้าคาดใบอ่อน | Common | 3 | 2 | 10 | 0% | — | 28 | Yes |
| `eq_head_boarhide_cap` | หมวกหนังพอง | Uncommon | 5 | 4 | 18 | 0% | — | 60 | Yes |
| `eq_head_moon_sand_circlet` | รัดเกล้าทรายจันทร์ | Rare | 8 | 5 | 30 | 1% | — | 150 | Yes |

## 7.4 Body

| itemId | ชื่อ | Rarity | Req. Lv | DEF | HP | Break | Buy | Sell | Upgrade |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| `eq_body_traveler_tunic` | เสื้อเดินทาง | Common | 1 | 3 | 10 | 0 | 140 | 28 | Yes |
| `eq_body_padded_field_coat` | เสื้อบุใยทุ่ง | Common | 3 | 5 | 18 | 0 | — | 42 | Yes |
| `eq_body_boarhide_vest` | เกราะหนังพอง | Uncommon | 5 | 8 | 30 | 0 | — | 84 | Yes |
| `eq_body_resonant_coat` | เสื้อคลุมสะท้อน | Rare | 8 | 11 | 45 | 2 | — | 210 | Yes |

## 7.5 Accessory

| itemId | ชื่อ | Rarity | Req. Lv | HP | Crit | Move | Buy | Sell | Unique Group |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| `eq_accessory_plain_cord` | เชือกผูกธรรมดา | Common | 1 | 5 | 0% | 0% | 90 | 18 | — |
| `eq_accessory_feather_knot` | ปมขนนุ่ม | Common | 2 | 8 | 0% | 1% | — | 30 | — |
| `eq_accessory_tough_tusk_ring` | วงเขี้ยวแข็ง | Uncommon | 5 | 12 | 2% | 0% | — | 72 | — |
| `eq_accessory_resonance_bead` | ลูกปัดสะท้อน | Rare | 8 | 12 | 2% | 0% | — | 180 | `resonance_bead` |

## 7.6 Talisman

| itemId | ชื่อ | Rarity | Req. Lv | ATK | HP | Break | Buy | Sell | Upgrade |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| `eq_talisman_blank` | เครื่องรางเปล่า | Common | 1 | 0 | 0 | 1 | 90 | 18 | Yes |
| `eq_talisman_sprout` | เครื่องรางหน่ออ่อน | Common | 3 | 0 | 10 | 1 | — | 30 | Yes |
| `eq_talisman_firmness` | เครื่องรางมั่นคง | Uncommon | 5 | 2 | 0 | 3 | — | 72 | Yes |
| `eq_talisman_moon_echo` | เครื่องรางเสียงจันทร์ | Rare | 8 | 4 | 0 | 5 | — | 180 | Yes |

## 7.7 Starter loadout

ตัวละครใหม่ได้รับและ Equip:

```yaml
starterLoadout:
  weapon: eq_weapon_training_blade
  head: eq_head_cloth_band
  body: eq_body_traveler_tunic
  accessory: eq_accessory_plain_cord
  talisman: eq_talisman_blank
  consumables:
    - itemId: con_small_potion
      quantity: 5
```

Starter Item:

- ขายได้
- ฝากคลังได้เมื่อถอด
- ไม่ Character-bound
- Alt Character ทุกตัวได้ Starter Set
- Starter Set ไม่มี Gold value ที่สูงพอใช้สร้าง Gold exploit
- หากพบการสร้าง Alt เพื่อขาย Starter Item ให้ปรับ Starter Sell เป็น `0` ผ่าน Config ก่อนเพิ่มระบบใหม่

---

# 8. Starter Shop

## 8.1 Shop scope

P2 Shop ขายเฉพาะ:

- Small Potion
- Starter fallback equipment

ไม่ขาย:

- แกร่ง
- Uncommon/Rare gear
- Best-in-map item
- Upgrade protection
- Boss material
- Return item
- Limited stock item

## 8.2 Catalog

| itemId | Buy Price | Stock | Unlock |
|---|---:|---|---|
| `con_small_potion` | 18 | Unlimited | Shop tutorial complete |
| `eq_weapon_training_blade` | 120 | Unlimited | Immediately |
| `eq_head_cloth_band` | 80 | Unlimited | Immediately |
| `eq_body_traveler_tunic` | 140 | Unlimited | Immediately |
| `eq_accessory_plain_cord` | 90 | Unlimited | Immediately |
| `eq_talisman_blank` | 90 | Unlimited | Immediately |

## 8.3 Shop rules

- ราคาคงที่
- ไม่มี Restock System
- ไม่มี Buyback ใน P2
- Sell price อ่านจาก Item Definition
- Quest Item / แกร่งขายไม่ได้
- Rare Equipment ต้อง Confirm ก่อนขาย
- Equipped/Favorite Item ต้องถอด/ปลด Lock ก่อนขาย
- Shop transaction เป็น Server-authoritative และ Idempotent

---

# 9. EXP Curve Level 1–10

## 9.1 Level cap

```yaml
p2LevelCap: 10
```

เมื่อ Level 10:

- EXP เพิ่มไม่ได้ใน P2
- UI แสดง `MAX สำหรับ P2`
- Reward EXP ยัง Log แต่ไม่สะสมเกิน Cap
- ห้ามแปลง EXP ส่วนเกินเป็น Gold หรือ Item

## 9.2 Curve

| Current Level | EXP to Next | Cumulative EXP | Target Casual Minutes | Matched-level Kills หลัง Quest Contribution |
|---:|---:|---:|---:|---:|
| 1 | 120 | 120 | 5–8 | 5–8 |
| 2 | 220 | 340 | 8–12 | 8–12 |
| 3 | 360 | 700 | 12–18 | 12–16 |
| 4 | 520 | 1,220 | 15–22 | 15–20 |
| 5 | 720 | 1,940 | 18–25 | 18–24 |
| 6 | 950 | 2,890 | 22–30 | 22–28 |
| 7 | 1,200 | 4,090 | 25–35 | 26–34 |
| 8 | 1,500 | 5,590 | 30–40 | 32–40 |
| 9 | 1,850 | 7,440 | 35–50 | 40–50 |
| 10 | — | 7,440 | MAX | — |

## 9.3 Level difference modifier

```yaml
expLevelModifier:
  monsterMinusPlayer:
    2_or_more: 1.20
    1: 1.10
    0: 1.00
    -1: 1.00
    -2: 0.85
    -3: 0.70
    -4: 0.50
    -5_or_less: 0.20
```

- High-level bonus cap 120%
- Low-level penalty ใช้กับ Monster EXP เท่านั้น
- Quest EXP ไม่ถูกลด
- Boss First Kill EXP ไม่ถูกลด

## 9.4 Party EXP

P2 default:

```yaml
partyExp:
  enabled: true
  poolMultiplierPerExtraMember: 0.20
  poolMultiplierCap: 1.60
  splitAmongEligibleMembers: true
```

Formula:

```txt
Party EXP Pool
= Base EXP × min(1 + 0.20 × (Eligible Members - 1), 1.60)

EXP per Member
= Party EXP Pool ÷ Eligible Members
```

ตัวอย่าง 2 คน:

```txt
Base 30
Pool 36
คนละ 18
```

ผู้เล่นแต่ละคนได้น้อยลงต่อ Kill แต่กลุ่มฆ่าเร็วขึ้น

---

# 10. Monster Reward Baseline

> Combat HP/ATK/DEF ให้ Combat Bible เป็น Source of Truth  
> ตารางนี้เป็นเจ้าของเฉพาะ Reward, Level, Respawn และ Loot

## 10.1 Reward summary

| monsterId | ชื่อ | Level | EXP | Gold | Respawn |
|---|---|---:|---:|---:|---:|
| `mon_map1_slime` | สไลม์เมือกดึ๋ง | 1 | 14 | 3–5 | 8s |
| `mon_map1_bird` | นกจิกปุ๊ | 2 | 20 | 5–8 | 10s |
| `mon_map1_boar` | หมูป่าพอง | 4 | 30 | 8–12 | 14s |
| `elite_map1_boar_rampage` | หมูป่าพองคลั่ง | 5 | 140 | 40–60 | 720s |
| `boss_map1_resonant_guardian` | ผู้พิทักษ์เสียงสะท้อน | 8 | 550 | 180–260 | Encounter / P2B |

## 10.2 Normal monster participation

ผู้เล่นได้ Reward เมื่อ:

```yaml
normalEligibility:
  minimumDamageContributionPercent: 15
  lastHitRequired: false
```

Party:

- ใช้ contribution รวมของ Party
- Party ต้องทำรวมอย่างน้อย 15%
- สมาชิกต้องอยู่ Reward Radius
- สมาชิกที่ไม่ได้อยู่ในฉากไม่ได้ Reward

Reward เป็น **Personal Reward**

- Gold/EXP ไม่แย่งกัน
- Item Roll แยกต่อผู้เล่น
- Last Hit ไม่มีสิทธิ์พิเศษ

## 10.3 Elite/Boss participation

```yaml
eliteBossEligibility:
  minimumDamageContributionPercent: 5
  mustBeInEncounterRadius: true
  lastHitRequired: false
```

Support contribution เพิ่มภายหลังเมื่อมี Support Class จริง  
P2 Primary Class ใช้ Damage Contribution ก่อน

---

# 11. Drop Tables

## 11.1 Drop roll semantics

Normal Monster ใช้ Independent Rolls:

1. Gold guaranteed
2. Main material roll
3. Secondary material roll
4. Potion roll
5. Equipment pool roll สูงสุดหนึ่งชิ้น
6. Kraeng roll

Elite/Boss ใช้ Guaranteed + Pool Rolls ตามตาราง

## 11.2 Slime

```yaml
dropTableId: drop_map1_slime_v1
monsterId: mon_map1_slime
```

| Roll | Item / Pool | Chance | Quantity |
|---|---|---:|---:|
| Material | `mat_slime_gel` | 70% | 1–2 |
| Potion | `con_small_potion` | 4% | 1 |
| Equipment Pool | Common Slime Gear | 18% | 1 |
| Kraeng | `upg_kraeng` | 0.15% | 1 |

Common Slime Gear weights เมื่อ Equipment Roll ผ่าน:

| Item | Weight |
|---|---:|
| `eq_weapon_training_blade` | 22 |
| `eq_head_cloth_band` | 22 |
| `eq_body_traveler_tunic` | 17 |
| `eq_accessory_plain_cord` | 19.5 |
| `eq_talisman_blank` | 19.5 |

## 11.3 Bird

```yaml
dropTableId: drop_map1_bird_v1
monsterId: mon_map1_bird
```

| Roll | Item / Pool | Chance | Quantity |
|---|---|---:|---:|
| Material | `mat_soft_feather` | 65% | 1–2 |
| Potion | `con_small_potion` | 5% | 1 |
| Equipment Pool | Common Bird Gear | 20% | 1 |
| Kraeng | `upg_kraeng` | 0.25% | 1 |

Common Bird Gear weights:

| Item | Weight |
|---|---:|
| `eq_weapon_reed_edge` | 20 |
| `eq_head_leaf_wrap` | 20 |
| `eq_body_padded_field_coat` | 20 |
| `eq_accessory_feather_knot` | 25 |
| `eq_talisman_sprout` | 15 |

## 11.4 Boar

```yaml
dropTableId: drop_map1_boar_v1
monsterId: mon_map1_boar
```

| Roll | Item / Pool | Chance | Quantity |
|---|---|---:|---:|
| Main Material | `mat_coarse_hide` | 70% | 1–2 |
| Secondary Material | `mat_sharp_tusk` | 25% | 1 |
| Potion | `con_small_potion` | 6% | 1 |
| Common Equipment Pool | Common Field Gear | 16% | 1 |
| Uncommon Equipment Pool | Boar Gear | 6% | 1 |
| Kraeng | `upg_kraeng` | 0.45% | 1 |

Common Field Gear weights:

| Item | Weight |
|---|---:|
| `eq_weapon_reed_edge` | 19 |
| `eq_head_leaf_wrap` | 19 |
| `eq_body_padded_field_coat` | 25 |
| `eq_accessory_feather_knot` | 18 |
| `eq_talisman_sprout` | 19 |

Uncommon Boar Gear weights:

| Item | Weight |
|---|---:|
| `eq_weapon_boar_tusk_saber` | 20 |
| `eq_head_boarhide_cap` | 20 |
| `eq_body_boarhide_vest` | 20 |
| `eq_accessory_tough_tusk_ring` | 20 |
| `eq_talisman_firmness` | 20 |

## 11.5 Elite Boar

```yaml
dropTableId: drop_map1_elite_boar_v1
monsterId: elite_map1_boar_rampage
```

Guaranteed per eligible player:

| Item | Quantity |
|---|---:|
| `mat_coarse_hide` | 2–4 |
| `mat_sharp_tusk` | 1–2 |
| `upg_kraeng` | 1 |

Additional rolls:

| Roll | Chance | Quantity |
|---|---:|---:|
| `mat_resonance_dust` | 75% | 1–2 |
| `con_small_potion` | 25% | 1–2 |
| Uncommon Equipment Pool | 60% | 1 |
| Rare Equipment Pool | 8% | 1 |

Rare Equipment weights:

| Item | Weight |
|---|---:|
| `eq_weapon_resonant_edge` | 20 |
| `eq_head_moon_sand_circlet` | 20 |
| `eq_body_resonant_coat` | 20 |
| `eq_accessory_resonance_bead` | 20 |
| `eq_talisman_moon_echo` | 20 |

Elite rules:

- ไม่มี Pity
- Personal Loot
- Respawn 12 นาที
- Spawn/credit ต้องไม่เป็น winner-takes-all
- หาก Camp output เกิน Kraeng target ให้ปรับ Respawn/Eligibility ก่อนเพิ่ม Daily Lock

## 11.6 Boss Map 1 — P2B reserved baseline

```yaml
dropTableId: drop_map1_boss_v1
monsterId: boss_map1_resonant_guardian
phase: P2B
```

Guaranteed:

| Item | Quantity |
|---|---:|
| `upg_kraeng` | 2 |
| `mat_boss_resonance_core` | 2–4 |
| Uncommon Equipment | 1 |

Additional:

| Roll | Chance | Quantity |
|---|---:|---:|
| Rare Equipment | 20% | 1 |
| Small Potion | 100% | 3–5 |

First Kill Bonus:

| Reward | Amount |
|---|---:|
| Gold | 200 |
| EXP | 300 |
| Kraeng | 1 |
| Achievement | First Map 1 Boss |
| Journal | Boss Entry |

Boss Reward Table เป็น Baseline P2B และปรับได้หลัง Boss Playtest

---

# 12. Loot Ownership and Ground Behavior

## 12.1 Personal loot

Item Drop เป็น Personal Loot:

- ผู้เล่นอื่นมองไม่เห็นหรือเก็บไม่ได้
- ไม่มี Need/Greed
- ไม่มี Round Robin
- ไม่มี Last Hit Ownership
- ไม่มี Drop Stealing

## 12.2 Gold

Gold ไม่สร้าง Ground Entity

```txt
Eligible Kill
→ Server Roll Gold
→ Add Character Gold
→ Floating Gold Feedback
```

หาก Gold Transaction fail:

- Retry Idempotently
- ไม่สร้าง Gold Item บนพื้น

## 12.3 Item ground timeout

```yaml
lootTimeoutSeconds:
  commonStackable: 60
  commonEquipment: 75
  uncommon: 90
  rare: 120
  kraeng: 120
  bossRewardChest: 180
```

ค่าเหล่านี้อยู่ใน Config แต่ P2 ไม่มีหน้าแก้ไข

## 12.4 Auto Loot default

```yaml
autoLoot:
  defaultEnabled: true
  categories:
    gold: automatic
    commonMaterial: automatic
    commonConsumable: automatic
    equipment: manual
    uncommonOrHigher: manual
    kraeng: manual
    quest: automatic
  pickupRadiusTiles: 1.25
```

เหตุผล:

- Material/Potion ไม่เพิ่ม click burden
- Equipment และ Kraeng ยังรู้สึกเป็น Reward
- Rare ไม่หายไปใน UI โดยผู้เล่นไม่เห็น

ผู้เล่นปิด Auto Loot ได้ใน Settings

## 12.5 Inventory full

เมื่อ Pickup ไม่สำเร็จ:

```txt
Server → INVENTORY_FULL
Item remains personal ground loot
Client highlights item
Toast appears
Timer continues
```

ข้อความ:

```txt
กระเป๋าเต็ม — เคลียร์ช่องเพื่อเก็บของ
```

Rules:

- ห้าม Item หายทันที
- ห้าม Silent Failure
- ห้ามส่ง Delivery Box อัตโนมัติ
- ไม่มี Lost Loot Mail ใน P2
- Rare/Kraeng มี Timeout 120 วินาที
- หากผู้เล่น Logout Item หายเมื่อ Ground Entity ถูก cleanup ตาม Timeout

---

# 13. Loot Presentation — No-Figma Screen Contract

## 13.1 Ground label

### Purpose

ทำให้ผู้เล่นอ่าน Item และ Rarity ได้โดยไม่บดบัง Combat

### Desktop layout

```txt
        [32px SVG Icon]
  ชื่อไอเทม
  Rare · กด E เพื่อเก็บ
```

### Mobile layout

```txt
[Icon] ชื่อไอเทม
       Rare
[ เก็บ ]
```

### Required data

- SVG icon
- display name
- rarity text
- quantity
- pickup action
- timeout warning เมื่อเหลือ <=10s
- blocked reason

### States

- Available
- Auto-looting
- Inventory Full
- Out of Range
- Expiring
- Picked Up
- Transaction Error

## 13.2 Pickup toast

```txt
[Icon] เมือกดึ๋ง ×2
```

- Duration 2.5s
- Stack similar pickups within 1s
- Rare/Kraeng ใช้ authored sound
- Common ไม่มี Glow
- Toast queue ไม่เกิน 3 visible
- Overflow รวมเป็น summary

## 13.3 Inventory-full label

```txt
[!] ดาบคมสะท้อน
กระเป๋าเต็ม · เหลือ 01:42
```

- Danger icon
- Rarity border ยังอยู่
- สีไม่ใช่ indicator เดี่ยว
- กด label เปิด Inventory ได้เมื่อ Safe
- กลาง Combat แสดงเฉพาะ Toast ไม่เปิด Inventory อัตโนมัติ

## 13.4 Accessibility

- Pickup ไม่พึ่งสี
- Keyboard `E`
- Mobile Touch Target 48px
- Screen reader announcement เฉพาะ Rare/Kraeng หรือเมื่อเปิด setting
- Reduce Motion ลด burst/float
- Item label ไม่ใช้ text เล็กกว่า 14px

---

# 14. Gold Economy

## 14.1 Sources

P2 Gold Sources:

1. Normal Monster
2. Elite
3. Quest/Milestone
4. Vendor Sell
5. Boss P2B

ไม่ใช้:

- Daily login
- Paid Gold
- Player Market
- Gold Exchange
- Advertisement reward

## 14.2 Sinks

P2 Gold Sinks:

1. Potion purchase
2. Starter fallback equipment
3. Enhancement
4. Cracked Item Repair

ไม่ใช้:

- Storage fee
- Teleport fee
- Tax
- Crafting
- Character creation fee

## 14.3 Target source/sink band

First 30-minute Casual Session:

| Metric | Target |
|---|---:|
| Gross Gold | 300–500 |
| Potion/Shop Spend | 40–120 |
| Enhancement Spend | 100–220 |
| Net Gold | 100–300 |

First 30-minute Efficient Session:

| Metric | Target |
|---|---:|
| Gross Gold | 500–800 |
| Potion/Shop Spend | 60–180 |
| Enhancement Spend | 100–420 |
| Net Gold | 150–450 |

Gold Sink ไม่ต้องเท่ากับ Source ใน P2 Early Game  
เป้าหมายคือผู้เล่นเข้าใจ Loop และไม่ Starve

## 14.4 Vendor sell philosophy

- Common Equipment เป็น Gold conversion หลัก
- Material มีราคาต่ำแต่แน่นอน
- Uncommon/Rare ขายได้ แต่ UI Confirm
- Kraeng ขายไม่ได้
- Quest Item ขายไม่ได้
- ไม่มี Dynamic Price

---

# 15. Kraeng Economy

## 15.1 Semantic

```txt
แกร่ง = Upgrade Material ที่ได้จาก Gameplay
```

- ไม่ใช่ Premium Currency
- ไม่ขายเงินจริง
- ไม่ขายด้วย Gold ใน P2
- ไม่ Trade
- Account-bound
- ฝาก Personal Storage ได้
- Stack 999
- Server-authoritative
- Audit ทุก Mutation

## 15.2 Source table

| Source | P2 Default |
|---|---|
| Tutorial enhancement introduction | 1 |
| First upgraded item achievement | 1 |
| First Elite milestone | 1 |
| Map 1 milestone | 1 |
| Normal Slime | 0.15% |
| Normal Bird | 0.25% |
| Normal Boar | 0.45% |
| Elite Boar | Guaranteed 1 |
| Boss P2B | Guaranteed 2 |
| Boss First Kill P2B | Bonus 1 |

## 15.3 No fragment decision

P2 ใช้ `แกร่ง` เป็นหน่วยเดียว

ไม่สร้าง:

- เศษแกร่ง
- การรวม Fragment
- Conversion UI
- Crafting recipe

เหตุผล:

- ลด Scope
- ลด Item/UX เพิ่มเติม
- ปรับ Drop Rate ได้ตรง
- Tech ไม่ต้องสร้างระบบรวมชิ้น

## 15.4 Target income

หลังใช้ One-time Rewards หมด:

| Profile | Expected Kraeng / Hour |
|---|---:|
| Casual | 2–3 |
| Efficient | 3–4 |
| Elite camping upper guardrail | ไม่เกิน 5 |

หากเกิน:

1. ปรับ Elite Respawn
2. ปรับ Eligibility
3. ปรับ Elite Kraeng เป็น chance
4. ปรับ Normal Kraeng Rate

ยังไม่เพิ่ม Daily Cap

---

# 16. Enhancement Economy

## 16.1 Scope

P2 Equipment Enhancement:

```yaml
minimumLevel: 0
maximumLevel: 5
destruction: false
downgrade: false
crackedState: true
```

ทุก Equipment 5 Slots ตีบวกได้ เว้นแต่ Item Definition ระบุ `upgradeEligible: false`

## 16.2 Enhancement table

| Current → Next | Success | Gold | Kraeng | Crack Chance เมื่อ Fail | Failure Result |
|---|---:|---:|---:|---:|---|
| +0 → +1 | 100% | 100 | 1 | 0% | ไม่มี Fail |
| +1 → +2 | 90% | 220 | 1 | 0% | ระดับเดิม |
| +2 → +3 | 80% | 420 | 2 | 10% | ระดับเดิม; อาจร้าว |
| +3 → +4 | 70% | 750 | 3 | 25% | ระดับเดิม; อาจร้าว |
| +4 → +5 | 65% | 1,200 | 4 | 50% | ระดับเดิม; อาจร้าว |

Interpretation:

```txt
Roll Success ก่อน
ถ้า Fail → Roll Crack Chance on Failure
```

ตัวอย่าง +4 → +5:

- Success 65%
- Fail 35%
- ใน Fail 50% ร้าว
- Overall Crack 17.5%

UI ต้องแสดง:

- Success 65%
- เมื่อล้มเหลวมีโอกาสร้าว 50%

## 16.3 Enhancement stat multiplier

| Enhancement | Multiplier |
|---:|---:|
| +0 | 1.00 |
| +1 | 1.05 |
| +2 | 1.11 |
| +3 | 1.18 |
| +4 | 1.26 |
| +5 | 1.35 |

Apply per eligible stat:

```txt
Enhanced Stat = floor(Base Stat × Multiplier)
```

ถ้า Base Stat > 0 แต่ผลเพิ่มยังเท่าเดิม:

```txt
ใช้ minimum increase +1 เมื่อข้าม Enhancement Level ที่ multiplier เพิ่ม
```

Critical Chance และ Move Speed ไม่ Scale

## 16.4 Cracked state

Cracked Item:

- ยัง Equip ได้
- Stat ไม่ลด
- ตีบวกต่อไม่ได้
- ต้อง Repair ที่ Blacksmith
- ฝากคลังได้
- ขายได้หลัง Confirm
- UI มี Icon + Text

Repair cost:

| Current Enhancement | Repair Gold |
|---:|---:|
| +0 / +1 | 100 |
| +2 | 170 |
| +3 | 300 |
| +4 | 480 |
| +5 | 600 |

Repair ไม่ใช้ Kraeng

## 16.5 Transaction

```txt
Preview
→ Show exact Server Chance
→ Confirm
→ Lock Item
→ Deduct Cost Atomically
→ Roll
→ Apply Result
→ Persist
→ Return Authoritative Result
```

- ใช้ `previewToken`
- Config Version ต้องตรง
- Retry Idempotently
- Network loss query Transaction
- ห้าม Roll ซ้ำ
- Log chance ที่แสดงและ chance ที่ใช้จริง

---

# 17. Enhancement UI — No-Figma Contract

อ้าง Layout หลักจาก Tech Decision และ UI Spec

## 17.1 Desktop

```txt
┌───────────────────────────────────────────────────────────────┐
│ ตีบวกอุปกรณ์                                           [?][X] │
├───────────────────┬────────────────────┬──────────────────────┤
│ อุปกรณ์           │ ผลลัพธ์            │ วัตถุดิบและค่าใช้จ่าย │
│ [Item Icon]       │ +2 → +3            │ แกร่ง       2 / 2   │
│ ชื่อไอเทม +2      │ ATK 13 → 14        │ Gold      420 / ... │
│ Rarity / Bind     │ สำเร็จ 80%         │                      │
│ สถานะ: ปกติ      │ Fail: ระดับเดิม    │                      │
│                   │ Crack on fail: 10% │                      │
├───────────────────┴────────────────────┴──────────────────────┤
│                         [ ยืนยันการตีบวก ]                    │
└───────────────────────────────────────────────────────────────┘
```

## 17.2 Mobile

```txt
[Item]
[Current → Next]
[Success Chance]
[Failure / Crack]
[Gold + Kraeng]
[Confirm]
```

## 17.3 States

- No Item
- Ready
- Insufficient Gold
- Insufficient Kraeng
- Cracked
- Max +5
- Processing
- Success
- Failure
- Failure + Crack
- Unknown/Reconcile

---

# 18. Quest and Milestone Rewards

## 18.1 Baseline reward table

| milestoneId | Trigger | EXP | Gold | Item |
|---|---|---:|---:|---|
| `ms_intro_complete` | จบ Intro | 120 | 50 | — |
| `ms_first_hunt` | ฆ่ามอนชุดแรก | 160 | 100 | Potion ×3 |
| `ms_storage_intro` | เปิดคลังครั้งแรก | 100 | 50 | — |
| `ms_shop_intro` | ซื้อ/ขายครั้งแรก | 100 | 100 | — |
| `ms_enhancement_ready` | ก่อนทดลองตีบวก | 150 | 100 | Kraeng ×1 |
| `ach_first_upgrade` | ตีบวกสำเร็จครั้งแรก | 100 | 0 | Kraeng ×1 |
| `ms_first_elite` | มีส่วนร่วมฆ่า Elite ครั้งแรก | 250 | 200 | Kraeng ×1 |
| `ms_map1_complete` | จบ Main Map 1 milestone | 400 | 300 | Kraeng ×1 |
| `ms_boss_first_kill` | Boss P2B First Kill | 300 | 200 | Kraeng ×1 |

Pre-Boss P2 totals:

```yaml
questMilestoneTotals:
  exp: 1380
  gold: 900
  kraeng: 4
  potion: 3
```

P2B Boss เพิ่ม:

```yaml
bossFirstKillBonus:
  exp: 300
  gold: 200
  kraeng: 1
```

## 18.2 Reward rules

- One-time per Account สำหรับ tutorial/help milestone
- Character progression quest ระบุ per Character ตาม Quest Spec
- Kraeng เป็น Account-bound Item
- Reward เข้า Inventory หากมีที่
- หาก Inventory เต็มและ Reward เป็น System Reward ให้เข้า Delivery Box ตาม Account Storage Spec
- Gold/EXP Grant Transaction ต้อง Idempotent

---

# 19. Economy Simulation Baseline

> ตารางนี้เป็น Validation Target ไม่ใช่ Scripted Guarantee

## 19.1 Casual Manual — 30 นาที

Assumptions:

- 1.5–2 kills/min
- เดิน/อ่าน/ขายของ
- ฆ่า 35–55 ตัว
- Elite 0–1 ตัว
- ทำ milestone บางส่วน

Expected:

| Metric | Range |
|---|---:|
| Combat EXP | 650–1,050 |
| Quest EXP | 250–650 |
| Gross Gold | 300–500 |
| Potion Used | 3–6 |
| Common Equipment | 5–10 |
| Uncommon Equipment | 0–2 |
| Rare Equipment | 0 |
| Kraeng | 1–3 รวม One-time |
| Bag Usage | 18–30 / 40 |
| Enhancement Attempts | 1–2 |

## 19.2 Efficient Manual — 30 นาที

Assumptions:

- 2.5–3.5 kills/min
- route ชัด
- ฆ่า 75–105 ตัว
- Elite 1–2 ตัว

Expected:

| Metric | Range |
|---|---:|
| Combat EXP | 1,400–2,200 |
| Quest EXP | 150–500 |
| Gross Gold | 500–800 |
| Potion Used | 4–8 |
| Common Equipment | 14–22 |
| Uncommon Equipment | 1–4 |
| Rare Equipment | 0–1 |
| Kraeng | 2–4 รวม Elite/One-time |
| Bag Usage | 28–40 / 40 |
| Enhancement Attempts | 1–3 |

## 19.3 Assisted Farming Reference — Future

P3 Bot target:

```yaml
assistedOutputVsEfficientManual:
  min: 0.60
  target: 0.70
  max: 0.80
```

P2 ไม่ Implement Bot  
ตารางนี้มีไว้ตรวจว่าตัวเลข Economy ไม่ผูกกับ Output 100% ของ Manual

## 19.4 Alert bands

| Metric | Alert |
|---|---|
| First upgrade median <15m | Too fast |
| First upgrade median >45m | Too slow |
| Kraeng >5/hour median | Inflation risk |
| Kraeng <1.5/hour after milestones | Starvation |
| Potion spend >35% gross Gold | Too expensive/damage too high |
| Inventory 90% <15m | Loot overload |
| Inventory 90% >60m efficient | Capacity irrelevant |
| Rare >1 per 30m normal farm | Too common |
| Gold net negative first session | Blocker |
| Common gear sell >60% total Gold source | Vendor loot dominates |

---

# 20. NPC Shop — No-Figma Screen Contract

## 20.1 Desktop

```txt
┌──────────────────────────────────────────────────────────────┐
│ ร้านของใช้เริ่มต้น                                  [?][X]  │
├────────────────────────────┬─────────────────────────────────┤
│ SHOP                       │ YOUR BAG                        │
│ [Consumable][Equipment]    │ [ ][ ][ ][ ][ ][ ][ ][ ]       │
│                            │                                 │
│ item list / grid           │ selected item detail            │
│                            │                                 │
├────────────────────────────┴─────────────────────────────────┤
│ Gold 1,240        Qty [-] 1 [+]          [Buy / Sell]        │
└──────────────────────────────────────────────────────────────┘
```

## 20.2 Mobile

```txt
[Gold]
[Buy] [Sell]
[Category]
[Item List]
[Detail Bottom Sheet]
[Sticky Buy/Sell CTA]
```

## 20.3 States

- Loading
- Ready
- Cannot Afford
- Inventory Full
- Unsellable
- Equipped
- Favorite/Locked
- Processing
- Success
- Error
- Unknown/Reconcile

## 20.4 Confirm rules

Confirm when:

- Rare Equipment Sell
- Equipped/Favorite Item
- Buy uses >25% of current Gold
- Quantity >10

Common Material Sell สามารถ Direct Sell ได้

---

# 21. Data Contracts

## 21.1 Item definition

```yaml
itemDefinition:
  itemId: string
  displayNameKey: string
  type: EQUIPMENT | CONSUMABLE | MATERIAL | UPGRADE_MATERIAL | QUEST
  subtype: optional
  rarity: COMMON | UNCOMMON | RARE
  requiredLevel: integer
  maxStack: integer
  bindRule: UNBOUND | ACCOUNT_BOUND | CHARACTER_BOUND
  tradeRule: NONE
  storagePolicy: ALLOWED | CONDITIONAL | BLOCKED
  vendorBuy: integer | null
  vendorSell: integer | null
  stats: object
  sourceHintKey: string
  upgradeEligible: boolean
  uniqueEquipGroup: string | null
  svgAssetId: string
```

## 21.2 Monster reward

```yaml
monsterReward:
  monsterId: string
  level: integer
  exp: integer
  gold:
    min: integer
    max: integer
  dropTableId: string
  respawnSeconds: integer
  eligibilityProfileId: string
```

## 21.3 Drop table

```yaml
dropTable:
  dropTableId: string
  guaranteed: []
  rolls:
    - rollId: string
      chancePercent: number
      poolId: string | null
      itemId: string | null
      quantity:
        min: integer
        max: integer
```

## 21.4 Shop item

```yaml
shopEntry:
  shopId: string
  itemId: string
  buyPrice: integer
  unlimitedStock: true
  unlockCondition: string
```

## 21.5 Enhancement

```yaml
enhancementLevel:
  fromLevel: integer
  toLevel: integer
  successChancePercent: number
  goldCost: integer
  kraengCost: integer
  crackChanceOnFailurePercent: number
  statMultiplier: number
```

---

# 22. API Semantics

ชื่อ Endpoint จริงให้ Tech กำหนด แต่ต้องมี Semantic:

```txt
getItemDefinitions(version)
getMonsterRewardConfig(version)
getExpCurve(version)
getShop(shopId)
buyShopItem(shopId, itemId, quantity, idempotencyKey)
sellItem(itemInstanceId, quantity, idempotencyKey)

previewEnhancement(itemInstanceId)
executeEnhancement(itemInstanceId, previewToken, idempotencyKey)
getEnhancementTransaction(transactionId)

pickupLoot(lootEntityId, idempotencyKey)
getLootTransaction(transactionId)

grantMilestoneReward(milestoneId)
```

ทุก Mutation Response ต้องมี:

- transactionId
- economyVersion
- authoritative balances
- item deltas
- error code
- retry safety

---

# 23. Error Codes

## Loot

```txt
LOOT_NOT_FOUND
LOOT_NOT_OWNED
LOOT_EXPIRED
LOOT_OUT_OF_RANGE
INVENTORY_FULL
ITEM_VERSION_CONFLICT
SESSION_INVALID
```

## Shop

```txt
SHOP_ITEM_NOT_FOUND
SHOP_LOCKED
INSUFFICIENT_GOLD
INVENTORY_FULL
ITEM_UNSELLABLE
ITEM_EQUIPPED
ITEM_LOCKED
TRANSACTION_CONFLICT
```

## Enhancement

```txt
ITEM_NOT_UPGRADEABLE
ITEM_MAX_ENHANCEMENT
ITEM_CRACKED
INSUFFICIENT_GOLD
INSUFFICIENT_KRAENG
PREVIEW_EXPIRED
CONFIG_VERSION_CHANGED
TRANSACTION_PENDING
TRANSACTION_ALREADY_COMMITTED
```

Error UI ต้องบอก:

1. เกิดอะไรขึ้น
2. Item/Gold ปลอดภัยหรือไม่
3. ทำอะไรต่อ
4. Error Code

---

# 24. Telemetry

## 24.1 Events

```txt
monster_reward_granted
loot_spawned
loot_auto_pickup
loot_manual_pickup
loot_pickup_failed
loot_expired
inventory_full_on_loot

shop_open
shop_buy
shop_sell
shop_transaction_failed

enhancement_preview
enhancement_attempt
enhancement_success
enhancement_failure
enhancement_cracked
enhancement_repair

exp_gained
level_up
gold_source
gold_sink
kraeng_source
kraeng_sink
milestone_reward
```

## 24.2 Required fields

- accountId internal/hashed
- characterId
- economyVersion
- itemId
- itemInstanceId when applicable
- monsterId
- sourceType
- quantity
- goldBefore/After
- expBefore/After
- inventoryUsageBefore/After
- enhancementFrom/To
- chanceShown
- result
- transactionId
- latencyBucket
- deviceClass
- sessionMinutes

## 24.3 Dashboards required before Closed Alpha

ไม่ต้องมี Admin Tuning UI แต่ต้องดู Metrics ได้:

- EXP/hour by level
- Gold source/sink
- Kraeng/hour
- Potion used/bought
- Item drop count
- Item sell count
- Bag occupancy
- Loot expired
- Inventory-full failures
- Enhancement success actual vs shown
- Time to first enhancement
- Time to level 10

---

# 25. Security and Anti-Exploit

- Client ห้าม Roll Drop
- Client ห้ามส่ง Gold/EXP amount
- Server สร้าง Personal Loot
- Loot Entity มี ownerAccountId/characterId
- Pickup ตรวจ distance
- Shop Price อ่านจาก Server Config
- Enhancement Roll Server-only
- Idempotency ทุก Mutation
- Item Instance อยู่ Location เดียว
- Starter Item farming ต้อง Telemetry
- Elite contribution ตรวจ Server
- Rate limit Pickup/Shop/Enhancement
- Economy Version Log ทุก Transaction
- ห้าม Client override Multiplier
- Config ต้องผ่าน schema validation ก่อน Server Start

---

# 26. QA Matrix

## 26.1 Item

- ทุก itemId unique
- SVG asset ID มีจริง
- Stack ถูกต้อง
- Bind/Storage ถูกต้อง
- Vendor price ไม่ติดลบ
- Equipment slot ถูก subtype
- Required level ทำงาน
- Rare label/accessibility

## 26.2 Drop

- 100,000 simulated kills ต่อ Monster
- Actual rate อยู่ใน statistical tolerance
- Equipment pool เลือกสูงสุดหนึ่งชิ้น
- Personal loot ไม่ข้ามผู้เล่น
- Elite guaranteed item ครบ
- Inventory full ไม่ลบ Item ทันที
- Timeout ตาม rarity
- Auto Loot category ถูกต้อง

## 26.3 EXP/Gold

- Level curve cumulative ถูกต้อง
- Level 10 cap
- Level modifier
- Party pool
- Gold min/max
- Multipliers 1.0
- Rounding
- Quest reward idempotency

## 26.4 Shop

- Buy/sell price
- Insufficient Gold
- Full Inventory
- Rare sell confirm
- Unsellable Kraeng
- Double click/retry
- Disconnect reconciliation

## 26.5 Enhancement

- Exact chance
- +0 → +1 guaranteed
- Crack only after fail
- No destroy/downgrade
- Repair
- Config version mismatch
- Preview token
- Double submit
- Actual results match chance over simulation band

## 26.6 No-Figma UI

- Desktop 1280×720
- Mobile landscape 640×360
- Touch target 48px
- Keyboard pickup/shop
- Thai text +30%
- Loading/Empty/Error/Success
- Color not sole indicator
- Reduced motion
- Tech สามารถสร้างหน้าจอจาก ASCII + Tokens

---

# 27. Acceptance Criteria

## Economy

- First upgrade median 20–40 นาที
- No first-session Gold starvation
- Level 1–10 อยู่ใน target band
- Kraeng 2–4/hour หลัง one-time rewards
- Rare ไม่ flood
- Common gear มีมูลค่าขายแต่ไม่เป็น Gold source เกิน guardrail
- Potion meaningful แต่ไม่กินเกิน 35% gross Gold median

## Loot

- Personal loot
- No last-hit advantage
- No silent item loss
- Inventory-full recovery readable
- Rare/Kraeng timeout 120s
- Auto Loot common stackable works
- Equipment manual pickup works

## Enhancement

- Exact Server chance
- Preview/transaction version match
- No duplicate roll
- No destruction/downgrade
- Crack/repair work
- +5 cap enforced

## Technical

- All values config-driven
- No Admin/Live Rate system
- Schema validation
- Economy versioning
- Idempotency
- Telemetry
- Static deployment adjustment works

## UX/UI

- Shop, Loot และ Enhancement ทำได้โดยไม่มี Figma
- Screen states ครบ
- Responsive rules ชัด
- SVG assets referenced by ID
- Accessibility pass

---

# 28. Implementation Sequence — Wave 2

## Wave 2A — Data Foundation

1. Config schema
2. Item definitions
3. Equipment instance
4. EXP curve
5. Gold balance
6. Economy version

## Wave 2B — Rewards

1. Monster reward
2. Personal loot
3. Drop table
4. Auto/manual pickup
5. Inventory full
6. Telemetry

## Wave 2C — Shop

1. Catalog
2. Buy
3. Sell
4. Confirm states
5. Error recovery

## Wave 2D — Enhancement Economy

1. Preview
2. Cost
3. Kraeng
4. Roll
5. Crack
6. Repair
7. Reconciliation

## Wave 2E — Validation

1. Simulation
2. QA
3. Closed Alpha telemetry
4. Config-only tuning

---

# 29. Rate Change Procedure

P2 การปรับ Rate ใช้ขั้นตอนเดียว:

```txt
Telemetry/Playtest Finding
→ Proposal Diff
→ Owner/Design Review
→ Config Change
→ economyVersion Bump
→ Automated Validation
→ Deploy
→ Compare Metrics
```

Change record ต้องมี:

- ค่าเดิม
- ค่าใหม่
- เหตุผล
- Metric ที่คาดว่าจะเปลี่ยน
- Risk
- Rollback config version

ไม่มี Feature Development เพิ่มเพื่อปรับ Rate

---

# 30. Definition of Done

- [ ] Equipment Slot ใช้ Weapon/Head/Body/Accessory/Talisman
- [ ] Item Master ถูกนำเข้า Config
- [ ] EXP Curve 1–10 ทำงาน
- [ ] Monster Reward/Drop ทำงาน
- [ ] Starter Shop ทำงาน
- [ ] Gold source/sink telemetry ทำงาน
- [ ] Kraeng source/sink ทำงาน
- [ ] Enhancement +0 ถึง +5 ทำงาน
- [ ] Crack/Repair ทำงาน
- [ ] Personal Loot ทำงาน
- [ ] Ground Timeout ทำงาน
- [ ] Inventory Full ไม่ทำ Item หายเงียบ
- [ ] No-Figma UI states ครบ
- [ ] Economy Config เป็น Static/Versioned
- [ ] ไม่มี Admin/Remote Rate System
- [ ] Simulation ผ่าน Target Bands
- [ ] QA Matrix ผ่าน
- [ ] Decision Index อ้างเอกสารนี้
