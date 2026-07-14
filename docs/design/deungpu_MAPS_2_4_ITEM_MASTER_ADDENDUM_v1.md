# ดึ๋งปุ๊ — Maps 2–4 Equipment Item Master (Addendum)

> **ไฟล์:** `deungpu_MAPS_2_4_ITEM_MASTER_ADDENDUM_v1.md`
> **สถานะ:** `LOCKED for implementation (owner-delegated 2026-07-14)` — ปิดช่องว่าง **Q2** ของ `deungpu_MAPS_2_4_ECONOMY_AND_LOOT_SPEC_v1.md` §7 ("pools declared, entries empty"): spec นั้น mint pool id ไว้ 10 pool แต่ไม่มี item master. เอกสารนี้ mint item id/stat/sell/weight จริง.
> **วันที่:** 2026-07-14
> **supersedes:** `deungpu_MAPS_2_4_ECONOMY_AND_LOOT_SPEC_v1.md` §4 note "Equipment pool ids … ยังไม่ mint" + §7 Q2 (ยกจาก OPEN → RESOLVED ที่ระดับ implementation)
> **relates:** `deungpu_P2_MAP_1_ECONOMY_AND_LOOT_SPEC_v1.md` §7.2–§7.6 (item pattern) + §11.2–§11.5 (pool weight convention) · `src/server/inventory/item-catalog.ts` (`equip()` schema) · `src/engine/config/combat.ts` (D-055 player curve) · `src/ui/theme/rarity.ts` (rarity tokens)
> **ขอบเขต:** equipment Item Master ของ Map 2–4 เท่านั้น — 22 item ใหม่, 10 pool. **material/reward/drop%/EXP curve/reinforcement = ไม่แตะ** (อยู่ที่ spec แม่/config เดิม)
>
> **⚠ ทุกเลข = Design Knob §48** (item-catalog.ts `stats` + economy.ts `sellPrices` + drop-pool weight) — ห้าม hardcode. stat ทุกตัว extrapolate จาก Map 1 ด้วย ratio-anchor คงที่ (§0) → ต่อเนื่องกับ D-055; ไม่มีเลขลอย
> **⚠ economy-gated:** sellPrice = Gold source (§53) → เสนอค่าไว้พร้อมใช้ แต่ยกเป็นคำถามให้ owner เคาะ (§6 Q-A). Item id = **Canonical ID ห้ามเปลี่ยนหลังมี save data**

---

## 0. Stat-ratio anchor (ที่มาของทุกตัวเลข)

**หลัก:** gear แต่ละชิ้น = "สัดส่วนคงที่ของพลังผู้เล่นที่ reqLevel นั้น" — ยึด fraction ต่อ slot×rarity ที่ derive จาก Map 1 (§7.2–§7.6 ÷ player base ที่ reqLevel เดิม) แล้ว **คงสัดส่วนเดิมข้ามแมพ** → gear ให้ % พลังเท่ากันทุก band (ไม่ power-creep, ไม่จืด).

**สูตร:** `stat(itemN) = fraction[slot,rarity] × playerBase[reqLevel]` แล้วปัด. secondary stat (crit%/break/move%) = ก็อป Map 1 ตรง ๆ (จำนวนเต็มเล็ก ไม่ scale).

**Player base (D-055 curve · HP=100+20·(lv−1) / ATK=12+3·(lv−1) / DEF=8+1.5·(lv−1), DEF ปัด):**

| lv | 8 | 11 | 12 | 13 | 15 | 16 | 17 | 18 | 21 | 22 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| HP | 240 | 300 | 320 | 340 | 380 | 400 | 420 | 440 | 500 | 520 |
| ATK | 33 | 42 | 45 | 48 | 54 | 57 | 60 | 63 | 72 | 75 |
| DEF | 19 | 23 | 24 | 26 | 29 | 30 | 32 | 33 | 38 | 39 |

**Fraction ที่ derive จาก Map 1 (คงที่ทุกแมพ):**

| slot | stat | common | uncommon | rare | epic |
|---|---|--:|--:|--:|--:|
| weapon | ATK | 0.67 | 0.71 | 0.73 | 0.80 |
| head | DEF / HP | 0.18 / 0.07 | 0.28 / 0.10 | 0.27 / 0.125 | — |
| body | DEF / HP | 0.45 / 0.13 | 0.57 / 0.17 | 0.60 / 0.19 | 0.66 / 0.21 |
| accessory | HP | 0.067 | 0.067 | 0.05 | — |
| talisman | ATK / HP | — / 0.07 | 0.083 / — | 0.12 / — | — |

_ตรวจ anchor: Map 2 common weapon (lv8) ATK = 0.67×33 = 22 ≈ Map 1 **rare** weapon (24 @lv8) → ผู้เล่นจบ Map 1 ด้วยดาบคมสะท้อน เข้า Map 2 เจอ common พอ ๆ กัน แล้วค่อยไต่ (continuity ตรง §1 ของ spec แม่)._ Sell = Map 1 sell (slot+rarity เดียวกัน) × (primary-stat ratio ต่อ counterpart) ปัดหลักสิบ.

---

## 1. Map 2 — ถนนชายไร่ (band lv 8–14) · 7 item

| id | ชื่อไทย | slot | rarity | reqLv | statBonus | sellPrice | pool (weight) |
|---|---|---|---|--:|---|--:|---|
| `eq_weapon_field_scythe` | เคียวเกี่ยวไร่ | weapon | common | 8 | atk 22 | 65 | `pool_map2_common_gear` (22) |
| `eq_head_straw_hood` | หมวกฟางคลุมหัว | head | common | 8 | def 3, hp 17 | 50 | `pool_map2_common_gear` (20) |
| `eq_body_field_hand_vest` | เสื้อกั๊กลูกไร่ | body | common | 8 | def 9, hp 31 | 70 | `pool_map2_common_gear` (18) |
| `eq_accessory_rat_tail_charm` | เครื่องรางหางหนู | accessory | uncommon | 11 | hp 20, crit 2% | 120 | `pool_map2_uncommon_gear` (20) |
| `eq_weapon_talisman_pike` | ทวนพันยันต์ | weapon | uncommon | 11 | atk 30, break 2 | 125 | `pool_map2_uncommon_gear` (20) |
| `eq_body_warden_straw_plate` | เกราะฟางผู้เฝ้าไร่ | body | rare | 13 | def 16, hp 65, break 2 | 300 | `pool_map2_rare_gear` (20) |
| `eq_talisman_warden_seal` | ผนึกผู้เฝ้าไร่ | talisman | rare | 13 | atk 6, break 5 | 270 | `pool_map2_rare_gear` (20) |

**equip() ready-to-paste (item-catalog.ts EQUIPMENT_DEFINITIONS):**

```ts
// ── Map 2 equipment (MAPS_2_4 Item Master §1) — stat = D-055 base × ratio-anchor (§0) ──
equip("eq_weapon_field_scythe",     "weapon",    "common",   8,  { attack: 22 }),
equip("eq_head_straw_hood",         "head",      "common",   8,  { defense: 3, maxHp: 17 }),
equip("eq_body_field_hand_vest",    "body",      "common",   8,  { defense: 9, maxHp: 31 }),
equip("eq_accessory_rat_tail_charm","accessory", "uncommon", 11, { maxHp: 20, criticalChancePercent: 2 }),
equip("eq_weapon_talisman_pike",    "weapon",    "uncommon", 11, { attack: 30, breakPower: 2 }),
equip("eq_body_warden_straw_plate", "body",      "rare",     13, { defense: 16, maxHp: 65, breakPower: 2 }),
equip("eq_talisman_warden_seal",    "talisman",  "rare",     13, { attack: 6, breakPower: 5 }),
```

---

## 2. Map 3 — ทางป่าเก่า (band lv 12–18) · 7 item

| id | ชื่อไทย | slot | rarity | reqLv | statBonus | sellPrice | pool (weight) |
|---|---|---|---|--:|---|--:|---|
| `eq_weapon_gnaw_root_club` | กระบองรากกัด | weapon | common | 12 | atk 30 | 90 | `pool_map3_common_gear` (22) |
| `eq_head_stone_brow_guard` | กันหน้าผากหิน | head | common | 12 | def 4, hp 22 | 60 | `pool_map3_common_gear` (20) |
| `eq_body_monkey_hide_jerkin` | เสื้อหนังลิงเงา | body | common | 12 | def 11, hp 42 | 100 | `pool_map3_common_gear` (18) |
| `eq_accessory_shadow_tail_band` | สายรัดหางเงา | accessory | uncommon | 15 | hp 25, crit 2% | 150 | `pool_map3_uncommon_gear` (20) |
| `eq_head_mossless_helm` | หมวกหินไร้ตะไคร่ | head | uncommon | 15 | def 8, hp 38 | 125 | `pool_map3_uncommon_gear` (20) |
| `eq_weapon_warden_stoneblade` | ดาบหินผู้เฝ้าทาง | weapon | rare | 17 | atk 44, crit 2%, break 3 | 330 | `pool_map3_rare_gear` (20) |
| `eq_talisman_nameless_marker` | หินหมายไร้นาม | talisman | rare | 17 | atk 7, break 5 | 315 | `pool_map3_rare_gear` (20) |

```ts
// ── Map 3 equipment (§2) ──
equip("eq_weapon_gnaw_root_club",    "weapon",    "common",   12, { attack: 30 }),
equip("eq_head_stone_brow_guard",    "head",      "common",   12, { defense: 4, maxHp: 22 }),
equip("eq_body_monkey_hide_jerkin",  "body",      "common",   12, { defense: 11, maxHp: 42 }),
equip("eq_accessory_shadow_tail_band","accessory","uncommon", 15, { maxHp: 25, criticalChancePercent: 2 }),
equip("eq_head_mossless_helm",       "head",      "uncommon", 15, { defense: 8, maxHp: 38 }),
equip("eq_weapon_warden_stoneblade", "weapon",    "rare",     17, { attack: 44, criticalChancePercent: 2, breakPower: 3 }),
equip("eq_talisman_nameless_marker", "talisman",  "rare",     17, { attack: 7, breakPower: 5 }),
```

---

## 3. Map 4 — ป่าจันทร์เงา (band lv 16–22) · 8 item (รวม epic 1 ชิ้น, ปิดแบนด์)

| id | ชื่อไทย | slot | rarity | reqLv | statBonus | sellPrice | pool (weight) |
|---|---|---|---|--:|---|--:|---|
| `eq_weapon_wisp_edge` | คมแสงจันทร์ | weapon | common | 16 | atk 38 | 115 | `pool_map4_common_gear` (22) |
| `eq_head_moonlit_circlet` | รัดเกล้าแสงจันทร์ | head | common | 16 | def 5, hp 28 | 80 | `pool_map4_common_gear` (20) |
| `eq_body_deerhide_coat` | เสื้อหนังกวางเงา | body | common | 16 | def 14, hp 52 | 120 | `pool_map4_common_gear` (18) |
| `eq_accessory_dream_bead` | ลูกปัดเห็ดฝัน | accessory | uncommon | 18 | hp 30, crit 2% | 180 | `pool_map4_uncommon_gear` (20) |
| `eq_talisman_moonshard_charm` | เครื่องรางเศษจันทร์ | talisman | uncommon | 18 | atk 5, break 3 | 175 | `pool_map4_uncommon_gear` (20) |
| `eq_weapon_dryad_moonglaive` | ง้าวจันทร์นางไม้ | weapon | rare | 21 | atk 53, crit 2%, break 3 | 400 | `pool_map4_rare_gear` (20) |
| `eq_body_moondark_veil` | ผ้าคลุมจันทร์ดับ | body | rare | 21 | def 23, hp 95, break 2 | 445 | `pool_map4_rare_gear` (20) |
| `eq_weapon_moondark_crescent` | จันทร์เสี้ยวจันทร์ดับ | weapon | **epic**\* | 22 | atk 60, crit 3%, break 4 | 600 | `pool_map4_epic_gear` (20, sole) |

\* **epic code-gap (สำคัญ):** `ItemRarity` ใน `item-catalog.ts` = `"common" \| "uncommon" \| "rare"` เท่านั้น — **ยังไม่รองรับ `"epic"`** (แม้ `src/ui/theme/rarity.ts` มี token `epic` = `#4B568E` + rim `#B0B9EC` แล้ว). ตาม brief rarity-discipline → item นี้ลง catalog ด้วย `rarity: "rare"` ชั่วคราว, drop pool = `pool_map4_epic_gear` (แยกจาก rare pool อยู่แล้ว). **TODO (§59.4-style type change):** เพิ่ม `"epic"` เข้า `ItemRarity` → เปลี่ยน field นี้เป็น `"epic"` (ดู §6 Q-C).

```ts
// ── Map 4 equipment (§3) — epic ↓ ใช้ rarity:"rare" ชั่วคราวจนกว่า ItemRarity รองรับ "epic" (§6 Q-C) ──
equip("eq_weapon_wisp_edge",        "weapon",    "common",   16, { attack: 38 }),
equip("eq_head_moonlit_circlet",    "head",      "common",   16, { defense: 5, maxHp: 28 }),
equip("eq_body_deerhide_coat",      "body",      "common",   16, { defense: 14, maxHp: 52 }),
equip("eq_accessory_dream_bead",    "accessory", "uncommon", 18, { maxHp: 30, criticalChancePercent: 2 }),
equip("eq_talisman_moonshard_charm","talisman",  "uncommon", 18, { attack: 5, breakPower: 3 }),
equip("eq_weapon_dryad_moonglaive", "weapon",    "rare",     21, { attack: 53, criticalChancePercent: 2, breakPower: 3 }),
equip("eq_body_moondark_veil",      "body",      "rare",     21, { defense: 23, maxHp: 95, breakPower: 2 }),
equip("eq_weapon_moondark_crescent","weapon",    "rare",     22, { attack: 60, criticalChancePercent: 3, breakPower: 4 }), // TODO rarity:"epic"
```

---

## 4. Pool composition (10 pool → item + weight)

> น้ำหนักเป็นค่าสัมพัทธ์ (ไม่ต้องรวม 100) mirror Map 1 §11.2–§11.5 (~18–22/ชิ้น, weapon นำเล็กน้อยใน common pool). แต่ละ roll ของ pool = สุ่มถ่วงน้ำหนักได้ 1 ชิ้น. ทุก pool มี ≥2 ชิ้น ยกเว้น `pool_map4_epic_gear` (capstone, ชิ้นเดียว).

| pool id | items (weight) |
|---|---|
| `pool_map2_common_gear` | field_scythe (22) · straw_hood (20) · field_hand_vest (18) |
| `pool_map2_uncommon_gear` | rat_tail_charm (20) · talisman_pike (20) |
| `pool_map2_rare_gear` | warden_straw_plate (20) · warden_seal (20) |
| `pool_map3_common_gear` | gnaw_root_club (22) · stone_brow_guard (20) · monkey_hide_jerkin (18) |
| `pool_map3_uncommon_gear` | shadow_tail_band (20) · mossless_helm (20) |
| `pool_map3_rare_gear` | warden_stoneblade (20) · nameless_marker (20) |
| `pool_map4_common_gear` | wisp_edge (22) · moonlit_circlet (20) · deerhide_coat (18) |
| `pool_map4_uncommon_gear` | dream_bead (20) · moonshard_charm (20) |
| `pool_map4_rare_gear` | dryad_moonglaive (20) · moondark_veil (20) |
| `pool_map4_epic_gear` | moondark_crescent (20, sole) |

**Drop-table hook (จาก spec แม่ §5 — ไม่แก้ที่นี่):** normal → common(+uncommon) pool · elite → uncommon(60%)+rare(8–12%) · boss → uncommon guaranteed ×1 + rare roll (20–25%) · **Map 4 boss เพิ่ม `pool_map4_epic_gear` 6%** (Epic ตัวแรกในเนื้อหา lv≤22, ปิดแบนด์).

---

## 5. Rarity discipline

- **normal mob → common/uncommon เท่านั้น** · **rare → เฉพาะ elite/boss pool** · **epic → เฉพาะ Map 4 boss (6%)** — ตรง §5.3 spec แม่ + Economy §5.3 Map 1. Legendary = ยังไม่มีในเนื้อหา lv≤22.
- epic = 1 ชิ้น (`eq_weapon_moondark_crescent`) — capstone ของ 3 แมพ, reqLv 22 ปิดแบนด์. เก็บ epic pool แยกไว้เผื่อเพิ่มชิ้นที่ 2 ภายหลัง (Q-D).
- ทุก item = `stackable:false`, `sharing` = default (UNBOUND/ALLOWED/NONE) เหมือน Map 1 gear (ไม่มี bind/unique group ยกเว้นถ้า owner สั่ง) — mirror `eq_*` Map 1.

---

## 6. คำถามให้ owner เคาะ (economy/code-gated · v15 §53 — ห้ามสรุปเอง)

- **Q-A — sellPrice ของ gear Map 2–4 (Gold source §53)** · เสนอค่าตาม "Map 1 sell × primary-stat ratio" (§0) เช่น rare weapon Map 3 = 330, epic weapon Map 4 = 600. **แนะนำ:** รับค่าตามตาราง (สัดส่วน $/พลัง = Map 1 คงเดิม → ไม่เปิด Gold-faucet ใหม่). **เหตุผล:** ถ้าอยากคุม Gold inflation late-game เข้มขึ้น ปรับ *ลง* ทีหลังผ่าน config ง่ายกว่าดันขึ้น. ต้อง owner เคาะเพราะแตะ Gold economy.
- **Q-B — epic weapon: ยิงเข้า `pool_map4_epic_gear` 6% พอ หรือให้เป็น boss-material→exchange แทน?** ตอนนี้ = drop ตรง 6% (ตาม spec แม่ §5.3). **แนะนำ:** คง 6% drop ตรงสำหรับ capstone เดียว (rare event, ไม่ต้องมี craft loop). **เหตุผล:** exchange ต้องมี material+recipe เพิ่ม (งานใหม่); 6% drop เพียงพอสำหรับ 1 ชิ้น. ถ้า owner อยากได้ "เป้าหมายแน่นอน" ค่อยเติม pity/exchange.
- **Q-C — เพิ่ม `"epic"` เข้า `ItemRarity` (code)** · ตอนนี้ `item-catalog.ts` รองรับแค่ common/uncommon/rare → epic weapon ลง `rarity:"rare"` ชั่วคราว (UI token `epic` มีแล้วใน rarity.ts). **แนะนำ:** ให้ tech เพิ่ม `"epic"` เข้า type + drop-pool classifier (งานเล็ก, ไม่แตะ save data — rarity เป็น display/pool tag) แล้วเปลี่ยน field เป็น `"epic"`. **เหตุผล:** ไม่งั้น epic แสดงสี rare (Moon Blue) แทน Moon Deep — เสียความรู้สึก "ของโคตรหายาก" ปิดแบนด์.
- **Q-D — จำนวน epic: 1 พอ หรือเพิ่มเป็น 2 (เช่น epic body)?** brief อนุญาต 1–2. เลือก **1** เพื่อคง rare pool ให้มี 2 ชิ้น (elite ทั้งแมพ roll rare pool → ต้องมี variety). **แนะนำ:** คง 1 epic ก่อน; ถ้า owner อยากได้ epic set 2 ชิ้น จะขยาย Map 4 เป็น 9 item (เพิ่ม `eq_body_...` epic) — ค่า stat ratio-anchor พร้อม derive ให้ทันที.
- **Q-E — reqLevel gating** · ตั้ง common ที่ต้น band / rare ที่ปลาย band (M2 8/13, M3 12/17, M4 16/22). **แนะนำ:** รับตามนี้ (ผู้เล่นใส่ของแมพได้ระหว่างไล่ band, best-in-map ปลาย band). **เหตุผล:** ถ้า gate สูงไป gear จืดตอนได้มา; ต่ำไป trivialize ต้นแมพ. ค่า = Design Knob ปรับได้.
