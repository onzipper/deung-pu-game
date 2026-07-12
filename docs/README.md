# docs/ — สารบัญ

ลำดับเข้า: `AI.md` (root) → `current-state.md` → `decision-index.md` → context pack ที่ตรงงาน

## Live state + guardrails

| ไฟล์ | บทบาท |
|---|---|
| `current-state.md` | ตอนนี้อยู่ไหน/ติด/ค้าง/ห้ามแตะ — อัปเดตทุกรอบ |
| `decision-index.md` | decision ที่ล็อกแล้ว — ห้าม re-propose |
| `known-traps.md` | คลังบั๊กที่เคยเจอ — อ่านก่อนแตะโค้ด |
| `deploy-checklist.md` | ขั้นตอน deploy จริง — Render (server) + Hostinger (client) + smoke test |
| `history/` | archive (off-budget — อ่านเฉพาะตอนถูกชี้) |

## Routing maps

| ไฟล์ | บทบาท |
|---|---|
| `CODEMAP.md` | file → หน้าที่ (test-enforced) |
| `feature-map.md` | feature → spec §/source/tests |
| `token-budget.md` | เพดานการอ่านก่อนวางแผน |

## Context packs (`context/`)

| ไฟล์ | สำหรับงาน |
|---|---|
| `context/engine.md` | game engine / PixiJS / iso foundation / combat |
| `context/ui.md` | React overlay / HUD / Zustand |

## Spec (source of truth — ห้ามแก้โดยไม่ผ่าน owner)

### Game spec — `design/` (design เป็นเจ้าของ: semantics / balance / knobs / schema)

| ไฟล์ | บทบาท |
|---|---|
| `design/deungpu_project_checkpoint_v15_p0_scope_lock_ready.md` | **Canonical game spec v15.1** (amendment in-place, ดู §0.0 Amendment Log ในไฟล์) — §48 Design Knobs · §50.1 Skill Schema (field naming source of truth) · §57 engine decisions · §59 runtime decisions · §61 P0 scope lock |
| `design/deungpu_P0_SCOPE_LOCK_v1.md` | **P0 Scope Lock** — Engine Foundation Vertical Slice · P0-01→12 issues · done definition · non-goals |
| `design/deungpu_MAP_LAYOUT_BIBLE_v1.md` | Map 1–10 layout: จุดวาง spawn/boss/secret/route |
| `design/deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md` | ขนาด map, density, AoE target, spawn pack/pocket, telemetry |
| `design/art-reference/` | **ภาพ ref จาก owner (visual north star)** — 11 ภาพ + index; งาน UI/ฉาก/effect ต้องเทียบกับชุดนี้ |

### Tech spec — `tech/` (tech เป็นเจ้าของ: implementation / runtime / persistence / performance)

| ไฟล์ | บทบาท |
|---|---|
| `tech/deungpu_technical_architecture_v1_5_p0_scope_lock.md` | **Tech architecture v1.5.1** (amendment in-place, ดู §6.1/§15.7/§17.3 amendment ในไฟล์) — stack, locked decisions §0.1 (L1–L18), MVP plan P0–P6 §12, engine foundation §17, spawn/aggro §18, P0 scope lock §19 |
| `tech/deungpu_ENGINE_FOUNDATION_DECISIONS_v1.md` | Engine foundation lock: iso/diamond grid/5-dir+mirror/map rooms |
| `tech/deungpu_RUNTIME_BOT_CHANNEL_AND_SCHEMA_OWNERSHIP_DECISIONS_v1.md` | Runtime lock: reconnect/offline bot/channel + skill schema ownership |

**Ownership rule (v15 §59.4):** Design owns what the skill is; Tech owns how it runs. Field names ตาม v15 §50.1 เท่านั้น

**Spec ยาวมาก** — อ่านเฉพาะ § ที่ตรงงาน (feature-map ชี้ § ให้)
