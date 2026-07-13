# ดึ๋งปุ๊ — P0_SCOPE_LOCK.md v1

> สถานะ: **P0 Locked / Ready for Tech Execution**  
> Scope: **Engine Foundation Vertical Slice**  
> P0 มีไว้พิสูจน์แกน engine ไม่ใช่ทำเกมเต็ม

---

# 1. P0 Mission

P0 ต้องตอบคำถามนี้ให้ได้:

```txt
เรา render โลก True 2D Isometric Pixel Art ได้ไหม?
ผู้เล่นเดินใน map prototype ได้ไหม?
depth sorting ถูกไหม?
sprite 5-dir + mirror ทำงานไหม?
server room รับผู้เล่นหลายคนได้ไหม?
map/channel foundation พร้อมต่อ P1 ไหม?
```

P0 ที่เคาะแล้วคือ:

> **Engine Foundation Vertical Slice**

ไม่ใช่:
- alpha gameplay
- production map
- full MMORPG loop
- economy/bot/save/market/inventory

---

# 2. Foundation ที่ P0 ต้องยึด

- Client/runtime: **Next.js + PixiJS 8**
- Camera: **True 2D Isometric Pixel Art**
- Grid: **diamond grid**
- Camera behavior: **fixed camera / no rotation**
- Sprite: **frame-by-frame**
- Direction baseline: **5 directions drawn + mirror**
- Map model: **separated rooms/channels**
- P0 map: **P0 Test Field — ขอบเมืองมนุษย์ Prototype**
- Save/persistence: **ไม่อยู่ใน P0**
- Offline bot: **ไม่อยู่ใน P0**
- Player wiki: **ไม่ใช่ source สำหรับ implementation**

---

# 3. P0 Prototype Map

ใช้ map prototype ชื่อ:

> **P0 Test Field — ขอบเมืองมนุษย์ Prototype**

อิง Map 1: ขอบเมืองมนุษย์

ต้องมี:
- diamond tile grid
- safe spawn point
- เดินได้ / เดินไม่ได้แบบง่าย
- props สำหรับทดสอบ depth sorting
- farming pocket จำลอง 2–3 จุด
- dummy mob 1–2 type

ไม่ต้องทำ:
- Map 1 production จริง
- boss จริง
- quest จริง
- loot/economy จริง

---

# 4. P0 Deliverables

## 4.1 Runtime Foundation
ต้องมี:
- Next.js app
- PixiJS 8 canvas
- game scene lifecycle
- resize handling
- basic asset loader
- shared config/types
- dev script รัน client/server ได้

Done:
```txt
เปิด browser แล้วเห็น PixiJS scene
resize แล้ว canvas ไม่พัง
refresh แล้วไม่ memory leak ชัดเจน
```

## 4.2 Isometric Rendering Foundation
ต้องมี:
- iso projection utils
- logical tile coordinate → screen coordinate
- diamond grid render
- fixed camera
- camera follow player
- depth sorting by foot position / isoY
- zLayer override สำหรับ prop/effect/debug

Done:
```txt
player เดินหลัง/หน้า prop แล้ว sorting ถูก
object ด้านล่างจอทับ object ด้านบนจอถูกต้อง
debug เห็น tile coordinate
```

## 4.3 Map Config Loader
ต้องมี config-driven map:

```ts
type MapConfig = {
  mapId: string
  name: string
  tileSize: { width: number; height: number }
  bounds: { width: number; height: number }
  spawnPoint: { x: number; y: number }
  collision: CollisionLayer
  props: PropSpawn[]
  mobPockets: MobPocket[]
}
```

Done:
```txt
เปลี่ยน spawn point / prop / collision จาก config แล้ว scene เปลี่ยนตาม
```

## 4.4 Player Movement Prototype
ต้องมี:
- local player movement
- keyboard movement หรือ click-to-move แบบง่าย
- direction resolver
- render ด้วย 5-dir + mirror
- simple tile/block collision
- movement speed config
- debug position display

Decision:
> P0 ใช้ movement แบบง่ายเพื่อพิสูจน์ renderer ก่อน  
> production pathfinding/click-to-move polish ไป P1

## 4.5 Sprite Animation Foundation
ต้องมี:
- placeholder spritesheet
- animation manifest
- idle
- walk
- optional attack placeholder
- direction mapping:
  - drawn: S, SW, W, NW, N
  - mirrored: SE, E, NE
- frame timing config
- mirror flag

Done:
```txt
เดินลง/ซ้าย/ขึ้นแล้ว direction ถูก
เดินขวาแล้วใช้ mirror
idle/walk สลับได้
```

## 4.6 Multiplayer Room Skeleton
ต้องมี:
- realtime room skeleton
- join room
- leave room
- player spawn
- player position sync
- other players visible
- minimal room state
- channelId placeholder

P0 ยังไม่ต้องทำ:
- reconnect 30s grace แบบเต็ม
- party sync
- manual channel select
- auth เต็ม
- persistence

Done:
```txt
เปิด 2 browser แล้วเห็นผู้เล่น 2 คนใน map เดียวกัน
ขยับคนหนึ่ง อีกหน้าจอเห็นตำแหน่งเปลี่ยน
ออกจากห้องแล้ว entity หาย
```

## 4.7 Channel Stub
P0 ต้องมีแค่ foundation:

```txt
mapId
roomId
channelId
```

ยังไม่ต้องมี:
- UI เลือก channel
- auto-assign production
- party sync production
- channel capacity เต็ม

Done:
```txt
room state มี channelId
client แสดง debug ได้ เช่น CH.1
architecture ไม่ผูก map เดียวกับ room เดียวถาวร
```

## 4.8 Dummy Mob Pocket Spawn
ต้องมี:
- mob pocket config 2–3 จุด
- dummy mob spawn ใน pocket
- active cap แบบง่าย
- idle/walk placeholder
- no loot/economy

Done:
```txt
มอนเกิดใน pocket ที่กำหนด
ไม่เกิดสุ่มทั่ว map แบบไร้ขอบเขต
เห็นภาพ density คร่าว ๆ
```

## 4.9 Combat Stub
ทำแค่ stub:
- กดปุ่ม skill แล้วเล่น animation/effect placeholder
- damage number dummy
- hitbox debug
- mob ลด HP แบบง่าย

ไม่ทำ:
- skill balance จริง
- full damage formula
- item drop
- EXP/gold
- boss mechanic

## 4.10 Debug Overlay
ต้องมี:
- FPS
- player tile/world coordinate
- mapId
- roomId
- channelId
- entity count
- pointer tile coordinate
- depth sort debug toggle

---

# 5. P0 Non-goals

ห้ามลากเข้า P0:
- account/login เต็มระบบ
- save/persistence
- inventory/equipment
- item database จริงในเกม
- market/trade/auction
- bot จริง/offline Pro bot
- Auto Pilot/Report
- enhancement/แกร่ง
- guild/party เต็มระบบ
- PvP/risk zone จริง
- Hall of Fame
- world condition จริง
- Map 1–10 production ทั้งหมด
- boss mechanic จริง
- mobile polish เต็ม
- admin/backoffice
- monetization
- anti-cheat เต็มระบบ
- final art production

กฎ:
> ถ้า feature ไม่ช่วยพิสูจน์ renderer / movement prototype / room foundation ให้เลื่อนไป P1+

---

# 6. P0 Done Definition

P0 ถือว่าเสร็จเมื่อ:

```txt
1. เปิดเกมบน browser ได้
2. PixiJS scene render true isometric diamond grid ได้
3. player เดินใน prototype map ได้
4. depth sorting ผ่าน prop/object test
5. sprite 5-dir + mirror ทำงาน
6. map ถูกโหลดจาก config
7. 2 browser join room เดียวกันแล้วเห็นกัน
8. channelId/roomId/mapId มีใน state/debug
9. dummy mobs spawn ใน pocket
10. combat stub เล่น effect/damage dummy ได้
11. debug overlay ใช้งานได้
12. ไม่มีระบบใหญ่เกิน scope ถูกลากเข้ามา
```

---

# 7. P0 Issue Breakdown

```txt
P0-01 Project Runtime Setup
P0-02 Isometric Coordinate System
P0-03 P0 Test Map Config
P0-04 Renderer Scene Graph & Depth Sorting
P0-05 Local Player Movement Prototype
P0-06 Sprite Animation Prototype
P0-07 Realtime Room Skeleton
P0-08 Channel Stub
P0-09 Dummy Mob Pocket Spawn
P0-10 Combat Stub
P0-11 Debug Overlay
P0-12 P0 Handoff Check
```

---

# 8. P1 Starts After P0

P1 ค่อยทำ:
- production map/movement
- real map transition
- safe camp / warp
- reconnect 30s grace
- auto channel assignment
- party channel sync
- pathfinding/click-to-move polish
- Map 1 production version
- actual spawn/respawn loop
- real skill schema implementation
- first real gameplay loop

---

# 9. P2 Starts After P1

P2 ค่อยทำ:
- account/auth
- save/persistence
- inventory
- item/gold save
- offline bot worker simulation
- report output
- market foundation
- progression save

---

# 10. P0 Claude Code Execution Prompt

```txt
You are Claude Code working on Deungpu P0.

Do not invent new game design.
Do not implement systems outside P0.

Read docs first:
- docs/design/PROJECT_CHECKPOINT_CURRENT.md
- docs/design/P0_SCOPE_LOCK.md
- docs/design/ENGINE_FOUNDATION_DECISIONS.md
- docs/design/MAP_SCALE_AND_SPAWN_DENSITY_SPEC.md

P0 goal:
Build the browser engine foundation vertical slice:
PixiJS 8 + Next.js, true 2D isometric diamond grid, fixed camera, map config loader, local movement prototype, 5-dir + mirror sprite animation, realtime room skeleton, channel stub, dummy mob pockets, combat stub, debug overlay.

Rules:
- Keep values configurable.
- Do not hardcode final balance.
- Do not build inventory, economy, bot, market, account, save, guild, PvP, or production Map 1–10.
- If a decision affects design, ask first.
- Keep changes scoped to one issue at a time.
- Summarize changed files and why.
```

---

# 11. Final P0 Lock

P0 ที่เคาะแล้วคือ:

> **Engine Foundation Vertical Slice**

ทีม tech สามารถเริ่มจาก P0-01 ถึง P0-12 ได้ทันที โดยไม่ต้องรอ P1/P2 decision เพิ่ม
