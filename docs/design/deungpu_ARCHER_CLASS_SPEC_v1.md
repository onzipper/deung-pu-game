# ดึ๋งปุ๊ — ARCHER CLASS SPEC (นักธนู) v1

- **status:** LOCKED for implementation (owner-delegated 2026-07-14 — "missing design content = game-designer produces it")
  - โครง/field shape ของ skill = ล็อกให้ implement ได้เลย · **ทุกเลข balance = Design Knob (§48) ยัง PENDING OWNER** (จูนภายหลังผ่าน §59.4 เหมือนชุด warrior)
- **supersedes:** `docs/design/proposals/deungpu_P1_BALANCE_PROPOSAL_v1.md` §3.3 (archer draft S1–S3) — refine + เติม S4
- **relates:** game spec v15 §50.1 (37-field skill schema) · §8 (branch tree) · §15.2/§15.3/§15.5 (damage formula) · §17.6 (class feel) · §48 (Design Knob) · §56.4 (multi-hit aggregate) · D-055 (player curve) · `src/game/skill/data/warrior-skills-{server,client}.ts` (field-shape mirror) · `src/engine/config/combat.ts` (baseline)
- **cite:** class feel = checkpoint §17.6:1092–1101 · stat note = P1_BALANCE §2.1:113 · draft = P1_BALANCE §3.3:343–369 · field schema = `src/game/skill/types.ts` (SKILL_FIELD_NAMES) · client trim = `src/game/skill/views.ts` (SERVER_ONLY_FIELDS)

---

## 1. Class identity (นักธนู) — cite §17.6

> เร็ว ถี่ เลขเด้งรัว สะใจสายยิงเร็ว (§17.6)

1. **ระยะไกล** — poke จากนอกระยะมอน (basic range 5.0, สกิลไกลถึง 6.0) ต่างจากนักดาบที่ต้องประชิด 1.2–3.5.
2. **เร็ว ถี่** — basic cadence 0.45s (เร็วกว่านักดาบ 0.6s) → เลขเด้งถี่กว่าทุกอาชีพ.
3. **multi-hit** — signature ฝนศรจันทร์ ยิง 3 ชุดต่อ cast (hitCount 3) = ฟีล "เลขเด้งรัว" (§56.4 aggregate ต่อ mob).
4. **ATK สูง / HP ต่ำ** (§2.1:113) — ตีแรงต่อ ATK แต่ตัวบาง โดนรุมแล้วเจ็บ → ต้อง kite.
5. **สาย farm > สาย boss** — เก่งกวาดฝูง (moon_rain) แต่ single-target boss ช้ากว่านักดาบเล็กน้อย (โดยตั้งใจ, ยังใน ±15%).

---

## 2. Stat weights vs นักดาบ (PROPOSED — Design Knob §48, PENDING OWNER)

น้ำหนักคูณบน **D-055 player curve** (นักดาบ lv1 HP100/ATK12/DEF8, +HP20/+ATK3/+DEF~1.5 ต่อเลเวล) แล้วปัดจำนวนเต็ม:

```yaml
archer_stat_weights:        # multiplier บน warrior (D-055) curve — PENDING OWNER
  atk: 1.15                 # ATK สูง (§2.1)
  hp:  0.85                 # HP ต่ำ — ตัวบาง
  def: 0.90                 # DEF ต่ำกว่าเล็กน้อย
  critRate: 0.05            # เท่าฐานทุกอาชีพ (§15.3 locked)
  critDmg:  0.50            # +50% locked (§15.3)
  penetration: 0            # P1 = 0
```

| level | นักดาบ ATK/HP/DEF (D-055) | **นักธนู ATK/HP/DEF (ปัด)** |
|---|---|---|
| 1 | 12 / 100 / 8 | **14 / 85 / 7** |
| 3 | 18 / 140 / 11 | **21 / 119 / 10** |
| 5 | 24 / 180 / 14 | **28 / 153 / 13** |
| 7 | 30 / 220 / 17 | **35 / 187 / 15** |

**Anchor math** — ATK สูง (×1.15) จะดันทุก DPS ขึ้น จึงชดเชยที่ per-hit multiplier ของ basic (0.65 แทน 1.0) + cadence เร็วขึ้น:
- basic DPS-coeff (mult/cooldown): นักธนู 0.65/0.45 = **1.444** vs นักดาบ 1.0/0.6 = **1.667** (−13%).
- คูณ ATK: นักธนู lv1 = 14×1.444 = **20.2** vs นักดาบ 12×1.667 = **20.0** → basic DPS **+1%** (ใน ±10% ตามโจทย์).
- HP ต่ำ (lv5 153 vs 180) = ทนรุมได้น้อยกว่า → บังคับเล่นระยะ. TTK single-target อยู่ใน **±15%** ตลอด (§5).

---

## 3. Full S1–S4 skill table (§50.1 shape — 37 field ครบ, ลำดับตาม SKILL_FIELD_NAMES)

> transcribe → `archer-skills-server.ts` (37 field ครบ) + `archer-skills-client.ts` (**ตัด 9 server-only field**: baseMultiplier / scalingStat / damageType / maxTargets / hitCount / bossModifier / pvpModifier / crowdControl / serverAuthority — เหลือ 28 field, ตรง `clientView()`). `class: "archer"` = **PROPOSED classId** (ดู §6 note 4).

### S1 — `archer_basic_shot` (ยิงธนูสามัญ¹) · unlock 1
```yaml
skillId: archer_basic_shot
skillName: "ยิงธนูสามัญ"          # ¹ placeholder PENDING OWNER (draft §3.3)
class: archer
branch: null
tier: 0
unlockLevel: 1
role: "basic fast single / ranged poke"
description: "ยิงธนูระยะไกล โจมตีพื้นฐาน ยิงถี่ เลขเด้งรัว"
targetType: enemy
targetShape: line
range: 5.0
radius: null
angle: 4                          # เส้นบางยิงตรง (draft §3.3)
maxTargets: 1
hitCount: 1
damageType: physical
baseMultiplier: 0.65              # PENDING OWNER — tuned จาก draft 1.0 เพื่อ DPS parity (§2 anchor)
scalingStat: ATK
cooldown: 0.45                    # PENDING OWNER — เร็วกว่านักดาบ 0.6 (ฟีล "ถี่", draft 0.5)
castTime: 0.2
activeTime: 0
recoveryTime: 0.15
resourceCost: 0
statusEffects: null
crowdControl: null
bossModifier: 1.0
pvpModifier: 1.0
comboTags: ["opener"]
animationCue: archer_shot_basic
vfxCue: fx_arrow_white
sfxCue: sfx_bow_light
damageNumberProfile: standard
screenShakeLevel: 0
hitStopLevel: 0
botUsageRule: "ใช้เป็น default เมื่อมีเป้าหมายเดียวหรือ AoE cooldown"
serverAuthority: true
performanceBudget: low
```

### S2 — `archer_moon_rain` (ฝนศรจันทร์) · unlock 3 · branch solo_farming
```yaml
skillId: archer_moon_rain
skillName: "ฝนศรจันทร์"
class: archer
branch: solo_farming              # mirror นักดาบ S2 (royal_wave)
tier: 1
unlockLevel: 3
role: "AoE multi-hit rain / farm clear"
description: "ระดมศรตกลงพื้นเป็นวงกลม ยิงซ้ำ 3 ชุด เลขเด้งรัวทั้งฝูง"
targetType: enemy
targetShape: circle               # ground-target (เล็งจุดพื้น — ดู §6 note 1)
range: 6.0
radius: 2.5
angle: null
maxTargets: 6
hitCount: 3                       # multi-hit — ฟีล §17.6
damageType: physical
baseMultiplier: 0.9               # PENDING OWNER — ต่อ hit (×3 ≈ 2.7 รวม, draft §3.3)
scalingStat: ATK
cooldown: 5.0                     # PENDING OWNER (draft)
castTime: 0.4
activeTime: 0                     # resolve ทันที (ไม่มี server projectile sim — §6 note 2)
recoveryTime: 0.3
resourceCost: 0
statusEffects: null
crowdControl: null
bossModifier: 0.5                 # PENDING OWNER — draft 0.5; แนะนำ 0.6 เพื่อ boss parity (§5 / §7 Q3)
pvpModifier: 1.0
comboTags: ["aoe", "multihit"]
animationCue: archer_moon_rain
vfxCue: fx_arrow_rain_circle
sfxCue: sfx_bow_volley
damageNumberProfile: "compact multi-hit"   # aggregate ต่อ mob (§56.4)
screenShakeLevel: 1
hitStopLevel: 0
botUsageRule: "ใช้เมื่อมีมอน 4+ ตัวรวมกลุ่มในรัศมี 2.5 รอบจุดเล็ง"
serverAuthority: true
performanceBudget: medium
```

### S3 — `archer_target_mark` (ศรตราเป้า) · unlock 5 · branch party_boss
```yaml
skillId: archer_target_mark
skillName: "ศรตราเป้า"
class: archer
branch: party_boss                # ย้ายจาก draft "utility" → party_boss (role = boss/elite burst enabler; §7 Q4)
tier: 1
unlockLevel: 5
role: "debuff mark / boss-elite burst enabler"
description: "ยิงศรตราเป้าใส่ศัตรู 1 ตัว ทำให้รับดาเมจเพิ่ม 15% นาน 6 วิ — ปักก่อนรุมเบิร์สต์"
targetType: enemy
targetShape: point
range: 6.0
radius: null
angle: null
maxTargets: 1
hitCount: 1
damageType: physical
baseMultiplier: 1.0               # PENDING OWNER (draft)
scalingStat: ATK
cooldown: 9.0                     # PENDING OWNER (draft)
castTime: 0.2
activeTime: 0
recoveryTime: 0.2
resourceCost: 0
statusEffects: ["mark_dmg_taken_15"]   # debuff บนเป้า — id normalize จาก draft "mark_dmg_taken_+15%" (§6 note 3)
crowdControl: null
bossModifier: 1.0
pvpModifier: 1.0
comboTags: ["debuff", "boss"]
animationCue: archer_target_mark
vfxCue: fx_mark_ring_target
sfxCue: sfx_bow_mark
damageNumberProfile: standard
screenShakeLevel: 0
hitStopLevel: 0
botUsageRule: "ปักใส่ boss/elite ก่อนเปิดเบิร์สต์; ห้ามเปลืองใส่ trash"
serverAuthority: true
performanceBudget: low
```

### S4 — `archer_swift_step` (ก้าวลมเผ่น) · unlock 7 · branch utility · **ออกแบบใหม่**
เทียบตำแหน่ง utility ของนักดาบ (guard_domain) แต่บทบาท = mobility/escape ให้สาย kite. **ไม่มี i-frame** (spec เดิมยืนยัน), displacement server-authoritative (reuse movement validation — §6 note 2).
```yaml
skillId: archer_swift_step
skillName: "ก้าวลมเผ่น"
class: archer
branch: utility                   # mirror นักดาบ S4 (guard_domain) slot
tier: 1
unlockLevel: 7
role: "mobility escape / kite reset"
description: "เผ่นถอยหลัง 2.5 ช่องจากทิศหน้า + เร่งความเร็วเดินสั้น ๆ ใช้ถอยตั้งระยะ (ไม่มี i-frame)"
targetType: self
targetShape: self                 # self-displacement, ไม่มี attack area (loader = reqString, ไม่ล็อก union)
range: 0
radius: null
angle: null
maxTargets: 0
hitCount: 0
damageType: null
baseMultiplier: 0
scalingStat: null
cooldown: 12.0                    # PENDING OWNER — band 12–15 รับได้ (mirror guard_domain 12.0)
castTime: 0.1                     # snappy escape
activeTime: 2.0                   # หน้าต่าง moveSpeed buff
recoveryTime: 0.2
resourceCost: 0
statusEffects: ["swift_step_speed_20"]  # self moveSpeed +20% — magnitude ใน config seam (§6 note 3)
crowdControl: null
bossModifier: 1.0
pvpModifier: 1.0
comboTags: ["mobility", "defensive"]
animationCue: archer_back_leap
vfxCue: fx_swift_step_dash
sfxCue: sfx_bow_dash
damageNumberProfile: none
screenShakeLevel: 0
hitStopLevel: 0
botUsageRule: "ใช้เมื่อ HP < 35% หรือถูกประชิด ≤ 1.5 ช่อง เพื่อถอยตั้งระยะ; ไม่มี i-frame ห้ามใช้พร่ำเพรื่อ"
serverAuthority: true
performanceBudget: low
```

**config knobs ที่ผูก S3/S4 (นอก §50.1 — เพิ่มใน `combat.ts` seam เดิม, ไม่ใช่ field ใหม่, PENDING OWNER):**
```yaml
statusEffectDamageTakenMultiplier:   # ใหม่ — mirror ฝั่งเป้าของ statusEffectDamageReduction (self)
  mark_dmg_taken_15:
    multiplier: 1.15                 # เป้ารับดาเมจ ×1.15
    durationSeconds: 6
statusEffectMoveSpeedBonus:          # ใหม่ — mirror seam สำหรับ buff ตัวเอง
  swift_step_speed_20: 0.20          # +20% moveSpeed ระหว่าง activeTime
swift_step_dash_tiles: 2.5           # ระยะเผ่นถอยหลัง (server ใช้ movement validation เดิม clamp กำแพง)
```

---

## 4. botUsageRule สรุป (field มีอยู่แล้ว — mirror pattern นักดาบ)

| skill | bot rule |
|---|---|
| archer_basic_shot | default เมื่อเป้าเดียว / AoE ติด cooldown |
| archer_moon_rain | มอน 4+ รวมกลุ่มในรัศมี 2.5 รอบจุดเล็ง |
| archer_target_mark | ปัก boss/elite ก่อนเบิร์สต์; ห้ามใส่ trash |
| archer_swift_step | HP < 35% หรือถูกประชิด ≤ 1.5 ช่อง; ไม่มี i-frame ห้ามใช้พร่ำเพรื่อ |

---

## 5. Balance table — TTK vs Map-1 mobs (นักธนู vs นักดาบ, single-target)

**สูตร (§15.2):** DMG = ATK × baseMultiplier × k/(k+DEF) × tierReduction × bossModifier · k=50 · crit ตัดออก (5% เท่ากันสองอาชีพ → ratio ไม่เปลี่ยน). DPS-coeff = ผลรวม (mult/cooldown) ของ rotation single-target ที่ปลดแล้ว; นักธนูรวมผล mark +15% (uptime 6/9 ≈ +10% เฉลี่ย).

| band / mob | มอน HP · f(DEF)·tier | นักดาบ TTK | นักธนู TTK | Δ (archer/warrior) |
|---|---|--:|--:|--:|
| lv3 · slime | 45 · 0.943 | 1.20s | 1.15s | **−4%** |
| lv3 · boar | 150 · 0.833 | 4.51s | 4.32s | **−4%** |
| lv5 · boar | 150 · 0.833 | 2.68s | 2.80s | **+4.5%** |
| lv5 · elite (boar_rampage) | 420 · 0.781×0.8 | 10.0s | 10.5s | **+4.7%** |
| lv7 · boss (boiling_boar) | 2500 · 0.667×0.65 | 72.8s | 82.6s | **+13.5%** ⚠ |

- **normal/elite:** อยู่ใน ±5% — ผ่านสบาย ±15%.
- **boss:** +13.5% (draft moon_rain bossModifier 0.5) — **ช้ากว่าโดยตั้งใจ** (นักธนูสาย farm ไม่มี single-target boss-nuke แบบนักดาบ solar_cleave bossMod 1.2) แต่ **ยังใน ±15%**. ถ้าอยากบีบ ~10% → bump moon_rain bossModifier 0.5→0.6 (§7 Q3).
- **AoE farm (นอกตาราง):** per-mob-in-pack coeff นักธนู moon_rain 2.7/5.0=0.54 vs นักดาบ royal_wave 2.2/4.0=0.55; คูณ ATK → นักธนูกวาดฝูง **~+14% เร็วกว่า** ที่ lv5 = จุดเด่นสาย farm (แลกกับ boss ช้ากว่า). ถ้าอยากบีบ = ยืด cooldown 5.0→5.5 (§7 Q3).

---

## 6. Implementation notes

1. **aim-centered AoE (moon_rain) = geometry ใหม่ฝั่ง server (never-downgrade, top-tier):** นักดาบทุกสกิลเล็งจาก facing/ตัว caster; moon_rain เล็ง **จุดพื้นใต้เคอร์เซอร์**. กติกา: client ส่งจุดพื้นเป้า → **server validate ว่าจุดนั้นอยู่ในระยะ `range` 6.0 จาก caster** (clamp เข้าขอบระยะถ้าเกิน, ใช้ `rangeToleranceFactor` เดิมกัน false-reject) → resolve มอนในรัศมี 2.5 รอบจุดนั้น (สูงสุด 6 ตัว × 3 hit). ต่างจาก `hit-test.ts` เดิม (arc/cone/line รอบ facing) — ต้องเพิ่ม path "circle รอบ ground-point". นี่คือความเสี่ยง D-023 (server geometry ใหม่) → ต้องเทสต์ range-validation + max-target cap เอง.
2. **projectile = client VFX เท่านั้น (ไม่มี server projectile simulation):** ศร/ฝนศร = juice ฝั่ง client; hit resolve **ทันที** ตอน cast (activeTime 0) ตามโมเดลเดิม — server ไม่จำลองการบินของศร. displacement ของ swift_step ก็ instant + reuse movement validation (collision/wall clamp เดียวกับเดินปกติ) — **ไม่มี i-frame**.
3. **debuff/status seam (§50.1 ไม่มี field ตัวเลข debuff):** schema มี `statusEffects` (tag) + `crowdControl` อยู่แล้ว — **ไม่ต้องเพิ่ม field ใหม่** (เลี่ยง §59.4). ค่าตัวเลขไปอยู่ config เหมือน `self_damage_reduction_30` ที่วันนี้ map ผ่าน `statusEffectDamageReduction` (caster self-buff). smallest-footprint = **mirror ฝั่งเป้า**: เพิ่ม map `statusEffectDamageTakenMultiplier` (`mark_dmg_taken_15` → 1.15/6s) + container status ต่อ mob (formula เช็ค debuff active ของเป้าคูณ dmg ขาเข้า). swift_step ก็ mirror map `statusEffectMoveSpeedBonus`. ทั้งหมด = config knob ไม่ใช่ field schema.
4. **classId `archer` = PROPOSED (ยังไม่ล็อก):** `src/shared/character-class.ts` วันนี้ `CLASS_IDS = ["swordsman"]` เท่านั้น — id อังกฤษของอีก 4 อาชีพ **ยังไม่ owner-lock** (comment ในไฟล์ระบุ "นักธนู = P2B"). `archer` เป็นชื่อที่สอดคล้อง convention ของ `swordsman` และตรง comment ที่จองไว้ → ใช้ `class: "archer"` แต่ต้องให้ owner เคาะก่อนเพิ่มเข้า `CLASS_IDS` (§7 Q5).
5. **drift guard:** `archer-skills-client.ts` ทุก entry ต้อง = `clientView(archer-skills-server ตัวเดียวกัน)` เป๊ะ (เหมือน `tests/game-skill-loader.test.ts` คุมนักดาบ) — แก้เลขที่ไฟล์ไหนต้องแก้อีกไฟล์.

---

## 7. Questions to decide (owner) — คำถาม + ตัวเลือก + คำแนะนำ

> ทุกข้อแตะ **combat balance** → ต้องให้ owner เคาะ ห้ามสรุปเอง (v15 §53).

- **Q1 — basic tuning (mult 0.65 @ cooldown 0.45):** ยอมให้นักธนูยิงถี่กว่า (0.45s) + per-hit เบา (0.65) เพื่อ DPS parity ±1% ไหม? · ตัวเลือก: (a) รับตามนี้ [**แนะนำ** — ตรงฟีล "เร็ว ถี่" §17.6 และคุม parity] (b) cadence เท่านักดาบ 0.6 + mult ต่ำลง (c) ตัวเลขอื่น.
- **Q2 — stat weights (ATK×1.15 / HP×0.85 / DEF×0.9):** รับน้ำหนักนี้เป็น curve นักธนูไหม? · [**แนะนำรับ** — ให้ "ATK สูง/HP ต่ำ" ชัดโดยยัง TTK ±15%] · ทางเลือกบางกว่า: HP×0.80 (เสี่ยงตายง่ายขึ้น).
- **Q3 — boss parity (moon_rain bossModifier):** ที่ draft 0.5 นักธนูฆ่าบอสช้ากว่านักดาบ **+13.5%** (ยังใน ±15%). เอาแบบไหน? · (a) คง 0.5 = นักธนูสาย farm ชัด (บอสช้ากว่า, ฝูงเร็วกว่า) [**แนะนำ** — สร้างเอกลักษณ์อาชีพ] (b) 0.6 → บอส ~+10% (parity แน่นขึ้น) (c) ยืด moon_rain cooldown 5.0→5.5 เพื่อลด edge ฝั่ง farm (+14%).
- **Q4 — target_mark branch:** draft วางไว้ "utility" แต่บทบาท = boss/elite burst enabler → ผมย้ายเป็น **party_boss** (ให้ 3 branch นักธนู = solo_farming/party_boss/utility mirror นักดาบเป๊ะ). เห็นชอบไหม? · [**แนะนำ party_boss**] หรือคง utility.
- **Q5 — S4 swift_step (สกิลใหม่):** รับ "ก้าวลมเผ่น" (เผ่นถอย 2.5 ช่อง + moveSpeed +20% 2s, cooldown 12s, ไม่มี i-frame) เป็น utility S4 ของนักธนูไหม? · [**แนะนำรับ** — เติมช่อง utility ที่ draft ยังว่าง, ฟิตสาย kite] · ปรับได้: ระยะเผ่น 2.5→3.0, cooldown 12→15.
- **Q6 — classId `archer`:** เคาะ `archer` เป็น classId ภาษาอังกฤษของนักธนู (เพิ่มเข้า `CLASS_IDS`) ได้เลยไหม? · [**แนะนำเคาะ** — ตรง convention `swordsman`] เพราะ id ล็อกแล้วเปลี่ยนไม่ได้เมื่อมี save data.
- **Q7 — debuff config seam:** โอเคไหมที่ debuff +15% dmg-taken ไปอยู่ config map ใหม่ (`statusEffectDamageTakenMultiplier`) แทนการเพิ่ม field ใน §50.1 (เลี่ยง §59.4)? · [**แนะนำใช่** — smallest footprint, mirror seam self-buff เดิม].

---
¹ skillName บางตัว = placeholder PENDING OWNER (สืบจาก draft §3.3). ทุกเลขในไฟล์นี้ = Design Knob §48, สรุปสุดท้ายรอ owner เคาะผ่าน §59.4.
