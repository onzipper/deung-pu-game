@AGENTS.md
@AI.md
@docs/current-state.md

# CLAUDE.md — orchestrator entry

## Project

**ดึ๋งปุ๊** — 2.5D Web MMORPG (True 2D Isometric Pixel Art) บน Next.js + PixiJS 8
Source of truth = game spec v15 (`docs/design/`) + tech architecture v1.5 (`docs/tech/`) — **spec-first, ห้ามเดา** (ดู AI.md)

## Commands

Package manager = **npm**

| Command | ทำอะไร |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest + docs path-guard |

## Architecture — the load-bearing rule

- Layer แผน P0: `src/engine/**` (iso foundation + game loop, ห้ามพึ่ง React) · `src/game/**` (combat/entity บน engine) · `src/ui/**` (React overlay) · `src/app/**` (Next.js shell)
- world state อยู่ใน game loop (plain TS/ECS-lite) — **ห้าม**เอาเข้า React state (tech §2)
- อ่าน context pack ของ layer ที่แตะ (`docs/context/`) + `docs/agent-rules.md` (Shell & tooling traps) ก่อนแตะโค้ด

## Orchestration workflow

คุณ = orchestrator: วางแผน, แตกงาน, สังเคราะห์; การลงมือส่ง subagent; เก็บ context ตัวเองให้บาง

Routing = grade ตาม decision-making ที่เหลือ:

| ลักษณะงาน | Tier |
|---|---|
| ออกแบบ / debug ไม่รู้สาเหตุ / trade-off | สูงสุด (opus) — persona: deep-worker |
| brief บอกไฟล์+pattern แล้ว เหลือลงมือ | กลาง (sonnet) — persona: fast-worker |
| ไฟล์เดียว ระบุเป๊ะ (copy/label/knob) | ต่ำสุด (haiku) — persona: tiny-worker |

- Model override ชนะการสร้าง persona ใหม่
- **Never-downgrade zones**: iso coordinate/depth-sort correctness, combat result calculation, DB schema, currency ledger → tier สูงเสมอ
- CODEMAP-first briefs: paste ส่วน CODEMAP/context pack ลง brief แทนให้ agent สำรวจเอง
- One agent = one task; parallel = โซนไฟล์ไม่ทับกัน
- High-stakes = 2 มุมมองอิสระ สังเคราะห์เอง

## Docs discipline

ทุก code change อัปเดต docs ที่กระทบใน change เดียวกัน (CODEMAP test-enforced ผ่าน `npm test`)
current-state อัปเดตทุกรอบ; block เก่า → `docs/history/`
decision ใหม่ที่ owner เคาะ → `docs/decision-index.md` (วันที่ absolute เสมอ)

## Subagents

ดู `.claude/README.md` — เริ่มด้วย 3 generic tiers; specialist ค่อยเพิ่มเมื่อมีโซนไฟล์จริง
