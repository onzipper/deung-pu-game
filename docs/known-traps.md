# Known traps

บั๊ก class ที่เคยเสียเวลา debug จริง — อ่านก่อนแตะโค้ด · เติมทันทีเมื่อเจอบั๊กใหม่ (ใน commit เดียวกับ fix)

## Next.js 16 ไม่เหมือนที่โมเดลจำได้

- อาการ: เขียนโค้ดตาม convention Next.js เก่า แล้ว API/โครงสร้างไม่ตรง
- สาเหตุ: Next.js 16 มี breaking changes จาก training data
- วิธีเลี่ยง: อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด framework ทุกครั้ง (ดู AGENTS.md)

## Spec drift ระหว่าง design กับ tech

- อาการ: field/ค่าใน code ไม่ตรง spec เพราะ "จำได้ว่าประมาณนี้"
- สาเหตุ: spec ยาว อ่านไม่ครบ § แล้วเดา
- วิธีเลี่ยง: เปิด § ที่ feature-map ชี้ทุกครั้งก่อน implement — field names ต้อง copy จาก v15 §50.1 ตรง ๆ ห้ามพิมพ์จากความจำ

## iso placement: +0.5 ซ้ำซ้อน (sprite เพี้ยนครึ่ง tile)

- อาการ: sprite/entity ลอยต่ำ/เยื้องจาก cursor หรือกล้อง ~ครึ่ง tile (16px @ 64×32); player ไม่อยู่กลางจอ
- สาเหตุ: ผสม `tileCenterToScreen` (บวก +0.5) กับพิกัดที่ "ต่อเนื่อง/เป็น center อยู่แล้ว" (เช่น tile จาก `screenToTile(cursor)`) → บวก +0.5 ซ้ำ; หรือ entity ใช้ center basis แต่ camera/depthKey ใช้ origin basis → คนละ frame, depth sort สลับผิด
- วิธีเลี่ยง: **convention เดียว** — entity/prop API รับ "foot position ต่อเนื่อง" แล้ว render ด้วย `tileToScreen` เท่านั้น (`render/placement.ts` `entityFootToScreen`); centering เป็นหน้าที่ผู้ author (ใส่ n+0.5 ในพิกัด config). ห้ามผสม 2 basis ในเลเยอร์ที่ depth-sort ร่วมกัน — locked ด้วย `tests/engine-render-placement.test.ts`

## vitest พังเฉพาะบาง shell (TypeError reading 'config' ที่ describe)

- อาการ: `npm test` fail ทุกไฟล์ตอน collection ใน shell ของ subagent บางตัว ทั้งที่โค้ดถูก; เครื่อง owner + PowerShell หลักรันผ่าน (node 24.13 + vitest 4.1.10)
- สาเหตุ: ยังไม่ชี้ชัด — env ของ shell ที่ spawn (ไม่ใช่ตัวโค้ด)
- วิธีเลี่ยง: ถ้าเจอ ให้รัน smoke test เปล่า ๆ — ถ้าพังด้วย = ปัญหา env ไม่ใช่โค้ด อย่าเสียเวลา debug โค้ดตัวเอง; ยืนยัน gate จริงที่ PowerShell หลัก

## npm run <script> ล้ม: `'"node"' is not recognized` (env ของ shell ที่ spawn)

- อาการ: `npm test` / `npm run lint` / postinstall (เช่น tsx) พังด้วย `'node' is not recognized as an internal or external command` แม้ `node --version` ใน bash ทำงานปกติ
- สาเหตุ: ตอน npm spawn cmd.exe เพื่อรัน script/bin shim, node ไม่อยู่บน PATH ของ subprocess นั้น (env ของ shell ที่ spawn — ไม่ใช่โค้ด; ตรงกลุ่มเดียวกับ trap vitest ด้านบน)
- วิธีเลี่ยง: รัน tool ตรง ๆ ผ่าน node จาก bash — `node node_modules/vitest/vitest.mjs run`, `node node_modules/eslint/bin/eslint.js`, `node node_modules/next/dist/bin/next build`, หรือ `node_modules/.bin/<bin>`; ติดตั้ง dep ที่มี postinstall ด้วย `npm install ... --ignore-scripts` (เช่น tsx/esbuild — platform binary มากับ optional package อยู่แล้ว). ยืนยัน gate จริงบน PowerShell หลักของ owner

## Colyseus: client (colyseus.js) กับ server (colyseus) คนละเลข version — ต้องจับคู่ schema ให้ตรง

- อาการ: `colyseus` latest = 0.17.x แต่ `colyseus.js` latest = 0.16.22 (depends `@colyseus/schema ^3`); ถ้าจับ server 0.17 (schema 4) กับ client 0.16 (schema 3) เสี่ยง decode พัง (schema major = wire format ต่าง)
- วิธีเลี่ยง (P0-07 ใช้): pin **0.16 line ที่ schema 3 ทั้งสองฝั่ง** — `colyseus@0.16.5` + `@colyseus/schema@^3` (server) + `colyseus.js@0.16.22` (client, schema ^3). ยืนยัน runtime ด้วย 2-client proof ก่อนไปต่อ
- schema decorator (`@type`) = legacy PropertyDecorator → server ต้องมี `experimentalDecorators: true` + `useDefineForClassFields: false` (server/tsconfig.json). **กันชน Next**: `server/` ต้องอยู่ใน `exclude` ของ root tsconfig + `globalIgnores` ของ eslint ไม่งั้น next build/lint สะดุด decorator/node globals

## tsx: รัน script นอก project dir → หา node_modules ไม่เจอ

- อาการ: `Cannot find module 'colyseus.js'` เมื่อรัน proof script ที่วางใน scratchpad (นอก repo)
- วิธีเลี่ยง: วาง integration/proof script ไว้ **ใน project** (เช่น temp file ที่ root แล้วลบ) หรือ set `NODE_PATH` ชี้ node_modules ของ repo — node resolve module จากตำแหน่งไฟล์ขึ้นไป

## Combat damage formula ห้ามหลุด client bundle (P1-05, TA §7/§16.1)

- อาการเสี่ยง: client มีสูตร damage/ค่า balance ใน bundle → ผู้เล่น reverse-engineer / มโนผล → server-authority พัง (§7 economy risk)
- สาเหตุที่จะเกิด: `src/game/combat/` เป็นโค้ด shared (client glue เช่น combat-stub.ts อยู่โฟลเดอร์เดียวกับ formula.ts/cast-validation.ts) — เผลอ import formula.ts จาก client path หรือทำ barrel `index.ts` ที่ re-export ทุกอย่าง = สูตรติดไป client bundle
- วิธีเลี่ยง (P1-05 ใช้): `src/game/combat/formula.ts` = **server-only** (import เฉพาะ `server/rooms/**`) · **ไม่มี barrel/index** ใน `src/game/combat/` · client (combat-stub.ts / app.ts) import ได้เฉพาะ `hit-test.ts` (geometry) + `damage-number.ts` — **ห้าม** import formula.ts/cast-validation.ts. P1 monorepo ยังไม่มี import-graph test แยก bundle → คุมด้วย convention + comment header ("SERVER-ONLY") + review. ถ้าจะเพิ่ม barrel ในโฟลเดอร์นี้ ต้องกัน formula ออกจาก export ที่ client แตะ

## import "ข้อมูล" server-only = รั่วเท่ากับ import สูตร (clientView() runtime ไม่ช่วยเรื่อง bundle)

- อาการ: client static import ไฟล์ที่มี **full SkillDefinition literal** (เช่น `WARRIOR_SKILLS` เดิม) แล้วเรียก `clientView()` ตัด field ตอน runtime — แต่ **literal values (baseMultiplier 2.2, bossModifier, maxTargets, hitCount, pvpModifier, crowdControl) ยังถูก bundler รวมลง browser JS** ตั้งแต่บรรทัด import → เปิด devtools/source อ่าน reverse-engineer balance ได้ครบ (ขัด TA §7/§16.1)
- สาเหตุ: `clientView()` ทำงาน **หลัง** โหลด module แล้ว — bundler ไม่รู้ว่าจะตัด field ไหน จึงรวม object literal ทั้งก้อน (tree-shaking ไม่ตัด property ภายใน object ที่ถูกใช้). "ตัดตอน runtime" ≠ "ไม่อยู่ใน bundle"
- วิธีเลี่ยง (P1-05 ใช้): **แยก data 2 ไฟล์ตั้งแต่ต้น** — `src/game/skill/data/warrior-skills-server.ts` (full 37 field, SERVER-ONLY, import เฉพาะ `server/**`+tests) · `src/game/skill/data/warrior-skills-client.ts` (ClientSkillView 28 field, **ไม่มี server-only literal เลย**, client import ตัวนี้). กัน drift ด้วยเทสต์ `client == clientView(server)` (tests/game-skill-loader.test.ts). **หลักการ:** ถ้า literal ไหนเป็น balance/สูตร ห้ามให้ client import ไฟล์ที่มี literal นั้น — เช็คด้วย grep import graph ไม่ใช่เชื่อ runtime transform

## tsx รัน server: ต้องส่ง --tsconfig server/tsconfig.json (ไม่งั้น decorator พัง)

- อาการ: `node node_modules/tsx/dist/cli.mjs server/index.ts` → `TypeError: Cannot read properties of undefined (reading 'constructor')` ที่ @colyseus/schema annotations
- สาเหตุ: tsx default ใช้ modern (TC39) decorators ของ esbuild; @colyseus/schema `@type` = legacy PropertyDecorator ต้อง experimentalDecorators + useDefineForClassFields:false (อยู่ใน server/tsconfig.json)
- วิธีเลี่ยง: รันด้วย `--tsconfig server/tsconfig.json` เสมอ (ตรงกับ `npm run dev:server`); proof/integration script ก็ต้องผ่าน server ที่รันแบบนี้

## Reconnect token in-memory + StrictMode double-mount = refresh แล้วเป็นผู้เล่นใหม่ + 2 แท็บมองไม่เห็นกัน (P1-07-fix)

- อาการ (owner เจอบน browser จริง): เปิด `/game` 2 แท็บ "เห็นกันบ้างไม่เห็นบ้าง ต้อง refresh เรื่อย ๆ ถึงจะขึ้น"; ปิดแท็บเปิดใหม่ใน 30s ไม่กลับตำแหน่งเดิม
- สาเหตุ 3 ชั้นซ้อน:
  1. `reconnectionToken` เก็บใน memory ของ net-client เท่านั้น → refresh/reopen = token หาย → หน้าใหม่ join เป็นผู้เล่นใหม่เสมอ (ไม่ reconnect)
  2. refresh/close = ws หลุด **unconsented** (ไม่มี `room.leave()`) → server `allowReconnection` hold seat + PlayerState เป็น "ผี" 30s → refresh ซ้ำ ๆ สะสมผีจนห้องเต็ม (`channelCapacity` dev=8) → matchmaker แยกแท็บใหม่ไป CH.2 = 2 แท็บคนละห้อง มองไม่เห็นกัน; 30s ผ่านผี expire ห้องว่าง → refresh อีกทีเห็น = "เดี๋ยวก็ขึ้น"
  3. **StrictMode (dev)**: createEngine async + destroy ตอน cleanup → engine1 join+persist token แล้ว engine1 destroy (consented leave + ล้าง token) ก่อน engine2 → หลัง refresh engine1 reconnect แล้ว leave ทิ้ง seat, engine2 fresh join = ตำแหน่งหาย + join/leave race แย่ง seat กันเอง
- วิธีเลี่ยง (fix ใช้): (a) persist token ลง **sessionStorage per-tab** (`src/engine/net/reconnect-store.ts` — **ห้าม localStorage** 2 แท็บจะแย่ง token → kick กัน) + re-persist timestamp ตอน `pagehide`/`beforeunload` (ไม่ leave = ปล่อยหลุด unconsented ให้ reclaim ได้); boot ลอง `client.reconnect(token)` ก่อน (planRejoin: token สด+ตรง server/map/party) = reclaim ghost seat แทนเพิ่มผู้เล่นใหม่ → **ไม่สะสมผี ไม่แยกห้อง**; consented leave (SPA nav/map transition) = ล้าง token (กันดึงกลับ map เก่า) (b) กัน StrictMode double-mount ด้วย `setTimeout(0)` ใน `GameCanvas.tsx` — cleanup ของ StrictMode รัน (clearTimeout) ก่อน timer ยิง → engine ถูกสร้างครั้งเดียวจริง ไม่มี engine transient churn
- หมายเหตุ semantics: ปิดแท็บ **ไม่** reopen = ผีค้างให้คนอื่นเห็นสูงสุด = grace (30s, §59.1) ตามสเปก — เลี่ยงไม่ได้ถ้าจะให้ reconnect ทำงาน (ต้อง hold seat แบบ unconsented). ห้ามแก้ด้วยการ consented-leave ตอน unload (จะทำ reconnect พังทั้งหมด)

## Client ไม่ adopt ตำแหน่ง authoritative หลัง join/reconnect = warp + exit ไม่ยิง (issue #1/#2)

- อาการ (owner เจอบน browser จริง): (1) refresh แล้วตัวโผล่จุด spawn แต่พอเริ่มเดิน "วาร์ปกลับจุดเดิม"; (2) ออนไลน์ เดินเหยียบ exit marker เรืองแสงแล้ว "ไม่มีอะไรเกิดขึ้น" (ไม่ fade ไม่ข้าม map)
- สาเหตุ (root เดียว 2 อาการ): หลัง join/reconnect `status.state="online"` ทันที (ตอน JOIN_ROOM) **ก่อน** ROOM_STATE มาถึง → client ยังไม่รู้ตำแหน่งจริงที่ server hold. `snapshotChanged(null, snap)` = true เสมอ → tick แรกยิง MSG_MOVE จาก **spawn ของ client** (mountWorld วางที่ map.spawnPoint) ขณะ server tracker ยึดตำแหน่งเดิม (reconnect within grace). ผล: (1) server มองเป็น teleport/speed → MSG_POSITION_CORRECTION snap client กลับตำแหน่ง hold = "วาร์ป"; (2) server ยึดตำแหน่ง hold ต่อไป → client เดินเหยียบ exit (client-side) แต่ **ตำแหน่ง authoritative ฝั่ง server ไม่เคยเข้า exit area** → `checkExit`/MSG_MAP_TRANSITION ไม่ยิง. **server-side ปกติทุกอย่าง** (proof: เดินจริง step ≤ speed cap → server ยิง transition + 0 correction; reconnect → state.players[self] = ตำแหน่ง held) — บั๊กอยู่ที่ client ไม่ยอมรับตำแหน่ง server เป็นจุดตั้งต้น
- วิธีเลี่ยง (fix ใช้): (a) net-client เพิ่ม handler `onSelfSpawn` — ยิงตอน self เข้า room state ครั้งแรกต่อ connection (players.onAdd self branch, immediate=true ครอบทั้ง fresh join + reconnect) → caller (`app.ts`) `player.applyCorrection(snap.tx,snap.ty)` snap position+camera ไปตำแหน่ง authoritative ก่อนเดิน (fresh=spawn idempotent · reconnect=held). (b) gate `sendMove` ด้วย `canSendLocalMove(state, selfAdopted)` (sync.ts, pure) — `selfAdopted` reset=false ทุก wire, true เมื่อ onSelfSpawn → **ห้ามส่ง move ก่อน adopt** (ปิด race sub-frame ที่ tick แรกอาจยิงก่อน ROOM_STATE). **หลักการ:** colyseus join promise resolve ที่ JOIN_ROOM ไม่ใช่ ROOM_STATE → อย่าเชื่อว่า state พร้อมทันทีที่ online; ตำแหน่ง local player = server เป็น truth ตั้งแต่ frame แรก ไม่ใช่ map.spawnPoint

## ตีไม่โดนมอน: interp lag ทำ arc melee ไร้ความหมายที่ระยะประชิด (P1-05.1)

- อาการ (owner เจอบน browser จริง): กด Space/แตะมอบ ท่าออกแต่ "ไม่มีเลขดาเมจ" บ่อยมาก (โดยเฉพาะมอนที่วิ่งไล่)
- สาเหตุ (วัดจริงด้วย proof script — hit rate ~23–52%, empty ~48–77%, **reject 0**): client เล็ง/หัน (`faceToward`+aim) ตาม **ภาพมอนที่ interp buffer ย้อนหลัง ~120ms** แต่ server ตัดสิน arc จากตำแหน่งมอน **ปัจจุบัน**. ที่ระยะประชิด (dist ~1.2) การขยับเล็กน้อยของมอน = มุมสวิงมหาศาล → มุมจริงระหว่าง facing กับ (มอนปัจจุบัน−caster) มี **median ~161°, p90 ~170°** (แทบตรงข้าม, มอนวิ่งเข้าหา/สวนตัวผู้เล่น). empty ทั้งหมด = **arc miss ในระยะ** (rawDist ≤ radius แต่หลุด cone 60°) — ไม่ใช่ out_of_range (radius กว้างพอ). MSG_CAST_REJECTED เงียบ → ดูเหมือน "ตีเฉย ๆ"
- วิธีเลี่ยง (fix ใช้): `CombatBalanceConfig.hitTolerance` (Design Knob, PENDING OWNER) ส่งเข้า `findHits`/`resolveSkillHits` (server เท่านั้น — client offline dummy = ZERO_HIT_TOLERANCE = shape จริงตามที่เห็น): (1) **`pointBlankRadiusTiles`** (1.4) — เป้าในระยะ radius จริง **และ** ใกล้กว่านี้ = โดนโดยไม่เช็ค arc (มอนติดตัว=ฟันโดน, ฟีล melee); (2) `rangePaddingTiles` (0.35) บวก radius เผื่อมอนขยับออกระหว่าง lag; (3) `arcPaddingDegrees` (20) เผื่อมุมริงถัดจาก point-blank. **หลักการกันตีหลัง/ทะลุ:** point-blank เล็ก (~ระยะ melee) → เป้าไกลกว่านั้นยังต้องอยู่ใน arc (มอน 3 tile หลัง cone ไม่โดน — มีเทสต์ guardrail คุม); padding ไม่ขยาย radius เกินจริง (เกิน radius+padding ยังพลาด). **ห้ามแก้สูตร damage/arc เป็น hardcode — ทุกค่าใน config**. after-fix hit rate ~98%
- debug: `getNetDebugInfo().castRejectCount` (net-client นับ MSG_CAST_REJECTED) โชว์ใน DebugOverlay (F3) บรรทัด "cast rejects" — >0 = ตีแล้ว server ปฏิเสธ (แยกจาก empty-hit ที่ไม่ reject)

## proof/temp script วางที่ repo root + import server/** → `next build` type-check พัง (decorator)

- อาการ: `next build` (และ raw `tsc -p tsconfig.json`) ล้ม `TS1240 Unable to resolve signature of property decorator` ที่ `server/schema/MapRoomState.ts` (`@type` legacy decorator) ทั้งที่ไม่ได้แตะไฟล์ server — build "Compiled successfully" แต่ตกตอน "Running TypeScript"
- สาเหตุ: root `tsconfig.json` `include: ["**/*.ts"]` จับไฟล์ temp ที่ root (เช่น `proof-hitbox.ts`); `exclude:["server"]` กันได้เฉพาะ root-file **แต่ไม่กันไฟล์ที่ถูก import** — temp script `import "./server/rooms/MapRoom"` ดึง `server/**` (legacy-decorator schema) เข้า program ของ root tsconfig (ซึ่งไม่มี experimentalDecorators) → TS1240. (ตรวจด้วย `tsc --explainFiles | grep -A2 MapRoomState`)
- วิธีเลี่ยง: proof/integration script ที่ import server/** ต้อง **ลบทิ้งก่อนรัน build/tsc gate เสมอ** (temp เท่านั้น ไม่ commit อยู่แล้ว) — วางที่ root ได้ตอนรัน (tsx-resolve-trap #41) แต่ห้ามค้างตอน typecheck. ยืนยัน `git status` สะอาดจาก temp ก่อนปิดงาน

<!-- เพิ่มกับดักใหม่ด้านล่างเมื่อเจอจริง -->
