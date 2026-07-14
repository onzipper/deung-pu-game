# ดึ๋งปุ๊ — Maps 2–4 Economy & Loot Specification

> **ไฟล์:** `deungpu_MAPS_2_4_ECONOMY_AND_LOOT_SPEC_v1.md`
> **Revision:** `v1.0 — Maps 2–4 Content Baseline (owner-delegated authoring)`
> **สถานะ:** `LOCKED for implementation (owner-delegated 2026-07-14)` — owner มอบหมาย 2026-07-14 ให้ game-designer ผลิตเนื้อหา design ที่ขาดของ Map 2–4 โดยไม่ต้องขออนุมัติทีละรายการ · ยกเว้นหัวข้อ economy/monetization-gated (reinforcement drop rate, EXP-to-next curve เกิน lv10, equipment Item Master) = ยังต้องให้ owner เคาะ ดู §7
> **วันที่:** 2026-07-14
> **ขอบเขต:** Map 2 (ถนนชายไร่) · Map 3 (ทางป่าเก่า) · Map 4 (ป่าจันทร์เงา) — Level band, Mob Identity, Combat Stat, EXP/Gold, Drop Table, Material ใหม่, Bot-Safe Pocket
> **source (อ่านเฉพาะส่วนที่อ้าง):**
> - Template + baseline: `deungpu_P2_MAP_1_ECONOMY_AND_LOOT_SPEC_v1.md` §9 (EXP), §10 (reward), §11 (drop tables)
> - Map content: `deungpu_MAP_LAYOUT_BIBLE_v1.md` §102–160 (Map2) · §162–226 (Map3) · §227–282 (Map4)
> - Roster/density: `deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md` §5 (:145–156 size) · §6 (:178–223 mob list) · §8 (:370–417 Bot rule)
> - Combat stat table + player curve: `deungpu_REINFORCEMENT_SYSTEM_DECISION_v1.md` §9.1 (id/reward) + §9.3 (D-055 stat table + player baseline lv1–8) · id-naming `mon_mapN_*`/`elite_mapN_*`/`boss_mapN_*`
> - Field shape ต้อง plug-compatible: `src/engine/config/combat.ts` `MobCombatStats` (hp/atk/def/tierReduction/moveSpeed/attackRange/attackCooldown/anticipationMs/activeMs/recoveryMs/breakPower)
>
> **⚠ ทุกเลขในเอกสารนี้ = Design Knob §48 ปรับได้ผ่าน config** (monster-rewards/drop-tables/monster-combat-stats) — ห้าม hardcode. ค่าทั้งหมด extrapolate จาก Map 1 (D-055) อย่างต่อเนื่อง; แต่ละเลข "ระบุ anchor" ที่มา

---

## 0. Source of Truth + Conflict note

- Combat semantics/สูตร: Combat Bible + D-055 เป็น source of truth · เอกสารนี้เป็นเจ้าของ **reward / level / respawn / drop / material identity ของ Map 2–4**
- สูตรที่ใช้ extrapolate: `DMG = ATK × baseMultiplier × [50 / (50 + effectiveDEF)]` (k=50, Combat Bible §2) · player basic-attack cd `0.6s`, crit 5% ×+50% (D-055) · tierReduction คูณ damage ที่ player ตีมอน (normal=1.0, elite=0.8, boss<0.8)
- **Player power curve (extrapolate D-055 §9.3):** lv1 HP100/ATK12/DEF8 · growth/lv HP+20/ATK+3/DEF+1.5 → lv10 280/39/21 · lv12 320/45/24 · lv14 360/51/27 · lv16 400/57/30 · lv18 440/63/33 · lv20 480/69/36 · lv22 520/75/39. TTK ทุกตัวคิดกับ player "level เดียวกับมอน" (matched-level) เว้นบอส (คิดที่ player = band-exit level)
- **Field-name mapping → code:** ตาราง §3 ใช้ column `attack`/`defense` (ตาม D-055 §9.3); code (`combat.ts`) map → `atk`/`def`. `aggroRadius`/`leashRadius` มีใน D-055 §9.3 แต่ยังไม่มีใน `MobCombatStats` interface → tech เพิ่ม field ผ่าน §59.4 (เก็บค่าไว้ก่อน, ดู §7 คำถาม Q4)
- **Conflict สังเกตได้ (นอกสโคป, บันทึกให้ owner):** Map 1 boss id ไม่ตรงกันระหว่างเอกสาร — Reinforcement doc §1 + Economy §10.1/§11.6 = `boss_map1_resonant_guardian` (ผู้พิทักษ์เสียงสะท้อน) แต่ `combat.ts` + current-state = `boss_map1_boiling_boar` (หมูป่าหม้อเดือด). ไม่กระทบ Map 2–4 (convention `boss_mapN_<english>` เหมือนกันทั้งคู่) — ยกเป็นคำถาม Q5

---

## 1. Level Band + Progression Intent (PROPOSED)

> **PROPOSED** — band ยึดหลัก "มอนต้นแมพ ตีได้ด้วย exit-level ของแมพก่อนหน้า" (continuity). Map 1 exit = lv10 (P2 cap §9.1). Band เกิน lv10 = เนื้อหา post-P2 (P3+); **EXP-to-next curve lv11–22 ยังไม่ล็อก** (Map 1 §9.2 จบที่ lv10) → ดู §7 Q1

| Map | ชื่อ | Level Band | Entry mob lv (ตีได้ด้วย exit ก่อนหน้า) | Exit intent | Size / Density (§5) |
|---|---|---|---:|---|---|
| 2 | ถนนชายไร่ | **lv 8–14** | 8 (Map1 exit 10 กินได้สบาย) | จบ ~lv14 พร้อมเข้า Map 3 | Medium · 10–15/จอ · AoE 6–10 |
| 3 | ทางป่าเก่า | **lv 12–18** | 12 (Map2 exit 14) | จบ ~lv18 | Medium · 10–18/จอ · AoE 6–10 |
| 4 | ป่าจันทร์เงา | **lv 16–22** | 16 (Map3 exit 18) | จบ ~lv22 | Medium–Large · 12–20/จอ · AoE 8–12 |

Band ซ้อนกัน 2 level ที่ขอบ (8–14 / 12–18 / 16–22) = ตั้งใจให้ผู้เล่นข้ามแมพได้ก่อนถึงเพดาน (ลดกำแพง grind).

---

## 2. Mob Identity + Reward (per map)

> id = mint ใหม่ตาม convention `mon_mapN_<english_snake>` / `elite_mapN_*` / `boss_mapN_*` (grep ยืนยันไม่ชนของเดิม) · **Canonical ID ห้ามเปลี่ยนหลังมี save data**. role/area + pack = จาก layout bible + spawn §6. EXP anchor `≈ 5×level + 10` (fit Map1: slime lv1=14, bird lv2=20, boar lv4=30) ปรับขึ้นเล็กน้อยตามความถึก; elite ≈ 10× mid-normal EXP; boss ≈ Map1 boss 550 × (level/8). gold band = Map1 rank × (level ratio).

### 2.1 Map 2 — ถนนชายไร่ (lv 8–14)

| id | ชื่อไทย | Role / Area | Level | Pack behavior (1-line) | EXP | Gold | Respawn |
|---|---|---|---:|---|---:|---|---|
| `mon_map2_mushroom_startle` | เห็ดสะดุ้ง | W แปลงเห็ด | 8 | กอ 6–10 ตัว รวมตัวแน่น ดีต่อ AoE, ตกใจแล้วพุ่งสั้น ๆ | 50 | 14–20 | 25s |
| `mon_map2_scarecrow_walker` | หุ่นฟางเดินได้ | C ทุ่งฟาง (pack หลัก) | 10 | pack 8–12 เดินช้าตรง ๆ, bread-and-butter | 60 | 18–26 | 30s |
| `mon_map2_greenlight_rat` | หนูนาแสงเขียว | E คันนา | 11 | 5–8 ตัว วิ่งเร็ว กระจาย ตัวบาง | 66 | 20–28 | 25s |
| `elite_map2_talisman_scarecrow` | หุ่นฟางพันยันต์ | C/S border | 13 | 1–2 ตัว ใกล้ boss route, ยันต์กันดาเมจ | 680 | 120–180 | 300s (5m) |
| `boss_map2_field_warden` | หุ่นฟางผู้เฝ้าไร่ | S Boss field | 14 | Field Boss + add หุ่นฟาง, guard gauge | 1000 | 320–460 | Encounter |

### 2.2 Map 3 — ทางป่าเก่า (lv 12–18)

| id | ชื่อไทย | Role / Area | Level | Pack behavior (1-line) | EXP | Gold | Respawn |
|---|---|---|---:|---|---:|---|---|
| `mon_map3_gnawing_root` | รากไม้กัดเท้า | C/SW | 12 | 6–10 ตัว เกือบอยู่กับที่, root/slow เบา ๆ, ถึกกลาง ๆ | 72 | 22–32 | 30s |
| `mon_map3_shadow_monkey` | ลิงเงา | ต้นไม้ C/E | 14 | 4–8 ตัว ไว กระโดดสลับตำแหน่ง ตัวบาง | 82 | 26–36 | 30s |
| `mon_map3_walking_stone` | หินเดินได้ | C/NE | 15 | 5–9 ตัว ช้า ถึกสุดของแมพ DEF สูง | 92 | 30–42 | 35s |
| `elite_map3_mossless_stone` | หินไร้ตะไคร่ | NE hidden pocket | 17 | hidden elite เดี่ยว, secret-route reward | 900 | 160–240 | 390s (6.5m) |
| `boss_map3_nameless_warden` | ผู้เฝ้าทางที่ไม่มีชื่อ | SE Boss arena | 18 | Field Boss, ถึกกว่า Map2 boss | 1300 | 420–600 | Encounter |

### 2.3 Map 4 — ป่าจันทร์เงา (lv 16–22)

| id | ชื่อไทย | Role / Area | Level | Pack behavior (1-line) | EXP | Gold | Respawn |
|---|---|---|---:|---|---:|---|---|
| `mon_map4_moonlight_wisp` | ผีแสงจันทร์ | W/C | 16 | 6–12 ตัว fade/blink สั้น หลบง่าย ตัวบาง | 92 | 30–42 | 30s |
| `mon_map4_dream_mushroom` | เห็ดฝัน | C ป่าหมอก | 17 | 8–14 ตัว รวมเป็นวง ดีต่อ AoE, slow/ง่วงเบา ๆ | 96 | 32–44 | 30s |
| `mon_map4_shadow_deer` | กวางเงา | E ทุ่งกวางเงา | 19 | 4–8 ตัว movement สูง หนีเก่ง | 108 | 38–52 | 40s |
| `elite_map4_shattered_moon_deer` | กวางจันทร์แตก | E/NE | 21 | 1–2 ตัว, เศษจันทร์กระเด็น | 1100 | 200–300 | 420s (7m) |
| `boss_map4_moondark_dryad` | นางไม้จันทร์ดับ | S Boss grove | 22 | Field Boss ปิดแบนด์, ถึกสุด | 1600 | 520–740 | Encounter |

---

## 3. Combat Stats (per map · D-055 §9.3 shape)

> extrapolate จาก D-055 §9.3 · **HP tune ให้เข้า TTK เป้าหมาย** (normal 2.8–6s ต่อ Map1 pattern · **elite ≈ 6–8× standard-pack normal** · **boss TTK solo 150–240s** ต่อ Combat Bible §2.5). ATK ≈ 3.0×level (normal) / 3.4×level (elite) / 3.3×level (boss). DEF: fast/บาง ≈1.6×lv · standard ≈2.0×lv · ถึก ≈2.7×lv · elite/boss ≈2.4–3.0×lv. anticipation/active/recovery = mirror archetype ของ Map1 (fast=bird, standard=boar, tank/boss=elite/boss). ทุกค่า = Design Knob §48.

หน่วย: `moveSpd` tiles/s · `range`/`aggro`/`leash` tiles · `atkCD` วินาที · `antic`/`act`/`rec` ms · `tier` = tierReduction · `brk` = breakPower.

### 3.1 Map 2

| id | lv | hp | atk | def | tier | moveSpd | range | atkCD | antic | act | rec | aggro | leash | brk |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `mon_map2_mushroom_startle` | 8 | 120 | 24 | 14 | 1.00 | 2.2 | 1.2 | 2.0 | 350 | 150 | 500 | 5 | 9 | 0 |
| `mon_map2_scarecrow_walker` | 10 | 190 | 30 | 20 | 1.00 | 2.5 | 1.5 | 2.6 | 500 | 220 | 650 | 6 | 10 | 0 |
| `mon_map2_greenlight_rat` | 11 | 150 | 30 | 16 | 1.00 | 3.6 | 1.3 | 2.2 | 280 | 120 | 420 | 6 | 12 | 0 |
| `elite_map2_talisman_scarecrow` | 13 | 1300 | 44 | 30 | 0.80 | 2.8 | 2.0 | 3.0 | 650 | 300 | 800 | 8 | 14 | 0 |
| `boss_map2_field_warden` | 14 | 6000 | 46 | 34 | 0.65 | 2.4 | 2.4 | 3.2 | 800 | 400 | 700 | 10 | 18 | 100 |

TTK (solo matched-level): mushroom ~2.7s · scarecrow ~4.0s · rat ~2.8s · elite ~31.7s (≈6.8× scarecrow HP) · **boss ~178s + break** ✓ 150–240.

### 3.2 Map 3

| id | lv | hp | atk | def | tier | moveSpd | range | atkCD | antic | act | rec | aggro | leash | brk |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `mon_map3_gnawing_root` | 12 | 230 | 34 | 26 | 1.00 | 1.6 | 1.4 | 2.8 | 600 | 260 | 700 | 5 | 8 | 0 |
| `mon_map3_shadow_monkey` | 14 | 180 | 40 | 22 | 1.00 | 3.8 | 1.4 | 2.2 | 280 | 120 | 420 | 7 | 13 | 0 |
| `mon_map3_walking_stone` | 15 | 300 | 46 | 42 | 1.00 | 2.0 | 1.6 | 3.0 | 650 | 300 | 800 | 5 | 9 | 0 |
| `elite_map3_mossless_stone` | 17 | 1500 | 56 | 50 | 0.80 | 2.2 | 2.0 | 3.2 | 700 | 320 | 850 | 8 | 14 | 0 |
| `boss_map3_nameless_warden` | 18 | 6800 | 58 | 44 | 0.62 | 2.4 | 2.6 | 3.2 | 850 | 420 | 700 | 10 | 18 | 110 |

TTK: root ~4.5s · monkey ~3.0s · stone ~6.0s · elite ~36.6s (≈6.5× root HP) · **boss ~191s + break** ✓.

### 3.3 Map 4

| id | lv | hp | atk | def | tier | moveSpd | range | atkCD | antic | act | rec | aggro | leash | brk |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `mon_map4_moonlight_wisp` | 16 | 190 | 44 | 26 | 1.00 | 3.0 | 1.5 | 2.4 | 300 | 140 | 450 | 7 | 13 | 0 |
| `mon_map4_dream_mushroom` | 17 | 200 | 44 | 30 | 1.00 | 2.0 | 1.3 | 2.6 | 400 | 180 | 550 | 5 | 9 | 0 |
| `mon_map4_shadow_deer` | 19 | 250 | 54 | 40 | 1.00 | 3.8 | 1.6 | 2.6 | 350 | 160 | 480 | 7 | 14 | 0 |
| `elite_map4_shattered_moon_deer` | 21 | 1600 | 68 | 60 | 0.80 | 3.0 | 2.2 | 3.2 | 700 | 320 | 850 | 8 | 15 | 0 |
| `boss_map4_moondark_dryad` | 22 | 7800 | 70 | 54 | 0.60 | 2.4 | 2.6 | 3.4 | 850 | 440 | 700 | 11 | 18 | 120 |

TTK: wisp ~3.0s · dream ~3.2s · deer ~4.0s · elite ~35.8s (≈6.4× deer HP) · **boss ~211s + break** ✓.

> **anchor เทียบ Map1:** boss HP ไต่ 2600(lv8) → 6000(lv14, ≈2.3×) → 6800(lv18) → 7800(lv22, ปิดแบนด์) · tierReduction ไต่ 0.65 → 0.62 → 0.60 (บอสถึกขึ้นเรื่อย ๆ = boss ตีต้องใช้ break gauge มากขึ้น) · elite HP ทุกตัว ≈6–8× standard-pack normal ต่อ Map1 elite pattern (420 ≈ 6.7× boar 150 wait: 420/150=2.8× — Map1 elite เป็นข้อยกเว้นเพราะ boar เป็น normal ที่ถึกสุด; Map2–4 ยึด "6–8× standard-pack normal" ตาม task brief).

---

## 4. Materials ใหม่ (mint) + sell value

> sell ต่อยอด Map1 (common 2–5 / uncommon 8–12 / boss-mat 20) ขึ้นตาม band. 3 material drop-จากมอน + 1 boss-material ต่อแมพ (12 id ใหม่). Bind = UNBOUND (เหมือน Map1 material) เว้น boss-material = ACCOUNT_BOUND (ตาม Map1 §7.1 pattern). ทุก sell = Design Knob §48.

| itemId | ชื่อไทย | Type | Rarity | มาจาก | Bind | Sell |
|---|---|---|---|---|---|---:|
| `mat_startle_spore` | สปอร์สะดุ้ง | MATERIAL | Common | mushroom_startle (M2) | UNBOUND | 6 |
| `mat_resonant_straw` | ฟางสั่นพ้อง | MATERIAL | Common | scarecrow_walker (M2) | UNBOUND | 8 |
| `mat_greenlight_whisker` | หนวดหนูแสงเขียว | MATERIAL | Uncommon | greenlight_rat (M2) | UNBOUND | 14 |
| `mat_warden_talisman_ash` | เถ้ายันต์ผู้เฝ้าไร่ | MATERIAL | Uncommon | boss_map2 (guaranteed) | ACCOUNT_BOUND | 26 |
| `mat_old_root_scrap` | เศษรากเก่า | MATERIAL | Common | gnawing_root (M3) | UNBOUND | 9 |
| `mat_shadow_pelt` | หนังลิงเงา | MATERIAL | Common | shadow_monkey (M3) | UNBOUND | 11 |
| `mat_mossless_shard` | เศษหินไร้ตะไคร่ | MATERIAL | Uncommon | walking_stone (M3) | UNBOUND | 18 |
| `mat_nameless_marker_stone` | หินหมายไร้นาม | MATERIAL | Uncommon | boss_map3 (guaranteed) | ACCOUNT_BOUND | 34 |
| `mat_moonlight_residue` | ผงจันทร์สะท้อน | MATERIAL | Common | moonlight_wisp (M4) | UNBOUND | 12 |
| `mat_dream_cap` | หมวกเห็ดฝัน | MATERIAL | Common | dream_mushroom (M4) | UNBOUND | 13 |
| `mat_shadow_dew` | น้ำค้างเงา | MATERIAL | Uncommon | shadow_deer (M4) | UNBOUND | 22 |
| `mat_moondark_sap` | ยางไม้จันทร์ดับ | MATERIAL | Rare | boss_map4 (guaranteed) | ACCOUNT_BOUND | 40 |

**Equipment pool ids** (mint) — concrete equipment Item Master (item id + stat) ของ Map 2–4 = extension แยก (mirror Map1 §7), **ยังไม่ mint ในเอกสารนี้** (ดู §7 Q2). Drop table อ้าง pool:
`pool_map2_common_gear` · `pool_map2_uncommon_gear` · `pool_map2_rare_gear` · (map3/map4 เหมือนกัน) · `pool_map4_epic_gear` (เฉพาะ Map4 boss). rarity ต่อแมพ: normal→Common/Uncommon, elite→Uncommon/Rare, boss→Rare(+Epic เล็กน้อย Map4).

---

## 5. Drop Tables

> mirror Map1 §11 format/percentage. **Independent rolls** (normal): material / potion / equipment pool. Elite = guaranteed material + pool rolls. Boss = guaranteed material + rare chance + potion + first-kill. **ไม่มี reinforcement drop จาก normal/elite** (โมเดล boss-only ต่อ Reinforcement doc §4) · reinforcement ที่บอส = อ้างโมเดลเดิม (boss-only 8% + pity 15) — **rate ไม่ตั้งใหม่ในเอกสารนี้** (economy-gated §7 Q3). potion ยังอ้าง `con_small_potion` เดิม (mid-tier potion = §7 Q6).

### 5.1 Map 2 — `drop_map2_normal_v1` / `_elite_v1` / `_boss_v1`

**Normal** (`drop_map2_normal_v1`, per-mob):

| มอน | Main material | % | Qty | Secondary | Potion % | Common gear | Uncommon gear |
|---|---|---:|---:|---|---:|---:|---:|
| mushroom_startle | `mat_startle_spore` | 70 | 1–2 | — | 4 | `pool_map2_common_gear` 18% | — |
| scarecrow_walker | `mat_resonant_straw` | 70 | 1–2 | — | 5 | `pool_map2_common_gear` 20% | `pool_map2_uncommon_gear` 6% |
| greenlight_rat | `mat_greenlight_whisker` | 55 | 1 | `mat_resonant_straw` 20% ×1 | 5 | `pool_map2_common_gear` 16% | — |

**Elite** (`drop_map2_elite_v1`, `elite_map2_talisman_scarecrow`) — guaranteed/eligible player: `mat_resonant_straw` ×2–4, `mat_greenlight_whisker` ×1–2. Rolls: `pool_map2_uncommon_gear` 60% ·1 · `pool_map2_rare_gear` 8% ·1 · `con_small_potion` 25% ·1–2. ไม่มี pity, personal loot, respawn 5m (§11.5 pattern).

**Boss** (`drop_map2_boss_v1`, `boss_map2_field_warden`) — guaranteed: `mat_warden_talisman_ash` ×2–4, `pool_map2_uncommon_gear` ×1, `con_small_potion` ×3–5 (100%). Rolls: `pool_map2_rare_gear` 20% ·1. Reinforcement: boss-only ตาม Reinforcement doc §4 (rate = Q3). First-kill: Gold/EXP/Achievement/Journal (จำนวน = milestone spec, ต่อ Map1 §11.6 pattern).

### 5.2 Map 3 — `drop_map3_normal_v1` / `_elite_v1` / `_boss_v1`

**Normal** (`drop_map3_normal_v1`):

| มอน | Main material | % | Qty | Secondary | Potion % | Common gear | Uncommon gear |
|---|---|---:|---:|---|---:|---:|---:|
| gnawing_root | `mat_old_root_scrap` | 70 | 1–2 | — | 5 | `pool_map3_common_gear` 18% | — |
| shadow_monkey | `mat_shadow_pelt` | 65 | 1–2 | — | 6 | `pool_map3_common_gear` 20% | — |
| walking_stone | `mat_mossless_shard` | 55 | 1 | `mat_old_root_scrap` 22% ×1 | 5 | `pool_map3_common_gear` 16% | `pool_map3_uncommon_gear` 7% |

**Elite** (`drop_map3_elite_v1`, `elite_map3_mossless_stone`) — guaranteed: `mat_mossless_shard` ×2–4, `mat_shadow_pelt` ×1–2. Rolls: `pool_map3_uncommon_gear` 60% · `pool_map3_rare_gear` 10% · `con_small_potion` 25% ·1–2. (hidden elite, respawn 6.5m).

**Boss** (`drop_map3_boss_v1`, `boss_map3_nameless_warden`) — guaranteed: `mat_nameless_marker_stone` ×2–4, `pool_map3_uncommon_gear` ×1, `con_small_potion` ×3–5. Rolls: `pool_map3_rare_gear` 22% ·1. Reinforcement boss-only (§4/Q3). First-kill bonus.

### 5.3 Map 4 — `drop_map4_normal_v1` / `_elite_v1` / `_boss_v1`

**Normal** (`drop_map4_normal_v1`):

| มอน | Main material | % | Qty | Secondary | Potion % | Common gear | Uncommon gear |
|---|---|---:|---:|---|---:|---:|---:|
| moonlight_wisp | `mat_moonlight_residue` | 68 | 1–2 | — | 6 | `pool_map4_common_gear` 18% | — |
| dream_mushroom | `mat_dream_cap` | 70 | 1–2 | — | 6 | `pool_map4_common_gear` 20% | — |
| shadow_deer | `mat_shadow_dew` | 55 | 1 | `mat_moonlight_residue` 22% ×1 | 5 | `pool_map4_common_gear` 16% | `pool_map4_uncommon_gear` 8% |

**Elite** (`drop_map4_elite_v1`, `elite_map4_shattered_moon_deer`) — guaranteed: `mat_shadow_dew` ×2–4, `mat_dream_cap` ×1–2. Rolls: `pool_map4_uncommon_gear` 60% · `pool_map4_rare_gear` 12% · `con_small_potion` 30% ·1–2. (respawn 7m).

**Boss** (`drop_map4_boss_v1`, `boss_map4_moondark_dryad`) — guaranteed: `mat_moondark_sap` ×2–4 (Rare), `pool_map4_rare_gear` ×1, `con_small_potion` ×3–5. Rolls: `pool_map4_rare_gear` 25% ·1 (เพิ่ม), `pool_map4_epic_gear` 6% ·1 (Epic ตัวแรกในเนื้อหา normal — ปิดแบนด์ lv22). Reinforcement boss-only (§4/Q3). First-kill bonus (ค่าสูงสุดของ 3 แมพ).

> **Rarity discipline (§5.3 Map1):** normal monster ห้ามดรอป Epic/Legendary · Epic เริ่มเฉพาะ Map4 boss (`pool_map4_epic_gear` 6%). Legendary = ยังไม่มีในเนื้อหา lv≤22.

---

## 6. Bot-Safe Pocket Designation

> §8.1: bot-safe = density ปานกลาง, respawn พอดี, safe กลับเมืองชัด, **ไม่เข้า risk/secret/event/boss โดยไม่ตั้งค่า**. boss/secret/event pocket = **forbidden เสมอ**. อ้าง Farming Route + Secret/Event ของ layout bible.

| Map | Bot-ALLOWED pocket | Bot-FORBIDDEN pocket | เหตุผล |
|---|---|---|---|
| 2 ถนนชายไร่ | C ทุ่งฟาง (pack หลัก) · W แปลงเห็ด · E คันนา/หนูนา (Route 1 + Route 2 material) | S Boss field · NE ตะกร้าเด็ก (secret, weekly/คืนจันทร์เว้า) · C event "ฟางสั่นพ้อง" (wave) | route หลักชัด กลับ NE safe point ง่าย; boss/secret/event = human-only |
| 3 ทางป่าเก่า | C ทางป่าเก่า · SW ค่ายพราน edge · E สะพานไม้ (Normal route SW→C→E→C→SW) | NE hidden หินไร้ตะไคร่ (secret route + hidden elite) · SE Boss arena | minimap แสดงทางหลักเท่านั้น (§Design Notes) — bot ห้ามลง secret layer; hidden elite = community discovery |
| 4 ป่าจันทร์เงา | W บ่อน้ำจันทร์ · C ป่าหมอก/เห็ดฝัน · E ทุ่งกวางเงา (Loop SW→W→C→E→NE→C→SW ตัด NE) | NE กระจกน้ำ (secret/lore) · S Boss grove · หมอก Event (wave) | loop density ปานกลาง กลับ SW safe pavilion; NE secret + boss + event = forbidden |

Bot output guardrail (§8.4) log ต่อ route: gold/hr, item/hr, kill/hr, route, skill/potion usage, density จริง — เหมือน Map 1.

---

## 7. คำถามให้ owner เคาะ (economy/monetization-gated — ยังต้องเคาะแม้ delegated · v15 §53)

> เนื้อหา identity/stat/reward/drop/material/bot = ผลิตเสร็จตาม delegation 2026-07-14 (LOCKED for implementation). แต่หัวข้อด้านล่างแตะ EXP curve / reinforcement drop / equipment master = ต้องให้ owner ตัดสิน (แต่ละข้อมี "แนะนำ + เหตุผล"):

- **Q1 — EXP-to-next curve lv11–22 (ยังไม่มี)** · Map1 §9.2 จบที่ lv10 (cumulative 7,440). Maps 2–4 ต้องมี curve ต่อ. **แนะนำ:** ต่อ curve เดิมด้วยอัตราเร่งเดียวกัน (แต่ละ level EXP-to-next ×~1.24 ต่อยอด lv9→10) → ยกร่างเป็นตารางแยกเมื่อ owner โอเคทิศทาง. **เหตุผล:** per-kill EXP §2 คิดจากอัตรานี้อยู่แล้ว ถ้า curve เพี้ยน จำนวน kill/level จะหลุด band 20–40 kills.
- **Q2 — Equipment Item Master ของ Map 2–4** · เอกสารนี้อ้าง `pool_mapN_*` แต่ยังไม่ mint item id/stat จริง. **แนะนำ:** ผลิต extension แยก (mirror Map1 §7.2–7.6) ต่อจาก brief นี้ — 4–5 ชิ้น/slot/แมพ, stat ต่อ curve rarity §5.2. **เหตุผล:** drop table ใช้งานได้แล้วด้วย pool; แยก item master ออกทำให้ไฟล์นี้ไม่บวมและ balance gear ทำเป็นชุดได้.
- **Q3 — Reinforcement (เสริมแกร่ง) drop ของ boss Map 2–4** · ใช้ 8% + pity 15 เท่า Map1 boss ทุกตัว หรือสเกลตาม band? **แนะนำ:** คง 8%+pity15 เท่ากันทุกบอส (rate เดียวทั้งเกม, ปรับที่ config). **เหตุผล:** reinforcement เป็นคันโยก economy กลาง (§53) — ให้ rate เดียวคุมง่าย/กัน inflation; ถ้าต้องเร่ง late-game ค่อยเพิ่ม pity หรือ boss-material→exchange แทนการดัน %.
- **Q4 — `aggroRadius`/`leashRadius`** อยู่ใน D-055 §9.3 แต่ยังไม่มีใน `MobCombatStats` interface (`combat.ts`). **แนะนำ:** tech เพิ่ม 2 field ผ่าน §59.4 (ค่าในตาราง §3 พร้อมแล้ว). **เหตุผล:** ค่าถูกออกแบบไว้แล้ว, การไม่มี field ทำให้ leash/aggro ใช้ default เดียวทั้งเกม = chase/pull เพี้ยนต่อ archetype.
- **Q5 — Map 1 boss id conflict** (นอกสโคป, พบระหว่างทำงาน) · `boss_map1_resonant_guardian` (Economy/Reinforcement doc) vs `boss_map1_boiling_boar` (combat.ts/current-state). **แนะนำ:** owner เคาะ canonical ตัวเดียว → ทำ decision-record + supersede. **เหตุผล:** save data lock id; ต้องปิดก่อน Map 1 boss ขึ้น production (P2B).
- **Q6 — mid-tier potion** · band lv8–22 damage สูงขึ้น `con_small_potion` (heal 35%) อาจไม่พอ. **แนะนำ:** เพิ่ม `con_medium_potion` (heal ~45%, req.lv 8) เข้า drop pool Map 2–4 + starter shop Map 2. **เหตุผล:** potion ต้อง "ต้องใช้แต่ไม่กิน gold ส่วนใหญ่" (Map1 §3.2) — ค่า heal/ราคา = knob รอเคาะ.
