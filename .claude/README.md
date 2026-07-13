# .claude/ — agent personas index

Routing = grade ตาม decision-making ที่เหลือ ไม่ใช่ตาม domain (ดู CLAUDE.md)

## Generic workers (จัดตาม tier)

| Persona | Model | ใช้เมื่อ | Reading rule |
|---|---|---|---|
| `deep-worker` | opus | ออกแบบ / debug ไม่รู้สาเหตุ / trade-off นอกโซน specialist | AI.md + current-state + pack (Traps section) + spec § |
| `fast-worker` | sonnet | brief ระบุไฟล์+pattern แล้ว เหลือลงมือ | AI.md + current-state + pack (Traps section) |
| `tiny-worker` | haiku | ไฟล์เดียว ระบุเป๊ะ (copy/label/knob) | ไม่อ่าน docs — brief ครบในตัว |

## Specialists (ผูกโซนไฟล์)

| Persona | Model | โซน | หมายเหตุ |
|---|---|---|---|
| `engine-specialist` | opus | `src/engine/**` | never-downgrade: iso coordinate/depth-sort correctness |
| `game-specialist` | sonnet | `src/game/**` | combat formula/RNG correctness → override เป็น opus |
| `ui-specialist` | sonnet | `src/ui/**`, `src/app/**` | อ่าน AGENTS.md ก่อน (Next.js 16 traps) |
| `qa-specialist` | sonnet | `tests/**`, `*.test.ts` | expected values มาจาก spec ไม่ใช่ implementation |
| `docs-curator` | sonnet | `docs/**` (ยกเว้น design/tech) | ห้ามแก้ spec — spec แก้ได้เฉพาะ owner |
| `game-designer` | opus | `docs/design/**` + งานร่าง design ทุกชนิด | ทุก output = PROPOSAL + คำถามให้เคาะ — ไม่ตัดสินแทน owner; มี skill คู่กัน `/game-design` สำหรับคุยในห้องหลัก |

## Deferred (อย่าเพิ่งสร้าง — รอโซนไฟล์จริง)

- `realtime-specialist` — Colyseus rooms/netcode → สร้างตอนเริ่ม P1 (tech §6, §16.2)
- `worker-specialist` — BullMQ bot sim/report/rollup → สร้างตอนเริ่ม P3 (tech §9)
- `data-specialist` — Prisma/MySQL schema, ledger, transactions → สร้างตอนเริ่ม P2 (tech §8) · never-downgrade
- `audio-specialist` — Howler/Tone → สร้างตอนเริ่มงานเสียง (tech §22)

## กติกา

- Model override ชนะการสร้าง persona ใหม่ — อย่าสร้าง persona ซ้ำเพราะอยากได้ tier อื่น
- Never-downgrade zones: iso coordinate/depth-sort correctness, combat calculation, DB schema, currency ledger → opus เสมอ
- ทุก persona อยู่ใต้กฎ spec-first ใน AI.md — เกิน spec = หยุดรายงาน ไม่เดา
