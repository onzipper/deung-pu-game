# Current state

> กติกา: อัปเดตไฟล์นี้ทุกรอบ · block ที่ถูก supersede → `docs/history/` · สั้นพออ่านได้ทุก session

_Last updated: 2026-07-12_

## Where we are

**P0 เริ่มแล้ว** (Engine Foundation Vertical Slice, tech §19 · `docs/design/deungpu_P0_SCOPE_LOCK_v1.md`). **P0-01 Runtime Setup / P0-02 Iso Coords / P0-03 Test Map Config เสร็จ (รอ review)**. **P0-04 Renderer Scene Graph & Depth Sorting เสร็จ (รอ review)**: route `/game` แทน placeholder ด้วย P0 Test Field render จริง — diamond grid (checker + blocked color) + props + entity layer ที่ depth-sort ตาม iso/zLayer + fixed camera follow + debug pointer entity (พิสูจน์ dynamic sort ด้วยตา). ถัดไป: P0-05 Local Player Movement Prototype

## Latest work

- 2026-07-12: P0-04 Renderer Scene Graph & Depth Sorting — `src/engine/render/{depth-registry,camera,scene}.ts` + `src/engine/runtime/app.ts` (rewrite) + config theme/camera knobs + `tests/engine-render-{depth,camera}.test.ts`. แยก pure logic (DepthRegistry = source of truth ของลำดับ + dirty tracking · camera math = bounds/clamp/lerp) ออกจาก pixi glue (scene.ts). Sort: assign unique zIndex rank จาก DepthRegistry → pixi sort เฉพาะเมื่อ dirty (ไม่ sort ทั้ง scene ทุก frame, TA §11); tie-break depthKey→tx→insertion seq (total order deterministic). Ground layer วาดครั้งเดียว (ไม่ sort). Camera: fixed iso no-rotation, lerp follow + clamp ขอบ map. **Cross-review fix (BLOCKER-1)**: lock convention "tile ที่ส่งเข้า entity/prop API = foot ต่อเนื่อง → `render/placement.ts` `entityFootToScreen` = tileToScreen (ไม่ +0.5)"; basis เดียวกับ depthKey/camera (กันเหลื่อมครึ่ง tile กับ cursor/กล้อง); prop integer ใน p0-test-field ปรับเป็น n+0.5 (author intent = กลาง cell); เพิ่ม known-traps 2 entry. เทสต์ 116 เขียว, lint/build ผ่าน
- 2026-07-12: P0-03 Test Map Config — `src/engine/map/{types,loader,p0-test-field}.ts` + `tests/engine-map-loader.test.ts`. MapConfig ตาม spec P0 §4.3 (field ชั้นนอกล็อก); CollisionLayer = blockedRects+blockedTiles → build blockedSet (packTile, lookup O(1) จาก integer tile); PropSpawn (tile float ได้ + zLayer สำหรับ depth band); MobPocket (area rect + packSize + activeCap ตาม TA §18). loader validate ด้วยมือ ไม่ใช้ zod (fail-loud, ชี้ field ผิด). P0 Test Field = 24×24, spawn (12.5,12.5), กำแพง+บ่อน้ำ block, 7 props (บาง float), 3 pockets (slime/mushroom). pure TS ไม่พึ่ง React/pixi
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

- P0-05 Local Player Movement Prototype — แทน debug pointer entity ด้วย player จริง (keyboard/click-to-move + collision ผ่าน isWalkableTile + direction resolver 5-dir+mirror); ใช้ scene entity API (addEntity/moveEntity) + setCameraTarget follow player; ปิด `config.debugPointerEntity` ตอนนั้น (`docs/design/deungpu_P0_SCOPE_LOCK_v1.md` §4.4)
