# Current state

> กติกา: อัปเดตไฟล์นี้ทุกรอบ · block ที่ถูก supersede → `docs/history/` · สั้นพออ่านได้ทุก session

_Last updated: 2026-07-12_

## Where we are

**P0 เริ่มแล้ว** (Engine Foundation Vertical Slice, tech §19 · `docs/design/deungpu_P0_SCOPE_LOCK_v1.md`). **P0-01 Runtime Setup เสร็จ (รอ review/merge)**: route `/game` mount pixi Application ผ่าน engine layer (`src/engine/**`, plain TS — ไม่พึ่ง React) + placeholder scene (diamond หมุน + FPS) พิสูจน์ render loop, resize + lifecycle destroy สะอาด (กัน StrictMode double-mount). **P0-02 Isometric Coordinate System เสร็จ (รอ review)**: pure-math iso converters + depth key ใน `src/engine/iso/**`. ถัดไป: P0-03 Test Map Config

## Latest work

- 2026-07-12: P0-02 Isometric Coordinate System — `src/engine/iso/coords.ts` (TilePoint/ScreenPoint + tileToScreen/screenToTile/snapToTile) + `src/engine/iso/depth.ts` (depthKey + zLayer band) — pure math, ห้าม render/PixiJS; เทสต์ round-trip + band non-overlap (never-downgrade zone)
- 2026-07-11: สร้าง Next.js project + push ขึ้น GitHub
- 2026-07-11: นำ spec 6 ไฟล์เข้า repo (game spec v14 canonical + map bibles + tech architecture v1.4 + decision locks)
- 2026-07-11: ตั้งระบบ docs-for-AI (AI.md, CODEMAP, feature-map, context packs, decision-index, known-traps, path-guard test, agent personas)
- 2026-07-11: เพิ่ม specialist personas (engine/game/ui/qa/docs-curator) — realtime/worker/data/audio จดเป็น deferred รอ phase จริง (`.claude/README.md`)
- 2026-07-11: owner เคาะ 3 decisions: branch model (develop), ClickUp tracking, tech ตั้งเลข balance + update spec (ดู decision-index)
- 2026-07-11: นำภาพ ref 11 ภาพเข้า `docs/design/art-reference/` — กลุ่ม A (pixel art) = style target, กลุ่ม B = layout เท่านั้น
- 2026-07-12: owner สั่ง**เลิกใช้ ClickUp** — track งานใน repo ที่เดียว (docs); ไม่ลบข้อมูลใน ClickUp (decision-index #13/#16 superseded)
- 2026-07-12: import **spec v15 + tech v1.5 + P0_SCOPE_LOCK_v1**; ย้าย v14/v1.4 → `docs/history/`; อัปเดต reference ทุก index doc (canonical ชี้ v15/v1.5) — delta หลัก = P0 Scope Lock
- 2026-07-12: **P0-01 Runtime Foundation** — ติดตั้ง pixi.js v8.19 + สร้าง engine runtime (`src/engine/config.ts`, `src/engine/runtime/{app,resize,assets}.ts`) + `src/ui/GameCanvas.tsx` + route `/game`; unit test config+resize เขียว, build ผ่าน

## Blockers / owed

1. ~~ยังไม่มีโค้ดเกม / hold~~ — **owner สั่งเริ่ม P0 แล้ว 2026-07-12** — งานโค้ดวิ่งตาม P0-01→12
2. ค้าง: tech ร่างตัวเลข balance P0 (ค่า k, ตาราง skill 5 อาชีพ) เสนอเป็น spec update ให้ owner เคาะ (decision-index)
3. ~~ClickUp skill~~ — **ปิดแล้ว 2026-07-12** (เลิกใช้ ClickUp)
4. ~~PixiJS 8 ยังไม่ได้ติดตั้ง~~ — **ติดตั้งแล้ว 2026-07-12** (pixi.js v8.19, P0-01)
5. ภาพ ref กลุ่ม B (04–11) เป็น painterly — owner อาจ gen ใหม่เป็น pixel art มาแทน

## Owner decisions affecting immediate work

- Spec-first rule: ห้ามเดา ห้ามคิดเอง — เกิน spec ต้องอัปเดต spec ก่อน (decision-index #1)
- Locked decisions ทั้งหมด: tech architecture §0.1 (L1–L18) — server-authoritative, MySQL, Render, iso, 5 อาชีพ, P0 scope lock ฯลฯ

## Do not touch right now

- `docs/design/**` + `docs/tech/**` — spec แก้ได้เฉพาะ owner เคาะ

## Next recommended work

- P0-03 Test Map Config — นิยาม map/tile data (grid ขนาด, walkability) บน iso foundation ของ P0-02 ตาม `docs/design/deungpu_P0_SCOPE_LOCK_v1.md` §4.3 (depth-sort renderer + scene graph เหลือ P0-04)
