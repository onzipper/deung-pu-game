// Map 3 — ทางป่าเก่า (Batch 5) — production layout จาก MAP_LAYOUT_BIBLE §"Map 3" (§162–226, placeholder art).
// Plain TS only — ห้าม import React / Next.js / pixi runtime.
//
// ── ที่มาของค่า (spec-first) ──────────────────────────────────────────────────
// • Layout/zone/landmark/exit  = MAP_LAYOUT_BIBLE §Map 3 (W ประตูกลับ Map 2 · SW ค่ายพรานป่า + จุดวาป/Safe ·
//     C ทางป่าเก่า/หินเดินได้ · NE ทางลับหินไร้ตะไคร่ (secret layer, minimap แสดงทางหลักเท่านั้น) · E สะพานไม้เก่า ·
//     SE Boss arena ผู้เฝ้าทางที่ไม่มีชื่อ). Secret trigger = เดินออกนอก path หลังรับ clue (out of scope).
// • Size / pocket count / density = MAP_SCALE §5 (Map 3 = Medium · 5–7 farming pocket · 10–18/จอ) + §6 Map 3
//     (root/monkey/stone + Hidden หินไร้ตะไคร่ + Elite). Hidden pocket = walking_stone density สูงในเลเยอร์ลับ NE.
// • Combat / EXP / reward / drop = MAPS_2_4_ECONOMY_AND_LOOT_SPEC §2.2/§3.2/§5.2.
//
// ── ค่าที่ spec ไม่ระบุเป๊ะ → tech ตัดสิน (Design Knob §48) ─────────────────────
// • tile dimension 40×40 (Medium). collision = cliff กั้นเลเยอร์ลับ NE (เว้นช่องลับ tx 32–33) + ลำธาร+สะพานไม้ E
//     (เว้นช่องสะพาน). props = ต้นไม้ป่า (dense) / หิน (โซนหินเดินได้) / ป้ายค่ายพราน — art จริง = production.
// • respawn จาก spec §2.2 ต่อ mob (root 30s · monkey 30s · stone 35s · hidden stone 40s (§6 35–50s midpoint) ·
//     mossless elite 390s · boss "Encounter" → 240s placeholder). ปรับได้ (owner tune).
//
// validate ด้วย loadMapConfig() + registry cross-ref เสมอ (exit สองทางกับ map2/map4).

import type { MapConfigInput } from "@/engine/map/types";

/** mapId ของ Map 3 (single source — registry + exit ปลายทางอ้างค่านี้). */
export const MAP3_ID = "map3";

export const MAP3: MapConfigInput = {
  mapId: MAP3_ID,
  name: "Map 3 — ทางป่าเก่า",
  tileSize: { width: 64, height: 32 },
  // Medium (MAP_SCALE §5 Map 3) — 40×40. แนว W(เข้า)→SE(boss), มีเลเยอร์ลับ NE.
  bounds: { width: 40, height: 40 },

  // เข้าจาก Map 2 ที่ขอบ W → spawn ริม W (เดินได้, นอก exit area).
  spawnPoint: { x: 3.5, y: 20.5 },
  // Safe Point เดียว (MAP_SCALE §5 = 1) = ค่ายพรานป่า SW (bible "จุดวาป").
  safeCamp: { x: 5.5, y: 33.5 },

  collision: {
    blockedRects: [
      // Cliff กั้นเลเยอร์ลับ NE (bible: ทางลับไม่ตรง minimap) — เว้น "ช่องลับ" tx 32–33 = ทางเข้า secret pocket.
      { tx: 26, ty: 12, width: 6, height: 1 }, // ผาซ้าย (tx 26–31)
      { tx: 34, ty: 12, width: 4, height: 1 }, // ผาขวา (tx 34–37) — ช่องลับ = tx 32–33
      // ลำธาร E + สะพานไม้เก่า (bible "[E] สะพานไม้เก่า") — น้ำ block คอลัมน์ tx 32 เว้นช่องสะพาน ty 23–24.
      { tx: 32, ty: 20, width: 1, height: 3 }, // ลำธารบน (ty 20–22)
      { tx: 32, ty: 25, width: 1, height: 3 }, // ลำธารล่าง (ty 25–27) — สะพาน = ty 23–24 (เดินข้ามได้)
      // ค่ายพรานป่า SW — เพิงพัก placeholder.
      { tx: 3, ty: 35, width: 3, height: 2 },
    ],
  },

  // props: ป่าเก่า = ต้นไม้ dense (C/E) · หิน (โซนหินเดินได้ C/NE) · ป้าย (ค่ายพราน SW).
  props: [
    { propId: "signpost", tile: { tx: 4.5, ty: 22.5 } }, // ทางเข้า W (ป้ายกลับ Map 2)
    { propId: "signpost", tile: { tx: 6.5, ty: 34.5 } }, // SW ค่ายพราน (NPC ลุงดึ๋ง clue placeholder)
    { propId: "tree", tile: { tx: 12.5, ty: 16.5 } }, // C ทางป่าเก่า ต้นไม้
    { propId: "tree", tile: { tx: 20.5, ty: 18.5 } }, // C ต้นไม้ (ลิงเงาอยู่บนต้นไม้)
    { propId: "tree", tile: { tx: 24.5, ty: 22.5 } }, // C/E ต้นไม้
    { propId: "tree", tile: { tx: 28.5, ty: 15.5 } }, // NE ต้นไม้
    { propId: "rock", tile: { tx: 16.5, ty: 9.5 } }, // C/NE โซนหินเดินได้
    { propId: "rock", tile: { tx: 21.5, ty: 11.5 } }, // C/NE โซนหินเดินได้
    { propId: "rock", tile: { tx: 35.5, ty: 6.5 } }, // NE hidden หินไร้ตะไคร่ (secret reward)
    { propId: "stump", tile: { tx: 10.5, ty: 26.5 } }, // C/SW เศษราก
    { propId: "tree", tile: { tx: 34.5, ty: 30.5 } }, // E/SE ต้นไม้ริมสะพาน
    { propId: "rock", tile: { tx: 33.5, ty: 35.5 } }, // SE Boss arena landmark
  ],

  // 6 farming pocket (MAP_SCALE §5 Map 3 = 5–7). pack/activeCap = §6; respawn = spec §2.2 ต่อ mob.
  mobPockets: [
    {
      // C/SW — รากไม้กัดเท้า เกือบอยู่กับที่ ถึกกลาง (§6: 6–10, cap 24, 25–35s → §2.2 30s)
      pocketId: "map3-root-center",
      area: { tx: 6, ty: 20, width: 11, height: 11 },
      mobType: "gnawing_root",
      packSize: { min: 6, max: 10 },
      activeCap: 24,
      respawnDelayMs: 30000,
    },
    {
      // C/E — ลิงเงา ไว กระโดดสลับตำแหน่ง (§6: 4–8, cap 20, 25–35s → §2.2 30s)
      pocketId: "map3-monkey-center-east",
      area: { tx: 18, ty: 14, width: 11, height: 11 },
      mobType: "shadow_monkey",
      packSize: { min: 4, max: 8 },
      activeCap: 20,
      respawnDelayMs: 30000,
    },
    {
      // C/NE — หินเดินได้ ช้า ถึกสุด DEF สูง (§6: 5–9, cap 18, 30–40s → §2.2 35s)
      pocketId: "map3-stone-center-ne",
      area: { tx: 14, ty: 6, width: 11, height: 8 },
      mobType: "walking_stone",
      packSize: { min: 5, max: 9 },
      activeCap: 18,
      respawnDelayMs: 35000,
    },
    {
      // NE hidden (secret layer) — หินเดินได้ density สูง (§6 "Hidden หินไร้ตะไคร่": 8–12, cap 20, 35–50s → 40s)
      pocketId: "map3-stone-hidden-ne",
      area: { tx: 30, ty: 3, width: 8, height: 8 },
      mobType: "walking_stone",
      packSize: { min: 8, max: 12 },
      activeCap: 20,
      respawnDelayMs: 40000,
    },
    {
      // NE hidden elite — หินไร้ตะไคร่ เดี่ยว secret-route reward (§6: 1, cap 1, 5–8m → §2.2 6.5m = 390s)
      pocketId: "map3-mossless-elite-ne",
      area: { tx: 33, ty: 5, width: 4, height: 4 },
      mobType: "mossless_stone",
      packSize: { min: 1, max: 1 },
      activeCap: 1,
      respawnDelayMs: 390000,
    },
    {
      // SE Boss arena — ผู้เฝ้าทางที่ไม่มีชื่อ (Field Boss, ถึกกว่า Map2 boss). spec §2.2 respawn Encounter → 240s.
      pocketId: "map3-boss-nameless-warden",
      area: { tx: 30, ty: 32, width: 6, height: 6 },
      mobType: "nameless_warden",
      packSize: { min: 1, max: 1 },
      activeCap: 1,
      respawnDelayMs: 240000,
    },
  ],

  // Exit สองทาง (W → Map 2 · progression → Map 4 ทาง S). targetSpawn นอก exit area ปลายทาง (กัน re-trigger).
  exits: [
    {
      // W ประตูกลับ Map 2 (bible "[W] Exit Map 2"). ปลายทาง = map2 E (นอก exit E ของ map2).
      exitId: "map3-w-to-map2",
      area: { tx: 0, ty: 18, width: 2, height: 3 },
      targetMapId: "map2",
      targetSpawn: { x: 35.5, y: 19.5 },
    },
    {
      // S → Map 4 (progression; Map 4 bible "[SW] Exit Map 3" = เข้า Map 4 ทาง SW). ปลายทาง = map4 SW (นอก exit SW).
      exitId: "map3-s-to-map4",
      area: { tx: 20, ty: 38, width: 4, height: 2 },
      targetMapId: "map4",
      targetSpawn: { x: 4.5, y: 42.5 },
    },
  ],
};
