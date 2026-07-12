# ดึ๋งปุ๊ — P1 Issue Breakdown v1

> สถานะ: **DRAFT โดย tech (orchestrator) — owner ดูตอน review PR ที่สอง** (ตาม decision-index 2026-07-12)
> Scope source: P0_SCOPE_LOCK §8 + tech architecture v1.5 §12 (แถว P1 — World Sync) — ไม่มีการเพิ่ม scope นอก spec
> กติกาเดิม: ค่า balance = Design Knob จาก config · ตัวเลขจริงรอ owner เคาะ (proposal แยก, mark PENDING OWNER)

## เป้า P1 (จาก tech §12)

> ผู้เล่น 2–5 คนเห็นกันและตีมอบร่วมกันได้จริงผ่าน server-authoritative loop แรก: movement predict/interp · mob AI ฝั่ง server · skill intent→result · spawn/respawn จริง · reconnect/channel ตาม §59 · Map 1 production layout

## Issues (เรียงตาม dependency)

| # | Issue | Scope ย่อ | Spec |
|---|---|---|---|
| P1-01 | Netcode interpolation + prediction | client: interpolation buffer ~100–150ms สำหรับ remote entities, local prediction + reconcile เบา | TA §6 movement sync |
| P1-02 | Server-authoritative movement | server โหลด map config + validate (speed cap, wall clip, teleport) → snap กลับ; client ส่ง intent 10–15Hz | TA §6, §7, §16.3 |
| P1-03 | Server-side mob simulation | spawn/respawn loop ใน MapRoom (pocket ตาม §18.1), AI aggro/leash/pull cap (§18.3), AI LOD tick, AOI filter (§18.2), sync spawn/state/death events | TA §18 |
| P1-04 | Skill schema loader (§50.1) | config loader + validation ครบ 37 fields ชื่อเป๊ะ, แยก server-only/shared/client-only ตาม §16.1, client cast intent | GS §50.1 · TA §16.1 |
| P1-05 | Server combat authority | `cast_skill` intent → validate (cooldown/resource/range) → AoE hit จาก spatial hash → damage formula §15.2 (ค่า k = knob) → `skill_result` broadcast → mob death/respawn ฝั่ง server | TA §15, §6, §7 |
| P1-06 | Combat feel pass | client juice จาก skill_result: BitmapText damage numbers + pool, hit stop, screen shake, effect quality tiers — ทดสอบ budget 60fps @ 40 mobs + 300 dmg numbers/วิ | TA §11 · GS §17 |
| P1-07 | Reconnect 30s grace | allowReconnection + seat reservation + token, same pos ถ้า valid / safe camp fallback, anti-exploit ตาม §59.1 | GS §59.1 · TA §6 |
| P1-08 | Channel auto-assign + party sync | auto-assign ตาม load/population, party primitive minimal (in-memory), สมาชิก party ตามกันลง channel เดียว, prompt เมื่อหลุด | GS §59.3 · TA §6 |
| P1-09 | Click-to-move + pathfinding + touch พื้นฐาน | A* บน iso grid, click-to-move polish, touch input ตาม L11 (WASD ยังอยู่) | TA §17.3 · L11 |
| P1-10 | Map 1 production layout + transition | Map 1 "ธงเมืองมนุษย์" จาก MAP_LAYOUT_BIBLE (placeholder art), map transition + fade, safe camp/warp | GS §57.3 · MAP_LAYOUT_BIBLE |
| P1-11 | City hub พื้นฐาน | CityHubRoom (พระอรุณคซึก): presence + เดินเจอกัน, cap สูงกว่า, ไม่มี combat | TA §6 city hub |
| P1-12 | P1 handoff check | done definition ด้านล่าง + perf budget check + docs sync | — |

## Done definition (P1)

```
1. 2 browser เดินเห็นกัน smooth (interpolation ไม่กระตุก, ping local)
2. server ปฏิเสธ movement โกง (speed hack จำลอง → snap กลับ)
3. mob เกิด/ตาย/เกิดใหม่จาก server — ทุก client เห็นตรงกัน
4. mob ไล่ผู้เล่น (aggro) และเลิกไล่เมื่อพ้น leash
5. กด skill → server คำนวณ → damage number จาก result จริง (ไม่ใช่ client มโน)
6. สูตร damage = §15.2 multiplicative diminishing, ค่า k อ่านจาก config
7. reconnect ภายใน 30 วิ กลับตำแหน่ง+ห้องเดิม / เกิน → safe camp
8. party 2 คนเข้า map แล้วอยู่ channel เดียวกันอัตโนมัติ
9. click-to-move + touch เดินได้
10. Map 1 layout จริงเดินได้ + transition จาก test field
11. city hub เข้าได้ เห็นคนอื่น
12. 60fps desktop @ 40 mobs + 300 damage numbers/วิ (budget TA §11)
13. ตัวเลข balance ทุกตัวอยู่ใน config + มี proposal doc รอ owner เคาะ — ไม่มี hardcode
```

## คำถามค้างถึง owner (ไม่ block — ใช้ draft ไปก่อนตามมติ 2026-07-12)

1. **ตาราง skill 5 อาชีพ + ค่า k**: ร่างอยู่ใน `docs/design/proposals/` — runtime รองรับครบ 5 อาชีพผ่าน config; เลข = PENDING OWNER
2. **ลำดับอาชีพที่ implement ก่อน**: P1 ทำ นักดาบ ครบก่อน (vertical slice) อีก 4 อาชีพเป็น config ที่เติมได้ทันทีหลังเคาะ — ถ้า owner อยากได้อาชีพอื่นก่อนแจ้งได้
3. City hub ใน P1-11: tech §12 ใส่ไว้ใน P1 แต่ถ้า review แล้วอยากดัน P2 เพื่อเร่ง combat loop บอกได้ (ตัดได้ไม่กระทบ issue อื่น)
