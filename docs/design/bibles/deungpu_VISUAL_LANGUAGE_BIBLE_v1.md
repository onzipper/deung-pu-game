# ดึ๋งปุ๊ — Visual Language Bible

> ไฟล์: `deungpu_VISUAL_LANGUAGE_BIBLE_v1.md`  
> สถานะ: **v1.0 — Owner-delegated production baseline**  
> โปรเจกต์: **ดึ๋งปุ๊ — True 2D Isometric Web MMORPG**  
> Canonical references: `deungpu_project_checkpoint_v15_p0_scope_lock_ready.md`, `deungpu_technical_architecture_v1_5_p0_scope_lock.md`, `deungpu_ENGINE_FOUNDATION_DECISIONS_v1.md`, `deungpu_MAP_LAYOUT_BIBLE_v1.md`, `deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md`  
> วัตถุประสงค์: นิยามว่าดึ๋งปุ๊ต้องหน้าตาและรู้สึกอย่างไรในโลก ตัวละคร แผนที่ UI VFX ความหายาก และ Living World

---

## 0. Visual Thesis

> **อบอุ่นแบบโลกมนุษย์ที่คุ้นเคย แต่ทุกมุมมีสัญญาณว่าผนึกกำลังหายใจและบางสิ่งอยู่อีกด้านหนึ่ง**

ดึ๋งปุ๊ไม่ใช่ dark fantasy ล้วน ไม่ใช่เกม meme ล้วน และไม่ใช่ anime neon ล้วน

Visual balance:
```txt
60% warm grounded world
25% mysterious resonance
10% playful oddity
5% cosmic dread / rare spectacle
```

---

# 1. Shape Language

- โลกมนุษย์: rounded, handmade, uneven, friendly
- ผนึก/อาคม: geometric circle/line/knot
- รอยแยก: broken diagonal, asymmetric shard
- corruption: inward curl, stretched negative space
- legendary: clear iconic silhouette, not particle spam

---

# 2. Contrast Hierarchy

1. danger/telegraph
2. player and current target
3. interactable/NPC/loot
4. navigation landmark
5. living-world actors
6. decorative environment

ห้าม background มี saturation/contrast สูงกว่าสกิลและเป้าหมายตลอดเวลา

---

# 3. Palette Semantics

ใช้ master palette จาก Asset Bible

- Teal = resonance, seal, trustworthy system magic
- Magenta = rupture, corruption, wrongness
- Gold = legendary, achievement, sacred climax
- Red = immediate danger, invalid action, PvP warning
- Moon blue = memory, spirit, night mystery
- Warm earth = safety, people, ordinary life

Rule: สี semantic ต้องรักษาความหมายข้าม UI/VFX/Map

---

# 4. Lighting

- base light soft, top-left convention
- city/day: warm sunlight + teal seal lamps
- night: readable moon fill, not pitch black
- fog/rain: lower saturation but keep character contrast
- boss arena: lighting supports telegraph, never competes
- no dynamic real-time lighting required in MVP; use authored tint/layer

---

# 5. Camera & Composition

- fixed isometric camera, no rotation
- landmarks align with iso diagonals
- important routes create readable Z/S rhythm across diamond grid
- avoid tall foreground props covering combat corridor continuously
- use occlusion fade for roof/canopy
- safe camp composition opens view and lowers visual density

---

# 6. Map Visual Chapters

## City — นครอรุณผนึก
Mood: ปลอดภัย มีชีวิต เป็นบ้าน แต่มีผนึกใหญ่กว่าคน
- warm plaster/wood/stone
- teal seal lights
- banners/market movement
- landmark: central seal structure/gate

## Map 1 — ขอบเมืองมนุษย์
Mood: ออกผจญภัยครั้งแรก สนุก อ่านง่าย
- green/earth/yellow grass
- clear paths, low clutter
- odd slime accents
- weather gentle

## Map 2 — ถนนชายไร่
Mood: ชีวิตชาวบ้านถูกรบกวน
- crop gold, soil, worn wood
- moving scarecrows, farm props
- wider packs/AoE readability

## Map 3 — ทางป่าเก่า
Mood: คุ้นแต่จำเส้นทางไม่ได้ทั้งหมด
- deep green/brown, moss
- repeated stones, subtle asymmetry
- hidden paths hinted by clean/mossless objects

## Map 4 — ป่าจันทร์เงา
Mood: สวย เงียบ ฝัน และไม่แน่ใจ
- moon blue, pale moss, mist
- soft light pools
- spirit silhouettes

## Map 5 — ศาลร้าง
Mood: ศรัทธาที่ถูกทิ้งและคำเตือน
- faded red, parchment, dark wood
- broken talismans
- teal/magenta conflict

## Map 6 — หุบรากลึก
Mood: โลกใต้ผิวดินกำลังขยับ
- root brown, damp teal, black void
- vertical roots and cramped openings

## Map 7 — เขตผลึกร้าว
Mood: งดงามแต่เสี่ยงและแข่งขัน
- cyan crystal + magenta fracture
- high sparkle budget localized
- risk zone warnings red/teal border

## Map 8 — ประตูเถ้าถ่าน
Mood: สงครามและร่องรอยการเผาไหม้
- ash gray, ember orange, black metal
- wind/ash motion
- silhouettes sharper

## Map 9 — ชายแดนต่างโลก
Mood: กฎภาพเริ่มผิด
- desaturated earth + impossible magenta/blue
- repeated/offset shapes
- no full-screen distortion that harms navigation

## Map 10 — วิหารรอยแยก
Mood: sacred climax + cosmic hint
- deep ink, stone, legendary gold, resonance teal, controlled magenta
- large negative space
- architecture dominates scale

---

# 7. Character Visual Hierarchy

- player has cleanest silhouette and highest local contrast
- class recognition from weapon + stance before costume detail
- equipment tier adds motif/material, not random color noise
- player outline can subtly strengthen over busy terrain
- party members readable but local player remains strongest

---

# 8. Monster Language

- Normal: one clear idea
- Elite: same family + mutation/armor/energy node
- Boss: family origin recognizable but transformed into landmark
- corruption should alter silhouette, not only recolor
- death language matches material: slime splat, ash dissolve, crystal shatter, spirit fade

---

# 9. UI Language

Style: pixel-fantasy interface with modern readability

- panels: warm dark neutral, parchment text surfaces, teal focus accent
- primary action: teal/bright parchment
- destructive/danger: red
- premium: never use gold as generic CTA
- corners slightly rounded/hand-carved, not sci-fi glass
- information density adjustable for PC/mobile

UI priority:
- combat HUD minimal
- inventory/market can be richer
- system truth/status explicit

---

# 10. Rarity Language

| Rarity | Color | Motion | Sound/FX |
|---|---|---|---|
| Common | neutral | none | soft |
| Uncommon | green | subtle pulse optional | light chime |
| Rare | blue | small spark | distinct chime |
| Epic | purple | controlled inner glow | layered chime |
| Legendary | gold | unique beam/motif | signature sting |
| Mythic/Celestial | gold + cosmic accent | authored sequence | rare signature only |

Legendary rule: silhouette/icon uniqueness มาก่อน glow

---

# 11. VFX Readability

- anticipation > impact > decay
- contact point ต้องชัด
- effect ownership: local player strongest, party medium, strangers reduced
- telegraph floor never hidden by damage VFX
- particle direction should reinforce skill shape (cone/line/circle)
- camera shake is not a substitute for animation

---

# 12. Damage Number Language

- normal: compact upward drift
- crit: larger, warmer, short punch
- multi-hit: rhythm/stack control, total mode available
- heal: gentle upward/green-teal
- break: special label + gauge feedback
- miss/block: low salience

No rainbow numbers per damage type in v1

---

# 13. Living World Visuals

- routine NPC motion slower than combat actors
- ambient wildlife uses lower contrast
- weather foreground density capped
- seasonal decor uses existing geometry and semantic palette
- world event cue uses landmark/actor/sound first, popup second

---

# 14. Humor & Meme Timing

- visual joke comes from animation/prop/character behavior, not random sticker spam
- one strong gag per scene beat
- boss climax and emotional lore scenes avoid meme intrusion
- “ดึ๋งปุ๊” playful identity appears in bounce/squash/timing and item names

---

# 15. Visual Accessibility

- color is never sole indicator
- telegraph has shape + edge + motion
- reduced flash setting
- reduced shake
- weather opacity slider
- damage number modes
- text contrast ≥ practical AA-like readability even with pixel font

---

# 16. Visual Review Questions

1. อ่าน player/target/telegraph ได้ใน 1 วินาทีไหม
2. screenshot นี้รู้ไหมว่าเป็นดึ๋งปุ๊ ไม่ใช่ generic fantasy
3. semantic color ถูกใช้ตามความหมายไหม
4. Map นี้ต่างจาก Map ก่อนด้วย shape/lighting ไม่ใช่ recolor อย่างเดียวไหม
5. low quality ยังรักษา gameplay truth ไหม
6. humor เสริมเสน่ห์หรือทำลาย tone

---

# 17. Anti-patterns

- neon ทุกอย่าง
- black outline หนาเท่ากันทุกชิ้น
- rarity = recolor อย่างเดียว
- particle ปิด silhouette
- fog ปิด telegraph
- map ทุกแห่งใช้ต้นไม้/หิน kit เดียวเปลี่ยน tint
- UI fantasy หนักจนอ่านช้า
- cosmic effect โผล่ตั้งแต่ต้นเกมจนปลายเกมไม่มี escalation

---

# 18. Visual Definition of Done

- map screenshot ผ่าน contrast hierarchy
- class silhouette ผ่าน grayscale test
- semantic palette audit ผ่าน
- low/medium/high quality comparison ผ่าน
- mobile 720p readability ผ่าน
- weather + boss telegraph overlap ผ่าน
- final assetตรง pivot/scale Asset Bible
