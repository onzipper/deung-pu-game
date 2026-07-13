# ดึ๋งปุ๊ — P2 Issue Breakdown v1 (+P2B outline +Content track)

> สถานะ: **owner ตอบคำถามครบแล้ว 2026-07-12 — พร้อมเริ่มเมื่อ PR #8 merge** · **execution mode: PR แยกต่อคลื่น (3 PR) เข้า develop**
> Scope source: tech architecture v1.5.2 §12 + **§12.1 amendment** (P2 scope ที่ owner ยืนยันผ่าน Bible 3.5) + `docs/design/bibles/deungpu_OWNER_DECISIONS_v1.md` + **spec ใหม่ 2 เล่ม (locked)**: `deungpu_DUNG_DUNG_COMPANION_GUIDE_SYSTEM_SPEC_v1.md` (DG) + `deungpu_ACHIEVEMENT_AND_ADVENTURE_JOURNAL_SPEC_v1.md` (AJ) — ไม่มีการเพิ่ม scope นอก spec
> ทุก issue: อ่าน `docs/agent-rules.md` ก่อนเริ่ม · balance ทุกค่า = Design Knob จาก config (baseline เคาะแล้ว 2026-07-12 — ไม่ใช่ PENDING แล้ว แต่ยังห้าม hardcode)

## เป้า P2 (จาก tech §12 + §12.1)

> **Persistence & Value** — ของมีมูลค่าและปลอดภัย: บัญชี/เซฟ/inventory/drop/ตีบวก/ledger ทำงานบน MySQL ด้วย transaction ที่ dupe ไม่ได้ · ผู้เล่นเริ่มเกมที่นครอรุณผนึกแบบ MMO จริง · จบ P2 = พร้อม external closed alpha (mobile = gate)

**Excluded (อย่าลาก scope เข้า):** market/trade · offline bot/report · guild · HoF · full quest graph · raid/world boss · การย้าย party ไป public shared channel (→ P2B+)

## Issues (เรียงตาม dependency — 3 คลื่น)

### คลื่น 1: Foundation (ไม่พึ่งกันเอง ทำขนานได้)

| # | Issue | Scope ย่อ | Spec |
|---|---|---|---|
| P2-00 | **E2E proof harness ถาวร** (`scripts/e2e/`) | ยกระดับ probe script ที่เคยเขียนทิ้งรายรอบ (P1 พิสูจน์ 4 รอบ) เป็น harness ถาวร: connect/join/walk/cast/assert ผ่าน colyseus.js จาก CLI, ใช้ซ้ำได้ทั้ง local+prod — efficiency #2 (decision-index 2026-07-12) | — |
| P2-01 | **Zustand store bridge + HUD foundation** | ติดตั้ง Zustand จริง, ย้าย poll pattern ชั่วคราวของ `src/ui/DebugOverlay.tsx` เข้า store bridge ตาม contract `docs/context/ui.md` (UI คุยกับ game ผ่าน store เท่านั้น) — inventory/shop/tutorial UI ทุกตัวใน P2 ต้องใช้ฐานนี้ | TA §5 · context/ui.md |
| P2-02 | **MySQL schema + Prisma foundation** | schema: accounts, characters, character_state (map/position), inventory, items, currency_ledger (double-entry — ไม่มี balance column), enhancement_logs, drop_audit, config_versions, **game_events (append-only: kill/drop/ตีบวก/level — เคาะ A4 เพื่อ retroactive achievement credit + economy audit; ออกแบบ retention policy ไว้แต่แรก)** · Prisma + raw SQL ใน ledger path · migration ระบบแรก · **dev = MySQL local** (Hostinger remote = ขั้น integration ท้าย P2) — **never-downgrade zone (DB schema): review ไขว้ 2 มุมมองก่อน merge** | TA §8 · §7 · AJ §20 |
| P2-14 | **Multi-hit rounding rewrite** | เปลี่ยน combat formula เป็น round-total-once + deterministic remainder distribution ตาม v15.2 §50.1.1 (implementation debt ที่ owner เคาะ Bible 1.8) — ต้องเสร็จก่อนงานนักธนู · **never-downgrade zone (combat calculation)** | GS §50.1.1 · TA §15.7.1 |

### คลื่น 2: Auth → Persistence → Value loop (ตามลำดับ) — scope ขยายตามเล่ม Storage (S1–S4, 2026-07-12)

| # | Issue | Scope ย่อ | Spec |
|---|---|---|---|
| P2-02b | **Schema v2: storage/location/session** | ปรับ schema ก่อน apply DB จริง (DB ยังว่าง — S1): **item location model 7 แบบ** (CHARACTER_INVENTORY/EQUIPMENT/ACCOUNT_STORAGE/DELIVERY_BOX/MARKET_ESCROW/WORLD_LOOT/DESTROYED) แทน characterId-only · per-instance `expiresAt`/`uniqueEquipGroup` (S3 — policy อื่นอยู่ config) · ตารางใหม่: personal_storage/delivery_box/storage_log (idempotent)/session_lease · account fields: characterSlots(5)/lastPlayedCharacterId/storageCapacity(200) · name collation case-insensitive (Storage §3.3) — **never-downgrade (DB schema) รีวิวไขว้** | Storage §12/§22/§24 |
| P2-03 | **Auth: guest + email + guest upgrade** | Auth.js บน Next.js API, guest account สร้างทันที, upgrade เป็น email โดยไม่เสีย progress (**P2 ไม่บังคับ verify email** — บังคับก่อน closed alpha, L-doc §1), session → JWT สำหรับ realtime · **1 active session/บัญชี + takeover flow** (Storage §4) | TA L5 · §4 · Storage §4 · L-doc §1 |
| P2-04 | **WS security: origin allowlist + JWT handshake** | Colyseus onAuth ตรวจ short-lived token จาก P2-03, origin allowlist (production/staging/local), rate limit join/auth failure, dev bypass เฉพาะ non-prod · เชื่อม session lease (SESSION_TAKEN_OVER disconnect reason) | Bible 5.2 · TA §6.2 · Storage §4 |
| P2-05 | **Character save/load + position/map persistence** | save cycle (interval + on-event + on-disconnect), จำ current map + safe position ข้าม refresh/restart (ปิดพฤติกรรม boot-to-Test-Field), reconnect ใช้ตำแหน่ง persist | GS §59.1.1 ข้อ 5 · TA §12.1 |
| P2-06 | **Character creation + Game Hub + start flow + Test Field dev-gating** | **Game Hub = route ใน Next.js app เดิม** (S4): hub shell + Continue Card + Character Management 5 ช่อง (Storage §6–9) · สร้างตัวละคร: naming validation เต็มชุด (3–16, NFC, case-insensitive unique, error codes — Storage §3.3/§8) + create transaction idempotent · spawn starter district → ประตูสู่ Map 1 · Test Field เข้าได้เฉพาะ env flag/admin | Storage §3–§9 · Bible 3.2–3.3 |
| P2-07 | **Inventory + equipment** | server-authoritative mutation ทั้งหมด (`FOR UPDATE` + optimistic lock), equip/unequip กระทบ stat จริง, UI บน Zustand bridge | TA §7 · §8 |
| P2-08 | **Currency ledger (double-entry)** | ยอด = SUM ledger เท่านั้น, ทุกแถวมี reason+reference, raw SQL path — **never-downgrade zone (currency ledger)** | TA §7 |
| P2-09 | **Server RNG drop + EXP/level-up + reinforcement drop/pity config** | drop table = server config จากเล่ม Economy §11 (ไม่ ship ใน bundle), RNG server + drop_audit log, loot จาก mob ตาย → inventory ผ่าน transaction · **EXP grant ตาม Economy §9** (curve + level-diff modifier + party pool) + level-up ฝั่ง server · schema follow-up: +LedgerReason shop_buy/sell, dropTableVersion↔ConfigVersion mapping · **reinforcement/fragment drop config + pity config** (schema+loader+flag ตาม Reinforcement doc §4: boss 8% + pity 15 account-per-boss reset-on-drop, normal/elite 0%, special-elite 0.5%→Map1 0%, first-kill ไม่การันตี, telemetry 7 events · **fragment values = Reinforcement doc §3.5**: id `upg_reinforcement_fragment`, `fragmentDropChancePercent: 10.7`, exchange 5→1, phase P2B) — **บอสจริง/เศษจริง = P2B ⇒ P2 = config/loader/flag เท่านั้น ยังไม่มี drop event จริงบน Map 1** · `upg_kraeng`→`upg_reinforcement` rename (R10, ก่อน P2-16) · **ตัด `ItemInstance.crackedAt`** (ไม่มี crack แล้ว) · ⚠ E1/E2 resolved · **E3 = placeholder stat เท่านั้น** (schema/loader/test ได้; production hp/atk/def รอ owner balance) | Economy §9–§12 · Reinforcement doc §4/§3.5 · TA §7 |
| P2-10 | **Enhancement = เสริมแกร่งการันตี** (เขียนใหม่ — ตัด RNG/crack/repair/protection/gold) | transaction: validate item → level < 15 → เสริมแกร่ง ≥ 1 → consume ×1 → +1 → persist atomically → authoritative result · **การันตี 100% ไม่มี fail/roll/preview/crack** · UI states: `NO_ITEM/READY/NO_REINFORCEMENT/MAX_LEVEL/ITEM_LOCKED/PROCESSING/SUCCESS/UNKNOWN_RECONCILING` · item lock + idempotency key + transaction id + economy version + reconciliation (ห้ามเพิ่มระดับซ้ำจาก retry) · enhancement_logs ทุกครั้ง · ⚠ +6..+15 stat multiplier รอเคาะ (R9) — P2 ทำ transaction+UI ได้, ค่าพลังขั้นสูงรอ balance · ⚠ P2 อาจไม่มีแหล่งเสริมแกร่งบน Map 1 เลย (R8) | Reinforcement doc §2 · TA §7 |
| P2-11 | **Starter NPC shop** | buy/sell ผ่าน ledger+inventory transaction, ราคา = config, NPC ใน starter district | Bible 3.5 · TA §12.1 |

### คลื่น 3: Policy + polish + gate

| # | Issue | Scope ย่อ | Spec |
|---|---|---|---|
| P2-12 | **Guidance "DG lite"** (แทน hint panel เดิม — ยึดเล่มดึ๋งๆ เต็มรูป แต่**ยังไม่มีตัว companion**) | (1) Help entry points: ปุ่ม HUD + context help `?` บนจอระบบ (DG-03) (2) **Help Article Registry** data-driven + "เล่นยังไง" คำตอบ 3 ชั้น (one-line ≤120 ตัว / steps ≤4 / more detail) + safe action buttons ตามข้อห้าม DG §6.3 (DG-04) (3) **"ทำอะไรต่อดี" rule engine v1**: เสนอ 2–4 ทาง + reason ทุกใบ + "ไม่เอาอันนี้" + dismissal/cooldown ตาม DG §7/§9.3 (DG-06/07/10) (4) guidance preferences (mode default QUIET, hint detail) (DG-05) (5) **tutorial เริ่มเกม = guided checklist เขียนเป็น help articles** (เดิน/ตี/equip/skill — ไม่มี dialog system; **ไม่มี Bot A intro** — ย้ายไปตอนปลดล็อก Bot A ตาม D1) · UI ตาม DG §13 (desktop panel 360–420px / mobile bottom sheet ≤70%, card ≤4 ใบ) | DG spec (locked) · D1/C1 2026-07-12 |
| P2-13 | **Background tab policy + resync on refocus** | flow v15.3 §59.1.3 (D-056 — supersede §59.1.2): **AFK ค้างเต็มที่ ไม่มี forced disconnect**. hidden→pause input, server ถือ character เป็น entity ต่อ · combat=รับ damage ต่อ ไม่ auto-cast (ตายได้ทุกโซน, ไม่มี idle de-aggro) · fast-resync snapshot ตอน refocus · ป้าย AFK อัตโนมัติหลัง idle 60s (`idleIndicatorSec=60`) · `afkHardCapHours=null` knob เดินสายไว้ **inert** (ทบทวนก่อน open alpha) · มือถือ = best-effort + ข้อความอธิบายข้อจำกัด OS (OS freeze/kill แท็บเอง → reconnect grace 30s §59.1) · **ไม่มี disconnect state machine, ไม่มีโหมดปักหลัก** | GS §59.1.3 (D-056) · TA §6.2 |
| P2-15 | **Mobile polish package (gate ก่อน closed alpha)** | virtual joystick/drag movement, touch targeting + skill buttons, responsive HUD 2 layout, effect quality UI, large hit targets + safe-area · **click radius per input mode knobs** (0.60/0.80/0.65 — แทน 0.9 เดิม) | Bible 3.4 · TA §17.3 amendment |
| P2-17 | **Personal Storage + Delivery Box** (เพิ่มตาม S1 — เล่ม Storage §10–18) | คลังบัญชี 200 ช่อง shared (deposit/withdraw transaction idempotent, §13–14) · Delivery Box 50 entries + expiry ตามชนิด + เตือน 7 วัน/1 วัน (§16) · item sharing policy ตาม config (bindType/storagePolicy/tradePolicy — S3) · storage full states 80/90/100% · trade boundary (§18: ห้าม assume market=direct trade) · UI ตามเล่ม Storage + UI spec tokens | Storage §10–§18 |
| P2-16 | **P2 handoff check + integration deploy** | done definition ด้านล่าง + concurrent mutation test + **integration env**: Hostinger MySQL remote setup (checklist ให้ owner แยก — whitelist Render IP + TLS) + Render paid upgrade (ชน hard trigger "เริ่ม P2 integration environment" ตาม Bible 5.1 — ต้องคุยกับ owner ตอนถึงจุดนี้) + docs sync | TA §8 · Bible 5.1 |

## Done definition (P2)

```
1. ยิง concurrent 1,000 req (inventory/enhancement/shop/ledger) → ไม่ dupe ไม่เพี้ยนแม้แต่หน่วยเดียว
2. ยอดเงินทุกบัญชี = SUM ledger เสมอ (ไม่มี balance column ให้แก้ตรง)
3. refresh/ปิด browser/server restart → กลับมา map+ตำแหน่ง+ของ+เงินเดิมครบ
4. guest เล่นทันที + upgrade เป็น email ไม่เสีย progress
5. ws ต่อได้เฉพาะ origin ที่อนุญาต + token ถูกต้อง; ยิงตรงด้วย payload ปลอม = ปฏิเสธ
6. ผู้เล่นใหม่: สร้างตัวละคร → starter district → tutorial checklist จบ → ออกประตูสู่ Map 1 ได้ใน 10 นาที (ไม่มี Bot A intro, ไม่มี forced popup)
6b. กด Help จาก HUD → "เล่นยังไง" ตอบใน ≤2 interaction · "ทำอะไรต่อดี" เสนอ 2–4 ทางพร้อมเหตุผล + dismiss แล้วไม่ตื๊อ (cooldown ทำงาน)
7. production ไม่มีทางเข้า Test Field; dev ยังเข้าได้ผ่าน flag
8. drop ทุกชิ้นมี audit trail; drop table ไม่อยู่ใน client bundle
9. ตีบวก = **เสริมแกร่ง ×1 → +1 การันตี 100%** (ไม่มี fail/crack/gold/RNG) + enhancement_logs ครบ + idempotent (retry ไม่เพิ่มระดับซ้ำ); reinforcement drop/pity = config/loader/flag พร้อม (drop event จริงบน Map 1 = P2B) — ดู Reinforcement doc
10. พับจอในสนาม → ตัวละครค้างในโลกต่อ (ไม่มี disconnect); refocus → resync snapshot ทันที; idle 60s → ป้าย AFK ขึ้นให้ผู้เล่นอื่นเห็น; ปิดแท็บ/OS kill → reconnect grace 30s (§59.1) แล้วเอาออก; มือถือแสดงข้อความข้อจำกัด OS (D-056)
11. multi-hit damage: ผลรวมบนจอ = HP ที่ลดจริง (round-total-once) — regression test คุม
12. เล่นจบ loop บนมือถือจริงได้ (joystick+ตี+equip+ซื้อของ) — gate ก่อนชวนคนนอก
13. e2e harness รัน smoke ทั้ง loop ได้ใน 1 คำสั่ง ทั้ง local และ prod
```

## P2B — Boss & Encounter Foundation + Companion + Achievement v1 (outline — แตก issue ละเอียดเมื่อ P2 ใกล้จบ)

- **Boss** (TA §12.1 + Bible 3.1): Field Boss Map 1 หนึ่งตัว · boss state machine (Idle/Intro/Combat/Break/Stagger/Enrage/Dead/Respawn) · telegraph priority · guard/break gauge · ≥2 phase · reward ผ่าน inventory/ledger ของ P2 · boss reconnect edge cases · world clock (Living World เฟสแรก)
- **ดึ๋งๆ companion** (DG spec + D2/D3/D4): first encounter ที่ transition pocket ชาน starter district · local companion + follow state (0.6–1.2 tile, no collision, teleport catch-up) · state machine DG §12 · **local-only ไม่ sync network** (server เก็บแค่ unlock/cosmetic/preference) · bespoke placeholder + minimum animation 12 ท่า · guidance entry ผ่านตัวดึ๋งๆ (คลิกเปิด panel เดียวกับ DG lite)
- **Achievement/Journal v1** (AJ spec + A1–A4): definition schema + rule evaluator (counter/distinct/streak/window/sequence/composite) · consume จาก game_events ของ P2 + event ใหม่ · idempotent + dedup · credit policy default = **participation** · seed catalog เฉพาะหมวดที่ระบบมีจริง (A2) — ที่เหลือ `draft` · **Server First minimal** (atomic claim + audit + ประกาศ room/channel + rate limit + เก็บส่งต่อ P5) · Journal UI (แท็บที่มีข้อมูลจริง: วันนี้ของฉัน/Achievement/โลก/มอน/สถิติ) · pin ≤3 + HUD tracking · hidden ไม่ spoil · retroactive จาก game_events ตาม policy
- **งานต่อคิวจาก P2**: นักธนู 3 สกิล (เคาะแล้ว → P2B) · party public shared channel model · remote juice "เบากว่า 1 ระดับ" · Bot A intro micro tutorial (30–60 วิ ตอนปลดล็อก — D1) เมื่อระบบ bot เริ่มมี surface จริง (P3)

## Content track (คู่ขนาน — ตาม ROADMAP C0/C1 + **SVG-first ถาวร** ตั้งแต่ 2026-07-12)

| # | Issue | Scope ย่อ | Spec |
|---|---|---|---|
| SVG-01 | **SVG asset pipeline foundation** (ก่อนผลิต asset จริงชุดแรก / ก่อน C-track P2B) | โฟลเดอร์ `svg/` ตาม contract ใหม่ · sanitizer + optimizer เข้า build · raster→atlas build step (world entities ห้าม inline SVG runtime) · manifest generator (merge SVG contract + animation manifest เดิม + เพิ่ม direction/mirror field ที่ contract ใหม่ขาด) · palette lint (32 สี + rarity alias V3) · golden samples 3–5 ชิ้นตาม visual style ทาง C | SVG-first doc §2/§16–17 · decision-index V2/V4 |

- **ลำดับ asset ใหม่ (D3, supersede Bible 4.1):** (1) player base + นักดาบ (2) **ดึ๋งๆ mascot** (3) อีก 4 อาชีพ (4) มอน Map 1 (5) เมือง/props (6) skill VFX (7) boss
- **C0 (เหลือปิด):** SVG placeholder kit แบบ parameterized (shape grammar + semantic colors + master palette 32 สี) · sword set บน canvas 64×64 footPivot [32,54] มาตรฐานใหม่ · content gate = "3-second test" (ผู้เล่นดู 3 วิแล้วรู้ว่าคืออะไร)
- **ดึ๋งๆ (คู่ P2 — ต้องเสร็จก่อน P2B):** **bespoke placeholder ห้ามใช้ kit ทั่วไป** — silhouette จำง่าย, palette เฉพาะ, น่ารักแม้รายละเอียดต่ำ, ไม่เหมือน slime/pet ทั่วไป, สลับ final art ได้โดยไม่แก้ logic · minimum animation 12 ท่า (idle/follow/blink/happy/curious/sleep/wake/startled/point/help indicator/rescue/catch-up) — เพิ่ม mood ภายหลังผ่าน manifest
- **C1 (คู่ P2):** starter district นครอรุณผนึก (tiles/props/NPC หลัก) · Map 1 tiles/landmarks แทน placeholder เดิม · มอน Map 1: ดึ๋งปุ๊/หมูพอง/นกจิกปุ๊ (+stat row แยกของนก/หมูป่าก่อน content freeze — เงื่อนไข Bible 1.3) · elite + boss art (boss ใช้จริง P2B) · starter equipment icons · sword VFX
- ทั้งหมดอิง `docs/design/bibles/` (ASSET_PRODUCTION / VISUAL_LANGUAGE / CONTENT_PRODUCTION_PIPELINE) — ไม่ block tech issues; แทรกเป็นงานคู่ขนานเมื่อ owner สั่งเริ่ม

## คำถามถึง owner — ตอบครบแล้ว (2026-07-12, ดู decision-index)

1. **Execution mode** = **PR แยกต่อคลื่น** (3 PR เข้า develop)
2. **นักธนู 3 สกิล** = **P2B** (หลัง P2-14 rounding เสร็จใน P2)
3. **doc "ต้องทำอะไรต่อ"** = ส่งแล้วเป็นเล่มดึ๋งๆ (DG spec, locked) — P2-12 กลายเป็น "DG lite" ตามเล่มนั้น
4. **Hostinger MySQL** = **Remote MySQL เปิดแล้ว** (credentials ใน `.env` — ห้ามโผล่ log/commit) · Render paid checklist ทำให้ owner ตอนถึง P2-16
