# docs/ — สารบัญ

ลำดับเข้า: `AI.md` (root) → `current-state.md` → `decision-index.md` → context pack ที่ตรงงาน

## Live state + guardrails

| ไฟล์ | บทบาท |
|---|---|
| `current-state.md` | ตอนนี้อยู่ไหน/ติด/ค้าง/ห้ามแตะ — อัปเดตทุกรอบ |
| `decision-index.md` | decision ที่ล็อกแล้ว — ห้าม re-propose |
| `context/*.md` | context pack ราย layer — แต่ละอันจบด้วย **Traps** section (บั๊กที่เคยเจอ) · shell/tooling traps อยู่ใน `agent-rules.md` |
| `agent-rules.md` | กติกากลาง brief/subagent (spec-first, never-downgrade zones, DoD, terse internal report) — อ้างใน brief แทน paste ซ้ำ |
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
| `context/engine.md` | game engine / PixiJS / iso foundation / game loop |
| `context/game.md` | combat / skill / mob AI บน engine (`src/game/**`) |
| `context/ui.md` | React overlay / HUD / Zustand / Next.js shell |
| `context/server.md` | Colyseus realtime / Next server-only / DB (`server/**`, `src/server/**`) |

## Spec (source of truth — ห้ามแก้โดยไม่ผ่าน owner)

### Game spec — `design/` (design เป็นเจ้าของ: semantics / balance / knobs / schema)

| ไฟล์ | บทบาท |
|---|---|
| `design/deungpu_project_checkpoint_v15_p0_scope_lock_ready.md` | **Canonical game spec v15.2** (amendment in-place, ดู §0.0/§0.0.1 Amendment Log ในไฟล์) — §48 Design Knobs · §50.1 Skill Schema (field naming source of truth) · §57 engine decisions · §59 runtime decisions · §61 P0 scope lock |
| `design/bibles/` | **Production Bible Set v1 (owner, 2026-07-12)** — 10 เล่ม: Owner Decisions (ปิด decision queue ทุกข้อ — เล่มแรกที่ต้องเปิด), Roadmap P0–P6+C0–C6, Combat, Living World, Lore, Visual Language, Asset Production, Content Pipeline, Design Principles, Index · ลำดับ source of truth ดู `design/bibles/deungpu_PRODUCTION_BIBLE_INDEX_v1.md` §2 — **Bible ชนะเรื่องพฤติกรรม/ความหมาย, tech architecture ชนะวิธี implement** |
| `design/deungpu_ACCOUNT_CHARACTER_STORAGE_FLOW_SPEC_v1.md` | **Account/Character/Storage (locked, 2026-07-12)** — 5 ช่องตัวละคร/บัญชี, กติกาชื่อเต็มชุด, Game Hub, 1 session+takeover, คลังบัญชี 200 ช่อง, Delivery Box 50, item location 7 แบบ · P2 คลื่น 2 = schema+hub/creation, คลื่น 3 = Storage/Delivery UI (S1) |
| `design/deungpu_OWNER_PRODUCTION_DECISIONS_P2B_TO_LAUNCH_v1.md` | **Owner decisions P2B→Launch (locked baseline, 2026-07-12)** — bot tiers+ราคา, market fee/tax, monetization allow/forbid, email verify timing, RBAC, alerts, backup, legal, launch gates, audio/art hybrid, closed-alpha criteria, required docs §19 · จุดค้าง: L1–L7 (ดู decision-index) |
| `design/deungpu_P2_UI_VISUAL_IMPLEMENTATION_SPEC_v1.md` | **UI/Visual Implementation P2 (LOCKED 2026-07-12 — จุด PENDING ทุกจุดถูกเคาะแล้ว)** — design tokens, component library, ทุกจอ P2 + mobile HUD 2 layouts · จุดที่ถูก supersede: §7.1 → เล่ม Storage, radius/touch tokens → เล่ม SVG-first (V1: 6/10/16 + hit area ≥48px) |
| `design/deungpu_P2_MAP_1_ECONOMY_AND_LOOT_SPEC_v1.md` | **Economy & Loot Map 1 (locked baseline, 2026-07-12)** — item master + drop tables + ร้าน starter + EXP curve + แหล่งแกร่ง + config-first ทั้งหมด · ⚠ ค้างเคาะ E1–E3 (ชื่อบอส/elite ไม่ตรง canon, ตาราง % ตีบวก + นิยามแกร่งชนกับ GS §12, stat row นก/หมูป่า) — ดู decision-index |
| `design/deungpu_TECH_TEAM_DECISIONS_SVG_FIRST_NO_FIGMA_v1.md` | **SVG-first + No-Figma blueprint (locked, 2026-07-12)** — art = SVG-first ถาวร (pixel art เลื่อนไม่มีกำหนด), ปิด U1–U4 + L1–L7, SVG contract/naming/performance, global UI standards · คำเคาะ V1–V4 (tokens, hybrid art ฉบับ SVG, rarity mapping, visual style ทาง C + effect matrix) ดู decision-index |
| `design/deungpu_DUNG_DUNG_COMPANION_GUIDE_SYSTEM_SPEC_v1.md` | **ระบบดึ๋งๆ (locked design, 2026-07-12)** — companion + voluntary guidance: "เล่นยังไง"/"ทำอะไรต่อดี", guidance modes, stuck detection, state machine, UI spec ครบไม่ต้องมี Figma · P2 = DG lite (ไม่มีตัว companion), P2B = companion เต็ม |
| `design/deungpu_ACHIEVEMENT_AND_ADVENTURE_JOURNAL_SPEC_v1.md` | **Achievement + สมุดบันทึกนักผจญภัย (locked design, 2026-07-12)** — rule engine 6 แบบ, hidden/meme/Server First, journal 7 แท็บ, event taxonomy, anti-exploit · เริ่ม v1 ที่ P2B (GameEvent log เริ่มเก็บตั้งแต่ P2) |
| `design/deungpu_P0_SCOPE_LOCK_v1.md` | **P0 Scope Lock** — Engine Foundation Vertical Slice · P0-01→12 issues · done definition · non-goals |
| `design/deungpu_MAP_LAYOUT_BIBLE_v1.md` | Map 1–10 layout: จุดวาง spawn/boss/secret/route |
| `design/deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md` | ขนาด map, density, AoE target, spawn pack/pocket, telemetry |
| `design/proposals/deungpu_P1_BALANCE_PROPOSAL_v1.md` | **Balance baseline (APPROVED 2026-07-12)** — k, ตารางนักดาบ, mob Map 1 — ค่าเข้า config เสมอ ห้าม hardcode |
| `design/art-reference/` | **ภาพ ref จาก owner (visual north star)** — 11 ภาพ + index; งาน UI/ฉาก/effect ต้องเทียบกับชุดนี้ |

### Tech spec — `tech/` (tech เป็นเจ้าของ: implementation / runtime / persistence / performance)

| ไฟล์ | บทบาท |
|---|---|
| `tech/deungpu_technical_architecture_v1_5_p0_scope_lock.md` | **Tech architecture v1.5.2** (amendment in-place, ดู §6.1–6.2/§12.1/§15.7/§17.3 amendment ในไฟล์) — stack, locked decisions §0.1 (L1–L18), MVP plan P0–P6+P2B §12, engine foundation §17, spawn/aggro §18, P0 scope lock §19 |
| `tech/deungpu_ENGINE_FOUNDATION_DECISIONS_v1.md` | Engine foundation lock: iso/diamond grid/5-dir+mirror/map rooms |
| `tech/deungpu_RUNTIME_BOT_CHANNEL_AND_SCHEMA_OWNERSHIP_DECISIONS_v1.md` | Runtime lock: reconnect/offline bot/channel + skill schema ownership |
| `tech/deungpu_P2_ISSUE_BREAKDOWN_v1.md` | **P2 breakdown (DRAFT รอ owner review)** — 17 issues 3 คลื่น + done definition + P2B outline + content track C0/C1 |

**Ownership rule (v15 §59.4):** Design owns what the skill is; Tech owns how it runs. Field names ตาม v15 §50.1 เท่านั้น

**Spec ยาวมาก** — อ่านเฉพาะ § ที่ตรงงาน (feature-map ชี้ § ให้)
