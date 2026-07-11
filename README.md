# ดึ๋งปุ๊ (deung-pu-game)

> **2.5D Web MMORPG / Stylized Asian Fantasy / Bot-assisted Open World Farming MMORPG**
> ผู้เล่นเป็นนักผจญภัยในเมืองมนุษย์ที่ถูกลอบภัย มีตลาด มีดันเจี้ยน มีระบบฟาร์มและบอทช่วยเล่น — ตะลุยแผนที่สู่ต้นตอของปรากฏการณ์ "ดึ๋งปุ๊"

## Source of truth

**เชื่อ spec เป็นหลัก — ห้ามเดา ห้ามคิดเอง** ถ้าต้องทำอะไรนอกเหนือ spec ต้องอัปเดต spec ก่อนทุกครั้ง

| เอกสาร | บทบาท |
|---|---|
| [docs/design/deungpu_project_checkpoint_v14_runtime_bot_channel_schema_ownership_ready.md](docs/design/deungpu_project_checkpoint_v14_runtime_bot_channel_schema_ownership_ready.md) | **Canonical game spec (v14)** — game semantics / balance / §48 Design Knobs / §50.1 Skill Schema |
| [docs/tech/deungpu_technical_architecture_v1.md](docs/tech/deungpu_technical_architecture_v1.md) | **Tech architecture (v1.4)** — stack, locked decisions, MVP plan P0–P6 |
| [docs/README.md](docs/README.md) | สารบัญ docs ทั้งหมด + ลำดับการอ่าน |

AI agents: เริ่มที่ [AI.md](AI.md) เสมอ

## Stack (locked — tech architecture §2, §14)

Next.js 15+ (App Router) · React 19 · TypeScript · PixiJS 8 (game renderer) · Zustand · Colyseus (Render SG) · BullMQ · MySQL 8 (Hostinger) + Prisma · Redis · Auth.js · Howler.js + Tone.js · Vitest + Playwright

Package manager: **npm**

## Commands

| Command | ทำอะไร |
|---|---|
| `npm run dev` | dev server (localhost:3000) |
| `npm run build` | production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest (รวม docs path-guard test) |

## Current phase

**P0 — Combat Feel** (local, ไม่มี server): iso foundation + PixiJS combat scene
ดูสถานะล่าสุดที่ [docs/current-state.md](docs/current-state.md)
