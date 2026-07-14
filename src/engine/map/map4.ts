// Map 4 — ป่าจันทร์เงา (Batch 5) — production layout จาก MAP_LAYOUT_BIBLE §"Map 4" (§227–282, placeholder art).
// Plain TS only — ห้าม import React / Next.js / pixi runtime.
//
// ── ที่มาของค่า (spec-first) ──────────────────────────────────────────────────
// • Layout/zone/landmark/exit  = MAP_LAYOUT_BIBLE §Map 4 (SW ศาลาจันทร์หมอก + จุดวาป/Safe / Exit Map 3 ·
//     W บ่อน้ำจันทร์ · C ป่าหมอก/เห็ดฝัน · E ทุ่งกวางเงา · NE กระจกน้ำ (secret/lore) · S Boss grove นางไม้จันทร์ดับ).
//     bible "พื้นที่ควรเป็นวงวนมากกว่าเส้นตรง" → loop SW→W→C→E→NE→C→SW.
// • Size / pocket count / density = MAP_SCALE §5 (Map 4 = Medium–Large · 6–8 farming pocket · 12–20/จอ) + §6 Map 4
//     (wisp W/C · dream C · deer E · elite E/NE). wisp "W/C" แยกเป็น 2 pocket (W + C) ให้ครบ 6–8. Event หมอก (wave)
//     = event system, ไม่รวม.
// • Combat / EXP / reward / drop = MAPS_2_4_ECONOMY_AND_LOOT_SPEC §2.3/§3.3/§5.3 (Map 4 boss = ปิดแบนด์ lv22).
//
// ── ค่าที่ spec ไม่ระบุเป๊ะ → tech ตัดสิน (Design Knob §48) ─────────────────────
// • tile dimension 48×48 (Medium–Large — ใหญ่กว่า Map 1–3 40×40, รองรับ loop + 6 pocket). collision = บ่อน้ำจันทร์ W
//     (น้ำ block) + กระจกน้ำ NE (secret) + ป่าหมอก dense (props). props = ต้นไม้ dense (mood หมอก) — art จริง = production.
// • respawn จาก spec §2.3 ต่อ mob (wisp 30s · dream 30s · deer 40s · elite 420s · boss "Encounter" → 240s). ปรับได้.
//
// validate ด้วย loadMapConfig() + registry cross-ref เสมอ (exit ทางเดียวกลับ map3 — Map 5 = out of scope batch นี้).

import type { MapConfigInput } from "@/engine/map/types";

/** mapId ของ Map 4 (single source — registry + exit ปลายทางอ้างค่านี้). */
export const MAP4_ID = "map4";

export const MAP4: MapConfigInput = {
  mapId: MAP4_ID,
  name: "Map 4 — ป่าจันทร์เงา",
  tileSize: { width: 64, height: 32 },
  // Medium–Large (MAP_SCALE §5 Map 4) — 48×48. loop SW→W→C→E→NE→C→SW.
  bounds: { width: 48, height: 48 },

  // เข้าจาก Map 3 ที่ SW → spawn ริมศาลาจันทร์หมอก SW (เดินได้, นอก exit area).
  spawnPoint: { x: 5.5, y: 42.5 },
  // Safe Point เดียว (MAP_SCALE §5 = 1) = ศาลาจันทร์หมอก SW (bible "จุดวาป / Safe Pavilion").
  safeCamp: { x: 7.5, y: 40.5 },

  collision: {
    blockedRects: [
      // บ่อน้ำจันทร์ W (bible "[W] บ่อน้ำจันทร์") — น้ำ block, เดินอ้อมได้.
      { tx: 4, ty: 20, width: 6, height: 6 },
      // กระจกน้ำ NE (bible "[NE] กระจกน้ำ Secret/lore") — ผิวน้ำสะท้อน block (secret area).
      { tx: 38, ty: 4, width: 6, height: 5 },
      // ศาลาจันทร์หมอก SW — เสาศาลา placeholder.
      { tx: 3, ty: 43, width: 3, height: 2 },
      // ป่าหมอกทึบ C — แนวหิน/รากกั้นบางส่วน (mood หมอก; เว้นทางเดิน loop).
      { tx: 24, ty: 26, width: 3, height: 3 },
    ],
  },

  // props: ต้นไม้ dense (ป่าหมอก C, mood จันทร์/หมอก) · หินริมบ่อน้ำ W · ป้ายศาลา SW · พุ่ม/ตอ grove S.
  props: [
    { propId: "signpost", tile: { tx: 8.5, ty: 41.5 } }, // SW ศาลา (จุดวาป / ป้ายกลับ Map 3)
    { propId: "rock", tile: { tx: 3.5, ty: 26.5 } }, // W ริมบ่อน้ำจันทร์
    { propId: "rock", tile: { tx: 10.5, ty: 19.5 } }, // W ริมบ่อน้ำจันทร์
    { propId: "tree", tile: { tx: 16.5, ty: 24.5 } }, // C ป่าหมอก (dense)
    { propId: "tree", tile: { tx: 20.5, ty: 20.5 } }, // C ป่าหมอก
    { propId: "tree", tile: { tx: 22.5, ty: 30.5 } }, // C ป่าหมอก
    { propId: "tree", tile: { tx: 28.5, ty: 18.5 } }, // C ป่าหมอก
    { propId: "tree", tile: { tx: 30.5, ty: 28.5 } }, // C/E ป่าหมอก
    { propId: "bush", tile: { tx: 40.5, ty: 26.5 } }, // E ทุ่งกวางเงา (พุ่ม)
    { propId: "rock", tile: { tx: 41.5, ty: 10.5 } }, // NE กระจกน้ำ (secret) landmark
    { propId: "tree", tile: { tx: 24.5, ty: 44.5 } }, // S Boss grove (นางไม้จันทร์ดับ)
    { propId: "stump", tile: { tx: 19.5, ty: 43.5 } }, // S grove ตอไม้
  ],

  // 6 farming pocket (MAP_SCALE §5 Map 4 = 6–8). pack/activeCap = §6; respawn = spec §2.3 ต่อ mob.
  mobPockets: [
    {
      // W (เหนือบ่อน้ำจันทร์) — ผีแสงจันทร์ fade/blink หลบง่าย (§6 wisp "W/C": 6–12, cap 30 → แยก W/C cap 16 ต่อ pocket)
      pocketId: "map4-wisp-west",
      area: { tx: 4, ty: 12, width: 10, height: 7 },
      mobType: "moonlight_wisp",
      packSize: { min: 6, max: 12 },
      activeCap: 16,
      respawnDelayMs: 30000,
    },
    {
      // C ป่าหมอก — ผีแสงจันทร์ (ครึ่ง "W/C" ฝั่ง C)
      pocketId: "map4-wisp-center",
      area: { tx: 18, ty: 20, width: 10, height: 11 },
      mobType: "moonlight_wisp",
      packSize: { min: 6, max: 12 },
      activeCap: 16,
      respawnDelayMs: 30000,
    },
    {
      // C ป่าหมอก — เห็ดฝัน รวมเป็นวง ดีต่อ AoE (§6: 8–14, cap 32, 25–35s → §2.3 30s)
      pocketId: "map4-dream-center",
      area: { tx: 20, ty: 14, width: 11, height: 8 },
      mobType: "dream_mushroom",
      packSize: { min: 8, max: 14 },
      activeCap: 32,
      respawnDelayMs: 30000,
    },
    {
      // E ทุ่งกวางเงา — กวางเงา movement สูง หนีเก่ง (§6: 4–8, cap 18, 30–45s → §2.3 40s)
      pocketId: "map4-deer-east",
      area: { tx: 34, ty: 22, width: 10, height: 11 },
      mobType: "shadow_deer",
      packSize: { min: 4, max: 8 },
      activeCap: 18,
      respawnDelayMs: 40000,
    },
    {
      // E/NE — Elite กวางจันทร์แตก เศษจันทร์กระเด็น (§6: 1–2, cap 2, 5–8m → §2.3 7m = 420s)
      pocketId: "map4-shattered-elite-ne",
      area: { tx: 38, ty: 10, width: 6, height: 6 },
      mobType: "shattered_moon_deer",
      packSize: { min: 1, max: 2 },
      activeCap: 2,
      respawnDelayMs: 420000,
    },
    {
      // S Boss grove — นางไม้จันทร์ดับ (Field Boss ปิดแบนด์ lv22, ถึกสุด). spec §2.3 respawn Encounter → 240s.
      pocketId: "map4-boss-moondark-dryad",
      area: { tx: 20, ty: 40, width: 6, height: 6 },
      mobType: "moondark_dryad",
      packSize: { min: 1, max: 1 },
      activeCap: 1,
      respawnDelayMs: 240000,
    },
  ],

  // Exit ทางเดียว: SW → Map 3 (bible "[SW] Exit Map 3"). Map 5 = out of scope batch นี้ (ยังไม่มี exit ไปข้างหน้า).
  // targetSpawn = map3 S (นอก exit S ของ map3, กัน re-trigger).
  exits: [
    {
      exitId: "map4-sw-to-map3",
      area: { tx: 0, ty: 41, width: 2, height: 3 },
      targetMapId: "map3",
      targetSpawn: { x: 22.5, y: 35.5 },
    },
  ],
};
