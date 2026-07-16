# ดึ๋งปุ๊ (deung-pu-game)

> **2.5D Web MMORPG / Stylized Asian Fantasy / Bot-assisted Open World Farming MMORPG**
> ผู้เล่นเป็นนักผจญภัยในเมืองมนุษย์ที่ถูกลอบภัย มีตลาด มีดันเจี้ยน มีระบบฟาร์มและบอทช่วยเล่น — ตะลุยแผนที่สู่ต้นตอของปรากฏการณ์ "ดึ๋งปุ๊"

## Source of truth

**เชื่อ spec เป็นหลัก — ห้ามเดา ห้ามคิดเอง** ถ้าต้องทำอะไรนอกเหนือ spec ต้องอัปเดต spec ก่อนทุกครั้ง

| เอกสาร | บทบาท |
|---|---|
| [docs/design/deungpu_project_checkpoint_v15_p0_scope_lock_ready.md](docs/design/deungpu_project_checkpoint_v15_p0_scope_lock_ready.md) | **Canonical game spec (v15.5)** — game semantics / balance / §4.1 Character Autonomy / §4.2 Continuity / §48 Design Knobs / §50.1 Skill Schema / §61 P0 scope lock |
| [docs/design/deungpu_P0_SCOPE_LOCK_v1.md](docs/design/deungpu_P0_SCOPE_LOCK_v1.md) | **P0 Scope Lock** — Engine Foundation Vertical Slice, P0-01→12, done definition, non-goals |
| [docs/tech/deungpu_technical_architecture_v1_5_p0_scope_lock.md](docs/tech/deungpu_technical_architecture_v1_5_p0_scope_lock.md) | **Tech architecture (v1.5.3)** — stack, locked decisions, Character Autonomy runtime boundary, MVP plan P0–P6, P0 scope lock §19 |
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
