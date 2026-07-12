# Current state

> กติกา: อัปเดตไฟล์นี้ทุกรอบ · block ที่ถูก supersede → `docs/history/` · สั้นพออ่านได้ทุก session

_Last updated: 2026-07-12_

## Where we are

**P2 คลื่น 1 เสร็จครบ 4/4** (branch `feat/p2-wave1`, 2026-07-12 — PR รอ owner review): **P2-14** multi-hit rounding = round-total-once + subHits (ปิด debt Bible 1.8, never-downgrade รีวิวไขว้แล้ว) · **P2-02** Prisma/MySQL schema 10 ตาราง offline ทั้งหมด (ยังไม่แตะ DB จริง — Prisma pin 6.x; ⚠ pending owner: Character.name unique/กติกาชื่อ) · **P2-01** Zustand bridge จริง (`src/ui/store/`, DebugOverlay เลิก poll, contract ui.md อัปเดต) · **P2-00** e2e harness ถาวร (`npm run e2e` — 8 checks พิสูจน์กับ server จริง) · **เทสต์ 699/699 เขียว + lint + build ผ่าน** · ถัดไป = คลื่น 2 (auth → persistence → value loop) · **owner ส่ง `docs/deungpu_P2_UI_VISUAL_IMPLEMENTATION_SPEC_v1.md` เพิ่ม** (ปิดช่องว่าง UI) — กำลังวิเคราะห์/ตั้งคำถามก่อน integrate

**P0 + P1 ปิดแล้ว** (merge `main` ผ่าน PR #6, 2026-07-12) + **prod stutter fix แล้ว** (PR #7 — minElapsedMs 50→90 + correction-resume; verify บน prod = 0 corrections; รายละเอียด `docs/history/2026-07-12-p0-p1-worklog.md` + `docs/known-traps.md`). **Deploy live ทั้งสองฝั่ง**: server = Render free tier + UptimeRobot (`https://deung-pu-game.onrender.com`, `/healthz`), client = Hostinger (`https://deung-pu.softrock.space/game`).

**Owner ปิด decision queue ทุกข้อแล้ว (2026-07-12)** ผ่าน **Production Bible Set v1** → อยู่ใน repo ที่ `docs/design/bibles/` (10 เล่ม — เล่มแรกที่ต้องเปิด: `deungpu_OWNER_DECISIONS_v1.md`) · spec เป็น **game v15.2 / tech v1.5.2** แล้ว (balance เลิกสถานะ PENDING — k=50, นักธนู=อาชีพที่ 2, party = public shared (final), background tab = safe-disconnect flow, milestone P2B ใหม่, asset canvas standards) · **P2 breakdown ร่างเสร็จ รอ owner review**: `docs/tech/deungpu_P2_ISSUE_BREAKDOWN_v1.md`

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
