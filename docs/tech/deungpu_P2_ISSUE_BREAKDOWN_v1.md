# ดึ๋งปุ๊ — P2 Issue Breakdown v1 (+P2B outline +Content track)

> สถานะ: **DRAFT โดย tech (orchestrator) — รอ owner review ก่อนเริ่ม implement**
> Scope source: tech architecture v1.5.2 §12 + **§12.1 amendment** (P2 scope ที่ owner ยืนยันผ่าน Bible 3.5) + `docs/design/bibles/deungpu_OWNER_DECISIONS_v1.md` — ไม่มีการเพิ่ม scope นอก spec
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
| P2-02 | **MySQL schema + Prisma foundation** | schema: accounts, characters, character_state (map/position), inventory, items, currency_ledger (double-entry — ไม่มี balance column), enhancement_logs, drop_audit, config_versions · Prisma + raw SQL ใน ledger path · migration ระบบแรก · **dev = MySQL local** (Hostinger remote = ขั้น integration ท้าย P2) — **never-downgrade zone (DB schema): review ไขว้ 2 มุมมองก่อน merge** | TA §8 · §7 |
| P2-14 | **Multi-hit rounding rewrite** | เปลี่ยน combat formula เป็น round-total-once + deterministic remainder distribution ตาม v15.2 §50.1.1 (implementation debt ที่ owner เคาะ Bible 1.8) — ต้องเสร็จก่อนงานนักธนู · **never-downgrade zone (combat calculation)** | GS §50.1.1 · TA §15.7.1 |

### คลื่น 2: Auth → Persistence → Value loop (ตามลำดับ)

| # | Issue | Scope ย่อ | Spec |
|---|---|---|---|
| P2-03 | **Auth: guest + email + guest upgrade** | Auth.js บน Next.js API, guest account สร้างทันที, upgrade เป็น email โดยไม่เสีย progress, session → JWT สำหรับ realtime | TA L5 · §4 |
| P2-04 | **WS security: origin allowlist + JWT handshake** | Colyseus onAuth ตรวจ short-lived token จาก P2-03, origin allowlist (production/staging/local), rate limit join/auth failure, dev bypass เฉพาะ non-prod | Bible 5.2 · TA §6.2 |
| P2-05 | **Character save/load + position/map persistence** | save cycle (interval + on-event + on-disconnect), จำ current map + safe position ข้าม refresh/restart (ปิดพฤติกรรม boot-to-Test-Field), reconnect ใช้ตำแหน่ง persist | GS §59.1.1 ข้อ 5 · TA §12.1 |
| P2-06 | **Character creation + start flow + Test Field dev-gating** | สร้างตัวละคร (ชื่อ+อาชีพ — P2 มีนักดาบ; UI รองรับ 5 ช่อง) → spawn starter district นครอรุณผนึก → ประตูสู่ Map 1 · Test Field เข้าได้เฉพาะ env flag/admin, production ซ่อน navigation ทั้งหมด | Bible 3.2–3.3 · GS §8 |
| P2-07 | **Inventory + equipment** | server-authoritative mutation ทั้งหมด (`FOR UPDATE` + optimistic lock), equip/unequip กระทบ stat จริง, UI บน Zustand bridge | TA §7 · §8 |
| P2-08 | **Currency ledger (double-entry)** | ยอด = SUM ledger เท่านั้น, ทุกแถวมี reason+reference, raw SQL path — **never-downgrade zone (currency ledger)** | TA §7 |
| P2-09 | **Server RNG drop** | drop table = server config (ไม่ ship ใน bundle), RNG server + drop_audit log, loot จาก mob ตาย → inventory ผ่าน transaction | TA §7 · GS §11 |
| P2-10 | **Enhancement + ร้าว + แกร่ง** | ตีบวก fail/-1/ร้าว ตาม GS §12, แกร่ง = 2-step confirm token (ขอ→ยืนยัน กัน replay), enhancement_logs ทุกครั้ง | GS §12 · TA §7 |
| P2-11 | **Starter NPC shop** | buy/sell ผ่าน ledger+inventory transaction, ราคา = config, NPC ใน starter district | Bible 3.5 · TA §12.1 |

### คลื่น 3: Policy + polish + gate

| # | Issue | Scope ย่อ | Spec |
|---|---|---|---|
| P2-12 | **Tutorial guided checklist + hint panel** | overlay checklist 5–10 นาที (เดิน/ตี/equip/skill — ไม่มี dialog system), แผง "เป้าหมายถัดไป" data-driven — **เนื้อหารอ doc การบ้าน owner (player journey) — โครงระบบไม่ block** | Q4 2026-07-12 · Bible 3.2 |
| P2-13 | **Background tab policy + resync on refocus** | flow v15.2 §59.1.2: hidden→หยุด input, field idle 15s→countdown→30s safe-disconnect+save, combat=รับ damage ต่อ, city 60s, party extended 120–180s — ทุกตัวเลขเป็น knob (PENDING tune) · โหมด "ปักหลัก" toggle · fast-resync ตอน refocus/reconnect | GS §59.1.2 · TA §6.2 |
| P2-15 | **Mobile polish package (gate ก่อน closed alpha)** | virtual joystick/drag movement, touch targeting + skill buttons, responsive HUD 2 layout, effect quality UI, large hit targets + safe-area · **click radius per input mode knobs** (0.60/0.80/0.65 — แทน 0.9 เดิม) | Bible 3.4 · TA §17.3 amendment |
| P2-16 | **P2 handoff check + integration deploy** | done definition ด้านล่าง + concurrent mutation test + **integration env**: Hostinger MySQL remote setup (checklist ให้ owner แยก — whitelist Render IP + TLS) + Render paid upgrade (ชน hard trigger "เริ่ม P2 integration environment" ตาม Bible 5.1 — ต้องคุยกับ owner ตอนถึงจุดนี้) + docs sync | TA §8 · Bible 5.1 |

## Done definition (P2)

```
1. ยิง concurrent 1,000 req (inventory/enhancement/shop/ledger) → ไม่ dupe ไม่เพี้ยนแม้แต่หน่วยเดียว
2. ยอดเงินทุกบัญชี = SUM ledger เสมอ (ไม่มี balance column ให้แก้ตรง)
3. refresh/ปิด browser/server restart → กลับมา map+ตำแหน่ง+ของ+เงินเดิมครบ
4. guest เล่นทันที + upgrade เป็น email ไม่เสีย progress
5. ws ต่อได้เฉพาะ origin ที่อนุญาต + token ถูกต้อง; ยิงตรงด้วย payload ปลอม = ปฏิเสธ
6. ผู้เล่นใหม่: สร้างตัวละคร → starter district → tutorial checklist จบ → ออกประตูสู่ Map 1 ได้ใน 10 นาที
7. production ไม่มีทางเข้า Test Field; dev ยังเข้าได้ผ่าน flag
8. drop ทุกชิ้นมี audit trail; drop table ไม่อยู่ใน client bundle
9. ตีบวก fail/-1/ร้าว/แกร่ง ตรง GS §12 + log ครบ; แกร่งต้อง confirm 2 จังหวะ
10. พับจอในสนาม → 15s countdown → 30s ออกแบบ save เรียบร้อย ไม่ทิ้ง ghost; โหมดปักหลักค้างได้จริง
11. multi-hit damage: ผลรวมบนจอ = HP ที่ลดจริง (round-total-once) — regression test คุม
12. เล่นจบ loop บนมือถือจริงได้ (joystick+ตี+equip+ซื้อของ) — gate ก่อนชวนคนนอก
13. e2e harness รัน smoke ทั้ง loop ได้ใน 1 คำสั่ง ทั้ง local และ prod
```

## P2B — Boss & Encounter Foundation (outline — แตก issue ละเอียดเมื่อ P2 ใกล้จบ)

ตาม TA §12.1 + Bible 3.1: Field Boss Map 1 หนึ่งตัว · boss state machine (Idle/Intro/Combat/Break/Stagger/Enrage/Dead/Respawn) · telegraph priority · guard/break gauge · ≥2 phase · reward ผ่าน inventory/ledger ของ P2 · boss reconnect edge cases · world clock (Living World เฟสแรก) · งานที่ต่อคิวจาก P2: party public shared channel model, remote juice "เบากว่า 1 ระดับ", นักธนู 3 สกิล (ถ้าไม่ได้เริ่มระหว่าง P2 — ดูคำถาม 2 ด้านล่าง)

## Content track (คู่ขนาน — ตาม ROADMAP C0/C1 + กลยุทธ์ Playable-Without-Artist)

- **C0 (เหลือปิด):** SVG placeholder kit แบบ parameterized (shape grammar + semantic colors + master palette 32 สี) · sword set บน canvas 64×64 footPivot [32,54] มาตรฐานใหม่ · content gate = "3-second test" (ผู้เล่นดู 3 วิแล้วรู้ว่าคืออะไร)
- **C1 (คู่ P2):** starter district นครอรุณผนึก (tiles/props/NPC หลัก) · Map 1 tiles/landmarks แทน placeholder เดิม · มอน Map 1: ดึ๋งปุ๊/หมูพอง/นกจิกปุ๊ (+stat row แยกของนก/หมูป่าก่อน content freeze — เงื่อนไข Bible 1.3) · elite + boss art (boss ใช้จริง P2B) · starter equipment icons · sword VFX
- ทั้งหมดอิง `docs/design/bibles/` (ASSET_PRODUCTION / VISUAL_LANGUAGE / CONTENT_PRODUCTION_PIPELINE) — ไม่ block tech issues; แทรกเป็นงานคู่ขนานเมื่อ owner สั่งเริ่ม

## คำถามค้างถึง owner (ไม่ block การเริ่มคลื่น 1)

1. **Execution mode**: ใช้แบบ P0/P1 ไหม — branch เดียว `feat/p2-persistence` commit แยกทีละ issue + PR เดียวเข้า develop? หรืออยากได้ PR ย่อยต่อคลื่น (P2 ยาวกว่า P0/P1 — แนะนำ **PR ต่อคลื่น** ให้ review ย่อยง่ายขึ้น)
2. **นักธนู 3 สกิล** อยู่ P2 ท้าย (หลัง P2-14 rounding เสร็จ) หรือ P2B? Bible 1.4 เคาะว่าทำแต่ไม่ได้ระบุเฟส — แนะนำ P2B (P2 core ก็ใหญ่แล้ว)
3. **doc การบ้าน "ต้องทำอะไรต่อ" (player journey)** — ส่งได้ถึงตอนไหนก็ได้ก่อนเริ่ม P2-12; ถ้ายังไม่มา จะทำโครง + เนื้อหา placeholder ให้ก่อน
4. **Hostinger MySQL**: ตอนถึง P2-16 ต้องขอ owner เปิด Remote MySQL + whitelist Render IP (จะทำ checklist ให้เหมือนรอบ deploy) — ระหว่างนั้น dev ใช้ MySQL local ไม่ต้องเตรียมอะไร
