# D-027 — Art & asset: vertical slice first
- Date: 2026-07-12 · Status: Locked · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **Art & asset**: Vertical Slice First (scale/palette/kit → นักดาบ → Map 1 → mobs → VFX → เมือง → นักธนู → ที่เหลือ — ไม่ทำ 5 อาชีพก่อนโลก) · size standards ล็อก (tile 64×32, player canvas 64×64 footPivot [32,54], mob 64/96/128, boss 160–192, icon 64) · master palette 32 สี + biome subpalette 12–18 + semantic colors (resonance teal/corruption magenta/legendary gold ห้ามใช้พร่ำเพรื่อ) · placeholder = SVG snap pixel grid → PNG atlas nearest-neighbor; final = aseprite/layered PNG → sprite sheet + JSON manifest; วาด 5 ทิศ mirror 3 · กลยุทธ์ **"Playable-Without-Artist"** (Q1): shape grammar + semantic color + name label + juice + kit-based parameterized SVG + "3-second test" เป็น content gate

สถานะ: Locked

เหตุผล: Bible 4.1–4.4 + Q1 2026-07-12
