# ดึ๋งปุ๊ — Asset Production Bible

> ไฟล์: `deungpu_ASSET_PRODUCTION_BIBLE_v1.md`  
> สถานะ: **v1.1 — Owner-delegated production baseline (amended 2026-07-12: SVG-first)**  
> โปรเจกต์: **ดึ๋งปุ๊ — True 2D Isometric Web MMORPG**  
> Canonical references: `deungpu_project_checkpoint_v15_p0_scope_lock_ready.md`, `deungpu_technical_architecture_v1_5_p0_scope_lock.md`, `deungpu_ENGINE_FOUNDATION_DECISIONS_v1.md`, `deungpu_MAP_LAYOUT_BIBLE_v1.md`, `deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md`  
> วัตถุประสงค์: กำหนดมาตรฐานวาด SVG placeholder และ pixel-art final สำหรับตัวละคร มอน เมือง แผนที่ ของสวมใส่ VFX และ UI โดยไม่ต้องเดา scale/pivot/frame/file format

## 0.0 Amendment Log — v1.1 (2026-07-12): SVG-first supersede

Owner เคาะเปลี่ยน art direction เป็น **SVG-first ถาวร — pixel art เลื่อนไม่มีกำหนด** (ดู `../deungpu_TECH_TEAM_DECISIONS_SVG_FIRST_NO_FIGMA_v1.md` + decision-index แถว SVG-first/V1–V4, 2026-07-12) — ผลต่อเล่มนี้ (additive; เนื้อเดิมคงไว้เพื่อประวัติ):

**ถูก supersede:**
1. ทุกส่วนที่ตั้งอยู่บนสมมติฐาน "SVG = placeholder รอ pixel art มาแทน" (aseprite/layered PNG/final pixel art conversion) — ไม่เป็น production path อีกต่อไป
2. ข้อบังคับ pixel-grid: integer coordinates, `shape-rendering=crispEdges` เป็น default, rasterize nearest-neighbor — เลิกเป็นกติกากลาง (ใช้ได้เฉพาะ asset ที่จงใจ hard-edge เช่น combat telegraph)
3. ข้อห้าม gradient/blur/soft shadow/filter **แบบเด็ดขาด** — แทนด้วย **effect matrix ตาม visual style ทาง C** (decision-index V4): UI หลัก flat ล้วน · ตัวละคร/มอน สีแบน 2–3 tone · environment gradient/baked shadow ได้ · VFX glow ได้ใน budget · telegraph solid edge เสมอ · ห้าม runtime SVG filter บน world entities

**ยังมีผลเต็ม (ไม่เปลี่ยน):** canvas standards §2 ทั้งชุด (64×64, footPivot [32,54], boss 160–192) · direction standard 5-dir+mirror · silhouette-first + 3-second test · master palette 32 สี (rarity ใช้ alias mapping — decision-index V3, ห้าม Corruption กับ rarity) · animation manifest concept (merge กับ SVG contract ของเล่มใหม่) · mobile readability · naming เดิมของ runtime frame (SVG source naming ใหม่ = คนละชั้น, mapping อยู่ที่ pipeline)

---

## 0. Asset Mission

Asset ทุกชิ้นต้องผ่าน 3 เงื่อนไข:
1. อ่าน silhouette ออกบน tile 64×32
2. วาง pivot/depth sorting ถูกโดยไม่แก้ logic รายชิ้น
3. เปลี่ยน placeholder SVG เป็น final pixel art ได้โดย animation manifest เดิมยังใช้ได้

---

# 1. Locked World Geometry

```yaml
projection: true-2d-isometric
logicalTilePx: [64, 32]
ratio: 2:1
cameraRotation: disabled
pixelFiltering: nearest
baseReferenceResolution: 1920x1080
```

Coordinate rule:
- logic ใช้ tile/world coordinate
- sprite origin ใช้ “จุดเท้า” เป็น pivot
- ภาพสูงได้ แต่ depth ใช้ foot pivot ไม่ใช้ center ของภาพ

---

# 2. Master Size Standards

| Asset | Source Canvas | Visible target | Pivot |
|---|---:|---:|---:|
| Player/NPC | 64×64 | body 28–36w × 44–52h | (32,54) |
| Small mob | 64×64 | 24–46w × 20–46h | (32,52) |
| Medium mob | 96×96 | 48–76w × 44–78h | (48,80) |
| Elite | 96×96 หรือ 128×128 | silhouette ใหญ่กว่า normal 20–45% | bottom center minus 12–18px |
| Field boss | 160×160 min; 192×192 preferred | 2–3 tile visual presence | bottom center minus 20–28px |
| UI icon | 64×64 source | 24/32/48 display | center |
| Item inventory icon | 64×64 | object 44–54px | center |
| Ground tile | 64×32 | full diamond | n/a |
| Wall/prop footprint 1×1 | 64×96 typical | varies | (32,80) |
| Tree | 128×160 typical | crown 80–120px | (64,144) |

Rules:
- source canvas ห้าม crop ต่างกันระหว่าง frame ของ animation เดียวกัน
- pivot ใช้ manifest ไม่เดาจาก alpha bounds
- final art ขยาย silhouette ได้ไม่เกิน 10% โดยไม่ review collision/telegraph

---

# 3. Master Palette v1 — 32 Semantic Colors

| Role | Hex |
|---|---|
| Deep Ink | `#171820` |
| Warm Ink | `#2B2230` |
| Deep Brown | `#4A332E` |
| Soil Brown | `#68483A` |
| Clay | `#8E6046` |
| Warm Wood | `#B47E52` |
| Sand | `#D8AE70` |
| Parchment | `#F2D6A0` |
| Highlight | `#FFF0C5` |
| Deep Leaf | `#284536` |
| Leaf | `#3F6845` |
| Fresh Leaf | `#6F9658` |
| Moss | `#9DB56C` |
| Pale Moss | `#C8D691` |
| Deep Water | `#294B5A` |
| Water | `#3F7180` |
| Sky Teal | `#64A0A0` |
| Mist | `#A4CCC0` |
| Resonance Dark | `#167C78` |
| Resonance Teal | `#35C6B0` |
| Resonance Light | `#7CE9D0` |
| Moon Deep | `#4B568E` |
| Moon Blue | `#7786C8` |
| Moon Light | `#B0B9EC` |
| Corruption Deep | `#6E315F` |
| Corruption | `#A84683` |
| Corruption Light | `#DA73B0` |
| Fire Deep | `#9E3C32` |
| Fire | `#DD6840` |
| Fire Light | `#F4B852` |
| Legendary Gold | `#E8BF4F` |
| Danger Red | `#D84848` |

Palette rules:
- asset หนึ่งชิ้นปกติใช้ 8–16 สี
- resonance teal ใช้กับพลังผนึก/โลกสั่นพ้อง ไม่ใช้ตกแต่งทั่วไป
- corruption magenta ใช้สิ่งผิดธรรมชาติ/รอยแยก
- legendary gold ห้ามใช้กับ UI ทั่วไป
- outline ไม่จำเป็นดำสนิท; ใช้ Deep Ink/Warm Ink/สีเข้มของ local hue

---

# 4. Pixel & SVG Placeholder Rules

## 4.1 SVG source
- viewBox ต้องตรง source canvas เช่น `0 0 64 64`
- shape coordinates เป็น integer; หลีกเลี่ยง fractional path
- `shape-rendering="crispEdges"`
- ไม่มี blur, gradient, soft shadow, filter
- ใช้ polygon/rect/path แบบขอบคม
- rasterize ที่ native size แล้ว scale nearest-neighbor

## 4.2 Pixel-like construction
- รายละเอียดขั้นต่ำ 2px ที่ source size; เส้น 1px ใช้เฉพาะ highlight/eye/spark
- ห้ามเส้นโค้ง anti-aliased ที่แตกเมื่อ rasterize
- silhouette ต้องอ่านออกเมื่อย่อเหลือ 32px สูง
- shadow ของตัวละครแยก sprite ไม่ baked กับทุก frame

## 4.3 Final pixel art replacement
- final atlas ต้องรักษา frame canvas, pivot, animation key และ direction key
- alpha premultiplied ตาม pipeline PixiJS
- ไม่มี texture filtering แบบ linear

---

# 5. Direction Standard

Draw 5 directions:
```txt
S, SW, W, NW, N
```
Mirror at runtime:
```txt
SE ← mirror SW
E  ← mirror W
NE ← mirror NW
```

Restrictions:
- asymmetrical weapon/mark ที่กลับด้านผิด lore ต้องมี `mirrorSafe: false` และทำ override frame
- text/symbol บนเสื้อไม่ควรอ่านเป็นตัวอักษรที่ mirror แล้วผิด
- boss/NPC พิเศษเพิ่ม 8-dir ได้ภายหลังโดย manifest override

---

# 6. Character Production Standard

## 6.1 Silhouette by class

### นักดาบ
- center-heavy, shoulder/chest มั่นคง
- ดาบเห็นชัดใน idle
- stance เปิดเล็กน้อย อ่านว่า frontline
- accent: warm steel + resonance teal เล็กน้อย

### นักหอก
- vertical/diagonal long silhouette
- ปลายหอกต้องไม่ชน frame ใน walk
- stance ให้เห็นระยะและ line control

### นักธนู
- compact torso, bow arc ชัด
- quiver silhouette ด้านหลัง
- motion เบา/เร็ว, weight shift น้อยกว่านักดาบ

### นักเวท
- triangular robe silhouette
- staff/orb แยกจาก body
- accent glow อ่านได้แต่ไม่ทำ idle สว่างเท่า skill

### นักอาคม
- layered sleeve/talisman silhouette
- charm paper/rope movement เป็น secondary motion
- visual language seal/support ไม่ใช่ generic priest

## 6.2 Animation baseline

| Animation | Frames | FPS | Loop |
|---|---:|---:|---|
| idle | 4 | 6 | yes |
| walk | 8 | 10 | yes |
| basic_attack | 6 | 12 | no |
| skill_light | 8 | 12 | no |
| skill_heavy | 10–14 | 12 | no |
| hurt | 3 | 12 | no |
| death | 8 | 10 | no |
| cast_loop | 6 | 8 | yes/controlled |
| interact | 4–6 | 8 | no |

Animation phases:
- anticipation อ่านชัดอย่างน้อย 1–2 frame
- contact frame ระบุใน manifest
- recovery ห้ามตัดจน silhouette snap เว้นแต่ cancel rule อนุญาต

## 6.3 Character equipment layers

Launch recommendation:
```txt
body/base
hair/head
weapon
optional back item
shadow separate
```

- อย่าทำ paper-doll ทุก armor slot ตั้งแต่แรก
- ชุด equipment tier ใช้ full outfit variant หรือ palette/material swap ที่ art approve
- weapon pivot/socket per direction อยู่ใน manifest

---

# 7. Monster Standard

## 7.1 Monster family sheet
แต่ละ family ต้องมี:
- silhouette statement
- locomotion type
- attack range/shape
- weak/readable side
- death language
- palette subset
- scale class

## 7.2 Animation baseline
| Type | idle | move | attack | hurt | death | special |
|---|---:|---:|---:|---:|---:|---:|
| Small | 4 | 6 | 6 | 2 | 6 | optional 6 |
| Medium | 4 | 8 | 6–8 | 3 | 8 | 8 |
| Elite | 6 | 8 | 8–10 | 3 | 10 | 10–14 |
| Boss | 6–8 | 8–10 | 10–16 | 3–4 | 14–24 | phase/telegraph sets |

## 7.3 Map 1 production order
1. สไลม์เมือกดึ๋ง
2. หมูป่าพอง
3. นกจิกปุ๊
4. elite variant
5. หมูป่าหม้อเดือด boss

Readability:
- normal ใช้ shape language เรียบ
- elite มี silhouette add-on + color accent ไม่ใช่แค่ scale ใหญ่
- boss มี landmark parts 2–3 จุดที่เห็นได้จาก zoom ปกติ

---

# 8. Boss Asset Standard

Boss package ต้องส่ง:
- idle/move/turn
- basic attack A/B
- telegraphed skill A/B
- phase transition
- break/stagger
- enrage visual
- death
- icon/portrait/silhouette marker
- telegraph decals แยก asset
- hit flash mask หรือ material tag

Rules:
- danger shape เป็นพื้นอ่านง่าย ไม่พึ่ง particle
- phase color change ต้องไม่ทำให้ silhouette หาย
- boss VFX budget แยกจาก ambient

---

# 9. NPC Standard

NPC types:
- main story: unique silhouette + portrait
- service: role prop ชัด เช่น hammer, basket, scroll
- ambient named: unique palette/accessory 1 จุด
- crowd: modular 6–10 bodies × 8 palettes

NPC idle ต้องมี personality; ไม่ใช้ player combat idle ตรง ๆ

---

# 10. Environment & Tile Standard

## 10.1 Ground tiles
- 64×32 diamond
- edge seamless ทั้ง 4 iso directions
- variation tiles 3–6 ต่อ material
- transition tiles authored, ไม่พึ่ง alpha blend ที่ทำ pixel เบลอ

## 10.2 Terrain set per map
ต้องมีขั้นต่ำ:
- base ground 2–3
- path 1–2
- edge/transition
- cliff/wall
- water/void boundary
- collision props
- small clutter
- landmark kit

## 10.3 Footprints
- footprint ระบุเป็น logical tiles เช่น 1×1, 2×1, 2×2
- prop image อาจล้ำ footprint แต่ collision ต้อง explicit
- sorting occluder แยก layer ได้เมื่อ canopy/arch บังผู้เล่น

---

# 11. Buildings & City

Starter city `นครอรุณผนึก` visual modules:
- gate
- starter plaza
- inn/home facade
- blacksmith/service stall
- market stall
- notice board
- shrine/seal structure
- alley fillers

Building rules:
- doorway width logical ≥ 1 tile
- important entrance มี contrast/lighting guide
- roof occlusion ใช้ fade/cutaway rule ของ renderer
- sign icon อ่านได้โดยไม่ต้องมีตัวหนังสือเล็ก

---

# 12. Props Catalog

Every prop entry:
```yaml
assetId:
footprint:
pivot:
collisionShape:
occlusionLayer:
interactionSocket:
variants:
weatherResponse:
```

Priority sets:
- Map 1: grass clump, fence, cart, hay, rock, stump, sign, lantern, puddle, campfire
- City: crates, stalls, banner, bench, jars, notice board, seal lamp
- Living World: umbrella, caravan cart, patrol lantern, animal perch, rain awning

---

# 13. Equipment & Item Icons

## 13.1 Icon composition
- source 64×64
- object 44–54px
- 1–2px internal outline
- top-left light convention
- transparent margin 5–8px
- no rarity border baked into icon; UI adds border

## 13.2 Rarity language
- Common: neutral material, no glow
- Uncommon: green accent 1 point
- Rare: blue rim/spark
- Epic: purple inner light
- Legendary: gold silhouette trim + unique motif
- Mythic/Celestial: gold + resonance/cosmic accent, animation budget controlled

## 13.3 Wearable art
- starter weapon/armor first
- equipment visual tier changes silhouette every major tier, not every minor item
- enhancement glow starts subtle; +15 must not obscure weapon shape

---

# 14. VFX Standard

VFX layers:
```txt
telegraph_floor
skill_floor
entity_behind
entity_front
screen_space
```

Budget per local skill high quality:
- 1 core effect
- 1 contact burst per target family (pooled)
- 1 trail
- 1 optional screen-space accent

Low quality:
- preserve telegraph/core/contact
- remove secondary particles/trails first

Semantic colors:
- physical: sand/fire-white impact
- resonance/seal: teal
- moon/spirit: blue-violet
- corruption/rift: magenta
- danger: red/orange
- heal/support: pale teal/green (avoid legendary gold)

---

# 15. Damage Numbers & Combat UI Assets

Fonts/assets:
- bitmap font set: normal, crit, heal, system, boss break
- normal white/parchment with dark outline
- crit gold/orange, scale +20–35%
- heal green-teal
- blocked gray-blue
- miss gray
- danger/boss system red

No gradient/blur mandatory; glow optional high quality only

---

# 16. Shadow Standard

- blob/soft-pixel ellipse separate sprite
- player 26×10 px target on 64×64 canvas
- opacity 25–40%
- weather/light may adjust opacity only, not pivot
- flying entity shadow offset/scale indicates height
- no real-time dynamic soft shadow in MVP

---

# 17. Naming Convention

```txt
<category>_<entity>_<variant>_<anim>_<dir>_<frame>
```

Examples:
```txt
chr_sword_base_idle_s_000.png
chr_sword_base_walk_sw_003.png
mob_map1_slime_attack_w_004.png
boss_map1_boarpot_skill_a_n_007.png
prop_map1_fence_a.png
vfx_skill_sword_wave_contact_02.png
ui_item_material_slime_gel.png
```

IDs ใช้ lowercase snake_case; display name ภาษาไทยอยู่ data ไม่อยู่ filename

---

# 18. Folder Structure

```txt
assets/
  source/
    svg-placeholder/
    aseprite/
    layered-png/
  runtime/
    atlases/
      characters/
      monsters/
      bosses/
      maps/
      vfx/
      ui/
    manifests/
  references/
  review/
```

Map atlas แยกตาม map/family เพื่อลด preload

---

# 19. Animation Manifest Contract

```json
{
  "assetId": "chr_sword_base",
  "frameSize": [64, 64],
  "pivot": [32, 54],
  "mirrorSafe": true,
  "animations": {
    "idle": {"fps": 6, "loop": true, "directions": ["s","sw","w","nw","n"]},
    "walk": {"fps": 10, "loop": true, "directions": ["s","sw","w","nw","n"]},
    "basic_attack": {"fps": 12, "loop": false, "contactFrame": 3}
  }
}
```

Manifest ห้ามมี balance/damage

---

# 20. Export Rules

- PNG RGBA, no indexed palette requirement at runtime
- no padding bleed; atlas extrude 1–2px if packer supports
- nearest-neighbor verified
- alpha edge ไม่มี matte color
- atlas max 2048×2048 mobile baseline; 4096 เฉพาะ map art ที่ทดสอบแล้ว
- content hash filename ใน production

---

# 21. Review Gates

A0 Concept approved
A1 Scale/pivot approved in engine
A2 Direction/mirror approved
A3 Animation timing approved
A4 Palette/readability approved
A5 Performance/atlas approved
A6 Final integration approved

Asset ห้ามเข้า “Done” ถ้ายังไม่ผ่าน in-engine screenshot ที่ zoom ปกติ

---

# 22. Acceptance Checklist

- [ ] canvas size ตรงมาตรฐาน
- [ ] pivot/foot ไม่กระโดดระหว่าง frame
- [ ] silhouette อ่านได้บนพื้นสว่างและมืด
- [ ] mirror ไม่ทำให้อาวุธ/สัญลักษณ์ผิด
- [ ] ไม่มี anti-alias blur
- [ ] animation contact frame ตรง hit event
- [ ] atlas/manifest validate ผ่าน
- [ ] low quality ยังเห็น gameplay cue
- [ ] collision footprint ไม่เดาจากภาพ
- [ ] filename/id ไม่มีภาษาไทยหรือช่องว่าง
