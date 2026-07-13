# ดึ๋งปุ๊ — Production Bible Index

> ไฟล์: `deungpu_PRODUCTION_BIBLE_INDEX_v1.md`  
> สถานะ: **v1.0 — Owner-delegated production baseline**  
> โปรเจกต์: **ดึ๋งปุ๊ — True 2D Isometric Web MMORPG**  
> Canonical references: `deungpu_project_checkpoint_v15_p0_scope_lock_ready.md`, `deungpu_technical_architecture_v1_5_p0_scope_lock.md`, `deungpu_ENGINE_FOUNDATION_DECISIONS_v1.md`, `deungpu_MAP_LAYOUT_BIBLE_v1.md`, `deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md`  
> วัตถุประสงค์: เป็นสารบัญและลำดับ source of truth ของชุดเอกสาร Production Bible

---

# 1. Production Bible Set

1. `deungpu_OWNER_DECISIONS_v1.md` — คำตอบ Owner Queue 1.1–5.3
2. `deungpu_LIVING_WORLD_BIBLE_v1.md` — เวลา อากาศ NPC event merchant caravan wildlife logic
3. `deungpu_ASSET_PRODUCTION_BIBLE_v1.md` — scale/pivot/palette/SVG/pixel art/animation/export
4. `deungpu_VISUAL_LANGUAGE_BIBLE_v1.md` — mood สี map UI VFX rarity identity
5. `deungpu_CONTENT_PRODUCTION_PIPELINE_v1.md` — workflow/gates/DoD ของ content
6. `deungpu_GAME_PRODUCTION_ROADMAP_v1.md` — Tech P0–P6 + Content C0–C6
7. `deungpu_GAME_DESIGN_PRINCIPLES_v1.md` — DNA และ decision tests
8. `deungpu_COMBAT_BIBLE_v1.md` — combat feel/authority/targeting/boss break/QA
9. `deungpu_LORE_BIBLE_v1.md` — world/Arc 1/canon/naming/secret/cosmic guardrails

# 2. Source of Truth Order

```txt
Owner Decisions / Current Checkpoint
→ Specialized Bibles
→ Technical Architecture
→ Feature Spec
→ Issue
→ Code/Config
```

Technical Architecture ชนะใน “วิธี implement” แต่ Specialized Bible ชนะใน “พฤติกรรม/ความหมายที่ผู้เล่นได้รับ”

# 3. Update Rule

- เปลี่ยน decision: สร้าง decision record แล้ว update Owner Decision/Checkpoint
- เปลี่ยน semantics: update Bible ก่อน issue/code
- เปลี่ยน implementation อย่างเดียว: update Tech Spec
- balance: versioned config + telemetry + changelog
- ห้ามแก้เอกสารเก่าเงียบ ๆ โดยไม่มี version/changelog

# 4. Recommended Reading by Role

Tech: Owner → Roadmap → Combat/Living → Asset contract → Tech Architecture
Art: Visual → Asset → Lore → Content Pipeline
Game Design: Principles → Owner → Combat/Living/Lore → Roadmap
Producer: Roadmap → Content Pipeline → Owner → Index
QA: Combat/Living/Asset acceptance + phase gates
