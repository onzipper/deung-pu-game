# ดึ๋งปุ๊ — Owner Production Decisions: P2B–Launch Baseline

> **ไฟล์:** `deungpu_OWNER_PRODUCTION_DECISIONS_P2B_TO_LAUNCH_v1.md`  
> **สถานะ:** `APPROVED BASELINE — READY FOR SPEC AMENDMENT`  
> **วันที่:** 2026-07-12  
> **ขอบเขต:** Guest Account, Boss Philosophy, Companion Concept Process, Audio Production, Bot Economy, Monetization, Market Economy, Hall of Fame, RBAC, Art Production, Closed Alpha Gates และ Cross-phase Operating Decisions  
> **หลักการ:** เอกสารนี้ปิด decision ระดับ Owner ให้ทีมสามารถทำงานต่อได้โดยไม่ต้องถามซ้ำ เว้นแต่ผล Playtest หรือ Telemetry ขัดกับ baseline อย่างมีนัยสำคัญ

---

## 0.0 Amendment Log — (2026-07-13) — Bot Economy Final + Production Path (D-063/D-065)

ไฟล์นี้แก้ **in-place** ตาม `docs/spec-update-playbook.md` โหมด A (ห้าม rename/สร้างไฟล์ใหม่). Owner เคาะปิด L1 (bot/เศรษฐกิจ) + production path (เสียง/art/launch scope) 2026-07-13. decision records = `docs/decisions/D-063-bot-economy-final.md`, `docs/decisions/D-065-production-path.md` (ทั้งคู่ Locked). เอกสารนี้บันทึกเฉพาะจุด supersede/หมายเหตุ — **additive, เนื้อเดิมคงไว้เพื่อ history**.

Delta:

1. **§6.3 Tier Baseline `hoursPerDay` (Free/Plus/Pro)** — **SUPERSEDED โดย D-063**: ทุก tier `hoursPerDay` เท่ากันหมด (24/7, ไม่จำกัดชั่วโมง) รวม Free — ความต่างระหว่าง tier ยังคงเป็น `profiles`/`rules`/`reportRetentionDays`/`notifications`/`schedules`/`analytics` ตามเดิม (ค่าพวกนี้ยังมีผล ไม่ supersede)
2. **§6.6 Price Baseline (`plusMonthly: 99` / `proMonthly: 199` / `supporterMonthly: 299`)** — **SUPERSEDED โดย D-063**: เปลี่ยนโมเดลจากรายเดือน → **duration pass 1/10/30 วัน** นับอายุจริงจากวันซื้อ ไม่มี pause · ราคา canon: Plus 9/39/79฿ · Pro 15/69/149฿ · Supporter (cosmetic รายเดือน) พักไว้ ตัดสินหลัง beta
3. **§18 Launch Scope Gates → "Beta" (Maps 1–7)** — หมายเหตุ re-scope (ไม่ supersede เนื้อเดิม เพราะเป็นแผนเดิมที่ยังอ้างอิงได้): ตาม D-065 **Open Beta = ระบบครบ + Map 1 เท่านั้น** ไม่ต้องรอ Maps 1–7 ครบก่อนเปิด — Map 2–10 ทยอย develop แล้วปล่อยเป็นรอบ ๆ หลัง beta

---

# 0. Decision Authority

เอกสารนี้เป็น Owner-approved production baseline

กติกา:

1. ทุกค่าที่เป็น balance ต้องอยู่ใน versioned config
2. ทุกระบบต้องมี telemetry
3. ทุกระบบ live ต้องมี disable/rollback path
4. หาก playtest ขัดกับ baseline ให้แก้ผ่าน decision record
5. ห้ามเปลี่ยน semantic เงียบใน code
6. เงิน, monetization, entitlement และ high-value economy mutation ต้อง audit
7. Mobile เป็น acceptance gate จริง
8. Shared world เป็นค่าเริ่มต้น
9. ความสะดวกซื้อได้ แต่ชัยชนะซื้อไม่ได้
10. Bot เป็นผู้ช่วย ไม่ใช่ผู้เล่นแทนเจ้าของ

---

# 1. P2 — Guest → Email Upgrade

## 1.1 Final Decision

P2 เปิดให้ Guest ผูกบัญชีกับ Email ได้โดย **ยังไม่บังคับ Email Verification**

Verification เปิดก่อน Closed Alpha ภายนอก

```yaml
guestUpgrade:
  p2EmailVerificationRequired: false
  closedAlphaEmailVerificationRequired: true
  preserveCharacter: true
  preserveInventory: true
  preserveProgress: true
  preserveAchievements: true
  preserveEntitlements: true
```

## 1.2 Account Flow

```txt
Guest Account
→ เลือก “ผูกบัญชีกับอีเมล”
→ กรอก Email
→ กรอก Email ซ้ำ
→ ตั้ง Password
→ ยืนยันสรุปบัญชี
→ Server ตรวจ Email unique
→ Upgrade account แบบ transaction เดียว
→ Session เดิมยังอยู่
→ Character/Inventory/Progress ไม่เปลี่ยน
```

## 1.3 Email Rules

```yaml
email:
  normalize:
    trimWhitespace: true
    lowercaseDomain: true
    lowercaseFullAddressForUniqueness: true
  unique: true
  maxLength: 254
  confirmationFieldRequired: true
```

ห้าม:

- copy character ไป account ใหม่
- upgrade แบบสอง transaction
- สร้าง account ใหม่ก่อนแล้วค่อย merge แบบ best effort
- allow duplicate email
- เปลี่ยน email โดยไม่ re-authenticate

## 1.4 Password Baseline

```yaml
password:
  minLength: 10
  maxLength: 128
  requireUppercase: false
  requireLowercase: false
  requireNumber: false
  requireSymbol: false
  rejectCommonPasswords: true
  hashing: argon2id-or-equivalent
```

เหตุผล: ใช้ passphrase-friendly policy ดีกว่าบังคับ pattern ที่ทำให้ผู้ใช้ตั้งรหัสเดาง่าย

## 1.5 Guest Warning

แสดงครั้งแรกและใน Account Settings:

> บัญชี Guest ผูกกับอุปกรณ์และเบราว์เซอร์นี้ หากล้างข้อมูลเบราว์เซอร์ อาจไม่สามารถกู้บัญชีได้

ไม่แสดง modal ทุก session

## 1.6 Verification Rollout

ก่อน Closed Alpha:

- เปิด SMTP
- ส่ง verify link
- link อายุ 24 ชั่วโมง
- resend cooldown 60 วินาที
- จำกัด 5 ครั้งต่อชั่วโมง
- verified email จำเป็นสำหรับ:
  - password reset
  - payment
  - trade/market
  - account recovery
  - external alpha access

## 1.7 Error States

| Error | Behavior |
|---|---|
| Email used | ห้าม merge อัตโนมัติ |
| Upgrade duplicate submit | ใช้ idempotency key |
| Network interrupted | query authoritative account state |
| Password weak | local + server validation |
| Session expired | re-auth guest session |
| Conflict with existing account | support flow, ไม่ overwrite |
| Email typo | confirmation screen + double entry |

## 1.8 Telemetry

```txt
guest_upgrade_open
guest_upgrade_start
guest_upgrade_success
guest_upgrade_fail
guest_upgrade_conflict
email_verify_sent
email_verify_success
email_verify_expired
```

## 1.9 Acceptance Criteria

- Upgrade แล้ว character id เดิม
- Inventory instance id เดิม
- ไม่มี duplicate account
- refresh แล้วยังเข้า account เดิม
- transaction retry ไม่สร้าง account ซ้ำ
- P2 เล่นต่อได้แม้ unverified
- Closed Alpha gate ตรวจ verified status ได้

---

# 2. P2B — Boss Design Philosophy

## 2.1 Core Ratio

Boss ตัวแรกใช้ baseline:

```txt
70% Skill Check
20% Team Coordination
10% Gear Check
```

Gear ช่วยให้ผ่านเร็วขึ้น แต่ไม่แทนการอ่านท่า

## 2.2 Universal Boss Rules

Boss ทุกตัวต้อง:

1. มี telegraph ชัด
2. มีอย่างน้อย 1 positioning test
3. มีอย่างน้อย 1 Break interaction
4. ไม่มี unavoidable one-shot
5. มี recovery window
6. มี phase escalation
7. มี fail reason ที่อ่านออก
8. รองรับ mobile
9. reward participation ไม่ใช่ last hit
10. ไม่เป็น HP sponge

## 2.3 First Boss Structure

### Phase 1 — Learn

- Basic attack
- Line charge
- Circle slam
- Guard Gauge

### Phase 2 — Pressure

เริ่มที่ HP 65%

- เพิ่ม combo
- เพิ่ม arena denial
- เพิ่มท่าที่ Break หยุดได้
- ไม่มี hard wipe

### Soft Enrage

เริ่มที่ HP 20%

- attack cadence เร็วขึ้น 15%
- recovery สั้นลง 10%
- arena safe area ลดลง
- damage ไม่เพิ่มเกิน 10%

## 2.4 Break Baseline

```yaml
break:
  guardGauge: enabled
  breakWindowSeconds:
    solo: 6
    party: 8
  damageMultiplier:
    solo: 1.25
    party: 1.20
  bossActionDuringBreak: disabled
```

## 2.5 Target Encounter Time

```yaml
targetKillTime:
  soloSeconds: 150-240
  partySeconds: 60-120
```

## 2.6 Failure Rules

- ตายแล้วรู้ว่าถูกท่าอะไร
- Combat Summary แสดง last 5 damage events
- ไม่มี item loss
- ไม่มี real-money revive
- retry loop ไม่เกิน 60 วินาที

## 2.7 Reward Philosophy

ทุก clear ได้ meaningful reward

Guaranteed:

- Gold
- EXP
- Boss material
- แกร่ง
- Journal progress

Chance:

- Rare equipment
- Cosmetic
- Lore item

First Kill:

- one-time reward
- achievement
- bonus แกร่ง
- boss lore entry

---

# 3. P2B — ดึ๋งๆ Companion Concept Process

## 3.1 Final Process

ทีมต้องเสนอ 3 concept

1. Living Talisman
2. Resonance Seed
3. Knotted Cloth Spirit

ชื่อเป็น working direction ไม่ใช่ canon

## 3.2 Mandatory Constraints

- silhouette จำได้ที่ 32px
- ไม่เหมือน slime
- ไม่เหมือน pet generic
- ไม่ใช้ corruption magenta เป็น main color
- ไม่ใช้ legendary gold เป็น main color
- ไม่บดบัง telegraph
- ไม่ดูเหมือน combat summon
- ไม่ดูเหมือน Bot A
- ทำ 12 animations ได้
- รองรับ cosmetic variants

## 3.3 Required Deliverables

ต่อ concept:

- black silhouette
- isometric view
- idle
- happy
- worried
- alert
- scale beside player
- HUD icon 24/32/48
- palette
- animation cost
- cosmetic sample
- lore pitch
- production risks

## 3.4 Scoring

| Criterion | Weight |
|---|---:|
| Silhouette | 25 |
| Uniqueness | 15 |
| Small-size readability | 15 |
| Animation feasibility | 15 |
| Lore fit | 10 |
| Emotional range | 10 |
| Cosmetic extensibility | 5 |
| Combat non-obstruction | 5 |

## 3.5 Default Recommendation

หากคะแนนใกล้กัน ให้เลือก **Living Talisman**

เหตุผล:

- lore fit สูง
- animation cost คุมง่าย
- cosmetic ทำง่าย
- ไม่เหมือน slime
- มี identity แบบเอเชียแฟนตาซี

---

# 4. P2B — Help, Tutorial และ Achievement Review

## 4.1 Tone

ดึ๋งๆ:

- ช่วยเหลือ
- ขี้สงสัย
- ไม่รู้ทุกอย่าง
- ไม่พูดมุกทุกบรรทัด
- ไม่ตำหนิผู้เล่น
- ไม่ใช้ศัพท์ระบบโดยไม่จำเป็น

## 4.2 Tutorial Rule

หนึ่ง prompt สอนหนึ่ง action

เวลาอ่าน:

- tutorial prompt: 3–7 วินาที
- help article summary: 10–20 วินาที
- detail article: ไม่เกิน 90 วินาที

## 4.3 Achievement Seed 50

สัดส่วน:

```yaml
achievementSeed:
  progression: 10
  combatMastery: 10
  exploration: 8
  social: 6
  economyItem: 6
  hiddenMeme: 6
  failureRecovery: 4
```

## 4.4 Achievement Guardrails

ห้าม:

- pure RNG achievement
- pay-to-achieve
- severe login streak FOMO
- spend-money achievement
- bot-only achievement
- impossible hidden trigger

ทุก hidden achievement ต้องมี clue

---

# 5. P2B — Audio Production Strategy

## 5.1 Final Model

ใช้ **Hybrid Production**

### Original / Commission

ต้อง original:

- Main Theme
- ดึ๋งปุ๊ Motif
- City Theme
- Map 1 Theme
- Boss Theme
- Upgrade signature
- Companion motif
- Legendary sting

### Licensed Assets

ใช้ได้:

- footsteps
- cloth
- metal
- generic impacts
- nature ambience
- weather
- UI base sounds
- generic whoosh

ต้อง edit/layer/pitch ไม่ใช้ raw pack ตรง ๆ

### AI-Assisted

ใช้ได้สำหรับ:

- prototype
- mood draft
- variation
- ambient texture
- placeholder
- composition exploration

ห้ามใช้ final output โดยไม่:

- ตรวจ license
- human edit
- stem cleanup
- loudness review
- loop review

## 5.2 Phase Budget Priority

### P2B

- Map 1 music
- Boss music
- core combat SFX
- core UI SFX
- upgrade SFX
- companion temp motif

### Closed Alpha

- City music
- ambience
- class skill set
- rare/legendary cues
- achievement/help cues

### Beta

ขยาย 72-item baseline

## 5.3 Technical Audio Baseline

```yaml
audio:
  format:
    music: ogg
    sfx: ogg-or-wav-source
  musicLoop:
    crossfadeMs: 800
  maxSimultaneousSfx:
    desktop: 32
    mobile: 20
  loudness:
    musicIntegratedLUFS: -16
    sfxPeakDb: -1
  ownershipMix:
    local: 1.0
    party: 0.75
    stranger: 0.5
```

## 5.4 Remote Juice “เบากว่า 1 ระดับ”

```yaml
remoteCombatPresentation:
  party:
    vfxIntensity: 0.75
    sfxIntensity: 0.75
    cameraShake: 0
    hitStop: 0
  stranger:
    vfxIntensity: 0.50
    sfxIntensity: 0.50
    cameraShake: 0
    hitStop: 0
```

Local player retains full client juice

---

# 6. P3 — Bot Economy

## 6.1 Philosophy

Bot ขาย:

- เวลา
- continuity
- report
- rules
- history
- alerts
- presets

Bot ห้ามขาย:

- stat
- drop rate
- EXP multiplier
- boss auto-clear
- secret choice
- rare decision
- PvP advantage

## 6.2 Efficiency Target

```yaml
botEfficiency:
  versusEfficientManual:
    min: 0.60
    target: 0.70
    max: 0.80
```

Manual expert ต้องดีที่สุด

## 6.3 Tier Baseline

> **`hoursPerDay` ทุก tier ด้านล่าง — SUPERSEDED โดย D-063 (2026-07-13) → §0.0 ด้านบน**: ทุก tier 24/7 ไม่จำกัดชั่วโมงเท่ากันหมด รวม Free (ค่า `hoursPerDay` ที่เหลืออยู่ในบล็อก yaml ด้านล่างเป็น history เดิม ไม่ใช่ค่าที่ใช้จริงอีกต่อไป). ค่าอื่นในแต่ละ tier ยังมีผลตามเดิม.

### Free

```yaml
free:
  hoursPerDay: 1
  profiles: 1
  rules: 3
  reportRetentionDays: 1
  notifications: false
  schedules: false
```

### Plus

```yaml
plus:
  hoursPerDay: 4
  profiles: 3
  rules: 10
  reportRetentionDays: 14
  notifications: true
  schedules: 2
```

### Pro

```yaml
pro:
  hoursPerDay: 8
  profiles: 10
  rules: 25
  reportRetentionDays: 90
  notifications: true
  schedules: 10
  analytics: advanced
```

## 6.4 Output Cap

Bot ไม่มี direct loot multiplier

Cap ใช้:

- runtime hour
- inventory
- potion threshold
- durability/future condition
- death count
- rare drop stop
- gold cap alert

## 6.5 Mandatory Stop Conditions

ทุก tier:

- inventory full
- HP potion exhausted
- player death threshold
- disconnect
- map unsafe
- rare/high-value item found
- boss/event encounter
- secret trigger
- captcha/anti-abuse challenge

## 6.6 Price Baseline

> **บล็อก yaml ด้านล่าง — SUPERSEDED โดย D-063 (2026-07-13) → §0.0 ด้านบน**: โมเดลรายเดือน (`*Monthly`) เปลี่ยนเป็น **duration pass 1/10/30 วัน** — ราคา canon: Plus 9/39/79฿ · Pro 15/69/149฿ · Supporter พักไว้ตัดสินหลัง beta (ยังไม่ใช่ monthly cosmetic ที่เคาะแล้ว)

ราคายังเป็น tunable แต่ production proposal ใช้:

```yaml
pricingTHB:
  plusMonthly: 99
  proMonthly: 199
  supporterMonthly: 299
```

Supporter ได้ cosmetic/support badge ไม่เพิ่ม bot power

## 6.7 Bot A Intro

30–60 วินาที

ต้องสอน:

- Bot ทำอะไร
- Bot ไม่ทำอะไร
- stop condition
- inventory full
- rare item stop
- report
- how to stop immediately

---

# 7. P3 — Bot UI Spec Scope

ต้องมีเล่มแยก:

```txt
deungpu_P3_BOT_AND_REPORT_UI_IMPLEMENTATION_SPEC_v1.md
```

หน้าที่ต้องครอบ:

- bot setup
- rule builder
- stop conditions
- schedule
- live status
- report summary
- detailed report
- rare event alert
- error/recovery
- tier comparison
- upgrade CTA แบบไม่กดดัน

---

# 8. P4 — Monetization Structure

## 8.1 Revenue Pillars

1. Cosmetic
2. Bot convenience
3. Account convenience
4. Supporter pack
5. Seasonal cosmetic track

## 8.2 Allowed Sales

- costume
- weapon skin
- companion cosmetic
- emote
- nameplate
- UI theme
- bot report/history
- bot presets
- character slot future
- storage expansionแบบไม่แก้ pain ที่สร้างเอง
- cosmetic audio

## 8.3 Forbidden Sales

- stats
- แกร่ง
- success chance
- protection item from designed pain
- drop rate
- strong EXP boost
- boss power
- PvP power
- tax immunity
- guaranteed legendary

## 8.4 Premium Currency

Launch ใช้ไม่เกิน 1 premium currency

Rules:

- conversion โปร่งใส
- แสดงราคาเงินจริงเทียบ
- ไม่มีหลายชั้น
- ไม่มี expiry
- refund log
- entitlement audit

---

# 9. P4 — Payment Gateway

## 9.1 Gateway Selection Criteria

ต้องรองรับ:

- Thailand
- PromptPay
- card
- webhook
- refund
- sandbox
- tax invoice support
- fraud monitoring
- settlement report

## 9.2 Recommended Baseline

เลือกผู้ให้บริการไทยที่มี:

- PromptPay QR
- card
- API/webhook
- merchant dashboard
- production support

ห้าม implement payment logic ผูก vendor ลึกเกินไป

สร้าง abstraction:

```txt
createPayment
verifyWebhook
capture
refund
queryStatus
```

## 9.3 Payment Rules

- server authoritative
- webhook idempotent
- entitlement grant หลัง verified payment
- no client trust
- refund revokes entitlement ตาม policy
- audit before/after
- payment unknown state recovery

---

# 10. P4 — Market Economy

## 10.1 Baseline

```yaml
market:
  listingFeePercent: 1.5
  saleTaxPercent: 5
  listingDurationsHours:
    - 24
    - 48
    - 72
  baseListingSlots: 8
  maxListingSlotsP4: 20
  cancelRefundListingFee: false
  priceBandWarningPercent: 50
```

## 10.2 Price Band

Warning only

- ต่ำกว่าค่ากลาง 50%
- สูงกว่าค่ากลาง 50%

ห้ามบังคับราคา

## 10.3 Anti-Abuse

- high-value audit
- circular trade detection
- wash trading telemetry
- suspicious price alert
- account age rule
- unverified account cannot list
- rate limit
- item ownership lock during listing

## 10.4 Market UI Spec

แยกเล่ม:

```txt
deungpu_P4_MARKET_UI_IMPLEMENTATION_SPEC_v1.md
```

---

# 11. P5 — Hall of Fame

## 11.1 Categories

### Combat

- First Clear
- Fast Clear
- Highest Break contribution
- Longest survival

### Exploration

- Secret discovery
- Lore completion
- Map mastery

### Social

- Assist
- Revive
- Party contribution
- Event participation

### Economy

- Merchant contribution
- Craft/upgrade milestones
- market reputation

### Meme/Secret

- unusual death
- strange encounter
- hidden behavior

## 11.2 Rewards

Allowed:

- title
- nameplate
- statue
- board
- cosmetic
- journal record
- temporary town recognition

Forbidden:

- permanent stat
- drop advantage
- market dominance
- exclusive power

## 11.3 Weekly World Condition Calendar

ต้องมี 8-week rotation baseline:

1. Abundant Herbs
2. Restless Wildlife
3. Resonance Surge
4. Merchant Caravan
5. Fog Week
6. Elite Migration
7. Festival Week
8. Calm Recovery Week

ไม่มี event ที่พลาดครั้งเดียวแล้วเสีย power ถาวร

---

# 12. P6 — RBAC

## 12.1 Roles

### Owner

Full access

### LiveOps Lead

- event
- announcement
- config rollout
- economy dashboard
- feature flags
- no secret credentials

### Game Designer

- balance draft
- content schedule
- config proposal
- no direct production deploy

### Support

- account lookup
- mute/ban
- restore through approved workflow
- no direct gold/item mutation without approval

### Developer

- logs
- diagnostics
- flags
- deploy
- no production economy grant by default

### QA

- test environment
- test data
- read-only production metrics

## 12.2 Sensitive Actions

Require dual approval:

- grant rare/legendary
- grant premium currency
- account rollback
- market rollback
- mass ban
- economy config change >10%
- live drop rate change >20%

## 12.3 Audit Log

```yaml
audit:
  actor
  role
  timestamp
  action
  target
  before
  after
  reason
  ticket
  ip
```

---

# 13. P6 — Monitoring and Alert Policy

## 13.1 Sentry Rollout

เปิดก่อน external Closed Alpha

Track:

- client crash
- server error
- auth failure
- payment webhook failure
- inventory transaction failure
- duplicate mutation
- room disconnect spike

## 13.2 Alert Thresholds

```yaml
alerts:
  crashFreeSessionsBelowPercent: 98
  authFailureRateAbovePercent: 5
  paymentWebhookFailureAbovePercent: 1
  inventoryMutationFailureAbovePercent: 0.5
  reconnectFailureAbovePercent: 5
  serverErrorRateAbovePercent: 2
```

## 13.3 Severity

### P0 Incident

- data loss
- duplication
- payment mismatch
- security breach
- widespread login failure

Response: disable affected feature immediately

### P1

- major gameplay blocked
- boss unusable
- market broken
- high reconnect failure

Response: feature flag off / hotfix

### P2

- degraded UX
- cosmetic issue
- minor balance anomaly

Response: next patch

---

# 14. Art Production Strategy

## 14.1 Final Model

Hybrid:

- Art Lead/Director 1 คน
- Commission เป็นชุด
- Asset pack เฉพาะพื้นฐาน
- AI ใช้ reference/exploration
- Final art ต้อง human-finished
- ยึด canvas/pivot/palette/manifest

## 14.2 Placeholder Policy

ใช้ Placeholder ได้ถึง Closed Alpha

ก่อน Open Beta ต้องผ่าน Art Readiness Gate

## 14.3 Final Art Priority

1. Main player class
2. ดึ๋งๆ
3. Map 1 monsters
4. Boss Map 1
5. City landmarks
6. HUD core
7. Item icons
8. Combat VFX
9. Map 1 environment
10. Main NPCs

## 14.4 Art Complete Definition

Asset ถือว่า final เมื่อ:

- silhouette pass
- grayscale pass
- mobile readability pass
- palette audit pass
- pivot pass
- animation manifest pass
- low/medium/high quality pass
- no telegraph obstruction
- source files archived
- license/ownership recorded

## 14.5 Production Budget Rule

ห้าม commission รายชิ้นกระจายโดยไม่มี style owner

ทุก batch ต้องมี:

- brief
- palette
- canvas
- pivot
- animation list
- revision count
- delivery format
- commercial rights
- source file rights

---

# 15. Closed Alpha Success Criteria

## 15.1 Technical Gate

```yaml
closedAlphaTechnical:
  crashFreeSessionsPercent: ">=98"
  criticalDataLoss: 0
  itemDuplication: 0
  paymentSystem: not-required-until-enabled
  reconnectSuccessPercent: ">=95"
  sixtyMinuteSessionPass: true
  mobileCriticalCrash: 0
```

## 15.2 UX Gate

ผู้เล่นอย่างน้อย 80% ต้องทำเองได้:

- create character
- move
- attack
- use skill
- collect item
- equip item
- buy/sell
- upgrade
- open help
- respawn

## 15.3 Combat Gate

- 80% อ่าน basic telegraph ได้
- 70% เข้าใจ Break ภายใน 2 attempts
- boss clear rate 40–70% ใน first session
- mobile failure จาก control <20%
- remote VFX ไม่บดบัง danger
- death fairness score >=3.5/5

## 15.4 Economy Gate

- ไม่มี gold starvation
- potion cost meaningful
- inventory fill time 20–45 นาที
- first upgrade reach 20–40 นาที
- ไม่มี item category ที่ผู้เล่นมองว่าไร้ค่า >30%
- source/sink ratio อยู่ในกรอบ proposal

## 15.5 Product Gate

ผู้เล่นอย่างน้อย 70% อธิบาย core loop ได้:

> ออกล่า → ได้ของ/เงิน/EXP → จัดของ/ขาย/ตีบวก → กลับไปล่าเก่งขึ้น

## 15.6 Expansion Rule

ไป expanded alpha เมื่อ:

- blocker = 0
- data loss = 0
- core loop understood
- tuning issues มากกว่า design confusion
- support load manageable
- Render paid trigger satisfied

---

# 16. Background Tab Playtest

## 16.1 Candidate Values

```yaml
solo:
  safeZone: 60
  fieldIdle: 30
  combat: 15
party:
  grace: 150
```

ยังเป็น playtest baseline

## 16.2 Final Decision Method

ทดสอบ:

- 15/30/60
- party 120/150/180

เลือกจาก:

- reconnect success
- ghost seat
- correction
- death
- party disruption
- mobile app switching
- server occupancy

## 16.3 Default Choice หากผลใกล้กัน

- solo safe: 60
- field idle: 30
- combat: 15
- party: 150

---

# 17. Ops and Business

## 17.1 Render Paid Trigger

อัปเกรดเมื่อเกิดข้อใดข้อหนึ่ง:

- external users >5
- test >60 minutes
- real persistence data
- P2 integration environment

## 17.2 Database Backup

```yaml
mysqlBackup:
  daily: true
  retentionDays: 14
  weeklyRetentionWeeks: 8
  preMigrationSnapshot: true
  restoreDrillQuarterly: true
```

## 17.3 Domain

- test ใช้ softrock.space
- launch ใช้ domain จริง
- redirect test domain ไป official หลัง launch
- auth callback และ email link ใช้ official domain ก่อนเปิด payment

## 17.4 Legal

ก่อน external player:

- Privacy Policy
- Terms of Service
- Cookie/analytics disclosure
- PDPA consent
- account deletion request
- data export/contact channel
- payment/refund policy

Draft ได้ แต่ต้อง legal review ก่อน launch

---

# 18. Launch Scope Gates

## Closed Alpha

- Map 1
- one class primary
- core account
- inventory/shop/upgrade
- first boss
- help
- achievement seed
- no real market
- no full monetization

## Expanded Alpha

- Maps 1–4
- second class
- more boss/content
- bot early
- economy telemetry

## Beta

- Maps 1–7
- market
- monetization
- liveops
- final core art
- verified email
- legal complete

> **หมายเหตุ re-scope (D-065, 2026-07-13 → §0.0 ด้านบน, ไม่ supersede):** **Open Beta = ระบบครบ + Map 1 เท่านั้น** — ไม่ต้องรอ Maps 1–7 ครบก่อนเปิด Open Beta อีกต่อไป; Map 2–10 ทยอย develop แล้วปล่อยเป็นรอบ ๆ หลัง beta

## Launch

- stable Maps 1–10 plan
- liveops
- payment
- market
- bot tiers
- support
- monitoring
- official domain
- backup restore tested

---

# 19. Required Documents

ทีมต้องสร้าง/แก้:

1. `deungpu_MAP_1_ECONOMY_AND_LOOT_PROPOSAL_v1.md`
2. `deungpu_MAP_1_BOSS_KIT_PROPOSAL_v1.md`
3. `deungpu_P3_BOT_AND_REPORT_UI_IMPLEMENTATION_SPEC_v1.md`
4. `deungpu_P4_MARKET_UI_IMPLEMENTATION_SPEC_v1.md`
5. `deungpu_CLOSED_ALPHA_TEST_PLAN_v1.md`
6. `deungpu_AUDIO_PRODUCTION_PLAN_v1.md`
7. `deungpu_ART_PRODUCTION_PLAN_v1.md`
8. `deungpu_LIVEOPS_RBAC_AND_INCIDENT_POLICY_v1.md`
9. `deungpu_WEEKLY_WORLD_CONDITION_CALENDAR_v1.md`
10. `deungpu_LEGAL_READINESS_CHECKLIST_v1.md`

---

# 20. Definition of Done for Owner Decisions

Decision ในเอกสารนี้ถือว่าถูกนำไปใช้ครบเมื่อ:

- [ ] decision-index อัปเดต
- [ ] Game Spec amend
- [ ] Tech Spec amend เฉพาะ implementation
- [ ] issue breakdown อ้าง source
- [ ] config keys ถูกกำหนด
- [ ] telemetry ถูกกำหนด
- [ ] rollback/disable path มี
- [ ] QA acceptance มี
- [ ] ไม่มี source of truth ซ้ำ
- [ ] เอกสารที่ superseded ถูก mark
