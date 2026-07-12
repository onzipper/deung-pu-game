# D-043 — V1-V4 tokens + art model
- Date: 2026-07-12 · Status: Locked · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **V1–V4 (tech proposal → owner เคาะ)**: **V1** tokens ยึดเล่ม SVG-first — radius 6/10/16 (+pill 999 จากเล่ม UI), **touch target ≥48px = hit area** (visual เล็กกว่าได้, desktop visual ต่ำสุด 40px), token ชุดเดียวทุก platform — supersede 4/8/12+44px ในเล่ม UI · **V2** Hybrid Art Model คงทั้งชุด เปลี่ยนเป้าเป็นคุม **SVG quality** (Art Lead ต้องมี · Bespoke=ดึ๋งๆ/5 อาชีพ/บอส/NPC หลัก/landmark · Commission=ตระกูลมอน/tileset/VFX ชุด · Pack=props ทั่วไป ต้อง restyle เข้า palette · AI=reference เท่านั้น) + **Art Readiness Gate ฉบับ SVG 7 ข้อ** (palette/silhouette 3s/contract/sanitizer/perf budget/style/mobile readability) · ดึ๋งๆ bespoke ตาม D3 เดิม · runtime: world entities=build-time raster→atlas เสมอ, UI=inline/raster · **V3** คง palette 32 สี — rarity map: Common=Sand `#D8AE70` / Uncommon=Fresh Leaf `#6F9658` / Rare=Moon Blue `#7786C8` / **Epic=Moon Deep `#4B568E` + rim Moon Light `#B0B9EC`** / Legendary=Legendary Gold `#E8BF4F` — **ห้ามใช้ตระกูล Corruption กับ rarity** (สงวน lore) · โค้ดเรียก semantic token `rarity.*` ผ่าน alias 2 ชั้น · **rarity ต้องแยกได้โดยไม่เห็นสี** (กรอบ/มุม/motion ตาม rarity motion table) · **V4 visual style = ทาง C "Crisp Stylized SVG"** + effect matrix: UI หลัก flat ล้วน · ตัวละคร/มอน = สีแบน 2–3 tone · environment gradient/baked shadow ได้ · VFX glow ได้ใน budget · **telegraph = solid edge เสมอ ห้าม blur** · ห้าม runtime SVG filter บน world entities/SMIL · crispEdges+nearest-neighbor เลิกเป็น default (ใช้เฉพาะ asset จงใจ hard-edge) · คงจาก Asset Bible: canvas/footPivot/5-dir+mirror/silhouette 3s/palette 32/iso+depth-sort/mobile readability — supersede: integer-coords mandate, ห้าม gradient-filter เด็ดขาด, ส่วน pixel-art conversion ทั้งหมด

สถานะ: Locked

เหตุผล: tech เสนอ + owner เคาะ 2026-07-12
