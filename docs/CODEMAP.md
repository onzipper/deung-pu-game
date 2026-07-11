# CODEMAP — file → responsibility

> structural เท่านั้น (path + หน้าที่ 1 บรรทัด) · test-enforced: path ที่อ้างต้องมีจริง (`npm test`)
> แก้/ย้าย/ลบ/เพิ่มไฟล์ ⇒ อัปเดตบรรทัดของมันใน commit เดียวกัน

## Next.js shell

- `src/app/layout.tsx` — root layout (font + globals)
- `src/app/page.tsx` — landing page (ยัง default create-next-app)
- `src/app/globals.css` — Tailwind v4 entry + theme vars
- `src/app/favicon.ico` — favicon

## Game engine (P0 — ยังไม่สร้าง)

- `src/engine/` — (planned) iso foundation: projection, depth-sort, direction resolver, game loop, pooling — ดู tech §17
- `src/game/` — (planned) combat/entity/spawn บน engine
- `src/ui/` — (planned) React overlay: HUD, menus

## Config

- `package.json` — scripts + dependencies (npm)
- `next.config.ts` — Next.js config
- `tsconfig.json` — TypeScript config (alias `@/*` → `src/*`)
- `eslint.config.mjs` — ESLint flat config
- `postcss.config.mjs` — PostCSS (Tailwind v4)
- `vitest.config.ts` — Vitest config

## Tests

- `tests/docs-guard.test.ts` — path-guard: ไฟล์ที่อ้างใน CODEMAP/feature-map/context ต้องมีจริง

## Docs

- `AI.md` — universal agent entry
- `CLAUDE.md` — orchestrator entry
- `AGENTS.md` — framework traps (Next.js 16)
- `docs/README.md` — สารบัญ docs
- `docs/current-state.md` — live state
- `docs/decision-index.md` — locked decisions
- `docs/known-traps.md` — bug classes
- `docs/feature-map.md` — feature → spec/source/tests
- `docs/token-budget.md` — read budget
- `docs/context/engine.md` — engine context pack
- `docs/context/ui.md` — ui context pack
- `docs/design/` — game spec (v14 canonical + map bibles)
- `docs/design/art-reference/` — ภาพ ref จาก owner (visual north star) + index README
- `docs/tech/` — tech spec (architecture v1.4 + decision locks)
