# Current state

> กติกา: อัปเดตไฟล์นี้ทุกรอบ · block ที่ถูก supersede → `docs/history/` · สั้นพออ่านได้ทุก session

_Last updated: 2026-07-12_

## Where we are

**P0 + P1 ปิดแล้ว** — merge เข้า `main` ผ่าน PR #6 (2026-07-12, `develop` → `main`); **623 tests เขียว** (docs path-guard รวมอยู่ในนั้น). **Test deploy live**: server บน **Render free tier + UptimeRobot** (`https://deung-pu-game.onrender.com`, `/healthz` = monitor endpoint) — พิสูจน์แล้วว่า matchmake + wss join + state sync + mob sim ทำงานบน production จริง. Client ฝั่ง **Hostinger** ยังไม่ deploy — รอ owner build ด้วย `NEXT_PUBLIC_RT_URL=wss://deung-pu-game.onrender.com` (ตาม `docs/deploy-checklist.md`) แล้ว smoke test ร่วมกัน. ถัดไป = ร่าง **P2 issue breakdown** (persistence/save, inventory, bot & report §59.2/TA §9, resync-on-refocus, start map จริง + จำ map ข้ามรีเฟรช, mobile polish, NPC/market) เมื่อ owner สั่งเริ่ม.

### วิธีรัน realtime local (2 terminal)
- Terminal 1: `npm run dev:server` (Colyseus บน ws://localhost:2567; env `PORT` override ได้)
- Terminal 2: `npm run dev` (Next client; env `NEXT_PUBLIC_RT_URL` override server url ได้)
- เปิด 2 browser tab ที่ `/game` → เห็นผู้เล่น 2 ตัว (local=เหลือง, remote=ฟ้า) ขยับ sync กัน
- ไม่ start server = /game ยังเล่น solo (net.status = "offline", log warning)

## P0+P1 highlights (ปิดแล้ว 2026-07-12)

- **P0 — Engine Foundation** (12 issues): iso coordinate/depth-sort · test map loader · renderer scene graph + camera · local player movement (WASD) · sprite animation (data-driven, 5-dir+mirror) · Colyseus realtime room skeleton · channel stub · dummy mob pocket spawn + wander · combat stub (hit-test/damage/feedback) · debug overlay (F3) · handoff check 12/12 PASS
- **P1 — World Sync** (12 issues): snapshot interpolation buffer · server-authoritative movement validation · server-side mob simulation (aggro/leash/respawn) · skill schema loader (§50.1, 37 field) · server combat authority (formula §15.2) · combat feel pass (pooled damage numbers/hit-stop/screen-shake, F4 stress harness) · reconnect 30s grace (§59.1) · channel auto-assign + party sync (native Colyseus `filterBy`) · A* pathfinding + click-to-move + touch · Map 1 production layout + map transition · City Hub "นครอรุณผนึก" (safe zone) · handoff check 12/13 PASS + 1 PARTIAL (mob chase — script limitation ไม่ใช่บั๊ก)
- **Review-fix 2 รอบ** จาก owner ทดสอบจริงบน browser: round 1 (22-item checklist) = reconnect token persist ข้ามรีเฟรช + ghost seat + StrictMode double-mount, juice floor ตอน kill/crit, walk-to-attack ต่อเนื่อง, exit ground marker + reachability guard test, debug overlay ย้ายมุมขวาบน; round 2 (5-point retest) = self-position adoption ก่อนส่ง move แรก (กัน correction/exit ไม่ทำงานตอน spawn), server-side hit tolerance (23–52% → 98.3% hit rate), เห็น remote player โจมตีบนจอเรา (`MSG_SKILL_RESULT`)
- **Spec amendment v15.1 / v1.5.1**: สะท้อน decision ที่เคาะระหว่าง P0/P1 เข้า spec in-place (reconnect token per-tab, นโยบายแท็บเบื้องหลัง, exit ground marker, hit tolerance mechanism, walk-to-attack state machine) — **ยังไม่มีค่า balance ใดถูก merge เข้า spec**
- **Deploy prep**: production start script + standalone build + `.env.example` + `docs/deploy-checklist.md` + `/healthz` endpoint

รายละเอียดเต็มทุก issue (P0-01→12, P1-01→12, review-fix round 1/2, spec amendment) → **`docs/history/2026-07-12-p0-p1-worklog.md`**

## Blockers / owed

1. **Hostinger client deploy + production smoke test** — รอ owner build+deploy ตาม `docs/deploy-checklist.md` แล้วทดสอบร่วมกับ Render server จริง
2. **ตัวเลข balance P1** (ค่า k, stat baseline, ตาราง skill 5 อาชีพ, mob Map 1) — proposal ร่างแล้วรอ owner เคาะ: `docs/design/proposals/deungpu_P1_BALANCE_PROPOSAL_v1.md` (PENDING OWNER; implement ด้วยค่า draft ไปแล้วทั้ง P1). จุดต้องเคาะเพิ่ม: hit tolerance ตัวเลข (§15.7), party model (private-party-channel ที่ implement จริง vs shared-population ที่ brief ร่างไว้), resource pool (§50.1 มี resourceCost แต่ 10-stat ไม่มี pool), §16.1 field grouping (skillName/description/statusEffects ไม่ถูกจัดหมวดชัดเจน), multi-hit damage rounding — checklist เต็มอยู่ท้าย `deungpu_P1_ISSUE_BREAKDOWN_v1.md` + proposal doc
3. **Render ยัง free tier** — ต้องเปลี่ยนเป็น paid always-on ก่อนเปิดให้ผู้เล่นจริง (decision-index 2026-07-12, free tier restart เป็นระยะ = state in-memory หาย)
4. **Efficiency improvements ที่ owner เคาะแล้ว** (e2e harness ถาวร + `agent-rules.md`) — ให้ทำตอนเปิด P2 breakdown

## Owner decisions affecting immediate work

- Spec-first rule: ห้ามเดา ห้ามคิดเอง — เกิน spec ต้องอัปเดต spec ก่อน (decision-index #1)
- Locked decisions ทั้งหมด: tech architecture §0.1 (L1–L18) — server-authoritative, MySQL, Render, iso, 5 อาชีพ, P0 scope lock ฯลฯ
- ดู `docs/decision-index.md` เต็มสำหรับ decision ล่าสุดทั้งหมด (test deploy free tier, นโยบายแท็บเบื้องหลัง, จุดเริ่มเกม/จำ map รอ P2, spec amendment)

## Do not touch right now

- `docs/design/**` + `docs/tech/**` — spec แก้ได้เฉพาะ owner เคาะ

## Next recommended work

- **รอ owner**: Hostinger deploy + smoke test, เคาะ balance proposal, ตัดสินใจ P2 scope ไหนเริ่มก่อน
- **P2 scope** (ยังไม่เริ่ม, TA §12 phase plan): persistence/inventory/enhancement (TA §7-8), bot & report (TA §9), market (TA §5,§7), audio (TA §22), NPC/ร้านค้า/event เมือง (GS §3.3), Map 2+ (bible มี layout ยังไม่แปลง), mobile polish เต็ม (virtual joystick/HUD ปุ่ม)
- **P1 HUD**: ติดตั้ง Zustand จริง + ย้าย pattern poll ชั่วคราวของ P0-11 (`src/ui/DebugOverlay.tsx`) เข้า store bridge ตาม `docs/context/ui.md` (contract: UI คุยกับ game ผ่าน Zustand เท่านั้น)
