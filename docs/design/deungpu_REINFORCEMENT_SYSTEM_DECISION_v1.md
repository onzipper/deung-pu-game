# ดึ๋งปุ๊ — Reinforcement System Decision v1 (เสริมแกร่ง + E1 Boss + E3 placeholder)

> **สถานะ:** `LOCKED (owner เคาะ 2026-07-12)` สำหรับ E1 + ระบบเสริมแกร่งการันตี + rename แกร่ง→เสริมแกร่ง · `OPEN — DESIGN REQUIRED` สำหรับ E3 (monster combat balance)
> **วันที่:** 2026-07-12
> **supersedes:**
> - game v15 §"Success Rate Draft" (ตาราง % ตีบวก +1..+15) + §"Failure Result" + §"Item ตีบวก → แกร่ง/เศษแกร่ง" + design pillar ข้อ 30–32 (rename) · v15 §33.1/33.3/33.4 (audio ลุ้น/ล้มเหลว/รอยร้าว) = superseded-for-reinforcement
> - Economy `deungpu_P2_MAP_1_ECONOMY_AND_LOOT_SPEC_v1.md` §16.2 (ตาราง Success/Gold/Crack) · §16.4 (Cracked/Repair) · §16.5+§17 (RNG transaction/UI) · §15 (Kraeng Economy — rename + drop model) · §11.2–11.6 (Kraeng drop/guaranteed rows) · §18.1 (milestone Kraeng grants) · scope "Enhancement +0 ถึง +5"
> **relates:** decision-index แถว 2026-07-12 (E1/E2/E3) · Storage spec S3 (bind/trade policy = config) · Bible 3.1/Roadmap (P2B = Boss & Encounter Foundation) · v15.2 §50.1.1 (Design Knob process §59.4) · v15 §53 (economy/monetization = owner-gated)
> **source:** คำเคาะ owner 2 ข้อความ 2026-07-12 (ข้อความที่ 2 ชนะข้อความที่ 1 เมื่อขัด) — ค่า/ID/ชื่อทุกตัว copy ตรงจากคำเคาะ

---

## 0. เอกสารนี้คืออะไร + วิธีอ่าน

owner เคาะเรื่อง **E1 (ชื่อบอส Map 1) · E2 (ระบบตีบวก→เสริมแกร่งการันตี) · Decision ไอเทมเสริมแกร่ง · E3 (ค่าสถานะมอนสเตอร์)** ในวันเดียว 2026-07-12 ผ่าน 2 ข้อความ เอกสารนี้รวมคำเคาะทั้งหมดเป็น decision record เดียว + mark จุดที่ supersede spec เดิม + ปิดท้ายด้วย **"คำถามให้ owner เคาะ" (R1–R10)** สำหรับจุดที่คำเคาะยังไม่ครอบคลุม

> **หลักการชนกันของคำเคาะ 2 ข้อความ (บันทึกไว้ให้ชัดตาม agent iron-rule "คำสั่งล่าสุดชนะ + บันทึกจุดทับ"):** เมื่อข้อความที่ 1 กับข้อความที่ 2 ขัดกัน **ข้อความที่ 2 ชนะ** ทุกจุด (ดู §7 Conflict Resolution Log)

---

## 1. E1 — Boss Map 1 (RESOLVED, verbatim)

```yaml
bossId: boss_map1_resonant_guardian     # Canonical ID — ห้ามเปลี่ยนหลังเริ่มมี Save Data
displayName: ผู้พิทักษ์เสียงสะท้อน       # Display Name ปัจจุบัน (เปลี่ยนภายหลังได้ผ่าน Content Config)
level: 8
phase: P2B
```

ข้อกำหนด (verbatim):

- ใช้ `boss_map1_resonant_guardian` เป็น Canonical ID
- ใช้ `ผู้พิทักษ์เสียงสะท้อน` เป็น Display Name ปัจจุบัน
- Canonical ID ห้ามเปลี่ยนหลังเริ่มมี Save Data
- Display Name เปลี่ยนภายหลังได้ผ่าน Content Config
- `boss_m1_boar_pot` ที่เคยปรากฏในเอกสาร Pipeline ให้ถือเป็น **Example/Legacy Placeholder** ไม่ใช่ Source of Truth
- Boss Kit, Lore, Pattern และ Combat Stat รายละเอียด **ยังต้องอ้าง Boss Kit Proposal ภายหลัง**

> **หมายเหตุ audit:** Economy §11.6 (drop table บอส) ใช้ `monsterId: boss_map1_resonant_guardian` + `phase: P2B` อยู่แล้ว = ตรงกับ E1 · ส่วน canon ชื่อเก่า "หมูป่าหม้อเดือด"/"boss_m1_boar_pot" ใน Pipeline/Asset docs = legacy placeholder ตามคำเคาะ (ไม่ใช่ source of truth) — ถ้าจะลบชื่อเก่าออกจาก docs อื่นให้ทำเป็นงาน cleanup แยก ไม่ใช่ scope นี้

---

## 2. ระบบเสริมแกร่งการันตี (Guaranteed Reinforcement) — RESOLVED, SUPERSEDES E2 เดิม

### 2.1 หลักการ

> **เสริมแกร่ง 1 ชิ้น = เพิ่มระดับอุปกรณ์ +1 สำเร็จ 100% โดยไม่มีเงื่อนไข**

ระบบ % ตีบวก / Fail / Crack / Repair / Protection / Gold cost / RNG **ทั้งหมดถูก Supersede** — ไม่มีอีกต่อไป

```yaml
reinforcement:
  materialName: เสริมแกร่ง
  materialId: upg_reinforcement
  quantityPerUpgrade: 1
  successChancePercent: 100
  goldCost: 0
  maximumEnhancementLevel: 15   # เพดาน +15 ทุกเฟส (ข้อความที่ 2 — amend ค่า 5 ของข้อความที่ 1 ในวันเดียวกัน; ดู §7)
  canFail: false
  canCrack: false
  canBreak: false
  canDowngrade: false
  requiresProtection: false
```

ตัวอย่าง: `ดาบ +0 + เสริมแกร่ง ×1 → ดาบ +1` · `ดาบ +1 + เสริมแกร่ง ×1 → ดาบ +2`

**ไม่มี:** Success Rate / Failure / Crack / Repair / Protection / Gold Cost / RNG / Preview Roll / Pity ของการตีบวก

### 2.2 สิ่งที่ต้องตัดออกจาก Implementation เดิม (verbatim)

Enhancement probability table · Crack state · Repair flow · Protection item · Failure result · Success roll · Random seed · Chance preview · Gold deduction สำหรับตีบวก

### 2.3 Enhancement Transaction ใหม่ (verbatim)

```txt
Select Equipment
→ Validate Item
→ Validate Enhancement Level < Max
→ Validate เสริมแกร่ง >= 1
→ Consume เสริมแกร่ง ×1
→ Increase Enhancement Level +1
→ Persist Atomically
→ Return Authoritative Result
```

**ต้องยังมี:** Server-authoritative · Item lock · Idempotency key · Transaction ID · Economy Version · Reconciliation เมื่อ Connection หลุด · ห้ามเพิ่มระดับซ้ำจาก Retry

### 2.4 UI ใหม่ (verbatim)

```txt
ดาบคมกก +2 → +3
ใช้: เสริมแกร่ง ×1
ผลลัพธ์: เพิ่มระดับสำเร็จแน่นอน
[ ยืนยันเสริมแกร่ง ]
```

- **ไม่ต้องแสดง:** Success Chance / Failure Consequence / Crack Chance / Protection / Gold Cost
- **ข้อความหลัก:** "สำเร็จแน่นอน" หรือ "เพิ่มระดับอุปกรณ์ +1"
- **สถานะ UI:** `NO_ITEM` · `READY` · `NO_REINFORCEMENT` · `MAX_LEVEL` · `ITEM_LOCKED` · `PROCESSING` · `SUCCESS` · `UNKNOWN_RECONCILING`

> **⚠ open (ดู R9):** ตาราง Enhancement stat multiplier ใน Economy §16.3 นิยามแค่ +0..+5 (1.00→1.35) — เพดานใหม่ +15 **ยังไม่มี multiplier สำหรับ +6..+15** = ต้องเคาะ balance ผ่าน §59.4 ก่อน +15 จะมีความหมายเชิงพลัง

---

## 3. ไอเทมเสริมแกร่ง (Reinforcement Item) + เศษเสริมแกร่ง

### 3.1 นิยาม (rename จาก "แกร่ง"/"เศษแกร่ง")

- **แกร่ง (`upg_kraeng`) → เสริมแกร่ง (`upg_reinforcement`)** — ไอเทมเดียวกันเชิง concept, rename ตามข้อความที่ 2
- **เศษแกร่ง → เศษเสริมแกร่ง** — สูตรแลกยังอยู่ (ดู §3.4)
- **materialId เปลี่ยน `upg_kraeng` → `upg_reinforcement`:** ปลอดภัยตอนนี้เพราะ **ยังไม่มี production save data** (DB จริงยังว่าง apply รอบเดียวตอน P2-16 ตามมติ Storage S1) — ต้องปักธง rename ให้เสร็จ **ก่อน** P2-16 apply DB (หลังมี save data = ID ล็อกตามกฎ E1/persona)

```yaml
reinforcementItem:
  displayName: เสริมแกร่ง
  materialId: upg_reinforcement
  effect: guaranteed_plus_one
  stackSize: 999
  storagePolicy: ALLOWED
  # --- policy ด้านล่าง SUPERSEDED โดยข้อความที่ 2 (ดู R1/R2) ---
  # bindType: ACCOUNT_BOUND   ← ขัดกับ "trade ได้" — ต้องเคาะ bindType ใหม่ (R1)
  tradable: true              # ข้อความที่ 2: trade ได้ (supersede false)
  sellable: true              # ข้อความที่ 2: ขายได้ (supersede false — NPC vs market ต้องเคาะ R2)
  craftable: true             # ข้อความที่ 2: craft จากเศษเสริมแกร่งได้ (supersede false)
  purchasableWithGold: false
  purchasableWithRealMoney: false
```

### 3.2 Philosophy (verbatim จากข้อความที่ 1 + amend ตามข้อความที่ 2)

- ต้องรู้สึกหายากและมีคุณค่า
- ไม่แจกตาม Tutorial หรือ Main Quest ปกติ
- ไม่ได้จาก Monster ทั่วไป
- ไม่ได้จาก Elite ทั่วไป
- ไม่ขาย NPC  *(← ข้อความที่ 2 บอก "ขายได้" — ขัดกัน, ตีความ+เคาะที่ R2)*
- ไม่ซื้อด้วย Gold
- ~~ไม่ Craft~~ → **craft จากเศษเสริมแกร่งได้** (ข้อความที่ 2 supersede บางส่วน — สูตร 5→1 ยังอยู่)
- ไม่ขาย Cash Shop
- ไม่เป็น Login Reward

### 3.3 ขาย/Trade ได้ (ข้อความที่ 2) — ⚠ policy ยังไม่ปิด

owner: *"ทั้ง เสริมแกร่ง และ เศษเสริมแกร่ง สามารถขาย และ trade ได้"* → supersede `tradable/sellable/marketable: false` ของข้อความที่ 1

> **⚠ ข้อเท็จจริงที่ต้องแจ้ง owner:** P2 **ยังไม่มีระบบ Market และ Player-to-Player Trade** (Economy §0.2 ตัดออกชัดเจน) — flag `tradable/sellable` ตั้งเป็น config ได้ตาม Storage S3 แต่ **ไม่มี surface ทำงานจริงจนกว่า market/trade จะ ship (P2B+)** · และการทำให้ไอเทมพลัง (guaranteed +1) เป็นสินค้า trade ได้ = คันโยก economy ระดับใหญ่ ต้องผ่าน v15 §53 (หยุดถาม) → ดู R1/R2

### 3.4 เศษเสริมแกร่ง — สูตรแลก (สืบทอด v15, ยังไม่เคาะใหม่)

```yaml
reinforcementFragment:
  displayName: เศษเสริมแกร่ง
  materialId: upg_reinforcement_fragment   # PENDING OWNER — id ยังไม่ได้เคาะ (owner ยังไม่ให้ id; เสนอไว้ ดู R3)
  exchangeRule: 5 เศษเสริมแกร่ง → 1 เสริมแกร่ง   # อัตรา 5→1 สืบทอด v15 pillar ข้อ 31 — "ไม่ได้เคาะใหม่ ถือของ v15 ไว้ก่อน" (ข้อความที่ 2)
  tradable: true
  sellable: true
```

> เศษเสริมแกร่ง = re-scope: Economy §15.3 เคย **ตัดทิ้ง** ("No fragment decision — P2 ใช้แกร่ง เป็นหน่วยเดียว ไม่สร้างเศษแกร่ง") เพื่อลด scope · ข้อความที่ 2 พลิกกลับมา = เพิ่ม item + exchange UI + recipe · **แหล่งดรอปของเศษเสริมแกร่ง owner ยังไม่ระบุ** → R3 + R7

---

## 4. แหล่งดรอปเสริมแกร่ง + Pity (RESOLVED, verbatim)

### 4.1 แหล่งที่ได้

```yaml
sources:
  normalMonsterDropChance: 0%          # ไม่ได้จาก Monster ทั่วไป
  normalEliteDropChance: 0%            # ไม่ได้จาก Elite ทั่วไป
  specialEliteDropChancePercent: 0.5   # min 0.5% max 1.0%, quantity 1 (เฉพาะ Elite พิเศษ/ลับ)
  mapBossDropChancePercent: 8          # แหล่งหลัก, quantity 1, personalLoot: true
  hardBossWorldBossDropPercent: 20     # อนาคต min 20% max 25%, quantity 1, personalLoot: true
```

- **Secret Challenge / Difficult Content อนุญาต** (Secret Boss, Challenge Room, No-death Challenge, Hidden Encounter, Event Boss) แต่ **ต้องยากจริง ไม่ใช่แจกฟรี**

### 4.2 Bad-luck Protection (Pity สำหรับ Map Boss) — verbatim

```yaml
reinforcementBossPity:
  baseDropChancePercent: 8
  startIncreasingAfterClears: 8
  increasePerClearPercent: 4
  guaranteedAtClear: 15
  resetOnDrop: true
  scope: account-per-boss
```

ตัวอย่าง: รอบ 1–8 = 8% · รอบ 9 = 12% · รอบ 10 = 16% · รอบ 11 = 20% · … · **รอบ 15 = การันตี** หากยังไม่เคยดรอป
Pity เป็น **รายบัญชีต่อบอส** · ต้อง **Reset เมื่อได้รับเสริมแกร่งจากบอสนั้น**

### 4.3 First Kill

```yaml
firstKillGuaranteedReinforcement: false
```

First Kill ยังให้ **Gold / EXP / Boss Material / Equipment / Achievement / Journal** แต่ **ไม่การันตีเสริมแกร่ง**

### 4.4 Map 1 Baseline — verbatim

```yaml
map1Reinforcement:
  normalMonsterDropChance: 0
  normalEliteDropChance: 0
  specialEliteDropChancePercent: 0.5
  bossDropChancePercent: 8
  bossPityGuaranteedAtClear: 15
  firstKillGuaranteed: false
```

> **หาก Map 1 ยังไม่มี Special Elite จริง ให้ตั้ง Special Elite Drop เป็น 0% ก่อน และใช้ Boss เป็นแหล่งเดียว**
>
> **⚠ ผลที่ตามมา (ดู R8):** บอส Map 1 = **phase P2B** → ใน **P2 (ก่อน P2B) Map 1 ไม่มีแหล่งเสริมแกร่งเลย** (normal/elite = 0%, special elite = 0%, boss = ยังไม่มา) · ประกอบกับการ supersede milestone grant (§5) = ระบบตีบวกใน P2 **ไม่มีวัสดุให้ได้เลย** → ต้องเคาะว่าตั้งใจให้ระบบตีบวก "มีจอแต่ยังใช้ไม่ได้" ใน P2 หรือมี bootstrap source

### 4.5 Target Output (Validation Target ไม่ใช่ Weekly Cap) — verbatim

| ผู้เล่น | เป้าหมายเสริมแกร่ง |
|---|---|
| เล่นทั่วไป ไม่ล่าบอสจริงจัง | 0–1 ชิ้น/สัปดาห์ |
| ล่าบอสสม่ำเสมอ | 1–2 ชิ้น/สัปดาห์ |
| ผู้เล่นจริงจัง | 2–3 ชิ้น/สัปดาห์ |
| มากกว่า 4 ชิ้น/สัปดาห์ | ถือว่าเร็วเกิน Baseline |

---

## 5. Telemetry + Anti-exploit + Transaction (RESOLVED, verbatim)

### 5.1 Telemetry events

`reinforcement_drop_roll` · `reinforcement_drop_success` · `reinforcement_pity_increment` · `reinforcement_pity_reset` · `reinforcement_source` · `reinforcement_consumed` · `reinforcement_upgrade_success`

**Fields:** `accountId` · `characterId` · `bossId` · `clearCountSinceDrop` · `baseChance` · `finalChance` · `pityCount` · `sourceType` · `economyVersion` · `transactionId` · `enhancementFrom` · `enhancementTo`

### 5.2 Anti-exploit (verbatim)

- Personal Loot
- Last Hit ไม่มีผล
- ต้องผ่าน Boss Eligibility
- Pity เพิ่มเฉพาะ **Successful Eligible Clear**
- Disconnect ก่อน Clear ไม่เพิ่ม Pity
- Duplicate Reward Request ต้อง Idempotent
- Alt Character ใน Account เดียวใช้ Pity เดียวกัน
- ห้ามสร้างหลาย Character เพื่อเพิ่ม Roll
- Boss Reward Roll หนึ่งครั้งต่อ Account ต่อ Eligible Clear

---

## 6. กติกา Static Versioned Config (RESOLVED, verbatim)

> ค่าใหม่ทุกอย่างให้เป็น **Static Versioned Config** ก่อน — **ยังไม่ต้องสร้าง Admin UI, Remote Config หรือ Live Rate System**

ทุกค่าใน §2–§5 = Design Knob ใน versioned config (v15.2 §50.1.1 + §48) · ปรับผ่าน config + decision record ไม่ใช่ hardcode ไม่ใช่ runtime tuning

---

## 7. Conflict Resolution Log (ข้อความที่ 1 vs ข้อความที่ 2)

| หัวข้อ | ข้อความที่ 1 (เดิม) | ข้อความที่ 2 (ชนะ) | ผล |
|---|---|---|---|
| เพดานตีบวก | `maximumEnhancementLevel: 5` | *"เอา +15 เลยครับ ไม่ว่าจะเฟสไหน"* | **+15 ทุกเฟส** (amend ค่า 5 ในวันเดียวกัน) |
| ชื่อไอเทม | แกร่ง (`upg_kraeng`) | rename → เสริมแกร่ง (`upg_reinforcement`) | **rename** ไอเทมเดียวกันเชิง concept |
| เศษ | `craftable: false` / no fragment | *"ยังอยากได้สูตรเศษเสริมแกร่ง"* | **เศษเสริมแกร่ง + สูตร 5→1 กลับมา** |
| trade | `tradable: false` | *"ขาย และ trade ได้"* | **ขาย+trade ได้** (policy ปลายเปิด R1/R2) |
| bindType | `ACCOUNT_BOUND` | (ขัดกับ trade ได้) | **ต้องเคาะ bindType ใหม่ (R1)** |
| แหล่งดรอป | boss/special elite/secret | *"หายาก … พิเศษหน่อย"* | **ยืนยันทิศทางแหล่งพิเศษ** |
| pillar "ตีบวกมีเรื่องขิง" | (RNG กดตีบวก) | *"ได้ครับฝากหน่อย"* | **ย้ายจุดลุ้นไปการล่า (ดู §8)** |

---

## 8. Pillar Amendment — "ตีบวกมีเรื่องขิง" (owner เคาะให้บันทึกโดยตั้งใจ)

One-liner v15: *"…ตลาดมีชีวิต **ตีบวกมีเรื่องขิง** โลกมีความลับ…"* — คำว่า **ขิง/ลุ้น** ยังอยู่ แต่ **ความหมายย้ายที่**:

- **เดิม:** จุดลุ้น/ขิง = **การกดปุ่มตีบวก** (RNG success/fail/crack) — ยิ่ง +สูง ยิ่งเสี่ยง ยิ่งขิงตอนสำเร็จ
- **ใหม่:** การกดตีบวก = **การันตี 100% ไม่มี RNG** → จุดลุ้น/ขิงย้ายไป **การล่าเสริมแกร่งจากบอส** (drop 8% + pity ถึง 15) และการสะสมจนดัน +15 · "ขิง" = ของหายากที่ล่ามาได้ + อุปกรณ์ +15 ที่ใช้เวลาสะสม ไม่ใช่ดวงตอนกดปุ่ม

> owner ยืนยัน (ข้อความที่ 2 ข้อ 4: *"ได้ครับฝากหน่อย"*) ให้บันทึกการแก้ pillar นี้อย่างตั้งใจ — ไม่ใช่ผลข้างเคียงที่หลุด · One-liner ไม่ต้องแก้ถ้อยคำ (ขิงยังจริง) แต่ **นิยามภายในเปลี่ยน** ตามนี้

---

## 9. E3 — ค่าสถานะมอนสเตอร์ (OPEN — DESIGN REQUIRED)

### 9.1 ข้อมูลที่เคาะแล้ว (identity/reward — ไม่ใช่ combat balance)

| monsterId | ชื่อ | Level | EXP | Gold | Respawn |
|---|---|---|---|---|---|
| `mon_map1_slime` | สไลม์เมือกดึ๋ง | 1 | 14 | 3–5 | 8s |
| `mon_map1_bird` | นกจิกปุ๊ | 2 | 20 | 5–8 | 10s |
| `mon_map1_boar` | หมูป่าพอง | 4 | 30 | 8–12 | 14s |
| `elite_map1_boar_rampage` | หมูป่าพองคลั่ง | 5 | 140 | 40–60 | 720s |
| `boss_map1_resonant_guardian` | ผู้พิทักษ์เสียงสะท้อน | 8 | 550 | 180–260 | Encounter |

### 9.2 Pending Design Item

> **Map 1 Monster Combat Stat Table**
> - `status: pending-owner-balance`
> - `blocks:` production monster tuning · final combat QA
> - `doesNotBlock:` schema · loader · placeholder implementation · test environment

**ยังไม่มี Production Values สำหรับ** `monsterCombatStats`: `hp` · `attack` · `defense` · `moveSpeed` · `attackRange` · `attackCooldown` · `anticipationMs` · `activeMs` · `recoveryMs` · `aggroRadius` · `leashRadius` · `breakPower` · `tierReduction`

**ทำได้ตอนนี้:** Config Schema · Config Loader · Validation · Placeholder/Test Values · Combat Formula integration · Telemetry (TTK, Damage Taken, Potion Usage, Death Rate)

**ห้ามทำตอนนี้:** ห้ามถือ Placeholder เป็น Production Balance · ห้าม Hardcode HP/ATK/DEF · ห้ามให้ Code กลายเป็น Source of Truth · ห้ามล็อก Final Combat QA จากค่าทดสอบ

**Combat Formula ที่ต้องรองรับ:** `DMG = ATK × baseMultiplier × [50 / (50 + effectiveDEF)]`

---

## 10. Implementation mapping (P2 vs P2B)

| ส่วน | เฟส | หมายเหตุ |
|---|---|---|
| Enhancement transaction (guaranteed, no RNG) + UI states | P2-10 | เขียนใหม่ทั้ง scope — ตัด RNG/crack/repair/protection/gold |
| Reinforcement/fragment **drop config + pity config** (schema+loader+flag) | P2-09 | config/loader/flag เท่านั้น — บอสจริงยัง P2B |
| Boss `boss_map1_resonant_guardian` encounter + drop 8% + pity ทำงานจริง | P2B | Boss & Encounter Foundation |
| เศษเสริมแกร่ง item + exchange UI + recipe | **PENDING (R7)** | Economy §15.3 เคยตัด — phase ต้องเคาะ |
| Monster combat stat (production) | **PENDING (E3)** | placeholder P2, production balance รอ owner |

---

## 11. คำถามให้ owner เคาะ (R1–R10)

> ทุกข้อ = ยังไม่เคาะ/คลุมเครือ — **ไม่มีการตัดสินแทน owner** · ข้อที่แตะ economy/monetization = ผ่าน v15 §53 (หยุดถาม)

**R1 — bindType ขัดกับ "trade ได้" (บังคับเคาะ)**
ข้อความที่ 1 ตั้ง `bindType: ACCOUNT_BOUND` แต่ข้อความที่ 2 บอก "trade ได้" → ขัดกันตรง ๆ (account-bound = trade ไม่ได้) เสนอเลือก:
- (ก) `bindType: NONE` (unbound เต็ม — tradable+sellable+marketable ตรงตามคำว่า "trade ได้") — **ผลข้างเคียง:** เสริมแกร่งกลายเป็นสินค้าโภคภัณฑ์ที่ผู้เล่นซื้อขายกันได้ = คันโยก economy/RMT ใหญ่ (v15 §53)
- (ข) `bindType: TRADE_LIMITED` (trade ตรงตัวผู้เล่นได้ แต่ห้าม list ตลาด) — คุมการปั่นราคาได้บ้าง
- **ข้อเสนอแนะ:** ถ้าเป้าคือ "หายากมีคุณค่า" การ trade เต็มรูป (ก) จะกดความหายากลง — แนะนำเคาะเจตนาก่อนว่าอยากให้เสริมแกร่งเป็น "ของล่าเฉพาะตัว" หรือ "สินค้าตลาด"

**R2 — "ขายได้" = ขาย NPC ด้วยหรือเฉพาะตลาดผู้เล่น?**
ข้อความที่ 1 Philosophy บอก "ไม่ขาย NPC" แต่ข้อความที่ 2 บอก "ขายได้" (supersede) เสนอ:
- (ก) **ขายเฉพาะตลาดผู้เล่น** — NPC sell ปิดต่อ (การขาย NPC = gold faucet + ตั้ง floor price ให้ของหายาก ขัดกับ "มีคุณค่า")
- (ข) **ขาย NPC ได้** — ต้องเคาะราคา (ขาย NPC = ผู้เล่นได้ gold = faucet ต้องคุมด้วยราคาต่ำ) → ขอค่าราคา NPC sell
- **ข้อเสนอแนะ:** (ก) — สอดคล้อง Philosophy "หายาก/มีคุณค่า" มากกว่า

**R3 — เศษเสริมแกร่ง: แหล่งดรอป + อัตรา + id (บังคับเคาะก่อนทำ P2-09 config)**
- **แหล่งดรอป owner ยังไม่ระบุ** · Philosophy "ไม่ได้จาก Monster ทั่วไป/Elite ทั่วไป" ใช้กับ **เศษ** ด้วยไหม? v15 เดิมให้เศษดรอปจาก World Boss/Raid (ของหายาก) เสนอ: (ก) เศษดรอปจากแหล่งพิเศษเดียวกับตัวเต็มแต่ rate สูงกว่า (ให้ path สะสม 5→1 สำหรับคนดวงไม่ดี) · (ข) เศษก็ 0% จาก normal/elite ทั่วไป — เฉพาะ special/boss/secret เท่านั้น
- **อัตรา 5→1** สืบทอด v15 pillar ข้อ 31 (ข้อความที่ 2 บอก "ไม่ได้เคาะใหม่ ถือของ v15") → ขอ **ยืนยัน** ว่าใช้ 5→1 ต่อ
- **materialId** เสนอ `upg_reinforcement_fragment` (owner ยังไม่ให้ id) → ขอเคาะ id

**R4 — คณิตเพดานใหม่ +15: flat 1 ชิ้น/ขั้น หรือ escalate ขั้นสูง? (กระทบ balance โดยตรง)**
เพดาน +15 × การันตี 1 ชิ้น/ขั้น (flat):

| เป้าหมาย | จำนวนเสริมแกร่ง | ที่ 1 ชิ้น/สัปดาห์ | ที่ 2 ชิ้น/สัปดาห์ | ที่ 3 ชิ้น/สัปดาห์ |
|---|---:|---:|---:|---:|
| อุปกรณ์ 1 ชิ้น +0→+15 | 15 | ~15 สัปดาห์ (~3.5 เดือน) | ~7.5 สัปดาห์ (~1.7 เดือน) | ~5 สัปดาห์ (~1.2 เดือน) |
| ครบชุด 5 slot +15 | 75 | ~75 สัปดาห์ (~1.4 ปี) | ~37.5 สัปดาห์ (~8.6 เดือน) | ~25 สัปดาห์ (~5.8 เดือน) |

- เดิม RNG เป็นตัวเบรกความเร็ว +สูง · ตอนนี้ **ตัวเบรกเดียว = ความหายากของดรอป** (flat cost) → +15 เป็น long-term chase ~6 เดือน–1.4 ปี/ครบชุด
- เสนอเลือก: (ก) **flat 1 ชิ้น/ขั้นทุกระดับ** (ตามคำเคาะปัจจุบัน — ยืนยัน intended long-term chase) · (ข) **escalate ขั้นสูง** (+11..+15 ใช้ 2–3 ชิ้น/ขั้น หรือมี material tier สูงกว่า) เพื่อให้ +สูงยัง "แพง" โดยไม่พึ่ง RNG
- **ข้อเสนอแนะ:** ถ้าอยากคง "ตีบวกสูง = ความสำเร็จที่อวดได้" ควรพิจารณา (ข) — flat cost ทำให้ +15 เป็นแค่เรื่องเวลา ไม่ใช่ความทุ่มเทที่ต่างระดับ

**R5 — milestone/one-time Kraeng grants เปลี่ยนรางวัลเป็นอะไร? (พบ 5 จุด ไม่ใช่ 2)**
Philosophy "ไม่แจกตาม Tutorial/Main Quest ปกติ" supersede grant เสริมแกร่งจาก milestone · **ตรวจพบจริง 5 แถวใน Economy §18.1** (ไม่ใช่ 2): `ms_enhancement_ready` (Kraeng×1) · `ach_first_upgrade` (×1) · `ms_first_elite` (×1) · `ms_map1_complete` (×1) · `ms_boss_first_kill` (×1) — บวก §15.2 source table (Tutorial/First upgraded/First Elite/Map1 = 1 ทุกอัน) และ §11.6 Boss First Kill bonus (×1)
- เสนอเปลี่ยนรางวัลทั้ง 5 เป็น: Gold/EXP/Potion/cosmetic (ไม่ใช่เสริมแกร่ง) — **แต่ดู R8**: ถ้าตัดทุก grant ผู้เล่นใหม่จะไม่มีทางได้เสริมแกร่งชิ้นแรกมาลองระบบตีบวกเลยจนถึงบอส P2B
- **ข้อเสนอแนะ:** พิจารณาคง **grant สอนระบบ 1 ชิ้นครั้งเดียว** (`ms_enhancement_ready`) เป็นข้อยกเว้น "learning grant" (ไม่นับใน target output) เพื่อให้ tutorial ตีบวกใช้งานได้ — หรือยอมรับว่าระบบตีบวก P2 inert จนถึง P2B (R8)

**R6 — v15 §33 Enhancement Audio: fail/crack/เสียงลุ้น หมดความหมาย — amend เมื่อไหร่?**
§33.1 "เสียงลุ้นก่อนผลออก" · §33.3 ล้มเหลว · §33.4 รอยร้าว = ไม่มีเหตุการณ์ให้เล่นแล้ว (ไม่มี fail/crack/ลุ้น) · §33.5 "แกร่ง" (พิธี "นี่คือแกร่ง") = ยิ่งสำคัญขึ้น (ทุกครั้ง = พิธีสำเร็จ) · จุดลุ้นย้ายไป **เสียง drop เสริมแกร่งจากบอส** (§8)
- เสนอ: mark §33.1/33.3/33.4 superseded-for-reinforcement ตอนนี้ (ทำแล้วในเอกสารนี้) · **re-spec audio เต็ม เลื่อนไปเฟสผลิตเสียง** (L5 งบ audio 50,000฿) — ขอ **ยืนยัน timing** ว่ารอเฟส audio production หรืออยากให้ร่าง audio brief ใหม่ก่อน

**R7 — เศษเสริมแกร่ง (item+exchange UI+recipe) อยู่เฟสไหน? P2 หรือ P2B?**
Economy §15.3 ตัด fragment ออกจาก P2 เพื่อลด scope · ข้อความที่ 2 พลิกกลับ = เพิ่ม item + หน้าแลก + recipe เข้ามาใหม่
- เสนอ: **P2B** (คู่กับบอส เพราะแหล่งดรอปเศษน่าจะผูกกับ content พิเศษที่มาตอน P2B อยู่แล้ว — R3) · P2 ทำแค่ config/flag ของ item ไว้ก่อน
- **ข้อเสนอแนะ:** ยืนยัน P2B เพื่อไม่ขยาย scope P2-10/P2-11 กลางคัน

**R8 — P2 ไม่มีแหล่งเสริมแกร่งเลย (บอส=P2B): ระบบตีบวก "มีจอแต่ใช้ไม่ได้" ใน P2 — intended? (สำคัญ กระทบ scope P2-10)**
Map 1 baseline: normal/elite = 0%, special elite = 0% (Map 1 ยังไม่มี), boss = P2B → **ก่อน P2B ไม่มีทางได้เสริมแกร่งบน Map 1** · ถ้าตัด milestone grant (R5) ด้วย = ระบบตีบวกใน P2 ไม่มีวัสดุ input เลย
- เสนอเลือก: (ก) ยอมรับว่า **enhancement UI ship ใน P2 แต่ยัง "ใช้ไม่ได้จริง" จนถึง P2B** (มีจอ + NO_REINFORCEMENT state ตลอด) · (ข) ให้ **learning grant 1 ชิ้น** (R5) เป็น bootstrap เดียวใน P2 · (ค) เปิด special elite Map 1 เร็วขึ้นให้มี source ใน P2
- **ข้อเสนอแนะ:** (ข) ปลอดภัยสุดต่อ UX (ผู้เล่นได้ลองระบบ) โดยไม่แตะความหายากของ end-game

**R9 — Enhancement stat multiplier +6..+15 ยังไม่มี (เพดาน +15 ไม่มีความหมายเชิงพลังจนกว่าเคาะ)**
Economy §16.3 นิยาม multiplier แค่ +0..+5 (1.00→1.35) · เพดานใหม่ +15 ต้องมี multiplier +6..+15 → เป็น Design Knob ต้องผ่าน §59.4
- เสนอ: ให้ทีม balance ร่าง curve +6..+15 เป็น spec-update proposal (mark PENDING OWNER) — ขอ owner **ยืนยันว่าต้องการ balance table นี้ตอน P2B (คู่บอส)** หรือเร็วกว่า

**R10 — ยืนยัน rename materialId `upg_kraeng` → `upg_reinforcement` (ปักธงก่อน P2-16 apply DB)**
owner ให้ id ใหม่ `upg_reinforcement` ชัดในข้อความที่ 1 · ตอนนี้ยังไม่มี production save data (DB ว่างถึง P2-16) = เปลี่ยน id ได้ฟรี · หลัง apply DB จริง = id ล็อก (กฎ E1/persona)
- ขอ **ยืนยัน** ว่าใช้ `upg_reinforcement` เป็น canonical materialId ตั้งแต่ P2-09/P2-10 (แทน `upg_kraeng` เดิมทุกที่) — งาน rename ต้องเสร็จ **ก่อน** P2-16

---

## 12. หมายเหตุ audit เพิ่มเติม (พบระหว่างอ่าน spec จริง)

1. **v15 lines 475–478 / 511–512** ("เศษแกร่ง/แกร่ง" ใต้ **World Boss "รากแรกแห่งรอยแยก"** + **Raid Reward**) = **สอดคล้อง** philosophy ใหม่ (World Boss/Raid = แหล่งพิเศษ/hard content ที่อนุญาต) — ต้องแค่ **rename** (แกร่ง→เสริมแกร่ง, เศษแกร่ง→เศษเสริมแกร่ง) ไม่ใช่ supersede เชิงพฤติกรรม
2. **Economy §15.2 source table** ระบุ Kraeng income "2–4 ชิ้น/ชั่วโมง" (§15.4) — ขัดกับ target output ใหม่ "0–3 ชิ้น/สัปดาห์" อย่างรุนแรง (เดิมคิดเป็น/ชั่วโมง เพราะดรอปจาก normal mob; ใหม่คิดเป็น/สัปดาห์ เพราะ boss-only) = §15 ทั้ง section ถูก supersede โดย §4 ของเอกสารนี้
3. **Achievement `enh_plus_15` "ใจถึง ได้ +15"** = **สอดคล้อง**เพดาน +15 ใหม่แล้ว (ไม่ต้องแก้ — ยืนยันตามที่ orchestrator ตรวจ)
4. **Economy §16.3 multiplier** หยุดที่ +5 → ดู R9
