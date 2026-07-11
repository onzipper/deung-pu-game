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
- HUD: compact อ่านง่าย ไม่บัง combat; boss telegraph สำคัญกว่า HUD เสมอ
- Confirmation modal บังคับ: market purchase / enhancement / rare item / ใช้เกรี้ยว (visual weight สูงกว่าปกติ)
- Screen mood รายหน้าจอ: GS §47

## กติกาเฉพาะ / invariants

- responsive 2 โหมด: PC keybind / touch ปุ่มใหญ่ (tech L11)
- UI/system message ไม่ใช้คำขึ้น/ตลกฝืด — meme อยู่ใน content ไม่ใช่ UI (GS §2)
- damage number อยู่ฝั่ง engine (BitmapText ใน canvas) ไม่ใช่ DOM

## Test

- คำสั่ง: `npm test` (unit) — E2E Playwright จะเพิ่มตอนมี flow จริง
