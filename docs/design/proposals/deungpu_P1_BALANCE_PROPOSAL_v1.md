# ดึ๋งปุ๊ — P1 Balance Proposal v1

> **สถานะ: ✅ APPROVED — P2 production baseline (owner เคาะ 2026-07-12 ผ่าน Production Bible Set v1, Bible 1.1–1.6)**
> เงื่อนไขที่ owner แนบตอนรับรอง: ล็อก **progression shape** มากกว่าเลขรายเลเวล (HP/DEF เด่น, ATK กลางสูง, crit ไม่พุ่งเร็ว) · lv1 ห้ามตายง่ายจากมอนปกติ 2–3 ตัว · lv10 ต้องรู้สึกเก่งขึ้นชัดแต่ไม่ล้าง Elite ด้วย basic attack · นกจิกปุ๊/หมูป่าต้องมี stat row แยกก่อน P2 content freeze · kill time เป้าหมาย: normal 2–5s, tanky 4–8s, elite 15–30s solo, field boss แรก 2–4 นาที solo · k ขยับช่วง 40–60 ได้ไม่ถือว่าเปลี่ยนสูตร
> ค่าทั้งหมดยังเป็น **Design Knob (§48)** ใน versioned config — tune ผ่าน telemetry + decision record, ห้ามแก้เงียบในโค้ด
>
> ~~สถานะเดิม: PROPOSAL / PENDING OWNER~~ (ประวัติ: ใช้เป็น draft ให้เกมเดินได้ตลอด P1 ตามมติ decision-index 2026-07-12)
>
> _ร่างโดย: deep-worker · วันที่ 2026-07-12 · scope: P1 (นักดาบ vertical ก่อน, อีก 4 อาชีพ draft พอเติม config)_

## หลักการตั้งเลข (อ่านก่อนดูตาราง)

1. **ยึดฟีล GS 3 ชั้น (§18.1)** — ชั้น 1 "มือใหม่ก็สะใจ": AoE ต้นเกมกวาด pack ได้ตั้งแต่ level ต่ำ · ชั้น 2 คุมตำแหน่ง/รวบมอนดีเห็นเลขมากกว่า · ชั้น 3 endgame (ไม่อยู่ใน P1)
2. **ทุกค่าคือ knob ปรับได้** — เอกสารนี้เสนอ *default + range + เหตุผล* ไม่ได้ freeze
3. **เลขกลม อ่านง่าย** — level growth เป็นขั้นสม่ำเสมอ, ตัวคูณลงตัว
4. **สูตรจริงเป็นของ server** (TA §15.6) — client ไม่มีสูตร damage; เอกสารนี้ป้อน default ให้ config loader (P1-04/P1-05)
5. **spec-first** — field names ทุกตัวตาม checkpoint **§50.1 เป๊ะ** (ดูรายการยืนยันท้ายเอกสาร); ไม่มีการเพิ่ม semantic field ใหม่

---

# 1. ค่า k — สูตร Damage (knob สำคัญที่สุด)

สูตร (TA §15.2, locked):

```
DMG_base       = ATK × baseMultiplier × [ k / (k + effective_DEF) ]
effective_DEF  = max(0, target_DEF − attacker_Penetration)
ถ้า crit       : DMG = DMG_base × (1 + Crit_DMG)          # Crit_DMG ฐาน +50% (TA §15.3 locked)
ปรับต่อ        : × bossModifier (ถ้า target เป็น boss) × tierReduction (§15.5) × pvpModifier (PvP)
```

## 1.1 Knob: `combat.k` (template §48.1)

| ช่อง | ค่า |
|---|---|
| **Knob Name** | `combat.k` (global damage-diminishing constant) |
| **Category** | Combat (§48.2) |
| **Design Intent** | ตัวเดียวปรับความ "อึด" ของทั้งเกม — DEF ลด damage เป็น % ไม่มีวันเป็น 0/ติดลบ (§15.2) |
| **Default (เสนอ)** | **50** |
| **Allowed Range** | **30 – 80** |
| **Owner** | Design/Owner |
| **Tech Requirement** | อ่านจาก versioned config (§10) · server-only · เปลี่ยนค่า = live-tunable ไม่ rebuild |
| **Telemetry** | kill/min ต่อ map, avg hits-to-kill ต่อ mob type, TTK boss |
| **Guardrail** | ดู §4 (farming ไม่ชนะ boss, AoE ไม่ one-shot elite) |
| **Rollback** | ใช่ — knob เดียวกระทบทั้งเกม |

## 1.2 เหตุผลของ k = 50

**Anchor ที่จำง่าย:** เมื่อ `effective_DEF = k` → factor = k/(k+k) = **0.5 พอดี** (DEF ลด damage ครึ่งหนึ่ง).
ดังนั้น k = 50 หมายความว่า "มอน/ผู้เล่นที่ DEF = 50 กันได้ครึ่ง". ในช่วง P1 (Map 1, DEF มอน 4–25) damage ยัง *ผ่านทะลุเยอะ* → ฟีล "สะใจ กวาดได้" ตรงชั้น 1; ปลายเกม DEF พุ่งเป็นร้อย ค่อยเริ่มอึด — ตรงเจตนา multiplicative diminishing (§15.2 กันพังปลายเกมแบบ subtractive).

**ทำไมไม่ต่ำกว่านี้ (k<30):** DEF จะสำคัญเกินไปเร็วเกิน → มอน DEF น้อยก็อึด, ต้นเกมตีเจ็บ, ขัดชั้น 1.
**ทำไมไม่สูงกว่านี้ (k>80):** DEF แทบไม่มีผลต้น–กลางเกม → build ตันกับ Penetration/DEF ไม่มีความหมาย, combat แบน (ขัด §18.2).

## 1.3 ตาราง mitigation factor `k/(k+DEF)` ที่ k=50

| effective_DEF | 0 | 4 | 8 | 10 | 15 | 20 | 25 | 30 | 50 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| factor | 1.000 | 0.926 | 0.862 | 0.833 | 0.769 | 0.714 | 0.667 | 0.625 | 0.500 |

## 1.4 ตัวอย่าง damage จริง (นักดาบ · สกิล คลื่นดาบราชันย์ baseMultiplier 2.2)

DMG = ATK × 2.2 × factor(DEF) · ยังไม่รวม crit

| player lv (ATK) | vs ดึ๋งปุ๊ DEF4 (HP45) | vs หมูพอง DEF10 (HP130) | ฟีล |
|---|--:|--:|---|
| 1 (12) | 24 → ~2 สแลชคลีน | 22 → ~6 hit | มือใหม่กวาด slime ได้ทันที |
| 3 (18) | 37 → crit ตัวเดียวจบ | 33 → ~4 hit | สกิลปลด, สะใจขึ้น |
| 5 (24) | 49 → 1 hit บ่อย | 44 → 3 hit | pack slime ละลาย |
| 10 (40) | 82 → 1 hit เสมอ | 73 → 2 hit | สวีปเดียวเคลียร์แถว |

> อ่านออกทันทีว่า slime = "ขยะกวาดสนุก", หมูพอง = "ตัวอึดต้องตั้งใจ" — โดยไม่ต้องมี elite tag. นี่คือผลของ k เดียว + DEF ต่างกัน.

**Range ที่ปรับได้ระหว่างเทสต์:** ถ้ารู้สึกอืด → ขึ้น k เป็น 60–70 หรือขึ้น baseMultiplier; ถ้าละลายไวเกิน → ลด k เป็น 35–45 หรือเพิ่ม DEF มอน. แนะปรับ **k ก่อน** เพราะเห็นผลทั้ง map.

---

# 2. Stat Baseline

## 2.1 ผู้เล่น นักดาบ level 1–10 (10 stats — TA §15.1)

**Core (โชว์ตั้งแต่ต้น — progressive reveal §15.1):**

| lv | HP | ATK | DEF | Speed* |
|--:|--:|--:|--:|--:|
| 1 | 100 | 12 | 8 | 100 |
| 2 | 120 | 15 | 9 | 100 |
| 3 | 140 | 18 | 11 | 100 |
| 4 | 160 | 21 | 12 | 100 |
| 5 | 180 | 24 | 14 | 100 |
| 6 | 200 | 27 | 15 | 100 |
| 7 | 220 | 30 | 17 | 100 |
| 8 | 240 | 33 | 18 | 100 |
| 9 | 260 | 36 | 20 | 100 |
| 10 | 280 | 40 | 22 | 100 |

growth ต่อ level (knob): HP **+20**, ATK **+3**, DEF **+~1.5** (ปัดเลขกลม)

**Secondary (ปลดตาม progressive reveal — default P1):**

| stat | ค่าฐาน | หมายเหตุ |
|---|--:|---|
| Crit Rate | 5% | roll < rate → crit |
| Crit DMG | +50% | **locked TA §15.3** — ฐานทุกอาชีพ |
| Accuracy | 100 | vs mob evasion (P1 มอน evasion 0 → ตีโดนเสมอ) |
| Penetration | 0 | ลด effective_DEF; โตจาก gear ภายหลัง (P1 = 0) |
| CDR | 0% | ลด cooldown; P1 ยังไม่มี source |
| Break Power | 10 | ทุบ boss guard gauge (§15.4); มีผลเฉพาะ vs boss |

> *Speed = action/attack-speed index (ฐาน 100). **ความเร็วเดิน tiles/s เป็น engine config แยก** (`playerConfig`, ~3.2 tiles/s) ไม่ใช่ stat นี้ — กันสับสน.
> อาชีพอื่น: ใช้โครง growth เดียวกัน ปรับ **weight** — เช่น นักธนู ATK สูง/HP ต่ำ, นักเวท ATK สูงสุด/DEF ต่ำสุด, นักหอก สมดุล, นักอาคม HP กลาง. เสนอเป็น per-class multiplier ใน §5 (draft).

## 2.2 มอน Map 1 / P0 Test Field (HP/ATK/DEF)

| mob | tier | HP | ATK | DEF | tierReduction (§15.5) | intent |
|---|---|--:|--:|--:|--:|---|
| **ดึ๋งปุ๊** (เมือกดึ๋ง) | normal-swarm | 45 | 6 | 4 | 1.00 | ขยะกวาด — ตาย 1–2 สวีป |
| **หมูพอง** (หนังหมูพอง) | normal-tough | 130 | 11 | 10 | 1.00 | ตัวอึดในฝูง — ต้องตั้งใจ |
| ดึ๋งปุ๊จอมพลัง | elite (occasional) | 380 | 16 | 14 | **0.80** | ช้ากว่ามอนปกติชัดเจน (guardrail §4) |
| **หมูป่าหม้อเดือด** (Map 1 boss §4/§56.5) | field boss | 2500 | 28 | 25 | **0.65** | + guard gauge (§15.4) — ต้อง single-target |

- `tierReduction` = Monster knob (§48.3-adjacent, ผูก §15.5) — ตัวคูณ damage ขาเข้าตาม tier; **normal = 1.0** เสมอ, elite/boss < 1 เพื่อกัน AoE ล้าง (§48.9).
- Map 1 density target = **6–12/จอ** (§56.5), pack size 4–6 (§18.1) → AoE maxTargets 4–6 (§56.4 early) พอดี pack.
- มอน ATK ใช้กับสูตรเดียวกันตี player: DMG = mobATK × 1.0 × [k/(k+playerDEF)]. เช่น slime ATK6 vs นักดาบ lv5 DEF14 → 6×0.781 ≈ 5/ตี (player HP 180 → ทนได้สบายในฝูง แต่หมูพอง ATK11 เริ่มเจ็บ) — ให้ฟีล "ฝูงเล็กไม่กลัว แต่ตัวอึด/หลายตัวต้องระวัง".

---

# 3. ตาราง Skill 5 อาชีพ (fields §50.1)

**Convention (ทุก skill):** range/radius = tiles · angle = degrees · cooldown/castTime/activeTime/recoveryTime = วินาที · `scalingStat: ATK` (P1 ทุกอาชีพ scale ATK; ยังไม่มี stat เวทแยก) · `serverAuthority: true` เสมอ · `pvpModifier: 1.0` (PvP ไม่อยู่ใน P1 — flag §6) · `resourceCost: 0` (**ดู flag §6.1 — 10-stat list ไม่มี resource pool**) · cue fields = ชื่อ asset placeholder (ยังไม่มี asset จริง).

## 3.1 นักดาบ (ละเอียดสุด — P1 implement ก่อน)

### S1 — ฟันดาบสามัญ (basic attack)

```yaml
skillId: sword_basic_slash
skillName: ฟันดาบสามัญ          # basic auto-attack, generic — ชื่อ placeholder PENDING OWNER
class: swordsman
branch: null                    # basic attack ไม่ผูก branch (§8 มี 3 branch สำหรับสกิลปลด)
tier: 0                         # basic
unlockLevel: 1
role: basic single / short cleave
description: ฟันดาบระยะประชิด เป็นการโจมตีพื้นฐาน
targetType: enemy
targetShape: arc               # หน้าแคบ
range: 1.2
radius: null
angle: 60
maxTargets: 2                  # ปะทะ 1–2 ตัวหน้า
hitCount: 1
damageType: physical           # P1 ยังไม่มี resist split — cosmetic (flag §6)
baseMultiplier: 1.0
scalingStat: ATK
cooldown: 0.6                  # attack interval
castTime: 0.1
activeTime: 0
recoveryTime: 0.2
resourceCost: 0
statusEffects: null
crowdControl: null
bossModifier: 1.0
pvpModifier: 1.0
comboTags: [opener]
animationCue: sword_slash_basic       # placeholder
vfxCue: fx_slash_white                 # placeholder
sfxCue: sfx_sword_light                # placeholder
damageNumberProfile: standard
screenShakeLevel: 0
hitStopLevel: 0
botUsageRule: ใช้เป็น default เมื่อมีเป้าหมายเดียวหรือ AoE cooldown
serverAuthority: true
performanceBudget: low
```

### S2 — คลื่นดาบราชันย์ (AoE farming · Solo/Farming branch · signature §50.2)

```yaml
skillId: sword_royal_wave
skillName: คลื่นดาบราชันย์
class: swordsman
branch: solo_farming            # §8 branch 1
tier: 1
unlockLevel: 3
role: AoE farming / frontal clear     # ตรง §50.2
description: ฟันทีเดียวกวาดทั้งแถวด้านหน้า
targetType: enemy
targetShape: cone               # cone/wide line (§50.2)
range: 3.5
radius: null
angle: 90
maxTargets: 6                  # early AoE 4–6 (§56.4) → พอดี pack Map 1
hitCount: 1
damageType: physical
baseMultiplier: 2.2            # หัวใจฟีล "กวาดแถว" — ดู §1.4
scalingStat: ATK
cooldown: 4.0
castTime: 0.25
activeTime: 0
recoveryTime: 0.3
resourceCost: 0
statusEffects: null
crowdControl: null
bossModifier: 0.5             # farming ต้องแพ้ single-target vs boss (§4/§48.9)
pvpModifier: 1.0
comboTags: [aoe, sweep]
animationCue: sword_wave_wide
vfxCue: fx_slash_arc_gold
sfxCue: sfx_sword_sweep
damageNumberProfile: standard
screenShakeLevel: 1
hitStopLevel: 1
botUsageRule: ใช้เมื่อมีมอน 5+ ตัวด้านหน้า (§50.2)
serverAuthority: true
performanceBudget: medium
```

### S3 — ดาบสุริยะผ่าเมือง (boss / single-target · Party/Boss branch)

```yaml
skillId: sword_solar_cleave
skillName: ดาบสุริยะผ่าเมือง
class: swordsman
branch: party_boss             # §8 branch 2
tier: 1
unlockLevel: 5
role: single-target burst / boss     # คู่เทียบ guardrail กับ S2
description: อัดพลังฟันเดี่ยวเจาะเป้าหมายหนัก เหมาะกับ boss
targetType: enemy
targetShape: line              # เจาะแนวสั้น เน้นเป้าหน้า
range: 2.5
radius: null
angle: 20
maxTargets: 1
hitCount: 1
damageType: physical
baseMultiplier: 3.5           # สูงกว่า S2 ต่อเป้า — ชนะ boss
scalingStat: ATK
cooldown: 6.0
castTime: 0.4
activeTime: 0
recoveryTime: 0.35
resourceCost: 0
statusEffects: null
crowdControl: null
bossModifier: 1.2             # โบนัส vs boss → single-target ชนะชัด (§4)
pvpModifier: 1.0
comboTags: [burst, boss]
animationCue: sword_solar_thrust
vfxCue: fx_solar_pierce
sfxCue: sfx_sword_heavy
damageNumberProfile: emphasis
screenShakeLevel: 2
hitStopLevel: 2
botUsageRule: ใช้กับ boss/elite หรือเป้าหมายเดี่ยว HP สูง; ห้ามสาดใส่ trash
serverAuthority: true
performanceBudget: medium
```

### S4 — ดาบกางอาณาเขต (utility · Utility branch)

```yaml
skillId: sword_guard_domain
skillName: ดาบกางอาณาเขต
class: swordsman
branch: utility                # §8 branch 3
tier: 1
unlockLevel: 5
role: self-guard / taunt
description: กางเขตป้องกัน ดึง aggro รอบตัวและลด damage ที่รับช่วงสั้น
targetType: self
targetShape: circle            # aura รอบตัว
range: 0
radius: 3.0
angle: null
maxTargets: 8                 # จำนวนมอนที่ taunt ได้
hitCount: 0                   # ไม่ทำ damage
damageType: null              # utility ไม่มี damage — default
baseMultiplier: 0             # ไม่ทำ damage
scalingStat: null
cooldown: 12.0
castTime: 0.2
activeTime: 4.0              # ระยะ buff
recoveryTime: 0.2
resourceCost: 0
statusEffects: [self_damage_reduction_30]   # ลด damage รับ 30% (knob)
crowdControl: taunt
bossModifier: 1.0            # taunt vs boss = knob (boss อาจ immune — flag)
pvpModifier: 1.0
comboTags: [defensive]
animationCue: sword_guard_stance
vfxCue: fx_domain_ring
sfxCue: sfx_guard_up
damageNumberProfile: none
screenShakeLevel: 0
hitStopLevel: 0
botUsageRule: ใช้เมื่อ HP < 40% หรือถูกรุมเกิน 4 ตัว
serverAuthority: true
performanceBudget: low
```

## 3.2 นักหอก (draft — เติม config ได้)

| field | S1 basic | S2 AoE farming | S3 utility |
|---|---|---|---|
| skillId | spear_basic_thrust | spear_pierce_line | spear_pin_root |
| skillName | แทงหอกสามัญ¹ | แทงทะลุแนว | หอกปักตรึง |
| branch | null | solo_farming | utility |
| tier / unlockLevel | 0 / 1 | 1 / 3 | 1 / 5 |
| role | basic single | AoE line pierce | control / root |
| targetType | enemy | enemy | enemy |
| targetShape | line | line (ยาว) | point |
| range | 1.6 | 5.0 | 3.0 |
| radius / angle | null / 12 | null / 10 | null / null |
| maxTargets | 2 | 6 | 1 |
| hitCount | 1 | 1 | 1 |
| damageType | physical | physical | physical |
| baseMultiplier | 1.0 | 2.0 | 1.4 |
| scalingStat | ATK | ATK | ATK |
| cooldown | 0.6 | 4.5 | 8.0 |
| castTime | 0.15 | 0.3 | 0.25 |
| activeTime / recoveryTime | 0 / 0.2 | 0 / 0.3 | 0 / 0.2 |
| resourceCost | 0 | 0 | 0 |
| statusEffects | null | null | null |
| crowdControl | null | null | root 1.5s |
| bossModifier | 1.0 | 0.5 | 1.0 |
| pvpModifier | 1.0 | 1.0 | 1.0 |
| comboTags | [opener] | [aoe,pierce] | [control] |
| animationCue | spear_thrust | spear_pierce_long | spear_pin |
| vfxCue | fx_thrust | fx_pierce_line | fx_pin_ground |
| sfxCue | sfx_spear_light | sfx_spear_pierce | sfx_spear_pin |
| damageNumberProfile | standard | standard | standard |
| screenShakeLevel | 0 | 1 | 1 |
| hitStopLevel | 0 | 1 | 1 |
| botUsageRule | default single | มอน 4+ เรียงแนว | ใช้หยุด elite/ตัวอันตราย |
| serverAuthority | true | true | true |
| performanceBudget | low | medium | low |

¹ basic ชื่อ placeholder PENDING OWNER · fields ที่เหลือ (description/comboTags แสดงแล้ว) ค่าเดียวกับแม่แบบ §3.1.

## 3.3 นักธนู (draft)

| field | S1 basic | S2 AoE farming | S3 utility |
|---|---|---|---|
| skillId | archer_basic_shot | archer_moon_rain | archer_target_mark |
| skillName | ยิงธนูสามัญ¹ | ฝนศรจันทร์ | ศรตราเป้า |
| branch | null | solo_farming | utility |
| tier / unlockLevel | 0 / 1 | 1 / 3 | 1 / 5 |
| role | basic fast single | AoE multi-hit rain | debuff mark (+dmg taken) |
| targetShape | line | circle (ground) | point |
| range | 5.0 | 6.0 | 6.0 |
| radius / angle | null / 4 | 2.5 / null | null / null |
| maxTargets | 1 | 6 | 1 |
| hitCount | 1 | **3** (multi-hit — ฟีลเลขเด้งรัว §17.6) | 1 |
| baseMultiplier | 1.0 | **0.9 ต่อ hit** (×3 ≈ 2.7 รวม) | 1.0 |
| scalingStat | ATK | ATK | ATK |
| cooldown | 0.5 | 5.0 | 9.0 |
| castTime | 0.2 | 0.4 | 0.2 |
| bossModifier | 1.0 | 0.5 | 1.0 |
| crowdControl | null | null | null |
| statusEffects | null | null | mark_dmg_taken_+15% 6s |
| damageNumberProfile | standard | compact multi-hit | standard |
| screenShakeLevel / hitStopLevel | 0 / 0 | 1 / 0 | 0 / 0 |
| botUsageRule | default single | มอน 4+ รวมกลุ่ม | mark boss/elite ก่อน burst |
| performanceBudget | low | medium (pooled proj) | low |

¹ ฟิลด์อื่น (resourceCost 0, pvpModifier 1.0, serverAuthority true, cue placeholder, activeTime 0) ตามแม่แบบ §3.1. **multi-hit note:** damage number aggregate ต่อ mob (§56.4) — ยิง 3 hit แต่รวมเลขได้.

## 3.4 นักเวท (draft)

| field | S1 basic | S2 AoE farming | S3 utility/unique |
|---|---|---|---|
| skillId | mage_basic_bolt | mage_crystal_storm | mage_rift_open |
| skillName | กระสุนมนตราสามัญ¹ | พายุผลึก | เปิดฟ้ารอยแยก |
| branch | null | solo_farming | utility |
| tier / unlockLevel | 0 / 1 | 1 / 3 | 1 / 5 |
| role | basic magic single | AoE multi-hit (§50.3) | delayed AoE / control |
| targetShape | line | circle (ground) | circle (ground) |
| range | 5.5 | 6.0 | 6.0 |
| radius / angle | null / null | 3.0 / null | 3.0 / null |
| maxTargets | 1 | 6 | 6 |
| hitCount | 1 | **multi (4)** | 1 (ระเบิดหน่วง) |
| damageType | magic | magic | magic |
| baseMultiplier | 1.1 | **0.7 ต่อ hit** (×4 ≈ 2.8) | 1.8 |
| scalingStat | ATK | ATK | ATK |
| cooldown | 0.7 | 5.5 | 10.0 |
| castTime | 0.3 | 0.5 | 0.5 |
| activeTime | 0 | 1.0 (ผลึกตกต่อเนื่อง) | 1.5 (หน่วงก่อนระเบิด) |
| bossModifier | 1.0 | 0.5 | 0.6 |
| crowdControl | null | null | slow 40% 3s |
| statusEffects | null | null | slow |
| damageNumberProfile | standard | compact multi-hit (§50.3) | standard |
| screenShakeLevel / hitStopLevel | 0 / 0 | 2 / 0 | 2 / 1 |
| botUsageRule | default single | มอนกลุ่มใหญ่ 5+ | ใช้ตอนมอนรวมตัว, คุมก่อน |
| performanceBudget | low | **high** (pooled particle, capped §50.3) | high |

¹ ฟิลด์อื่นตามแม่แบบ. **damageType: magic** — P1 ยังไม่มี resist แยก physical/magic → เป็น cosmetic/label ก่อน (flag §6).

## 3.5 นักอาคม / ผู้ผนึก (draft)

| field | S1 basic | S2 AoE farming | S3 utility/control |
|---|---|---|---|
| skillId | seal_basic_talisman | seal_silent_circle | seal_stagger_ward |
| skillName | ยันต์สามัญ¹ | วงอาคมไร้เสียง | ยันต์ชะงัก |
| branch | null | solo_farming | utility |
| tier / unlockLevel | 0 / 1 | 1 / 3 | 1 / 5 |
| role | basic magic single | delayed AoE / control (§50.4) | stun / seal |
| targetShape | line | circle (ground) | circle (ground) |
| range | 5.0 | 6.0 | 4.0 |
| radius / angle | null / null | 3.5 / null | 2.5 / null |
| maxTargets | 1 | 6 | 5 |
| hitCount | 1 | 1 (ระเบิดหลังหน่วง) | 1 |
| damageType | magic | magic | magic |
| baseMultiplier | 1.0 | 2.4 | 1.2 |
| scalingStat | ATK | ATK | ATK |
| cooldown | 0.7 | 6.0 | 9.0 |
| castTime | 0.3 | 0.4 | 0.3 |
| activeTime | 0 | 1.5 (หน่วง seal → ระเบิด) | 0 |
| bossModifier | 1.0 | 0.5 | 1.0 |
| crowdControl | null | seal_mark → slow (§50.4) | stun 1.2s |
| statusEffects | null | slow 30% | seal |
| damageNumberProfile | standard | standard | standard |
| screenShakeLevel / hitStopLevel | 0 / 0 | 1 / 1 | 1 / 1 |
| botUsageRule | default single | ใช้ตอนมอนรวมตัวเกิน 5 (§50.4) | หยุด elite/มอนอันตราย |
| performanceBudget | low | medium | medium |

¹ ฟิลด์อื่นตามแม่แบบ.

> **Ultimate/Awakening (§17.7)** ของทุกอาชีพ (ดาบผนึกฟ้า ฯลฯ) = charge-based, effect ใหญ่, maxTargets 8–12 (§56.4 early) — **ไม่อยู่ใน proposal นี้** (P1 starter 3 branch ก่อน); เสนอแยกรอบถัดไป.

---

# 4. Guardrail Check ต่อ knob (§48.9 / §15.5 / §56.4)

## 4.1 Farming skill ห้ามชนะ boss skill ต่อเดี่ยว ✅

เทียบที่ **นักดาบ lv10 ATK40** vs หมูป่าหม้อเดือด (DEF25 → factor 0.667, tierReduction 0.65, HP 2500):

| skill | สูตร | dmg/cast ต่อ boss | casts ถึงตาย |
|---|---|--:|--:|
| คลื่นดาบราชันย์ (farming, bossMod 0.5) | 40×2.2×0.667×0.65×0.5 | **19** | ~132 |
| ดาบสุริยะผ่าเมือง (boss, bossMod 1.2) | 40×3.5×0.667×0.65×1.2 | **73** | ~35 |

single-target เร็วกว่า ~3.8× → **guardrail ผ่าน** (bossModifier + baseMultiplier ต่างกันบังคับ intent). ปรับความชัดได้ผ่าน `bossModifier` ของ farming (ลดต่ำกว่า 0.5 ยิ่งห้ามชัด).

## 4.2 AoE สะใจแต่ไม่ one-shot elite ✅

นักดาบ คลื่นดาบราชันย์ vs ดึ๋งปุ๊จอมพลัง (elite DEF14→factor 0.781, tierReduction 0.8, HP 380):

| player lv | dmg/hit ต่อ elite | hits ถึงตาย |
|--:|--:|--:|
| 5 (24) | 24×2.2×0.781×0.8 = **33** | ~12 |
| 10 (40) | 40×2.2×0.781×0.8 = **55** | ~7 |

ไม่มีทาง one-shot (ต่ำสุด 7 hit) แต่มอนปกติ (tierReduction 1.0) ตาย 1–2 hit → **แยกฟีล "กวาดฝูง" ออกจาก "elite ต้องช้ากว่า" ตาม §15.5/§48.9** ผ่าน `tierReduction` อย่างเดียว (ไม่ต้องแก้สกิล).

## 4.3 maxTargets ตาม §56.4 ✅

ทุก AoE farming ตั้ง `maxTargets: 6` = ปลาย early-range (4–6). Map 1 pack 4–6 ตัว/density 6–12 → กวาด pack เดียวจบ สะใจ แต่ไม่ลากทั้งจอ. Utility (taunt/seal) maxTargets 5–8 ตาม intent. ไม่มีสกิล starter เกิน early cap.

---

# 5. สรุปสิ่งที่ owner ต้องเคาะ (checklist)

- [ ] **[1] ค่า k = 50** (range 30–80) — knob ความอึดทั้งเกม (§1)
- [ ] **[2] Player stat baseline นักดาบ lv1–10** + growth (HP+20/ATK+3/DEF+1.5) (§2.1)
- [ ] **[3] Player per-class weight** อีก 4 อาชีพ (นักธนู ATK↑HP↓ ฯลฯ) — §2.1 note (ยังไม่เสนอเลข รอเคาะ direction)
- [ ] **[4] มอน Map 1: ดึ๋งปุ๊ / หมูพอง / elite / boss** (HP/ATK/DEF/tierReduction) (§2.2)
- [ ] **[5] tierReduction ต่อ tier** (normal 1.0 / elite 0.8 / field boss 0.65) — knob §15.5
- [ ] **[6] ตาราง skill นักดาบ 4 ตัว** (baseMultiplier/cooldown/maxTargets/bossModifier) (§3.1)
- [ ] **[7] ตาราง skill draft อีก 4 อาชีพ** — อนุมัติเป็น draft ให้ตั้ง config หรือขอปรับ (§3.2–3.5)
- [ ] **[8] ⚠ resourceCost / resource pool** — §50.1 มี field `resourceCost` แต่ 10-stat list §15.1 **ไม่มี mana/rage/stamina pool**. P1 นักดาบ vertical รันด้วย **cooldown-only (resourceCost=0)** ได้เลย — แต่ต้องเคาะว่า **จะเพิ่ม resource pool ไหม** และเป็นแบบไหน (ถ้าเพิ่ม = spec update §15.1 + process §59.4)
- [ ] **[9] damageType (physical/magic)** — P1 ยังไม่ split resist → เป็น label. เคาะว่า P1 ให้เป็น cosmetic ก่อน หรือทำ resist ตั้งแต่ต้น
- [ ] **[10] ชื่อ basic attack 5 อาชีพ** (ฟันดาบสามัญ ฯลฯ) — placeholder, ขอชื่อจริง/ยืนยัน
- [ ] **[11] Ultimate skills** — ยืนยันว่าแยกรอบถัดไป (ไม่อยู่ใน proposal นี้)
- [ ] **[12] จุด round ของ multi-hit damage** — สกิล hitCount > 1 (นักธนู/นักเวท §3.3–3.4): ปัดเศษ **ต่อ sub-hit แล้วรวม** (implement ปัจจุบัน P1-05 `computeSkillDamage` — ตรง damage number ต่อ hit เป็น integer) **หรือ** รวม float ก่อนแล้วค่อย round ทีเดียว (ต่างกันเล็กน้อยเชิงตัวเลขเมื่อ baseMultiplier/hit ต่ำ). §15.2 ไม่ครอบจุดนี้ — P1 นักดาบ hitCount=1 ไม่มีผล; เคาะก่อนอาชีพ multi-hit เข้าจริง

> เมื่อ owner เคาะ: อัปเดต checkpoint **§48** (default+range knobs) + **§50.1** (ถ้าเพิ่ม field เช่น resource) ผ่าน process **§59.4**, แล้ว tech ใส่ค่าเข้า config loader (P1-04/P1-05).

---

# Appendix — ยืนยัน field names ตรง §50.1 (37 fields)

ใช้ครบ/ตรงชื่อทุกตัว ไม่ rename ไม่เพิ่ม semantic field:

`skillId` · `skillName` · `class` · `branch` · `tier` · `unlockLevel` · `role` · `description` · `targetType` · `targetShape` · `range` · `radius` · `angle` · `maxTargets` · `hitCount` · `damageType` · `baseMultiplier` · `scalingStat` · `cooldown` · `castTime` · `activeTime` · `recoveryTime` · `resourceCost` · `statusEffects` · `crowdControl` · `bossModifier` · `pvpModifier` · `comboTags` · `animationCue` · `vfxCue` · `sfxCue` · `damageNumberProfile` · `screenShakeLevel` · `hitStopLevel` · `botUsageRule` · `serverAuthority` · `performanceBudget`

field ที่ไม่ relevant ต่อสกิลนั้น = `null` / ค่า default พร้อมหมายเหตุในบล็อก (เช่น utility ไม่มี damage → `baseMultiplier: 0`, `damageType: null`).
