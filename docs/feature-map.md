# Feature map — feature → spec § / source / tests

> อ่านเฉพาะแถวของงานตัวเอง · spec path ย่อ: **GS** = game spec v14 (`docs/design/deungpu_project_checkpoint_v14_runtime_bot_channel_schema_ownership_ready.md`), **TA** = tech architecture (`docs/tech/deungpu_technical_architecture_v1.md`)

## P0 — Combat Feel (current phase)

| Feature | Spec | Source | Tests |
|---|---|---|---|
| Iso foundation (projection/depth-sort/collision grid) | TA §17.1–17.3 · GS §57.1 | `src/engine/` (planned) | (planned) |
| Direction resolver 5-dir + mirror | TA §17.4 · GS §57.2 | `src/engine/` (planned) | (planned) |
| Combat juice (damage number, hit stop, shake, loot) | GS §17 ทั้งหมด · TA §11 (budget) | `src/game/` (planned) | (planned) |
| Skill data model (config-driven) | GS §50.1 (canonical fields) · TA §16.1 | (planned) | (planned) |
| Mob pack/spawn (local P0) | GS §17.2 · TA §18 · density spec | `src/game/` (planned) | (planned) |
| Performance guardrails (quality tiers, pooling) | GS §17.10 · TA §11 | `src/engine/` (planned) | (planned) |

## P1+ (ยังไม่เริ่ม — ดู TA §12 สำหรับ phase plan)

| Feature | Spec |
|---|---|
| World sync / Colyseus rooms | TA §6 · GS §57.3, §59.1, §59.3 |
| Persistence / inventory / enhancement | TA §7, §8 · GS §12 |
| Bot & report | TA §9 · GS §4, §59.2 |
| Market | TA §5, §7 · GS §5, §11 |
| Audio | TA §22 · GS §22–§42 |

## Infra

| Feature | Spec | Source | Tests |
|---|---|---|---|
| Docs system (AI OS) | ClickUp: AI Operating System — Starter Kit | `docs/`, `AI.md`, `CLAUDE.md` | `tests/docs-guard.test.ts` |
