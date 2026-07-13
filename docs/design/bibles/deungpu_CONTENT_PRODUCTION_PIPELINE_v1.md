# ดึ๋งปุ๊ — Content Production Pipeline

> ไฟล์: `deungpu_CONTENT_PRODUCTION_PIPELINE_v1.md`  
> สถานะ: **v1.0 — Owner-delegated production baseline**  
> โปรเจกต์: **ดึ๋งปุ๊ — True 2D Isometric Web MMORPG**  
> Canonical references: `deungpu_project_checkpoint_v15_p0_scope_lock_ready.md`, `deungpu_technical_architecture_v1_5_p0_scope_lock.md`, `deungpu_ENGINE_FOUNDATION_DECISIONS_v1.md`, `deungpu_MAP_LAYOUT_BIBLE_v1.md`, `deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md`  
> วัตถุประสงค์: กำหนดขั้นตอนผลิต Map, Monster, Character, Equipment, NPC, Quest, VFX, Audio จาก idea จนถึง release พร้อม gate และ Definition of Done

---

## 0. Pipeline Principle

Content ทำคู่ขนานกับ Tech แต่ต้องเข้าระบบผ่าน gate เดียวกัน

```txt
Brief → Design Spec → Blockout/Placeholder → In-engine Review → Production Asset → Integration → QA → Release Candidate → Live
```

ห้ามข้ามจาก idea ไป final art โดยไม่มี scale/blockout test

---

# 1. Source Hierarchy

1. Project checkpoint/current decision docs
2. Owner Decision Book
3. Specialized Bible (Living/Asset/Visual/Combat/Lore)
4. Content entry/spec
5. Implementation issue
6. Runtime config

เมื่อขัดกัน เอกสารลำดับสูงกว่าชนะ

---

# 2. Content IDs

ทุก content มี stable ID:
```txt
map_01_human_outskirts
mob_m1_slime
boss_m1_boar_pot
class_sword
skill_sword_wave
item_mat_slime_gel
npc_city_blacksmith
quest_main_001
lw_event_m1_caravan_ambush
```

Display name เปลี่ยนได้; ID ห้ามเปลี่ยนหลังมี save data

---

# 3. Status Workflow

```txt
IDEA
SPEC_DRAFT
SPEC_APPROVED
PLACEHOLDER_READY
INTEGRATED_ALPHA
ART_PRODUCTION
CONTENT_QA
BALANCE_QA
RELEASE_CANDIDATE
LIVE
DEPRECATED
```

Owner/Design approval required at SPEC_APPROVED

---

# 4. Map Pipeline

## M0 Brief
- purpose/progression range
- mood/lore
- player loop
- zone types
- key landmarks
- required systems

## M1 Logical blockout
- tile bounds
- safe camp
- routes
- collision
- spawn pockets
- event nodes
- NPC/service nodes

## M2 Graybox in engine
- movement/pathfinding
- depth/occlusion
- encounter spacing
- mobile camera/readability

## M3 Art kit
- tiles/transitions
- props/landmarks
- lighting/tint
- weather variants

## M4 Spawn/content integration
- mob families
- elite/boss
- drops/quests
- living world events

## M5 QA
- no stuck tiles
- no spawn in collision
- safe camp safe
- route time target
- FPS budget
- visual hierarchy

Map DoD:
- config versioned
- minimap/warp/respawn defined
- 30-minute playtest no blocker
- art + collision match
- spawn density telemetry available

---

# 5. Monster Pipeline

1. role brief: farming/ranged/tanky/control/boss
2. silhouette + scale
3. stat/behavior sheet
4. placeholder animation
5. AI integration
6. VFX/SFX/death
7. drop table
8. pack/pocket test
9. balance QA
10. final art replace

Monster DoD:
- attack readable before damage
- leash/aggro tested
- no loot exploit
- 5-dir/mirror or approved exception
- spawn cap/performance passed

---

# 6. Player Class Pipeline

Order: Sword → Archer → Spear → Mage → Occult

For each class:
- fantasy/role
- silhouette/weapon
- stat baseline
- 4-skill launch kit target
- input/targeting coverage
- bot usage rules
- animation/VFX/SFX
- tutorial copy
- PvE/boss/farm test
- accessibility/low quality test

Class gate:
- no class ships if one skill requires custom hardcoded runtime outside canonical schema without owner decision

---

# 7. Equipment Pipeline

- item role/tier/slot
- icon
- world/equipped visual strategy
- stats/affixes
- source/drop/craft
- tradeability
- enhancement behavior
- economy projection
- QA concurrent ownership

Visual production uses major tier silhouette variants; minor items can reuse base with palette/material changes

---

# 8. NPC Pipeline

- narrative/service purpose
- routine category
- location/route
- dialogue states
- interaction fallback
- portrait need
- schedule/weather overrides
- localization-ready text IDs

Quest-critical NPC must have anti-block fallback

---

# 9. Quest Pipeline

```txt
Intent → Flowchart → State/conditions → Rewards → Dialogue → Placement → Server flags → QA matrix
```

Quest QA matrix:
- accept/decline
- disconnect each step
- inventory full
- party/no party
- repeat/duplicate request
- NPC unavailable/weather event
- abandon/reaccept

Secret condition remains server-only

---

# 10. Living World Content Pipeline

- event template from Living World Bible
- eligible maps/nodes
- priority/conflicts
- actor/route package
- reward caps
- offscreen policy
- failure policy
- telemetry
- admin toggle

No living event can ship without cancel/rollback path

---

# 11. VFX & Audio Pipeline

VFX:
- semantic color/shape
- telegraph vs juice classification
- quality tiers
- pool/performance budget
- contact timing

Audio:
- cue ID
- category/priority
- ducking rule
- loop/one-shot
- distance falloff
- mobile size budget

Both integrate from event/cue IDs, not hardcoded asset path in gameplay logic

---

# 12. Placeholder-to-Final Replacement

- placeholder ID and manifest are production-stable
- final art replaces source/atlas only
- any pivot/frame change requires integration review
- compare before/after in identical test scene
- no logic PR mixed with large art replacement unless required

---

# 13. Review Cadence

Weekly content review:
- Monday: spec/priority
- Midweek: in-engine blockout
- Friday: acceptance + next risks

Review artifacts:
- one-page brief
- config diff
- screenshots/video
- performance numbers
- open decisions

---

# 14. Definition of Ready for Tech

- stable IDs
- purpose and player-facing behavior
- state/edge cases
- config fields and defaults
- art/audio cue list
- authority boundary
- acceptance criteria
- explicit non-goals

# 15. Definition of Done for Release

- functional QA
- balance QA
- visual/audio QA
- mobile/performance QA
- persistence/reconnect QA
- telemetry present
- localization text present
- admin rollback/disable available where relevant
- wiki/player guide entry ready

---

# 16. Content Waves

C0: style/scale/palette + sword + Test Field
C1: city starter + Map 1 full vertical slice
C2: Archer/Spear + Map 2–4 + first boss
C3: Mage/Occult + Map 5–7 + bot/report content
C4: Map 8–10 + market/economy content
C5: Arc 1 completion + HoF/weekly events
C6: seasonal/live content + Arc 2 preparation

Content waves run parallel to tech P-phases; they are not the same roadmap
