# Current state

> กติกา: อัปเดตไฟล์นี้ทุกรอบ · block ที่ถูก supersede → `docs/history/` · สั้นพออ่านได้ทุก session

_Last updated: 2026-07-12_

## Where we are

**P0 เริ่มแล้ว** (Engine Foundation Vertical Slice, tech §19 · `docs/design/deungpu_P0_SCOPE_LOCK_v1.md`). **P0-01→P0-08 เสร็จ (รอ review)**. **P0-07 Realtime Room Skeleton เสร็จ**: Colyseus server แยก process (`server/`, รัน `npm run dev:server`) + client net layer (`src/engine/net/`) — join/leave · position sync ~12Hz · เห็น remote player ขยับ · **offline-safe** (ไม่ start server = เล่น solo ได้). **P0-08 Channel Stub เสร็จ**: channelId เป็น first-class field (client ส่งจริงใน joinOptions, ไม่ hardcode) + server `.filterBy(['mapId','channelId'])` แยก room instance ตาม channel จริง + `getNetDebugInfo()` ให้ P0-11 อ่าน. ถัดไป: **P0-09 Combat Stub** (ดู P0_SCOPE_LOCK §4.8+§4.9)

### วิธีรัน realtime local (2 terminal)
- Terminal 1: `npm run dev:server` (Colyseus บน ws://localhost:2567; env `PORT` override ได้)
- Terminal 2: `npm run dev` (Next client; env `NEXT_PUBLIC_RT_URL` override server url ได้)
- เปิด 2 browser tab ที่ `/game` → เห็นผู้เล่น 2 ตัว (local=เหลือง, remote=ฟ้า) ขยับ sync กัน
- ไม่ start server = /game ยังเล่น solo (net.status = "offline", log warning)

## Latest work

- 2026-07-12: **P0-08 Channel Stub** — channelId เป็น first-class field: `src/shared/net-protocol.ts` `JoinOptions.channelId` (client ส่งจริง, default constant `DEFAULT_CHANNEL_ID` ไม่ hardcode ซ้ำฝั่ง server) + `src/engine/config.ts` `NetConfig.channelId` (Design Knob ใหม่, default `DEFAULT_CHANNEL_ID`) + `runtime/app.ts` ส่ง channelId ใน joinOptions จริง. **Server**: `server/index.ts` ผูก `gameServer.define(MAP_ROOM_NAME, MapRoom).filterBy(['mapId','channelId'])` (Colyseus 0.16 `RegisteredHandler.filterBy` — ดึงค่าจาก client joinOptions ตรง ๆ ตอน matchmake/create, ไม่ต้องพึ่ง metadata แยก); `MapRoom.onCreate` อ่าน `options.channelId ?? DEFAULT_CHANNEL_ID`; roomId จริง (`this.roomId`) เข้า state — มีอยู่แล้วตั้งแต่ P0-07 (ยืนยันซ้ำ). **Client debug API**: `net-client.ts` เพิ่ม `getNetDebugInfo(): {status, mapId, roomId, channelId, playerCount}` (playerCount คำนวณผ่าน pure helper ใหม่ `computePlayerCount` ใน `sync.ts`, online = remoteCount+1 มิฉะนั้น 0) ให้ P0-11 debug overlay ใช้แทนอ่าน `status` ดิบ. **Manual proof (ชั่วคราว, รันแล้วลบ ไม่ commit)**: start `dev:server` จริง → colyseus.js client A1 join channel "CH.1", A2 join channel "CH.1" (map เดียวกัน), B1 join channel "CH.2" (map เดียวกัน) → ผล: A1.roomId === A2.roomId (same-channel = same room, PASS), A1.roomId !== B1.roomId (diff-channel = diff room, PASS), `state.roomId` ตรงกับ `room.roomId` จริงของ Colyseus ทั้ง 3 client (PASS) — proof PASSED ทั้งหมด. เทสต์ pure ใหม่: `tests/engine-net-sync.test.ts` (JoinOptions.channelId shape + computePlayerCount 6 เคส) + `tests/engine-config.test.ts` (NetConfig.channelId default + override). รวม 222 เทสต์เขียว (14 ไฟล์), `npm run lint` เขียว, `npm run build` เขียว, `tsc -p server/tsconfig.json --noEmit` เขียว. **ไม่ทำ** (P1, tech §6/RUNTIME §4): auto-assign channel จริง, UI เลือก channel, party sync, channel capacity
- 2026-07-12: **P0-07 Realtime Room Skeleton** — Colyseus (matched 0.16 line: `colyseus@0.16.5` + `@colyseus/schema@3` server · `colyseus.js@0.16.22` client, schema 3 ทั้งคู่ = wire-compatible) + `tsx` dev runner. **Server** (`server/`, แยก process ตาม L4, own tsconfig legacy-decorators): `index.ts` (Server+define+listen), `rooms/MapRoom.ts` (onCreate/onJoin/onMessage move/onLeave — P0 trust position), `schema/MapRoomState.ts` (PlayerState{tx,ty,direction,anim} + MapRoomState{mapId,channelId,roomId,players}). **Shared** `src/shared/net-protocol.ts` (wire contract, ไม่มี runtime dep). **Client** `src/engine/net/{sync,net-client,remote-player-manager}.ts` (pure throttle/coerce + colyseus.js glue graceful-offline + remote entity lerp สีต่าง) + `config.ts` NetConfig + `runtime/app.ts` wire net เข้า ticker (EngineHandle.net สำหรับ P0-11) + `local-player.ts` expose animation + `GameCanvas.tsx` env url. **พิสูจน์จริง**: start server + 2 colyseus.js client → A/B อยู่ room เดียวกัน, B เห็น A spawn (3,3), A ขยับ→B เห็น (7.5,4.25) dir=E anim=walk, A leave→B ได้ onRemove; channelId=CH.1. เทสต์ pure `tests/engine-net-sync.test.ts` (216 เขียวรวม), lint/build เขียว (server แยกออกจาก Next build/lint). **ยังไม่ทำ (P1, จด TODO ในโค้ด)**: reconnect 30s grace (tech §6/§59.1), server-authoritative movement validation (tech §6), channel auto-assign+party sync (RUNTIME §4), persistence, deploy Render
- 2026-07-12: **P0-06 Sprite Animation Prototype** — data-driven animation (tech §17.4, L15): `src/engine/animation/manifest.ts` (pure `resolveClip`: logical 8-dir → sprite source + mirror flag · 5 ทิศวาด S/SW/W/NW/N + mirror SE←SW/E←W/NE←NW · รองรับ 8-dir override = ประกาศครบ 8 ไม่ mirror · `advancePlayhead` pure frame timing/loop · `createPlayerAnimationManifest`) + `src/engine/animation/player-placeholder.ts` (generate placeholder texture ด้วยโค้ด Graphics→RenderTexture — ตัวละคร asymmetric [accent แดงข้างเดียว] ให้เห็น mirror ด้วยตา, walk/idle/attack, foot anchor คงที่) + `src/engine/animation/animator.ts` (เล่นเฟรมบน Sprite, mirror = scale.x=−1 รอบ anchor.x=0.5 → เท้าไม่ย้าย) + `config.ts` `PlayerAnimationConfig`/`PlayerSpriteStyle` + `local-player.ts` ใช้ animator (walk/idle ตาม intent, ถอด nose ออก). เทสต์ `tests/engine-animation-manifest.test.ts` (37 เคส: 8 ทิศ×idle/walk + 8-dir override + error + timing/loop). รวม 204 เขียว, lint/build ผ่าน. **ยังไม่ทำ**: art จริง (ใช้ placeholder), mob animation wire (P0-09), attack input (P0-08), server sync (P0-07)
- 2026-07-12: **P0-05 Local Player Movement Prototype** — `src/engine/input/keyboard.ts` (intent tracker: WASD+arrows → tile-space intent ผ่าน inverse projection · pure `intentFromKeys`) + `src/engine/movement/{mover,direction}.ts` (pure: `stepMovement` เดินต่อเนื่อง+normalize เฉียง+collision slide แยกแกน+clamp dt · `resolveDirection` tile→8-dir จากมุมบนจอ + `directionToScreenUnit`) + `src/engine/player/local-player.ts` (pixi glue: keyboard→mover→direction→scene entity + camera follow + placeholder body/nose บอกทิศ) + config `PlayerConfig` (speed 4 tile/s, maxStepSeconds 0.1) + `runtime/app.ts` wire player เข้า ticker (dt วินาที). **ถอด debug pointer entity ออกจาก scene.ts** (player แทน) + ลบ `debugPointerEntity`/`debugEntity` config. เทสต์ใหม่ 3 ไฟล์ (167 เขียวรวม), lint/build ผ่าน. **ยังไม่ทำ**: sprite animation จริง (P0-06), click-to-move/pathfinding (P1), server sync (P0-07)
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

- **P0-09 Combat Stub** attack: manifest มี `attack` clip (loop=false) + placeholder texture พร้อม — เหลือ wire input/trigger; dummy mob spawn ใน pocket 2–3 จุด (`p0-test-field` มี pockets แล้ว, ดู P0_SCOPE_LOCK §4.8 · TA §18)
- **P0-11 Debug Overlay**: อ่าน `EngineHandle.net.getNetDebugInfo()` (status/mapId/roomId/channelId/playerCount) ที่ P0-08 เปิดไว้ + FPS/coord (P0_SCOPE_LOCK §4.10)
- ระวังตอนต่อ P1 World Sync: net layer P0 ยัง trust position + ไม่มี reconnect/validation/auto-assign channel จริง — TODO ชี้ tech §6/§59.1/RUNTIME §4 จดไว้ในโค้ด (`server/rooms/MapRoom.ts`, `net-client.ts`)
