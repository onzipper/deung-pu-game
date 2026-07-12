# ดึ๋งปุ๊ — Owner Decision Book

> ไฟล์: `deungpu_OWNER_DECISIONS_v1.md`  
> สถานะ: **v1.0 — Owner-delegated production baseline**  
> โปรเจกต์: **ดึ๋งปุ๊ — True 2D Isometric Web MMORPG**  
> Canonical references: `deungpu_project_checkpoint_v15_p0_scope_lock_ready.md`, `deungpu_technical_architecture_v1_5_p0_scope_lock.md`, `deungpu_ENGINE_FOUNDATION_DECISIONS_v1.md`, `deungpu_MAP_LAYOUT_BIBLE_v1.md`, `deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md`  
> วัตถุประสงค์: ปิด Owner Decision Queue หลัง P0+P1 เพื่อให้ Tech แตก P2 และงาน Content/Asset ต่อได้โดยไม่ต้องเดา

---

## 0. Decision Authority

เอกสารนี้ถือเป็น **Owner-delegated decision baseline** ตามคำสั่งให้เคาะและจัดการต่อได้เลย

กติกา:
- ตัวเลข balance ทุกค่าต้องอยู่ใน versioned config และ tune ได้โดยไม่ deploy
- การแก้ field semantics ต้องผ่าน design canonical schema ก่อน
- ถ้าผล playtest ขัดกับค่าเริ่มต้น ให้แก้ด้วย telemetry + decision record ไม่แก้เงียบในโค้ด
- คำว่า “ล็อก” ในเล่มนี้หมายถึงล็อก **ทิศทางและค่า baseline สำหรับเฟสถัดไป** ไม่ได้ห้าม balance patch

---

# 1. Balance Decisions

## 1.1 Damage mitigation constant `k`

**Decision: ใช้ `k = 50` เป็น production baseline ของ P2**

เหตุผล:
- `DEF = 50` ลดความเสียหายประมาณ 50% เข้าใจง่าย
- ช่วงเลเวลต้นสามารถอ่านผลของ DEF ได้ชัด
- มี headroom สำหรับ Map 1–10 โดยไม่ทำให้ DEF ต่ำไร้ค่า
- เป็นค่ากลางของช่วงเสนอ 30–80 จึง tune ขึ้น/ลงได้โดยไม่รื้อสูตร

Implementation rules:
- เก็บใน versioned combat config ห้าม hardcode
- telemetry ต้องเก็บ effective DEF, pre-mitigation, post-mitigation
- รอบ tune แรกยอมให้ขยับช่วง 40–60 โดยไม่ถือว่าเปลี่ยนสูตร

## 1.2 นักดาบ Level 1–10 baseline

**Decision: รับรองตาราง draft ใน `deungpu_P1_BALANCE_PROPOSAL_v1.md` เป็น P2 baseline**

เงื่อนไข:
- ล็อก progression shape มากกว่าตัวเลขรายเลเวล: HP/DEF เด่น, ATK กลางสูง, Crit ไม่พุ่งเร็ว
- Level 1 ต้องเล่นง่ายและไม่ตายจากมอนปกติ 2–3 ตัวในไม่กี่วินาที
- Level 10 ต้องรู้สึกเก่งขึ้นอย่างเห็นได้ชัด แต่ยังไม่ล้าง Elite ด้วย basic attack
- ทุก stat ใช้ integer/fixed-point ตามหน่วยมาตรฐานของ server

## 1.3 Mob Map 1 baseline

**Decision: รับรองตาราง draft ของ ดึ๋งปุ๊/หมูพอง/Elite/Boss เป็น baseline**

เพิ่มเติมที่ล็อก:
- นกจิกปุ๊และหมูป่าที่ใช้ stat กลางชั่วคราว ต้องมี row แยกก่อน P2 content freeze
- Normal mob kill time เป้าหมาย: 2–5 วินาทีเมื่อ level/gear เหมาะสม
- Tanky normal: 4–8 วินาที
- Elite: 15–30 วินาที solo
- Field boss แรก: 2–4 นาที solo ที่เหมาะสม หรือ 45–120 วินาทีสำหรับ party เล็ก
- `tierReduction` เป็น config แยกตาม Normal/Elite/Boss ห้ามฝังใน class code

## 1.4 Skill table 5 classes

**Decision:**
- อนุมัตินักดาบ 4 สกิลตาม draft เป็น baseline
- อาชีพที่ 2 ให้ทำ **นักธนู**
- นักธนูทำ 3 สกิลแรกเพื่อทดสอบ ranged targeting, projectile, circle AoE และ multi-hit
- นักหอกเป็นอาชีพที่ 3, นักเวทที่ 4, นักอาคมที่ 5

เหตุผลเลือกนักธนู:
- เปิด risk ทางเทคนิคที่นักดาบไม่ครอบคลุม: ระยะยิง, projectile travel, target selection, multi-hit rounding
- ยังไม่ผูกกับ mana จึงไม่ block ที่ resource system
- เหมาะกับ rare-hunt fantasy ของเกม

## 1.5 Hit tolerance

**Decision: ยืนยันค่าปัจจุบัน**

```yaml
pointBlankToleranceTiles: 1.40
rangePaddingTiles: 0.35
arcPaddingDegrees: 20
```

Guardrails:
- เป็น server validation forgiveness ไม่ใช่ระยะสกิลจริงที่ UI โชว์
- เก็บ telemetry ของ rejected cast แยกตามเหตุผล
- ถ้า false-positive hit เกิน 3% ค่อยลด padding

## 1.6 Juice floor

**Decision: ยืนยัน floor ระดับ 1 สำหรับ kill และ crit**

- Kill: camera impulse ขั้นต่ำ 1 + hit-stop ขั้นต่ำ 1 สำหรับ local player
- Critical: hit-stop ขั้นต่ำ 1; camera impulse ใช้เมื่อเกิน damage threshold
- Accessibility setting ลด amplitude/ระยะเวลาได้ แต่ boss danger cue ห้ามถูกตัด
- ผู้เล่นอื่นเห็น effect เบากว่าเจ้าของสกิลหนึ่งระดับเพื่อลด visual noise

## 1.7 Resource pool

**Decision: Launch foundation ใช้ `cooldown-only`**

- `resourceCost` ใน schema คงไว้ แต่ default = 0
- ไม่มี Mana/Rage เป็น core stat ใน P2
- นักเวทและนักอาคม balance ด้วย cooldown, cast time, charges, positioning และ conditional mechanics
- resource class-specific เป็น future extension ได้ แต่ต้องผ่าน schema decision ใหม่

เหตุผล:
- ลด UI/UX และ bot logic complexity
- ไม่เพิ่ม stat ที่ยังไม่มี gameplay proof
- ทำให้ทั้ง 5 class ใช้ runtime แม่พิมพ์เดียวกันในช่วงแรก

## 1.8 Multi-hit rounding

**Decision: ปัดยอดรวมครั้งเดียว แล้วกระจายกลับเป็น sub-hit integer**

Algorithm:
1. คำนวณทุก sub-hit ด้วย fixed-point precision
2. รวม exact total
3. round total เป็น integer damage ที่ authoritative
4. กระจาย integer ไปแต่ละ hit ตามสัดส่วน พร้อม remainder distribution แบบ deterministic

ผลลัพธ์:
- ไม่มี bias จากการปัดเศษซ้ำหลาย hit
- จำนวนบนจอรวมตรงกับ HP ที่ลดจริง
- proc ต่อ hit ยังทำงานจาก hit list เดิม

## 1.9 Damage type / resistance

**Decision: P2 ใช้ DEF เดียว**

- `damageType` คงไว้เพื่อ animation/VFX, interaction และอนาคต
- Physical/Magic ยังใช้ DEF สูตรเดียวกัน
- ยังไม่เพิ่ม Physical Resist/Magic Resist เป็น stat
- ถ้าปลาย Arc 1 ต้องการ build counter ค่อยเสนอ resist layer ใน P4/P5 content review

---

# 2. System & Behavior Decisions

## 2.1 Next class

**Decision: นักธนู** — ตามข้อ 1.4

## 2.2 Party channel model

**Decision: Public shared channel เป็น default; private room ใช้เฉพาะ instanced content**

Production behavior:
- field farming: party sync ไป public channel เดียวกันตาม §59.3
- dungeon/raid/tutorial: private party room
- implementation private-party-channel ที่มีอยู่ใน P1 ใช้เป็น fallback/temporary test mode ได้ แต่ไม่ใช่ final field model
- ถ้า public channel รับทั้ง party ไม่ได้ ให้สร้าง/เลือก public channel ใหม่ที่รับกลุ่มครบ

เหตุผล: ดึ๋งปุ๊ต้องยังรู้สึกเป็น MMORPG ที่โลกมีคนอื่น ไม่ใช่ lobby co-op แยกห้องทุก party

## 2.3 Skill field grouping

**Decision:**
- `skillName`, `description`: client/shared metadata
- `statusEffects`: แยกเป็น 2 ชั้น
  - client: public presentation เช่นชื่อ, icon, short description, duration display
  - server-only: magnitude, stacking rule, tick rule, immunity tags, proc condition
- client bundle ห้ามมี authoritative damage/status formula

## 2.4 Monster click radius

**Decision: แยกตาม input mode**

```yaml
desktopMouseHitRadiusTiles: 0.60
touchHitRadiusTiles: 0.80
controllerOrKeyboardAssistRadiusTiles: 0.65
```

- คลิกพื้นต้องมี priority เป็น movement เมื่อจุดคลิกอยู่นอก silhouette/assist radius
- มี setting “Target Assist” Low/Normal/High ในอนาคต
- เก็บ misclick telemetry จาก cancel/rapid retarget

## 2.5 Map 1 details

**Decision: รับรอง 40×40 tile, zone placement และ respawn midpoint เป็น P1/P2 production baseline**

เงื่อนไข:
- bounds เปลี่ยนได้ ±15% หลัง art/route playtest โดยไม่ถือว่าเปลี่ยน world canon
- zone coordinates ต้องอยู่ใน map config ไม่ hardcode
- safe camp ต้องไม่ติด aggro, PvP หรือ spawn pocket
- respawn random within approved range; midpoint ใช้เป็น default

---

# 3. World, Content & Timeline Decisions

## 3.1 Boss phase

**Decision: เพิ่ม milestone `P2B — Boss & Encounter Foundation` หลัง P2 core และก่อน P3**

P2B scope:
- Field Boss Map 1 หนึ่งตัว
- boss state machine: Idle/Intro/Combat/Break/Stagger/Enrage/Dead/Respawn
- telegraph priority
- guard/break gauge
- phase transition อย่างน้อย 2 phase
- server-authoritative reward grant เชื่อม inventory/ledger จาก P2
- no raid finder, no guild boss, no complex weekly lockout

## 3.2 Production starting point

**Decision: เริ่มที่เมือง `นครอรุณผนึก`**

Flow:
1. สร้างตัวละคร
2. เข้า starter district ในเมือง
3. tutorial 5–10 นาที: เดิน, คุย NPC, equip, skill, Bot A intro แบบสั้น
4. ออกจากประตูสู่ Map 1 ขอบเมืองมนุษย์

## 3.3 Test Field future

**Decision: คงเป็น dev-only map**

- เข้าผ่าน environment flag/admin command เท่านั้น
- ไม่มี portal ใน production player world
- production build ซ่อน navigation ทั้งหมด
- ใช้ performance test, animation QA, skill sandbox ต่อได้

## 3.4 Mobile polish

**Decision: อยู่ P2 ช่วงท้ายและเป็น gate ก่อน external closed alpha**

ต้องมี:
- virtual joystick/drag movement ที่เสถียร
- touch targeting + skill buttons
- responsive HUD 2 layout
- effect quality UI
- large hit targets และ safe-area support
- resync on refocus

## 3.5 P2 scope

**Decision: ยืนยัน P2 = Persistence & Value และเพิ่มรายการต่อไปนี้**

Included:
- guest + email account, guest upgrade
- character save/load
- current map + safe position persistence
- inventory/equipment
- server RNG drop
- gold/currency ledger
- enhancement + crack + แกร่ง 2-step confirm
- starter NPC shop buy/sell
- resync on refocus/reconnect
- mobile polish baseline
- origin restriction + JWT handshake

Excluded:
- market/trade
- offline bot/report
- guild/full party management
- HoF/ranking
- full quest graph
- raid/world boss

Boss foundation อยู่ P2B แยกจาก P2 core

---

# 4. Art & Asset Decisions

## 4.1 Asset priority

**Decision: ใช้ Vertical Slice First ไม่ทำตัวละคร 5 อาชีพก่อนโลก**

Order:
1. master scale/palette/grid + SVG placeholder kit
2. นักดาบ complete animation set
3. Map 1 tiles/ground/collision/props + safe camp
4. Map 1 normal mobs 3 ตัว + elite 1 + boss 1
5. combat VFX/UI feedback ของนักดาบ
6. เมือง starter district + NPC หลัก
7. นักธนู complete set
8. นักหอก → นักเวท → นักอาคม
9. expand Map 2–4

## 4.2 Size standard

**Decision: ล็อกมาตรฐานดังนี้**

```yaml
logicalTile: 64x32
playerFrameCanvas: 64x64
playerVisibleBodyTarget: 28-36w x 44-52h
playerFootPivot: [32, 54]
npcFrameCanvas: 64x64
smallMobCanvas: 64x64
mediumMobCanvas: 96x96
eliteCanvas: 96x96 or 128x128
fieldBossCanvas: 160x160 minimum, 192x192 preferred
uiIconSource: 64x64
```

ขนาด source canvas คงที่; silhouette ไม่จำเป็นต้องเต็ม canvas

## 4.3 Master palette

**Decision: Tech/placeholder ใช้ master palette กลางจาก Visual Language Bible**

- มี master palette 32 สี
- แต่ละ biome ใช้ subpalette 12–18 สี
- resonance teal, corruption magenta, legendary gold เป็น semantic color ห้ามใช้พร่ำเพรื่อ
- final art เปลี่ยน shade ได้แต่ต้องรักษา hue role/contrast hierarchy

## 4.4 Art handoff format

**Decision:**
- placeholder source: SVG snapped to pixel grid
- runtime placeholder: rasterized PNG atlas nearest-neighbor
- final pixel art source: `.aseprite` หรือ layered PNG ตามทีม art
- runtime final: PNG sprite sheet + JSON animation manifest
- directions drawn: S, SW, W, NW, N; mirrored: SE, E, NE
- naming/folder/frame order ตาม Asset Production Bible

---

# 5. Ops & Deploy Decisions

## 5.1 Render paid always-on trigger

**Decision: อัปเกรดก่อน external closed alpha**

Hard trigger อย่างใดอย่างหนึ่ง:
- เชิญคนนอกทีมเกิน 5 คน
- มี scheduled test เกิน 60 นาที
- ต้องเก็บ persistence/economy data จริง
- เริ่ม P2 integration environment

UptimeRobot ไม่ถือเป็น production reliability strategy

## 5.2 Origin restriction

**Decision: ทำใน P2 พร้อม Auth/JWT**

- allowlist production/staging/local origins
- WS handshake ต้องมี short-lived token
- rate limit join/auth failures
- dev bypass ใช้ได้เฉพาะ non-production env

## 5.3 Background tab policy

**Decision:** backgrounding ไม่เท่ากับเปิด bot

Field behavior:
- tab hidden: client หยุดส่ง active input; server ยังถือ character เป็น entity
- ถ้าไม่อยู่ combat 15 วินาที: เริ่ม safe-disconnect countdown
- ครบ 30 วินาทีและยังไม่ combat: disconnect และ save ที่ safe-valid position; login กลับ safe camp หากตำแหน่งไม่ valid
- ถ้าอยู่ combat: ตัวละครยังรับ damage, ไม่ auto-cast; disconnect หลัง combat จบ/ตาย
- city/safe camp: disconnect gracefully หลัง 60 วินาที hidden
- ผู้เล่นต้องกด Online Bot อย่างชัดเจนจึงจะมี automation

---

# 6. Spec Update Map

Tech ต้องนำ decision ไปอัปเดต:
- Combat config/spec: 1.1–1.9
- Skill canonical schema/runtime grouping: 2.3
- Channel/realtime spec: 2.2
- Map config: 2.4–2.5
- Roadmap §12: P2B, mobile P2, starting flow
- Asset spec: 4.1–4.4
- Deploy/auth/background policy: 5.1–5.3

# 7. Owner Queue Status

**ทุกข้อ 1.1–5.3 ปิดแล้วใน v1 นี้**
