# Context: ui (React overlay / HUD)

สำหรับงานชนิด: HUD, menus, panels, settings, non-game pages
อ่าน pack นี้ + ไฟล์ที่แตะ พอ

## Contract

- `src/ui/**` + `src/app/**` = React/DOM ทับ canvas — HUD, inventory, market, settings
- UI อ่าน/สั่ง game ผ่าน **Zustand bridge เท่านั้น** — ห้ามแตะ engine/world state ตรง ๆ
- game loop push ค่าที่ UI ต้องเห็น (HP, cooldown) เข้า store; UI ส่ง intent กลับ ไม่ mutate world เอง
- Next.js 16 + React 19 + Tailwind v4 — อ่าน `AGENTS.md` + `node_modules/next/dist/docs/` ก่อนเขียน (breaking changes)

## UI direction (locked — GS §45–§47)

- **Ancient Asian Fantasy UI + Modern Readability** — fantasy กลิ่นไทย/หิน/ไม้/โลหะ แต่อ่านง่าย
- Palette กลาง: GS §46.1 · rarity colors: §46.3 · status colors: §46.4
- **ภาพ ref จาก owner**: `docs/design/art-reference/` — ทุกหน้าจอมีภาพเทียบ ห้ามออกแบบหลุดโทนจากชุดนี้
- HUD: compact อ่านง่าย ไม่บัง combat; boss telegraph สำคัญกว่า HUD เสมอ
- Confirmation modal บังคับ: market purchase / enhancement / rare item / ใช้เกรี้ยว (visual weight สูงกว่าปกติ)
- Screen mood รายหน้าจอ: GS §47

## กติกาเฉพาะ / invariants

- responsive 2 โหมด: PC keybind / touch ปุ่มใหญ่ (tech L11)
- UI/system message ไม่ใช้คำขึ้น/ตลกฝืด — meme อยู่ใน content ไม่ใช่ UI (GS §2)
- damage number อยู่ฝั่ง engine (BitmapText ใน canvas) ไม่ใช่ DOM

## Zustand bridge (P2-01 — ติดตั้งจริงแล้ว)

`src/ui/store/game-store.ts` (**vanilla** store — import จาก zustand/vanilla เท่านั้น ห้าม import React ในไฟล์นี้
เด็ดขาด เพราะ `src/engine/runtime/app.ts` import ตรง ๆ เพื่อ publish; ผิดกฎจะดึง React เข้า engine bundle ทางอ้อม)
+ `src/ui/store/use-game-store.ts` ("use client" React hook useStore จาก zustand/react ครอบ store เดิม —
คนละไฟล์โดยเจตนา):

- ทิศทาง: **game loop (engine ticker) → createHudPublisher(intervalMs).publish(nowMs, buildThunk) (throttled,
  default ~250ms ตาม knob pollIntervalMs ของ debugOverlay ใน `src/engine/config.ts`, thunk เรียกเฉพาะตอนถึงคิว) → setState ของ gameStore →
  React useGameStore(selector) subscribe**. UI ห้าม import engine ตรง ๆ เพื่ออ่านค่า — อ่านผ่าน store selector เท่านั้น
- `HudState` = ที่รวม slice ที่ UI ทุกจอต้องเห็น (ตอนนี้มี `debugInfo`; เพิ่ม slice ใหม่ (hp/cooldown/inventory ฯลฯ)
  ที่ interface เดียวกันเมื่อ UI ตัวถัดไปต้องใช้) — ยังคง**snapshot เบา ๆ ที่ throttle แล้ว** ไม่ใช่ world state ดิบ (tech §2)
- คำสั่ง imperative (สั่ง engine ทำอะไรสักอย่าง เช่น `setDepthDebug`) **ไม่ผ่าน store** — เรียกผ่าน `EngineHandle`
  accessor ตรง ๆ เหมือนเดิม (store = ทิศทาง "อ่าน" state จาก engine เท่านั้น ไม่ใช่ command channel)
- ตัวอย่างการใช้จริง: `src/ui/DebugOverlay.tsx` (P0-11 → ย้ายมา P2-01) — `useGameStore(selectDebugInfo)` แทน poll เดิม
- toggle/UI state ล้วน (visible/depth-debug flag) ยังแยกเป็น pure reducer (`src/ui/debug-overlay-logic.ts`,
  **ไม่ใช่** ส่วนของ Zustand bridge — เป็น local UI state ธรรมดา) ให้เทสต์ได้โดยไม่ต้อง render React
- คีย์ลัด debug ใช้ KeyboardEvent code (ไม่ใช่ key) + preventDefault กันชน browser (เช่น F3)
- `src/ui/GameCanvas.tsx` ยังเก็บ EngineHandle ใน useRef (**ไม่ใช่** useState) เหมือนเดิม — accessor
  getHandle ใช้เฉพาะคำสั่ง imperative แล้ว (การอ่านค่าย้ายไป store แล้ว)

## Test

- คำสั่ง: `npm test` (unit) — E2E Playwright จะเพิ่มตอนมี flow จริง
