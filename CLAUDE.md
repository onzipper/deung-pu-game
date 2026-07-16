# CLAUDE.md — กติกาทั้งหมด ฉบับเดียวจบ

@docs/current-state.md

## Project

**ดึ๋งปุ๊** — 2.5D web MMORPG (2D isometric) · client Next.js 16 + PixiJS 8 · server Colyseus.
Commands: `npm run dev` client · `npm run dev:server` server · `npm test` · `npm run e2e` · `npm run lint`.

## Code — กฎเหล็ก

- Layers: `src/engine/**` (iso+game loop, ห้ามมี React) · `src/game/**` (combat/entities) · `src/ui/**` (React overlay) · `src/app/**` (Next shell) · `server/**` (authority)
- World state อยู่ใน game loop — ห้ามอยู่ใน React state
- ห้ามอ่าน `node_modules/**`, `.next/**` เด็ดขาด · ตามแพทเทิร์นเดิมในโค้ดก่อนคิดใหม่
- Balance values อ่านจาก config เสมอ ห้าม hardcode · ชื่อ field ใน schema ตาม spec เป๊ะ ห้ามเปลี่ยนเอง

## Authority — ตัดสินใจเองทุกเรื่อง ยกเว้น 4 เรื่องนี้ถาม owner ก่อนเสมอ

1. push `develop` / `main` (แตก feature branch แล้ว push ได้เสรี ไม่ต้องถาม)
2. เปลี่ยน tech stack
3. deploy production / DB migration
4. เงินจริง / monetization / premium currency

spec (`docs/design/**`, `docs/tech/**`) = หนังสืออ้างอิง ไม่ใช่ด่านตรวจ — อ่านเฉพาะ § ที่เกี่ยว ไม่ต้องหยุดรอเคาะ

## Token discipline

- Orchestrator ห้ามลงแรงอ่าน/กวาดไฟล์ยาวเอง — โยน agent แล้วเอาข้อสรุปกลับมา · brief ต้อง self-contained (FILES+CONTEXT+SPEC+TESTS — ดู `.claude/README.md`)
- เลือก model: ตัดสินใจเยอะ/ดีบักยาก → opus · ทำตาม brief ชัด → sonnet · จิ๋วไฟล์เดียว → haiku
- Never-downgrade (top tier เท่านั้น): iso coordinate/depth-sort · ผลคำนวณ combat · DB schema · currency ledger

## Docs = ตอนนี้เท่านั้น

- ไม่เก็บ history/worklog — git จำให้อยู่แล้ว · docs ที่มีอยู่ต้องจริงเสมอ ถ้าไม่จริงให้แก้หรือลบ
- แผนที่: `docs/CODEMAP.md` (โค้ดส่วนไหนอยู่ไหน) · `docs/current-state.md` (สถานะปัจจุบัน) · `docs/decision-index.md` (กติกาที่ล็อคแล้ว บรรทัดเดียวต่อข้อ — ห้ามเสนอซ้ำ)
- งานอาร์ต AI: `/sprite-intake` — ซ่อมเชิงกลได้เลยแล้วรายงานว่าซ่อมอะไร ตีกลับเฉพาะที่ต้องวาดใหม่ · contract + template: `scripts/art/templates/`
