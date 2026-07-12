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

## P0 bridge pattern (ยังไม่มี Zustand — P0-11 Debug Overlay)

P0 ยังไม่ติดตั้ง Zustand (Zustand bridge จริงมาตอน HUD จริง, P1). Pattern ชั่วคราวที่ใช้ (`src/ui/DebugOverlay.tsx`
+ `src/ui/GameCanvas.tsx`) — งาน UI ถัดไปที่ต้อง poll engine ก่อนมี Zustand ใช้ pattern เดียวกันได้:

- เก็บ `EngineHandle` ใน `useRef` ที่ `GameCanvas` (**ไม่ใช่** `useState`) — กัน re-render ที่ไม่จำเป็นและกัน "world state เข้า React state"
- ส่ง accessor function (`getHandle: () => EngineHandle | null`) ให้ overlay component แทนส่ง handle ตรง ๆ — ทน lifecycle: engine ยัง init ไม่เสร็จ (`null`) หรือถูก destroy แล้ว (effect cleanup เซ็ต ref กลับ `null`)
- overlay `useEffect` + `setInterval` **poll snapshot** ทุก ~200–300ms (config debugOverlay.pollIntervalMs) — เรียก `getHandle()` ใหม่ทุกครั้ง ไม่ cache, ถ้า `null` ข้าม tick นั้นเฉย ๆ (ไม่ throw)
- toggle/UI state ล้วน (visible/depth-debug flag) แยกเป็น pure reducer (`src/ui/debug-overlay-logic.ts`) ให้เทสต์ได้โดยไม่ต้อง render React — component เองไม่มี unit test (ไม่มี jsdom WebGL)
- คีย์ลัด debug ใช้ KeyboardEvent code (ไม่ใช่ key) + preventDefault กันชน browser (เช่น F3)

## Test

- คำสั่ง: `npm test` (unit) — E2E Playwright จะเพิ่มตอนมี flow จริง
