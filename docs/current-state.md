# Current state

> กติกา: อัปเดตไฟล์นี้ทุกรอบ · block ที่ถูก supersede → `docs/history/` · สั้นพออ่านได้ทุก session

_Last updated: 2026-07-12_

## Where we are

**P2 คลื่น 1 merge เข้า develop แล้ว (PR #9)** — คลื่น 2 กำลังทำบน `feat/p2-wave2`: เริ่มจาก **P2-02b schema v2** (item location 7 แบบ + storage/delivery/session tables — DB Hostinger ยังว่างตามมติ ข, apply รอบเดียวตอน P2-16) + **P2-03 auth** ก่อน · **spec ใหม่จาก owner 3 เล่มเข้า repo แล้ว** (`docs/design/`): Account/Character/Storage (locked — 5 ช่องตัวละคร, คลังบัญชี 200, Delivery Box, Game Hub=route ใน app เดิม, 1 session+takeover — S1–S4 เคาะแล้ว) · Production Decisions P2B→Launch (locked baseline — bot/market/monetization/legal/launch gates; ค้าง L1–L7) · UI/Visual P2 (DRAFT — ค้าง U1เศษ/U2–U4) · P2 breakdown อัปเดตแล้ว: +P2-02b, +P2-17 (Storage/Delivery = คลื่น 3), P2-03/04/06 scope ขยาย · **ช่องว่างเดียวที่เหลือของ P2 = เล่ม Economy & Loot** (ชนตอน P2-09/11)

**P0 + P1 ปิดแล้ว** (merge `main` ผ่าน PR #6, 2026-07-12) + **prod stutter fix แล้ว** (PR #7 — minElapsedMs 50→90 + correction-resume; verify บน prod = 0 corrections; รายละเอียด `docs/history/2026-07-12-p0-p1-worklog.md` + `docs/known-traps.md`). **Deploy live ทั้งสองฝั่ง**: server = Render free tier + UptimeRobot (`https://deung-pu-game.onrender.com`, `/healthz`), client = Hostinger (`https://deung-pu.softrock.space/game`).

**Art direction เปลี่ยนเป็น SVG-first ถาวร (2026-07-12)** — pixel art เลื่อนไม่มีกำหนด · เล่ม `docs/design/deungpu_TECH_TEAM_DECISIONS_SVG_FIRST_NO_FIGMA_v1.md` ปิด U1–U4 + L1–L7 ครบ · V1–V4 เคาะแล้ว (tokens 6/10/16+48px hit area, hybrid art ฉบับ SVG + gate 7 ข้อ, rarity map บน palette เดิมห้าม Corruption, visual style ทาง C + effect matrix) — Asset Bible amended v1.1, เล่ม UI ยกเป็น LOCKED, +issue SVG-01 pipeline foundation

**Owner ปิด decision queue ทุกข้อแล้ว (2026-07-12)** ผ่าน **Production Bible Set v1** → อยู่ใน repo ที่ `docs/design/bibles/` (10 เล่ม — เล่มแรกที่ต้องเปิด: `deungpu_OWNER_DECISIONS_v1.md`) · spec เป็น **game v15.2 / tech v1.5.2** แล้ว (balance เลิกสถานะ PENDING — k=50, นักธนู=อาชีพที่ 2, party = public shared (final), background tab = safe-disconnect flow, milestone P2B ใหม่, asset canvas standards) · **P2 breakdown ร่างเสร็จ รอ owner review**: `docs/tech/deungpu_P2_ISSUE_BREAKDOWN_v1.md`

### 🔴 จุดที่ session ใหม่ต้องรู้ก่อน (handoff 2026-07-12)
1. **PR #10 (คลื่น 2) เปิดรอ owner review + ทดสอบ** — ลิสต์ทดสอบชุด A/B อยู่ใน PR body (https://github.com/onzipper/deung-pu-game/pull/10) · **owner ทดสอบรอบแรกแล้ว (2026-07-12): ข้อ 4-5 ผ่าน, ข้อ 6-7 เจอบั๊ก → review-fix แก้แล้ว** (ดู Latest work) — ให้ owner retest ข้อ 6 (ข้าม map แล้วปิด browser → ต้องเกิดที่ map+จุดเดิม), ข้อ 7 (ปุ่ม "เชื่อม Email" ใน hub), ข้อ 8 (takeover หลัง login 2 แท็บ)
2. **DB ทดสอบพร้อมแล้ว**: migration `0001_init` apply ลง Hostinger DB แล้ว (13 ตาราง, `prisma migrate status` = up to date) — owner สั่ง "เตรียม DB ทดสอบ" เอง 2026-07-12 → ทดสอบชุด B ได้เต็ม flow · ⚠ **DB จริง = MariaDB ไม่ใช่ MySQL 8** (ดู known-traps ท้ายไฟล์ — BOM trap ด้วย)
3. **คำถามค้างถึง owner: E1–E3** (ดู decision-index แถว Economy) — ชื่อบอส/elite vs canon · ตาราง % ตีบวก + นิยาม "แกร่ง" ชน GS §12 · stat row นกจิกปุ๊/หมูป่า — **block เนื้อหา P2-09/10 ของคลื่น 3** ไม่ block อย่างอื่น
4. **คลื่น 3 ถัดไป (หลัง merge PR #10)**: P2-07 inventory/equipment UI → P2-08 ledger → P2-09 drop+EXP → P2-10 ตีบวก → P2-11 ร้านค้า → P2-12 DG lite → P2-13 tab policy → P2-15 mobile → P2-17 storage/delivery + SVG-01 pipeline — spec ครบทุกเล่มแล้ว (UI/Storage/Economy/SVG-first ใน docs/design/) ยกเว้น E1–E3
5. กติกาทำงาน: อ่าน `docs/agent-rules.md` + decision-index ก่อนเสมอ · PR ต่อคลื่น · never-downgrade zones รีวิวไขว้ · brief ทุกตัวอ้าง agent-rules แทน paste

### สถานะคลื่น 2 (2026-07-12, branch `feat/p2-wave2` — **ครบ 6 issue + review-fix รอบ 1, PR #10 รอ owner retest**)
P2-02b schema v2 (14 ตาราง location model) · P2-03 custom auth (6 endpoints, owner ratify แทน Auth.js) · P2-04 WS security (JWT+origin+rate limit+takeover) · P2-05 save/load + join ด้วยตัวละครจริง (best-effort DB, transition-save trap ลง known-traps) · P2-06a Game Hub + creation (5 ช่อง, validator ไทย realtime) · docs: SVG-first/V1–V4/Economy integrate ครบ · **814 tests เขียว + e2e 8/8 ตลอดสาย** · เหลือของคลื่น 3: P2-07/08/09/10/11/12/13/15/17 + SVG-01 (P2-09/10 รอ E1–E3)

### Latest work (2026-07-12, branch `feat/p2-wave2` — review-fix รอบ 1 จาก owner ทดสอบ PR #10)
- **ข้อ 6 — boot map ไม่ persist ข้าม map** (P2-05 scope "จำ current map" ยังไม่ครบ): client เดิม boot `DEFAULT_MAP_ID` เสมอ → join room ผิด map → server `pickLoadPosition` (gate `saved.mapId === roomMapId`) ทิ้งตำแหน่ง save. Fix: `CharacterView`/`CharacterRecord` +`lastMapId` (prisma `include:{state:true}` — ไม่แตะ schema) → hub จำลง sessionStorage คู่ characterId (`SELECTED_CHARACTER_MAP_STORAGE_KEY`) → `app.ts` boot ด้วย `pickBootMapId` (pure, fallback DEFAULT ถ้าไม่รู้จัก map) + `requestTransition` อัปเดต key ทุกครั้งที่ข้าม map (refresh กลางเกมไม่เพี้ยน). save cycle ฝั่ง server ไม่แตะ
- **ข้อ 7 — guest ไม่มีทาง upgrade/logout** (P2-03 scope "upgrade เป็น email" มี endpoint แต่ไม่มี UI): `HubShell` แสดง AuthPanel เฉพาะยังไม่ login. Fix: +`src/app/hub/UpgradePanel.tsx` (ฟอร์มเชื่อม Email → POST `/api/auth/upgrade`, reason codes มีใน messages ครบแล้ว) + ปุ่ม "ออกจากระบบ" (DELETE session) ใน header — guest ยังไม่เชื่อม email กด logout = inline confirm เตือนก่อน (copy เขียนเอง ไม่มี screen contract ใน Storage spec — แจ้ง owner แล้ว)
- Gate: **814 tests เขียว** (+`tests/engine-net-character-session.test.ts` 9 เคส) · lint · `next build` · `tsc -p server/tsconfig.json` เขียวครบ
- **รอบ 2 (owner ทดสอบสด)**: upgrade สำเร็จแล้วหน้าค้างฟอร์ม (view=client state ไม่ reset ตอน router.refresh → เพิ่ม onBack() หลังสำเร็จ) · **/game entry gate ใหม่** (`src/app/game/boot-gate.ts` + GameCanvas): แก้ 2 อาการ root cause เดียว — เข้า /game ตรงทั้งที่ login = ไม่จำตัวละคร (Storage §5 ทุก entry ผ่าน hub → authenticated ไม่มีตัวละครที่เลือก = redirect /hub) + ปุ่มเข้าเกม 2 จุดได้คนละตำแหน่ง (hub ถือ lastMapId stale เขียนทับ map key สดของ engine → gate ดึงค่าสดจาก API ก่อน mount ทุกครั้ง, fetch fail = mount ต่อ best-effort กัน dev/offline พัง) · Gate: **825 tests เขียว** + lint + build

### Latest work (2026-07-12, branch `feat/p2-wave2` — P2-04 WS security)
- **Trust boundary ที่ Colyseus handshake** (Bible 5.2 + TA §6.2 + Storage §4). เพิ่ม `server/security/**` (pure + unit-tested): `origin-allowlist.ts` (env `ALLOWED_ORIGINS`, ว่าง=dev อนุญาตทุก origin+warn), `rate-limiter.ts` (sliding window 10 fail/60s ต่อ IP; TODO Redis multi-node), `handshake.ts` (`authorizeHandshake` = pure decision), `session-registry.ts` (in-process takeover, `shouldTakeOverSession`), `session-lease.ts` (DB `session_lease` best-effort — ไม่มี DATABASE_URL/ต่อไม่ได้ → ข้าม+warn ครั้งเดียว, **ห้ามให้ join พัง**)
- `server/rooms/MapRoom.ts`: **static** `onAuth` (Colyseus เรียกตอน matchmaking — reuse `verifyRealtimeToken` จาก `src/server/auth/**` ตรง ๆ ไม่ทำ shared module) — **production บังคับ token เสมอ · dev/e2e ไม่มี token = guest bypass** (flow local + `npm run e2e` ยังใช้ได้); session takeover-wins (§4.2, `WS_CLOSE_SESSION_TAKEN_OVER`=4001, ลบทันทีไม่เข้า grace)
- Client `src/engine/net/net-client.ts`: fetch `/api/auth/rt-token` (401→`/api/auth/guest`→retry; offline/dev fetch fail → join ไม่มี token) แนบใน joinOptions **ตอน fresh join เท่านั้น** (reconnect ไม่ผ่าน onAuth); takeover = terminal (ล้าง token/store, ไม่ auto-reconnect วน) · `.env.example` +`ALLOWED_ORIGINS`/`NODE_ENV`
- Gate: **793 tests เขียว** (+`tests/server-security.test.ts` 26 assert) · lint/`next build`/`tsc -p server/tsconfig.json` เขียว · **e2e smoke 8/8 PASS** (dev bypass ยืนยันทำงาน) · traps ใหม่ 2 อัน (onAuth static, takeover terminal) → `docs/known-traps.md`

### Latest work (2026-07-12, branch `docs/p2-prep-bible-import`)
- Import Production Bible Set v1 → `docs/design/bibles/` — ลำดับ source of truth: Bible ชนะพฤติกรรม/ความหมาย, tech architecture ชนะวิธี implement (INDEX §2)
- decision-index: +12 แถว (Bible 1.1–5.3 + Q1–Q5 resolutions + caveman-code ไม่ใช้) · owner-decision-queue ปิด → `docs/history/2026-07-12-owner-decision-queue-closed.md`
- Spec amendments: game v15.2 (§0.0.1 log, §8.1 ลำดับอาชีพ, §50.1.1 resource/rounding/DEF/grouping, §59.1.2 background tab, §59.3.1 party model) · tech v1.5.2 (§6.2 realtime/ops, §12.1 P2 scope+P2B, §15.7.1 combat baseline, §17.3 click radius+Map 1 ratified, L12 asset canvas) · balance proposal → **APPROVED baseline**
- `docs/agent-rules.md` ใหม่ (efficiency #3 — กติกากลาง brief + terse internal report + docs routing tier §7; brief ต่อไปอ้างไฟล์นี้แทน paste ซ้ำ)
- `docs/tech/deungpu_P2_ISSUE_BREAKDOWN_v1.md` ใหม่ — 17 issues 3 คลื่น (e2e harness = P2-00) + done definition + P2B outline + content track; **owner ตอบคำถามครบแล้ว: PR ต่อคลื่น / นักธนู→P2B / Remote MySQL เปิดแล้ว**
- **Spec ใหม่ 2 เล่มจาก owner (locked design)** → `docs/design/`: **เล่มดึ๋งๆ** (`deungpu_DUNG_DUNG_COMPANION_GUIDE_SYSTEM_SPEC_v1.md` — companion + "เล่นยังไง"/"ทำอะไรต่อดี" = คำตอบการบ้าน Q4) + **เล่ม Achievement/Journal** (`deungpu_ACHIEVEMENT_AND_ADVENTURE_JOURNAL_SPEC_v1.md`) · เคาะครบ 12 ข้อ (C1–C2, D1–D5, A1–A4 — ดู decision-index): P2 = DG lite (P2-12 เขียนใหม่), P2B = ตัวดึ๋งๆ + Achievement v1, ดึ๋งๆ ≠ Bot A + start flow แก้ (Bot A intro ย้ายไปตอนปลดล็อก), asset priority ใหม่ (ดึ๋งๆ อันดับ 2, bespoke placeholder + 12 animations), companion local-only, Auto Pilot ≠ bot, credit = participation, GameEvent log เริ่ม P2

### วิธีรัน realtime local (2 terminal)
- Terminal 1: `npm run dev:server` (Colyseus บน ws://localhost:2567; env `PORT` override ได้)
- Terminal 2: `npm run dev` (Next client; env `NEXT_PUBLIC_RT_URL` override server url ได้)
- เปิด 2 browser tab ที่ `/game` → เห็นผู้เล่น 2 ตัว (local=เหลือง, remote=ฟ้า) ขยับ sync กัน
- ไม่ start server = /game ยังเล่น solo (net.status = "offline", log warning)

## P0+P1 highlights (ปิดแล้ว 2026-07-12)

- **P0 — Engine Foundation** (12 issues): iso coordinate/depth-sort · test map loader · renderer scene graph + camera · local player movement (WASD) · sprite animation (data-driven, 5-dir+mirror) · Colyseus realtime room skeleton · channel stub · dummy mob pocket spawn + wander · combat stub (hit-test/damage/feedback) · debug overlay (F3) · handoff check 12/12 PASS
- **P1 — World Sync** (12 issues): snapshot interpolation buffer · server-authoritative movement validation · server-side mob simulation (aggro/leash/respawn) · skill schema loader (§50.1, 37 field) · server combat authority (formula §15.2) · combat feel pass (pooled damage numbers/hit-stop/screen-shake, F4 stress harness) · reconnect 30s grace (§59.1) · channel auto-assign + party sync (native Colyseus `filterBy`) · A* pathfinding + click-to-move + touch · Map 1 production layout + map transition · City Hub "นครอรุณผนึก" (safe zone) · handoff check 12/13 PASS + 1 PARTIAL (mob chase — script limitation ไม่ใช่บั๊ก)
- **Review-fix 2 รอบ** จาก owner ทดสอบจริงบน browser: round 1 (22-item checklist) = reconnect token persist ข้ามรีเฟรช + ghost seat + StrictMode double-mount, juice floor ตอน kill/crit, walk-to-attack ต่อเนื่อง, exit ground marker + reachability guard test, debug overlay ย้ายมุมขวาบน; round 2 (5-point retest) = self-position adoption ก่อนส่ง move แรก (กัน correction/exit ไม่ทำงานตอน spawn), server-side hit tolerance (23–52% → 98.3% hit rate), เห็น remote player โจมตีบนจอเรา (`MSG_SKILL_RESULT`)
- **Spec amendment v15.1 / v1.5.1**: สะท้อน decision ที่เคาะระหว่าง P0/P1 เข้า spec in-place — ต่อมา v15.2/v1.5.2 (Bible Set) ปิดสถานะ PENDING ทั้งหมด
- **Deploy prep**: production start script + standalone build + `.env.example` + `docs/deploy-checklist.md` + `/healthz` endpoint

รายละเอียดเต็มทุก issue (P0-01→12, P1-01→12, review-fix round 1/2, spec amendment, prod stutter fix) → **`docs/history/2026-07-12-p0-p1-worklog.md`**

## Blockers / owed

1. **P2 breakdown รอ owner review** — `docs/tech/deungpu_P2_ISSUE_BREAKDOWN_v1.md` + ตอบคำถาม 4 ข้อท้ายไฟล์ (execution mode PR ต่อคลื่น?, นักธนู P2 หรือ P2B, player journey doc, Hostinger MySQL ตอน P2-16) — เคาะแล้วเริ่มคลื่น 1 ได้ทันที
2. **Production smoke test รอบเต็ม** (2 เครื่อง ตาม `docs/deploy-checklist.md` §3) — ยังไม่ได้ทำเป็นทางการหลัง stutter fix; ไม่ block P2
3. **Render ยัง free tier** — อัปเกรด paid เมื่อชน hard trigger ตาม Bible 5.1 (คนนอก >5 / test >60 นาที / persistence data จริง / P2 integration env — ข้อสุดท้ายจะถึงตอน P2-16, ต้องคุยกับ owner)
4. **doc การบ้าน owner "ต้องทำอะไรต่อ" (player journey)** — ป้อนเนื้อหา hint panel (P2-12); โครงระบบไม่ block

## Owner decisions affecting immediate work

- Spec-first rule: ห้ามเดา ห้ามคิดเอง — เกิน spec ต้องอัปเดต spec ก่อน (decision-index #1)
- **Production Bible Set v1 = decision baseline** — ก่อน propose อะไร เช็ค `docs/design/bibles/deungpu_OWNER_DECISIONS_v1.md` + `docs/decision-index.md` ก่อน (อย่า re-propose)
- Locked decisions ทั้งหมด: tech architecture §0.1 (L1–L18) + Bible Set
- งานที่แตะโค้ด: อ่าน `docs/agent-rules.md` + `docs/known-traps.md` ก่อนเสมอ

## Do not touch right now

- `docs/design/**` + `docs/tech/**` (รวม `bibles/`) — spec แก้ได้เฉพาะ owner เคาะ (breakdown/proposal ที่เป็น DRAFT ของ tech แก้ได้ตามงาน)

## Next recommended work

- **รอ owner**: review PR branch `docs/p2-prep-bible-import` + เคาะ P2 breakdown (+ตอบคำถาม 4 ข้อ) → เริ่ม **คลื่น 1** (P2-00 e2e harness, P2-01 Zustand bridge, P2-02 DB schema, P2-14 multi-hit rounding — ขนานกันได้)
- **Content track**: C0 ปิดท้าย (SVG placeholder kit ตามมาตรฐานใหม่) + C1 เริ่มคู่ P2 เมื่อ owner สั่ง
- P2B design detail → แตกตอน P2 ใกล้จบ
