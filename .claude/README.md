# .claude/ — agent personas index

Routing = grade ตาม decision-making ที่เหลือ ไม่ใช่ตาม domain (ดู CLAUDE.md)

| Persona | Model | ใช้เมื่อ | Reading rule |
|---|---|---|---|
| `deep-worker` | opus | ออกแบบ / debug ไม่รู้สาเหตุ / trade-off / never-downgrade zones | AI.md + current-state + pack + spec § + known-traps |
| `fast-worker` | sonnet | brief ระบุไฟล์+pattern แล้ว เหลือลงมือ | AI.md + current-state + pack + known-traps |
| `tiny-worker` | haiku | ไฟล์เดียว ระบุเป๊ะ (copy/label/knob) | ไม่อ่าน docs — brief ครบในตัว |

กติกา:
- Model override ชนะการสร้าง persona ใหม่ — อย่าสร้าง persona ซ้ำเพราะอยากได้ tier อื่น
- Specialist (ผูกโซนไฟล์ เช่น engine/ui) **ยังไม่สร้าง** — เพิ่มเมื่อมีโซนไฟล์จริงตอน P0 ลงโค้ดแล้ว (deferred ตาม starter kit)
- Never-downgrade zones: iso coordinate/depth-sort correctness, combat calculation, DB schema, currency ledger → deep-worker เสมอ
