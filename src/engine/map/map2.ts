// Map 2 — ถนนชายไร่ (Batch 5) — production layout จาก MAP_LAYOUT_BIBLE §"Map 2" (§102–160, placeholder art).
// Plain TS only — ห้าม import React / Next.js / pixi runtime.
//
// ── ที่มาของค่า (spec-first) ──────────────────────────────────────────────────
// • Layout/zone/landmark/exit  = MAP_LAYOUT_BIBLE §Map 2 (NW ประตูกลับ Map 1 · N ถนนหลัก · NE หมู่บ้านชายไร่ +
//     จุดวาป/Safe + NPC หมอยา · C ทุ่งฟาง/หุ่นฟาง · W แปลงเห็ดสะดุ้ง · E คันนา/หนูนา · C/S border Elite หุ่นฟางพันยันต์ ·
//     S หุ่นฟางผู้เฝ้าไร่ Boss Field · Secret ตะกร้าเด็กหลังบ่อน้ำ NE = คืนจันทร์เว้า, out of scope).
// • Size / pocket count / density = MAP_SCALE_AND_SPAWN_DENSITY_SPEC §5 (Map 2 = Medium · 5–6 farming pocket ·
//     10–15/จอ) + §6 Map 2 (pack/activeCap/respawn ต่อ mob). Event ทุ่งฟาง (wave) = event system, ไม่ใช่ farming
//     pocket → ไม่รวมในไฟล์นี้.
// • Combat stat / EXP / reward / drop = MAPS_2_4_ECONOMY_AND_LOOT_SPEC §2.1/§3.1/§5.1 (combat.ts + server economy).
//
// ── ค่าที่ spec ไม่ระบุเป๊ะ → tech ตัดสิน (Design Knob §48) ─────────────────────
// • tile dimension: bible "ไม่ใช่ final tilemap" → tech เลือก 40×40 (Medium, ตาม Map 1 baseline). พิกัด zone =
//     แปลงทิศ bible เป็น tile ตรง ๆ (โครงพอเห็น). collision/props = placeholder โครงหลัก (art จริง = production).
// • respawnDelayMs: ใช้ค่าจาก spec §2.1 ต่อ mob (mushroom 25s · scarecrow 30s · rat 25s · elite 300s ·
//     boss = spec "Encounter" → placeholder 240s mirror Map 1 field boss). ทุกค่าปรับได้ (owner tune).
//
// validate ด้วย loadMapConfig() + registry cross-ref เสมอ (เทสต์ยืนยัน map นี้ผ่าน + exit สองทางกับ map1/map3).

import type { MapConfigInput } from "@/engine/map/types";

/** mapId ของ Map 2 (single source — registry + exit ปลายทางอ้างค่านี้). */
export const MAP2_ID = "map2";

export const MAP2: MapConfigInput = {
  mapId: MAP2_ID,
  name: "Map 2 — ถนนชายไร่",
  tileSize: { width: 64, height: 32 },
  // Medium (MAP_SCALE §5 Map 2) — 40×40 (baseline เท่า Map 1). แนว NW(เข้า)→S(boss).
  bounds: { width: 40, height: 40 },

  // เข้าจาก Map 1 ที่ NW → spawn ใต้ประตู NW (เดินได้, นอก exit area).
  spawnPoint: { x: 5.5, y: 4.5 },
  // Safe Point เดียว (MAP_SCALE §5 = 1) = หมู่บ้านชายไร่ NE (bible "จุดวาป / Safe / NPC หมอยา").
  safeCamp: { x: 33.5, y: 9.5 },

  collision: {
    blockedRects: [
      // หมู่บ้านชายไร่ NE — อาคาร placeholder (โครงพอเห็นผัง หมู่บ้าน; art จริง = production).
      { tx: 30, ty: 2, width: 4, height: 3 }, // บ้านหลังหนึ่ง (NE)
      { tx: 35, ty: 6, width: 3, height: 3 }, // บ้าน/ร้านหมอยา (NE)
      { tx: 34, ty: 11, width: 2, height: 2 }, // บ่อน้ำหมู่บ้าน (bible: secret ตะกร้าเด็ก "หลังบ่อน้ำ NE")
      // รั้วคันนา/ทุ่งฟาง กั้น C กับ Boss Field S — เว้นช่องทางเข้า boss กลาง (tx 18–21) = main route ลงใต้.
      { tx: 4, ty: 30, width: 14, height: 1 }, // รั้วซ้าย (tx 4–17)
      { tx: 22, ty: 30, width: 14, height: 1 }, // รั้วขวา (tx 22–35)
    ],
  },

  // props placeholder (reuse style tree/bush/rock/stump/signpost). W แปลงเห็ด = พุ่ม (bush cluster);
  // C ทุ่งฟาง = ตอ/กองฟาง (stump); E คันนา = ป้าย/แนวคันนา (signpost); NE หมู่บ้าน = ป้าย NPC.
  props: [
    { propId: "signpost", tile: { tx: 6.5, ty: 6.5 } }, // ป้ายทางเข้า NW (ถนนกลับ Map 1)
    { propId: "signpost", tile: { tx: 32.5, ty: 9.5 } }, // NE หมู่บ้าน: NPC หมอยา (placeholder)
    { propId: "stump", tile: { tx: 31.5, ty: 13.5 } }, // NE หมู่บ้าน ตอไม้ประดับ
    { propId: "bush", tile: { tx: 4.5, ty: 15.5 } }, // W แปลงเห็ด (กอเห็ด)
    { propId: "bush", tile: { tx: 6.5, ty: 18.5 } }, // W แปลงเห็ด
    { propId: "bush", tile: { tx: 9.5, ty: 21.5 } }, // W แปลงเห็ด
    { propId: "bush", tile: { tx: 3.5, ty: 22.5 } }, // W แปลงเห็ด
    { propId: "stump", tile: { tx: 18.5, ty: 17.5 } }, // C ทุ่งฟาง กองฟาง
    { propId: "stump", tile: { tx: 22.5, ty: 21.5 } }, // C ทุ่งฟาง กองฟาง
    { propId: "signpost", tile: { tx: 30.5, ty: 20.5 } }, // E คันนา แนวป้าย
    { propId: "signpost", tile: { tx: 34.5, ty: 23.5 } }, // E คันนา แนวป้าย
    { propId: "rock", tile: { tx: 19.5, ty: 36.5 } }, // S Boss field landmark (หุ่นฟางผู้เฝ้าไร่)
  ],

  // 5 farming pocket (MAP_SCALE §5 Map 2 = 5–6). pack/activeCap = §6; respawn = spec §2.1 ต่อ mob.
  mobPockets: [
    {
      // W แปลงเห็ดสะดุ้ง — กอเห็ดรวมตัวแน่น ดีต่อ AoE (§6: 6–10, cap 24, 20–30s → §2.1 25s)
      pocketId: "map2-mushroom-west",
      area: { tx: 3, ty: 14, width: 10, height: 11 },
      mobType: "mushroom_startle",
      packSize: { min: 6, max: 10 },
      activeCap: 24,
      respawnDelayMs: 25000,
    },
    {
      // C ทุ่งฟาง — หุ่นฟางเดินได้ pack หลักของแมพ (§6: 8–12, cap 36, 25–35s → §2.1 30s)
      pocketId: "map2-scarecrow-center",
      area: { tx: 15, ty: 14, width: 12, height: 12 },
      mobType: "scarecrow_walker",
      packSize: { min: 8, max: 12 },
      activeCap: 36,
      respawnDelayMs: 30000,
    },
    {
      // E คันนา — หนูนาแสงเขียว วิ่งเร็ว กระจาย (§6: 5–8, cap 20, 20–30s → §2.1 25s)
      pocketId: "map2-rat-east",
      area: { tx: 28, ty: 14, width: 10, height: 11 },
      mobType: "greenlight_rat",
      packSize: { min: 5, max: 8 },
      activeCap: 20,
      respawnDelayMs: 25000,
    },
    {
      // C/S border — Elite หุ่นฟางพันยันต์ ใกล้ boss route (§6: 1–2, cap 2, 4–6m → §2.1 5m)
      pocketId: "map2-talisman-elite",
      area: { tx: 16, ty: 25, width: 6, height: 5 },
      mobType: "talisman_scarecrow",
      packSize: { min: 1, max: 2 },
      activeCap: 2,
      respawnDelayMs: 300000,
    },
    {
      // S Boss Field — หุ่นฟางผู้เฝ้าไร่ (Field Boss, guard gauge). spec §2.1 respawn = Encounter → 240s placeholder.
      pocketId: "map2-boss-field-warden",
      area: { tx: 16, ty: 34, width: 6, height: 5 },
      mobType: "field_warden",
      packSize: { min: 1, max: 1 },
      activeCap: 1,
      respawnDelayMs: 240000,
    },
  ],

  // Exit สองทาง (bible: NW → Map 1 · progression → Map 3 ทาง E). targetSpawn อยู่นอก exit area ปลายทาง (กัน re-trigger).
  exits: [
    {
      // NW ประตูกลับ Map 1 (bible "[NW] Exit Map 1"). ปลายทาง = map1 SE (นอก exit SE ของ map1).
      exitId: "map2-nw-to-map1",
      area: { tx: 3, ty: 0, width: 4, height: 2 },
      targetMapId: "map1",
      targetSpawn: { x: 28.5, y: 36.5 },
    },
    {
      // E → Map 3 (progression; Map 3 bible "[W] Exit Map 2" = เข้า Map 3 ทางขอบ W). ปลายทาง = map3 W (นอก exit W).
      exitId: "map2-e-to-map3",
      area: { tx: 38, ty: 18, width: 2, height: 3 },
      targetMapId: "map3",
      targetSpawn: { x: 3.5, y: 19.5 },
    },
  ],
};
